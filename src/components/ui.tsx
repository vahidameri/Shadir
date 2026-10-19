import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X, Inbox, ChevronDown, Check } from 'lucide-react'
import type { Health, Priority, TaskStatus } from '../lib/types'
import { HEALTH, PRIORITY } from '../lib/labels'
import { columnColor, columns, statusLabel } from '../lib/columns'
import { daysFromToday, fa, fmtDayMonth, relDays } from '../lib/jalali'
import { lbl, L } from '../lib/i18n'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export const healthColor: Record<Health, string> = { green: 'bg-good', amber: 'bg-warn', red: 'bg-bad' }
export const healthText: Record<Health, string> = { green: 'text-good', amber: 'text-warn', red: 'text-bad' }
export const healthSoft: Record<Health, string> = {
  green: 'bg-good/10 text-good',
  amber: 'bg-warn/12 text-warn',
  red: 'bg-bad/10 text-bad',
}

// ---------------------------------------------------------------- surfaces

export function Card({
  children, className, title, eyebrow, action, pad = true,
}: { children: ReactNode; className?: string; title?: ReactNode; eyebrow?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('card min-w-0', className)}>
      {(title || action || eyebrow) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h3 className="text-[0.9375rem] font-semibold leading-6">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      <div className={cx(pad && 'px-5 pb-5', !title && !eyebrow && pad && 'pt-5')}>{children}</div>
    </section>
  )
}

/** ACG-style black band with grid texture; page content overlaps its bottom edge. */
export function Band({ eyebrow, title, sub, actions, children, nav }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; nav?: ReactNode }) {
  return (
    <div className="band -mx-4 @sm:-mx-6 @lg:-mx-8 px-4 @sm:px-6 @lg:px-8 pt-9 pb-24 no-print">
      <div className="relative z-10 mx-auto max-w-[90rem] rise">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {nav ? <div className="mb-5 inline-flex">{nav}</div> : eyebrow && <div className="band-eye mb-4"><span className="eyebrow !text-[#c3d0e8] flex items-center gap-2">{eyebrow}</span></div>}
            <h1 className="display text-3xl @sm:text-[2.625rem] leading-[1.15]">{title}</h1>
            {sub && <div className="mt-3 max-w-2xl text-[0.9375rem] leading-7 text-[#b9c3d6]">{sub}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </div>
  )
}

/** Content panel that overlaps the band above it. */
export function Overlap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('relative z-10 mx-auto -mt-16 max-w-[90rem] stagger', className)}>{children}</div>
}

