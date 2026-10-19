import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays } from '../lib/jalali'
import { L, locale } from '../lib/i18n'
import { weekLabel, weekRel, weekStart } from '../lib/weeks'
import { cx } from './ui'

/** ‹ week › navigator, used on the band of weekly pages. */
export function WeekNav({ ws, onChange, dark = true }: { ws: string; onChange: (ws: string) => void; dark?: boolean }) {
  const Prev = locale.lang === 'fa' ? ChevronRight : ChevronLeft
  const Next = locale.lang === 'fa' ? ChevronLeft : ChevronRight
  const current = ws === weekStart()
  const btn = cx('grid h-9 w-9 place-items-center rounded-full border transition', dark ? 'border-white/15 text-white hover:bg-white/10' : 'border-line hover:bg-muted')
  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => onChange(addDays(ws, -7))} aria-label={L('هفته‌ی قبل', 'Previous week')}>
        <Prev size={16} />
      </button>
      <div className={cx('min-w-[9.5rem] px-2 text-center leading-tight', dark ? 'text-white' : '')}>
        <div className="text-sm font-semibold">{weekRel(ws)}</div>
        <div className={cx('text-[0.6875rem] num', dark ? 'text-band-sub' : 'text-sub')}>{weekLabel(ws)}</div>
      </div>
      <button className={btn} onClick={() => onChange(addDays(ws, 7))} aria-label={L('هفته‌ی بعد', 'Next week')}>
        <Next size={16} />
      </button>
      {!current && (
        <button className={cx('ms-1 h-9 rounded-full px-3 text-xs font-medium', dark ? 'bg-white text-band' : 'bg-ink text-surface')} onClick={() => onChange(weekStart())}>
          {L('امروز', 'Today')}
        </button>
      )}
    </div>
  )
}
