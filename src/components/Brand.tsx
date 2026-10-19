// Shad brand marks, drawn as SVG so the single-file Apps Script build stays light:
// a green rounded square, three white dots and the yellow wave. Noyan (the parent company) has a
// small text mark for footers. "Madar" (orbit) — the loader orbits the mark.

/** The yellow wave, as one round-capped stroke. */
export const WAVE_D = 'M22 61 C28 67 33 72 39 71 C44 70 47 64 50 64 C53 64 56 70 61 71 C67 72 72 67 78 61'
const DOTS: [number, number][] = [[50, 30], [35, 45], [65, 45]]

let n = 0
/** The Shad app icon. */
export function ShadMark({ className = 'h-7 w-7' }: { className?: string }) {
  const id = `sm${++n}`
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2EE3A6" />
          <stop offset="1" stopColor="#0FB884" />
        </linearGradient>
        <linearGradient id={`${id}y`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE24A" />
          <stop offset="1" stopColor="#F2C80F" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="26" fill={`url(#${id}g)`} />
      {DOTS.map(([cx, cy]) => <circle key={cx + cy} cx={cx} cy={cy} r="8.5" fill="#fff" />)}
      <path d={WAVE_D} fill="none" stroke={`url(#${id}y)`} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Loading mark: the square glows, the dots drop in one by one, the wave draws itself; a ring orbits. */
export function MadarLoader({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <div className={`madar-loader relative ${className}`} role="status" aria-label="Loading">
      <span className="madar-orbit absolute inset-0 rounded-full border border-white/10">
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#F5CE1F] shadow-[0_0_12px_3px_rgba(245,206,31,0.55)]" />
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
        <linearGradient id="mk-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2EE3A6" />
          <stop offset="1" stopColor="#0FB884" />
        </linearGradient>
      </defs>
      <rect className="mk-box" x="2" y="2" width="96" height="96" rx="26" fill="url(#mk-g)" />
      {DOTS.map(([cx, cy], i) => <circle key={i} className={`mk-dot mk-dot-${i}`} cx={cx} cy={cy} r="8.5" fill="#fff" />)}
      <path className="mk-frame" pathLength={1} d={WAVE_D} fill="none" stroke="#F5CE1F" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** "Noyan" as a quiet text mark: the parent company, for footers and the about line. */
export function NoyanTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden className="h-3.5 w-3.5">
        <path d="M66 14 H31 Q14 14 14 31 V69 Q14 86 31 86 H69 Q86 86 86 69 V45" fill="none" stroke="#FF8A00" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="76" y="4" width="20" height="20" rx="5" fill="#2EC4A6" />
      </svg>
      <span>نویان</span>
    </span>
  )
}
