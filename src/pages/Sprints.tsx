import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, Progress, cx, Chip, MenuItem, Popover } from '../components/ui'
import { BurndownChart, Kanban, SprintHeader, VelocityChart } from '../components/widgets'
import { sprintCommitted, sprintDonePoints, sprintTasks } from '../lib/metrics'
import { daysBetween, daysFromToday, fa, todayISO } from '../lib/jalali'
import { SPRINT_STATUS } from '../lib/labels'
import { L, lbl } from '../lib/i18n'

export default function Sprints() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const active = db.Sprints.filter((s) => s.status === 'active')
  const [sel, setSel] = useState(active[0]?.id || db.Sprints[0]?.id || '')
  const sprint = db.Sprints.find((s) => s.id === sel)
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  const all = [...db.Sprints].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  return (
    <>
      <Band nav={<HubNav hub="plan" />}
        title={L('اسپرینت‌ها', 'Sprints')}
        sub={L(`${fa(active.length)} اسپرینت فعال در ${fa(new Set(active.map((s) => s.project_id)).size)} پروژه`, `${active.length} active sprints across ${new Set(active.map((s) => s.project_id)).size} projects`)}
        actions={
          canEdit && (
            <button className="btn h-10 bg-white text-band" onClick={() => open('Sprints')}>
              <Plus size={16} /> {L('اسپرینت جدید', 'New sprint')}
            </button>
          )
        }
      />
      <Overlap className="space-y-4">
        <div className="grid gap-3 @md:grid-cols-2 @xl:grid-cols-3">
          {active.map((s) => {
            const c = sprintCommitted(s, db)
            const d = sprintDonePoints(s, db)
            const pct = c ? Math.round((d / c) * 100) : 0
            const timePct = Math.round((Math.max(0, daysBetween(s.start_date, todayISO())) / Math.max(1, daysBetween(s.start_date, s.end_date))) * 100)
            const behind = pct < timePct - 25
            const blocked = sprintTasks(s, db).filter((t) => t.status === 'blocked').length
            return (
              <button key={s.id} onClick={() => setSel(s.id)} className={cx('card card-hover p-5 text-start', sel === s.id && 'ring-2 ring-ink')}>
                <div className="flex items-center justify-between">
                  <div className="eyebrow truncate">{pname(s.project_id)}</div>
                  <span className={cx('text-[0.6875rem]', daysFromToday(s.end_date) <= 2 ? 'font-semibold text-warn' : 'text-sub')}>{L(`${fa(Math.max(0, daysFromToday(s.end_date)))} روز مانده`, `${Math.max(0, daysFromToday(s.end_date))}d left`)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Zap size={16} className="text-brand" />
                  <span className="text-lg font-semibold">{s.name}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-sub">{s.goal}</div>
                <div className="mt-5 flex items-end justify-between">
                  <span className="display text-3xl num">
                    {fa(pct)}
                    <span className="text-base text-sub">%</span>
                  </span>
                  <span className="text-xs text-sub num">{fa(d)} / {fa(c)} {L('امتیاز', 'pts')}</span>
                </div>
                <Progress value={pct} marker={timePct} h={behind ? 'red' : pct >= timePct ? 'green' : 'amber'} className="mt-2" />
                {blocked > 0 && <div className="mt-3 text-[0.6875rem] text-bad">{L(`${fa(blocked)} تسک مسدود`, `${blocked} blocked`)}</div>}
              </button>
            )
          })}
          {!active.length && (
            <div className="card @md:col-span-3">
              <Empty text={L('اسپرینت فعالی وجود ندارد', 'No active sprints')} />
            </div>
          )}
        </div>

        {sprint && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Popover
                width={320}
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="chip-btn h-10 px-4 text-sm">
                    {pname(sprint.project_id)} — <b>{sprint.name}</b> ▾
                  </button>
                )}
              >
                {(close) => (
                  <div className="max-h-80 overflow-y-auto">
                    {all.map((s) => (
                      <MenuItem
                        key={s.id}
                        active={s.id === sel}
                        hint={lbl(SPRINT_STATUS, s.status)}
                        onClick={() => {
                          setSel(s.id)
                          close()
                        }}
                      >
                        {pname(s.project_id)} — {s.name}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
              <Link to={`/projects/${sprint.project_id}`} className="btn-ghost btn-sm">
                {L('مشاهده‌ی پروژه', 'Open project')} →
              </Link>
              {canEdit && (
                <button className="btn-ghost btn-sm" onClick={() => open('Sprints', sprint as never)}>
                  {L('ویرایش اسپرینت', 'Edit sprint')}
                </button>
              )}
            </div>
            <div className="grid gap-4 @xl:grid-cols-2">
              <Card eyebrow="Burndown" title={<SprintHeader s={sprint} db={db} />}>
                <BurndownChart sprint={sprint} db={db} />
              </Card>
              <Card eyebrow="Velocity" title={pname(sprint.project_id)}>
                <VelocityChart sprints={db.Sprints.filter((s) => s.project_id === sprint.project_id)} db={db} />
              </Card>
            </div>
            <Card eyebrow={L('بورد', 'Board')} title={L('بورد اسپرینت', 'Sprint board')} pad={false}>
              <div className="px-4 pb-4">
                <Kanban tasks={sprintTasks(sprint, db)} defaults={{ project_id: sprint.project_id, sprint_id: sprint.id }} showProject={false} />
              </div>
            </Card>
          </>
        )}

        <Card eyebrow={L('تاریخچه', 'History')} title={L('همه‌ی اسپرینت‌ها', 'All sprints')} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[47.5rem]">
              <thead className="border-y border-line">
                <tr>
                  <th className="th">{L('پروژه', 'Project')}</th>
                  <th className="th">{L('اسپرینت', 'Sprint')}</th>
                  <th className="th">{L('هدف', 'Goal')}</th>
                  <th className="th">{L('وضعیت', 'Status')}</th>
                  <th className="th">{L('تعهد', 'Committed')}</th>
                  <th className="th">{L('تحویل', 'Delivered')}</th>
                  <th className="th">{L('نرخ تحقق', 'Say/do')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {all.map((s) => {
                  const c = sprintCommitted(s, db)
                  const d = sprintDonePoints(s, db)
                  const r = c ? Math.round((d / c) * 100) : 0
                  return (
                    <tr key={s.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => setSel(s.id)}>
                      <td className="td text-sub">{pname(s.project_id)}</td>
                      <td className="td font-medium">{s.name}</td>
                      <td className="td max-w-xs truncate text-sub">{s.goal}</td>
                      <td className="td">
                        <Chip className={s.status === 'active' ? 'bg-ink text-surface' : ''}>{lbl(SPRINT_STATUS, s.status)}</Chip>
                      </td>
                      <td className="td num">{fa(c)}</td>
                      <td className="td num">{fa(d)}</td>
                      <td className={cx('td font-semibold num', s.status === 'closed' && r < 80 ? 'text-bad' : s.status === 'closed' ? 'text-good' : '')}>{fa(`${r}%`)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Overlap>
    </>
  )
}
