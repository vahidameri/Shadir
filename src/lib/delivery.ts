// Delivery plan helpers: what lands when, what slipped against its baseline, and how reliable we are.
import type { DB, Deliverable, Track } from './types'
import { addDays, daysBetween, todayISO } from './jalali'
import { memberTrack } from './tracks'

export const isClosed = (d: Deliverable) => d.status === 'delivered' || d.status === 'dropped'
export const isOverdue = (d: Deliverable) => !isClosed(d) && !!d.target_date && d.target_date < todayISO()
/** Days the target moved past the first commitment (0 when on baseline). */
export const slipDays = (d: Deliverable) => (d.baseline_date && d.target_date ? Math.max(0, daysBetween(d.baseline_date, d.target_date)) : 0)
export const onTime = (d: Deliverable) => d.status === 'delivered' && !!d.delivered_date && d.delivered_date <= (d.baseline_date || d.target_date)

export function deliveryTrack(d: Deliverable, db: DB): Track | '' {
  return d.track || memberTrack(db, d.owner)
}

/** Effective state used for colour: overdue beats everything open. */
export function deliveryState(d: Deliverable): Deliverable['status'] | 'overdue' {
  return isOverdue(d) ? 'overdue' : d.status
}

export function deliverySummary(db: DB, projectId?: string) {
  const t = todayISO()
  const list = db.Deliverables.filter((d) => !projectId || d.project_id === projectId)
  const open = list.filter((d) => !isClosed(d))
  const delivered90 = list.filter((d) => d.status === 'delivered' && d.delivered_date >= addDays(t, -90))
  return {
    list,
    open,
    overdue: open.filter(isOverdue),
    slipped: open.filter((d) => slipDays(d) > 0),
    atRisk: open.filter((d) => d.status === 'at_risk'),
    delivered90,
    onTimeRate: delivered90.length ? Math.round((delivered90.filter(onTime).length / delivered90.length) * 100) : null,
  }
}
