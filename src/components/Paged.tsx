// Long lists are drawn in pages: the first rows at once, more on request. Drawing hundreds of rows
// on every change is what made big pages slow.
import { useEffect, useMemo, useState } from 'react'
import { L } from '../lib/i18n'
import { fa } from '../lib/jalali'

/** Groups of rows with `shown` = the rows to draw now; `reset` = what starts the list over (filters). */
export function usePaged<G extends { rows: unknown[] }>(groups: G[], page: number, reset: unknown[]) {
  const [limit, setLimit] = useState(page)
  useEffect(() => setLimit(page), reset) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    let left = limit
    return groups.map((g) => {
      const rows = g.rows.slice(0, Math.max(0, left)) as G['rows']
      left -= rows.length
      return { ...g, shown: rows }
    })
  }, [groups, limit])
  const total = groups.reduce((a, g) => a + g.rows.length, 0)
  return { groups: shown, hidden: Math.max(0, total - limit), more: () => setLimit((n) => n + page * 2), step: page * 2 }
}

export function MoreButton({ hidden, step, onMore, noun }: { hidden: number; step: number; onMore: () => void; noun?: [string, string] }) {
  if (hidden <= 0) return null
  const [fa_, en] = noun || ['مورد', 'more']
  return (
    <div className="border-t border-line p-3 text-center">
      <button className="btn-outline btn-sm" onClick={onMore}>
        {L(`نمایش ${fa(Math.min(hidden, step))} ${fa_} دیگر (${fa(hidden)} باقی‌مانده)`, `Show ${Math.min(hidden, step)} ${en} (${hidden} left)`)}
      </button>
    </div>
  )
}
