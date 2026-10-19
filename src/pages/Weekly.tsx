import { assigneesOf } from '../lib/assignees'
import { closed } from '../lib/columns'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, CalendarPlus, CheckCircle2, RotateCcw, Pencil, Siren, Gavel, Package, Users, FileWarning, ListChecks, Workflow, ShieldAlert, Ban, Save, Repeat, Video, CalendarDays, Paperclip,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, StatStrip, Avatar, AvatarStack, cx, Empty, HealthDot } from '../components/ui'
import { TaskRow } from '../components/shared'
import { WeekNav } from '../components/WeekNav'
import { PersonPicker } from '../components/pickers'
import { DatePicker } from '../components/DatePicker'
import { RagStrip } from '../components/widgets'
import { useComposer } from '../components/UpdateComposer'
import { Attachments } from '../components/Files'
import { Segmented } from '../components/ui'
import { useAuto } from '../lib/automations'
import { relate, type GEvent } from '../lib/gcal'
import { usePref } from '../lib/prefs'
import { uid } from '../lib/api'
import { addDays, fa, fmtDayMonth, fmtWeekday, relDays, todayISO } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import { MEETING_SERIES, MEETING_STATUS, isWeeklySeries } from '../lib/labels'
import { inWeek, updateDue, weekCfg, weekLabel, weekRel, weekStart, weeklyDate, weeksFrom } from '../lib/weeks'
import { assess } from '../lib/rag'
import { isClosed, isOverdue, deliveryTrack, slipDays } from '../lib/delivery'
import { overloaded, trackWeek } from '../lib/capacity'
import { TRACK, TRACKS, trackOf, waitingOn } from '../lib/tracks'
import { isReturn, recent } from '../lib/handoffs'
import { isTaskOverdue } from '../lib/metrics'
import type { DB, Health, Meeting, Task, Track } from '../lib/types'

const seriesTone: Record<string, string> = {
  portfolio: 'bg-ink text-surface',
  design: 'bg-[#7c3aed]/10 text-[#7c3aed] dark:text-[#c4b5fd]',
  product: 'bg-wine/10 text-wine dark:text-[#ec7892]',
  tech: 'bg-brand/10 text-brand dark:text-brand-soft',
  project: 'bg-warn/12 text-warn',
  planning: 'bg-brand/10 text-brand dark:text-brand-soft',
  one_on_one: 'bg-good/10 text-good',
  other: 'bg-muted text-sub',
}
const names = (s: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
const lines = (s: string) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)
const byWhen = (a: Meeting, b: Meeting) => (a.date + a.time < b.date + b.time ? -1 : 1)

