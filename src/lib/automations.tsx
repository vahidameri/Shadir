// Automations: small rules that save the PMO repetitive work. App rules run here (in the browser
// of an editor); server rules run as Apps Script time triggers. Every rule has an on/off switch
// stored in the Config tab, so the whole team shares the same behaviour.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarPlus, CalendarSync, Repeat, Mail, Unlock, Image, Sunrise } from 'lucide-react'
import type { DB, Meeting, Project, Task } from './types'
import { useStore } from './store'
import { useGoogle } from './google'
import { L, type T2 } from './i18n'
import { demoEvents, fetchEvents, relate, seriesFor, type GEvent } from './gcal'
import { addDays, daysBetween, fa, todayISO } from './jalali'
import { weekStart } from './weeks'
import { uid } from './api'
import { isWeeklySeries } from './labels'
import { isBlocked } from './columns'
import { taskCfg } from './taskcfg'

export interface AutomationDef {
  id: string
  where: 'app' | 'server'
  icon: typeof Repeat
  title: T2
  desc: T2
}

export const AUTOMATIONS: AutomationDef[] = [
  { id: 'gcal_import', where: 'app', icon: CalendarSync, title: ['آوردن ایونت‌های مرتبط تقویم گوگل', 'Bring in related Google Calendar events'], desc: ['ایونتی که نام پروژه را دارد یا دو نفر از تیم در آن هستند، خودکار به «جلسات» اضافه می‌شود.', 'Events that name a project or include two or more teammates are added to Meetings.'] },
  { id: 'gcal_create', where: 'app', icon: CalendarPlus, title: ['ثبت جلسه‌ها در تقویم گوگل با لینک Meet', 'Put meetings on Google Calendar with a Meet link'], desc: ['حاضران، مهمانان بیرونی، برگزارکننده و همیشه مدیر برنامه و CPTO دعوت می‌شوند؛ جابجایی یا لغو جلسه در تقویم هم اعمال می‌شود.', 'Attendees, outside guests, the facilitator and always the PgM and the CPTO are invited; moves and cancellations follow.'] },
  { id: 'next_meeting', where: 'app', icon: Repeat, title: ['ساخت جلسه‌ی هفته‌ی بعد پس از بستن جلسه‌ی هفتگی', 'Schedule next week after a weekly is closed'], desc: ['برای ویکلی دپارتمان و ویکلی هر لاین یا تیم.', 'For the department weekly and each line / team weekly.'] },
  { id: 'minutes_mail', where: 'server', icon: Mail, title: ['ایمیل صورت‌جلسه و اکشن‌پلن به حاضران', 'Email minutes & action plan to attendees'], desc: ['وقتی جلسه «برگزار شد» زده می‌شود.', 'When a meeting is marked held.'] },
  { id: 'blocked_followup', where: 'app', icon: Unlock, title: ['پیگیری برای تسکی که بیش از حد مجاز مسدود مانده', 'Follow-up for tasks blocked too long'], desc: ['با کسی که تسک به‌خاطر او مسدود است (یا مسئول تسک)، در پیگیری‌های مدیر برنامه. تعداد روز از تنظیمات تسک.', 'With whoever it is blocked on (or the assignee), on the program manager’s follow-ups. Days from the task settings.'] },
  { id: 'google_photo', where: 'app', icon: Image, title: ['عکس پروفایل از حساب گوگل', 'Profile photo from Google'], desc: ['برای کسی که هنوز عکس آپلود نکرده.', 'For anyone who hasn’t uploaded one.'] },
  { id: 'daily_digest', where: 'server', icon: Sunrise, title: ['خلاصه‌ی صبحگاهی', 'Morning digest'], desc: ['ساعت ۷:۳۰ برای مدیر برنامه: میزیتوی فوری یا عبور از SLA، پیگیری‌ها، تسک‌های امروز، معوق و مسدود.', '07:30 to the PgM: urgent / SLA-breached Mizito, follow-ups, today’s, late and blocked tasks.'] },
]

const names = (s: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)

/** Always invited to planned meetings: Config meeting.always, else the program manager and the CEO (super + exec). */
export function alwaysInvited(d: DB, configured: string) {
  if (configured.trim()) return names(configured)
  return d.Team.filter((t) => (t.access === 'super' || t.access === 'exec') && String(t.active) !== '0').map((t) => t.name)
}

