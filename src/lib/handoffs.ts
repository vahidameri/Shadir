// Hand-offs between units are read from the assignments: when a task's (lead) assignee changes from a
// person in one unit to a person in another, Madar logs a pass. Going to a unit the task has already
// been in counts as a return (رفت و برگشت), and each pass between the same two units is a new round.
// Handoff.status: 'sent' = forward pass, 'returned' = back to an earlier unit.
import type { DB, Handoff, Task } from './types'
import { addDays, nowStamp, todayISO } from './jalali'
import { memberTrack } from './tracks'
import { uid } from './api'
import { leadAssignee } from './assignees'

const forTask = (db: DB, taskId: string) => db.Handoffs.filter((h) => h.task_id === taskId).sort((a, b) => (a.sent_at < b.sent_at ? -1 : 1))
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

export const recent = (db: DB, days = 14) => db.Handoffs.filter((h) => h.sent_at.slice(0, 10) >= addDays(todayISO(), -days))

