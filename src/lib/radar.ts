// What the Radar watches on a task: every date it carries (due, follow-up, hand-off, testing, deadline).
import type { Task } from './types'
import { closed } from './columns'
import { addDays, todayISO } from './jalali'
import { L } from './i18n'
import { fieldOn } from './taskcfg'
import { isAssignee } from './assignees'

export interface TaskDate {
  key: 'due_date' | 'follow_date' | 'handoff_date' | 'test_date' | 'deadline'
  d: string
  label: string
}

export function taskDates(t: Task): TaskDate[] {
  const all: TaskDate[] = [
    { key: 'due_date', d: t.due_date, label: L('ددلاین', 'Deadline') },
    { key: 'follow_date', d: t.follow_date || '', label: L('یادآوری', 'Reminder') },
    { key: 'handoff_date', d: t.handoff_date || '', label: L('تحویل به پروداکت', 'Hand-off') },
    { key: 'test_date', d: t.test_date || '', label: L('تست', 'Testing') },
    { key: 'deadline', d: t.deadline || '', label: L('ددلاین', 'Deadline') },
  ]
  return all.filter((x) => x.d && (x.key === 'due_date' || fieldOn(x.key))).sort((a, b) => a.d.localeCompare(b.d))
}

/** Late = the due date or the deadline has passed (follow-up and stage dates only prompt). */
export const isLate = (t: Task, today = todayISO()) => !closed(t) && ((!!t.due_date && t.due_date < today) || (!!t.deadline && t.deadline < today))

/** The next date coming up (today or later), or the most recent one if all have passed. */
export function nextDate(t: Task, today = todayISO()): TaskDate | undefined {
  const ds = taskDates(t)
  return ds.find((x) => x.d >= today) || ds[ds.length - 1]
}

export type Bucket = 'late' | 'today' | 'week' | 'blocked' | 'later'
export function bucketOf(t: Task, today = todayISO()): Bucket {
  if (isLate(t, today)) return 'late'
  if (t.status === 'blocked') return 'blocked'
  const ds = taskDates(t).map((x) => x.d)
  if (ds.includes(today)) return 'today'
  if (ds.some((d) => d > today && d <= addDays(today, 7))) return 'week'
  return 'later'
}

/** Tracked by me: I follow it, or I gave it to someone else. */
export const tracking = (t: Task, me: string) =>
  !!me && (String(t.watchers || '').split(',').map((x) => x.trim()).includes(me) || (t.reporter === me && !!t.assignee && !isAssignee(t, me)))
