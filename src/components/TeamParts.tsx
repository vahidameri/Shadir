// Visual pieces for teams: the status bar (tasks by category), the team card with its projects,
// and small chart helpers shared with the overview dashboard.
import { Link } from 'react-router-dom'
import { Ban, CalendarClock, Clock3, MoonStar, Plus } from 'lucide-react'
import type { DB, StatusCat } from '../lib/types'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { AvatarStack, HealthDot, Progress, cx } from './ui'
import { L, lbl, tr } from '../lib/i18n'
import { fa, fmtDayMonth } from '../lib/jalali'
import { STATUS_CAT } from '../lib/labels'
import { TRACK, sideColor } from '../lib/tracks'
import { projectMetrics } from '../lib/metrics'
import { teamStats, type TeamStats } from '../lib/teams'
import { closed } from '../lib/columns'

export const CAT_ORDER: StatusCat[] = ['active', 'open', 'waiting', 'blocked', 'intake', 'done']
export const CAT_FILL: Record<StatusCat, string> = { intake: '#38bdf8', open: '#9fb3ab', active: '#f5b301', waiting: '#8b5cf6', blocked: '#e0475a', done: '#19c48a', cancelled: '#c8d2ce' }

/** Tasks by status category as one stacked bar, with an optional legend. */
export function CatBar({ by, legend, className }: { by: Record<StatusCat, number>; legend?: boolean; className?: string }) {
  const total = CAT_ORDER.reduce((a, k) => a + by[k], 0)
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
        {total > 0 && CAT_ORDER.filter((k) => by[k]).map((k) => <span key={k} title={`${tr(STATUS_CAT[k])}: ${by[k]}`} style={{ width: `${(by[k] / total) * 100}%`, background: CAT_FILL[k] }} />)}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-sub">
          {CAT_ORDER.filter((k) => by[k]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: CAT_FILL[k] }} /> {tr(STATUS_CAT[k])} <b className="font-medium text-ink num">{fa(by[k])}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars: label, value, colour. */
export function Bars({ rows, max, unit }: { rows: { label: string; value: number; color?: string; to?: string; sub?: string }[]; max?: number; unit?: string }) {
  const m = max || Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{r.label}</span>
              <span className="shrink-0 font-medium num">
                {fa(r.value)}
                {unit}
                {r.sub && <span className="ms-1 font-normal text-sub">{r.sub}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-ink/[0.06]">
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.color || 'rgb(var(--brand))' }} />
            </div>
          </>
        )
        return <li key={r.label}>{r.to ? <Link to={r.to} className="block rounded-lg hover:bg-muted/50">{inner}</Link> : inner}</li>
      })}
    </ul>
  )
}

/** A ring with a number in the middle. */
export function Ring({ value, size = 64, color = 'rgb(var(--brand))', label }: { value: number; size?: number; color?: string; label?: string }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-ink/[0.07]" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="fill-ink text-[0.8rem] font-bold">{label ?? `${fa(Math.round(v))}٪`}</text>
    </svg>
  )
}

const name = (id: string) => (id ? lbl(TRACK, id) || id : L('بدون تیم', 'No team'))

/** One team: health, numbers, the status bar, its people and its projects. */
export function TeamCard({ id, stats, compact }: { id: string; stats?: TeamStats; compact?: boolean }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const s = stats || teamStats(db, id)
  const color = id ? sideColor(id) : '#9fb3ab'
  const num = (icon: React.ReactNode, n: number, label: string, tone: string, to: string) => (
    <Link to={to} className={cx('flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs transition hover:bg-muted', n ? tone : 'text-sub')}>
      {icon}
      <b className="num">{fa(n)}</b> <span className="text-sub">{label}</span>
    </Link>
  )
  return (
    <div className="card overflow-hidden">
      <div className="h-1.5" style={{ background: color }} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold text-white" style={{ background: color }}>{name(id).slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <Link to={`/tasks?track=${id}`} className="flex items-center gap-2 font-semibold hover:underline">
              {name(id)} <HealthDot h={s.health} pulse />
            </Link>
            <div className="mt-0.5 text-xs text-sub">
              {L(`${fa(s.projects.length)} پروژه · ${fa(s.open)} تسک باز · ${fa(s.doneRecent)} انجام‌شده در ۲ هفته`, `${s.projects.length} projects · ${s.open} open · ${s.doneRecent} done in 2 weeks`)}
            </div>
          </div>
          <AvatarStack names={s.members} max={4} />
        </div>

        <CatBar by={s.byCat} legend={!compact} className="mt-4" />

        <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {num(<CalendarClock size={13} />, s.late, L('معوق', 'late'), 'text-bad', `/tasks?track=${id}&v=late`)}
          {num(<Ban size={13} />, s.blocked, L('مسدود', 'blocked'), 'text-bad', `/tasks?track=${id}&v=blocked`)}
          {num(<Clock3 size={13} />, s.byCat.waiting, L('در انتظار', 'waiting'), 'text-violet-600', `/tasks?track=${id}&v=waiting`)}
          {num(<MoonStar size={13} />, s.stale, L('راکد', 'quiet'), 'text-sub', `/tasks?track=${id}&v=stale`)}
        </div>

        {!compact && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">{L('پروژه‌ها', 'Projects')}</span>
              {canEdit && id && (
                <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-sub hover:bg-muted hover:text-ink" onClick={() => open('Projects', { team: id })}>
                  <Plus size={12} /> {L('پروژه', 'Project')}
                </button>
              )}
            </div>
            {s.projects.length === 0 ? (
              <div className="py-2 text-xs text-sub">{L('هنوز پروژه‌ای زیر این تیم نیست', 'No projects under this team yet')}</div>
            ) : (
              <ul className="space-y-1">
                {s.projects.map((p) => {
                  const m = projectMetrics(p, db)
                  const tasks = db.Tasks.filter((t) => t.project_id === p.id)
                  const openN = tasks.filter((t) => !closed(t)).length
                  return (
                    <li key={p.id}>
                      <Link to={`/projects/${p.id}`} className="grid grid-cols-[auto_1fr_5rem_auto] items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/60">
                        <HealthDot h={m.health} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="block text-[0.6875rem] text-sub">
                            {L(`${fa(openN)} باز`, `${openN} open`)}
                            {m.overdueTasks > 0 && <span className="text-bad"> · {L(`${fa(m.overdueTasks)} معوق`, `${m.overdueTasks} late`)}</span>}
                            {p.status === 'on_hold' && <span> · {L('متوقف', 'paused')}</span>}
                          </span>
                        </span>
                        <Progress value={m.progress} h={m.health} />
                        <span className="w-14 text-end text-[0.6875rem] text-sub">{p.end_date ? fmtDayMonth(p.end_date) : '—'}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const teamName = name
export const teamColor = (id: string) => (id ? sideColor(id) : '#9fb3ab')
export type { DB }
