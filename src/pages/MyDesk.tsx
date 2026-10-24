import { assigneesOf, isAssignee } from '../lib/assignees'
import { dirOf } from '../lib/dir'
import { mzClosed, mzSignals } from '../lib/mizito'
import { MzSignals, PBadge } from '../components/MizitoParts'
import { CartableCard, TodoCard } from '../components/DeskParts'
import { AtSign } from 'lucide-react'
import { signals, viewCounts } from '../lib/signals'
import { closed, isBlocked } from '../lib/columns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Copy, Lightbulb, UserCheck, ListChecks, BellRing, Hourglass, Sparkles, CalendarDays, Target } from 'lucide-react'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, Avatar, cx, Segmented, StatStrip, Chip, Ring, PriorityIcon, Due } from '../components/ui'
import { FollowUpRow, TaskRow, useProjectName } from '../components/shared'
import { PersonPicker, ProjectPicker } from '../components/pickers'
import { canPersonal, dueDaysFor, needsDue, needsProject, taskCfg } from '../lib/taskcfg'
import { addDays, daysFromToday, fa, fmtDate, todayISO, daysBetween, firstName, greeting, fmtWeekday, dayNum } from '../lib/jalali'
import { isTaskOverdue, riskScore } from '../lib/metrics'
import { uid } from '../lib/api'
import { PRIORITY_ORDER } from '../lib/labels'
import { L } from '../lib/i18n'
import type { Task } from '../lib/types'
import { isWorkday } from '../lib/weeks'
import { CalendarRange, Ban } from 'lucide-react'

