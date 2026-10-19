// Task statuses (kanban columns), set by the program manager (Config key kanban.columns, JSON).
// The built-in statuses can be renamed, recoloured and reordered; new ones can be added and removed.
// A task's status is the column id. Every column has a category (StatusCat) that says what it means
// for tracking — open, in progress, waiting, blocked, done, cancelled — so a custom status counts right.
import { BUILTIN_CAT, TASK_STATUS, TASK_STATUS_ORDER } from './labels'
import { tr, type T2 } from './i18n'
import type { StatusCat } from './types'

export const COLUMNS_KEY = 'kanban.columns'
export interface Column {
  id: string
  fa: string
  en: string
  color?: string
  /** custom columns only; built-ins keep their own category */
  cat?: StatusCat
}
export const BUILTIN = new Set<string>(TASK_STATUS_ORDER)
const DEFAULT: Column[] = TASK_STATUS_ORDER.map((id) => ({ id, fa: TASK_STATUS[id][0], en: TASK_STATUS[id][1] }))
const CATS: StatusCat[] = ['intake', 'open', 'active', 'waiting', 'blocked', 'done', 'cancelled']

let cols: Column[] = DEFAULT
export const columns = () => cols

/** Parses the setting; built-ins missing from it are put back so no task loses its column. */
export function readColumns(raw: string | undefined): Column[] {
  let list: Column[] = []
  try {
    const v = raw ? JSON.parse(raw) : null
    if (Array.isArray(v))
      list = v
        .filter((c) => c && typeof c.id === 'string' && c.id)
        .map((c) => ({ id: c.id, fa: String(c.fa || ''), en: String(c.en || ''), ...(c.color ? { color: String(c.color) } : {}), ...(CATS.includes(c.cat) ? { cat: c.cat as StatusCat } : {}) }))
  } catch {}
  if (!list.length) return DEFAULT
  const seen = new Set(list.map((c) => c.id))
  for (const d of DEFAULT) {
    if (seen.has(d.id)) continue
    // a missing built-in goes next to its neighbour in the default order
    const before = TASK_STATUS_ORDER.slice(0, TASK_STATUS_ORDER.indexOf(d.id as never)).reverse().find((x) => seen.has(x))
    list.splice(before ? list.findIndex((c) => c.id === before) + 1 : 0, 0, d)
    seen.add(d.id)
  }
  return list
}
export const setColumns = (c: Column[]) => (cols = c)

/** What a status means: built-ins have a fixed category, custom columns their chosen one (default: in progress). */
export function catOf(s: string): StatusCat {
  const b = BUILTIN_CAT[s as keyof typeof BUILTIN_CAT]
  if (b) return b
  return cols.find((c) => c.id === s)?.cat || 'active'
}
/** Done or cancelled: no longer open, never late. */
export const isClosed = (s: string) => {
  const c = catOf(s)
  return c === 'done' || c === 'cancelled'
}
export const closed = (t: { status: string }) => isClosed(t.status)
export const isBlocked = (s: string) => catOf(s) === 'blocked'
/** The first status of a category, e.g. where "reopen" or "accept from intake" puts a task. */
export const firstOf = (cat: StatusCat) => cols.find((c) => catOf(c.id) === cat)?.id || (cat === 'open' ? 'todo' : cat)
/** Columns shown on the board: intake has its own triage view and cancelled work leaves the board. */
export const boardColumns = () => cols.filter((c) => catOf(c.id) !== 'intake' && catOf(c.id) !== 'cancelled')

export function statusLabel(s: string) {
  const c = cols.find((x) => x.id === s)
  if (c) return tr([c.fa || c.en || s, c.en || c.fa || s] as T2)
  const b = TASK_STATUS[s as keyof typeof TASK_STATUS]
  return b ? tr(b) : s
}
/** Colour of a status: its own setting, else the colour of its category. */
const CAT_COLOR: Record<StatusCat, string> = {
  intake: '#0ea5e9', open: 'rgb(var(--sub))', active: 'rgb(var(--warn))', waiting: '#8b5cf6', blocked: 'rgb(var(--bad))', done: 'rgb(var(--good))', cancelled: 'rgb(var(--sub))',
}
const BUILTIN_COLOR: Partial<Record<string, string>> = { review: '#6366f1', qa: '#14b8a6' }
export const columnColor = (s: string) => cols.find((c) => c.id === s)?.color || BUILTIN_COLOR[s] || CAT_COLOR[catOf(s)]
/** The same colour as a hex value, for the colour picker (theme variables are not valid there). */
const CAT_HEX: Record<StatusCat, string> = { intake: '#0ea5e9', open: '#7a8a90', active: '#b87800', waiting: '#8b5cf6', blocked: '#c42838', done: '#168060', cancelled: '#7a8a90' }
export const columnHex = (s: string) => {
  const c = columnColor(s)
  return c.startsWith('#') ? c : CAT_HEX[catOf(s)]
}

/** A new column goes just before "done". */
export function withColumn(list: Column[], name: string, cat: StatusCat = 'active'): Column[] {
  const id = `c-${Date.now().toString(36)}`
  const col = { id, fa: name, en: name, cat }
  const at = list.findIndex((c) => c.id === 'done')
  return at < 0 ? [...list, col] : [...list.slice(0, at), col, ...list.slice(at)]
}
