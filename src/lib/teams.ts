// Teams: the department's units (back office → titles & organisation → units). Each team has its
// projects (Project.team) and its tasks (the task's unit, else its project's team, else the
// assignee's unit). Team health is computed from the share of overdue and blocked work; the
// thresholds are settings (Config team.*).
import type { DB, Health, Project, Task } from './types'
import { TRACKS, trackOf } from './tracks'
import { catOf, closed } from './columns'
import { signals } from './signals'
import { daysBetween, todayISO } from './jalali'
import { isArchived } from './archive'
import type { StatusCat } from './types'

export const TEAM_KEYS = {
  redPct: 'team.red_pct', // overdue + long-blocked share of open tasks that turns a team red (default 25)
  amberPct: 'team.amber_pct', // … amber (default 10)
  doneDays: 'team.done_days', // "done recently" window in days (default 14)
} as const
export interface TeamCfg { redPct: number; amberPct: number; doneDays: number }
export function readTeamCfg(get: (k: string) => string | undefined): TeamCfg {
  return { redPct: Number(get(TEAM_KEYS.redPct)) || 25, amberPct: Number(get(TEAM_KEYS.amberPct)) || 10, doneDays: Number(get(TEAM_KEYS.doneDays)) || 14 }
}
let cfg: TeamCfg = { redPct: 25, amberPct: 10, doneDays: 14 }
export const teamCfg = () => cfg
export const setTeamCfg = (c: TeamCfg) => (cfg = c)

/** The team a task counts for. */
export function teamOf(t: Task, db: DB): string {
  const own = String(t.track || '')
  if (own) return own
  const p = t.project_id ? db.Projects.find((x) => x.id === t.project_id) : undefined
  return p?.team || trackOf(t, db) || ''
}

export interface TeamStats {
  id: string
  tasks: Task[]
  open: number
  late: number
  blocked: number
  blockedLong: number
  stale: number
  doneRecent: number
  byCat: Record<StatusCat, number>
  projects: Project[]
  members: string[]
  health: Health
  /** done share of the tasks that were open at some point in the window */
  pace: number
}

export function teamStats(db: DB, id: string): TeamStats {
  const today = todayISO()
  const tasks = db.Tasks.filter((t) => teamOf(t, db) === id)
  const openT = tasks.filter((t) => !closed(t) && catOf(t.status) !== 'intake')
  const byCat = { intake: 0, open: 0, active: 0, waiting: 0, blocked: 0, done: 0, cancelled: 0 } as Record<StatusCat, number>
  tasks.forEach((t) => byCat[catOf(t.status)]++)
  const sig = openT.map((t) => signals(t, today))
  const late = sig.filter((s) => s.late).length
  const blocked = openT.filter((t) => catOf(t.status) === 'blocked').length
  const blockedLong = sig.filter((s) => s.blockedLong).length
  const stale = sig.filter((s) => s.stale).length
  const doneRecent = tasks.filter((t) => catOf(t.status) === 'done' && t.completed_at && daysBetween(t.completed_at.slice(0, 10), today) <= cfg.doneDays).length
  const bad = openT.length ? ((late + blockedLong) / openT.length) * 100 : 0
  const health: Health = bad >= cfg.redPct ? 'red' : bad >= cfg.amberPct || blocked > 0 ? 'amber' : 'green'
  return {
    id,
    tasks,
    open: openT.length,
    late,
    blocked,
    blockedLong,
    stale,
    doneRecent,
    byCat,
    projects: db.Projects.filter((p) => p.team === id && !isArchived(p)),
    members: db.Team.filter((m) => m.track === id && String(m.active) !== 'false').map((m) => m.name),
    health,
    pace: doneRecent + openT.length ? Math.round((doneRecent / (doneRecent + openT.length)) * 100) : 0,
  }
}

/** Every team in the settings' order, plus "no team" when something has none. */
export function allTeams(db: DB): string[] {
  const used = new Set([...db.Projects.map((p) => p.team || ''), ...db.Tasks.map((t) => teamOf(t, db))])
  return [...TRACKS, ...(used.has('') ? [''] : [])]
}
