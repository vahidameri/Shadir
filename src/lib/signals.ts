// Tracking signals for a task — what the PgM scans for: how long since it was assigned, how close
// the deadline is, how long it has been blocked and on whom, whether it went quiet (stale), its flag.
// Every list, card and panel reads these, so a task tells the same story everywhere.
import type { DB, Task } from './types'
import { catOf, closed } from './columns'
import { daysBetween, daysFromToday, todayISO } from './jalali'
import { taskCfg } from './taskcfg'
import { assigneesOf } from './assignees'

interface Signals {
  /** days since the assign date (null = no assign date) */
  sinceAssign: number | null
  /** days until the deadline (negative = late; null = none or closed) */
  toDeadline: number | null
  late: boolean
  /** days in the current blocked spell (null = not blocked) */
  blockedDays: number | null
  /** blocked longer than the alert threshold */
  blockedLong: boolean
  /** open and untouched for the stale threshold */
  stale: boolean
  staleDays: number | null
}

const day = (s?: string) => String(s || '').slice(0, 10)

export function signals(t: Task, today = todayISO()): Signals {
  const open = !closed(t)
  const c = taskCfg()
  const touched = day(t.updated_at) || day(t.created_at)
  const quiet = open && touched ? daysBetween(touched, today) : null
  const blockedDays = catOf(t.status) === 'blocked' ? daysBetween(day(t.blocked_since) || touched || today, today) : null
  const toDeadline = open && t.due_date ? daysFromToday(t.due_date) : null
  return {
    sinceAssign: t.assigned_at ? daysBetween(day(t.assigned_at), today) : null,
    toDeadline,
    late: toDeadline !== null && toDeadline < 0,
    blockedDays,
    blockedLong: blockedDays !== null && blockedDays >= c.blockedDays,
    stale: quiet !== null && quiet >= c.staleDays && catOf(t.status) !== 'intake',
    staleDays: quiet,
  }
}

/** The smart views on the Tasks page. */
export type View = 'open' | 'mine' | 'flagged' | 'blocked' | 'late' | 'week' | 'stale' | 'waiting' | 'intake' | 'closed' | 'all'
export const VIEWS: View[] = ['open', 'flagged', 'blocked', 'late', 'week', 'stale', 'waiting', 'intake', 'closed', 'all']

export function inView(t: Task, v: View, me = '', today = todayISO()): boolean {
  const cat = catOf(t.status)
  const s = signals(t, today)
  switch (v) {
    case 'all':
      return true
    case 'closed':
      return closed(t)
    case 'intake':
      return cat === 'intake'
    case 'open':
      return !closed(t) && cat !== 'intake'
    case 'mine':
      return !closed(t) && assigneesOf(t).includes(me)
    case 'flagged':
      return !closed(t) && !!t.flag
    case 'blocked':
      return cat === 'blocked'
    case 'waiting':
      return cat === 'waiting'
    case 'late':
      return s.late
    case 'week':
      return s.toDeadline !== null && s.toDeadline >= 0 && s.toDeadline <= 7
    case 'stale':
      return s.stale
  }
}

/** Counts for the view chips and the stats strip. */
export function viewCounts(tasks: Task[], me = ''): Record<View, number> {
  const today = todayISO()
  const out = Object.fromEntries([...VIEWS, 'mine'].map((v) => [v, 0])) as Record<View, number>
  for (const t of tasks) for (const v of [...VIEWS, 'mine'] as View[]) if (inView(t, v, me, today)) out[v]++
  return out
}

/** Who a blocked task waits on: the "blocked by" field, else the people its open dependencies sit with. */
export function blockedOn(t: Task, db: DB): string {
  if (t.blocked_by) return t.blocked_by
  const deps = String(t.depends_on || '').split(',').map((x) => x.trim()).filter(Boolean)
  const who = deps.map((id) => db.Tasks.find((x) => x.id === id)).filter((x) => x && !closed(x)).map((x) => assigneesOf(x!)[0]).filter(Boolean)
  return [...new Set(who)].join('، ')
}
