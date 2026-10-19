import type { DB, Health, Project, Task, Sprint, Risk } from './types'
import { daysBetween, daysFromToday, todayISO, addDays, parseISO, fa } from './jalali'
import { L } from './i18n'

export interface HealthReason {
  level: Health
  text: string
}

export interface ProjectMetrics {
  progress: number
  elapsed: number // % of timeline elapsed
  scheduleGap: number // progress - elapsed
  daysLeft: number
  health: Health
  computedHealth: Health
  reasons: HealthReason[]
  overdueMilestones: number
  nextMilestone?: { title: string; planned_date: string }
  openTasks: number
  overdueTasks: number
  blockedTasks: number
  doneTasks: number
  totalTasks: number
  highRisks: number
  openRisks: number
  activeSprint?: Sprint
  score: number // 0..100, higher = healthier
}

export const riskScore = (r: Pick<Risk, 'probability' | 'impact'>) => (Number(r.probability) || 0) * (Number(r.impact) || 0)
export const riskLevel = (score: number): Health => (score >= 15 ? 'red' : score >= 8 ? 'amber' : 'green')

export function isTaskOverdue(t: Task) {
  return t.status !== 'done' && !!t.due_date && daysFromToday(t.due_date) < 0
}

export function timelineElapsed(p: Pick<Project, 'start_date' | 'end_date'>) {
  const total = daysBetween(p.start_date, p.end_date)
  if (total <= 0) return 0
  const passed = daysBetween(p.start_date, todayISO())
  return Math.max(0, Math.min(100, (passed / total) * 100))
}

export function projectMetrics(p: Project, db: DB): ProjectMetrics {
  const ms = db.Milestones.filter((m) => m.project_id === p.id)
  const tasks = db.Tasks.filter((t) => t.project_id === p.id)
  const risks = db.Risks.filter((r) => r.project_id === p.id && r.status !== 'closed')
  const sprints = db.Sprints.filter((s) => s.project_id === p.id)

  // Progress: manual value wins; otherwise weighted milestones; otherwise tasks.
  const raw = p.progress as unknown
  let progress = raw === '' || raw === null || raw === undefined ? NaN : Number(raw)
  if (isNaN(progress)) {
    const tw = ms.reduce((a, m) => a + (Number(m.weight) || 1), 0)
    if (tw > 0) progress = (ms.filter((m) => m.status === 'done').reduce((a, m) => a + (Number(m.weight) || 1), 0) / tw) * 100
    else if (tasks.length) progress = (tasks.filter((t) => t.status === 'done').length / tasks.length) * 100
    else progress = 0
  }
  if (p.status === 'completed') progress = 100

  const elapsed = timelineElapsed(p)
  const scheduleGap = progress - elapsed
  // no deadline yet = nothing to be late against
  const daysLeft = p.end_date ? daysFromToday(p.end_date) : 9999

  const overdueMs = ms.filter((m) => m.status !== 'done' && m.planned_date && daysFromToday(m.planned_date) < 0)
  const upcoming = ms
    .filter((m) => m.status !== 'done')
    .sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))[0]
  const overdueTasks = tasks.filter(isTaskOverdue).length
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length
  const highRisks = risks.filter((r) => riskScore(r) >= 15).length
  const activeSprint = sprints.find((s) => s.status === 'active')

  // ---- Health engine: every rule contributes a penalty and a human-readable reason ----
  const reasons: HealthReason[] = []
  let penalty = 0
  const add = (level: Health, pts: number, text: string) => {
    reasons.push({ level, text })
    penalty += pts
  }

  const live = p.status === 'active' || p.status === 'planning'
  if (live) {
    if (scheduleGap <= -20) add('red', 35, L(`پیشرفت ${fa(Math.round(-scheduleGap))}٪ از زمان سپری‌شده عقب است`, `Progress is ${Math.round(-scheduleGap)}% behind elapsed time`))
    else if (scheduleGap <= -10) add('amber', 18, L(`پیشرفت ${fa(Math.round(-scheduleGap))}٪ از زمان سپری‌شده عقب است`, `Progress is ${Math.round(-scheduleGap)}% behind elapsed time`))

    if (daysLeft < 0 && progress < 100) add('red', 35, L(`ددلاین پروژه ${fa(-daysLeft)} روز گذشته است`, `Deadline passed ${-daysLeft} days ago`))
    else if (daysLeft <= 14 && progress < 85) add('amber', 15, L('کمتر از دو هفته تا ددلاین و پیشرفت زیر ۸۵٪', 'Under two weeks to deadline with progress below 85%'))

    if (overdueMs.length >= 2) add('red', 25, L(`${fa(overdueMs.length)} مایلستون عقب‌افتاده`, `${overdueMs.length} overdue milestones`))
    else if (overdueMs.length === 1) add('amber', 12, L(`مایلستون «${overdueMs[0].title}» عقب افتاده`, `Milestone “${overdueMs[0].title}” is overdue`))

    if (highRisks >= 2) add('red', 20, L(`${fa(highRisks)} ریسک با شدت بالا باز است`, `${highRisks} high-severity risks open`))
    else if (highRisks === 1) add('amber', 10, L('یک ریسک با شدت بالا باز است', 'One high-severity risk open'))


    if (blockedTasks >= 3) add('amber', 10, L(`${fa(blockedTasks)} تسک مسدود`, `${blockedTasks} blocked tasks`))
    if (overdueTasks >= 5) add('amber', 10, L(`${fa(overdueTasks)} تسک عقب‌افتاده`, `${overdueTasks} overdue tasks`))

    if (activeSprint && Number(activeSprint.committed_points) > 0) {
      const sElapsed = Math.max(0, Math.min(1, daysBetween(activeSprint.start_date, todayISO()) / Math.max(1, daysBetween(activeSprint.start_date, activeSprint.end_date))))
      const sDone = sprintDonePoints(activeSprint, db) / Number(activeSprint.committed_points)
      if (sElapsed > 0.5 && sDone < sElapsed - 0.3) add('amber', 8, L('اسپرینت جاری از برنامه عقب است', 'Current sprint is behind plan'))
    }
  }

  const score = Math.max(10, 100 - penalty) // floor: a zero reads as missing data, not "very unhealthy"
  const computedHealth: Health = reasons.some((r) => r.level === 'red') || score < 55 ? 'red' : reasons.some((r) => r.level === 'amber') || score < 85 ? 'amber' : 'green'
  const health: Health = (p.health_override as Health) || computedHealth
  if (!reasons.length) reasons.push({ level: 'green', text: L('همه‌ی شاخص‌ها در محدوده‌ی برنامه هستند', 'All signals within plan') })

  return {
    progress: Math.round(progress),
    elapsed: Math.round(elapsed),
    scheduleGap: Math.round(scheduleGap),
    daysLeft,
    health,
    computedHealth,
    reasons,
    overdueMilestones: overdueMs.length,
    nextMilestone: upcoming,
    openTasks: tasks.filter((t) => t.status !== 'done').length,
    overdueTasks,
    blockedTasks,
    doneTasks: tasks.filter((t) => t.status === 'done').length,
    totalTasks: tasks.length,
    highRisks,
    openRisks: risks.length,
    activeSprint,
    score,
  }
}

