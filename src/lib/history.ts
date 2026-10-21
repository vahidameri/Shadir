// The change log: every saved change to a task or follow-up becomes one row per field
// (who, when, from → to). The server writes it (Code.gs history_, same field lists); the app
// mirrors it locally so the timeline updates at once and the demo has a log too.
import type { DB, HistoryRow, SheetName } from './types'
import { TRACKED } from './taskstamp'
import { nowStamp } from './taskstamp'

const HISTORY_FIELDS: Partial<Record<SheetName, string[]>> = {
  Tasks: TRACKED as string[],
  FollowUps: ['subject', 'person', 'status', 'due_date', 'priority', 'channel', 'notes', 'project_id', 'owner', 'waiting_for', 'link'],
  Mizito: ['title', 'status', 'asked_by', 'mentioned', 'category', 'action', 'priority_override', 'urgent', 'assigned_to', 'due_date', 'outcome', 'link', 'description'],
  // check-ins: every change of value or confidence is kept, so a KR's trend can be read back
  KeyResults: ['current', 'confidence', 'target', 'title', 'owner', 'note', 'weight'],
  Kpis: ['current', 'target', 'name'],
}
const clip = (v: unknown) => String(v ?? '').slice(0, 300)

export function diffRows(sheet: SheetName, prev: Record<string, unknown> | undefined, next: Record<string, unknown>, by: string): HistoryRow[] {
  const fields = HISTORY_FIELDS[sheet]
  if (!fields) return []
  const base = { entity: sheet as HistoryRow['entity'], entity_id: String(next.id), by, at: nowStamp() }
  const id = () => `H-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  if (!prev) return [{ ...base, id: id(), field: '_created', from: '', to: clip(next.status) }]
  return fields.filter((f) => clip(prev[f]) !== clip(next[f])).map((f) => ({ ...base, id: id(), field: f, from: clip(prev[f]), to: clip(next[f]) }))
}

/** A row's log, newest first. */
export const historyOf = (db: DB, entity: HistoryRow['entity'], id: string) =>
  db.History.filter((h) => h.entity === entity && h.entity_id === id).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
