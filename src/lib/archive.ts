// Archived projects leave every everyday view (lists, boards, pickers, reminders) with all their
// tasks, milestones, deliverables… The rows stay in the Sheet; restoring brings everything back.
import type { DB, Project } from './types'

export const isArchived = (p: Pick<Project, 'archived'>) => String(p.archived || '') === '1'

const BY_PROJECT = ['Milestones', 'Sprints', 'Tasks', 'FollowUps', 'Risks', 'Scope', 'Updates', 'Deliverables', 'Allocations', 'Handoffs', 'Deliveries'] as const

export function hideArchived(db: DB): DB {
  const gone = new Set(db.Projects.filter(isArchived).map((p) => p.id))
  if (!gone.size) return db
  const out = { ...db, Projects: db.Projects.filter((p) => !gone.has(p.id)) } as DB
  for (const k of BY_PROJECT) (out as unknown as Record<string, { project_id: string }[]>)[k] = (db[k] as { project_id: string }[]).filter((r) => !gone.has(r.project_id))
  return out
}