/** ACG stats strip: big numbers separated by hairlines. */
export function StatStrip({ items }: { items: { label: ReactNode; value: ReactNode; tone?: Health | 'muted'; sub?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 border-t border-band-line @sm:grid-cols-3 @lg:grid-cols-6">
      {items.map((it, i) => (
        <div key={i} className="border-b border-band-line px-0 py-4 pe-4 @sm:border-e @sm:last:border-e-0 @sm:ps-4 @sm:first:ps-0 @lg:border-b-0">
          <div className={cx('display text-3xl @sm:text-4xl num', it.tone === 'red' ? 'text-[#ff8a9a]' : it.tone === 'amber' ? 'text-[#f5c565]' : it.tone === 'green' ? 'text-[#7fe0b0]' : 'text-on-band')}>{it.value}</div>
          <div className="mt-2 text-xs text-band-sub">{it.label}</div>
          {it.sub && <div className="mt-0.5 text-[0.6875rem] text-band-sub/70">{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- status atoms

export function HealthDot({ h, pulse }: { h: Health; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && h === 'red' && <span className={cx('absolute inset-0 rounded-full opacity-60 animate-ping', healthColor[h])} />}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', healthColor[h])} />
    </span>
  )
}

export function HealthBadge({ h }: { h: Health }) {
  return (
    <span className={cx('chip', healthSoft[h])}>
      <HealthDot h={h} />
      {lbl(HEALTH, h)}
    </span>
  )
}

/** Linear-style signal bars for priority. */
export function PriorityIcon({ p, className }: { p: Priority; className?: string }) {
  if (p === 'critical')
    return (
      <span className={cx('inline-grid h-4 w-4 place-items-center rounded-[4px] bg-bad text-[0.625rem] font-black text-white', className)} title={lbl(PRIORITY, p)}>
        !
      </span>
    )
  const n = p === 'high' ? 3 : p === 'medium' ? 2 : 1
  return (
    <span className={cx('inline-flex h-4 w-4 items-end gap-[2px]', className)} title={lbl(PRIORITY, p)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cx('w-[3px] rounded-sm', i <= n ? 'bg-ink/80' : 'bg-ink/15')} style={{ height: `${4 + i * 3}px` }} />
      ))}
    </span>
  )
}

export function PriorityBadge({ p }: { p: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-sub">
      <PriorityIcon p={p} />
      <span className="hidden md:inline">{lbl(PRIORITY, p)}</span>
    </span>
  )
}

/** Linear-style status glyphs. */
export function StatusIcon({ s, size = 16 }: { s: TaskStatus; size?: number }) {
  const r = size / 2 - 1.5
  const c = size / 2
  const circ = 2 * Math.PI * (r - 2.5)
  const custom = columns().find((c) => c.id === s)?.color
  const color = custom ? custom : s === 'done' ? 'rgb(var(--good))' : s === 'blocked' ? 'rgb(var(--bad))' : s === 'review' ? '#8b5cf6' : s === 'in_progress' ? 'rgb(var(--warn))' : s === 'todo' ? 'rgb(var(--sub))' : columnColor(s)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={statusLabel(s)}>
      {s === 'done' ? (
        <>
          <circle cx={c} cy={c} r={r} fill={color} />
          <path d={`M${c - 3} ${c} l2 2 l4 -4`} stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : s === 'blocked' ? (
        <>
          <circle cx={c} cy={c} r={r} fill={color} />
          <path d={`M${c - 2.5} ${c - 2.5} l5 5 M${c + 2.5} ${c - 2.5} l-5 5`} stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.6" strokeDasharray={s === 'todo' ? '2.4 1.8' : undefined} />
          {s !== 'todo' && (
            <circle
              cx={c}
              cy={c}
              r={r - 2.5}
              fill="none"
              stroke={color}
              strokeWidth={(r - 2.5) * 2}
              strokeDasharray={`${circ * (s === 'in_progress' ? 0.5 : 0.75)} ${circ}`}
              transform={`rotate(-90 ${c} ${c})`}
            />
          )}
        </>
      )}
    </svg>
  )
}

export function TaskStatusBadge({ s }: { s: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusIcon s={s} size={14} />
      {statusLabel(s)}
    </span>
  )
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('chip bg-muted text-sub', className)}>{children}</span>
}

export function Due({ iso, done }: { iso: string; done?: boolean }) {
  if (!iso) return <span className="text-sub/60 text-xs">—</span>
  const d = daysFromToday(iso)
  const cls = done ? 'text-sub' : d < 0 ? 'text-bad font-semibold' : d <= 2 ? 'text-warn font-medium' : 'text-sub'
  return (
    <span className={cx('text-xs whitespace-nowrap num', cls)} title={relDays(iso)}>
      {!done && d <= 1 && d >= -1 ? relDays(iso) : fmtDayMonth(iso)}
      {!done && d < -1 && <span className="ms-1 hidden opacity-80 sm:inline">({relDays(iso)})</span>}
    </span>
  )
}

export function Progress({ value, h, className, marker }: { value: number; h?: Health; className?: string; marker?: number }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={cx('relative h-1.5 w-full rounded-full bg-ink/[0.07]', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', h ? healthColor[h] : 'bg-ink')} style={{ width: `${v}%` }} />
      {marker !== undefined && (
        <div
          className="absolute -top-1 h-3.5 w-[2px] rounded bg-ink/60"
          style={{ insetInlineStart: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)` }}
          title={`${L('زمان سپری‌شده', 'Time elapsed')}: ${fa(`${Math.round(marker)}%`)}`}
        />
      )}
    </div>
  )
}

const avatarPalette = ['#1D4F61', '#6A0421', '#3a3f47', '#4b6b77', '#8a4b5b', '#2f5d50', '#5b4a7a', '#7a5a2f']
// name → photo URL, refreshed by the store whenever the Team tab changes
const photoByName = new Map<string, string>()
export function setPhotos(team: { name: string; name_en?: string; photo?: string }[]) {
  photoByName.clear()
  // keyed by both names so the photo shows in the Persian and the English UI
  team.forEach((m) => {
    if (!m.photo) return
    photoByName.set(m.name, m.photo)
    if (m.name_en) photoByName.set(m.name_en, m.photo)
  })
}
export const photoOf = (name: string) => photoByName.get(name) || ''

const avatarSize = { xs: 'h-5 w-5 text-[0.625rem]', sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base', xl: 'h-24 w-24 text-3xl' }
export function Avatar({ name, size = 'sm', ring, src }: { name: string; size?: keyof typeof avatarSize; ring?: boolean; src?: string }) {
  const [broken, setBroken] = useState(false)
  if (!name) return null
  const photo = src ?? photoOf(name)
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const c = avatarPalette[h % avatarPalette.length]
  const initial = name.replace(/^(دکتر|Dr\.?)\s*/, '').trim().charAt(0).toUpperCase()
  const cls = cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white', avatarSize[size], ring && 'ring-2 ring-surface')
  if (photo && !broken) return <img src={photo} alt={name} title={name} referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cx(cls, 'bg-muted object-cover')} />
  return (
    <span title={name} className={cls} style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}>
      {initial}
    </span>
  )
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max)
  return (
    <span className="flex -space-x-1.5 rtl:space-x-reverse">
      {shown.map((n) => (
        <Avatar key={n} name={n} size="xs" ring />
      ))}
      {names.length > max && <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1 text-[0.625rem] text-sub ring-2 ring-surface">+{fa(names.length - max)}</span>}
    </span>
  )
}

export function Person({ name }: { name: string }) {
  if (!name) return <span className="text-sub text-xs">—</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm">
      <Avatar name={name} size="xs" />
      <span className="truncate">{name}</span>
    </span>
  )
}

// ---------------------------------------------------------------- overlays

/** Side sheet (opens from the inline-end edge). */
export function Sheet({ open, onClose, title, children, footer, wide, header }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; header?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end no-print">
      <div className="absolute inset-0 bg-[#0a0d12]/40 backdrop-blur-[3px] fade-in" onClick={onClose} />
      <div className={cx('relative m-0 flex h-full w-full flex-col bg-surface shadow-pop sheet-in sm:m-2 sm:h-[calc(100%-1rem)] sm:rounded-3xl', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
          {header || <h2 className="font-semibold">{title}</h2>}
          <button className="icon-btn" onClick={onClose} aria-label={L('بستن', 'Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Anchored popover rendered in a portal (so it escapes overflow/scroll containers).
 * Placement flips to stay inside the viewport.
 */
export function Popover({ trigger, children, align = 'start', width = 240, className }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; width?: number; className?: string }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const place = () => {
      const r = anchor.current!.getBoundingClientRect()
      const rtl = document.documentElement.dir === 'rtl'
      const ph = panel.current?.offsetHeight || 260
      const below = r.bottom + 6 + ph < window.innerHeight
      let left = (align === 'start') !== rtl ? r.left : r.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setStyle({ position: 'fixed', left, top: below ? r.bottom + 6 : Math.max(8, r.top - ph - 6), width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false)
    }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open])

  return (
    <>
      <span ref={anchor} className="inline-flex" onClick={(e) => e.stopPropagation()}>
        {trigger({ open, toggle: () => setOpen((o) => !o) })}
      </span>
      {open &&
        createPortal(
          <div ref={panel} style={style} onClick={(e) => e.stopPropagation()} className={cx('z-[70] rounded-2xl border border-line bg-surface p-1.5 shadow-pop pop-in', className)}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  )
}

export function MenuItem({ children, onClick, active, icon, hint, danger }: { children: ReactNode; onClick: () => void; active?: boolean; icon?: ReactNode; hint?: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-2.5 rounded-xl px-2.5 h-9 text-start text-sm transition hover:bg-muted', danger && 'text-bad')}>
      {icon && <span className="grid w-4 place-items-center text-sub">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[0.6875rem] text-sub">{hint}</span>}
      {active && <Check size={14} className="text-brand" />}
    </button>
  )
}

export function Empty({ text = L('موردی برای نمایش نیست', 'Nothing to show'), icon, action }: { text?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sub">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-sub">{icon || <Inbox size={22} strokeWidth={1.6} />}</div>
      <div className="text-sm">{text}</div>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

// ---------------------------------------------------------------- controls

export function Segmented<T extends string>({ value, onChange, options, dark }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; dark?: boolean }) {
  return (
    <div className={cx('inline-flex gap-0.5 rounded-full p-1', dark ? 'bg-white/10' : 'bg-muted')}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 whitespace-nowrap rounded-full px-3 text-xs font-medium transition',
            value === o.value ? (dark ? 'bg-white text-band shadow-sm' : 'bg-surface text-ink shadow-sm') : dark ? 'text-white/70 hover:text-white' : 'text-sub hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line no-print">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={cx('relative whitespace-nowrap px-3.5 py-3 text-sm font-medium transition', value === t.value ? 'text-ink' : 'text-sub hover:text-ink')}>
          {t.label}
          {t.count !== undefined && <span className="ms-1.5 rounded-full bg-muted px-1.5 text-[0.6875rem] text-sub num">{fa(t.count)}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-ink" />}
        </button>
      ))}
    </div>
  )
}

export function Ring({ value, size = 56, stroke = 6, h, light }: { value: number; size?: number; stroke?: number; h?: Health; light?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  const color = h === 'red' ? 'rgb(var(--bad))' : h === 'amber' ? 'rgb(var(--warn))' : h === 'green' ? 'rgb(var(--good))' : 'rgb(var(--brand))'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={light ? 'rgb(255 255 255 / .12)' : 'rgb(var(--muted))'} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <span className="absolute text-sm font-semibold num">{fa(`${Math.round(v)}%`)}</span>
    </div>
  )
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mb-4 flex flex-wrap items-center gap-2 no-print', className)}>{children}</div>
}

/** Pill-shaped filter dropdown. */
export function FilterSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  const current = options.find((o) => o.value === value)
  return (
    <Popover
      width={240}
      trigger={({ toggle, open }) => (
        <button onClick={toggle} className={cx('chip-btn', value && 'border-ink/20 bg-ink/[0.04]', open && 'border-ink/30')}>
          <span className={cx(value ? 'text-ink' : 'text-sub')}>{current ? current.label : placeholder}</span>
          <ChevronDown size={13} className="text-sub" />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          <MenuItem
            active={!value}
            onClick={() => {
              onChange('')
              close()
            }}
          >
            <span className="text-sub">{placeholder}</span>
          </MenuItem>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              active={o.value === value}
              onClick={() => {
                onChange(o.value)
                close()
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs focus-within:border-ink/30">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sub">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || L('جستجو…', 'Search…')} className="w-40 bg-transparent outline-none placeholder:text-sub/70" />
    </label>
  )
}

/** Band-style page header for simpler pages (no stats strip). */
export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return <Band title={title} sub={sub} actions={actions} eyebrow={eyebrow} />
}

/** Big numeric tile for in-page stat rows. */
export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Health | 'brand' }) {
  return (
    <div className="card flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className={cx('display mt-2 text-3xl num', tone && tone !== 'brand' && healthText[tone])}>{value}</div>
        {sub && <div className="mt-1 text-xs text-sub">{sub}</div>}
      </div>
      {icon && <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-sub">{icon}</div>}
    </div>
  )
}
