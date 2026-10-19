import type { DB } from './types'
import { L } from './i18n'

export interface Activity {
  id: string
  who: string
  verb: string
  what: string
  when: string // "YYYY-MM-DD" or "YYYY-MM-DD HH:mm"
  kind: 'comment' | 'done' | 'update' | 'milestone' | 'followup' | 'created'
  project_id: string
  target?: { sheet: 'Tasks' | 'FollowUps' | 'Updates' | 'Milestones'; id: string }
}

/** Derives a recent-activity feed from what's in the sheet (no separate log needed). */
export function buildActivity(db: DB, projectId?: string, limit = 30): Activity[] {
  const out: Activity[] = []
  const inProj = (pid: string) => !projectId || pid === projectId
  const taskProj = (id: string) => db.Tasks.find((t) => t.id === id)?.project_id || ''

  db.Comments.forEach((c) => {
    const pid = c.entity === 'Projects' ? c.entity_id : c.entity === 'Tasks' ? taskProj(c.entity_id) : db.FollowUps.find((f) => f.id === c.entity_id)?.project_id || ''
    if (!inProj(pid)) return
    const what = c.entity === 'Tasks' ? db.Tasks.find((t) => t.id === c.entity_id)?.title : c.entity === 'FollowUps' ? db.FollowUps.find((f) => f.id === c.entity_id)?.subject : db.Projects.find((p) => p.id === c.entity_id)?.name
    out.push({ id: `c-${c.id}`, who: c.author, verb: L('نظر داد روی', 'commented on'), what: what || '', when: c.created_at, kind: 'comment', project_id: pid, target: c.entity === 'Tasks' || c.entity === 'FollowUps' ? { sheet: c.entity, id: c.entity_id } : undefined })
  })
  db.Tasks.filter((t) => t.status === 'done' && t.completed_at && inProj(t.project_id)).forEach((t) =>
    out.push({ id: `d-${t.id}`, who: t.assignee.split(',')[0] || '', verb: L('انجام داد', 'completed'), what: t.title, when: t.completed_at, kind: 'done', project_id: t.project_id, target: { sheet: 'Tasks', id: t.id } }),
  )
  db.Updates.filter((u) => inProj(u.project_id)).forEach((u) =>
    out.push({ id: `u-${u.id}`, who: u.author, verb: L('گزارش هفتگی ثبت کرد برای', 'posted a weekly update on'), what: db.Projects.find((p) => p.id === u.project_id)?.name || '', when: u.week_date, kind: 'update', project_id: u.project_id, target: { sheet: 'Updates', id: u.id } }),
  )
  db.Milestones.filter((m) => m.status === 'done' && m.actual_date && inProj(m.project_id)).forEach((m) =>
    out.push({ id: `m-${m.id}`, who: m.owner, verb: L('به مایلستون رسید', 'hit milestone'), what: m.title, when: m.actual_date, kind: 'milestone', project_id: m.project_id, target: { sheet: 'Milestones', id: m.id } }),
  )
  db.FollowUps.filter((f) => f.status === 'done' && f.done_at && inProj(f.project_id)).forEach((f) =>
    out.push({ id: `f-${f.id}`, who: f.person, verb: L('پاسخ داد درباره‌ی', 'closed the loop on'), what: f.subject, when: f.done_at, kind: 'followup', project_id: f.project_id, target: { sheet: 'FollowUps', id: f.id } }),
  )
  return out.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, limit)
}
