// Hand-offs between units are read from the assignments: when a task's (lead) assignee changes from a
// person in one unit to a person in another, Madar logs a pass. Going to a unit the task has already
// been in counts as a return (رفت و برگشت), and each pass between the same two units is a new round.
// Handoff.status: 'sent' = forward pass, 'returned' = back to an earlier unit.
import type { DB, Handoff, Task } from './types'
import { closed } from './columns'
import { addDays, daysBetween, nowStamp, todayISO } from './jalali'
import { memberTrack } from './tracks'
import { uid } from './api'
import { leadAssignee } from './assignees'

export const forTask = (db: DB, taskId: string) => db.Handoffs.filter((h) => h.task_id === taskId).sort((a, b) => (a.sent_at < b.sent_at ? -1 : 1))
export const isReturn = (h: Handoff) => h.status === 'returned'

/** The pass a re-assignment makes, or null when the task stays in the same unit. */
export function passFor(before: Task | undefined, after: Task, db: DB, by: string): Handoff | null {
  if (!before) return null
  const from = leadAssignee(before)
  const to = leadAssignee(after)
  if (!from || !to || from === to) return null
  const a = memberTrack(db, from)
  const b = memberTrack(db, to)
  if (!a || !b || a === b) return null
  const past = forTask(db, after.id)
  const visited = new Set(past.flatMap((h) => [h.from_side, h.to_side]))
  const round = past.filter((h) => (h.from_side === a && h.to_side === b) || (h.from_side === b && h.to_side === a)).length + 1
  return {
    id: uid('H'), task_id: after.id, project_id: after.project_id, title: after.title, from_side: a, to_side: b, from_person: from, to_person: to,
    status: visited.has(b) ? 'returned' : 'sent', round, sent_at: nowStamp(), due_date: after.due_date || '', responded_at: '', note: by && by !== from ? by : '', reply: '',
  }
}

/** Days the task has spent since this pass (until the next one, or today if it is still there). */
export function daysHeld(h: Handoff, db: DB, today = todayISO()) {
  const next = forTask(db, h.task_id).find((x) => x.sent_at > h.sent_at)
  return Math.max(0, daysBetween(h.sent_at.slice(0, 10), (next?.sent_at || today).slice(0, 10)))
}
/** The latest pass of a task that is still open, if it has been sitting there for `days` or more. */
export function stuck(db: DB, days = 3) {
  return db.Tasks.filter((t) => !closed(t))
    .map((t) => ({ t, h: forTask(db, t.id).slice(-1)[0] }))
    .filter((x) => x.h && daysHeld(x.h, db) >= days)
}
export const recent = (db: DB, days = 14) => db.Handoffs.filter((h) => h.sent_at.slice(0, 10) >= addDays(todayISO(), -days))

export interface PairStat {
  from: string
  to: string
  total: number
  returned: number
  returnRate: number
  avgDays: number
}
/** Per lane (unit → unit): passes, returns, return rate and the average days the task stayed after the pass. */
export function pairStats(db: DB, projectId?: string): PairStat[] {
  const m = new Map<string, PairStat & { sum: number; n: number }>()
  db.Handoffs.filter((h) => !projectId || h.project_id === projectId).forEach((h) => {
    const k = `${h.from_side}>${h.to_side}`
    const s = m.get(k) || { from: h.from_side, to: h.to_side, total: 0, returned: 0, returnRate: 0, avgDays: 0, sum: 0, n: 0 }
    s.total++
    if (isReturn(h)) s.returned++
    s.sum += daysHeld(h, db)
    s.n++
    m.set(k, s)
  })
  return [...m.values()].map(({ sum, n, ...s }) => ({ ...s, returnRate: s.total ? Math.round((s.returned / s.total) * 100) : 0, avgDays: n ? Math.round((sum / n) * 10) / 10 : 0 }))
}
export { leadAssignee }
