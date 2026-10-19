// Brand marks. The Shad icon is the exact artwork supplied (3D icon, as an image). The intro
// builds it from its flat parts — the square, three dots dropping in, the wave sweeping across —
// then hands over to the real icon. Noyan (the parent company) appears only as a small footer tag.
import shadIcon from '../assets/brand/shad.webp'
import noyanIcon from '../assets/brand/noyan.webp'

/** The flat wave, traced from the supplied artwork (in its 753×794 drawing space). */
const WAVE_D = 'M752 592Q751 518 749 514Q747 509 741 504Q735 498 729 496Q723 494 715 494Q707 495 702 498Q696 501 673 521Q650 541 629 556Q608 570 592 578Q575 585 570 586Q566 587 557 587Q548 587 540 585Q533 583 520 577Q506 571 472 550Q437 530 419 521Q401 512 388 508Q374 504 363 504Q352 504 342 507Q331 510 320 516Q308 521 276 542Q245 562 228 572Q210 581 200 584Q190 587 181 587Q172 587 162 584Q153 581 136 572Q120 562 104 549Q87 536 71 521Q55 506 50 504Q44 501 35 501Q26 501 20 504Q13 507 10 510Q6 514 3 521Q0 528 0 599Q0 670 3 677Q6 684 20 698Q35 713 53 728Q71 744 86 755Q102 766 119 775Q136 784 147 788Q158 791 165 792Q172 793 182 792Q191 792 204 788Q217 784 231 776Q245 768 276 742Q307 716 316 710Q325 703 334 698Q342 694 352 692Q363 689 372 691Q382 693 391 698Q400 702 438 730Q477 758 491 767Q505 776 514 780Q523 785 530 788Q537 790 546 792Q554 793 564 792Q574 791 592 784Q609 778 627 768Q645 758 676 736Q706 715 726 698Q747 680 750 672Q752 665 752 592Z'
/** The three dots in the same drawing space: [cx, cy, r]. */
const DOTS: [number, number, number][] = [[376, 108, 104], [193, 338, 104], [555, 338, 104]]

/** The Shad app icon, exactly as supplied. */
export function ShadMark({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src={shadIcon} alt="Shad" className={`select-none ${className}`} draggable={false} />
}

/** The flat parts of the icon, used while the intro builds it. */
function FlatMark() {
  return (
    <svg viewBox="0 0 100 100" className="shad-flat absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <rect className="sf-box" x="0" y="0" width="100" height="100" rx="24" fill="#1fd492" />
      <g transform="translate(17.2 15.2) scale(0.0872)">
        {DOTS.map(([cx, cy, r], i) => <circle key={i} className={`sf-dot sf-dot-${i}`} cx={cx} cy={cy} r={r} fill="#fff" />)}
        <path className="sf-wave" d={WAVE_D} fill="#f5d01f" />
      </g>
    </svg>
  )
}

/** The icon building itself, then resting as the real icon with a slow float and a passing shine. */
export function ShadIntro({ className, loop }: { className?: string; loop?: boolean }) {
  return (
    <div className={`shad-intro ${loop ? "is-loop" : ""} ${className || "relative"}`}>
      <FlatMark />
      <div className="shad-real absolute inset-0">
        <img src={shadIcon} alt="" className="h-full w-full select-none" draggable={false} />
        <span className="shad-shine" style={{ WebkitMaskImage: `url(${shadIcon})`, maskImage: `url(${shadIcon})` }} />
      </div>
    </div>
  )
}

/** Loading screen: the intro on a loop inside a slowly turning orbit (madar = orbit). */
export function MadarLoader({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <div className={`madar-loader relative ${className}`} role="status" aria-label="Loading">
      <span className="madar-orbit absolute inset-0 rounded-full border border-white/10">
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#FF9500] shadow-[0_0_12px_3px_rgba(255,149,0,0.55)]" />
      </span>
      <span className="madar-orbit-2 absolute inset-3 rounded-full border border-dashed border-white/[0.07]" />
      <ShadIntro loop className="absolute inset-0 m-auto h-[48%] w-[48%]" />
    </div>
  )
}

/** Noyan, the parent company: its icon and name, for footers. */
export function NoyanTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img src={noyanIcon} alt="" className="h-3.5 w-3.5" />
      <span>نویان</span>
    </span>
  )
}
