import { assigneesOf, isAssignee, joinNames, leadAssignee } from '../lib/assignees'
import { useMemo, useState } from 'react'
import { canPersonal } from '../lib/taskcfg'
import { useSearchParams } from 'react-router-dom'
import { Plus, ArrowUpDown, MessageSquare, Link2, Settings2, UserX } from 'lucide-react'
import { can, isMine } from '../lib/access'
import { fieldOn, taskCfg } from '../lib/taskcfg'
import { TaskSettingsSheet } from '../components/TaskSettings'
import { TRACK, TRACKS, trackOf, waitingOn } from '../lib/tracks'
import { TrackBadge } from '../components/ItemSheet'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Avatar, Band, Card, Empty, FilterSelect, Overlap, PriorityIcon, Segmented, Toolbar, Due, cx, SearchInput, StatusIcon } from '../components/ui'
import { Kanban } from '../components/widgets'
import { AssigneesPicker, PersonPicker, PriorityPicker, StatusPicker } from '../components/pickers'
import { PRIORITY, PRIORITY_ORDER, options } from '../lib/labels'
import { columns, statusLabel } from '../lib/columns'
import { addDays, fa, todayISO } from '../lib/jalali'
import { isTaskOverdue } from '../lib/metrics'
import { L, lbl, useI18n } from '../lib/i18n'
import { useProjectName } from '../components/shared'
import { usePref } from '../lib/prefs'
import type { Task } from '../lib/types'

type SortKey = 'due_date' | 'priority' | 'status' | 'assignee'

