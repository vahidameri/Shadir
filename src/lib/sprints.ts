// Sprints for the teams that work in them (the tech team by default): a backlog, sprints that are
// planned, started and completed, story points, issue types and readable keys (TECH-42).
// When a sprint starts its scope is frozen as committed_points; work added afterwards shows up as
// scope change (read from the History log of sprint_id), and the burndown and velocity are built
// from task completion dates. Settings: Config sprint.teams / sprint.days / sprint.prefix.
import type { DB, IssueType, Sprint, Task } from './types'
import { TRACK, TRACKS } from './tracks'
import { L, lbl, type T2 } from './i18n'
import { addDays, daysBetween, todayISO } from './jalali'
import { catOf, closed } from './columns'
import { teamOf } from './teams'

export const SPRINT_KEYS = { teams: 'sprint.teams', days: 'sprint.days', prefix: 'sprint.prefix' } as const
export interface SprintCfg { teams: string[]; days: number; prefix: string }
let cfg: SprintCfg = { teams: [], days: 14, prefix: 'TECH' }
export const sprintCfg = () => cfg
export function readSprintCfg(get: (k: string) => string | undefined): SprintCfg {
  const set = String(get(SPRINT_KEYS.teams) || '').split(',').map((x) => x.trim()).filter(Boolean)
  // until it is set, any team whose id or name says "tech" works in sprints
  const teams = set.length ? set : TRACKS.filter((t) => /tech|dev|eng|فنی|فناوری/i.test(`${t} ${lbl(TRACK, t)}`))
  return { teams, days: Number(get(SPRINT_KEYS.days)) || 14, prefix: String(get(SPRINT_KEYS.prefix) || 'TECH').trim().toUpperCase() }
}
export const setSprintCfg = (c: SprintCfg) => (cfg = c)
export const sprintTeam = (team: string) => !!team && cfg.teams.includes(team)

export const ISSUE: Record<Exclude<IssueType, ''>, { label: T2; tone: string }> = {
  story: { label: ['استوری', 'Story'], tone: 'bg-good/15 text-good' },
  task: { label: ['تسک', 'Task'], tone: 'bg-ink/10 text-ink' },
  bug: { label: ['باگ', 'Bug'], tone: 'bg-bad/15 text-bad' },
  spike: { label: ['بررسی (Spike)', 'Spike'], tone: 'bg-warn/15 text-warn' },
}
export const SPRINT_LABEL: Record<Sprint['status'], T2> = { planned: ['برنامه‌ریزی‌شده', 'Planned'], active: ['در جریان', 'Active'], closed: ['بسته‌شده', 'Completed'] }

export const pts = (t: Pick<Task, 'points'>) => Number(t.points) || 0
const sum = (ts: Task[]) => ts.reduce((a, t) => a + pts(t), 0)
const isDone = (t: Task) => catOf(t.status) === 'done'

export const sprintsOf = (db: DB, team: string) => db.Sprints.filter((s) => (s.team || '') === team).sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.name.localeCompare(b.name)))
export const activeSprint = (db: DB, team: string) => sprintsOf(db, team).find((s) => s.status === 'active')
export const plannedSprints = (db: DB, team: string) => sprintsOf(db, team).filter((s) => s.status === 'planned')
export const tasksIn = (db: DB, s: Sprint) => db.Tasks.filter((t) => t.sprint_id === s.id && t.status !== 'cancelled')
/** The team's open work that is in no live sprint. */
export function backlogOf(db: DB, team: string) {
  const live = new Set(db.Sprints.filter((s) => s.status !== 'closed').map((s) => s.id))
  return db.Tasks.filter((t) => !closed(t) && teamOf(t, db) === team && (!t.sprint_id || !live.has(t.sprint_id)))
}

/** Next readable key for the team's work, e.g. TECH-43. */
export function nextKey(db: DB, prefix = cfg.prefix) {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  const max = db.Tasks.reduce((m, t) => Math.max(m, Number(re.exec(String(t.key || ''))?.[1]) || 0), 0)
  return `${prefix}-${max + 1}`
}

const stampDay = (s?: string) => String(s || '').slice(0, 10)

export interface SprintStats {
  tasks: Task[]
  total: number
  done: number
  remaining: number
  committed: number
  added: { tasks: Task[]; points: number }
  removed: number
  carried: Task[]
  blocked: Task[]
  unestimated: number
  daysLeft: number
  elapsed: number
  pct: number
}

/** Ids of the work moved on when the sprint was completed. */
const carriedIds = (s: Sprint) => new Set(String(s.carried || '').split(',').map((x) => x.trim()).filter(Boolean))

