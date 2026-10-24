import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { idbClear, idbGet, idbPutLater, mergeDelta } from './delta'
import type { DB, Role, Row, SheetName, MizitoItem } from './types'
import { readWeekCfg, setWeekCfg } from './weeks'
import { readTaskCfg, setTaskCfg } from './taskcfg'
import { COLUMNS_KEY, readColumns, setColumns } from './columns'
import { applyOrg } from './org'
import { TERMS_KEY, applyTerms } from './terms'
import { setDeliveryCfg } from './cadence'
import { stampTask } from './taskstamp'
import { diffRows } from './history'
import { readMzCfg, setMzCfg, stampMizito } from './mizito'
import { readTeamCfg, setTeamCfg } from './teams'
import { setKrTitles } from './okr'
import { stampPlan } from './plans'
import { nextKey, readSprintCfg, setSprintCfg, sprintTeam } from './sprints'
import { teamOf } from './teams'
import { passFor } from './handoffs'
import type { PlanItem, Task } from './types'
import { nowStamp } from './taskstamp'
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
const demoKey = () => `madar.demo.v6.${locale.lang}`
const ME_KEY = 'madar.me'
// Last data received from the server, per signed-in account: the app opens instantly from it
// and refreshes in the background. Kept in IndexedDB (lib/delta), written after a refresh, never on
// the way of a click. Cleared on sign-out.
const snapKey = (who: string) => `madar.snap.${who.toLowerCase()}`
interface Snap { at: number; data: DB; role: Role; name: string; h?: Record<string, string>; ver?: string }
async function loadSnap(who: string): Promise<Snap | null> {
  if (!who) return null
  const s = await idbGet<Snap>(snapKey(who))
  return s && s.data ? s : null
}
function saveSnap(who: string, data: DB, role: Role, name: string, h?: Record<string, string>, ver?: string) {
  if (!who) return
  idbPutLater(snapKey(who), { at: Date.now(), data, role, name, h, ver })
}
export function clearSnaps() {
  void idbClear()
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('madar.snap.')).forEach((k) => localStorage.removeItem(k))
  } catch {}
}
// copies kept in local storage by earlier versions: too small for a year of work, moved to IndexedDB
try {
  Object.keys(localStorage).filter((k) => k.startsWith('madar.snap.')).forEach((k) => localStorage.removeItem(k))
} catch {}

// translations were removed in 1.9; drop their old browser caches
try {
  localStorage.removeItem('madar.tr.en')
  localStorage.removeItem('madar.tr.fa')
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
  return { Projects: [], Scope: [], Milestones: [], Sprints: [], Tasks: [], FollowUps: [], Risks: [], Team: [], Allocations: [], Updates: [], Comments: [], Deliverables: [], Meetings: [], Files: [], Config: [], Contracts: [], Handoffs: [], Deliveries: [], History: [], Contacts: [], Mizito: [], MizitoMentions: [], MizitoComments: [], Cartable: [], Todos: [], Objectives: [], KeyResults: [], Kpis: [], Checkins: [], Plans: [] }
}

