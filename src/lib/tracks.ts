// Product vs Tech tracks: every task belongs to a track (explicit, or inferred from the
// assignee's team) and can depend on tasks in the other track (handoffs).
import type React from 'react'
import { closed } from './columns'
import type { DB, Task, Track } from './types'
import type { T2 } from './i18n'
import { isTaskOverdue } from './metrics'
import { addDays, todayISO } from './jalali'

// The units of the department come from the back office (lib/org.ts fills these in place).
export const TRACKS: Track[] = ['product', 'crm_ops', 'data', 'tech']
export const TRACK: Record<string, T2> = { product: ['مدیران محصول', 'Product managers'], crm_ops: ['CRM و عملیات', 'CRM & operations'], data: ['داده', 'Data'], tech: ['فنی', 'Tech'] }
export const SIDE_COLOR: Record<string, string> = { product: '#e8650a', crm_ops: '#1f7a76', data: '#5b5bd6', tech: '#2f6f9f' }
export const sideColor = (t: string) => SIDE_COLOR[t] || '#6b7180'
/** Inline styles for a side's dot and soft chip (the colour is a setting, so no fixed classes). */
export const sideDot = (t: string) => ({ background: sideColor(t) })
export const sideSoft = (t: string) => ({ '--side': sideColor(t) }) as React.CSSProperties

export function memberTrack(db: DB, name: string): Track | '' {
  return db.Team.find((m) => m.name === name)?.track || ''
}

export function trackOf(t: Task, db: DB): Track | '' {
  return (t.track as Track) || memberTrack(db, String(t.assignee || '').split(',')[0].trim())
}

export const depIds = (t: Task) => String(t.depends_on || '').split(',').map((x) => x.trim()).filter(Boolean)
export const depsOf = (t: Task, db: DB) => depIds(t).map((id) => db.Tasks.find((x) => x.id === id)).filter(Boolean) as Task[]
export const dependentsOf = (t: Task, db: DB) => db.Tasks.filter((x) => depIds(x).includes(t.id))
/** Open dependencies — the task is waiting on someone else. */
export const waitingOn = (t: Task, db: DB) => (closed(t) ? [] : depsOf(t, db).filter((d) => !closed(d)))

export interface TrackStats {
  total: number
  open: number
  done: number
  overdue: number
  blocked: number
  waiting: number // waiting on the other track
  doneWeek: number
  points: number
  donePoints: number
  pct: number
}

export function trackStats(db: DB, track: Track, projectId?: string): TrackStats {
  const since = addDays(todayISO(), -7)
  const ts = db.Tasks.filter((t) => trackOf(t, db) === track && (!projectId || t.project_id === projectId))
  const done = ts.filter((t) => t.status === 'done')
  const points = ts.reduce((a, t) => a + (Number(t.points) || 0), 0)
  const donePoints = done.reduce((a, t) => a + (Number(t.points) || 0), 0)
  return {
    total: ts.length,
    open: ts.length - done.length,
    done: done.length,
    overdue: ts.filter(isTaskOverdue).length,
    blocked: ts.filter((t) => t.status === 'blocked').length,
    waiting: ts.filter((t) => waitingOn(t, db).some((d) => trackOf(d, db) !== track)).length,
    doneWeek: done.filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= since).length,
    points,
    donePoints,
    pct: ts.length ? Math.round((done.length / ts.length) * 100) : 0,
  }
}

/** Cross-track handoffs: a task waiting on a task owned by the other track. */
export function handoffs(db: DB, projectId?: string) {
  const out: { from: Task; to: Task; ready: boolean }[] = []
  db.Tasks.filter((t) => !projectId || t.project_id === projectId).forEach((t) => {
    depsOf(t, db).forEach((d) => {
      const a = trackOf(d, db)
      const b = trackOf(t, db)
      if (a && b && a !== b) out.push({ from: d, to: t, ready: d.status === 'done' })
    })
  })
  return out
}