export function sprintTasks(s: Sprint, db: DB) {
  return db.Tasks.filter((t) => t.sprint_id === s.id)
}

export function sprintDonePoints(s: Sprint, db: DB) {
  const ts = sprintTasks(s, db)
  if (!ts.length) return Number(s.completed_points) || 0
  return ts.filter((t) => t.status === 'done').reduce((a, t) => a + (Number(t.points) || 0), 0)
}

export function sprintCommitted(s: Sprint, db: DB) {
  const c = Number(s.committed_points)
  if (c) return c
  return sprintTasks(s, db).reduce((a, t) => a + (Number(t.points) || 0), 0)
}

/** Burndown built from task completion dates. */
export function burndown(s: Sprint, db: DB) {
  const committed = sprintCommitted(s, db)
  const ts = sprintTasks(s, db)
  const len = Math.max(1, daysBetween(s.start_date, s.end_date))
  const today = todayISO()
  const rows: { day: string; ideal: number; actual: number | null }[] = []
  for (let i = 0; i <= len; i++) {
    const day = addDays(s.start_date, i)
    const doneBy = ts
      .filter((t) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) <= day)
      .reduce((a, t) => a + (Number(t.points) || 0), 0)
    const useFallback = !ts.length
    const actual = day > today ? null : useFallback ? committed - (Number(s.completed_points) || 0) * (i / len) : committed - doneBy
    rows.push({ day, ideal: Math.round((committed * (1 - i / len)) * 10) / 10, actual })
  }
  return rows
}

export function portfolioSummary(db: DB) {
  const live = db.Projects.filter((p) => p.status === 'active' || p.status === 'planning' || p.status === 'on_hold')
  const ms = new Map(db.Projects.map((p) => [p.id, projectMetrics(p, db)]))
  const counts = { green: 0, amber: 0, red: 0 } as Record<Health, number>
  live.forEach((p) => counts[ms.get(p.id)!.health]++)
  const avgProgress = live.length ? Math.round(live.reduce((a, p) => a + ms.get(p.id)!.progress, 0) / live.length) : 0
  const today = todayISO()
  const in30 = addDays(today, 30)
  const upcomingMilestones = db.Milestones.filter((m) => m.status !== 'done' && m.planned_date >= today && m.planned_date <= in30).sort((a, b) =>
    a.planned_date < b.planned_date ? -1 : 1,
  )
  const overdueMilestones = db.Milestones.filter((m) => m.status !== 'done' && m.planned_date && m.planned_date < today)
  return { live, metrics: ms, counts, avgProgress, upcomingMilestones, overdueMilestones }
}

export function inRange(iso: string, from: string, to: string) {
  const d = parseISO(iso)
  return !!d && iso >= from && iso <= to
}
