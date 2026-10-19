// Multi-dimension RAG assessment — the view a portfolio director actually reads:
// per project, which dimension is off (schedule, scope, risk, resourcing, delivery),
// why, and whether it is getting better or worse.
import type { DB, Health, Project } from './types'
import { closed } from './columns'
import { projectMetrics, riskScore, sprintDonePoints, isTaskOverdue } from './metrics'
import { addDays, daysBetween, fa, todayISO } from './jalali'
import { L, type T2 } from './i18n'
import { allocActive, memberWeek } from './capacity'
import { weekStart } from './weeks'

export type Dim = 'schedule' | 'scope' | 'risk' | 'resourcing' | 'delivery'
export const DIMS: Dim[] = ['schedule', 'scope', 'risk', 'resourcing', 'delivery']
export const DIM: Record<Dim, T2> = {
  schedule: ['زمان‌بندی', 'Schedule'],
  scope: ['محدوده‌ی کار', 'Scope'],
  risk: ['ریسک', 'Risk'],
  resourcing: ['منابع', 'Resourcing'],
  delivery: ['تحویل', 'Delivery'],
}

export interface DimRating {
  h: Health
  why: string
}
export type Trend = 'up' | 'down' | 'flat' | 'none'

export interface Assessment {
  dims: Record<Dim, DimRating>
  overall: Health
  trend: Trend
  history: Health[] // last weekly-update readings, oldest → newest
}

const rank: Record<Health, number> = { green: 0, amber: 1, red: 2 }

