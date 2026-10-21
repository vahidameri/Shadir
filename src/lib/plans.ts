// Roadmap ("programming") for teams that plan without sprints — design and product. Each item has a
// window (start → end), a status, progress (by hand, else the share of its linked tasks that are
// done), a confidence, and the latest status line for the CPTO. The first committed end is kept as
// a baseline, so moving the end shows up as slippage.
import type { DB, KrConfidence, PlanItem, PlanKind, PlanStatus } from './types'
import type { T2 } from './i18n'
import { daysBetween, todayISO } from './jalali'
import { catOf } from './columns'

export const PLAN_STATUS: Record<PlanStatus, { label: T2; tone: string }> = {
  idea: { label: ['ایده', 'Idea'], tone: 'bg-muted text-sub' },
  planned: { label: ['برنامه‌ریزی‌شده', 'Planned'], tone: 'bg-ink/10 text-ink' },
  in_progress: { label: ['در جریان', 'In progress'], tone: 'bg-ink text-surface' },
  review: { label: ['بازبینی', 'In review'], tone: 'bg-warn/15 text-warn' },
  done: { label: ['انجام‌شده', 'Done'], tone: 'bg-good/15 text-good' },
  paused: { label: ['متوقف', 'Paused'], tone: 'bg-muted text-sub' },
  dropped: { label: ['کنار گذاشته', 'Dropped'], tone: 'bg-muted text-sub line-through' },
}
export const PLAN_KIND: Record<PlanKind, T2> = {
  discovery: ['دیسکاوری', 'Discovery'],
  design: ['طراحی', 'Design'],
  spec: ['نوشتن مشخصات (PRD)', 'Spec / PRD'],
  delivery: ['تحویل', 'Delivery'],
  research: ['تحقیق کاربر', 'User research'],
  other: ['سایر', 'Other'],
}
export const planOpen = (p: PlanItem) => !['done', 'dropped'].includes(p.status)
export const tasksOfPlan = (db: DB, id: string) => db.Tasks.filter((t) => t.plan_id === id && t.status !== 'cancelled')

/** Manual progress wins; otherwise the share of linked tasks that are done; done items are 100. */
export function planProgress(db: DB, p: PlanItem) {
  if (p.status === 'done') return 100
  if (p.progress !== '' && p.progress !== undefined && p.progress !== null && !Number.isNaN(Number(p.progress))) return Math.max(0, Math.min(100, Number(p.progress)))
  const ts = tasksOfPlan(db, p.id)
  return ts.length ? Math.round((ts.filter((t) => catOf(t.status) === 'done').length / ts.length) * 100) : 0
}
/** Share of the item's window that has passed. */
export function planElapsed(p: PlanItem, today = todayISO()) {
  if (!p.start_date || !p.end_date) return 0
  if (today <= p.start_date) return 0
  if (today >= p.end_date) return 100
  return Math.round((daysBetween(p.start_date, today) / Math.max(1, daysBetween(p.start_date, p.end_date))) * 100)
}
/** Days the end has moved past its first commitment. */
export const slipDays = (p: PlanItem) => (p.baseline_end && p.end_date && p.end_date > p.baseline_end ? daysBetween(p.baseline_end, p.end_date) : 0)
export const isLate = (p: PlanItem, today = todayISO()) => planOpen(p) && !!p.end_date && p.end_date < today

/** The confidence set by hand, else judged from dates and progress. */
export function planHealth(db: DB, p: PlanItem, today = todayISO()): Exclude<KrConfidence, ''> {
  if (p.confidence) return p.confidence
  if (!planOpen(p)) return 'on_track'
  if (isLate(p, today)) return 'off_track'
  const gap = planElapsed(p, today) - planProgress(db, p)
  return gap >= 35 ? 'off_track' : gap >= 15 || slipDays(p) > 7 ? 'at_risk' : 'on_track'
}

/** Items of a team whose window overlaps [a, b]. */
export const plansIn = (db: DB, team: string, a: string, b: string) =>
  db.Plans.filter((p) => (!team || p.team === team) && p.status !== 'dropped' && (p.start_date || p.end_date || '9999') <= b && (p.end_date || p.start_date || '0000') >= a).sort((x, y) => (x.start_date || '').localeCompare(y.start_date || '') || (x.end_date || '').localeCompare(y.end_date || ''))

/** Stamps a roadmap item as it is saved: the first end becomes the baseline. */
export function stampPlan(prev: PlanItem | undefined, next: PlanItem, now: string): PlanItem {
  const out = { ...next, updated_at: now }
  if (!out.baseline_end) out.baseline_end = prev?.baseline_end || prev?.end_date || out.end_date || ''
  return out
}
