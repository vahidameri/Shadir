// Pieces of the sprint pages: issue badge, burndown and velocity charts (plain SVG), a backlog row,
// and the "complete sprint" dialog that moves unfinished work on.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bug, BookOpen, CheckSquare, FlaskConical } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Avatar, StatusIcon, cx } from './ui'
import { L, tr } from '../lib/i18n'
import { fa, fmtDayMonth } from '../lib/jalali'
import { nowStamp } from '../lib/taskstamp'
import { ISSUE, burndown, plannedSprints, pts, sprintStats } from '../lib/sprints'
import { assigneesOf } from '../lib/assignees'
import { statusLabel } from '../lib/columns'
import type { IssueType, Sprint, Task } from '../lib/types'

const ICON = { story: BookOpen, task: CheckSquare, bug: Bug, spike: FlaskConical }

export function IssueBadge({ type, withLabel }: { type?: IssueType; withLabel?: boolean }) {
  if (!type) return null
  const I = ICON[type]
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[0.625rem] font-medium', ISSUE[type].tone)} title={tr(ISSUE[type].label)}>
      <I size={11} /> {withLabel && tr(ISSUE[type].label)}
    </span>
  )
}

export const KeyTag = ({ k }: { k?: string }) => (k ? <span className="shrink-0 font-mono text-[0.625rem] text-sub" dir="ltr">{k}</span> : null)

/** Remaining points per day against the ideal line. */
export function Burndown({ s, height = 200 }: { s: Sprint; height?: number }) {
  const { db } = useStore()
  const rows = burndown(db, s)
  const W = 640
  const H = height
  const top = Math.max(1, ...rows.map((r) => Math.max(r.ideal, r.remaining ?? 0))) * 1.1
  const X = (i: number) => 28 + (i / Math.max(1, rows.length - 1)) * (W - 40)
  const Y = (v: number) => H - 22 - (v / top) * (H - 36)
  const real = rows.map((r, i) => (r.remaining === null ? null : `${X(i)},${Y(r.remaining)}`)).filter(Boolean)
  const ticks = [0, Math.round(top / 2), Math.round(top / 1.1)]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={L('نمودار برن‌داون', 'Burndown chart')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={28} x2={W - 12} y1={Y(t)} y2={Y(t)} stroke="rgb(var(--line))" />
            <text x={22} y={Y(t) + 3} textAnchor="end" className="fill-[rgb(var(--sub))] text-[10px]">{fa(t)}</text>
          </g>
        ))}
        <polyline fill="none" stroke="rgb(var(--ink) / 0.25)" strokeWidth="1.5" strokeDasharray="5 4" points={rows.map((r, i) => `${X(i)},${Y(r.ideal)}`).join(' ')} />
        {real.length > 0 && <polyline fill="none" stroke="rgb(var(--ink))" strokeWidth="2.5" strokeLinejoin="round" points={real.join(' ')} />}
        {rows.map((r, i) => (r.remaining === null ? null : <circle key={r.day} cx={X(i)} cy={Y(r.remaining)} r="2.5" fill="rgb(var(--ink))"><title>{`${fmtDayMonth(r.day)}: ${r.remaining}`}</title></circle>))}
        {[0, rows.length - 1].map((i) => rows[i] && <text key={i} x={X(i)} y={H - 6} textAnchor={i ? 'end' : 'start'} className="fill-[rgb(var(--sub))] text-[10px]">{fmtDayMonth(rows[i].day)}</text>)}
      </svg>
      <div className="flex gap-4 text-[0.6875rem] text-sub">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-ink" /> {L('باقی‌مانده', 'Remaining')}</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-ink/40" /> {L('خط ایده‌آل', 'Ideal')}</span>
      </div>
    </div>
  )
}

