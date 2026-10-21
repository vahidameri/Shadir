// Quarterly OKRs. Quarters follow the Persian year (Q1 = Farvardin–Khordad … Q4 = Dey–Esfand) and are
// written "1405-Q3". A key result's progress is its current value as a share of its target (there is
// no start value); it is compared with how much of the quarter has passed to judge whether it is on
// track. Each key result carries a weight; a team's key results for a quarter add up to 100, and
// objective and team progress are weighted by them.
import type { DB, KeyResult, KrConfidence, Objective, Task } from './types'
import { daysBetween, fa, isoToJalaliParts, jalaliMonthLength, jalaliPartsToISO, todayISO } from './jalali'
import { L, type T2 } from './i18n'
import { closed } from './columns'
import { signals } from './signals'

export const quarterOf = (iso: string = todayISO()) => {
  const p = isoToJalaliParts(iso) || isoToJalaliParts(todayISO())!
  return `${p.jy}-Q${Math.ceil(p.jm / 3)}`
}
const parse = (q: string) => {
  const m = /^(\d{4})-Q([1-4])$/.exec(q)
  return m ? { y: Number(m[1]), n: Number(m[2]) } : null
}
export function quarterRange(q: string): [string, string] {
  const p = parse(q) || parse(quarterOf())!
  const m1 = (p.n - 1) * 3 + 1
  return [jalaliPartsToISO(p.y, m1, 1), jalaliPartsToISO(p.y, m1 + 2, jalaliMonthLength(p.y, m1 + 2))]
}
export function addQuarter(q: string, k: number) {
  const p = parse(q) || parse(quarterOf())!
  const i = p.y * 4 + (p.n - 1) + k
  return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`
}
const SEASON: T2[] = [['بهار', 'Spring'], ['تابستان', 'Summer'], ['پاییز', 'Autumn'], ['زمستان', 'Winter']]
export function quarterLabel(q: string) {
  const p = parse(q)
  if (!p) return q
  return L(`${SEASON[p.n - 1][0]} ${fa(p.y)}`, `Q${p.n} ${p.y} (${SEASON[p.n - 1][1]})`)
}
/** Quarters to offer in pickers: a year back, a year ahead, plus any already used. */
export function quarterOptions(db: DB) {
  const now = quarterOf()
  const set = new Set([...Array.from({ length: 8 }, (_, i) => addQuarter(now, i - 4)), ...db.Objectives.map((o) => o.quarter), ...db.Allocations.map((a) => a.quarter || '')].filter(Boolean))
  return [...set].sort()
}
/** Share of the quarter that has passed, 0–100. */
export function elapsed(q: string, today = todayISO()) {
  const [a, b] = quarterRange(q)
  if (today < a) return 0
  if (today > b) return 100
  return Math.round((daysBetween(a, today) / Math.max(1, daysBetween(a, b))) * 100)
}

export function krProgress(k: KeyResult) {
  const cur = Number(k.current) || 0
  if (k.kind === 'done') return cur >= 1 ? 100 : 0
  const target = Number(k.target)
  // older rows with a start above the target ("cut X from 40 to 20") keep measuring the way down
  const start = Number(k.start) || 0
  if (start > target) return Math.max(0, Math.min(100, Math.round(((start - cur) / (start - target)) * 100)))
  if (!Number.isFinite(target) || target <= 0) return cur > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((cur / target) * 100)))
}
/** The confidence set at the last check-in, else judged from progress against elapsed time. */
export function krConfidence(k: KeyResult, quarter: string): Exclude<KrConfidence, ''> {
  if (k.confidence) return k.confidence
  const gap = elapsed(quarter) - krProgress(k)
  return gap >= 35 ? 'off_track' : gap >= 15 ? 'at_risk' : 'on_track'
}
export const CONF: Record<Exclude<KrConfidence, ''>, { label: T2; tone: string; hex: string }> = {
  on_track: { label: ['در مسیر', 'On track'], tone: 'text-good', hex: 'rgb(var(--good))' },
  at_risk: { label: ['در خطر', 'At risk'], tone: 'text-warn', hex: 'rgb(var(--warn))' },
  off_track: { label: ['عقب', 'Off track'], tone: 'text-bad', hex: 'rgb(var(--bad))' },
}

export const krsOf = (db: DB, objectiveId: string) => db.KeyResults.filter((k) => k.objective_id === objectiveId)
/** Progress of a set of key results, weighted by their weights (plain average when none is weighted). */
export function weighted(ks: KeyResult[]) {
  if (!ks.length) return 0
  const w = ks.reduce((a, k) => a + (Number(k.weight) || 0), 0)
  return Math.round(w > 0 ? ks.reduce((a, k) => a + krProgress(k) * (Number(k.weight) || 0), 0) / w : ks.reduce((a, k) => a + krProgress(k), 0) / ks.length)
}
export const objectiveProgress = (db: DB, o: Objective) => weighted(krsOf(db, o.id))
/** Sum of a team's key-result weights in a quarter (should be 100), optionally leaving one out. */
export function weightSum(db: DB, team: string, quarter: string, except = '') {
  const objs = new Set(db.Objectives.filter((o) => o.team === team && o.quarter === quarter).map((o) => o.id))
  return db.KeyResults.filter((k) => objs.has(k.objective_id) && k.id !== except).reduce((a, k) => a + (Number(k.weight) || 0), 0)
}
/** The trend: a key result's check-ins, oldest first. */
export const checkinsOf = (db: DB, krId: string) => db.Checkins.filter((c) => c.kr_id === krId).sort((a, b) => (a.at < b.at ? -1 : 1))
const objectivesOf = (db: DB, team: string, quarter: string) => db.Objectives.filter((o) => o.team === team && o.quarter === quarter).sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0))

/** Work on a key result: its tasks, how many are open, late and blocked. */
export function krWork(db: DB, krId: string, today = todayISO()) {
  const tasks = db.Tasks.filter((t) => t.kr_id === krId)
  const open = tasks.filter((t) => !closed(t))
  return { tasks, open: open.length, done: tasks.length - open.length, late: open.filter((t) => signals(t, today).late).length }
}

/** A team's quarter at a glance: objective progress, KR confidence counts, and how much open work sits outside the OKRs. */
export function teamOkr(db: DB, team: string, quarter: string, teamTasks: Task[]) {
  const objs = objectivesOf(db, team, quarter)
  const krs = objs.flatMap((o) => krsOf(db, o.id))
  const krIds = new Set(krs.map((k) => k.id))
  const conf = { on_track: 0, at_risk: 0, off_track: 0 }
  krs.forEach((k) => conf[krConfidence(k, quarter)]++)
  const open = teamTasks.filter((t) => !closed(t))
  return {
    objectives: objs,
    krs,
    progress: weighted(krs),
    weights: krs.reduce((a, k) => a + (Number(k.weight) || 0), 0),
    conf,
    okrOpen: open.filter((t) => t.kr_id && krIds.has(t.kr_id)).length,
    otherOpen: open.filter((t) => !t.kr_id || !krIds.has(t.kr_id)).length,
  }
}

/** A unit is a word ("نفر", "ثانیه"); a number typed there by mistake is not shown next to the value. */
const unitOf = (u?: string) => (u && !/^[\s\d۰-۹.,٫٬%٪]+$/.test(u) ? ` ${u.trim()}` : '')
export const fmtVal = (k: Pick<KeyResult, 'kind' | 'unit'>, v: number | string) =>
  k.kind === 'done' ? (Number(v) >= 1 ? L('انجام شد', 'Done') : L('نشده', 'Not yet')) : `${fa(Number(v) || 0)}${k.kind === 'percent' ? '٪' : unitOf(k.unit)}`

/** Key-result titles by id, kept current by the store, for log lines that only carry an id. */
let titles = new Map<string, string>()
export const setKrTitles = (ks: KeyResult[]) => (titles = new Map(ks.map((k) => [k.id, k.title])))
export const krTitle = (id: string) => titles.get(id) || ''
