// Per-viewer UI preferences kept in localStorage (pins, sidebar, last-seen inbox).
import { useCallback, useEffect, useState } from 'react'

function read<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {}
  window.dispatchEvent(new CustomEvent('madar-pref', { detail: k }))
}

export function usePref<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => read(key, initial))
  useEffect(() => {
    const h = (e: Event) => (e as CustomEvent).detail === key && setV(read(key, initial))
    window.addEventListener('madar-pref', h)
    return () => window.removeEventListener('madar-pref', h)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((n: T | ((p: T) => T)) => {
    const next = typeof n === 'function' ? (n as (p: T) => T)(read(key, initial)) : n
    write(key, next)
    setV(next)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return [v, set] as const
}

export function usePins() {
  const [pins, setPins] = usePref<string[]>('madar.pins', [])
  const toggle = (id: string) => setPins((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return { pins, toggle, isPinned: (id: string) => pins.includes(id) }
}
