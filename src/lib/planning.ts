// Planning sessions: a meeting held once, for a purpose (a demo, closing the roadmap, a sprint, a
// release…), with what it covers, how ready that is, and a preparation checklist.
import type { DB, Deliverable, Meeting, Milestone, Task } from './types'
import { AGILE_SERIES } from './labels'

export type PlanItem =
  | { ref: string; kind: 'T'; row: Task }
  | { ref: string; kind: 'D'; row: Deliverable }
  | { ref: string; kind: 'M'; row: Milestone }

export const isPlanning = (m: Meeting) => AGILE_SERIES.includes(m.series)

/** 1.11.0 stored demos as their own series; they read as planning sessions for a demo. */
export const purposeOf = (m: Meeting) => m.purpose || (m.series === 'demo' ? 'demo' : m.series === 'retro' ? 'other' : 'sprint')

/** Purposes whose items have to be ready on the day (shown with a readiness bar). */
export const READY_PURPOSES = ['demo', 'release']

export const refsOf = (m: Meeting) => String(m.items || '').split(',').map((x) => x.trim()).filter(Boolean)

export function itemsOf(m: Meeting, db: DB): PlanItem[] {
  return refsOf(m).flatMap((ref): PlanItem[] => {
    const id = ref.slice(2)
    if (ref.startsWith('D:')) {
      const row = db.Deliverables.find((d) => d.id === id)
      return row ? [{ ref, kind: 'D', row }] : []
    }
    if (ref.startsWith('M:')) {
      const row = db.Milestones.find((x) => x.id === id)
      return row ? [{ ref, kind: 'M', row }] : []
    }
    const row = db.Tasks.find((t) => t.id === id)
    return row ? [{ ref, kind: 'T', row }] : []
  })
}

/** Ready: a task done or in review, an output delivered, a milestone done. */
export const isReady = (i: PlanItem) =>
  i.kind === 'D' ? i.row.status === 'delivered' : i.kind === 'M' ? i.row.status === 'done' : i.row.status === 'done' || i.row.status === 'review'

export function readiness(m: Meeting, db: DB) {
  const items = itemsOf(m, db)
  const ready = items.filter(isReady).length
  const prep = String(m.checklist || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const prepDone = prep.filter((l) => /^\[x\]/i.test(l)).length
  return { items, ready, total: items.length, pct: items.length ? Math.round((ready / items.length) * 100) : 0, prep: prep.length, prepDone }
}

/** A starting checklist for each purpose; editable per session. */
export const PREP: Record<string, [string, string][]> = {
  demo: [
    ['محیط استیج به‌روز و در دسترس است', 'Staging is up to date and reachable'],
    ['داده‌ی نمونه برای نمایش آماده است', 'Sample data for the demo is ready'],
    ['ترتیب ارائه و ارائه‌دهنده‌ی هر بخش مشخص است', 'Running order and presenters are set'],
    ['ذی‌نفعان دعوت شده‌اند', 'Stakeholders are invited'],
  ],
  roadmap: [
    ['اولویت‌ها و هدف‌های دوره روشن است', 'Priorities and goals for the period are clear'],
    ['ظرفیت تیم‌ها و واحدها بررسی شد', 'Team and unit capacity reviewed'],
    ['مایلستون‌ها و خروجی‌ها تاریخ دارند', 'Milestones and outputs have dates'],
    ['وابستگی‌ها و ریسک‌ها دیده شده‌اند', 'Dependencies and risks are covered'],
    ['تأیید مدیرعامل گرفته شد', 'CEO sign-off'],
  ],
  sprint: [
    ['بک‌لاگ اولویت‌بندی و برآورد شده است', 'Backlog is prioritised and estimated'],
    ['ظرفیت تیم در این اسپرینت مشخص است', 'Team capacity for the sprint is known'],
    ['هدف اسپرینت نوشته شده است', 'Sprint goal is written'],
  ],
  release: [
    ['تست نهایی انجام شد', 'Final testing done'],
    ['یادداشت انتشار آماده است', 'Release notes ready'],
    ['تحویل‌گیرنده و زمان تحویل هماهنگ شد', 'Receiver and hand-over time agreed'],
  ],
}
