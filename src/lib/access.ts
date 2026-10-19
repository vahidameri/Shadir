// Who sees what. The Apps Script backend applies the same rules before any row leaves the
// Sheet; the client mirrors them (and in the demo, "view as" switches the viewer).
//   super  — program manager: everything, plus the back office
//   exec   — CEO: everything except the back office; sees contracts
//   head   — heads of product / tech: portfolio-wide views, no contracts
//   member — product managers & designer: only the projects they work on, their own follow-ups,
//            and their own + shared tasks (plus all tasks of the projects they lead)
import type { Access, DB } from './types'

export const isLeader = (a: Access) => a === 'super' || a === 'exec' || a === 'head'
export const can = {
  portfolio: isLeader,
  contracts: (a: Access) => a === 'super' || a === 'exec',
  backoffice: (a: Access) => a === 'super',
  /** create projects, people and allocations */
  manage: isLeader,
  allFollowUps: (a: Access) => a === 'super' || a === 'exec',
  /** the Mizito queue and the people registry: the CPTO and the PgM */
  mizito: (a: Access) => a === 'super' || a === 'exec',
}

export function accessOf(db: DB, name: string, demo: boolean): Access {
  const m = db.Team.find((x) => x.name === name)
  return (m?.access as Access) || (demo ? 'super' : 'member')
}

const names = (s: string) => String(s || '').split(',').map((x) => x.trim())

/** A task is someone's when they do it, created it, or it is shared with them or tracked by them. */
export const isMine = (t: { assignee: string; reporter: string; collaborators?: string; watchers?: string }, me: string) =>
  !!me && (names(t.assignee).includes(me) || t.reporter === me || names(t.collaborators || '').includes(me) || names(t.watchers || '').includes(me))

/** Projects a member is involved in. */
export function relatedProjects(db: DB, me: string) {
  const id = db.Team.find((m) => m.name === me)?.id
  const set = new Set<string>()
  db.Projects.forEach((p) => p.owner === me && set.add(p.id))
  db.Allocations.forEach((a) => a.member_id === id && set.add(a.project_id))
  db.Tasks.forEach((t) => t.project_id && names(t.assignee).includes(me) && set.add(t.project_id))
  db.Deliverables.forEach((d) => d.owner === me && set.add(d.project_id))
  return set
}

export function scopeDB(db: DB, me: string, access: Access): DB {
  const privateOwners = new Set(db.Team.filter((m) => String(m.tasks_private) === '1').map((m) => m.name))
  const FollowUps = can.allFollowUps(access)
    ? db.FollowUps.filter((f) => !f.owner || f.owner === me || !privateOwners.has(f.owner))
    : db.FollowUps.filter((f) => f.owner === me || f.person === me)
  let out: DB = { ...db, FollowUps }
  if (!can.contracts(access)) out = { ...out, Contracts: [], Files: out.Files.filter((f) => f.entity !== 'Contracts') }
  if (!can.mizito(access)) out = { ...out, Mizito: [], MizitoMentions: [], Contacts: [], History: out.History.filter((h) => h.entity !== 'Mizito') }
  if (isLeader(access)) return out

  const ok = relatedProjects(db, me)
  const inP = (pid: string) => !!pid && ok.has(pid)
  const myId = db.Team.find((m) => m.name === me)?.id
  // members see their own tasks, the ones shared with them, and every task of a project they lead
  const led = new Set(db.Projects.filter((p) => p.owner === me).map((p) => p.id))
  // a hand-off assigned to me brings its task along so it can be accepted or returned
  const forMe = (h: { to_person: string }) => h.to_person === me
  const handed = new Set(out.Handoffs.filter(forMe).map((h) => h.task_id))
  const Tasks = out.Tasks.filter((t) => isMine(t, me) || led.has(t.project_id) || handed.has(t.id))
  const Meetings = out.Meetings.filter((m) => names(m.attendees).includes(me) || m.facilitator === me || inP(m.project_id))
  const visible: Record<string, Set<string>> = {
    Tasks: new Set(Tasks.map((t) => t.id)),
    Projects: ok,
    Meetings: new Set(Meetings.map((m) => m.id)),
    FollowUps: new Set(FollowUps.map((f) => f.id)),
    Deliverables: new Set(out.Deliverables.filter((d) => inP(d.project_id)).map((d) => d.id)),
    Team: new Set(out.Team.map((m) => m.id)),
    Risks: new Set(out.Risks.filter((r) => inP(r.project_id)).map((r) => r.id)),
  }
  // hand-offs: the ones I sent or received, and those on tasks I can see
  const Handoffs = out.Handoffs.filter((h) => h.from_person === me || forMe(h) || visible.Tasks.has(h.task_id) || (!h.task_id && inP(h.project_id)))
  return {
    ...out,
    Handoffs,
    Deliveries: out.Deliveries.filter((x) => inP(x.project_id)),
    Projects: out.Projects.filter((p) => ok.has(p.id)),
    Milestones: out.Milestones.filter((x) => inP(x.project_id)),
    Sprints: out.Sprints.filter((x) => inP(x.project_id)),
    Scope: out.Scope.filter((x) => inP(x.project_id)),
    Risks: out.Risks.filter((x) => inP(x.project_id)),
    Updates: out.Updates.filter((x) => inP(x.project_id)),
    Deliverables: out.Deliverables.filter((x) => inP(x.project_id)),
    Allocations: out.Allocations.filter((x) => inP(x.project_id) || x.member_id === myId),
    Tasks,
    Meetings,
    Comments: out.Comments.filter((c) => visible[c.entity]?.has(c.entity_id)),
    Files: out.Files.filter((f) => visible[f.entity]?.has(f.entity_id)),
    Contracts: [],
  }
}
