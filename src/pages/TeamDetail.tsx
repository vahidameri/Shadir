// One team: its health and numbers, its people (with what each has open), its products and projects,
// this quarter's OKRs, and its tasks by what needs attention first.
import { MoreButton, usePaged } from '../components/Paged'
import { dirOf } from '../lib/dir'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Plus, Target, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Avatar, Band, Card, Empty, HealthDot, Overlap, Progress, Segmented, StatStrip, cx } from '../components/ui'
import { L, lbl, tr } from '../lib/i18n'
import { fa } from '../lib/jalali'
import { TRACKS } from '../lib/tracks'
import { JOB_TITLE } from '../lib/labels'
import { teamStats } from '../lib/teams'
import { catOf, closed } from '../lib/columns'
import { signals } from '../lib/signals'
import { projectMetrics } from '../lib/metrics'
import { assigneesOf } from '../lib/assignees'
import { CONF, krConfidence, krProgress, krsOf, quarterLabel, quarterOf, teamOkr } from '../lib/okr'
import { CatBar, teamName } from '../components/TeamParts'
import { TaskRow } from '../components/shared'
import { TeamMove } from '../components/TeamMove'
import type { Task } from '../lib/types'

type View = 'attention' | 'open' | 'done'

export default function TeamDetail() {
  const { id = '' } = useParams()
  const team = id === '-' ? '' : id
  const { db, access, canEdit, upsert, toast } = useStore()
  const [adding, setAdding] = useState('')
  // who is in which team is set here (or in the back office); the Teams page counts people by it
  const setTeam = async (id: string, track: string) => {
    const m = db.Team.find((x) => x.id === id)
    if (!m) return
    await upsert('Team', { ...m, track })
    toast(track ? L(`${m.name} به ${teamName(track)} اضافه شد`, `${m.name} added`) : L(`${m.name} از این تیم برداشته شد`, `${m.name} removed`))
  }
  const { open } = useEditor()
  const [view, setView] = useState<View>('attention')
  const s = useMemo(() => teamStats(db, team), [db, team])
  const q = quarterOf()
  const okr = useMemo(() => teamOkr(db, team, q, s.tasks), [db, team, q, s.tasks])
  const defined = !team || TRACKS.includes(team)

  const openTasks = s.tasks.filter((t) => !closed(t))
  const sig = new Map(openTasks.map((t) => [t.id, signals(t)]))
  const rank = (t: Task) => {
    const x = sig.get(t.id)
    return catOf(t.status) === 'blocked' ? 0 : x?.late ? 1 : x?.blockedLong ? 2 : catOf(t.status) === 'waiting' ? 3 : x?.stale ? 4 : 5
  }
  const byDue = (a: Task, b: Task) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1
  const list =
    view === 'attention'
      ? openTasks.filter((t) => rank(t) < 5).sort((a, b) => rank(a) - rank(b) || byDue(a, b))
      : view === 'open'
        ? [...openTasks].sort(byDue)
        : s.tasks.filter((t) => catOf(t.status) === 'done').sort((a, b) => String(b.completed_at || '') < String(a.completed_at || '') ? -1 : 1).slice(0, 40)

  const paged = usePaged([{ rows: list }], 60, [view, team])
  if (team && !defined && !s.tasks.length && !s.projects.length && !db.Team.some((m) => m.track === team)) return <Empty text={L('این تیم پیدا نشد', 'Team not found')} />

  const members = db.Team.filter((m) => m.track === team && String(m.active) !== 'false').map((m) => {
    const mine = openTasks.filter((t) => assigneesOf(t).includes(m.name))
    return { m, open: mine.length, late: mine.filter((t) => sig.get(t.id)?.late).length, blocked: mine.filter((t) => catOf(t.status) === 'blocked').length }
  })

  return (
    <>
      <Band
        eyebrow={
          <Link to="/teams" className="inline-flex items-center gap-1 hover:underline">
            <ArrowRight size={12} className="ltr:rotate-180" /> {L('تیم‌ها', 'Teams')}
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-3">
            {teamName(team)} <HealthDot h={s.health} pulse />
          </span>
        }
        sub={L(`${fa(s.projects.length)} محصول/پروژه · ${fa(members.length)} نفر`, `${s.projects.length} projects · ${members.length} people`)}
        actions={
          canEdit && team ? (
            <button className="btn h-10 bg-white text-band" onClick={() => open('Tasks', { track: team })}>
              <Plus size={16} /> {L('تسک برای این تیم', 'Task for this team')}
            </button>
          ) : undefined
        }
      >
        <StatStrip
          items={[
            { label: L('تسک باز', 'Open'), value: fa(s.open) },
            { label: L('معوق', 'Overdue'), value: fa(s.late), tone: s.late ? 'red' : 'green' },
            { label: L('مسدود', 'Blocked'), value: fa(s.blocked), tone: s.blocked ? 'amber' : 'green' },
            { label: L('در انتظار', 'Waiting'), value: fa(s.byCat.waiting) },
            { label: L('راکد', 'Quiet'), value: fa(s.stale), tone: s.stale ? 'amber' : 'green' },
            { label: L('انجام‌شده (۲ هفته)', 'Done (2 weeks)'), value: fa(s.doneRecent), tone: 'green' },
          ]}
        />
      </Band>
      <Overlap>
        {!defined && access === 'super' && (
          <div className="card mb-4 p-4">
            <div className="mb-2 text-sm font-medium">{L('این تیم در بک‌آفیس تعریف نشده (یا حذف شده) ولی هنوز کار به آن وصل است', 'This team is not defined in the back office but still has work')}</div>
            <TeamMove from={team} />
          </div>
        )}
        <div className="grid gap-4 @xl:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-4">
            <Card>
              <CatBar by={s.byCat} legend />
            </Card>
            <Card
              title={L('تسک‌ها', 'Tasks')}
              action={
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'attention', label: L(`نیازمند توجه (${fa(openTasks.filter((t) => rank(t) < 5).length)})`, 'Needs attention') },
                    { value: 'open', label: L(`همه‌ی باز (${fa(openTasks.length)})`, 'All open') },
                    { value: 'done', label: L('انجام‌شده', 'Done') },
                  ]}
                />
              }
            >
              {list.length ? (
                <div className="divide-y divide-line">{paged.groups[0].shown.map((t) => <TaskRow key={t.id} t={t} />)}</div>
              ) : (
                <Empty text={view === 'attention' ? L('چیزی معوق، مسدود یا راکد نیست', 'Nothing late, blocked or quiet') : L('تسکی نیست', 'No tasks')} />
              )}
              <MoreButton hidden={paged.hidden} step={paged.step} onMore={paged.more} noun={['تسک', 'tasks']} />
              <Link to={`/tasks?track=${team}`} className="mt-3 inline-block text-xs text-brand hover:underline">{L('همه در صفحه‌ی تسک‌ها ←', 'All on the Tasks page →')}</Link>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card
              title={L('افراد', 'People')}
              action={
                canEdit && access === 'super' && team ? (
                  <select
                    value={adding}
                    onChange={(e) => {
                      const id = e.target.value
                      setAdding('')
                      if (id) void setTeam(id, team)
                    }}
                    className="input h-8 w-auto text-xs"
                    aria-label={L('افزودن نفر', 'Add a person')}
                  >
                    <option value="">{L('+ افزودن نفر', '+ Add a person')}</option>
                    {db.Team.filter((m) => m.track !== team && String(m.active) !== 'false').map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.track ? ` (${L('الان', 'now')}: ${teamName(m.track)})` : ''}
                      </option>
                    ))}
                  </select>
                ) : undefined
              }
            >
              {members.length ? (
                <ul className="space-y-1">
                  {members.map(({ m, open: n, late, blocked }) => (
                    <li key={m.id}>
                      <Link to={`/people/${m.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-muted/60">
                        <Avatar name={m.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm" dir={dirOf(m.name)}>{m.name}</span>
                          <span className="block text-[0.6875rem] text-sub">{lbl(JOB_TITLE, m.role) || m.role}</span>
                        </span>
                        <span className="num shrink-0 text-xs text-sub">
                          {fa(n)} {L('باز', 'open')}
                          {late > 0 && <b className="ms-1.5 text-bad">{fa(late)} {L('معوق', 'late')}</b>}
                          {blocked > 0 && <b className="ms-1.5 text-bad">{fa(blocked)} {L('مسدود', 'blocked')}</b>}
                        </span>
                        {canEdit && access === 'super' && (
                          <button
                            className="icon-btn h-7 w-7 shrink-0 text-sub hover:text-bad"
                            title={L('برداشتن از این تیم', 'Remove from this team')}
                            aria-label={L('برداشتن از این تیم', 'Remove from this team')}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              void setTeam(m.id, '')
                            }}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-sub">{L('کسی در این تیم نیست', 'Nobody in this team')}</div>
              )}
            </Card>

            <Card title={L('محصولات و پروژه‌ها', 'Products & projects')}>
              {s.projects.length ? (
                <ul className="space-y-1">
                  {s.projects.map((p) => {
                    const pm = projectMetrics(p, db)
                    return (
                      <li key={p.id}>
                        <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/60">
                          <HealthDot h={pm.health} />
                          <span className="min-w-0 flex-1 truncate text-sm" dir={dirOf(p.name)}>{p.name}</span>
                          <span className="w-16 shrink-0"><Progress value={pm.progress} /></span>
                          <span className="num w-9 text-end text-xs text-sub">{fa(pm.progress)}٪</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="text-xs text-sub">{L('هنوز محصول یا پروژه‌ای زیر این تیم نیست', 'No products or projects yet')}</div>
              )}
            </Card>

            {team && (
              <Card eyebrow={<span className="inline-flex items-center gap-1.5"><Target size={12} /> OKR {quarterLabel(q)}</span>} title={okr.objectives.length ? `${fa(okr.progress)}٪` : L('هدفی تعریف نشده', 'No objectives')} action={<Link to="/okr" className="text-xs text-brand hover:underline">{L('صفحه‌ی OKR', 'OKR page')}</Link>}>
                <ul className="space-y-3">
                  {okr.objectives.map((o) => (
                    <li key={o.id}>
                      <div className="text-sm font-medium" dir={dirOf(o.title)}>{o.title}</div>
                      <ul className="mt-1 space-y-1">
                        {krsOf(db, o.id).map((k) => {
                          const c = CONF[krConfidence(k, q)]
                          return (
                            <li key={k.id} className="flex items-center gap-2 text-xs">
                              <span className="min-w-0 flex-1 truncate text-sub" dir={dirOf(k.title)}>{k.title}</span>
                              <span className={cx('shrink-0', c.tone)}>{tr(c.label)}</span>
                              <span className="num w-9 shrink-0 text-end">{fa(krProgress(k))}٪</span>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </Overlap>
    </>
  )
}