// Sheets return numbers as numbers or strings, dates as ISO strings. Normalize once here.
function normalize(raw: Partial<DB>): DB {
  const db = emptyDB()
  for (const k of Object.keys(db) as SheetName[]) {
    const rows = (raw[k] || []) as unknown as Record<string, unknown>[]
    const seen = new Set<string>()
    db[k] = rows
      // one row per id: a sheet edited by hand (or a retried write) can hold the same id twice
      .filter((r) => r && r.id !== '' && r.id !== undefined && !seen.has(String(r.id)) && !!seen.add(String(r.id)))
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

const normalizeSheet = (sheet: SheetName, rows: Record<string, unknown>[]) => normalize({ [sheet]: rows } as unknown as Partial<DB>)[sheet] as unknown[]

type Mode = 'demo' | 'live'

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
  action: (name: string, payload: Record<string, unknown>) => Promise<unknown>
  /** many rows at once (import); rows with an existing id are replaced */
  bulk: <S extends SheetName>(sheet: S, rows: Row<S>[]) => Promise<void>
  /** removes every row of an import batch */
  undoBatch: (batch: string) => Promise<number>
  /** shared setting from the Config tab */
  setting: (key: string, fallback?: string) => string
  setSetting: (key: string, value: string) => Promise<void>
  toasts: Toast[]
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismissToast: (id: number) => void
}

const Ctx = createContext<Store | null>(null)

function loadDemo(): DB {
  // a speed test can hand the demo a dataset too big for local storage (never set in normal use)
  const injected = (window as unknown as { __MADAR_SEED?: DB }).__MADAR_SEED
  if (injected) return normalize(injected)
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
  /** Code.gs version reported by the server ('' = unknown) */
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
  // writes in flight, and a counter that moves with every write: a refresh that started before a
  // write finished is stale (it would drop the write or add its row twice), so it is thrown away
  const inflight = useRef(0)
  const writeSeq = useRef(0)
  // one refresh at a time, and at most one pending retry
  const fetching = useRef(false)
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryLater = (ms: number) => {
    if (retry.current) clearTimeout(retry.current)
    retry.current = setTimeout(() => {
      retry.current = null
      refreshRef.current?.()
    }, ms)
  }
  const track = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    inflight.current++
    writeSeq.current++
    try {
      return await p
    } finally {
      inflight.current--
      writeSeq.current++
    }
  }, [])
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
    setMzCfg(readMzCfg((k) => db.Config.find((r) => r.id === k)?.value))
    setTeamCfg(readTeamCfg((k) => db.Config.find((r) => r.id === k)?.value))
    setSprintCfg(readSprintCfg((k) => db.Config.find((r) => r.id === k)?.value))
  }, [db.Config, db.Team])
  useMemo(() => setKrTitles(db.KeyResults), [db.KeyResults])
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

  // the demo keeps its edits in local storage: once things are quiet, not on every click
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistDemo = (next: DB) => {
    if (demoTimer.current) clearTimeout(demoTimer.current)
    demoTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(demoKey(), JSON.stringify(next))
      } catch {}
    }, 800)
  }

  // the version of the data last received (the server answers "same" while it has not changed)
  const dataVer = useRef({ ver: '', who: '' })
  /** the server's fingerprint of every part of the data held (see lib/delta) */
  const parts = useRef<Record<string, string>>({})
  const refresh = useCallback(async () => {
    if (mode === 'demo') {
      setLastSync(new Date())
      return
    }
    if (!authed) return
    // never refresh over a save that is still on its way; try again shortly
    if (inflight.current > 0) return retryLater(2500)
    if (fetching.current) return
    fetching.current = true
    const seq = writeSeq.current
    setLoading(true)
    try {
      // after a save of our own the data is asked for in full; otherwise "same" saves the whole download
      const same = dataVer.current.who === (session?.email || '')
      const since = same ? dataVer.current.ver : ''
      // the fingerprints of the parts held: only the parts that changed come back
      const held = same ? parts.current : {}
      const { data, user, version, ver, h } = await fetchAll(config, since, held)
      if (seq !== writeSeq.current) return retryLater(1500)
      setServerVersion(version)
      dataVer.current = { ver, who: session?.email || '' }
      if (data) {
        const fresh = h ? mergeDelta(same ? dbRef.current : emptyDB(), data as unknown as Record<string, Record<string, unknown>[]>, h, held, normalizeSheet) : normalize(data)
        parts.current = h || {}
        if (fresh !== dbRef.current) {
          dbRef.current = fresh
          setDb(fresh)
        }
        saveSnap(session?.email || user?.email || '', fresh, user?.role || 'viewer', user?.name || '', parts.current, ver)
      }
      setRole(user?.role || 'viewer')
      setRemoteName(user?.name || '')
      setRemoteEmail(user?.email || session?.email || '')
      setError('')
      setLastSync(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      fetching.current = false
      setLoading(false)
    }
  }, [config, mode, authed, session?.token]) // eslint-disable-line react-hooks/exhaustive-deps
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (mode === 'demo') {
      setDb(loadDemo())
      setRole('admin')
      setLoading(false)
      setError('')
      return
    }
    // open from the last copy right away, then refresh (only what changed since) in the background
    let gone = false
    loadSnap(session?.email || '').then((snap) => {
      if (gone || !snap || lastSyncRef.current || fetching.current) {
        if (!gone) refresh()
        return
      }
      const d = normalize(snap.data)
      dbRef.current = d
      setDb(d)
      parts.current = snap.h || {}
      dataVer.current = { ver: snap.ver || '', who: session?.email || '' }
      setRole(snap.role)
      setRemoteName(snap.name)
      setLastSync(new Date(snap.at))
      refresh()
    })
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 60000)
    // coming back to the tab pulls the latest right away
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      gone = true
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
    window.addEventListener('madar-lang', h)
    return () => window.removeEventListener('madar-lang', h)
  }, [mode])

  const setConfig = (c: Config) => {
    saveConfig(c)
    setConfigState(c)
  }

  const upsert = useCallback(
    async <S extends SheetName>(sheet: S, input: Row<S>) => {
      let row = mapRow(sheet, input as unknown as Record<string, unknown>, toCanonRef.current) as unknown as Row<S>
      const prev = dbRef.current
      const list = prev[sheet] as Row<S>[]
      if (sheet === 'Mizito') row = stampMizito(list.find((r) => r.id === row.id) as unknown as MizitoItem | undefined, row as unknown as MizitoItem) as unknown as Row<S>
      // sprint teams' work gets a readable key (TECH-42) the first time it is saved
      if (sheet === 'Tasks' && !(row as unknown as Task).key && !list.some((r) => r.id === row.id) && sprintTeam(teamOf(row as unknown as Task, prev))) row = { ...row, key: nextKey(prev) } as Row<S>
      if (sheet === 'Plans') row = stampPlan(list.find((r) => r.id === row.id) as unknown as PlanItem | undefined, row as unknown as PlanItem, nowStamp()) as unknown as Row<S>
      if (sheet === 'Tasks') row = stampTask(list.find((r) => r.id === row.id) as unknown as Task | undefined, row as unknown as Task) as unknown as Row<S>
      const old = list.find((r) => r.id === row.id)
      const exists = !!old
      const log = diffRows(sheet, old as unknown as Record<string, unknown> | undefined, row as unknown as Record<string, unknown>, canonMeRef.current)
      const next = { ...prev, [sheet]: exists ? list.map((r) => (r.id === row.id ? row : r)) : [...list, row], ...(log.length ? { History: [...prev.History, ...log] } : {}) } as DB
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
        await track(remoteUpsert(config, sheet, row as unknown as Record<string, unknown>))
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
        await track(remoteDelete(config, sheet, id))
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
      const res = await track(remoteUpload(config, { name: file.name, mime: base.mime, data: dataUrl.split(',')[1], entity, entity_id }))
      const row = { ...base, ...(res.row as Partial<FileRef>) } as FileRef
      const cur = dbRef.current
      const next = { ...cur, Files: [...cur.Files.filter((f) => f.id !== row.id), row] }
      dbRef.current = next
      setDb(next)
      return row
    },
    [config, mode, me, toast], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const action = useCallback(
    async (name: string, payload: Record<string, unknown>) => {
      if (mode === 'demo') return undefined
      const res = (await remoteAction(config, name, payload)) as { row?: unknown }
      return res?.row
    },
    [config, mode],
  )

  const BULK_SHEETS: SheetName[] = ['Tasks', 'FollowUps', 'Mizito', 'MizitoMentions', 'MizitoComments', 'Contacts', 'Team', 'Projects', 'History', 'Comments', 'Allocations', 'Objectives', 'KeyResults', 'Kpis', 'Checkins', 'Sprints', 'Plans']
  const bulk = useCallback(
    async <S extends SheetName>(sheet: S, rows: Row<S>[]) => {
      if (!rows.length) return
      const prev = dbRef.current
      const byId = new Map(rows.map((r) => [r.id, r]))
      const list = prev[sheet] as Row<S>[]
      const kept = list.map((r) => byId.get(r.id) || r)
      const added = rows.filter((r) => !list.some((x) => x.id === r.id))
      const next = { ...prev, [sheet]: [...kept, ...added] } as DB
      dbRef.current = next
      setDb(next)
      if (mode === 'demo') return persistDemo(next)
      try {
        // in chunks, so one request never runs into the Apps Script time limit
        for (let i = 0; i < rows.length; i += 300) await track(remoteAction(config, 'bulk', { sheet, rows: rows.slice(i, i + 300) }))
        setLastSync(new Date())
      } catch (e) {
        dbRef.current = prev
        setDb(prev)
        toast(`${L('ایمپورت انجام نشد', 'Import failed')}: ${e instanceof Error ? e.message : e}`, 'err')
        throw e
      }
    },
    [config, mode, toast],
  )
  const undoBatch = useCallback(
    async (batch: string) => {
      const prev = dbRef.current
      let n = 0
      const next = { ...prev } as DB
      for (const k of BULK_SHEETS) {
        const rows = prev[k] as { id: string; batch?: string }[]
        const left = rows.filter((r) => r.batch !== batch)
        n += rows.length - left.length
        ;(next as unknown as Record<string, unknown>)[k] = left
      }
      dbRef.current = next
      setDb(next)
      if (mode === 'demo') {
        persistDemo(next)
        return n
      }
      const res = (await track(remoteAction(config, 'undoBatch', { batch }))) as { row?: { removed?: number } }
      return res?.row?.removed ?? n
    },
    [config, mode], // eslint-disable-line react-hooks/exhaustive-deps
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
    () => ({ db: live, archived, serverVersion, mode, role, me, setMe, loading, error, lastSync, config, setConfig, refresh, upsert, remove, resetDemo, canEdit: role !== 'viewer', access, authed, email, upload, action, bulk, undoBatch, setting, setSetting, toasts, toast, dismissToast }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, archived, serverVersion, access, mode, role, me, authed, email, upload, action, bulk, undoBatch, loading, error, lastSync, config, refresh, upsert, remove, toasts, toast, dismissToast],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
