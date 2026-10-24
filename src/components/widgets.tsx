import { assigneesOf } from '../lib/assignees'
import { dirOf } from '../lib/dir'
import { useMemo, useState } from 'react'
import { Plus, MessageSquare, CheckCircle2, FileText, Flag, BellRing, Link2 } from 'lucide-react'
import { trackOf, sideDot, waitingOn, TRACK } from '../lib/tracks'
import type { Track } from '../lib/types'
import type { Risk, Task, TaskStatus, Update } from '../lib/types'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { useComposer } from './UpdateComposer'
import { Avatar, AvatarStack, Due, cx, HealthBadge, Chip, StatusIcon, PriorityIcon } from './ui'
import { COLUMNS_KEY, boardColumns, catOf, isClosed, readColumns, statusLabel, withColumn } from '../lib/columns'
import { FlagMark, TaskSignals } from './TaskTracking'
import { can } from '../lib/access'
import type { Activity } from '../lib/activity'
import { DIM, DIMS, type Assessment } from '../lib/rag'
import { HEALTH } from '../lib/labels'
import { riskLevel, riskScore } from '../lib/metrics'
import { fa, fmtDate, daysFromToday, timeAgo } from '../lib/jalali'
import { L, lbl, tr } from '../lib/i18n'
import { useProjectName } from './shared'
import { IssueBadge, KeyTag } from './SprintParts'


