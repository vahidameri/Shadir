// Product vs Tech tracks: every task belongs to a track (explicit, or inferred from the
// assignee's team) and can depend on tasks in the other track (handoffs).
import type React from 'react'
import { closed } from './columns'
import type { DB, Task, Track } from './types'
import type { T2 } from './i18n'

// The units of the department come from the back office (lib/org.ts fills these in place).
export const TRACKS: Track[] = ['product', 'crm_ops', 'data', 'tech']
export const TRACK: Record<string, T2> = { product: ['مدیران محصول', 'Product managers'], crm_ops: ['CRM و عملیات', 'CRM & operations'], data: ['داده', 'Data'], tech: ['فنی', 'Tech'] }
export const SIDE_COLOR: Record<string, string> = { product: '#e8650a', crm_ops: '#1f7a76', data: '#5b5bd6', tech: '#2f6f9f' }
const sideColor = (t: string) => SIDE_COLOR[t] || '#6b7180'
/** Inline styles for a side's dot and soft chip (the colour is a setting, so no fixed classes). */
export const sideDot = (t: string) => ({ background: sideColor(t) })
export const sideSoft = (t: string) => ({ '--side': sideColor(t) }) as React.CSSProperties

export function memberTrack(db: DB, name: string): Track | '' {
  return db.Team.find((m) => m.name === name)?.track || ''
}

/** The team a task counts for: its own team, else its project's team, else its assignee's team. */
export function trackOf(t: Task, db: DB): Track | '' {
  return (t.track as Track) || autoTrack(t, db)
}
/** What "Auto" resolves to when a task has no team of its own. */
export function autoTrack(t: Task, db: DB): Track | '' {
  const p = t.project_id ? db.Projects.find((x) => x.id === t.project_id) : undefined
  return (p?.team as Track) || memberTrack(db, String(t.assignee || '').split(',')[0].trim())
}

export const depIds = (t: Task) => String(t.depends_on || '').split(',').map((x) => x.trim()).filter(Boolean)
export const depsOf = (t: Task, db: DB) => depIds(t).map((id) => db.Tasks.find((x) => x.id === id)).filter(Boolean) as Task[]
export const dependentsOf = (t: Task, db: DB) => db.Tasks.filter((x) => depIds(x).includes(t.id))
/** Open dependencies — the task is waiting on someone else. */
export const waitingOn = (t: Task, db: DB) => (closed(t) ? [] : depsOf(t, db).filter((d) => !closed(d)))
