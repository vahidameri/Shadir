// Sprints (Jira-style) for the teams that work in them: the running sprint's board, the backlog with
// planned sprints (plan, start), and reports (velocity, past sprints). Each sprint has its own report
// page (SprintReport) that doubles as the CPTO's view.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, Pencil, Play, Plus, Settings2, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, Progress, StatStrip, Tabs, cx } from '../components/ui'
import { Kanban } from '../components/widgets'
import { Burndown, CompleteSprint, Velocity, WorkRow } from '../components/SprintParts'
import { teamName } from '../components/TeamParts'
import { L } from '../lib/i18n'
import { fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { uid } from '../lib/api'
import { nowStamp } from '../lib/taskstamp'
import { SPRINT_LABEL, activeSprint, avgVelocity, backlogOf, nextSprintDraft, plannedSprints, pts, sprintCfg, sprintStats, sprintsOf, velocity } from '../lib/sprints'
import { PRIORITY_ORDER } from '../lib/labels'
import type { Sprint, Task } from '../lib/types'

type Tab = 'board' | 'backlog' | 'reports'

export default function Sprints() {
  const { db, canEdit, access, upsert, toast, me } = useStore()
  const { open } = useEditor()
  const [params, setParams] = useSearchParams()
  const teams = sprintCfg().teams
  const team = params.get('team') && teams.includes(params.get('team')!) ? params.get('team')! : teams[0] || ''
  const tab = (params.get('tab') as Tab) || 'board'
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    n.set(k, v)
    setParams(n, { replace: true })
  }
  const [closing, setClosing] = useState<Sprint | null>(null)
  const [quick, setQuick] = useState('')

  if (!team) {
    return (
      <>
        <Band title={L('اسپرینت‌ها', 'Sprints')} />
        <Overlap>
          <div className="card p-6">
            <Empty icon={<Zap size={22} />} text={L('هیچ تیمی با اسپرینت کار نمی‌کند. در تنظیمات، تیم‌هایی را که اسپرینت دارند انتخاب کنید.', 'No team works in sprints yet. Pick the sprint teams in settings.')} action={access === 'super' ? <Link to="/admin?tab=settings" className="btn-outline btn-sm"><Settings2 size={14} /> {L('تنظیمات', 'Settings')}</Link> : undefined} />
          </div>
        </Overlap>
      </>
    )
  }

  const active = activeSprint(db, team)
  const st = active ? sprintStats(db, active) : null
  const planned = plannedSprints(db, team)
  const live = sprintsOf(db, team).filter((s) => s.status !== 'closed')
  const vel = avgVelocity(db, team)
  const backlog = backlogOf(db, team).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.created_at < b.created_at ? -1 : 1))
  const move = (t: Task, sprintId: string) => upsert('Tasks', { ...t, sprint_id: sprintId })
  const start = async (s: Sprint) => {
    if (active) return toast(L(`اول «${active.name}» را ببندید`, `Complete “${active.name}” first`), 'err')
    const total = sprintStats(db, s).total
    await upsert('Sprints', { ...s, status: 'active', started_at: nowStamp(), committed_points: total, start_date: s.start_date || todayISO() })
    toast(L(`${s.name} شروع شد · تعهد ${fa(total)} امتیاز`, `${s.name} started · ${total} points committed`))
    set('tab', 'board')
  }
  const addQuick = async () => {
    const title = quick.trim()
    if (!title) return
    await upsert('Tasks', {
      id: uid('T'), project_id: '', sprint_id: '', title, description: '', assignee: '', reporter: me, status: 'todo', priority: 'medium', due_date: '', points: 0, tags: '',
      created_at: todayISO(), completed_at: '', track: team, depends_on: '', meeting_id: '', issue_type: 'story',
    } as unknown as Task)
    setQuick('')
  }

  return (
    <>
      <Band
        eyebrow={<span className="flex items-center gap-1.5"><Zap size={12} /> {teamName(team)}</span>}
        title={L('اسپرینت‌ها', 'Sprints')}
        sub={active ? <>{active.name}{active.goal && ` — ${active.goal}`}</> : L('اسپرینت فعالی نیست؛ از بک‌لاگ یکی را شروع کنید.', 'No sprint running; start one from the backlog.')}
        actions={
          <>
            {teams.length > 1 && (
              <select value={team} onChange={(e) => set('team', e.target.value)} className="h-10 rounded-full border border-white/15 bg-white/10 px-3 text-sm text-white">
                {teams.map((t) => <option key={t} value={t} className="text-ink">{teamName(t)}</option>)}
              </select>
            )}
            {active && <Link to={`/sprints/${active.id}`} className="btn h-10 border border-white/15 text-white hover:bg-white/10"><BarChart3 size={15} /> {L('گزارش اسپرینت', 'Sprint report')}</Link>}
            {canEdit && <button className="btn h-10 bg-white text-band" onClick={() => open('Sprints', nextSprintDraft(db, team))}><Plus size={16} /> {L('اسپرینت جدید', 'New sprint')}</button>}
          </>
        }
      >
        <StatStrip
          items={
            st && active
              ? [
                  { label: L('روز مانده', 'Days left'), value: fa(st.daysLeft), sub: `${fmtDayMonth(active.start_date)} → ${fmtDayMonth(active.end_date)}`, tone: st.daysLeft <= 2 && st.pct < 80 ? 'amber' : undefined },
                  { label: L('تعهد (امتیاز)', 'Committed (pts)'), value: fa(st.committed) },
                  { label: L('انجام‌شده', 'Done'), value: fa(st.done), sub: L(`${fa(st.pct)}٪`, `${st.pct}%`), tone: st.pct >= st.elapsed - 10 ? 'green' : 'amber' },
                  { label: L('باقی‌مانده', 'Remaining'), value: fa(st.remaining) },
                  { label: L('اضافه‌شده بعد از شروع', 'Added after start'), value: `+${fa(st.added.points)}`, sub: L(`${fa(st.added.tasks.length)} کار`, `${st.added.tasks.length} items`), tone: st.added.points ? 'amber' : 'muted' },
                  { label: L('مسدود', 'Blocked'), value: fa(st.blocked.length), tone: st.blocked.length ? 'red' : 'green' },
                ]
              : [
                  { label: L('بک‌لاگ', 'Backlog'), value: fa(backlog.length), sub: L(`${fa(backlog.reduce((a, t) => a + pts(t), 0))} امتیاز`, `${backlog.reduce((a, t) => a + pts(t), 0)} pts`) },
                  { label: L('اسپرینت برنامه‌ریزی‌شده', 'Planned sprints'), value: fa(planned.length) },
                  { label: L('سرعت میانگین', 'Average velocity'), value: vel ? fa(vel) : '—', sub: L('سه اسپرینت آخر', 'last three sprints') },
                ]
          }
        />
      </Band>
      <Overlap>
        <div className="card overflow-hidden">
          <div className="px-3">
            <Tabs
              value={tab}
              onChange={(v) => set('tab', v)}
              tabs={[
                { value: 'board', label: L('بورد اسپرینت', 'Sprint board'), count: st?.tasks.length },
                { value: 'backlog', label: L('بک‌لاگ و برنامه‌ریزی', 'Backlog & planning'), count: backlog.length },
                { value: 'reports', label: L('گزارش‌ها', 'Reports') },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 fade-in" key={tab}>
          {tab === 'board' &&
            (active && st ? (
              <div className="space-y-4">
                <div className="grid gap-4 @xl:grid-cols-[1fr_22rem]">
                  <Card eyebrow={`${active.name} · ${L(SPRINT_LABEL.active[0], SPRINT_LABEL.active[1])}`} title={active.goal || L('هدف اسپرینت ثبت نشده', 'No sprint goal')} action={canEdit && (
                    <span className="flex gap-2">
                      <button className="btn-outline btn-sm" onClick={() => open('Sprints', active as never)}><Pencil size={13} /> {L('ویرایش', 'Edit')}</button>
                      <button className="btn-primary btn-sm" onClick={() => setClosing(active)}>{L('بستن اسپرینت', 'Complete sprint')}</button>
                    </span>
                  )}>
                    <div className="mb-1.5 flex justify-between text-xs text-sub">
                      <span>{L(`${fa(st.done)} از ${fa(st.total)} امتیاز انجام شد`, `${st.done} of ${st.total} points done`)}</span>
                      <span>{L(`${fa(st.elapsed)}٪ از زمان اسپرینت`, `${st.elapsed}% of the sprint`)}</span>
                    </div>
                    <Progress value={st.pct} marker={st.elapsed} className="h-2" />
                    {st.unestimated > 0 && <div className="mt-2 text-xs text-warn">{L(`${fa(st.unestimated)} کار بدون امتیاز`, `${st.unestimated} items without points`)}</div>}
                  </Card>
                  <Card eyebrow={L('برن‌داون', 'Burndown')}>
                    <Burndown s={active} height={140} />
                  </Card>
                </div>
                <Kanban tasks={st.tasks} defaults={{ sprint_id: active.id, track: team, issue_type: 'story' }} />
              </div>
            ) : (
              <div className="card p-6">
                <Empty icon={<Zap size={22} />} text={L('اسپرینت فعالی نیست.', 'No sprint is running.')} action={<button className="btn-outline btn-sm" onClick={() => set('tab', 'backlog')}>{L('رفتن به بک‌لاگ', 'Go to the backlog')}</button>} />
              </div>
            ))}

          {tab === 'backlog' && (
            <div className="space-y-4">
              {[...(active ? [active] : []), ...planned].map((s) => {
                const ss = sprintStats(db, s)
                const over = vel > 0 && ss.total > vel * 1.2
                return (
                  <section key={s.id} className="card overflow-hidden">
                    <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                      <span className={cx('rounded-full px-2 py-0.5 text-[0.6875rem]', s.status === 'active' ? 'bg-ink text-surface' : 'bg-muted text-sub')}>{L(SPRINT_LABEL[s.status][0], SPRINT_LABEL[s.status][1])}</span>
                      <Link to={`/sprints/${s.id}`} className="font-semibold hover:underline">{s.name}</Link>
                      <span className="text-xs text-sub num">{fmtDayMonth(s.start_date)} → {fmtDayMonth(s.end_date)}</span>
                      {s.goal && <span className="truncate text-xs text-sub">· {s.goal}</span>}
                      <span className={cx('ms-auto text-xs num', over ? 'text-warn' : 'text-sub')}>
                        {L(`${fa(ss.tasks.length)} کار · ${fa(ss.total)} امتیاز`, `${ss.tasks.length} items · ${ss.total} pts`)}
                        {vel > 0 && L(` · سرعت معمول ${fa(vel)}`, ` · usual velocity ${vel}`)}
                      </span>
                      {canEdit && <button className="icon-btn h-8 w-8" onClick={() => open('Sprints', s as never)} aria-label={L('ویرایش', 'Edit')}><Pencil size={13} /></button>}
                      {canEdit && s.status === 'planned' && <button className="btn-primary btn-sm" disabled={!!active} title={active ? L('یک اسپرینت در جریان است', 'A sprint is running') : undefined} onClick={() => start(s)}><Play size={13} /> {L('شروع اسپرینت', 'Start sprint')}</button>}
                    </header>
                    {ss.tasks.length ? <div className="divide-y divide-line">{ss.tasks.map((t) => <WorkRow key={t.id} t={t} sprints={live} onMove={(id) => move(t, id)} />)}</div> : <div className="px-4 py-4 text-xs text-sub">{L('کاری در این اسپرینت نیست؛ از بک‌لاگ اضافه کنید.', 'Nothing in this sprint yet; add from the backlog.')}</div>}
                  </section>
                )
              })}
              <section className="card overflow-hidden">
                <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                  <span className="font-semibold">{L('بک‌لاگ', 'Backlog')}</span>
                  <span className="text-xs text-sub num">{L(`${fa(backlog.length)} کار · ${fa(backlog.reduce((a, t) => a + pts(t), 0))} امتیاز`, `${backlog.length} items · ${backlog.reduce((a, t) => a + pts(t), 0)} pts`)}</span>
                  {canEdit && (
                    <form className="ms-auto flex min-w-[18rem] flex-1 gap-2 sm:flex-none" onSubmit={(e) => (e.preventDefault(), addQuick())}>
                      <input className="input h-9 flex-1 text-sm" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={L('استوری یا کار جدید… (Enter)', 'New story or item… (Enter)')} />
                      <button className="btn-outline btn-sm h-9" disabled={!quick.trim()}><Plus size={13} /></button>
                    </form>
                  )}
                </header>
                {backlog.length ? <div className="divide-y divide-line">{backlog.map((t) => <WorkRow key={t.id} t={t} sprints={live} onMove={(id) => move(t, id)} />)}</div> : <div className="px-4 py-6 text-center text-xs text-sub">{L('بک‌لاگ خالی است', 'The backlog is empty')}</div>}
              </section>
            </div>
          )}

          {tab === 'reports' && (
            <div className="grid gap-4 @xl:grid-cols-2">
              <Card eyebrow={L('سرعت تیم', 'Velocity')} title={L('تعهد در برابر انجام‌شده', 'Committed vs completed')}>
                <Velocity rows={velocity(db, team, 8)} />
              </Card>
              <Card pad={false} eyebrow={L('سابقه', 'History')} title={L('اسپرینت‌های بسته‌شده', 'Completed sprints')}>
                <ul className="divide-y divide-line border-t border-line">
                  {sprintsOf(db, team).filter((s) => s.status === 'closed').reverse().map((s) => {
                    const c = Number(s.committed_points) || 0
                    const d = Number(s.completed_points) || 0
                    return (
                      <li key={s.id}>
                        <Link to={`/sprints/${s.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/50">
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-sub num">{fmtDayMonth(s.start_date)} → {fmtDayMonth(s.end_date)}</span>
                          <span className="ms-auto text-xs num">{fa(d)}/{fa(c)}</span>
                          <span className={cx('w-12 text-end text-xs font-medium num', c && d / c < 0.7 ? 'text-warn' : 'text-good')}>{c ? `${fa(Math.round((d / c) * 100))}٪` : '—'}</span>
                        </Link>
                      </li>
                    )
                  })}
                  {!sprintsOf(db, team).some((s) => s.status === 'closed') && <li className="px-5 py-6 text-center text-xs text-sub">{L('هنوز اسپرینتی بسته نشده', 'No completed sprints yet')}</li>}
                </ul>
              </Card>
            </div>
          )}
        </div>
      </Overlap>
      {closing && <CompleteSprint s={closing} onClose={() => setClosing(null)} />}
    </>
  )
}
