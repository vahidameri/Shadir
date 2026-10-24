// Moving a team's work to another team: its tasks (their own team), projects and people. Used when a
// team is removed in the back office, and on a team that is no longer defined but still has work.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { L } from '../lib/i18n'
import { fa } from '../lib/jalali'
import { TRACKS } from '../lib/tracks'
import { teamName } from './TeamParts'
import type { DB } from '../lib/types'

/** What still points at a team: tasks with it as their own team, its projects, its people. */
export function teamUsage(db: DB, id: string) {
  return {
    tasks: db.Tasks.filter((t) => t.track === id),
    projects: db.Projects.filter((p) => p.team === id),
    people: db.Team.filter((m) => m.track === id),
  }
}

export function TeamMove({ from, onDone, compact }: { from: string; onDone?: () => void; compact?: boolean }) {
  const { db, bulk, toast } = useStore()
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const u = teamUsage(db, from)
  const n = u.tasks.length + u.projects.length + u.people.length
  const go = async () => {
    setBusy(true)
    try {
      if (u.tasks.length) await bulk('Tasks', u.tasks.map((t) => ({ ...t, track: to })))
      if (u.projects.length) await bulk('Projects', u.projects.map((p) => ({ ...p, team: to })))
      if (u.people.length) await bulk('Team', u.people.map((m) => ({ ...m, track: to })))
      toast(L(`${fa(n)} مورد به «${teamName(to)}» منتقل شد`, `${n} items moved to “${teamName(to)}”`))
      onDone?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  if (!n) return null
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2 text-xs' : 'flex flex-wrap items-center gap-2 rounded-2xl border border-warn/40 bg-warn/5 p-3 text-xs'}>
      <span className="min-w-0 flex-1 leading-6">
        {L(`${fa(u.tasks.length)} تسک، ${fa(u.projects.length)} پروژه و ${fa(u.people.length)} نفر هنوز «${teamName(from)}» را دارند. به کدام تیم بروند؟`, `${u.tasks.length} tasks, ${u.projects.length} projects and ${u.people.length} people still use “${teamName(from)}”. Move them to:`)}
      </span>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="input h-8 w-auto text-xs">
        <option value="">{L('بدون تیم', 'No team')}</option>
        {TRACKS.filter((t) => t !== from).map((t) => <option key={t} value={t}>{teamName(t)}</option>)}
      </select>
      <button className="btn-primary btn-sm h-8" disabled={busy} onClick={go}>{busy ? L('در حال انتقال…', 'Moving…') : L('انتقال', 'Move')}</button>
    </div>
  )
}
