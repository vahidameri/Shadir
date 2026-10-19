// Weekly delivery day: each project hands something over on one day of the week (Projects.delivery_day,
// Saturday = 0 … Friday = 6). The lead records it each week in the Deliveries log (delivered, partial,
// or "no delivery this week"); the dashboard, the inbox and (if switched on) the morning email watch it.
// Settings (Config): delivery.grace = days after the day before it counts as missed (default 0),
//                    delivery.remind = days before the day the lead is reminded in the app (default 1).
import type { DB, Project, WeeklyDelivery } from './types'
import { addDays, todayISO } from './jalali'
import { weekCfg, weekStart } from './weeks'
import { locale, type T2 } from './i18n'

export const DAYS: T2[] = [['شنبه', 'Saturday'], ['یکشنبه', 'Sunday'], ['دوشنبه', 'Monday'], ['سه‌شنبه', 'Tuesday'], ['چهارشنبه', 'Wednesday'], ['پنجشنبه', 'Thursday'], ['جمعه', 'Friday']]
export const DAY_OPTIONS: Record<string, T2> = { '': ['— ندارد —', '— None —'], ...Object.fromEntries(DAYS.map((d, i) => [String(i), d])) }
export const DELIVERY_KEYS = { grace: 'delivery.grace', remind: 'delivery.remind' } as const

let grace = 0
let remind = 1
export const deliveryCfg = () => ({ grace, remind })
export function setDeliveryCfg(get: (k: string) => string | undefined) {
  const n = (k: string, d: number) => (get(k) !== undefined && get(k) !== '' && Number(get(k)) >= 0 ? Number(get(k)) : d)
  grace = n(DELIVERY_KEYS.grace, 0)
  remind = n(DELIVERY_KEYS.remind, 1)
}

export type WeekState = 'delivered' | 'partial' | 'skipped' | 'today' | 'soon' | 'upcoming' | 'late' | 'missed'
const running = (p: Project) => p.status === 'active' || p.status === 'planning'
export const hasDeliveryDay = (p: Project) => running(p) && p.delivery_day !== undefined && p.delivery_day !== '' && Number(p.delivery_day) >= 0 && Number(p.delivery_day) <= 6

/** The project's delivery date in the week that contains `day`. */
export function deliveryDate(p: Project, day = todayISO()) {
  if (!hasDeliveryDay(p)) return ''
  return addDays(weekStart(day), (Number(p.delivery_day) - weekCfg().start + 7) % 7)
}

export const recordOf = (db: DB, p: Project, ws: string): WeeklyDelivery | undefined => db.Deliveries.find((d) => d.project_id === p.id && d.week === ws)

/** State of the week that contains `day` (default: this week). */
export function weekState(p: Project, db: DB, day = todayISO()): WeekState | '' {
  const due = deliveryDate(p, day)
  if (!due) return ''
  const ws = weekStart(day)
  const rec = recordOf(db, p, ws)
  if (rec) return rec.status === 'partial' ? 'partial' : rec.status === 'skipped' ? 'skipped' : 'delivered'
  // older versions kept only the last date on the project
  if (p.last_delivery && p.last_delivery >= ws && p.last_delivery <= addDays(ws, 6)) return 'delivered'
  const today = todayISO()
  if (due === today) return 'today'
  if (due > today) return due <= addDays(today, remind) ? 'soon' : 'upcoming'
  return today <= addDays(due, grace) ? 'late' : 'missed'
}

/** The last n weeks (oldest first), with what happened in each. */
export function history(p: Project, db: DB, n = 8): { ws: string; state: WeekState | '' }[] {
  const ws = weekStart()
  // a week counts only from the first recorded delivery on; before that there is nothing to judge
  const first = db.Deliveries.filter((d) => d.project_id === p.id).map((d) => d.week).sort()[0] || ws
  return Array.from({ length: n }, (_, i) => {
    const w = addDays(ws, -7 * (n - 1 - i))
    return { ws: w, state: w < first ? '' : weekState(p, db, w) }
  })
}

/** Share of past weeks delivered on time (partial counts half; skipped weeks are left out). */
export function onTimeRate(p: Project, db: DB, n = 8) {
  const past = history(p, db, n + 1).slice(0, -1).filter((h) => h.state && h.state !== 'skipped')
  if (!past.length) return null
  const score = past.reduce((a, h) => a + (h.state === 'delivered' ? 1 : h.state === 'partial' ? 0.5 : 0), 0)
  return Math.round((score / past.length) * 100)
}

export const WEEK_STATE: Record<WeekState, T2> = {
  delivered: ['تحویل شد', 'Delivered'],
  partial: ['بخشی از کار تحویل شد', 'Partly delivered'],
  skipped: ['این هفته تحویل ندارد', 'No delivery this week'],
  today: ['امروز روز تحویل است', 'Due today'],
  soon: ['تحویل نزدیک است', 'Due soon'],
  upcoming: ['تحویل در پیش است', 'Later this week'],
  late: ['تحویل عقب افتاده', 'Late'],
  missed: ['تحویل انجام نشد', 'Missed'],
}

/** One readable line for this week's delivery, e.g. «امروز روز تحویل است» or «تحویل فردا، یکشنبه». */
export function weekLine(p: Project, st: WeekState): string {
  const d = DAYS[Number(p.delivery_day)]
  const fa = locale.lang === 'fa'
  const day = fa ? d[0] : d[1]
  const due = deliveryDate(p)
  const tomorrow = due === addDays(todayISO(), 1)
  switch (st) {
    case 'today': return fa ? 'امروز روز تحویل است' : 'Delivery is due today'
    case 'soon':
    case 'upcoming': return fa ? (tomorrow ? `تحویل فردا، ${day}` : `تحویل ${day}`) : tomorrow ? `Delivery tomorrow, ${day}` : `Delivery on ${day}`
    case 'late': return fa ? `تحویل ${day} عقب افتاده` : `${day}’s delivery is late`
    case 'missed': return fa ? `تحویل ${day} انجام نشد` : `${day}’s delivery was missed`
    case 'delivered': return fa ? 'تحویل این هفته انجام شد' : 'Delivered this week'
    case 'partial': return fa ? 'این هفته بخشی از کار تحویل شد' : 'Partly delivered this week'
    case 'skipped': return fa ? 'این هفته تحویل ندارد' : 'No delivery this week'
  }
}
export const needsAttention = (s: WeekState | '') => s === 'today' || s === 'late' || s === 'missed'

/** "Every Sunday" — the project's weekly delivery day in words ('' when it has none). */
export function everyDay(p: Project) {
  if (p.delivery_day === undefined || p.delivery_day === '' || !(Number(p.delivery_day) >= 0 && Number(p.delivery_day) <= 6)) return ''
  const d = DAYS[Number(p.delivery_day)]
  return locale.lang === 'fa' ? `هر ${d[0]}` : `Every ${d[1]}`
}
