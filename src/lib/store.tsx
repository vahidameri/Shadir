import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DB, Role, Row, SheetName } from './types'
import { readWeekCfg, setWeekCfg } from './weeks'
import { readTaskCfg, setTaskCfg } from './taskcfg'
import { COLUMNS_KEY, readColumns, setColumns } from './columns'
import { applyOrg } from './org'
import { TERMS_KEY, applyTerms } from './terms'
import { setDeliveryCfg } from './cadence'
import { passFor } from './handoffs'
import type { Task } from './types'
import { NOTIFY_KEY, setNotifyOff } from './inbox'
import { hideArchived, isArchived } from './archive'
import type { Project } from './types'
import { jobCode, teamCodes } from './labels'
import { fetchAll, loadConfig, remoteAction, remoteDelete, remoteUpload, remoteUpsert, saveConfig, uid, type Config } from './api'
import { useGoogle } from './google'
import type { FileRef } from './types'
import { todayISO } from './jalali'
import { buildDemo, demoMe } from '../data/demo'
import { L, locale } from './i18n'
import { visibleDB } from './privacy'
import { accessOf, scopeDB } from './access'
import { mapDB, mapRow, nameMaps } from './names'
import type { Access } from './types'
import { setPhotos } from '../components/ui'

// Demo edits are kept per language so switching language shows sample data in that language.
const demoKey = () => `acg.demo.v6.${locale.lang}`
const ME_KEY = 'acg.me'
// Last data received from the server, per signed-in account: the app opens instantly from it
// and refreshes in the background. Cleared on sign-out.
const snapKey = (who: string) => `acg.snap.${who.toLowerCase()}`
function loadSnap(who: string): { at: number; data: DB; role: Role; name: string } | null {
  if (!who) return null
  try {
    const s = JSON.parse(localStorage.getItem(snapKey(who)) || 'null')
    return s && s.data ? s : null
  } catch {
    return null
  }
}
function saveSnap(who: string, data: DB, role: Role, name: string) {
  if (!who) return
  try {
    localStorage.setItem(snapKey(who), JSON.stringify({ at: Date.now(), data, role, name }))
  } catch {}
}
export function clearSnaps() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('acg.snap.')).forEach((k) => localStorage.removeItem(k))
  } catch {}
}

// translations were removed in 1.9; drop their old browser caches
try {
  localStorage.removeItem('acg.tr.en')
  localStorage.removeItem('acg.tr.fa')
} catch {}

const NUMERIC: Partial<Record<SheetName, string[]>> = {
  Milestones: ['weight'],
  Sprints: ['committed_points', 'completed_points'],
  Tasks: ['points'],
  Risks: ['probability', 'impact'],
  Allocations: ['percent'],
  Team: ['capacity'],
  Files: ['size'],
  Meetings: ['duration'],
  Handoffs: ['round'],
}

function emptyDB(): DB {
  return { Projects: [], Scope: [], Milestones: [], Sprints: [], Tasks: [], FollowUps: [], Risks: [], Team: [], Allocations: [], Updates: [], Comments: [], Deliverables: [], Meetings: [], Files: [], Config: [], Contracts: [], Handoffs: [], Deliveries: [] }
}

// Sheets return numbers as numbers or strings, dates as ISO strings. Normalize once here.
function normalize(raw: Partial<DB>): DB {
  const db = emptyDB()
  for (const k of Object.keys(db) as SheetName[]) {
    const rows = (raw[k] || []) as unknown as Record<string, unknown>[]
    db[k] = rows
      .filter((r) => r && r.id !== '' && r.id !== undefined)
      .map((r) => {
        const o: Record<string, unknown> = {}
        for (const [key, v] of Object.entries(r)) {
          if (v === null || v === undefined) o[key] = ''
          else if (key === 'time' && typeof v === 'string' && /\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/.test(v)) o[key] = /[T ](\d{2}:\d{2})/.exec(v)![1]
          else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) o[key] = v.slice(0, 10)
          else o[key] = typeof v === 'number' ? v : String(v)
          if (NUMERIC[k]?.includes(key)) o[key] = o[key] === '' ? 0 : Number(o[key]) || 0
        }
        o.id = String(o.id)
        if (k === 'Team') {
          o.role = jobCode(String(o.role || ''))
          o.team = teamCodes(String(o.team || ''), String(o.role), String(o.track || '')).join(',')
        }
        return o
      }) as never
  }
  return db
}