export function assess(p: Project, db: DB): Assessment {
  const m = projectMetrics(p, db)
  const today = todayISO()

  // Schedule
  let schedule: DimRating
  if (m.daysLeft < 0 && m.progress < 100) schedule = { h: 'red', why: L(`ددلاین ${fa(-m.daysLeft)} روز گذشته`, `Deadline passed ${-m.daysLeft}d ago`) }
  else if (m.scheduleGap <= -20 || m.overdueMilestones >= 2) schedule = { h: 'red', why: m.overdueMilestones >= 2 ? L(`${fa(m.overdueMilestones)} مایلستون معوق`, `${m.overdueMilestones} milestones late`) : L(`${fa(-m.scheduleGap)}٪ عقب از زمان`, `${-m.scheduleGap}% behind time`) }
  else if (m.scheduleGap <= -10 || m.overdueMilestones === 1) schedule = { h: 'amber', why: m.overdueMilestones ? L('یک مایلستون معوق', 'One milestone late') : L(`${fa(-m.scheduleGap)}٪ عقب از زمان`, `${-m.scheduleGap}% behind time`) }
  else if (m.daysLeft <= 14 && m.progress < 85) schedule = { h: 'amber', why: L('ددلاین نزدیک، کار زیاد مانده', 'Deadline close, work remaining') }
  else schedule = { h: 'green', why: m.scheduleGap >= 0 ? L(`${fa(m.scheduleGap)}٪ جلوتر از زمان`, `${m.scheduleGap}% ahead`) : L('در محدوده‌ی برنامه', 'Within plan') }

  // Scope: recent or pending change requests
  const since = addDays(today, -45)
  const changes = db.Scope.filter((s) => s.project_id === p.id && (s.status === 'changed' || s.status === 'removed') && s.date >= since)
  const pendingCR = db.Scope.filter((s) => s.project_id === p.id && s.status === 'changed' && s.type === 'in')
  const scope: DimRating =
    changes.length >= 3
      ? { h: 'red', why: L(`${fa(changes.length)} تغییر محدوده‌ی کار در ۴۵ روز`, `${changes.length} scope changes in 45d`) }
      : pendingCR.length || changes.length
        ? { h: 'amber', why: pendingCR.length ? L(`${fa(pendingCR.length)} درخواست تغییر باز`, `${pendingCR.length} open change request(s)`) : L('تغییر اخیر در محدوده‌ی کار', 'Recent scope change') }
        : { h: 'green', why: L('محدوده‌ی کار پایدار', 'Scope stable') }

  // Risk
  const open = db.Risks.filter((r) => r.project_id === p.id && r.status !== 'closed' && r.type !== 'decision')
  const lateAction = open.filter((r) => r.due_date && r.due_date < today && riskScore(r) >= 8)
  const risk: DimRating =
    m.highRisks >= 2
      ? { h: 'red', why: L(`${fa(m.highRisks)} ریسک بحرانی`, `${m.highRisks} critical risks`) }
      : m.highRisks === 1 || lateAction.length
        ? { h: 'amber', why: m.highRisks ? L('یک ریسک بحرانی', 'One critical risk') : L('اقدام ریسک عقب افتاده', 'Risk action overdue') }
        : { h: 'green', why: open.length ? L(`${fa(open.length)} ریسک کنترل‌شده`, `${open.length} risks under control`) : L('ریسک بازی نیست', 'No open risks') }

  // Resourcing: people on this project who are over capacity this week (net of leave)
  const members = db.Allocations.filter((a) => a.project_id === p.id && allocActive(a, weekStart())).map((a) => a.member_id)
  const overloaded = members.filter((id) => {
    const mem = db.Team.find((x) => x.id === id)
    return mem && memberWeek(db, mem).load > 100
  })
  const resourcing: DimRating =
    overloaded.length >= 3
      ? { h: 'red', why: L(`${fa(overloaded.length)} نفر بیش از ظرفیت`, `${overloaded.length} people over capacity`) }
      : overloaded.length
        ? { h: 'amber', why: L(`${fa(overloaded.length)} نفر بیش از ظرفیت`, `${overloaded.length} over capacity`) }
        : { h: 'green', why: members.length ? L('ظرفیت کافی', 'Capacity OK') : L('تخصیص ثبت نشده', 'No allocations') }

  // Delivery: blocked / overdue work and sprint pace
  const tasks = db.Tasks.filter((t) => t.project_id === p.id && !closed(t))
  const blocked = tasks.filter((t) => t.status === 'blocked').length
  const late = tasks.filter(isTaskOverdue).length
  let sprintBehind = false
  if (m.activeSprint) {
    const s = m.activeSprint
    const committed = Number(s.committed_points) || db.Tasks.filter((t) => t.sprint_id === s.id).reduce((a, t) => a + (Number(t.points) || 0), 0)
    const t = Math.min(1, Math.max(0, daysBetween(s.start_date, today) / Math.max(1, daysBetween(s.start_date, s.end_date))))
    sprintBehind = committed > 0 && t > 0.5 && sprintDonePoints(s, db) / committed < t - 0.3
  }
  const delivery: DimRating =
    blocked >= 2 || late >= 4
      ? { h: 'red', why: L(`${fa(blocked)} مسدود · ${fa(late)} معوق`, `${blocked} blocked · ${late} late`) }
      : blocked || late >= 2 || sprintBehind
        ? { h: 'amber', why: sprintBehind ? L('اسپرینت عقب است', 'Sprint behind') : L(`${fa(blocked)} مسدود · ${fa(late)} معوق`, `${blocked} blocked · ${late} late`) }
        : { h: 'green', why: L('جریان کار روان', 'Flowing') }

  const dims = { schedule, scope, risk, resourcing, delivery }
  const history = db.Updates.filter((u) => u.project_id === p.id)
    .sort((a, b) => (a.week_date < b.week_date ? -1 : 1))
    .slice(-6)
    .map((u) => u.health)
  let trend: Trend = 'none'
  if (history.length >= 2) {
    const a = rank[history[history.length - 2]]
    const b = rank[history[history.length - 1]]
    trend = b < a ? 'up' : b > a ? 'down' : 'flat'
  }
  return { dims, overall: m.health, trend, history }
}
