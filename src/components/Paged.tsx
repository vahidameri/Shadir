// Long lists in pages (50 rows by default), with previous / next and the page number. Drawing
// hundreds of rows on every change is what made big pages slow.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { L } from '../lib/i18n'
import { fa } from '../lib/jalali'

/** Groups of rows with `shown` = this page's rows; `reset` = what starts the list over (filters). */
export function usePaged<G extends { rows: unknown[] }>(groups: G[], size: number, reset: unknown[]) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), reset) // eslint-disable-line react-hooks/exhaustive-deps
  const total = groups.reduce((a, g) => a + g.rows.length, 0)
  const pages = Math.max(1, Math.ceil(total / size))
  const at = Math.min(page, pages - 1)
  const shown = useMemo(() => {
    let skip = at * size
    let left = size
    return groups.map((g) => {
      const from = Math.min(skip, g.rows.length)
      skip -= from
      const rows = g.rows.slice(from, from + Math.max(0, left)) as G['rows']
      left -= rows.length
      return { ...g, shown: rows }
    })
  }, [groups, at, size])
  return { groups: shown, page: at, pages, total, size, go: (p: number) => setPage(Math.max(0, Math.min(pages - 1, p))) }
}

export function Pager({ page, pages, total, size, go }: { page: number; pages: number; total: number; size: number; go: (p: number) => void }) {
  if (pages <= 1) return null
  const from = page * size + 1
  const to = Math.min(total, (page + 1) * size)
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line p-3 text-xs">
      <button className="btn-outline btn-sm" disabled={page === 0} onClick={() => go(page - 1)}><ChevronRight size={14} className="ltr:rotate-180" /> {L('قبلی', 'Previous')}</button>
      <span className="num px-2 text-sub">{L(`صفحه‌ی ${fa(page + 1)} از ${fa(pages)} · ردیف ${fa(from)} تا ${fa(to)} از ${fa(total)}`, `Page ${page + 1} of ${pages} · ${from}–${to} of ${total}`)}</span>
      <button className="btn-outline btn-sm" disabled={page >= pages - 1} onClick={() => go(page + 1)}>{L('بعدی', 'Next')} <ChevronLeft size={14} className="ltr:rotate-180" /></button>
    </div>
  )
}