interface Ctx {
  on: (id: string) => boolean
  setOn: (id: string, v: boolean) => Promise<void>
  events: GEvent[]
  calStatus: 'demo' | 'live' | 'off' | 'error'
  reloadCal: () => void
  importEvent: (e: GEvent) => Promise<Meeting | undefined>
  meetingSaved: (m: Meeting, before?: Meeting) => Promise<void>
  meetingHeld: (m: Meeting) => Promise<void>
  pause: (p: Project, reason: string) => Promise<void>
  resume: (p: Project) => Promise<void>
  log: { at: Date; text: string }[]
}
const C = createContext<Ctx | null>(null)
export const useAuto = () => useContext(C)!

export function AutomationProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { db, mode, me, canEdit, upsert, toast, setting, setSetting, action, refresh } = store
  const { session } = useGoogle()
  const [log, setLog] = useState<{ at: Date; text: string }[]>([])
  const [live, setLive] = useState<GEvent[]>([])
  const [calStatus, setCalStatus] = useState<Ctx['calStatus']>(mode === 'demo' ? 'demo' : 'off')
  const [calTick, setCalTick] = useState(0)
  const ran = useRef(new Set<string>())
  const dbRef = useRef(db)
  dbRef.current = db

  // app rules are on unless switched off; email (server) rules are off until switched on
  const on = useCallback((id: string) => {
    const v = setting(`auto.${id}`, '')
    return v ? v !== 'off' : AUTOMATIONS.find((a) => a.id === id)?.where !== 'server'
  }, [setting])
  const setOn = (id: string, v: boolean) => setSetting(`auto.${id}`, v ? 'on' : 'off')
  const fire = useCallback(
    (text: string) => {
      setLog((l) => [{ at: new Date(), text }, ...l].slice(0, 30))
      toast(`⚡ ${text}`)
    },
    [toast],
  )

  // ---------------------------------------------------------- calendar
  const demoCal = useMemo(() => (mode === 'demo' ? demoEvents(db) : []), [mode, db])
  useEffect(() => {
    if (mode === 'demo') return setCalStatus('demo')
    if (!session?.token) return setCalStatus('off')
    const ws = weekStart()
    fetchEvents(session.token, addDays(ws, -14), addDays(ws, 42))
      .then((e) => {
        setLive(e)
        setCalStatus('live')
      })
      .catch(() => setCalStatus('error'))
  }, [mode, session, calTick])
  const events = mode === 'demo' ? demoCal : live

  const importEvent = useCallback(
    async (e: GEvent) => {
      const d = dbRef.current
      const r = relate(e, d)
      if (r.meeting) return r.meeting
      const attendees = d.Team.filter((m) => m.email && e.attendees.includes(m.email.toLowerCase())).map((m) => m.name)
      const organizer = d.Team.find((m) => m.email && m.email.toLowerCase() === e.organizer)?.name || me
      const m: Meeting = {
        id: uid('MT'), series: seriesFor(e, r), title: e.title, project_id: r.projectId, date: e.date, time: e.time, duration: e.duration || 45, facilitator: organizer,
        attendees: (attendees.length ? attendees : [me]).join(', '), status: e.date < todayISO() ? 'held' : 'scheduled', notes: '', decisions: '', gcal_id: e.id, meet_url: e.meetUrl,
      }
      await upsert('Meetings', m)
      return m
    },
    [me, upsert],
  )

  // gcal_import: related, not-yet-linked events in the coming three weeks
  useEffect(() => {
    if (!canEdit || !on('gcal_import') || !events.length) return
    const t = todayISO()
    const todo = events.filter((e) => e.date >= addDays(t, -1) && e.date <= addDays(t, 21) && !ran.current.has('ev:' + e.id)).filter((e) => {
      const r = relate(e, dbRef.current)
      return r.related && !r.meeting
    })
    if (!todo.length) return
    todo.forEach((e) => ran.current.add('ev:' + e.id))
    ;(async () => {
      for (const e of todo) await importEvent(e)
      fire(L(`${fa(todo.length)} ایونت مرتبط از تقویم گوگل به جلسات اضافه شد`, `${todo.length} related Google Calendar event(s) added to Meetings`))
    })()
  }, [events, canEdit, on, importEvent, fire])

  // blocked_followup: only the admin's session runs it, so it isn't duplicated
  useEffect(() => {
    if (!on('blocked_followup') || !(store.access === 'super') || ran.current.has('blocked')) return
    ran.current.add('blocked')
    const t = todayISO()
    const n = taskCfg().blockedDays
    const since = (k: Task) => k.blocked_since || (k.updated_at || '').slice(0, 10) || k.created_at
    const stuck = db.Tasks.filter((k: Task) => isBlocked(k.status) && since(k) && daysBetween(since(k), t) >= n)
    const subject = (k: Task) => L(`رفع انسداد: ${k.title}`, `Unblock: ${k.title}`)
    const fresh = stuck.filter((k) => !db.FollowUps.some((f) => f.subject === subject(k)))
    if (!fresh.length) return
    ;(async () => {
      for (const k of fresh)
        await upsert('FollowUps', {
          id: uid('F'), project_id: k.project_id, subject: subject(k), person: k.blocked_by || k.assignee.split(',')[0].trim(), channel: 'chat', due_date: t, status: 'open', priority: 'high',
          notes: L(`خودکار: این تسک ${fa(daysBetween(since(k), t))} روز است مسدود مانده.${k.blocked_reason ? ` علت: ${k.blocked_reason}` : ''}`, `Automatic: blocked for ${daysBetween(since(k), t)} days.${k.blocked_reason ? ` Reason: ${k.blocked_reason}` : ''}`), created_at: t, done_at: '', owner: me,
        })
      fire(L(`${fa(fresh.length)} پیگیری برای تسک‌های مسدود ساخته شد`, `${fresh.length} follow-up(s) created for blocked tasks`))
    })()
  }, [db, store.access, on, upsert, fire])

  // google_photo
  useEffect(() => {
    if (!session?.picture || !on('google_photo') || ran.current.has('photo')) return
    const mem = db.Team.find((m) => m.email && m.email.toLowerCase() === session.email)
    if (!mem || mem.photo) return
    ran.current.add('photo')
    upsert('Team', { ...mem, photo: session.picture }).then(() => fire(L('عکس پروفایل از حساب گوگل شما گذاشته شد', 'Your Google profile photo was added')))
  }, [session, db.Team, on, upsert, fire])

  // ---------------------------------------------------------- meeting rules
  // Planned meetings go to Google Calendar from the server (the deployment owner's calendar), with a
  // Meet link; attendees, the facilitator and the always-invited people (program manager + CEO) get
  // the invitation. A moved, re-staffed or cancelled meeting updates the same event.
  const meetingSaved = useCallback(
    async (m: Meeting, before?: Meeting) => {
      if (!on('gcal_create')) return
      const changed = !before || (['date', 'time', 'duration', 'title', 'attendees', 'facilitator', 'status', 'items'] as const).some((k) => String(before[k] ?? '') !== String(m[k] ?? ''))
      if (!changed || (m.status === 'held' && before)) return
      if (m.status === 'cancelled' && !m.gcal_id) return
      const d = dbRef.current
      const always = alwaysInvited(d, setting('meeting.always', ''))
      const people = [...new Set([...names(m.attendees), m.facilitator, ...always].filter(Boolean))]
      if (mode === 'demo') {
        if (m.status === 'cancelled') {
          await upsert('Meetings', { ...m, gcal_id: '' })
          return fire(L('رویداد تقویم لغو شد (نمایشی)', 'Calendar event cancelled (demo)'))
        }
        await upsert('Meetings', { ...m, gcal_id: m.gcal_id || `g-${m.id}`, meet_url: m.meet_url || `https://meet.google.com/mdr-${m.id.slice(-6)}` })
        return fire(before?.gcal_id
          ? L('رویداد تقویم به‌روز شد (نمایشی)', 'Calendar event updated (demo)')
          : L(`در تقویم ثبت شد و ${fa(people.length)} نفر دعوت شدند (نمایشی)`, `Added to the calendar, ${people.length} invited (demo)`))
      }
      try {
        await action('syncMeeting', { meeting_id: m.id })
        await refresh()
        fire(m.status === 'cancelled'
          ? L('رویداد تقویم لغو شد', 'Calendar event cancelled')
          : L(`در تقویم ثبت شد و ${fa(people.length)} نفر دعوت شدند`, `Added to the calendar, ${people.length} invited`))
        setCalTick((n) => n + 1)
      } catch {
        toast(L('ثبت در تقویم گوگل انجام نشد', 'Could not update Google Calendar'), 'err')
      }
    },
    [on, mode, upsert, action, refresh, setting, fire, toast],
  )

  const meetingHeld = useCallback(
    async (m: Meeting) => {
      const d = dbRef.current
      if (on('next_meeting') && isWeeklySeries(m.series) && !d.Meetings.some((x) => x.title === m.title && x.date === addDays(m.date, 7))) {
        const next: Meeting = { ...m, id: uid('MT'), date: addDays(m.date, 7), status: 'scheduled', notes: '', decisions: '', gcal_id: '', meet_url: m.meet_url }
        await upsert('Meetings', next)
        fire(L(`جلسه‌ی هفته‌ی بعد (${m.title}) ساخته شد`, `Next week’s ${m.title} scheduled`))
      }
      if (on('minutes_mail')) {
        const n = names(m.attendees).length
        if (mode === 'demo') fire(L(`صورت‌جلسه و اکشن‌پلن برای ${fa(n)} نفر ایمیل شد (نمایشی)`, `Minutes & action plan emailed to ${n} (demo)`))
        else
          action('mailMinutes', { meeting_id: m.id })
            .then(() => fire(L(`صورت‌جلسه و اکشن‌پلن برای ${fa(n)} نفر ایمیل شد`, `Minutes & action plan emailed to ${n}`)))
            .catch(() => toast(L('ارسال ایمیل صورت‌جلسه انجام نشد', 'Could not email the minutes'), 'err'))
      }
    },
    [on, mode, upsert, action, fire, toast],
  )

  // ---------------------------------------------------------- pause / resume
  const pause = useCallback(
    async (p: Project, reason: string) => {
      await upsert('Projects', { ...p, status: 'on_hold', paused_at: todayISO(), pause_reason: reason })
      const d = dbRef.current
      const freed = d.Allocations.filter((a) => a.project_id === p.id && (!a.end_date || a.end_date >= todayISO())).reduce((s, a) => s + Number(a.percent || 0), 0)
      toast(L(`${p.name} متوقف شد؛ ظرفیت ${fa(Math.round(freed / 10) / 10)} نفر تمام‌وقت آزاد شد`, `${p.name} paused; ${Math.round(freed / 10) / 10} full-time people freed`))
    },
    [upsert, toast],
  )
  const resume = useCallback(
    async (p: Project) => {
      const t = todayISO()
      const days = p.paused_at ? Math.max(0, daysBetween(p.paused_at, t)) : 0
      const shift = on('pause_shift') && days > 0
      await upsert('Projects', { ...p, status: 'active', paused_at: '', pause_reason: '', end_date: shift && p.end_date ? addDays(p.end_date, days) : p.end_date })
      if (!shift) return toast(L(`${p.name} دوباره فعال شد`, `${p.name} resumed`))
      const d = dbRef.current
      // an approved re-plan: move the baseline too, so it doesn't read as slippage
      for (const x of d.Deliverables.filter((x) => x.project_id === p.id && x.status !== 'delivered' && x.status !== 'dropped'))
        await upsert('Deliverables', { ...x, target_date: addDays(x.target_date, days), baseline_date: x.baseline_date ? addDays(x.baseline_date, days) : '' })
      for (const ms of d.Milestones.filter((x) => x.project_id === p.id && x.status !== 'done')) await upsert('Milestones', { ...ms, planned_date: addDays(ms.planned_date, days), status: ms.status === 'missed' ? 'pending' : ms.status })
      fire(L(`${p.name} ادامه یافت؛ ددلاین و برنامه ${fa(days)} روز جلو رفت`, `${p.name} resumed; dates moved by ${days} days`))
    },
    [on, upsert, toast, fire],
  )

  const value: Ctx = { on, setOn, events, calStatus, reloadCal: () => setCalTick((n) => n + 1), importEvent, meetingSaved, meetingHeld, pause, resume, log }
  return <C.Provider value={value}>{children}</C.Provider>
}
