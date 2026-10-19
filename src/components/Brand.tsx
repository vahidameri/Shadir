// ACG brand marks (from joinacg.com). Both inherit `currentColor`.
export function AcgLogo({ className = 'h-5' }: { className?: string }) {
  return (
    <svg viewBox="316 166 1424 571" fill="currentColor" role="img" aria-label="ACG — Antwerp Consulting Group" className={className}>
      <path d="M581.5 166 L316 736.5 L383.5 736.5 L582 311 L779.5 736.5 L847.5 736.5 Z" />
      <circle cx="587" cy="706.5" r="29" />
      <path fillRule="evenodd" d="M 1027.3 191 C 942.7 197.6 874.7 246.5 838.5 326.7 C 820.9 365.7 812 411.7 812 463.5 C 812 515 821 561.5 838.2 599.7 C 862.2 652.7 897.9 690.8 945.5 714 C 965.1 723.6 981.4 728.8 1005.7 733.1 C 1020.6 735.8 1055.5 736.8 1072.2 735.1 C 1125.6 729.7 1170.5 708.8 1205.1 673.4 C 1227.1 650.9 1242.4 625.3 1252.5 594.5 C 1257.1 580.4 1260.5 565.7 1259.6 563.4 C 1259.1 562.2 1254.2 562 1227.3 562.2 L 1195.6 562.5 1192.8 572.5 C 1185.3 598.5 1174.1 617.2 1155.5 634.8 C 1120.1 668.3 1064.7 682.7 1012.2 672 C 954.1 660.2 908.9 617.6 888.5 555.5 C 879.1 527.1 875.7 502.3 875.6 463.5 C 875.6 433.5 876.7 421.1 881.5 397.2 C 893.3 338.8 926.8 291.5 972.5 268.7 C 993.6 258.2 1014.3 253.1 1039.8 252.3 C 1067.2 251.4 1087.7 254.7 1111.2 263.9 C 1151.5 279.7 1182.9 314.8 1193.2 355.7 L 1195.2 364 1227.6 364 L 1260 364 1260 361.8 C 1260 358.4 1254.6 337.7 1251 327.5 C 1246.8 315.5 1236.5 294.6 1229.2 283.5 C 1201 240.4 1156.6 209.8 1103.5 196.9 C 1081.3 191.6 1050.7 189.2 1027.3 191 M 1497 192.4 C 1445.8 199 1402.7 219.5 1368 254 C 1318.4 303.3 1292 376.1 1292 463.5 C 1292.1 568.1 1329.3 650.3 1398.5 698.2 C 1426.3 717.5 1459.1 729.6 1496 734.2 C 1511.5 736.1 1544.7 735.8 1560.4 733.6 C 1585.4 730.1 1609.3 722.9 1630.2 712.5 C 1675.3 690.1 1710.8 650.7 1728.4 603.6 C 1732.1 593.7 1739 568.6 1739 564.9 C 1739 563 1738.3 563 1707.3 563.2 L 1675.6 563.5 1672.4 574.3 C 1658.4 621.9 1619.9 658 1570 670.4 C 1552.9 674.7 1546.2 675.5 1526 675.5 C 1503.7 675.4 1493.3 674 1475.5 668.3 C 1419.4 650.6 1378.9 604.1 1362.5 538.7 C 1353 500.6 1351.5 450.5 1358.6 407 C 1367.6 351.4 1395.4 304.7 1435.4 277.8 C 1476.7 250.1 1532.1 243.6 1582.5 260.4 C 1615.4 271.4 1642.8 293.6 1659.9 322.9 C 1665.1 331.8 1668.7 340.4 1672.5 353 L 1675.6 363.5 1707.3 363.8 C 1738 364 1739 364 1739 362.1 C 1739 358.4 1732.2 333.4 1728.5 323.5 C 1702.4 253.9 1641.3 205.7 1563.5 193.4 C 1549.7 191.3 1510.8 190.7 1497 192.4 M 1552.2 524.8 L 1552.5 542.5 1645.5 542.5 L 1738.5 542.5 1738.8 524.8 L 1739 507 1645.5 507 L 1552 507 1552.2 524.8" />
    </svg>
  )
}

/** The "A" chevron with a dot — used as the app icon. */
export function AcgMark({ className = 'h-6' }: { className?: string }) {
  return (
    <svg viewBox="300 150 564 604" fill="currentColor" aria-hidden className={className}>
      <path d="M581.5 166 L316 736.5 L383.5 736.5 L582 311 L779.5 736.5 L847.5 736.5 Z" />
      <circle cx="587" cy="706.5" r="29" />
    </svg>
  )
}

/** Loading mark: the "A" draws itself, fills, the dot drops in; a ring orbits around it. */
export function AcgLoader({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <div className={`acg-loader relative ${className}`} role="status" aria-label="Loading">
      <span className="acg-orbit absolute inset-0 rounded-full border border-white/10">
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.55)]" />
      </span>
      <span className="acg-orbit-2 absolute inset-3 rounded-full border border-dashed border-white/[0.07]" />
      <svg viewBox="300 150 564 604" className="absolute inset-0 m-auto h-[46%] w-[46%] overflow-visible text-white">
        <path
          className="acg-a"
          pathLength={1}
          d="M581.5 166 L316 736.5 L383.5 736.5 L582 311 L779.5 736.5 L847.5 736.5 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinejoin="round"
        />
        <circle className="acg-dot" cx="587" cy="706.5" r="29" fill="currentColor" />
      </svg>
    </div>
  )
}