const byDue = (a: { due_date: string; priority?: string }, b: { due_date: string; priority?: string }) =>
  (a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : (PRIORITY_ORDER[a.priority as never] ?? 2) - (PRIORITY_ORDER[b.priority as never] ?? 2)

interface Suggestion {
  key: string
  text: string
  action: string
  run: () => void
  tone: 'bad' | 'warn' | 'brand'
}

export default function MyDesk() {
  const { db, me, upsert, toast, canEdit, access } = useStore()
  const { open } = useEditor()
  const pname = useProjectName()
  const today = todayISO()
  const weekEnd = addDays(today, 7)

  // ---------- Quick capture ----------
  const [kind, setKind] = useState<'task' | 'followup'>('task')
  const [text, setText] = useState('')
  const [proj, setProj] = useState('')
  const meM = db.Team.find((m) => m.name === me)
  const [due, setDue] = useState(() => (dueDaysFor(meM) === '' ? -1 : Number(dueDaysFor(meM)) || 0))
  const [who, setWho] = useState('')

  const capture = async () => {
    const t = text.trim()
    if (!t) return
    const dueDate = due < 0 ? '' : addDays(today, due)
    if (kind === 'task') {
      const owner = db.Team.find((m) => m.name === (who || me))
      if (needsProject(owner) && !proj) return toast(L('پروژه را انتخاب کنید', 'Pick a project'), 'err')
      if (needsDue(owner) && due < 0) return toast(L('ددلاین را انتخاب کنید', 'Pick a deadline'), 'err')
      await upsert('Tasks', {
        id: uid('T'), project_id: proj, sprint_id: '', title: t, description: '', assignee: who || me, reporter: me, status: 'todo', priority: 'medium',
        due_date: dueDate, points: 0, tags: '', created_at: today, completed_at: '', track: '', depends_on: '', meeting_id: '', private: '',
      })
      toast(L(`تسک برای ${who || 'شما'} ثبت شد`, `Task added for ${who || 'you'}`))
    } else {
      await upsert('FollowUps', {
        id: uid('F'), project_id: proj, subject: t, person: who, channel: 'meeting', due_date: dueDate, status: 'open', priority: 'medium', notes: '', created_at: today, done_at: '', owner: me,
      })
      toast(L('پیگیری ثبت شد', 'Follow-up added'))
    }
    setText('')
  }

  // ---------- My lists ----------
  const myOpen = db.Tasks.filter((t) => isAssignee(t, me) && !closed(t))
  const myToday = myOpen.filter((t) => t.due_date && t.due_date <= today).sort(byDue)
  const myWeek = myOpen.filter((t) => t.due_date > today && t.due_date <= weekEnd).sort(byDue)
  const myLater = myOpen.filter((t) => !t.due_date || t.due_date > weekEnd).sort(byDue)
  const doneToday = db.Tasks.filter((t) => isAssignee(t, me) && t.status === 'done' && t.completed_at?.slice(0, 10) === today)

  const [tab, setTab] = useState<'today' | 'week' | 'later'>('today')
  const [day, setDay] = useState('')
  const list = day ? myOpen.filter((t) => t.due_date === day).sort(byDue) : tab === 'today' ? myToday : tab === 'week' ? myWeek : myLater

  const fuOpen = db.FollowUps.filter((f) => f.status !== 'done')
  const fuDue = fuOpen.filter((f) => f.status === 'open' && f.due_date <= today).sort(byDue)
  const fuWaiting = fuOpen.filter((f) => f.status === 'waiting').sort(byDue)

  const nudge = useMemo(() => {
    const map = new Map<string, Task[]>()
    db.Tasks.filter((t) => t.assignee && !isAssignee(t, me) && (isTaskOverdue(t) || t.status === 'blocked')).forEach((t) => assigneesOf(t).forEach((a) => map.set(a, [...(map.get(a) || []), t])))
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [db.Tasks, me])

  const copyNudge = (person: string, tasks: Task[]) => {
    const lines = tasks.map((t) => `• ${t.title}${t.project_id ? ` (${pname(t.project_id)})` : ''} — ${t.status === 'blocked' ? L('مسدود', 'blocked') : `${L('سررسید', 'due')} ${fmtDate(t.due_date)}`}`)
    const msg = L(
      `سلام ${person} عزیز،\nلطفاً وضعیت موارد زیر را به‌روز کنید و اگر مانعی هست اطلاع بدهید:\n${lines.join('\n')}\nممنون 🙏`,
      `Hi ${person},\nCould you update the status of the items below and flag any blockers?\n${lines.join('\n')}\nThanks 🙏`,
    )
    navigator.clipboard?.writeText(msg).then(
      () => toast(L('متن یادآوری کپی شد — در پیام‌رسان بچسبانید', 'Reminder copied — paste it in your messenger')),
      () => toast(L('کپی انجام نشد', 'Copy failed'), 'err'),
    )
  }

  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = []
    // a blocker nobody is chasing: offer the follow-up
    db.Tasks.filter((t) => isBlocked(t.status) && !db.FollowUps.some((f) => f.status !== 'done' && f.subject.includes(t.title))).forEach((t) => {
      const who = t.blocked_by || assigneesOf(t)[0] || ''
      out.push({
        key: `blk-${t.id}`, tone: 'bad',
        text: L(`«${t.title}» مسدود است و کسی پیگیرش نیست`, `“${t.title}” is blocked and nobody is chasing it`),
        action: L('ساخت پیگیری', 'Follow up'),
        run: () => open('FollowUps', { project_id: t.project_id, person: who, subject: L(`رفع انسداد: ${t.title}`, `Unblock: ${t.title}`), priority: 'high' }),
      })
    })
    db.Risks.filter((r) => r.status !== 'closed' && riskScore(r) >= 15 && r.due_date && r.due_date < today).forEach((r) =>
      out.push({ key: `rk-${r.id}`, tone: 'bad', text: L(`مهلت اقدام برای ریسک «${r.title}» گذشته است`, `Action date passed for risk “${r.title}”`), action: L('به‌روزرسانی', 'Update'), run: () => open('Risks', r as never) }),
    )
    fuWaiting
      .filter((f) => f.created_at && daysBetween(f.created_at, today) >= 5)
      .forEach((f) =>
        out.push({
          key: `fw-${f.id}`, tone: 'brand',
          text: L(`${fa(daysBetween(f.created_at, today))} روز منتظر «${f.person}» برای «${f.subject}» هستید — وقت اسکالیشن؟`, `Waiting ${daysBetween(f.created_at, today)} days on ${f.person} for “${f.subject}” — escalate?`),
          action: L('باز کردن', 'Open'), run: () => open('FollowUps', f as never),
        }),
      )
    return out.slice(0, 8)
  }, [db, today, open, fuWaiting])

  // ---------- This week's rhythm ----------
  const nextMeeting = db.Meetings.filter((m) => m.status === 'scheduled' && m.date >= today && names(m.attendees).includes(me)).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))[0]
  const scope = can.portfolio(access) ? db.Tasks : db.Tasks.filter((t) => isAssignee(t, me))
  const lateAll = scope.filter((t) => isTaskOverdue(t))
  const blockedAll = scope.filter((t) => isBlocked(t.status))
  const fuDueAll = db.FollowUps.filter((f) => f.status !== 'done' && f.due_date && f.due_date <= today)
  const vc = viewCounts(db.Tasks, me)
  const mzAll = db.Mizito.filter((m) => !mzClosed(m)).map((m) => ({ m, s: mzSignals(db, m) }))
  const mzTop = [...mzAll].sort((a, b) => a.s.p - b.s.p || (a.s.slaLeft ?? 1e9) - (b.s.slaLeft ?? 1e9)).slice(0, 5)
  const mzOpen = mzAll.length
  const mzP0 = mzAll.filter((x) => x.s.p === 0).length
  const mzBreach = mzAll.filter((x) => x.s.breached).length
  const watch = { flagged: vc.flagged, stale: vc.stale, intake: vc.intake, blockedLong: db.Tasks.filter((t) => signals(t).blockedLong).length }
  const myActions = db.Tasks.filter((t) => t.meeting_id && isAssignee(t, me) && !closed(t))

  const first = firstName(me)
  const hello = me ? L(`${greeting()}، ${first} جان`, `${greeting()}, ${first}`) : greeting()
  const overdue = myToday.filter((t) => t.due_date < today).length + fuDue.filter((f) => f.due_date < today).length

  // Focus: the three things that matter most today (overdue critical first).
  const focus = [...myToday, ...myWeek]
    .sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (a.due_date < b.due_date ? -1 : 1))
    .slice(0, 3)
  const dueTodayTotal = myToday.length + doneToday.length
  const dayPct = dueTodayTotal ? Math.round((doneToday.length / dueTodayTotal) * 100) : 100
  const headline = (() => {
    const parts: string[] = []
    if (myToday.length) parts.push(L(`${fa(myToday.length)} کار`, `${myToday.length} task${myToday.length > 1 ? 's' : ''}`))
    if (fuDue.length) parts.push(L(`${fa(fuDue.length)} پیگیری`, `${fuDue.length} follow-up${fuDue.length > 1 ? 's' : ''}`))
    const base = parts.length ? L(`امروز ${parts.join(' و ')} منتظر شماست`, `${parts.join(' and ')} need you today`) : L('امروز کار سررسیدشده‌ای ندارید', 'Nothing is due today')
    return overdue ? `${base}${L(` — ${fa(overdue)} مورد عقب افتاده.`, ` — ${overdue} overdue.`)}` : `${base}.`
  })()

  return (
    <>
      <Band
        eyebrow={<><span>{fmtWeekday(today)}</span><span className="num">{fmtDate(today, 'long')}</span></>}
        title={hello}
        sub={
          <>
            {headline}
          </>
        }
        actions={
          <div className="hidden items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3 @md:flex">
            <Ring value={dayPct} size={64} stroke={6} h={dayPct === 100 ? 'green' : dayPct >= 50 ? 'amber' : undefined} light />
            <div className="text-xs leading-5 text-[#b9c3d6]">
              <div className="text-sm font-semibold text-white">{L('پیشرفت امروز', 'Today’s progress')}</div>
              {L(`${fa(doneToday.length)} از ${fa(dueTodayTotal)} کار امروز`, `${doneToday.length} of ${dueTodayTotal} done`)}
            </div>
          </div>
        }
      >
        <StatStrip
          items={[
            { label: L('تسک امروز و معوق', 'Tasks today & overdue'), value: fa(myToday.length) },
            { label: L('پیگیری سررسیدشده', 'Follow-ups due'), value: fa(fuDue.length), tone: fuDue.length ? 'amber' : undefined },
            { label: L('عقب‌افتاده', 'Overdue'), value: fa(overdue), tone: overdue ? 'red' : 'green' },
            { label: L('منتظر پاسخ دیگران', 'Waiting on others'), value: fa(fuWaiting.length) },
            { label: L('انجام‌شده امروز', 'Done today'), value: fa(doneToday.length), tone: doneToday.length ? 'green' : undefined },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        {canEdit && (
          <div className="card p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={kind} onChange={setKind} options={[{ value: 'task', label: L('تسک', 'Task') }, { value: 'followup', label: L('پیگیری', 'Follow-up') }]} />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && capture()}
                placeholder={kind === 'task' ? L('چه کاری باید انجام شود؟ Enter برای ثبت', 'What needs doing? Press Enter') : L('چه چیزی را از چه کسی پیگیری کنید؟', 'What do you need to chase, and from whom?')}
                className="h-11 min-w-[14rem] flex-1 bg-transparent px-3 text-[0.9375rem] outline-none placeholder:text-sub/70"
              />
              <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted/70 p-1">
                <PersonPicker value={who} onChange={setWho} placeholder={kind === 'task' ? L('خودم', 'Me') : L('با چه کسی؟', 'With whom?')} />
                <ProjectPicker value={proj} onChange={setProj} emptyLabel={canPersonal(db.Team.find((m) => m.name === (who || me))) ? L('شخصی', 'Personal') : undefined} />
                <select value={due} onChange={(e) => setDue(Number(e.target.value))} className="h-8 rounded-full bg-transparent px-2 text-xs outline-none hover:bg-surface">
                  {(kind !== 'task' || !needsDue(db.Team.find((m) => m.name === (who || me)))) && <option value={-1}>{L('بدون ددلاین', 'No deadline')}</option>}
                  <option value={0}>{L('امروز', 'Today')}</option>
                  <option value={1}>{L('فردا', 'Tomorrow')}</option>
                  <option value={3}>{L('۳ روز دیگر', 'In 3 days')}</option>
                  <option value={7}>{L('هفته‌ی بعد', 'Next week')}</option>
                  <option value={14}>{L('دو هفته', 'In 2 weeks')}</option>
                </select>
              </div>
              <button className="btn-primary h-11 px-5" onClick={capture} disabled={!text.trim()}>
                <Send size={15} className="rtl:-scale-x-100" /> {L('ثبت', 'Add')}
              </button>
            </div>
          </div>
        )}

        <div className={cx('grid gap-4', can.cartable(access) && '@3xl:grid-cols-2')}>
          <TodoCard />
          <CartableCard />
        </div>

        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
          <RhythmTile
            to="/meetings"
            icon={CalendarRange}
            label={L('جلسه‌ی بعدی', 'Next meeting')}
            value={nextMeeting ? nextMeeting.title : '—'}
            sub={nextMeeting ? `${nextMeeting.date === today ? L('امروز', 'Today') : fmtWeekday(nextMeeting.date)} ${fa(nextMeeting.time)}${myActions.length ? L(` · ${fa(myActions.length)} اقدام باز شما`, ` · ${myActions.length} open actions`) : ''}` : L('جلسه‌ای در پیش نیست', 'Nothing scheduled')}
          />
          <RhythmTile
            to="/tasks?v=late"
            icon={Hourglass}
            label={L('تسک‌های معوق', 'Overdue tasks')}
            value={fa(lateAll.length)}
            sub={lateAll.length ? lateAll.slice(0, 2).map((t) => t.title).join(L('، ', ', ')) : L('هیچ تسکی عقب نیست', 'Nothing is late')}
            tone={lateAll.length ? 'bad' : undefined}
          />
          <RhythmTile
            to="/tasks?v=blocked"
            icon={Ban}
            label={L('مسدود (Blocker)', 'Blocked')}
            value={fa(blockedAll.length)}
            sub={blockedAll.length ? blockedAll.slice(0, 2).map((t) => t.title).join(L('، ', ', ')) : L('مانعی ثبت نشده', 'No blockers')}
            tone={blockedAll.length ? 'warn' : undefined}
          />
          <RhythmTile
            to="/followups"
            icon={BellRing}
            label={L('پیگیری‌های سررسید', 'Follow-ups due')}
            value={fa(fuDueAll.length)}
            sub={fuDueAll.length ? fuDueAll.slice(0, 2).map((f) => f.person).filter(Boolean).join(L('، ', ', ')) : L('پیگیری عقب‌افتاده‌ای نیست', 'All caught up')}
            tone={fuDueAll.some((f) => f.due_date < today) ? 'warn' : undefined}
          />
        </div>

        {can.portfolio(access) && (watch.flagged + watch.stale + watch.intake + watch.blockedLong > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-xs">
            <span className="font-semibold">{L('زیر نظر', 'Watchlist')}</span>
            {(
              [
                ['flagged', watch.flagged, L('پرچم‌دار', 'flagged'), 'text-warn'],
                ['blocked', watch.blockedLong, L(`مسدود بیش از ${fa(taskCfg().blockedDays)} روز`, `blocked > ${taskCfg().blockedDays}d`), 'text-bad'],
                ['stale', watch.stale, L(`راکد (بی‌تغییر ${fa(taskCfg().staleDays)}+ روز)`, `quiet ${taskCfg().staleDays}+ days`), 'text-sub'],
                ['intake', watch.intake, L('در ورودی، منتظر تصمیم', 'in intake'), 'text-sky-600'],
              ] as const
            )
              .filter(([, n]) => n > 0)
              .map(([v, n, label, tone]) => (
                <Link key={v} to={`/tasks?v=${v}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 transition hover:bg-line">
                  <b className={cx('num', tone)}>{fa(n)}</b> {label}
                </Link>
              ))}
          </div>
        )}

        {can.mizito(access) && mzTop.length > 0 && (
          <Card
            eyebrow={<span className="flex items-center gap-1.5"><AtSign size={12} /> {L('میزیتو', 'Mizito')}</span>}
            title={L(`${fa(mzOpen)} مورد باز${mzP0 ? ` · ${fa(mzP0)} P0` : ''}${mzBreach ? ` · ${fa(mzBreach)} عبور از SLA` : ''}`, `${mzOpen} open${mzP0 ? ` · ${mzP0} P0` : ''}${mzBreach ? ` · ${mzBreach} SLA breached` : ''}`)}
            action={<Link to="/mizito" className="text-xs text-sub hover:text-ink">{L('همه ←', 'All →')}</Link>}
          >
            <ul className="-mx-2 divide-y divide-line">
              {mzTop.map(({ m, s }) => (
                <li key={m.id}>
                  <Link to={`/mizito?id=${m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/60">
                    <PBadge p={s.p} />
                    <span className="min-w-0 flex-1">
                      <span dir={dirOf(m.title)} className="block truncate text-sm">{m.title}</span>
                      <span className="mt-0.5 block"><MzSignals m={m} compact /></span>
                    </span>
                    <span dir={dirOf(m.asked_by)} className="hidden shrink-0 text-[0.6875rem] text-sub sm:inline">{m.asked_by}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-4 @lg:grid-cols-5">
          <Card className="@lg:col-span-3" eyebrow={<span className="flex items-center gap-1.5"><CalendarDays size={12} /> {L('هفته‌ی پیش رو', 'The week ahead')}</span>} title={day ? `${fmtWeekday(day)} ${fmtDate(day, 'long')}` : L('برنامه‌ی ۷ روز آینده', 'Next 7 days')} action={day ? <button className="btn-ghost btn-sm" onClick={() => setDay('')}>{L('همه', 'All')} ×</button> : undefined}>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
                const tasksN = myOpen.filter((t) => t.due_date === d).length + (d === today ? myToday.filter((t) => t.due_date < today).length : 0)
                const fuN = fuOpen.filter((f) => f.due_date === d || (d === today && f.due_date < today && f.status === 'open')).length
                const mtN = db.Meetings.filter((m) => m.date === d && m.status !== 'cancelled' && (m.attendees.includes(me) || m.facilitator === me)).length
                const weekend = !isWorkday(d)
                const sel = day === d
                return (
                  <button
                    key={d}
                    onClick={() => setDay(sel ? '' : d)}
                    className={cx(
                      'group flex flex-col items-center rounded-2xl border px-1 py-3 transition',
                      sel ? 'border-ink bg-ink text-surface shadow-float' : d === today ? 'border-ink/20 bg-ink/[0.03]' : 'border-line hover:border-line-strong hover:bg-muted/50',
                      weekend && !sel && 'opacity-70',
                    )}
                  >
                    <span className={cx('text-[0.6875rem]', sel ? 'text-surface/70' : 'text-sub')}>{d === today ? L('امروز', 'Today') : fmtWeekday(d, true)}</span>
                    <span className="display mt-1 text-2xl num">{fa(dayNum(d))}</span>
                    <span className="mt-2 flex h-2 items-center gap-1">
                      {tasksN > 0 && <span className={cx('h-1.5 rounded-full', sel ? 'bg-surface' : 'bg-ink')} style={{ width: Math.min(18, 4 + tasksN * 3) }} />}
                      {fuN > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
                      {mtN > 0 && <span className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-[#1a73e8]" />}
                    </span>
                    <span className={cx('mt-1.5 text-[0.625rem] num', sel ? 'text-surface/70' : 'text-sub')}>{tasksN + fuN ? fa(tasksN + fuN) : '—'}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[0.6875rem] text-sub">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-ink" /> {L('تسک', 'Tasks')}</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warn" /> {L('پیگیری', 'Follow-ups')}</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-[#1a73e8]" /> {L('جلسه', 'Meeting')}</span>
            </div>
          </Card>

          <Card className="@lg:col-span-2" eyebrow={<span className="flex items-center gap-1.5"><Target size={12} /> {L('تمرکز', 'Focus')}</span>} title={L('سه کار مهم امروز', 'Your top three today')}>
            {focus.length === 0 ? (
              <Empty text={L('کار مهمی باقی نمانده', 'Nothing urgent left')} icon={<Sparkles size={22} />} />
            ) : (
              <ol className="space-y-2">
                {focus.map((t, i) => (
                  <li key={t.id}>
                    <button onClick={() => open('Tasks', t as never)} className="group flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-start transition hover:border-line-strong hover:shadow-card">
                      <span className="display grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-base text-surface num">{fa(i + 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span dir={dirOf(t.title)} className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-sub">
                          <PriorityIcon p={t.priority} /> {pname(t.project_id) || L('بدون پروژه', 'No project')}
                        </span>
                      </span>
                      <Due iso={t.due_date} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="grid gap-4 @xl:grid-cols-5">
          <div className="min-w-0 space-y-4 @xl:col-span-3">
            <Card
              pad={false}
              eyebrow={<span className="flex items-center gap-1.5"><ListChecks size={12} /> {L('کارهای من', 'My work')}</span>}
              title={day ? L(`کارهای ${fmtWeekday(day)}`, `Due ${fmtWeekday(day)}`) : L(`${fa(myOpen.length)} تسک باز`, `${myOpen.length} open tasks`)}
              action={
                <Segmented
                  value={day ? ('' as never) : tab}
                  onChange={(v) => {
                    setTab(v)
                    setDay('')
                  }}
                  options={[
                    { value: 'today', label: `${L('امروز', 'Today')} · ${fa(myToday.length)}` },
                    { value: 'week', label: `${L('این هفته', 'Week')} · ${fa(myWeek.length)}` },
                    { value: 'later', label: `${L('بعداً', 'Later')} · ${fa(myLater.length)}` },
                  ]}
                />
              }
            >
              <div className="px-3 pb-3">
                {list.length === 0 ? <Empty text={tab === 'today' ? L('برای امروز کاری باقی نمانده', 'Nothing left for today') : L('موردی نیست', 'Nothing here')} icon={<Sparkles size={22} />} /> : list.map((t) => <TaskRow key={t.id} t={t} />)}
                {tab === 'today' && doneToday.length > 0 && (
                  <div className="mt-2 border-t border-line pt-2">
                    <div className="eyebrow px-2 pb-1">{L('انجام‌شده امروز', 'Done today')}</div>
                    {doneToday.map((t) => (
                      <TaskRow key={t.id} t={t} dense />
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card pad={false} eyebrow={<span className="flex items-center gap-1.5"><BellRing size={12} /> {L('پیگیری', 'Follow-ups')}</span>} title={L('امروز و معوق', 'Due today & overdue')} action={<Link to="/followups" className="text-xs font-medium text-sub hover:text-ink">{L('همه', 'All')} →</Link>}>
              <div className="px-2 pb-2">{fuDue.length === 0 ? <Empty text={L('پیگیری سررسیدشده‌ای ندارید', 'No follow-ups due')} /> : fuDue.map((f) => <FollowUpRow key={f.id} f={f} />)}</div>
            </Card>

            <Card pad={false} eyebrow={<span className="flex items-center gap-1.5"><Hourglass size={12} /> {L('منتظر', 'Waiting')}</span>} title={L('منتظر پاسخ دیگران', 'Waiting on others')}>
              <div className="px-2 pb-2">{fuWaiting.length === 0 ? <Empty /> : fuWaiting.map((f) => <FollowUpRow key={f.id} f={f} compact />)}</div>
            </Card>
          </div>

          <div className="min-w-0 space-y-4 @xl:col-span-2">
            <section className="relative overflow-hidden rounded-2xl bg-band p-5 text-on-band shadow-card">
              <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-[#1D4F61]/60 blur-3xl" />
              <div className="relative">
                <div className="eyebrow !text-band-sub flex items-center gap-1.5">
                  <Lightbulb size={12} /> {L('دستیار', 'Assistant')}
                </div>
                <h3 className="mt-1 text-[0.9375rem] font-semibold">{L('پیشنهادهای امروز', 'Today’s suggestions')}</h3>
                {suggestions.length === 0 ? (
                  <p className="mt-4 text-sm text-band-sub">{L('همه‌چیز مرتب است.', 'All clear.')}</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {suggestions.map((s) => (
                      <div key={s.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                        <span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', s.tone === 'bad' ? 'bg-[#ff8a9a]' : s.tone === 'warn' ? 'bg-[#f5c565]' : 'bg-[#C1D6DE]')} />
                        <div dir={dirOf(s.text)} className="flex-1 text-[0.8125rem] leading-6 text-white/85">{s.text}</div>
                        {canEdit && (
                          <button className="btn h-7 shrink-0 bg-white px-3 text-[0.6875rem] text-band" onClick={s.run}>
                            {s.action}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <Card eyebrow={<span className="flex items-center gap-1.5"><UserCheck size={12} /> {L('یادآوری به تیم', 'Team nudges')}</span>} title={L('از چه کسی پیگیری کنم؟', 'Who should I nudge?')}>
              {nudge.length === 0 ? (
                <Empty text={L('هیچ تسک معوق یا مسدودی در تیم نیست', 'No overdue or blocked work on the team')} />
              ) : (
                <div className="space-y-2.5">
                  {nudge.map(([person, tasks]) => (
                    <div key={person} className="rounded-2xl border border-line p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={person} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{person}</div>
                          <div className="text-[0.6875rem] text-sub">
                            {L(`${fa(tasks.filter(isTaskOverdue).length)} معوق · ${fa(tasks.filter((t) => t.status === 'blocked').length)} مسدود`, `${tasks.filter(isTaskOverdue).length} overdue · ${tasks.filter((t) => t.status === 'blocked').length} blocked`)}
                          </div>
                        </div>
                        <button className="btn-outline btn-sm" onClick={() => copyNudge(person, tasks)}>
                          <Copy size={13} /> {L('پیام', 'Message')}
                        </button>
                      </div>
                      <ul className="mt-2.5 space-y-1">
                        {tasks.slice(0, 4).map((t) => (
                          <li key={t.id}>
                            <button onClick={() => open('Tasks', t as never)} className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-start text-xs hover:bg-muted">
                              <span className={cx('h-1.5 w-1.5 rounded-full', t.status === 'blocked' ? 'bg-bad' : 'bg-warn')} />
                              <span dir={dirOf(t.title)} className="flex-1 truncate">{t.title}</span>
                              {t.status === 'blocked' ? <Chip className="bg-bad/10 text-bad">{L('مسدود', 'Blocked')}</Chip> : <span className="text-bad num">{L(`${fa(-daysFromToday(t.due_date))} روز`, `${-daysFromToday(t.due_date)}d`)}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </Overlap>
    </>
  )
}

const names = (s: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)

function RhythmTile({ to, icon: Icon, label, value, sub, tone }: { to: string; icon: typeof Ban; label: string; value: string; sub: string; tone?: 'bad' | 'warn' }) {
  return (
    <Link to={to} className="card card-hover group flex min-w-0 flex-col gap-1 p-4">
      <span className="flex items-center gap-1.5 text-[0.6875rem] text-sub">
        <Icon size={13} /> {label}
      </span>
      <span className={cx('truncate text-lg font-semibold num', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : '')}>{value}</span>
      <span className="truncate text-[0.6875rem] text-sub">{sub}</span>
    </Link>
  )
}