export function sprintStats(db: DB, s: Sprint, today = todayISO()): SprintStats {
  // a completed sprint keeps the unfinished work it handed on
  const gone = carriedIds(s)
  const tasks = [...tasksIn(db, s), ...db.Tasks.filter((t) => gone.has(t.id) && t.sprint_id !== s.id)]
  const total = sum(tasks)
  const done = sum(tasks.filter(isDone))
  const started = s.started_at || (s.status !== 'planned' ? `${s.start_date} 00:00` : '')
  // scope change: work moved into or out of the sprint after it started
  const moves = started ? db.History.filter((h) => h.entity === 'Tasks' && h.field === 'sprint_id' && h.at > started) : []
  // added: moved in after the start, or created after the start (straight onto the board)
  const created = new Set(started ? db.History.filter((h) => h.entity === 'Tasks' && h.field === '_created' && h.at > started).map((h) => h.entity_id) : [])
  const addedIds = new Set([...moves.filter((h) => h.to === s.id).map((h) => h.entity_id), ...created])
  const addedTasks = tasks.filter((t) => addedIds.has(t.id) && !gone.has(t.id))
  const removed = new Set(moves.filter((h) => h.from === s.id && h.to !== s.id && !gone.has(h.entity_id)).map((h) => h.entity_id)).size
  const committed = s.status === 'planned' ? total : Number(s.committed_points) || total
  const len = Math.max(1, daysBetween(s.start_date, s.end_date))
  const el = s.status === 'closed' ? 100 : s.status === 'planned' ? 0 : Math.max(0, Math.min(100, Math.round((daysBetween(s.start_date, today) / len) * 100)))
  return {
    tasks,
    total,
    done,
    remaining: total - done,
    committed,
    added: { tasks: addedTasks, points: sum(addedTasks) },
    removed,
    carried: tasks.filter((t) => !isDone(t)),
    blocked: tasks.filter((t) => catOf(t.status) === 'blocked'),
    unestimated: tasks.filter((t) => !pts(t)).length,
    daysLeft: s.status === 'closed' ? 0 : Math.max(0, daysBetween(today, s.end_date)),
    elapsed: el,
    pct: total ? Math.round((done / total) * 100) : 0,
  }
}

/** Remaining points per day (scope that day minus what was done by then) against the ideal line. */
export function burndown(db: DB, s: Sprint, today = todayISO()) {
  const st = sprintStats(db, s, today)
  const days = Math.max(1, daysBetween(s.start_date, s.end_date))
  const addedAt = new Map<string, string>()
  db.History.filter((h) => h.entity === 'Tasks' && ((h.field === 'sprint_id' && h.to === s.id) || h.field === '_created')).forEach((h) => addedAt.set(h.entity_id, stampDay(h.at)))
  const last = s.status === 'closed' ? stampDay(s.closed_at) || s.end_date : today
  const rows: { day: string; ideal: number; remaining: number | null }[] = []
  for (let i = 0; i <= days; i++) {
    const day = addDays(s.start_date, i)
    const inScope = st.tasks.filter((t) => !st.added.tasks.includes(t) || (addedAt.get(t.id) || '') <= day)
    const scope = sum(inScope)
    const doneBy = sum(inScope.filter((t) => isDone(t) && stampDay(t.completed_at) && stampDay(t.completed_at) <= day))
    rows.push({ day, ideal: Math.round(st.committed * (1 - i / days) * 10) / 10, remaining: day > last ? null : scope - doneBy })
  }
  return rows
}

/** The team's last completed sprints: what was committed and what was done. */
export function velocity(db: DB, team: string, n = 6) {
  return sprintsOf(db, team)
    .filter((s) => s.status === 'closed')
    .slice(-n)
    .map((s) => ({ s, committed: Number(s.committed_points) || 0, completed: Number(s.completed_points) || sprintStats(db, s).done }))
}
export function avgVelocity(db: DB, team: string) {
  const v = velocity(db, team, 3)
  return v.length ? Math.round(v.reduce((a, x) => a + x.completed, 0) / v.length) : 0
}

/** A default name and dates for the next sprint: right after the last one. */
export function nextSprintDraft(db: DB, team: string) {
  const all = sprintsOf(db, team)
  const last = all[all.length - 1]
  const start = last && last.end_date >= todayISO() ? addDays(last.end_date, 1) : todayISO()
  const n = all.length + 1
  return { team, name: L(`اسپرینت ${n}`, `Sprint ${n}`), start_date: start, end_date: addDays(start, cfg.days - 1), status: 'planned', goal: '', committed_points: 0, completed_points: 0, project_id: '' }
}
