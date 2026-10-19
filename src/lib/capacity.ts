// Time-phased capacity: allocations (with optional date windows) against each person's
// availability. Units are "% of one full-time person" so a team row can say 600.
import type { Allocation, DB, Member, Track } from './types'
import { addDays } from './jalali'
import { weekStart } from './weeks'

export const capOf = (m: Member) => Number(m.capacity) || 100

/** Allocation active at any point in the week starting ws. */
export function allocActive(a: Allocation, ws: string) {
  const we = addDays(ws, 6)
  return (!a.start_date || a.start_date <= we) && (!a.end_date || a.end_date >= ws)
}

interface WeekLoad {
  ws: string
  capacity: number // nominal
  available: number // after leave
  allocated: number
  load: number // allocated / available, %
  leaveDays: number
  free: number // available - allocated (can be negative)
  projects: { project_id: string; percent: number }[]
}

export function memberWeek(db: DB, m: Member, ws: string = weekStart()): WeekLoad {
  const capacity = capOf(m)
  const leaveDays = 0
  const available = capacity
  // paused, finished or cancelled projects don't consume anyone's capacity
  const idle = new Set(db.Projects.filter((p) => p.status === 'on_hold' || p.status === 'completed' || p.status === 'cancelled').map((p) => p.id))
  const projects = db.Allocations.filter((a) => a.member_id === m.id && !idle.has(a.project_id) && allocActive(a, ws)).map((a) => ({ project_id: a.project_id, percent: Number(a.percent) || 0 }))
  const allocated = projects.reduce((s, p) => s + p.percent, 0)
  const load = available > 0 ? Math.round((allocated / available) * 100) : allocated > 0 ? 999 : 0
  return { ws, capacity, available, allocated, load, leaveDays, free: available - allocated, projects }
}

export const loadTone = (load: number) => (load > 100 ? 'red' : load >= 85 ? 'amber' : load >= 40 ? 'green' : 'muted') as 'red' | 'amber' | 'green' | 'muted'

/** Members who are over capacity in the given week. */
export function overloaded(db: DB, ws: string = weekStart()) {
  return db.Team.map((m) => ({ m, w: memberWeek(db, m, ws) })).filter((x) => x.w.load > 100)
}

/** Supply vs demand for a track (or everyone) in FTE. */
export function trackWeek(db: DB, track: Track | 'all', ws: string = weekStart()) {
  const people = db.Team.filter((m) => (track === 'all' ? true : m.track === track))
  const rows = people.map((m) => memberWeek(db, m, ws))
  const available = rows.reduce((s, r) => s + r.available, 0)
  const allocated = rows.reduce((s, r) => s + r.allocated, 0)
  return { ws, people: people.length, available, allocated, load: available ? Math.round((allocated / available) * 100) : 0, over: rows.filter((r) => r.load > 100).length }
}