/** Weekly meetings: the week's meetings, an agenda built from live data, minutes, decisions and action items. */
export default function Weekly() {
  const { db, canEdit, me } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const [ws, setWs] = useState(weekStart())
  const [view, setView] = usePref<'week' | 'actions'>('madar.meetings.view', 'week')
  const meetings = db.Meetings.filter((m) => inWeek(m.date, ws)).sort(byWhen)
  const pick = () => (meetings.find((m) => m.date >= today && m.status !== 'cancelled') || meetings[meetings.length - 1])?.id || ''
  const [sel, setSel] = useState(pick)
  useEffect(() => {
    if (!meetings.some((m) => m.id === sel)) setSel(pick())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, db.Meetings])
  const current = db.Meetings.find((m) => m.id === sel)

  const actions = db.Tasks.filter((t) => t.meeting_id)
  const openActions = actions.filter((t) => !closed(t))
  const overdueActions = openActions.filter(isTaskOverdue)
  const decisions = meetings.filter((m) => m.status === 'held').reduce((s, m) => s + lines(m.decisions).length, 0)

  return (
    <>
      <Band
        title={L('جلسات', 'Meetings')}
        actions={
          <>
            <Segmented
              dark
              value={view}
              onChange={setView}
              options={[
                { value: 'week', label: L('جلسات', 'Meetings') },
                { value: 'actions', label: L('اکشن‌پلن (اقدام‌های باز)', 'Action plan (open actions)') },
              ]}
            />
            {view === 'week' && <WeekNav ws={ws} onChange={setWs} />}
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Meetings', { date: weeklyDate(ws) < today ? today : weeklyDate(ws), time: weekCfg().weeklyTime, facilitator: me, attendees: me })}>
                <Plus size={16} /> {L('جلسه‌ی جدید', 'New meeting')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('جلسات این هفته', 'Meetings this week'), value: fa(meetings.length), sub: L(`${fa(meetings.filter((m) => m.status === 'held').length)} برگزار شد`, `${meetings.filter((m) => m.status === 'held').length} held`) },
            { label: L('تصمیم‌های این هفته', 'Decisions this week'), value: fa(decisions) },
            { label: L('اقدام باز', 'Open actions'), value: fa(openActions.length) },
            { label: L('اقدام معوق', 'Overdue actions'), value: fa(overdueActions.length), tone: overdueActions.length ? 'red' : 'green' },
          ]}
        />
      </Band>

      {view === 'actions' ? (
        <Overlap>
          <ActionPlan />
        </Overlap>
      ) : (
      <Overlap>
        <div className="grid items-start gap-4 @xl:grid-cols-[16rem_1fr] @3xl:grid-cols-[19rem_1fr]">
          <Card pad={false} className="@xl:sticky @xl:top-20">
            <div className="px-5 pb-2 pt-5">
              <div className="eyebrow mb-1">{weekLabel(ws)}</div>
              <h3 className="text-[0.9375rem] font-semibold">{L('جلسات هفته', 'This week')}</h3>
            </div>
            {meetings.length ? (
              <div className="space-y-1 p-2">
                {meetings.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSel(m.id)}
                    className={cx('flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-start transition', sel === m.id ? 'bg-muted ring-1 ring-ink/15' : 'hover:bg-muted/60', m.status === 'cancelled' && 'opacity-50')}
                  >
                    <div className={cx('w-11 shrink-0 rounded-xl py-1 text-center leading-tight', sel === m.id ? 'bg-ink text-surface' : 'bg-muted')}>
                      <div className="text-[0.625rem] opacity-70">{fmtWeekday(m.date, true)}</div>
                      <div className="text-sm font-semibold num">{fa(m.time || '—')}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.title}</div>
                      <div className={cx('mt-0.5 flex items-center gap-1.5 text-[0.6875rem]', 'text-sub')}>
                        {m.status === 'held' ? <CheckCircle2 size={11} /> : m.status === 'cancelled' ? <Ban size={11} /> : null}
                        {m.date === today ? L('امروز', 'Today') : fmtDayMonth(m.date)} · {L(`${fa(names(m.attendees).length)} نفر`, `${names(m.attendees).length} people`)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Empty text={L('جلسه‌ای در این هفته نیست', 'No meetings this week')} />
            )}
            <CalendarPanel ws={ws} onPick={setSel} />
          </Card>
          {current ? <MeetingRoom key={current.id} m={current} /> : <Card><Empty text={L('یک جلسه انتخاب کنید', 'Pick a meeting')} /></Card>}
        </div>
      </Overlap>
      )}
    </>
  )
}

