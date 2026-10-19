// Kanban columns, set by the program manager (Config key kanban.columns, JSON).
// The five built-in statuses can be renamed and reordered; new columns can be added and removed.
// A task's status is the column id, so a custom column is simply another status.
import { TASK_STATUS, TASK_STATUS_ORDER } from './labels'
import { tr, type T2 } from './i18n'

export const COLUMNS_KEY = 'kanban.columns'
export interface Column {
  id: string
  fa: string
  en: string
  color?: string
}
export const BUILTIN = new Set<string>(TASK_STATUS_ORDER)
const DEFAULT: Column[] = TASK_STATUS_ORDER.map((id) => ({ id, fa: TASK_STATUS[id][0], en: TASK_STATUS[id][1] }))

let cols: Column[] = DEFAULT
export const columns = () => cols

/** Parses the setting; built-ins missing from it are put back so no task loses its column. */
export function readColumns(raw: string | undefined): Column[] {
  let list: Column[] = []
  try {
    const v = raw ? JSON.parse(raw) : null
    if (Array.isArray(v)) list = v.filter((c) => c && typeof c.id === 'string' && c.id).map((c) => ({ id: c.id, fa: String(c.fa || ''), en: String(c.en || ''), ...(c.color ? { color: String(c.color) } : {}) }))
  } catch {}
  if (!list.length) return DEFAULT
  const seen = new Set(list.map((c) => c.id))
  for (const d of DEFAULT) if (!seen.has(d.id)) list.splice(d.id === 'done' ? list.length : Math.min(TASK_STATUS_ORDER.indexOf(d.id as never), list.length), 0, d)
  return list
}
export const setColumns = (c: Column[]) => (cols = c)

export function statusLabel(s: string) {
  const c = cols.find((x) => x.id === s)
  if (c) return tr([c.fa || c.en || s, c.en || c.fa || s] as T2)
  const b = TASK_STATUS[s as keyof typeof TASK_STATUS]
  return b ? tr(b) : s
}
/** Colour of a custom column (built-ins keep their own). */
const PALETTE = ['#0ea5e9', '#14b8a6', '#f97316', '#ec4899', '#6366f1', '#84cc16', '#a855f7', '#eab308']
export const columnColor = (s: string) => {
  const own = cols.find((c) => c.id === s)?.color
  if (own) return own
  const i = cols.filter((c) => !BUILTIN.has(c.id)).findIndex((c) => c.id === s)
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]
}

/** A new column goes just before "done". */
export function withColumn(list: Column[], name: string): Column[] {
  const id = `c-${Date.now().toString(36)}`
  const col = { id, fa: name, en: name }
  const at = list.findIndex((c) => c.id === 'done')
  return at < 0 ? [...list, col] : [...list.slice(0, at), col, ...list.slice(at)]
}
