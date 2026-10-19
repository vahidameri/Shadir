import { locale } from './i18n'

// Jalali (Persian) calendar helpers. Storage is always ISO Gregorian (YYYY-MM-DD);
// everything the user sees or picks is Jalali.

// Truncating division (not floor) — required by the jalaali algorithm.
const div = (a: number, b: number) => Math.trunc(a / b)

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(j % 1461, 4) * 5 + 308
  const gd = div(i % 153, 5) + 1
  const gm = (div(i, 153) % 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]

function jalCal(jy: number) {
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  let jm = 0
  let jump = 0
  for (let i = 1; i < bl; i++) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4)
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = (((n + 1) % 33) - 1) % 4
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: (k % 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: (k % 30) + 1 }
}

export function toJalali(gy: number, gm: number, gd: number) {
  return d2j(g2d(gy, gm, gd))
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd))
}

export function isLeapJalali(jy: number) {
  return jalCal(jy).leap === 0
}

export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isLeapJalali(jy) ? 30 : 29
}

export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
export const J_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

// ---------- ISO helpers ----------

export function parseISO(iso: string): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(iso))
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function toISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function todayISO() {
  return toISO(new Date())
}

export function addDays(iso: string, n: number) {
  const d = parseISO(iso) ?? new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function daysBetween(a: string, b: string) {
  const da = parseISO(a)
  const db = parseISO(b)
  if (!da || !db) return 0
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

/** days from today until iso (negative = past) */
export function daysFromToday(iso: string) {
  return daysBetween(todayISO(), iso)
}

export function isoToJalaliParts(iso: string) {
  const d = parseISO(iso)
  if (!d) return null
  return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function jalaliPartsToISO(jy: number, jm: number, jd: number) {
  const g = toGregorian(jy, jm, jd)
  return toISO(new Date(g.gy, g.gm - 1, g.gd))
}

// ---------- Formatting (locale-aware) ----------

export const J_MONTHS_EN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
export const G_MONTHS_FA = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر']
export const G_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const G_WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const J_WEEKDAYS_EN = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr']

const faDigits = '۰۱۲۳۴۵۶۷۸۹'
/** Localize digits (Persian digits in fa, Latin in en). Name kept short because it's everywhere. */
export function fa(n: number | string) {
  const s = String(n)
  return locale.lang === 'fa' ? s.replace(/\d/g, (d) => faDigits[+d]).replace(/%/g, '٪') : s
}

export function fmtNum(n: number) {
  const s = Math.round(n).toLocaleString('en-US')
  return locale.lang === 'fa' ? fa(s.replace(/,/g, '٬')) : s
}

interface DateParts { y: number; m: number; d: number; monthName: string }
function parts(iso: string): DateParts | null {
  const dt = parseISO(iso)
  if (!dt) return null
  if (locale.cal === 'jalali') {
    const j = toJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
    return { y: j.jy, m: j.jm, d: j.jd, monthName: (locale.lang === 'fa' ? J_MONTHS : J_MONTHS_EN)[j.jm - 1] }
  }
  const m = dt.getMonth()
  return { y: dt.getFullYear(), m: m + 1, d: dt.getDate(), monthName: (locale.lang === 'fa' ? G_MONTHS_FA : G_MONTHS_EN)[m] }
}

export function fmtDate(iso: string, style: 'short' | 'long' | 'month' = 'short') {
  const p = parts(iso)
  if (!p) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  if (style === 'long') return fa(locale.lang === 'fa' ? `${p.d} ${p.monthName} ${p.y}` : `${p.d} ${p.monthName} ${p.y}`)
  if (style === 'month') return fa(`${p.monthName} ${p.y}`)
  return fa(locale.lang === 'fa' || locale.cal === 'jalali' ? `${p.y}/${pad(p.m)}/${pad(p.d)}` : `${pad(p.d)}/${pad(p.m)}/${p.y}`)
}

export function fmtDayMonth(iso: string) {
  const p = parts(iso)
  if (!p) return '—'
  return fa(`${p.d} ${p.monthName}`)
}

export function relDays(iso: string) {
  if (!iso) return ''
  const d = daysFromToday(iso)
  const en = locale.lang === 'en'
  if (d === 0) return en ? 'Today' : 'امروز'
  if (d === 1) return en ? 'Tomorrow' : 'فردا'
  if (d === -1) return en ? 'Yesterday' : 'دیروز'
  if (d > 0) return en ? `in ${d} days` : `${fa(d)} روز دیگر`
  return en ? `${-d} days late` : `${fa(-d)} روز تأخیر`
}

export function weekdayIndex(d: Date) {
  // Saturday = 0
  return (d.getDay() + 1) % 7
}

export function timeAgo(isoOrDate: string | Date) {
  const t = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000)
  const en = locale.lang === 'en'
  if (s < 60) return en ? 'just now' : 'همین الان'
  if (s < 3600) return en ? `${Math.floor(s / 60)}m ago` : `${fa(Math.floor(s / 60))} دقیقه پیش`
  if (s < 86400) return en ? `${Math.floor(s / 3600)}h ago` : `${fa(Math.floor(s / 3600))} ساعت پیش`
  return en ? `${Math.floor(s / 86400)}d ago` : `${fa(Math.floor(s / 86400))} روز پیش`
}

const FA_WEEKDAYS_FULL = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
const EN_WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FA_WEEKDAYS_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']
const EN_WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function fmtWeekday(iso: string, short = false) {
  const d = parseISO(iso)
  if (!d) return ''
  const en = locale.lang === 'en'
  return (short ? (en ? EN_WEEKDAYS_SHORT : FA_WEEKDAYS_SHORT) : en ? EN_WEEKDAYS_FULL : FA_WEEKDAYS_FULL)[d.getDay()]
}

/** Day-of-month number in the active calendar. */
export function dayNum(iso: string) {
  const d = parseISO(iso)
  if (!d) return 0
  return locale.cal === 'jalali' ? toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()).jd : d.getDate()
}

/** First name for friendly greetings ("Dr." / "دکتر" titles dropped). */
export function firstName(full: string) {
  return String(full || '').replace(/^(دکتر|مهندس|Dr\.?|Eng\.?)\s+/i, '').trim().split(/\s+/)[0] || ''
}

export function greeting(d = new Date()) {
  const h = d.getHours()
  const en = locale.lang === 'en'
  if (h < 5) return en ? 'Good night' : 'شب بخیر'
  if (h < 12) return en ? 'Good morning' : 'صبح بخیر'
  if (h < 15) return en ? 'Good afternoon' : 'ظهر بخیر'
  if (h < 20) return en ? 'Good evening' : 'عصر بخیر'
  return en ? 'Good evening' : 'شب بخیر'
}

/** Local date and time as "YYYY-MM-DD HH:mm" (comments, hand-offs). */
export function nowStamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${todayISO()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