/** Committed against completed, sprint by sprint. */
export function Velocity({ rows }: { rows: { s: Sprint; committed: number; completed: number }[] }) {
  if (!rows.length) return <div className="py-6 text-center text-xs text-sub">{L('هنوز اسپرینتی بسته نشده', 'No completed sprints yet')}</div>
  const max = Math.max(1, ...rows.flatMap((r) => [r.committed, r.completed]))
  return (
    <div>
      <div className="flex h-44 items-end gap-4 border-b border-line px-2">
        {rows.map((r) => (
          <Link key={r.s.id} to={`/sprints/${r.s.id}`} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${r.s.name}: ${r.completed}/${r.committed}`}>
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <span className="w-1/3 max-w-6 rounded-t bg-ink/15" style={{ height: `${(r.committed / max) * 100}%` }} />
              <span className="w-1/3 max-w-6 rounded-t bg-ink transition group-hover:opacity-80" style={{ height: `${(r.completed / max) * 100}%` }} />
            </div>
            <span className="text-[0.625rem] font-medium num">{fa(r.completed)}/{fa(r.committed)}</span>
          </Link>
        ))}
      </div>
      <div className="mt-1 flex gap-4 px-2">
        {rows.map((r) => <span key={r.s.id} className="min-w-0 flex-1 truncate text-center text-[0.625rem] text-sub">{r.s.name}</span>)}
      </div>
      <div className="mt-2 flex gap-4 text-[0.6875rem] text-sub">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ink/15" /> {L('تعهد', 'Committed')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ink" /> {L('انجام‌شده', 'Completed')}</span>
      </div>
    </div>
  )
}

/** A line in the backlog or in a sprint list: type, key, title, people, points, status, and where it goes. */
export function WorkRow({ t, sprints, onMove }: { t: Task; sprints: Sprint[]; onMove?: (sprintId: string) => void }) {
  const { canEdit, upsert } = useStore()
  const { open } = useEditor()
  const people = assigneesOf(t)
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_3.5rem_7rem_auto] items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
      <span className="flex items-center gap-1.5">
        <IssueBadge type={t.issue_type} />
        <StatusIcon s={t.status} size={14} />
      </span>
      <button className="flex min-w-0 items-center gap-2 text-start" onClick={() => open('Tasks', t as never)}>
        <KeyTag k={t.key} />
        <span className="truncate hover:underline">{t.title}</span>
      </button>
      <span className="flex -space-x-1.5 rtl:space-x-reverse">{people.slice(0, 2).map((p) => <Avatar key={p} name={p} />)}</span>
      <input
        key={`${t.id}-${t.points}`}
        defaultValue={pts(t) || ''}
        disabled={!canEdit}
        inputMode="numeric"
        placeholder="—"
        aria-label={L('امتیاز', 'Points')}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0
          if (n !== pts(t)) upsert('Tasks', { ...t, points: n })
        }}
        className="h-8 w-14 rounded-full bg-muted/60 text-center text-xs outline-none focus:bg-surface focus:ring-1 focus:ring-line-strong num"
      />
      <span className="truncate text-xs text-sub">{statusLabel(t.status)}</span>
      {onMove && canEdit ? (
        <select value={t.sprint_id || ''} onChange={(e) => onMove(e.target.value)} className="h-8 max-w-[9rem] rounded-full border border-line bg-surface px-2 text-xs" aria-label={L('انتقال به', 'Move to')}>
          <option value="">{L('بک‌لاگ', 'Backlog')}</option>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : (
        <span />
      )}
    </div>
  )
}

/** Completing a sprint: freeze what was done, move what wasn't (next sprint or backlog), write the retro. */
export function CompleteSprint({ s, onClose }: { s: Sprint; onClose: () => void }) {
  const { db, upsert, toast } = useStore()
  const st = sprintStats(db, s)
  const next = plannedSprints(db, s.team || '')
  const [to, setTo] = useState(next[0]?.id || '')
  const [retro, setRetro] = useState(s.retro || '')
  const [busy, setBusy] = useState(false)
  const done = async () => {
    setBusy(true)
    // close first, remembering what was unfinished, so the report still shows it after it moves on
    await upsert('Sprints', { ...s, status: 'closed', closed_at: nowStamp(), completed_points: st.done, committed_points: st.committed, retro, carried: st.carried.map((t) => t.id).join(',') })
    for (const t of st.carried) await upsert('Tasks', { ...t, sprint_id: to })
    toast(L(`${s.name} بسته شد`, `${s.name} completed`))
    onClose()
  }
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{L(`بستن ${s.name}`, `Complete ${s.name}`)}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [L('تعهد', 'Committed'), st.committed],
            [L('انجام‌شده', 'Done'), st.done],
            [L('کار ناتمام', 'Unfinished'), st.carried.length],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-2xl bg-muted/60 p-3">
              <div className="display text-2xl num">{fa(Number(v))}</div>
              <div className="text-[0.6875rem] text-sub">{l}</div>
            </div>
          ))}
        </div>
        {st.carried.length > 0 && (
          <label className="mt-4 block text-sm">
            {L(`${fa(st.carried.length)} کار ناتمام کجا برود؟`, `Where do ${st.carried.length} unfinished items go?`)}
            <select className="input mt-1 h-10 w-full" value={to} onChange={(e) => setTo(e.target.value)}>
              {next.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="">{L('بک‌لاگ', 'Backlog')}</option>
            </select>
          </label>
        )}
        <label className="mt-4 block text-sm">
          {L('رترو (اختیاری): چه خوب بود، چه بهتر شود', 'Retro (optional): what went well, what to improve')}
          <textarea rows={3} className="input mt-1 w-full py-2 text-sm" value={retro} onChange={(e) => setRetro(e.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>{L('انصراف', 'Cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={done}>{L('بستن اسپرینت', 'Complete sprint')}</button>
        </div>
      </div>
    </div>
  )
}
