import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  J_MONTHS, J_MONTHS_EN, J_WEEKDAYS, J_WEEKDAYS_EN, G_MONTHS_EN, G_MONTHS_FA, G_WEEKDAYS_EN,
  fa, fmtDate, isoToJalaliParts, jalaliMonthLength, jalaliPartsToISO, parseISO, todayISO, weekdayIndex, addDays, toISO,
} from '../lib/jalali'
import { locale, L } from '../lib/i18n'
import { Popover, cx } from './ui'

/** Calendar-aware date picker (Jalali or Gregorian per locale). value/onChange are ISO (YYYY-MM-DD). */
export function DatePicker({ value, onChange, placeholder, compact }: { value: string; onChange: (iso: string) => void; placeholder?: string; compact?: boolean }) {
  return (
    <Popover
      width={300}
      trigger={({ toggle }) =>
        compact ? (
          <button type="button" onClick={toggle} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-sub hover:bg-muted">
            <CalendarDays size={14} />
            <span className="num">{value ? fmtDate(value, 'long') : placeholder || L('تاریخ', 'Date')}</span>
          </button>
        ) : (
          <button type="button" onClick={toggle} className="input flex items-center justify-between text-start">
            <span className={cx('num', !value && 'text-sub/70')}>{value ? fmtDate(value, 'long') : placeholder || L('انتخاب تاریخ', 'Pick a date')}</span>
            <span className="flex items-center gap-1 text-sub">
              {value && (
                <span
                  role="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange('')
                  }}
                >
                  <X size={14} />
                </span>
              )}
              <CalendarDays size={16} />
            </span>
          </button>
        )
      }
    >
      {(close) => (
        <Calendar
          value={value}
          onPick={(iso) => {
            onChange(iso)
            close()
          }}
        />
      )}
    </Popover>
  )
}

function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const jalali = locale.cal === 'jalali'
  const en = locale.lang === 'en'
  const today = todayISO()
  const init = () => {
    const iso = value || today
    if (jalali) {
      const p = isoToJalaliParts(iso)!
      return { y: p.jy, m: p.jm }
    }
    const d = parseISO(iso)!
    return { y: d.getFullYear(), m: d.getMonth() + 1 }
  }
  const [view, setView] = useState(init)

  let cells: (string | null)[]
  let title: string
  let weekdays: string[]
  if (jalali) {
    const first = parseISO(jalaliPartsToISO(view.y, view.m, 1))!
    const offset = weekdayIndex(first)
    const len = jalaliMonthLength(view.y, view.m)
    cells = [...Array(offset).fill(null), ...Array.from({ length: len }, (_, i) => jalaliPartsToISO(view.y, view.m, i + 1))]
    title = `${(en ? J_MONTHS_EN : J_MONTHS)[view.m - 1]} ${fa(view.y)}`
    weekdays = en ? J_WEEKDAYS_EN : J_WEEKDAYS
  } else {
    const first = new Date(view.y, view.m - 1, 1)
    const len = new Date(view.y, view.m, 0).getDate()
    // Monday-first for English, Saturday-first for Persian
    const offset = en ? (first.getDay() + 6) % 7 : weekdayIndex(first)
    cells = [...Array(offset).fill(null), ...Array.from({ length: len }, (_, i) => toISO(new Date(view.y, view.m - 1, i + 1)))]
    title = `${(en ? G_MONTHS_EN : G_MONTHS_FA)[view.m - 1]} ${fa(view.y)}`
    weekdays = en ? [...G_WEEKDAYS_EN.slice(1), G_WEEKDAYS_EN[0]] : J_WEEKDAYS
  }

  const move = (delta: number) => {
    let m = view.m + delta
    let y = view.y
    if (m < 1) {
      m = 12
      y--
    }
    if (m > 12) {
      m = 1
      y++
    }
    setView({ y, m })
  }
  const dayNum = (iso: string) => (jalali ? isoToJalaliParts(iso)!.jd : parseISO(iso)!.getDate())
  const Prev = document.documentElement.dir === 'rtl' ? ChevronRight : ChevronLeft
  const Next = document.documentElement.dir === 'rtl' ? ChevronLeft : ChevronRight

  return (
    <div className="p-1.5">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="icon-btn h-8 w-8" onClick={() => move(-1)}>
          <Prev size={16} />
        </button>
        <div className="text-sm font-semibold">{title}</div>
        <button type="button" className="icon-btn h-8 w-8" onClick={() => move(1)}>
          <Next size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w) => (
          <div key={w} className="py-1 text-[0.6875rem] text-sub">
            {w}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />
          const sel = iso === value
          const isToday = iso === today
          return (
            <button
              type="button"
              key={i}
              onClick={() => onPick(iso)}
              className={cx('h-9 rounded-full text-sm num transition', sel ? 'bg-ink font-semibold text-surface' : isToday ? 'font-semibold text-brand ring-1 ring-brand' : 'hover:bg-muted')}
            >
              {fa(dayNum(iso))}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
        {(
          [
            [L('امروز', 'Today'), 0],
            [L('فردا', 'Tomorrow'), 1],
            [L('۳ روز', '3 days'), 3],
            [L('یک هفته', '1 week'), 7],
            [L('دو هفته', '2 weeks'), 14],
          ] as const
        ).map(([l, n]) => (
          <button type="button" key={l} className="chip bg-muted text-sub hover:bg-line hover:text-ink" onClick={() => onPick(addDays(today, n))}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
