// Stamps a task as it is saved, wherever the save comes from (form, sheet, board, quick add):
// completion date, the start of a blocked spell, the assign date and the last-update time.
import type { Task } from './types'
import { catOf } from './columns'
import { todayISO } from './jalali'

export const nowStamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${todayISO()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const lead = (t?: Partial<Task>) => String(t?.assignee || '').split(',')[0].trim()

/** Fields whose change counts as an update (and goes into the history). */
export const TRACKED: (keyof Task)[] = ['title', 'description', 'status', 'priority', 'assignee', 'due_date', 'assigned_at', 'flag', 'track', 'project_id', 'blocked_reason', 'blocked_by', 'link', 'requested_by', 'collaborators', 'watchers', 'private', 'deadline', 'kr_id', 'sprint_id', 'points', 'plan_id']

export function stampTask(prev: Task | undefined, next: Task): Task {
  const out = { ...next }
  const cat = catOf(out.status)
  out.completed_at = cat === 'done' ? out.completed_at || prev?.completed_at || todayISO() : ''
  if (cat === 'blocked') {
    out.blocked_since = prev && catOf(prev.status) === 'blocked' ? prev.blocked_since || out.blocked_since || todayISO() : out.blocked_since || todayISO()
  } else {
    // the history keeps the old reason; the task itself is no longer blocked
    out.blocked_since = ''
    out.blocked_reason = ''
    out.blocked_by = ''
  }
  // a (new) lead assignee starts the assign clock, unless the date was set by hand in this save
  const handSet = (out.assigned_at || '') !== (prev?.assigned_at || '')
  if (lead(out) && !handSet && (!prev || lead(prev) !== lead(out) || !out.assigned_at)) out.assigned_at = prev && lead(prev) === lead(out) ? prev.assigned_at || todayISO() : todayISO()
  if (!prev || TRACKED.some((k) => String(prev[k] ?? '') !== String(out[k] ?? ''))) out.updated_at = nowStamp()
  return out
}
