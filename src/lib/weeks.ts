// The working week is configured in the back office (Config tab, keys week.*).
// Days are indexed Saturday = 0 … Friday = 6.
import { addDays, daysBetween, fa, fmtDayMonth, parseISO, todayISO, weekdayIndex } from './jalali'
import { L } from './i18n'

interface WeekCfg {
  start: number
  workdays: number[]
  weeklyDay: number
  weeklyTime: string
  dueDay: number
}
/** Defaults: week Sat–Fri, Sat–Thu workdays, portfolio weekly Thursday 10:00, reports due Wednesday. */
const WEEK_DEFAULT: WeekCfg = { start: 0, workdays: [0, 1, 2, 3, 4, 5], weeklyDay: 5, weeklyTime: '10:00', dueDay: 4 }
export const WEEK_KEYS = { start: 'week.start', workdays: 'week.workdays', weeklyDay: 'week.weekly_day', weeklyTime: 'week.weekly_time', dueDay: 'week.due_day' } as const

let cfg: WeekCfg = WEEK_DEFAULT
export const weekCfg = () => cfg

/** Reads the week settings from the Config tab (falls back to defaults). */
export function readWeekCfg(get: (key: string) => string | undefined): WeekCfg {
  const day = (k: string, d: number) => {
    const n = Number(get(k))
    return get(k) !== undefined && get(k) !== '' && n >= 0 && n <= 6 ? n : d
  }
  const wd = get(WEEK_KEYS.workdays)
  return {
    start: day(WEEK_KEYS.start, WEEK_DEFAULT.start),
    workdays: wd ? wd.split(',').map(Number).filter((n) => n >= 0 && n <= 6) : WEEK_DEFAULT.workdays,
    weeklyDay: day(WEEK_KEYS.weeklyDay, WEEK_DEFAULT.weeklyDay),
    weeklyTime: get(WEEK_KEYS.weeklyTime) || WEEK_DEFAULT.weeklyTime,
    dueDay: day(WEEK_KEYS.dueDay, WEEK_DEFAULT.dueDay),
  }
}
export const setWeekCfg = (c: WeekCfg) => (cfg = c)

const offset = (day: number) => (day - cfg.start + 7) % 7
export const isWorkday = (iso: string) => {
  const d = parseISO(iso)
  return !!d && cfg.workdays.includes(weekdayIndex(d))
}

/** First day of the week that contains iso. */
export function weekStart(iso: string = todayISO()) {
  const d = parseISO(iso)
  return d ? addDays(iso, -offset(weekdayIndex(d))) : iso
}
/** The portfolio weekly meeting's date in the week starting ws. */
export const weeklyDate = (ws: string) => addDays(ws, offset(cfg.weeklyDay))
const weekEnd = (ws: string) => addDays(ws, 6)
export const inWeek = (iso: string, ws: string) => !!iso && iso >= ws && iso <= weekEnd(ws)
export const weeksFrom = (ws: string, n: number) => Array.from({ length: n }, (_, i) => addDays(ws, i * 7))

export function weekLabel(ws: string) {
  return `${fmtDayMonth(ws)} – ${fmtDayMonth(addDays(ws, 6))}`
}

/** "This week", "Next week", "2 weeks ago"… relative to the current week. */
export function weekRel(ws: string) {
  const n = Math.round(daysBetween(weekStart(), ws) / 7)
  if (n === 0) return L('این هفته', 'This week')
  if (n === 1) return L('هفته‌ی بعد', 'Next week')
  if (n === -1) return L('هفته‌ی قبل', 'Last week')
  return n > 0 ? L(`${fa(n)} هفته بعد`, `In ${n} weeks`) : L(`${fa(-n)} هفته پیش`, `${-n} weeks ago`)
}

/** Weekly reports for the week starting ws are due by the end of this day. */
export const updateDue = (ws: string) => addDays(ws, offset(cfg.dueDay))
