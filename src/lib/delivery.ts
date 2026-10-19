// Delivery plan helpers: what lands when, what slipped against its baseline, and how reliable we are.
import type { DB, Deliverable, Track } from './types'
import { daysBetween, todayISO } from './jalali'
import { memberTrack } from './tracks'

export const isClosed = (d: Deliverable) => d.status === 'delivered' || d.status === 'dropped'
export const isOverdue = (d: Deliverable) => !isClosed(d) && !!d.target_date && d.target_date < todayISO()
/** Days the target moved past the first commitment (0 when on baseline). */
export const slipDays = (d: Deliverable) => (d.baseline_date && d.target_date ? Math.max(0, daysBetween(d.baseline_date, d.target_date)) : 0)

export function deliveryTrack(d: Deliverable, db: DB): Track | '' {
  return d.track || memberTrack(db, d.owner)
}

/** Effective state used for colour: overdue beats everything open. */
export function deliveryState(d: Deliverable): Deliverable['status'] | 'overdue' {
  return isOverdue(d) ? 'overdue' : d.status
}