export type Mode = 'demo' | 'live'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err'
  action?: { label: string; run: () => void }
}

interface Store {
  db: DB
  /** archived projects, kept out of db */
  archived: Project[]
  /** the Code.gs version the server runs (live mode) */
  serverVersion: string
  mode: Mode
  role: Role
  me: string
  setMe: (n: string) => void
  loading: boolean
  error: string
  lastSync: Date | null
  config: Config
  setConfig: (c: Config) => void
  refresh: () => Promise<void>
  upsert: <S extends SheetName>(sheet: S, row: Row<S>) => Promise<void>
  remove: (sheet: SheetName, id: string) => Promise<void>
  resetDemo: () => void
  canEdit: boolean
  access: Access
  /** signed in (key or Google) — live mode needs it */
  authed: boolean
  email: string
  upload: (entity: FileRef['entity'], entity_id: string, file: File) => Promise<FileRef>
  action: (name: string, payload: Record<string, unknown>) => Promise<void>
  /** shared setting from the Config tab */
  setting: (key: string, fallback?: string) => string
  setSetting: (key: string, value: string) => Promise<void>
  toasts: Toast[]
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismissToast: (id: number) => void
}

const Ctx = createContext<Store | null>(null)

function loadDemo(): DB {
  try {
    const raw = localStorage.getItem(demoKey())
    if (raw) return normalize(JSON.parse(raw))
  } catch {}
  return buildDemo()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [configRaw, setConfigState] = useState<Config>(loadConfig)
  const { session, hosted, apiUrl } = useGoogle()
  // Served by Apps Script: the data API address comes from the script, not from settings.
  const config = useMemo(() => (hosted && apiUrl ? { ...configRaw, apiUrl } : configRaw), [configRaw, hosted, apiUrl])
  const mode: Mode = config.apiUrl || hosted ? 'live' : 'demo'
  const authed = mode === 'demo' || !!session || (!!config.token && !hosted)
  const [remoteEmail, setRemoteEmail] = useState('')
  const [db, setDb] = useState<DB>(() => (mode === 'demo' ? loadDemo() : emptyDB()))
  const [role, setRole] = useState<Role>(mode === 'demo' ? 'admin' : 'viewer')
  const [remoteName, setRemoteName] = useState('')
  /** Code.gs version reported by the server ('' = older than 1.10.1) */
  const [serverVersion, setServerVersion] = useState('')
  const [meLocal, setMeLocal] = useState(() => {
    try {
      return localStorage.getItem(ME_KEY) || ''
    } catch {
      return ''
    }
  })
  const [loading, setLoading] = useState(mode === 'live')
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState<Date | null>(mode === 'demo' ? new Date() : null)
  const lastSyncRef = useRef(lastSync)
  lastSyncRef.current = lastSync
  const [toasts, setToasts] = useState<Toast[]>([])
  const dbRef = useRef(db)
  // keep the local snapshot current (debounced) so the next open is instant
  useEffect(() => {
    if (mode !== 'live' || !lastSyncRef.current || !session?.email) return
    const t = setTimeout(() => saveSnap(session.email, db, role, remoteName), 600)
    return () => clearTimeout(t)
  }, [db]) // eslint-disable-line react-hooks/exhaustive-deps
  dbRef.current = db

  // In live mode the signed-in identity wins; in the demo "view as" switches the viewer.
  // meLocal holds a member id (older versions stored a name)
  const picked = db.Team.find((m) => m.id === meLocal) || db.Team.find((m) => m.name === meLocal || m.name_en === meLocal)
  const canonMe = mode === 'live' ? remoteName || picked?.name || '' : picked?.name || demoMe()
  // the demo has no sign-in: the viewer's email comes from their Team row
  const email = mode === 'live' ? remoteEmail || session?.email || '' : db.Team.find((m) => m.name === canonMe)?.email || ''
  const access: Access = accessOf(db, canonMe, mode === 'demo')
  // English interface: show name_en, map back on save
  const lang = locale.lang
  const maps = useMemo(() => (lang === 'en' ? nameMaps(db) : { toEn: new Map<string, string>(), toCanon: new Map<string, string>() }), [db, lang])
  const toCanonRef = useRef(maps.toCanon)
  toCanonRef.current = maps.toCanon
  const me = maps.toEn.get(canonMe) || canonMe
  const canonMeRef = useRef(canonMe)
  canonMeRef.current = canonMe
  // week settings are read synchronously so every page renders with the current cycle
  useMemo(() => {
    applyTerms(db.Config.find((r) => r.id === TERMS_KEY)?.value)
    applyOrg((k) => db.Config.find((r) => r.id === k)?.value)
    setWeekCfg(readWeekCfg((k) => db.Config.find((r) => r.id === k)?.value))
    setDeliveryCfg((k) => db.Config.find((r) => r.id === k)?.value)
    setNotifyOff(db.Config.find((r) => r.id === NOTIFY_KEY)?.value)
    setTaskCfg(readTaskCfg((k) => db.Config.find((r) => r.id === k)?.value, db.Team))
    setColumns(readColumns(db.Config.find((r) => r.id === COLUMNS_KEY)?.value))
  }, [db.Config, db.Team])
  const shown = useMemo(() => {
    return mapDB(scopeDB(visibleDB(db, canonMe), canonMe, access), maps.toEn)
  }, [db, canonMe, access, maps])
  // archived projects (and everything in them) leave the everyday views
  const live = useMemo(() => hideArchived(shown), [shown])
  const archived = useMemo(() => shown.Projects.filter(isArchived), [shown])
  setPhotos(db.Team)

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok', action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, kind, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200)
  }, [])

  const persistDemo = (next: DB) => {
    try {
      localStorage.setItem(demoKey(), JSON.stringify(next))
    } catch {}
  }

  const refresh = useCallback(async () => {
    if (mode === 'demo') {
      setLastSync(new Date())
      return
    }
    if (!authed) return
    setLoading(true)
    try {
      const { data, user, version } = await fetchAll(config)
      setServerVersion(version)
      const fresh = normalize(data)
      dbRef.current = fresh
      setDb(fresh)
      saveSnap(session?.email || user?.email || '', fresh, user?.role || 'viewer', user?.name || '')
      setRole(user?.role || 'viewer')
      setRemoteName(user?.name || '')
      setRemoteEmail(user?.email || session?.email || '')
      setError('')
      setLastSync(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [config, mode, authed, session?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'demo') {
      setDb(loadDemo())
      setRole('admin')
      setLoading(false)
      setError('')
      return
    }
    // open from the last snapshot right away, then refresh in the background
    const snap = loadSnap(session?.email || '')
    if (snap && !lastSyncRef.current) {
      const d = normalize(snap.data)
      dbRef.current = d
      setDb(d)
      setRole(snap.role)
      setRemoteName(snap.name)
      setLastSync(new Date(snap.at))
    }
    refresh()
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 60000)
    // coming back to the tab pulls the latest right away
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mode, refresh])

  // In demo mode, swap sample data when the interface language changes.
  const [, bump] = useState(0)
  useEffect(() => {
    const h = () => {
      if (mode === 'demo') setDb(loadDemo())
      bump((n) => n + 1)
    }
    window.addEventListener('acg-lang', h)
    return () => window.removeEventListener('acg-lang', h)
  }, [mode])

  const setConfig = (c: Config) => {
    saveConfig(c)
    setConfigState(c)
  }

  const upsert = useCallback(
    async <S extends SheetName>(sheet: S, input: Row<S>) => {
      const row = mapRow(sheet, input as unknown as Record<string, unknown>, toCanonRef.current) as unknown as Row<S>
      const prev = dbRef.current
      const list = prev[sheet] as Row<S>[]
      const exists = list.some((r) => r.id === row.id)
      const next = { ...prev, [sheet]: exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row] } as DB
      // keep the ref current so back-to-back writes build on each other
      dbRef.current = next
      setDb(next)
      if (mode === 'demo') {
        persistDemo(next)
        if (sheet === 'Tasks') {
          const pass = passFor(list.find((r) => r.id === row.id) as unknown as Task, row as unknown as Task, prev, canonMeRef.current)
          if (pass) await upsertRef.current?.('Handoffs', pass)
        }
        return
      }
      try {
        await remoteUpsert(config, sheet, row as unknown as Record<string, unknown>)
        setLastSync(new Date())
        // a task re-assigned to someone in another unit is a hand-off; log it (see lib/handoffs)
        if (sheet === 'Tasks') {
          const pass = passFor(list.find((r) => r.id === row.id) as unknown as Task, row as unknown as Task, prev, canonMeRef.current)
          if (pass) await upsertRef.current?.('Handoffs', pass)
        }
      } catch (e) {
        dbRef.current = prev
        setDb(prev)
        toast(`${L('ذخیره نشد', 'Not saved')}: ${e instanceof Error ? e.message : e}`, 'err')
        throw e
      }
    },
    [config, mode, toast],
  )

  const upsertRef = useRef<typeof upsert>(undefined)
  upsertRef.current = upsert

  const remove = useCallback(
    async (sheet: SheetName, id: string) => {
      const prev = dbRef.current
      const next = { ...prev, [sheet]: (prev[sheet] as { id: string }[]).filter((r) => r.id !== id) } as DB
      // keep the ref current so back-to-back writes build on each other
      dbRef.current = next
      setDb(next)
      if (mode === 'demo') {
        persistDemo(next)
        return
      }
      try {
        await remoteDelete(config, sheet, id)
      } catch (e) {
        setDb(prev)
        toast(`${L('حذف نشد', 'Not deleted')}: ${e instanceof Error ? e.message : e}`, 'err')
        throw e
      }
    },
    [config, mode, toast],
  )

  // Files: Drive in live mode, an in-browser data URL in the demo (small files only).
  const upload = useCallback(
    async (entity: FileRef['entity'], entity_id: string, file: File): Promise<FileRef> => {
      if (file.size > 10 * 1024 * 1024) {
        toast(L('حداکثر حجم فایل ۱۰ مگابایت است', 'Files are limited to 10 MB'), 'err')
        throw new Error('too large')
      }
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = () => rej(r.error)
        r.readAsDataURL(file)
      })
      const base: FileRef = { id: uid('FL'), entity, entity_id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, url: '', uploaded_by: me, created_at: todayISO() }
      if (mode === 'demo') {
        const row = { ...base, url: file.size <= 1.5 * 1024 * 1024 ? dataUrl : '' }
        const next = { ...dbRef.current, Files: [...dbRef.current.Files, row] }
        dbRef.current = next
        setDb(next)
        persistDemo(next)
        return row
      }
      const res = await remoteUpload(config, { name: file.name, mime: base.mime, data: dataUrl.split(',')[1], entity, entity_id })
      const row = { ...base, ...(res.row as Partial<FileRef>) } as FileRef
      setDb((d) => ({ ...d, Files: [...d.Files, row] }))
      return row
    },
    [config, mode, me, toast], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const action = useCallback(
    async (name: string, payload: Record<string, unknown>) => {
      if (mode === 'demo') return
      await remoteAction(config, name, payload)
    },
    [config, mode],
  )

  const setting = (key: string, fallback = '') => db.Config.find((r) => r.id === key)?.value ?? fallback
  const setSetting = async (key: string, value: string) => {
    await upsert('Config', { id: key, value })
  }

  const resetDemo = () => {
    try {
      localStorage.removeItem(demoKey())
    } catch {}
    setDb(buildDemo())
    toast(L('داده‌های نمونه بازنشانی شد', 'Sample data reset'))
  }

  const setMe = (n: string) => {
    const id = db.Team.find((m) => m.name === n || m.name_en === n)?.id || n
    setMeLocal(id)
    try {
      localStorage.setItem(ME_KEY, id)
    } catch {}
  }


  const value = useMemo<Store>(
    () => ({ db: live, archived, serverVersion, mode, role, me, setMe, loading, error, lastSync, config, setConfig, refresh, upsert, remove, resetDemo, canEdit: role !== 'viewer', access, authed, email, upload, action, setting, setSetting, toasts, toast, dismissToast }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, archived, serverVersion, access, mode, role, me, authed, email, upload, action, loading, error, lastSync, config, refresh, upsert, remove, toasts, toast, dismissToast],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
