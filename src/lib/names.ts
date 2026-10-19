// People are stored once, by their canonical (Persian) name. In the English interface we show
// each person's `name_en` from the Team tab, and map it back before anything is saved.
import type { DB, SheetName } from './types'

const FIELDS: Partial<Record<SheetName, string[]>> = {
  Projects: ['owner'],
  Milestones: ['owner'],
  Tasks: ['assignee', 'reporter', 'collaborators', 'watchers'],
  Handoffs: ['from_person', 'to_person'],
  Deliveries: ['by'],
  FollowUps: ['person', 'owner'],
  Risks: ['owner'],
  Team: ['name'],
  Updates: ['author'],
  Comments: ['author'],
  Deliverables: ['owner'],
  Meetings: ['facilitator', 'attendees'],
  Files: ['uploaded_by'],
}

type NameMap = Map<string, string>

export function nameMaps(db: DB) {
  const toEn: NameMap = new Map()
  db.Team.forEach((m) => m.name_en && toEn.set(m.name, m.name_en))
  const toCanon: NameMap = new Map([...toEn].map(([a, b]) => [b, a]))
  return { toEn, toCanon }
}

const LISTS = new Set(['assignee', 'collaborators', 'watchers'])
const mapVal = (v: unknown, map: NameMap, key: string) => {
  if (typeof v !== 'string' || !v) return v
  if (LISTS.has(key)) return v.split(',').map((n) => map.get(n.trim()) ?? n.trim()).filter(Boolean).join(',')
  if (key === 'attendees') return v.split(',').map((n) => map.get(n.trim()) ?? n.trim()).join(', ')
  return map.get(v) ?? v
}

export function mapRow<T extends Record<string, unknown>>(sheet: SheetName, row: T, map: NameMap): T {
  const f = FIELDS[sheet]
  if (!f || !map.size) return row
  const out: Record<string, unknown> = { ...row }
  f.forEach((k) => (out[k] = mapVal(out[k], map, k)))
  return out as T
}

export function mapDB(db: DB, map: NameMap): DB {
  if (!map.size) return db
  const out = { ...db } as Record<string, unknown[]>
  ;(Object.keys(FIELDS) as SheetName[]).forEach((s) => (out[s] = (db[s] as unknown as Record<string, unknown>[]).map((r) => mapRow(s, r, map))))
  return out as unknown as DB
}