function MeetingRoom({ m }: { m: Meeting }) {
  const { db, canEdit, upsert, toast, me } = useStore()
  const { open } = useEditor()
  const auto = useAuto()
  const today = todayISO()
  const project = db.Projects.find((p) => p.id === m.project_id)
  const series = db.Meetings.filter((x) => x.series === m.series && x.title === m.title).sort(byWhen)
  const prev = [...series].reverse().find((x) => x.date < m.date && x.status !== 'cancelled')
  const nextExists = series.some((x) => x.date === addDays(m.date, 7))
  const mine = db.Tasks.filter((t) => t.meeting_id === m.id)
  const fromPrev = prev ? db.Tasks.filter((t) => t.meeting_id === prev.id) : []
  // anything still open from older meetings of the same series carries over
  const older = series.filter((x) => x.date < (prev?.date || m.date)).map((x) => x.id)
  const carried = db.Tasks.filter((t) => older.includes(t.meeting_id) && !closed(t))

  const [notes, setNotes] = useState(m.notes)
  const [decisions, setDecisions] = useState(m.decisions)
  const dirty = notes !== m.notes || decisions !== m.decisions

  const save = async (patch: Partial<Meeting> = {}) => {
    await upsert('Meetings', { ...m, notes, decisions, ...patch })
    toast(patch.status === 'held' ? L('جلسه بسته شد', 'Meeting closed') : L('صورت‌جلسه ذخیره شد', 'Minutes saved'))
    if (patch.status === 'held') auto.meetingHeld({ ...m, notes, decisions, ...patch })
    if (patch.status === 'cancelled' || patch.date || patch.time) auto.meetingSaved({ ...m, notes, decisions, ...patch }, m)
  }
  const scheduleNext = async () => {
    const next: Meeting = { ...m, id: uid('MT'), date: addDays(m.date, 7), status: 'scheduled', notes: '', decisions: '', gcal_id: '', checklist: '' }
    await upsert('Meetings', next)
    auto.meetingSaved(next)
    toast(L(`جلسه‌ی ${fmtDayMonth(addDays(m.date, 7))} ساخته شد`, `Meeting on ${fmtDayMonth(addDays(m.date, 7))} created`))
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('chip', seriesTone[m.series] || 'bg-muted text-sub')}>{lbl(MEETING_SERIES, m.series)}</span>
              <span className={cx('chip', m.status === 'held' ? 'bg-good/10 text-good' : m.status === 'cancelled' ? 'bg-muted text-sub' : 'bg-brand/10 text-brand dark:text-brand-soft')}>{lbl(MEETING_STATUS, m.status)}</span>
              {project && (
                <Link to={`/projects/${project.id}`} className="chip bg-muted text-sub hover:text-ink">
                  {project.name}
                </Link>
              )}
            </div>
            <h2 className="display mt-3 text-2xl">{m.title}</h2>
            <div className="mt-1 text-sm text-sub num">
              {fmtWeekday(m.date)} {fmtDayMonth(m.date)} · {fa(m.time || '')} · {relDays(m.date)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-sub">
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={m.facilitator || '?'} size="xs" /> {L('برگزارکننده', 'Facilitator')}: <b className="font-medium text-ink">{m.facilitator || '—'}</b>
              </span>
              <span className="inline-flex items-center gap-1.5" title={names(m.attendees).join('، ')}>
                <AvatarStack names={names(m.attendees)} max={6} />
                {L(`${fa(names(m.attendees).length)} حاضر`, `${names(m.attendees).length} attendees`)}
              </span>
              {m.guests && (
                <span className="inline-flex items-center gap-1.5" title={m.guests}>
                  {L('مهمانان بیرونی', 'Guests')}: <b className="max-w-[18rem] truncate font-medium text-ink">{String(m.guests).split(/[,،\n]+/).map((x) => x.trim()).filter(Boolean).join('، ')}</b>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {m.meet_url && m.status !== 'held' && (
              <a href={m.meet_url} target="_blank" rel="noreferrer" className="btn-sm btn bg-[#1a73e8] text-white hover:bg-[#1665cf]">
                <Video size={14} /> {L('ورود به Meet', 'Join Meet')}
              </a>
            )}
            {m.gcal_id && (
              <span className="chip h-8 bg-muted px-3 text-sub" title={L('به تقویم گوگل وصل است', 'Linked to Google Calendar')}>
                <CalendarDays size={13} /> {L('در تقویم گوگل', 'In Google Calendar')}
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex w-full flex-wrap gap-2 @lg:w-auto">
              {m.status !== 'held' ? (
                <button className="btn-primary btn-sm" onClick={() => save({ status: 'held' })}>
                  <CheckCircle2 size={14} /> {L('برگزار شد', 'Mark held')}
                </button>
              ) : (
                <button className="btn-outline btn-sm" onClick={() => save({ status: 'scheduled' })}>
                  <RotateCcw size={14} /> {L('بازگشایی', 'Reopen')}
                </button>
              )}
              {!nextExists && !auto.on('next_meeting') && (
                <button className="btn-outline btn-sm" onClick={scheduleNext}>
                  <Repeat size={14} /> {L('جلسه‌ی هفته‌ی بعد', 'Schedule next week')}
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={() => open('Meetings', m as never)}>
                <Pencil size={14} /> {L('ویرایش', 'Edit')}
              </button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Card
          eyebrow={prev ? L(`از جلسه‌ی ${fmtDayMonth(prev.date)}`, `From ${fmtDayMonth(prev.date)}`) : L('اقدام‌ها', 'Actions')}
          title={L('مرور اقدام‌های جلسه‌ی قبل', 'Review last meeting’s actions')}
          action={fromPrev.length ? <span className="text-xs text-sub num">{fa(fromPrev.filter((t) => t.status === 'done').length)}/{fa(fromPrev.length)}</span> : undefined}
        >
          {fromPrev.length || carried.length ? (
            <div className="-mx-2">
              {fromPrev.map((t) => (
                <TaskRow key={t.id} t={t} dense />
              ))}
              {carried.length > 0 && (
                <>
                  <div className="eyebrow mx-2 mb-1 mt-3">{L('باز مانده از جلسات قدیمی‌تر', 'Still open from earlier')}</div>
                  {carried.map((t) => (
                    <TaskRow key={t.id} t={t} dense />
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-sub">{L('اقدامی از جلسه‌ی قبل ثبت نشده.', 'No actions recorded last time.')}</p>
          )}
          {prev && lines(prev.decisions).length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="eyebrow mb-2">{L('تصمیم‌های جلسه‌ی قبل', 'Last meeting’s decisions')}</div>
              <ul className="space-y-1.5 text-xs leading-5">
                {lines(prev.decisions).map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <Gavel size={12} className="mt-1 shrink-0 text-sub" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Agenda m={m} />
      </div>

      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Card
          eyebrow={L('صورت‌جلسه', 'Minutes')}
          title={L('یادداشت‌ها و تصمیم‌ها', 'Notes & decisions')}
          action={
            canEdit && dirty ? (
              <button className="btn-primary btn-sm" onClick={() => save()}>
                <Save size={14} /> {L('ذخیره', 'Save')}
              </button>
            ) : undefined
          }
        >
          <label className="label">{L('یادداشت جلسه', 'Notes')}</label>
          <textarea className="input" rows={5} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} placeholder={L('نکات اصلی بحث…', 'Key discussion points…')} />
          <label className="label mt-4">{L('تصمیم‌ها (هر خط یک تصمیم)', 'Decisions (one per line)')}</label>
          <textarea className="input" rows={4} value={decisions} disabled={!canEdit} onChange={(e) => setDecisions(e.target.value)} placeholder={L('مثلاً: لانچ SimiPass دو هفته عقب می‌رود', 'e.g. SimiPass launch moves two weeks')} />
          <label className="label mt-4 flex items-center gap-1.5">
            <Paperclip size={12} /> {L('فایل‌های جلسه', 'Meeting files')}
          </label>
          <Attachments entity="Meetings" id={m.id} compact />
        </Card>

        <Card eyebrow={L('اقدام‌ها', 'Action items')} title={L('چه کسی، چه کاری، تا کی', 'Who does what, by when')} action={<span className="text-xs text-sub num">{fa(mine.length)}</span>}>
          {mine.length ? (
            <div className="-mx-2 mb-3">
              {mine.map((t) => (
                <TaskRow key={t.id} t={t} dense />
              ))}
            </div>
          ) : (
            <div className="mb-3" />
          )}
          {canEdit && <AddAction m={m} me={me} today={today} />}
        </Card>
      </div>
    </div>
  )
}

function AddAction({ m, me, today }: { m: Meeting; me: string; today: string }) {
  const { upsert, toast } = useStore()
  const [title, setTitle] = useState('')
  const [who, setWho] = useState(me)
  const [due, setDue] = useState(addDays(m.date > today ? m.date : today, 7))
  const add = async () => {
    if (!title.trim()) return
    const t: Task = {
      id: uid('T'), project_id: m.project_id, sprint_id: '', title: title.trim(), description: L(`از ${m.title} — ${fmtDayMonth(m.date)}`, `From ${m.title} — ${fmtDayMonth(m.date)}`), assignee: who, reporter: me,
      status: 'todo', priority: 'high', due_date: due, points: 0, tags: 'action', created_at: today, completed_at: '', track: '', depends_on: '', meeting_id: m.id, private: '',
    }
    await upsert('Tasks', t)
    setTitle('')
    toast(L(`اقدام برای ${who} ثبت شد`, `Action assigned to ${who}`))
  }
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-3">
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={L('اقدام جدید… (Enter)', 'New action… (Enter)')} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PersonPicker value={who} onChange={setWho} />
        <DatePicker compact value={due} onChange={setDue} />
        <button className="btn-primary btn-sm ms-auto" onClick={add} disabled={!title.trim()}>
          <CalendarPlus size={14} /> {L('افزودن', 'Add')}
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ agenda
interface AgendaItem {
  key: string
  primary: ReactNode
  secondary?: ReactNode
  tone?: Health
  to?: string
  onClick?: () => void
}
interface AgendaSection {
  icon: typeof Siren
  title: string
  items: AgendaItem[]
  empty: string
}

function useAgenda(m: Meeting): AgendaSection[] {
  const { db } = useStore()
  const { open } = useEditor()
  const { openComposer } = useComposer()
  return useMemo(() => buildAgenda(m, db, open, openComposer), [m, db, open, openComposer])
}

function buildAgenda(m: Meeting, db: DB, open: ReturnType<typeof useEditor>['open'], openComposer: ReturnType<typeof useComposer>['openComposer']): AgendaSection[] {
  const ws = weekStart(m.date)
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  const live = db.Projects.filter((p) => p.status === 'active')
  const track: Track | '' = TRACKS.includes(m.series) ? m.series : ''
  const scope = m.project_id ? [m.project_id] : live.map((p) => p.id)
  const dels = db.Deliverables.filter((d) => scope.includes(d.project_id) && !isClosed(d) && (!track || deliveryTrack(d, db) === track))
  const dueSoon = dels.filter((d) => isOverdue(d) || d.target_date <= addDays(ws, 13)).sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
  const delSection: AgendaSection = {
    icon: Package,
    title: L('تحویل‌های این دو هفته', 'Deliveries in the next two weeks'),
    items: dueSoon.slice(0, 7).map((d) => ({
      key: d.id,
      primary: d.title,
      secondary: `${m.project_id ? '' : pname(d.project_id) + ' · '}${fmtDayMonth(d.target_date)}${slipDays(d) ? L(` · ${fa(slipDays(d))} روز جابجایی`, ` · ${slipDays(d)}d slip`) : ''}`,
      tone: isOverdue(d) ? 'red' : d.status === 'at_risk' || slipDays(d) ? 'amber' : 'green',
      onClick: () => open('Deliverables', d as never),
    })),
    empty: L('خروجی در این بازه نیست', 'Nothing due'),
  }

  const capSection = (t: Track | ''): AgendaSection => {
    const over = overloaded(db, ws).filter((x) => !t || x.m.track === t)
    const items: AgendaItem[] = over.map(({ m: mem, w }) => ({ key: mem.id, primary: mem.name, secondary: L(`${fa(w.load)}٪ این هفته`, `${w.load}% this week`), tone: 'red', to: `/people/${mem.id}` }))
    ;(t ? [t] : TRACKS).forEach((tt) => {
      const hit = weeksFrom(addDays(ws, 7), 8).map((w) => trackWeek(db, tt, w)).find((x) => x.load > 100)
      if (hit) items.push({ key: 'f' + tt, primary: L(`تیم ${lbl(TRACK, tt)} از ${weekRel(hit.ws)} به ${fa(hit.load)}٪ می‌رسد`, `${lbl(TRACK, tt)} hits ${hit.load}% ${weekRel(hit.ws).toLowerCase()}`), secondary: weekLabel(hit.ws), tone: 'amber', to: '/tasks' })
    })
    return { icon: Users, title: L('ظرفیت و فشار کاری', 'Capacity & load'), items, empty: L('ظرفیت مشکلی ندارد', 'Capacity is fine') }
  }

  const due = updateDue(ws)
  const missing = live.filter((p) => scope.includes(p.id) && !db.Updates.some((u) => u.project_id === p.id && inWeek(u.week_date, ws)))
  const updSection: AgendaSection = {
    icon: FileWarning,
    title: L('گزارش‌های هفتگی ارسال‌نشده', 'Weekly updates not in'),
    items: missing.map((p) => ({ key: p.id, primary: p.name, secondary: L(`${p.owner} · مهلت ${fmtWeekday(due)}`, `${p.owner} · due ${fmtWeekday(due)}`), tone: 'amber', onClick: () => openComposer({ projectId: p.id }) })),
    empty: L('همه گزارش داده‌اند', 'Everyone has reported'),
  }

  const decisions = db.Risks.filter((r) => r.type === 'decision' && r.status !== 'closed' && (!m.project_id || r.project_id === m.project_id))
  const decSection: AgendaSection = {
    icon: Gavel,
    title: L('تصمیم‌های منتظر', 'Decisions waiting'),
    items: decisions.map((r) => ({ key: r.id, primary: r.title, secondary: `${pname(r.project_id)} · ${r.owner} · ${relDays(r.due_date)}`, tone: r.due_date && r.due_date < todayISO() ? 'red' : 'amber', onClick: () => open('Risks', r as never) })),
    empty: L('تصمیمی در انتظار نیست', 'No decisions pending'),
  }

  if (m.series === 'project' && m.project_id) {
    const risks = db.Risks.filter((r) => r.project_id === m.project_id && r.status !== 'closed' && r.type !== 'decision').sort((a, b) => b.probability * b.impact - a.probability * a.impact)
    const blocked = db.Tasks.filter((t) => t.project_id === m.project_id && (t.status === 'blocked' || isTaskOverdue(t)))
    return [
      delSection,
      { icon: ShieldAlert, title: L('ریسک‌های باز', 'Open risks'), items: risks.slice(0, 5).map((r) => ({ key: r.id, primary: r.title, secondary: r.owner, tone: r.probability * r.impact >= 15 ? 'red' : 'amber', onClick: () => open('Risks', r as never) })), empty: L('ریسک بازی نیست', 'No open risks') },
      { icon: Ban, title: L('کارهای مسدود یا معوق', 'Blocked or late work'), items: blocked.slice(0, 6).map((t) => ({ key: t.id, primary: t.title, secondary: `${t.assignee} · ${relDays(t.due_date)}`, tone: t.status === 'blocked' ? 'red' : 'amber', onClick: () => open('Tasks', t as never) })), empty: L('کار مسدودی نیست', 'Nothing blocked') },
      decSection,
    ]
  }

  if (track) {
    const otherSide = (s: string) => !!s && s !== track
    const waiting = db.Tasks.filter((t) => !closed(t) && trackOf(t, db) === track && waitingOn(t, db).some((d) => otherSide(trackOf(d, db))))
    const owed = db.Tasks.filter((t) => !closed(t) && trackOf(t, db) === track && db.Tasks.some((x) => !closed(x) && otherSide(trackOf(x, db)) && waitingOn(x, db).some((d) => d.id === t.id)))
    const sideOf = (t: Task) => lbl(TRACK, trackOf(t, db) || '')
    const waitsOn = (t: Task) => [...new Set(waitingOn(t, db).map((d) => trackOf(d, db)).filter(otherSide))].map((s) => lbl(TRACK, s)).join('، ')
    const owedTo = (t: Task) => [...new Set(db.Tasks.filter((x) => !closed(x) && otherSide(trackOf(x, db)) && waitingOn(x, db).some((d) => d.id === t.id)).map((x) => trackOf(x, db)))].map((s) => lbl(TRACK, s)).join('، ')
    // this unit's hand-overs and returns of the last two weeks
    const hs = recent(db).filter((h) => (h.from_side === track || h.to_side === track) && (!m.project_id || h.project_id === m.project_id)).sort((a, b) => Number(isReturn(b)) - Number(isReturn(a)))
    return [
      delSection,
      {
        icon: Workflow,
        title: L('تحویل‌ها و هماهنگی با واحدهای دیگر', 'Hand-offs with the other units'),
        items: [
          ...hs.slice(0, 6).map((h) => ({ key: 'h' + h.id, primary: h.title, secondary: `${L(`از ${lbl(TRACK, h.from_side)} به ${lbl(TRACK, h.to_side)}`, `${lbl(TRACK, h.from_side)} to ${lbl(TRACK, h.to_side)}`)} · ${isReturn(h) ? L('برگشت', 'returned') : L('تحویل', 'handed over')}${Number(h.round) > 1 ? L(` · دور ${fa(h.round)}`, ` · round ${h.round}`) : ''}`, tone: (isReturn(h) ? 'red' : 'green') as Health, to: '/tasks' })),
          ...owed.slice(0, 4).map((t) => ({ key: 'o' + t.id, primary: t.title, secondary: L(`${pname(t.project_id)} · ${owedTo(t)} منتظر این است`, `${pname(t.project_id)} · ${owedTo(t)} waiting on this`), tone: 'amber' as Health, onClick: () => open('Tasks', t as never) })),
          ...waiting.slice(0, 4).map((t) => ({ key: 'w' + t.id, primary: t.title, secondary: L(`${pname(t.project_id)} · ${sideOf(t)} منتظر ${waitsOn(t)}`, `${pname(t.project_id)} · waiting on ${waitsOn(t)}`), tone: 'red' as Health, onClick: () => open('Tasks', t as never) })),
        ],
        empty: L('تحویل یا وابستگی بازی با واحدهای دیگر نیست', 'No open hand-offs with other units'),
      },
      capSection(track),
      updSection,
    ]
  }

  // portfolio
  const attention = live
    .map((p) => ({ p, a: assess(p, db) }))
    .filter((x) => x.a.overall !== 'green' || x.a.trend === 'down')
    .sort((x, y) => (x.a.overall === 'red' ? 0 : 1) - (y.a.overall === 'red' ? 0 : 1))
  return [
    {
      icon: Siren,
      title: L('پروژه‌های نیازمند توجه', 'Projects needing attention'),
      items: attention.map(({ p, a }) => {
        const bad = Object.values(a.dims).filter((d) => d.h !== 'green').map((d) => d.why).slice(0, 2).join(L('؛ ', '; '))
        return { key: p.id, primary: p.name, secondary: `${a.trend === 'down' ? L('بدتر از هفته‌ی قبل — ', 'worse than last week — ') : ''}${bad}`, tone: a.overall, to: `/projects/${p.id}` }
      }),
      empty: L('همه‌ی پروژه‌ها سبز هستند', 'All projects are green'),
    },
    decSection,
    delSection,
    capSection(''),
    updSection,
  ]
}

function Agenda({ m }: { m: Meeting }) {
  const sections = useAgenda(m)
  const project = useStore().db.Projects.find((p) => p.id === m.project_id)
  const { db } = useStore()
  return (
    <Card eyebrow={L('دستور جلسه — خودکار از داده‌ها', 'Agenda — built from live data')} title={L('موضوعات این جلسه', 'What to cover')} action={<ListChecks size={16} className="text-sub" />}>
      {project && m.series === 'project' && (
        <div className="mb-4">
          <RagStrip a={assess(project, db)} compact />
        </div>
      )}
      <ol className="space-y-4">
        {sections.map((s, i) => (
          <li key={i}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[0.6875rem] font-semibold num">{fa(i + 1)}</span>
              <s.icon size={14} className="text-sub" />
              <span className="text-sm font-semibold">{s.title}</span>
              <span className="ms-auto text-[0.6875rem] text-sub num">{fa(s.items.length)}</span>
            </div>
            {s.items.length ? (
              <ul className="ms-8 grid gap-x-4 gap-y-0.5 @2xl:grid-cols-2">
                {s.items.map((it) => {
                  const body = (
                    <>
                      {it.tone && <HealthDot h={it.tone} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem]">{it.primary}</span>
                        {it.secondary && <span className="block truncate text-[0.6875rem] text-sub">{it.secondary}</span>}
                      </span>
                    </>
                  )
                  const cls = 'flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start transition hover:bg-muted'
                  return (
                    <li key={it.key}>
                      {it.to ? (
                        <Link to={it.to} className={cls}>
                          {body}
                        </Link>
                      ) : (
                        <button className={cls} onClick={it.onClick}>
                          {body}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="ms-10 text-[0.6875rem] text-sub">{s.empty}</p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** Google Calendar events of the week that aren't meetings here yet. */
function CalendarPanel({ ws, onPick }: { ws: string; onPick: (id: string) => void }) {
  const { db, canEdit } = useStore()
  const auto = useAuto()
  const evs = auto.events.filter((e) => inWeek(e.date, ws)).map((e) => ({ e, r: relate(e, db) })).filter((x) => !x.r.meeting)
  const status =
    auto.calStatus === 'live' ? L('متصل به تقویم گوگل', 'Google Calendar connected') : auto.calStatus === 'demo' ? L('تقویم گوگل (نمایشی)', 'Google Calendar (demo)') : auto.calStatus === 'error' ? L('خطا در خواندن تقویم', 'Calendar error') : L('برای اتصال تقویم با گوگل وارد شوید', 'Sign in with Google to connect your calendar')
  const add = async (e: GEvent) => {
    const m = await auto.importEvent(e)
    if (m) onPick(m.id)
  }
  return (
    <div className="border-t border-line px-3 pb-3 pt-3">
      <div className="mb-2 flex items-center gap-1.5 px-2 text-[0.6875rem] text-sub">
        <span className={cx('h-1.5 w-1.5 rounded-full', auto.calStatus === 'live' || auto.calStatus === 'demo' ? 'bg-good' : 'bg-line-strong')} />
        {status}
      </div>
      {evs.length > 0 && (
        <ul className="space-y-0.5">
          {evs
            .sort((a, b) => Number(b.r.related) - Number(a.r.related) || (a.e.date + a.e.time < b.e.date + b.e.time ? -1 : 1))
            .map(({ e, r }) => (
              <li key={e.id} className={cx('flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs', !r.related && 'opacity-55')}>
                <CalendarDays size={13} className="shrink-0 text-[#1a73e8]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{e.title}</span>
                  <span className="block text-[0.625rem] text-sub num">
                    {fmtWeekday(e.date, true)} {fa(e.time)}
                    {r.related && ` · ${r.projectId ? db.Projects.find((p) => p.id === r.projectId)?.name : L(`${fa(r.members.length)} نفر از تیم`, `${r.members.length} teammates`)}`}
                  </span>
                </span>
                {canEdit && (
                  <button className="icon-btn h-7 w-7" title={L('افزودن به جلسات', 'Add to meetings')} onClick={() => add(e)}>
                    <Plus size={13} />
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

/** Every open action agreed in a meeting, grouped by owner. */
function ActionPlan() {
  const { db } = useStore()
  const [series, setSeries] = useState<Meeting['series'] | ''>('')
  const meetingOf = (t: Task) => db.Meetings.find((m) => m.id === t.meeting_id)
  const actions = db.Tasks.filter((t) => t.meeting_id && !closed(t) && (!series || meetingOf(t)?.series === series))
  const done = db.Tasks.filter((t) => t.meeting_id && t.status === 'done' && t.completed_at >= addDays(todayISO(), -14)).length
  const by = new Map<string, Task[]>()
  actions.sort((a, b) => ((a.due_date || '9') < (b.due_date || '9') ? -1 : 1)).forEach((t) => (assigneesOf(t).length ? assigneesOf(t) : ['—']).forEach((a) => by.set(a, [...(by.get(a) || []), t])))
  const groups = [...by.entries()].sort((a, b) => b[1].filter(isTaskOverdue).length - a[1].filter(isTaskOverdue).length || b[1].length - a[1].length)
  return (
    <Card
      pad={false}
      eyebrow={L(`${fa(done)} اقدام در دو هفته‌ی اخیر انجام شد`, `${done} actions done in the last two weeks`)}
      title={L('اکشن پلن — اقدام‌های باز جلسات', 'Action plan — open meeting actions')}
      action={
        <Segmented
          value={series}
          onChange={setSeries}
          options={[{ value: '' as const, label: L('همه', 'All') }, ...Object.keys(MEETING_SERIES).filter(isWeeklySeries).map((s) => ({ value: s, label: lbl(MEETING_SERIES, s) }))]}
        />
      }
    >
      {groups.length ? (
        <div className="grid gap-px border-t border-line bg-line @2xl:grid-cols-2">
          {groups.map(([who, list]) => (
            <section key={who} className="bg-surface p-4">
              <header className="mb-2 flex items-center gap-2.5">
                <Avatar name={who} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{who}</div>
                  <div className="text-[0.6875rem] text-sub">
                    {L(`${fa(list.length)} اقدام باز`, `${list.length} open`)}
                    {list.filter(isTaskOverdue).length > 0 && <span className="text-bad"> · {L(`${fa(list.filter(isTaskOverdue).length)} معوق`, `${list.filter(isTaskOverdue).length} overdue`)}</span>}
                  </div>
                </div>
              </header>
              <div className="-mx-2">
                {list.map((t) => (
                  <div key={t.id}>
                    <TaskRow t={t} dense />
                    <div className="-mt-1 mb-1 ps-11 text-[0.625rem] text-sub">
                      {L('از', 'from')} {meetingOf(t)?.title} · {fmtDayMonth(meetingOf(t)?.date || '')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty text={L('اقدام بازی نیست', 'No open actions')} />
      )}
    </Card>
  )
}