export default function Tasks() {
  const { db, me, canEdit, upsert, access, toast } = useStore()
  const { lang } = useI18n()
  const { open } = useEditor()
  const pname = useProjectName()
  const [params, setParams] = useSearchParams()
  const leader = can.portfolio(access)
  const [viewPref, setView] = usePref<'list' | 'board' | 'people'>('madar.tasks.view', 'list')
  const view = viewPref === 'people' && !leader ? 'list' : viewPref
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('due_date')
  const get = (k: string) => params.get(k) || ''
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }
  const project = get('project')
  const assignee = get('assignee')
  const status = get('status') || (view === 'list' ? 'open' : '')
  const prio = get('priority')
  const due = get('due')
  const track = get('track')
  const whose = get('whose')
  const area = get('area')
  const areas = taskCfg().areas
  const today = todayISO()
  const assignees = Array.from(new Set(db.Tasks.flatMap((t) => assigneesOf(t))))

  const list = useMemo(() => {
    const out = db.Tasks.filter((t) => {
      if (project && t.project_id !== project) return false
      if (assignee && !isAssignee(t, assignee)) return false
      if (status === 'open' ? t.status === 'done' : status && status !== 'all' && t.status !== status) return false
      if (prio && t.priority !== prio) return false
      if (track && trackOf(t, db) !== track) return false
      if (due === 'overdue' && !isTaskOverdue(t)) return false
      if (due === 'today' && t.due_date !== today) return false
      if (due === 'week' && !(t.due_date >= today && t.due_date <= addDays(today, 7))) return false
      if (due === 'none' && t.due_date) return false
      if (whose === 'mine' && !isAssignee(t, me)) return false
      if (whose === 'shared' && !(!isAssignee(t, me) && isMine(t, me))) return false
      if (area && t.area !== area) return false
      if (q && !t.title.includes(q) && !t.description.includes(q) && !t.tags.includes(q)) return false
      return true
    })
    const cmp: Record<SortKey, (a: Task, b: Task) => number> = {
      due_date: (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'),
      priority: (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      status: (a, b) => a.status.localeCompare(b.status),
      assignee: (a, b) => a.assignee.localeCompare(b.assignee, 'fa'),
    }
    return out.sort(cmp[sort])
  }, [db, project, assignee, status, prio, due, q, sort, today, track, whose, area, me])

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const bulk = async (p: Partial<Task>) => {
    const rows = db.Tasks.filter((t) => picked.has(t.id))
    for (const t of rows) await patch(t, p)
    setPicked(new Set())
    toast(L(`${fa(rows.length)} تسک به‌روز شد`, `${rows.length} tasks updated`))
  }
  const patch = (t: Task, p: Partial<Task>) => upsert('Tasks', { ...t, ...p, ...(p.status ? { completed_at: p.status === 'done' ? todayISO() : '' } : {}) })
  const SortTh = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cx('th', className)}>
      <button className={cx('inline-flex items-center gap-1', sort === k && 'text-ink')} onClick={() => setSort(k)}>
        {children} <ArrowUpDown size={11} />
      </button>
    </th>
  )

  return (
    <>
      <Band nav={<HubNav hub="work" />}
        title={L('تسک‌ها', 'Tasks')}
        sub={L(`${fa(list.length)} تسک · ${fa(db.Tasks.filter(isTaskOverdue).length)} معوق · ${fa(db.Tasks.filter((t) => t.status === 'blocked').length)} مسدود`, `${list.length} tasks · ${db.Tasks.filter(isTaskOverdue).length} overdue · ${db.Tasks.filter((t) => t.status === 'blocked').length} blocked`)}
        actions={
          <>
            <Segmented dark value={view} onChange={setView} options={[{ value: 'list', label: L('لیست', 'List') }, { value: 'board', label: L('بورد', 'Board') }, ...(leader ? [{ value: 'people' as const, label: L('تخصیص', 'Assign') }] : [])]} />
            {access === 'super' && (
              <button className="btn h-10 w-10 bg-white/10 px-0 text-white hover:bg-white/20" onClick={() => setSettings(true)} title={L('تنظیمات تسک‌ها', 'Task settings')} aria-label={L('تنظیمات تسک‌ها', 'Task settings')}>
                <Settings2 size={17} />
              </button>
            )}
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Tasks', { project_id: project, assignee: assignee || me })}>
                <Plus size={16} /> {L('تسک جدید', 'New task')}
              </button>
            )}
          </>
        }
      />
      <Overlap>
        <div className="card mb-4 p-3">
          <Toolbar className="!mb-0">
            <SearchInput value={q} onChange={setQ} />
            <FilterSelect value={project} onChange={(v) => set('project', v)} placeholder={L('همه‌ی پروژه‌ها', 'All projects')} options={db.Projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={assignee} onChange={(v) => set('assignee', v)} placeholder={L('همه‌ی افراد', 'Everyone')} options={assignees.map((a) => ({ value: a, label: a === me ? `${a} (${L('من', 'me')})` : a }))} />
            {view === 'list' && <FilterSelect value={get('status')} onChange={(v) => set('status', v)} placeholder={L('باز', 'Open')} options={[{ value: 'all', label: L('همه', 'All') }, ...columns().map((c) => ({ value: c.id, label: statusLabel(c.id) }))]} />}
            <FilterSelect value={track} onChange={(v) => set('track', v)} placeholder={L('همه‌ی واحدها', 'All units')} options={TRACKS.map((t) => ({ value: t, label: lbl(TRACK, t) }))} />
            <FilterSelect value={prio} onChange={(v) => set('priority', v)} placeholder={L('اولویت', 'Priority')} options={options(PRIORITY, lang)} />
            <FilterSelect
              value={due}
              onChange={(v) => set('due', v)}
              placeholder={L('سررسید', 'Due')}
              options={[
                { value: 'overdue', label: L('معوق', 'Overdue') },
                { value: 'today', label: L('امروز', 'Today') },
                { value: 'week', label: L('۷ روز آینده', 'Next 7 days') },
                { value: 'none', label: L('بدون سررسید', 'No due date') },
              ]}
            />
            {areas.length > 0 && <FilterSelect value={area} onChange={(v) => set('area', v)} placeholder={L('حوزه', 'Area')} options={areas.map((a) => ({ value: a, label: a }))} />}
            {me && (
              <Segmented
                value={(whose || 'all') as 'all' | 'mine' | 'shared'}
                onChange={(v) => set('whose', v === 'all' ? '' : v)}
                options={[{ value: 'all', label: leader ? L('همه', 'All') : L('همه‌ی من', 'All mine') }, { value: 'mine', label: L('مسئولش منم', 'Assigned to me') }, { value: 'shared', label: L('مشترک و زیر نظر', 'Shared & tracked') }]}
              />
            )}
          </Toolbar>
        </div>

        {leader && picked.size > 0 && view === 'list' && (
          <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-float">
            <span className="text-sm font-medium">{L(`${fa(picked.size)} تسک انتخاب شد`, `${picked.size} selected`)}</span>
            <span className="text-line-strong">·</span>
            <span className="text-xs text-sub">{L('اساین به', 'Assign to')}</span>
            <PersonPicker value="" placeholder={L('انتخاب فرد', 'Choose')} onChange={(a) => bulk({ assignee: a })} />
            <span className="text-xs text-sub">{L('وضعیت', 'Status')}</span>
            <StatusPicker value="todo" onChange={(st) => bulk({ status: st })} />
            <div className="flex-1" />
            <button className="btn-ghost btn-sm" onClick={() => setPicked(new Set())}>
              {L('لغو انتخاب', 'Clear')}
            </button>
          </div>
        )}
        {view === 'people' ? (
          <AssignBoard tasks={list} />
        ) : view === 'board' ? (
          <Kanban tasks={list} defaults={{ project_id: project, assignee: assignee || me }} />
        ) : (
          <Card pad={false}>
            {list.length === 0 ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56.25rem]">
                  <thead className="border-b border-line">
                    <tr>
                      {leader && (
                        <th className="th w-8">
                          <input type="checkbox" aria-label={L('انتخاب همه', 'Select all')} checked={picked.size > 0 && list.every((t) => picked.has(t.id))} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((t) => t.id)) : new Set())} />
                        </th>
                      )}
                      <SortTh k="status" className="w-12">
                        {''}
                      </SortTh>
                      <th className="th">{L('عنوان', 'Title')}</th>
                      <th className="th">{L('پروژه', 'Project')}</th>
                      <th className="th">{L('واحد', 'Unit')}</th>
                      <SortTh k="priority">{L('اولویت', 'Priority')}</SortTh>
                      <SortTh k="assignee">{L('مسئول', 'Assignee')}</SortTh>
                      <SortTh k="due_date">{L('سررسید', 'Due')}</SortTh>
                      {fieldOn('deadline') && <th className="th">{L('ددلاین', 'Deadline')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((t) => {
                      const nC = db.Comments.filter((c) => c.entity === 'Tasks' && c.entity_id === t.id).length
                      return (
                        <tr key={t.id} className={cx('group cursor-pointer transition hover:bg-muted/40', isTaskOverdue(t) && 'bg-bad/[0.025]')} onClick={() => open('Tasks', t as never)}>
                          {leader && (
                            <td className="ps-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" aria-label={L('انتخاب', 'Select')} checked={picked.has(t.id)} onChange={() => togglePick(t.id)} />
                            </td>
                          )}
                          <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                            {canEdit ? <StatusPicker value={t.status} onChange={(s) => patch(t, { status: s })} label={false} /> : <StatusIcon s={t.status} />}
                          </td>
                          <td className="td">
                            <div className={cx('font-medium', t.status === 'done' && 'text-sub line-through')}>{t.title}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-sub">
                              {t.tags &&
                                t.tags.split(',').map((g) => g.trim()).filter(Boolean).map((g) => (
                                  <span key={g} dir="ltr" className="font-mono">
                                    #{g}
                                  </span>
                                ))}
                              {nC > 0 && (
                                <span className="inline-flex items-center gap-0.5">
                                  <MessageSquare size={11} /> {fa(nC)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="td text-xs text-sub">{pname(t.project_id) || (canPersonal(db.Team.find((m) => m.name === leadAssignee(t))) ? L('شخصی', 'Personal') : '—')}</td>
                          <td className="td">
                            <span className="flex items-center gap-1.5">
                              <TrackBadge track={trackOf(t, db)} />
                              {waitingOn(t, db).length > 0 && (
                                <span title={L('منتظر پیش‌نیاز', 'Waiting on a dependency')} className="text-warn">
                                  <Link2 size={13} />
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2" onClick={(e) => e.stopPropagation()}>
                            <PriorityPicker value={t.priority} onChange={(p) => patch(t, { priority: p })} />
                          </td>
                          <td className="px-2" onClick={(e) => e.stopPropagation()}>
                            <AssigneesPicker value={t.assignee} onChange={(a) => patch(t, { assignee: a })} />
                          </td>
                          <td className="td">
                            <Due iso={t.due_date} done={t.status === 'done'} />
                          </td>
                          {fieldOn('deadline') && (
                            <td className="td">
                              <Due iso={t.deadline || ''} done={t.status === 'done'} />
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </Overlap>
      {settings && <TaskSettingsSheet onClose={() => setSettings(false)} />}
    </>
  )
}

/** Leadership's assignment board: one column per person (plus unassigned); drop a card on someone to assign it. */
function AssignBoard({ tasks }: { tasks: Task[] }) {
  const { db, upsert, canEdit, toast } = useStore()
  const { open } = useEditor()
  const pname = useProjectName()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const openTasks = tasks.filter((t) => t.status !== 'done')
  const people = ['', ...db.Team.filter((m) => String(m.active) !== 'false').map((m) => m.name)]
  const drop = async (who: string) => {
    setOver(null)
    const t = openTasks.find((x) => x.id === drag)
    setDrag(null)
    if (!t || (t.assignee || '') === who) return
    // dropping on a person makes them the assignee; others already on it stay as co-assignees
    await upsert('Tasks', { ...t, assignee: who ? joinNames([who, ...assigneesOf(t).filter((a) => a !== from)]) : '' })
    toast(who ? L(`به ${who} سپرده شد`, `Assigned to ${who}`) : L('بدون مسئول شد', 'Unassigned'))
  }
  return (
    <div className="grid gap-3 pb-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
      {people.map((who) => {
        const col = openTasks.filter((t) => (who ? isAssignee(t, who) : !t.assignee))
        if (!who && !col.length) return null
        const late = col.filter(isTaskOverdue).length
        return (
          <div
            key={who || '-'}
            onDragOver={(e) => (e.preventDefault(), setOver(who))}
            onDragLeave={() => setOver(null)}
            onDrop={() => drop(who)}
            className={cx('flex min-h-[9rem] flex-col rounded-3xl bg-muted/60 p-2 transition', over === who && 'bg-brand-soft/30 ring-2 ring-brand/30')}
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              {who ? <Avatar name={who} size="sm" /> : <UserX size={16} className="text-sub" />}
              <span className="truncate text-sm font-semibold">{who || L('بدون مسئول', 'Unassigned')}</span>
              <span className="text-xs text-sub num">{fa(col.length)}</span>
              {late > 0 && <span className="ms-auto rounded-full bg-bad/10 px-2 text-[0.625rem] font-medium leading-5 text-bad">{L(`${fa(late)} معوق`, `${late} late`)}</span>}
            </div>
            <div className="mt-1 flex flex-col gap-2">
              {col.map((t) => (
                <div
                  key={t.id}
                  draggable={canEdit}
                  onDragStart={() => (setDrag(t.id), setFrom(who))}
                  onClick={() => open('Tasks', t as never)}
                  className={cx('cursor-pointer rounded-2xl border border-line bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-float', drag === t.id && 'opacity-40')}
                >
                  {t.project_id && <div className="mb-1 truncate font-mono text-[0.625rem] uppercase tracking-wider text-sub">{db.Projects.find((p) => p.id === t.project_id)?.code || pname(t.project_id)}</div>}
                  <div className="text-sm leading-6">{t.title}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusIcon s={t.status} size={13} />
                    <PriorityIcon p={t.priority} />
                    {t.area && <span className="truncate text-[0.6875rem] text-sub">{t.area}</span>}
                    <span className="flex-1" />
                    <Due iso={t.due_date} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
