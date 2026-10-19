// Noyan brand marks: the orange open frame with the teal square (from the Noyan logo), drawn as SVG
// so the single-file Apps Script build stays light. "Madar" (orbit) — the loader orbits the mark.

/** The frame: one stroke, open at the top-right corner where the square sits. */
export const FRAME_D = 'M66 14 H31 Q14 14 14 31 V69 Q14 86 31 86 H69 Q86 86 86 69 V45'

let n = 0
/** The Noyan mark in its own colours (orange frame, teal square). */
export function NoyanMark({ className = 'h-7 w-7' }: { className?: string }) {
  const id = `nm${++n}`
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC21A" />
          <stop offset="1" stopColor="#FF6A00" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5FE3C6" />
          <stop offset="1" stopColor="#1E8C7E" />
        </linearGradient>
      </defs>
      <path d={FRAME_D} fill="none" stroke={`url(#${id}o)`} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="76" y="4" width="20" height="20" rx="5" fill={`url(#${id}t)`} />
    </svg>
  )
}

/** Loading mark: the frame draws itself, the square drops in; a ring orbits around it. */
export function MadarLoader({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <div className={`madar-loader relative ${className}`} role="status" aria-label="Loading">
      <span className="madar-orbit absolute inset-0 rounded-full border border-white/10">
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#FF9500] shadow-[0_0_12px_3px_rgba(255,149,0,0.55)]" />
      </span>
      <span className="madar-orbit-2 absolute inset-3 rounded-full border border-dashed border-white/[0.07]" />
      <MarkDraw className="absolute inset-0 m-auto h-[46%] w-[46%] overflow-visible" />
    </div>
  )
}

/** The animated mark used by the loader and the login hero. */
export function MarkDraw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      <defs>
        <linearGradient id="mk-o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC21A" />
          <stop offset="1" stopColor="#FF6A00" />
        </linearGradient>
      </defs>
      <path className="mk-frame" pathLength={1} d={FRAME_D} fill="none" stroke="url(#mk-o)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <rect className="mk-dot" x="76" y="4" width="20" height="20" rx="5" fill="#2EC4A6" />
    </svg>
  )
}
