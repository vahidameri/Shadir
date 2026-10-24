// The app's side of "send only what changed" (Code.gs deltaOut_): the data is cut into parts — one
// per tab, and one per month for the tabs that only grow — and each part has the server's
// fingerprint. A refresh sends the fingerprints held and gets back only the parts that changed; the
// rest of the data (and every tab that did not change) is kept as it is, so pages built on an
// unchanged tab do not redraw.
import type { DB, SheetName } from './types'

/** Tabs cut by month, and the date field that decides the month. Same as PARTS_ in Code.gs. */
export const PARTS: Partial<Record<SheetName, string>> = { History: 'at', Comments: 'created_at', MizitoComments: 'at', MizitoMentions: 'at' }

export const partKey = (sheet: string, row: Record<string, unknown>) => {
  const field = PARTS[sheet as SheetName]
  return field ? `${sheet}|${String(row[field] ?? '').slice(0, 7)}` : sheet
}

/**
 * The data after a refresh: `changed` holds the parts that differ (raw rows), `h` every part that
 * exists now. A tab with nothing changed keeps the very same array.
 */
export function mergeDelta(cur: DB, changed: Record<string, Record<string, unknown>[]>, h: Record<string, string>, prev: Record<string, string>, normalizeSheet: (sheet: SheetName, rows: Record<string, unknown>[]) => unknown[]): DB {
  const touched = new Set<string>()
  Object.keys(changed).forEach((k) => touched.add(k.split('|')[0]))
  // a part that is gone (its last row deleted) changes its tab too
  Object.keys(prev).filter((k) => !(k in h)).forEach((k) => touched.add(k.split('|')[0]))
  if (!touched.size) return cur
  const next = { ...cur } as Record<string, unknown[]>
  touched.forEach((sheet) => {
    if (!(sheet in next)) return
    if (!PARTS[sheet as SheetName]) {
      next[sheet] = normalizeSheet(sheet as SheetName, changed[sheet] || [])
      return
    }
    // keep the rows of this tab's unchanged parts, take the changed parts whole
    const keep = (cur[sheet as SheetName] as unknown as Record<string, unknown>[]).filter((r) => {
      const k = partKey(sheet, r)
      return k in h && !(k in changed)
    })
    const fresh = Object.keys(changed).filter((k) => k.split('|')[0] === sheet).flatMap((k) => changed[k])
    next[sheet] = [...keep, ...normalizeSheet(sheet as SheetName, fresh)]
  })
  return next as unknown as DB
}

// ---------------------------------------------------------------- local copy (IndexedDB)
// The last data received is kept in the browser so the app opens at once. IndexedDB holds any size
// (local storage stops at ~5 MB, which a year of work passes) and is written in the background.
const IDB = 'madar'
const STORE = 'snap'
// the browser's storage may be missing, blocked or silent (sandboxed pages): every call gives up
// after a moment instead of waiting
let opened: Promise<IDBDatabase> | null = null
function idb(): Promise<IDBDatabase> {
  if (!opened) {
    opened = new Promise<IDBDatabase>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('idb timeout')), 1500)
      try {
        const r = indexedDB.open(IDB, 1)
        r.onupgradeneeded = () => r.result.createObjectStore(STORE)
        r.onsuccess = () => (clearTimeout(timer), res(r.result))
        r.onerror = () => (clearTimeout(timer), rej(r.error))
        r.onblocked = () => (clearTimeout(timer), rej(new Error('idb blocked')))
      } catch (e) {
        clearTimeout(timer)
        rej(e)
      }
    })
    opened.catch(() => (opened = null))
  }
  return opened
}
export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const d = await idb()
    return await new Promise((res) => {
      const timer = setTimeout(() => res(null), 3000)
      const q = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      q.onsuccess = () => (clearTimeout(timer), res((q.result as T) ?? null))
      q.onerror = () => (clearTimeout(timer), res(null))
    })
  } catch {
    return null
  }
}
let pending: { key: string; value: unknown } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** Written once things are quiet (several saves in a row are one write). */
export function idbPutLater(key: string, value: unknown, ms = 1500) {
  pending = { key, value }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const job = pending
    pending = null
    if (!job) return
    const run = async () => {
      try {
        const d = await idb()
        d.transaction(STORE, 'readwrite').objectStore(STORE).put(job.value, job.key)
      } catch {}
    }
    const w = window as unknown as { requestIdleCallback?: (f: () => void) => void }
    if (w.requestIdleCallback) w.requestIdleCallback(() => void run())
    else void run()
  }, ms)
}
export async function idbClear() {
  try {
    const d = await idb()
    d.transaction(STORE, 'readwrite').objectStore(STORE).clear()
  } catch {}
}
