import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Lang = 'fa' | 'en'
type Calendar = 'jalali' | 'gregorian'

/** Bilingual string: [persian, english]. */
export type T2 = readonly [string, string]

// Module-level locale so plain helpers (date/number formatting, labels) can read it
// without threading a hook everywhere. The provider keeps it in sync and re-renders.
export const locale: { lang: Lang; cal: Calendar } = (() => {
  try {
    const lang = (localStorage.getItem('madar.lang') as Lang) || 'fa'
    return { lang, cal: (localStorage.getItem('madar.cal') as Calendar) || (lang === 'fa' ? 'jalali' : 'gregorian') }
  } catch {
    return { lang: 'fa' as Lang, cal: 'jalali' as Calendar }
  }
})()

// Glossary overrides (back office → glossary): a term renamed once is renamed in every label.
// Only interface text passes through here, never what people type.
let swaps: { fa: [string, string][]; en: [RegExp, string][] } = { fa: [], en: [] }
export function setTermSwaps(fa: [string, string][], en: [string, string][]) {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  swaps = { fa: fa.filter(([a, b]) => a && b && a !== b), en: en.filter(([a, b]) => a && b && a.toLowerCase() !== b.toLowerCase()).map(([a, b]) => [new RegExp(`\\b${esc(a)}`, 'gi'), b]) }
}
const swapFa = (s: string) => {
  for (const [a, b] of swaps.fa) if (s.includes(a)) s = s.split(a).join(b)
  return s
}
const swapEn = (s: string) => {
  for (const [re, b] of swaps.en) s = s.replace(re, (m) => (m[0] === m[0].toUpperCase() ? b[0].toUpperCase() + b.slice(1) : b[0].toLowerCase() + b.slice(1)))
  return s
}
const out = (fa: string, en: string) => (locale.lang === 'fa' ? (swaps.fa.length ? swapFa(fa) : fa) : swaps.en.length ? swapEn(en) : en)

export const tr = (pair: T2 | string) => (typeof pair === 'string' ? pair : out(pair[0], pair[1]))
/** Inline bilingual text: L('پروژه‌ها', 'Projects') */
export const L = (fa: string, en: string) => out(fa, en)
/** Lookup in a bilingual label map. */
export function lbl<K extends string>(map: Record<K, T2>, k: K | string): string {
  const v = (map as Record<string, T2>)[k]
  return v ? tr(v) : String(k ?? '')
}

interface I18n {
  lang: Lang
  cal: Calendar
  dir: 'rtl' | 'ltr'
  setLang: (l: Lang) => void
  setCal: (c: Calendar) => void
  L: typeof L
}

const Ctx = createContext<I18n | null>(null)

function read<T extends string>(k: string, d: T): T {
  try {
    return (localStorage.getItem(k) as T) || d
  } catch {
    return d
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => read('madar.lang', 'fa'))
  const [cal, setCalState] = useState<Calendar>(() => read('madar.cal', lang === 'fa' ? 'jalali' : 'gregorian'))
  locale.lang = lang
  locale.cal = cal
  const dir = lang === 'fa' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    // switching language also switches to that language's natural calendar
    const c: Calendar = l === 'fa' ? 'jalali' : 'gregorian'
    setCalState(c)
    try {
      localStorage.setItem('madar.lang', l)
      localStorage.setItem('madar.cal', c)
    } catch {}
    locale.lang = l
    locale.cal = c
    window.dispatchEvent(new CustomEvent('madar-lang', { detail: l }))
  }, [])
  const setCal = useCallback((c: Calendar) => {
    setCalState(c)
    try {
      localStorage.setItem('madar.cal', c)
    } catch {}
  }, [])

  const value = useMemo(() => ({ lang, cal, dir: dir as 'rtl' | 'ltr', setLang, setCal, L }), [lang, cal, dir, setLang, setCal])
  // key forces a full re-render so every module-level formatter picks up the change
  return (
    <Ctx.Provider value={value}>
      <div key={`${lang}-${cal}`} className="contents">
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function useI18n() {
  const c = useContext(Ctx)
  if (!c) throw new Error('I18nProvider missing')
  return c
}