// ---------------- Kanban ----------------
export function Kanban({ tasks, defaults, showProject = true }: { tasks: Task[]; defaults?: Partial<Task>; showProject?: boolean }) {
  const { upsert, canEdit, db } = useStore()
  const { open } = useEditor()
  const pname = useProjectName()
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const { access, setting, setSetting, toast } = useStore()
  const admin = canEdit && can.backoffice(access)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  // a long column is drawn in pages (done columns grow without end)
  const [shownPer, setShownPer] = useState<Record<string, number>>({})
  const COL = 30
  const nComments = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of db.Comments) if (c.entity === 'Tasks') m.set(c.entity_id, (m.get(c.entity_id) || 0) + 1)
    return m
  }, [db.Comments])
  const addColumn = async () => {
    const n = name.trim()
    setAdding(false)
    setName('')
    if (!n) return
    await setSetting(COLUMNS_KEY, JSON.stringify(withColumn(readColumns(setting(COLUMNS_KEY)), n)))
    toast(L(`ستون «${n}» اضافه شد`, `Column “${n}” added`))
  }

  const drop = async (s: TaskStatus) => {
    setOver(null)
    const t = tasks.find((x) => x.id === drag)
    setDrag(null)
    if (!t || t.status === s) return
    await upsert('Tasks', { ...t, status: s })
  }

  return (
    <div className="grid auto-cols-[minmax(272px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
      {boardColumns().map(({ id: s }) => {
        const col = tasks.filter((t) => t.status === s)
        const pts = col.reduce((a, t) => a + (Number(t.points) || 0), 0)
        return (
          <div
            key={s}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(s)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => drop(s)}
            className={cx('flex min-h-[15rem] flex-col rounded-3xl bg-muted/60 p-2 transition', over === s && 'bg-brand-soft/30 ring-2 ring-brand/30')}
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <StatusIcon s={s} size={15} />
              <span className="text-sm font-semibold">{statusLabel(s)}</span>
              <span className="text-xs text-sub num">{fa(col.length)}</span>
              {pts > 0 && <span className="ms-auto font-mono text-[0.625rem] text-sub">{fa(pts)} {L('امتیاز', 'pts')}</span>}
            </div>
            <div className="mt-1 flex flex-col gap-2">
              {col.slice(0, shownPer[s] || COL).map((t) => {
                const nC = nComments.get(t.id) || 0
                return (
                  <div
                    key={t.id}
                    draggable={canEdit}
                    onDragStart={() => setDrag(t.id)}
                    onClick={() => open('Tasks', t as never)}
                    className={cx('cursor-pointer rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-float', drag === t.id && 'rotate-1 opacity-40')}
                  >
                    {showProject && t.project_id && <div className="mb-1 truncate font-mono text-[0.625rem] uppercase tracking-wider text-sub" dir="auto">{db.Projects.find((p) => p.id === t.project_id)?.code || pname(t.project_id)}</div>}
                    {(t.key || t.issue_type) && <div className="mb-1 flex items-center gap-1.5"><IssueBadge type={t.issue_type} /><KeyTag k={t.key} /></div>}
                    <div className={cx('flex items-start gap-1.5 text-sm leading-6', isClosed(s) && 'text-sub line-through')}>
                      {t.flag && <span className="mt-1"><FlagMark id={t.flag} size={12} /></span>}
                      <span dir={dirOf(t.title)} className="min-w-0 flex-1">{t.title}</span>
                    </div>
                    {catOf(t.status) === 'blocked' && t.blocked_reason && <div className="mt-2 rounded-lg bg-bad/[0.07] px-2 py-1 text-[0.6875rem] leading-5 text-bad">{t.blocked_reason}</div>}
                    <TaskSignals t={{ ...t, flag: '' }} assign={false} className="mt-2" />
                    <div className="mt-3 flex items-center gap-2">
                      <PriorityIcon p={t.priority} />
                      {trackOf(t, db) && <span className="h-2 w-2 rounded-full" style={sideDot(trackOf(t, db))} title={lbl(TRACK, trackOf(t, db) as Track)} />}
                      {waitingOn(t, db).length > 0 && <Link2 size={12} className="text-warn" />}
                      {Number(t.points) > 0 && <Chip className="font-mono">{fa(t.points)}</Chip>}
                      {nC > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-sub">
                          <MessageSquare size={11} />
                          {fa(nC)}
                        </span>
                      )}
                      <span className="flex-1" />
                      {isClosed(s) && <Due iso={t.due_date} done />}
                      <AvatarStack names={assigneesOf(t)} max={2} />
                    </div>
                  </div>
                )
              })}
              {col.length > (shownPer[s] || COL) && (
                <button onClick={() => setShownPer((x) => ({ ...x, [s]: (x[s] || COL) + COL * 2 }))} className="rounded-2xl px-3 py-2 text-xs text-brand transition hover:bg-surface">
                  {L(`${fa(col.length - (shownPer[s] || COL))} کارت دیگر`, `${col.length - (shownPer[s] || COL)} more`)}
                </button>
              )}
              {canEdit && (
                <button onClick={() => open('Tasks', { ...defaults, status: s })} className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs text-sub transition hover:bg-surface hover:text-ink">
                  <Plus size={14} /> {L('افزودن', 'Add')}
                </button>
              )}
            </div>
          </div>
        )
      })}
      {admin && (
        <div className="flex min-h-[15rem] flex-col rounded-3xl border-2 border-dashed border-line p-2">
          {adding ? (
            <form onSubmit={(e) => (e.preventDefault(), addColumn())} className="space-y-2 p-1">
              <input autoFocus className="input h-10" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name.trim() && setAdding(false)} placeholder={L('نام ستون، مثلاً «آماده‌ی تست»', 'Column name, e.g. “Ready for QA”')} />
              <button className="btn-primary btn-sm w-full" disabled={!name.trim()}>
                {L('افزودن ستون', 'Add column')}
              </button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl text-sm text-sub transition hover:bg-muted hover:text-ink">
              <Plus size={15} /> {L('ستون جدید', 'New column')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------- Risk matrix ----------------
const SCALE: [string, string][] = [['خیلی کم', 'Very low'], ['کم', 'Low'], ['متوسط', 'Medium'], ['زیاد', 'High'], ['خیلی زیاد', 'Very high']]
const BAND = {
  green: { cell: 'bg-good/[0.07]', hot: 'bg-good text-white', dot: 'bg-good', label: ['کم', 'Low'] },
  amber: { cell: 'bg-warn/[0.08]', hot: 'bg-warn text-white', dot: 'bg-warn', label: ['متوسط', 'Medium'] },
  red: { cell: 'bg-bad/[0.08]', hot: 'bg-bad text-white', dot: 'bg-bad', label: ['بحرانی', 'Critical'] },
} as const

/** 5×5 heat map. Each cell shows how many risks sit there; click a cell to list (and filter) them. */
export function RiskMatrix({ risks, onPick, cell: active, onCell }: { risks: Risk[]; onPick?: (r: Risk) => void; cell?: string; onCell?: (key: string) => void }) {
  const [own, setOwn] = useState('')
  const sel = active ?? own
  const pick = (k: string) => (onCell ? onCell(k === sel ? '' : k) : setOwn(k === sel ? '' : k))
  const at = (p: number, i: number) => risks.filter((r) => Number(r.probability) === p && Number(r.impact) === i)
  const chosen = sel ? at(Number(sel[0]), Number(sel[2])) : []
  const counts = { green: 0, amber: 0, red: 0 }
  risks.forEach((r) => riskScore(r) > 0 && counts[riskLevel(riskScore(r))]++)
  const axis = 'text-[0.625rem] leading-tight text-sub'
  return (
    <div className="mx-auto max-w-sm">
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="grid grid-rows-5 gap-1">
          {[5, 4, 3, 2, 1].map((p) => (
            <div key={p} className={cx(axis, 'flex items-center justify-end text-end')}>
              {L(SCALE[p - 1][0], SCALE[p - 1][1])}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].map((p) =>
            [1, 2, 3, 4, 5].map((i) => {
              const items = at(p, i)
              const b = BAND[riskLevel(p * i)]
              const key = `${p}-${i}`
              return (
                <button
                  key={key}
                  disabled={!items.length}
                  onClick={() => pick(key)}
                  title={items.length ? items.map((r) => r.title).join('\n') : `${p} × ${i} = ${p * i}`}
                  className={cx(
                    'grid aspect-square place-items-center rounded-lg text-sm font-semibold num transition',
                    items.length ? cx(b.hot, 'hover:scale-[1.04]') : b.cell,
                    sel === key && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                    sel && sel !== key && 'opacity-50',
                  )}
                >
                  {items.length ? fa(items.length) : ''}
                </button>
              )
            }),
          )}
        </div>
        <span />
        <div className="mt-1 grid grid-cols-5 gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cx(axis, 'text-center')}>
              {L(SCALE[i - 1][0], SCALE[i - 1][1])}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.6875rem] text-sub">
        <span>↑ {L('احتمال', 'Probability')}</span>
        <span>{L('اثر ←', 'Impact →')}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs">
        {(['red', 'amber', 'green'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cx('h-2 w-2 rounded-full', BAND[k].dot)} />
            {L(BAND[k].label[0], BAND[k].label[1])}
            <b className="num">{fa(counts[k])}</b>
          </span>
        ))}
      </div>
      {!onCell && chosen.length > 0 && (
        <ul className="mt-3 space-y-1">
          {chosen.map((r) => (
            <li key={r.id}>
              <button onClick={() => onPick?.(r)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition hover:bg-muted">
                <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', BAND[riskLevel(riskScore(r))].dot)} />
                <span dir={dirOf(r.title)} className="flex-1 truncate">{r.title}</span>
                <span dir={dirOf(r.owner)} className="shrink-0 text-sub">{r.owner}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function UpdateCard({ u, showProject }: { u: Update; showProject?: boolean }) {
  const { openComposer } = useComposer()
  const pname = useProjectName()
  const lines = (s: string) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="card card-hover cursor-pointer p-6" onClick={() => openComposer({ update: u })}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar name={u.author} size="md" />
          <div>
            <div className="text-sm font-semibold">{showProject ? pname(u.project_id) : u.author}</div>
            <div className="text-[0.6875rem] text-sub">
              {showProject && `${u.author} · `}
              {fmtDate(u.week_date, 'long')}
            </div>
          </div>
        </div>
        <HealthBadge h={u.health} />
      </div>
      <p dir={dirOf(u.summary)} className="mt-4 text-[0.9375rem] leading-8">{u.summary}</p>
      <div className="mt-5 grid gap-4 border-t border-line pt-4 @sm:grid-cols-3">
        {[
          [L('انجام‌شده', 'Done'), u.done, 'bg-good'],
          [L('هفته‌ی بعد', 'Next'), u.next, 'bg-brand'],
          [L('موانع', 'Blockers'), u.blockers, 'bg-bad'],
        ].map(([l, v, c]) => (
          <div key={l}>
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <span className={cx('h-1.5 w-1.5 rounded-full', c)} />
              {l}
            </div>
            <ul className="space-y-1 text-xs leading-5 text-ink/80">{lines(v).length ? lines(v).map((x, i) => <li key={i}>{x}</li>) : <li className="text-sub">—</li>}</ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export const riskTone = (r: Risk) => {
  const s = riskScore(r)
  return s >= 15 ? 'bg-bad text-white' : s >= 8 ? 'bg-warn text-white' : 'bg-good text-white'
}

// ---------------- Activity feed ----------------
function whenLabel(s: string) {
  if (!s) return ''
  if (s.includes(' ')) return timeAgo(new Date(s.replace(' ', 'T')))
  const d = -daysFromToday(s)
  if (d <= 0) return L('امروز', 'today')
  if (d === 1) return L('دیروز', 'yesterday')
  return L(`${fa(d)} روز پیش`, `${d}d ago`)
}

const actIcon = { comment: MessageSquare, done: CheckCircle2, update: FileText, milestone: Flag, followup: BellRing, created: Plus }
const actTone = { comment: 'bg-brand-soft/60 text-ink', done: 'bg-good/10 text-good', update: 'bg-ink/[0.06] text-ink', milestone: 'bg-warn/12 text-warn', followup: 'bg-purple-500/10 text-purple-600 dark:text-purple-300', created: 'bg-muted text-sub' }

export function ActivityFeed({ items, showProject = true }: { items: Activity[]; showProject?: boolean }) {
  const { db } = useStore()
  const { open } = useEditor()
  if (!items.length) return <div className="py-6 text-center text-xs text-sub">{L('فعالیتی ثبت نشده', 'No activity yet')}</div>
  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-[15px] before:w-px before:bg-line">
      {items.map((a) => {
        const Icon = actIcon[a.kind]
        const row = a.target && (db[a.target.sheet] as { id: string }[]).find((x) => x.id === a.target!.id)
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cx('relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-surface', actTone[a.kind])}>
              <Icon size={14} />
            </span>
            <button disabled={!row} onClick={() => row && open(a.target!.sheet, row as never)} className="min-w-0 flex-1 pt-1 text-start text-[0.8125rem] leading-6 enabled:hover:opacity-80">
              <span className="font-semibold">{a.who || L('تیم', 'Team')}</span> <span className="text-sub">{a.verb}</span> <span className="font-medium">«{a.what}»</span>
              <span className="block text-[0.6875rem] text-sub">
                {whenLabel(a.when)}
                {showProject && a.project_id && ` · ${db.Projects.find((p) => p.id === a.project_id)?.name || ''}`}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Last N weekly-update health readings as dots (oldest → newest). */
export function HealthTrend({ projectId, n = 5 }: { projectId: string; n?: number }) {
  const { db } = useStore()
  const ups = db.Updates.filter((u) => u.project_id === projectId).sort((a, b) => (a.week_date < b.week_date ? -1 : 1)).slice(-n)
  if (!ups.length) return <span className="text-[0.6875rem] text-sub/60">—</span>
  return (
    <span className="inline-flex items-center gap-1" title={L('روند سلامت از گزارش‌های هفتگی', 'Health trend from weekly updates')}>
      {ups.map((u) => (
        <span key={u.id} className={cx('h-2.5 w-2.5 rounded-full ring-2 ring-surface', u.health === 'red' ? 'bg-bad' : u.health === 'amber' ? 'bg-warn' : 'bg-good')} title={`${fmtDate(u.week_date)} · ${lbl(HEALTH, u.health)}`} />
      ))}
    </span>
  )
}

/** Five-dimension RAG strip (schedule, scope, risk, resourcing, delivery). */
export function RagStrip({ a, compact }: { a: Assessment; compact?: boolean }) {
  const tone: Record<string, string> = { red: 'bg-bad text-white', amber: 'bg-warn text-white', green: 'bg-good/12 text-good' }
  if (compact)
    return (
      <span className="inline-flex gap-0.5">
        {DIMS.map((d) => (
          <span key={d} title={`${tr(DIM[d])}: ${a.dims[d].why}`} className={cx('h-3 w-3 rounded-[3px]', a.dims[d].h === 'red' ? 'bg-bad' : a.dims[d].h === 'amber' ? 'bg-warn' : 'bg-good/40')} />
        ))}
      </span>
    )
  return (
    <div className="grid grid-cols-2 gap-1.5 @md:grid-cols-3">
      {DIMS.map((d) => (
        <div key={d} title={a.dims[d].why} className={cx('rounded-xl px-2.5 py-2', tone[a.dims[d].h])}>
          <div className="text-[0.6875rem] font-semibold">{tr(DIM[d])}</div>
          <div className="truncate text-[0.625rem] opacity-90">{a.dims[d].why}</div>
        </div>
      ))}
    </div>
  )
}
