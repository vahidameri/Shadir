// Mizito: the tasks the CPTO and the PgM are mentioned on in Mizito (the org's task tool).
// One row per Mizito task (the link's task id is the key); every new mention threads into it.
// Priority is computed from who asked (their tier), the deadline, the SLA and the urgent flag —
// every list, weight and threshold here is a setting (Config keys mz.*), edited in the back office.
import type { Contact, DB, MizitoComment, MizitoItem, MizitoMention } from './types'
import { daysFromToday, todayISO } from './jalali'
import { L, type T2 } from './i18n'

export const MZ_KEYS = {
  base: 'mz.base', // Mizito address, e.g. https://mizito.noyanet.com
  tiers: 'mz.tiers', // JSON [{id, fa, en, sla, weight, color}] — sla in hours
  statuses: 'mz.statuses', // JSON [{id, fa, en, cat}] — cat: open | waiting | blocked | done | cancelled
  categories: 'mz.categories', // JSON [{id, fa, en}]
  actions: 'mz.actions', // JSON [{id, fa, en, weight}]
  weights: 'mz.weights', // JSON {urgent, overdue, due_soon, sla_breach, per_mention}
  thresholds: 'mz.thresholds', // JSON {p0, p1, p2}
  staleDays: 'mz.stale_days',
  template: 'mz.template', // reminder text with {name} {title} {days} {link} {asked_by}
  cutoff: 'mz.agent.cutoff', // the agent reads tasks with activity since this day (ISO)
  keyProjects: 'mz.key_projects', // JSON [names]: Mizito projects that get a badge (default میز شاد)
  agent: 'mz.agent.', // + a person's name: their agent's last run (written by the server)
} as const
/** 1 Tir 1405 */
export const MZ_CUTOFF = '2026-06-22'

export interface Tier { id: string; fa: string; en: string; sla: number; weight: number; color: string }
export type MzCat = 'open' | 'waiting' | 'blocked' | 'done' | 'cancelled'
export interface MzStatus { id: string; fa: string; en: string; cat: MzCat }
export interface MzOption { id: string; fa: string; en: string; weight?: number }
interface MzWeights { urgent: number; overdue: number; due_soon: number; sla_breach: number; per_mention: number }
interface MzThresholds { p0: number; p1: number; p2: number }

const DEFAULT_TIERS: Tier[] = [
  { id: 'executive', fa: 'مدیرعامل / هیئت‌مدیره', en: 'Executive', sla: 4, weight: 40, color: '#c4314b' },
  { id: 'deputy', fa: 'معاون', en: 'Deputy', sla: 24, weight: 30, color: '#e8650a' },
  { id: 'manager', fa: 'مدیر', en: 'Manager', sla: 48, weight: 20, color: '#2f6f9f' },
  { id: 'standard', fa: 'کارشناس / سایر', en: 'Standard', sla: 72, weight: 10, color: '#7a8a90' },
]
const DEFAULT_STATUSES: MzStatus[] = [
  { id: 'needs_action', fa: 'نیاز به اقدام', en: 'Needs action', cat: 'open' },
  { id: 'in_progress', fa: 'در حال رسیدگی', en: 'In progress', cat: 'open' },
  { id: 'awaiting', fa: 'منتظر پاسخ', en: 'Awaiting reply', cat: 'waiting' },
  { id: 'blocked', fa: 'مسدود', en: 'Blocked', cat: 'blocked' },
  { id: 'done', fa: 'انجام‌شده', en: 'Done', cat: 'done' },
  { id: 'cancelled', fa: 'لغوشده', en: 'Cancelled', cat: 'cancelled' },
]
const DEFAULT_CATEGORIES: MzOption[] = [
  { id: 'product', fa: 'محصول و توسعه', en: 'Product & development' },
  { id: 'finance', fa: 'مالی و قراردادها', en: 'Finance & contracts' },
  { id: 'infra', fa: 'زیرساخت و دسترسی', en: 'Infrastructure & access' },
  { id: 'people', fa: 'منابع انسانی', en: 'People & HR' },
  { id: 'cross', fa: 'هماهنگی بین‌تیمی', en: 'Cross-team coordination' },
]
const DEFAULT_ACTIONS: MzOption[] = [
  { id: 'approve', fa: 'تأیید', en: 'Approve', weight: 10 },
  { id: 'advise', fa: 'نظر / مشاوره', en: 'Advise', weight: 5 },
  { id: 'followup', fa: 'پیگیری', en: 'Follow-up', weight: 5 },
  { id: 'fyi', fa: 'جهت اطلاع', en: 'FYI', weight: 0 },
]
const DEFAULT_WEIGHTS: MzWeights = { urgent: 40, overdue: 30, due_soon: 15, sla_breach: 25, per_mention: 3 }
const DEFAULT_THRESHOLDS: MzThresholds = { p0: 75, p1: 50, p2: 25 }
const DEFAULT_TEMPLATE = 'سلام {name} عزیز، وقت بخیر.\nدر خصوص «{title}» که {days} روز پیش مطرح شد، لطفاً آخرین وضعیت را اعلام بفرمایید.\n{link}\nسپاس'

interface MzCfg {
  base: string
  tiers: Tier[]
  statuses: MzStatus[]
  categories: MzOption[]
  actions: MzOption[]
  weights: MzWeights
  thresholds: MzThresholds
  staleDays: number
  template: string
  keyProjects: string[]
}
let cfg: MzCfg = { base: 'https://mizito.noyanet.com', tiers: DEFAULT_TIERS, statuses: DEFAULT_STATUSES, categories: DEFAULT_CATEGORIES, actions: DEFAULT_ACTIONS, weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, staleDays: 7, template: DEFAULT_TEMPLATE, keyProjects: ['میز شاد'] }
export const mzCfg = () => cfg

function list<T extends { id: string }>(raw: string | undefined, def: T[]): T[] {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (Array.isArray(v)) {
      const out = v.filter((x) => x && String(x.id || '').trim()).map((x) => ({ ...x, id: String(x.id).trim() })) as T[]
      if (out.length) return out
    }
  } catch {}
  return def
}
function obj<T extends object>(raw: string | undefined, def: T): T {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = { ...def } as Record<string, number>
      for (const k of Object.keys(def)) if (Number.isFinite(Number(v[k])) && v[k] !== '') out[k] = Number(v[k])
      return out as T
    }
  } catch {}
  return def
}

export function readMzCfg(get: (k: string) => string | undefined): MzCfg {
  return {
    base: (get(MZ_KEYS.base) || 'https://mizito.noyanet.com').replace(/\/+$/, ''),
    tiers: list(get(MZ_KEYS.tiers), DEFAULT_TIERS).map((t) => ({ ...t, sla: Number(t.sla) || 72, weight: Number(t.weight) || 0, color: t.color || '#7a8a90' })),
    statuses: list(get(MZ_KEYS.statuses), DEFAULT_STATUSES).map((s) => ({ ...s, cat: (['open', 'waiting', 'blocked', 'done', 'cancelled'].includes(s.cat) ? s.cat : 'open') as MzCat })),
    categories: list(get(MZ_KEYS.categories), DEFAULT_CATEGORIES),
    actions: list(get(MZ_KEYS.actions), DEFAULT_ACTIONS).map((a) => ({ ...a, weight: Number(a.weight) || 0 })),
    weights: obj(get(MZ_KEYS.weights), DEFAULT_WEIGHTS),
    thresholds: obj(get(MZ_KEYS.thresholds), DEFAULT_THRESHOLDS),
    staleDays: Number(get(MZ_KEYS.staleDays)) || 7,
    template: get(MZ_KEYS.template) || DEFAULT_TEMPLATE,
    keyProjects: (() => {
      try {
        const v = JSON.parse(get(MZ_KEYS.keyProjects) || 'null')
        if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
      } catch {}
      return ['میز شاد']
    })(),
  }
}
export const setMzCfg = (c: MzCfg) => (cfg = c)

export const optLabel = (o?: { fa: string; en: string }) => (o ? L(o.fa, o.en) : '')
export const tierById = (id?: string) => cfg.tiers.find((t) => t.id === id)
export const statusById = (id?: string) => cfg.statuses.find((s) => s.id === id)
export const mzCat = (id?: string): MzCat => statusById(id)?.cat || 'open'
export const mzClosed = (m: { status: string }) => ['done', 'cancelled'].includes(mzCat(m.status))
export const firstMzStatus = (cat: MzCat) => cfg.statuses.find((s) => s.cat === cat)?.id || cfg.statuses[0]?.id || ''

// ------------------------------------------------------------------ index
// Lookups the queue makes for every row (mentions of an item, a person's registry row) are built
// once per data version instead of scanning the lists each time.
interface MzIndex { mentions: Map<string, MizitoMention[]>; comments: Map<string, MizitoComment[]>; contacts: Map<string, Contact> }
const indexes = new WeakMap<DB, MzIndex>()
function indexOf(db: DB): MzIndex {
  let ix = indexes.get(db)
  if (!ix) {
    const mentions = new Map<string, MizitoMention[]>()
    for (const x of db.MizitoMentions) mentions.set(x.item_id, [...(mentions.get(x.item_id) || []), x])
    mentions.forEach((l) => l.sort((a, b) => (a.at < b.at ? -1 : 1)))
    const comments = new Map<string, MizitoComment[]>()
    for (const x of db.MizitoComments || []) comments.set(x.item_id, [...(comments.get(x.item_id) || []), x])
    comments.forEach((l) => l.sort((a, b) => (a.at < b.at ? -1 : 1)))
    const contacts = new Map<string, Contact>()
    for (const c of db.Contacts) {
      if (c.name_en) contacts.set(c.name_en, c)
      contacts.set(c.name, c)
    }
    ix = { mentions, comments, contacts }
    indexes.set(db, ix)
  }
  return ix
}

// ------------------------------------------------------------------ people
/** Everyone who can ask or be chased: the department (Team) and the registry (Contacts). */
function contactOf(db: DB, name: string): Contact | undefined {
  return indexOf(db).contacts.get(String(name || '').trim())
}
/** A person's tier: their Contacts row, else the lowest tier. */
export function tierOf(db: DB, name: string): Tier | undefined {
  const c = contactOf(db, name)
  return tierById(c?.tier) || (name ? cfg.tiers[cfg.tiers.length - 1] : undefined)
}
export function allPeople(db: DB): string[] {
  return [...new Set([...db.Team.filter((m) => String(m.active) !== 'false').map((m) => m.name), ...db.Contacts.filter((c) => String(c.active) !== 'false').map((c) => c.name)].filter(Boolean))]
}

// ------------------------------------------------------------------ links
/** The Mizito task id inside a link: the last path segment of the hash route (…/tasks/inbox/<id>). */
export function mzKeyOf(link: string): string {
  const s = String(link || '').trim()
  if (!s) return ''
  const hash = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s.replace(/^https?:\/\/[^/]+/, '')
  const parts = hash.split(/[/?&=]/).map((x) => x.trim()).filter(Boolean)
  const id = [...parts].reverse().find((p) => /[0-9a-f]{12,}/i.test(p) || /^\d{4,}$/.test(p))
  // Mizito's own task link is <workspace>_sl<task>: the task is after "_sl"
  return (id || '').replace(/^.*_sl/i, '')
}
export const isMizitoLink = (s: string) => /^https?:\/\//i.test(String(s || '').trim()) && !!mzKeyOf(s)

// ------------------------------------------------------------------ time & priority
const stampMs = (s: string) => {
  const t = new Date(String(s || '').replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : 0
}
export const mentionsOf = (db: DB, id: string): MizitoMention[] => indexOf(db).mentions.get(id) || []
/** The conversation on the task in Mizito, as the agent read it (oldest first). */
export const commentsOf = (db: DB, id: string): MizitoComment[] => indexOf(db).comments.get(id) || []
const people = (s?: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
/** The last word in Mizito came from one of the people it was brought for: the ball is with others. */
export const answered = (m: MizitoItem) => !!m.mz_last_by && people(m.mentioned).includes(m.mz_last_by) && String(m.mz_last_at || '') >= String(m.last_mention_at || '')

/** What the agent knows that a person should look at. */
export function mzFlags(m: MizitoItem) {
  const closed = mzClosed(m)
  return {
    agent: m.source === 'agent',
    fresh: m.review === 'new' && !closed,
    /** 100% in Mizito but nobody closed it */
    finished: m.mz_state === 'open' && Number(m.mz_progress) >= 100 && !closed,
    /** closed in Madar while Mizito still has it open */
    openThere: m.mz_state === 'open' && closed && m.review !== 'ignored',
    /** no longer in this person's Mizito (done, removed or handed off) while open here */
    gone: m.mz_state === 'gone' && !closed,
    answered: !closed && answered(m),
    /** one of the Mizito projects that matter most (settings), e.g. میز شاد */
    keyProject: !!m.mz_project && cfg.keyProjects.includes(String(m.mz_project).trim()),
  }
}

/** Changed in Mizito within the last week (comments, done, progress, deadline, new mentions). */
export const recentlyChanged = (m: MizitoItem, days = 7) => !!m.mz_changed_at && Date.now() - stampMs(m.mz_changed_at) < days * 86400000
// what each person has already looked at (this browser): item id → the change time they saw
const SEEN_KEY = 'madar.mz.seen'
function seenMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}
  } catch {
    return {}
  }
}
export const changeUnseen = (m: MizitoItem) => recentlyChanged(m) && seenMap()[m.id] !== m.mz_changed_at
export function markSeen(m: MizitoItem) {
  if (!m.mz_changed_at) return
  try {
    const all = seenMap()
    all[m.id] = m.mz_changed_at
    localStorage.setItem(SEEN_KEY, JSON.stringify(all))
  } catch {}
}
/** Everyone who mentioned it: the asker and every re-mention. */
export const askersOf = (db: DB, m: MizitoItem) => [...new Set([m.asked_by, ...mentionsOf(db, m.id).map((x) => x.by)].filter(Boolean))]
/** The highest tier among the people who asked. */
function topTier(db: DB, m: MizitoItem): Tier | undefined {
  return askersOf(db, m).map((n) => tierOf(db, n)).filter(Boolean).sort((a, b) => b!.weight - a!.weight)[0] || undefined
}

interface MzSignals {
  /** computed or overridden P0..P3 */
  p: 0 | 1 | 2 | 3
  score: number
  overridden: boolean
  tier?: Tier
  mentions: number
  /** hours left on the SLA (negative = breached); null while it waits on others or is closed */
  slaLeft: number | null
  breached: boolean
  /** days since the last mention or change */
  quietDays: number
  stale: boolean
  /** days until the deadline (negative = late) */
  toDue: number | null
  /** days since it was raised */
  ageDays: number
}

// signals per item, kept for the current data and minute (the page, sidebar, desk and overview all ask)
const sigCache = new WeakMap<DB, { at: number; map: Map<string, { row: MizitoItem; s: MzSignals }> }>()
export function mzSignals(db: DB, m: MizitoItem, at?: number): MzSignals {
  const now = at ?? Date.now()
  if (at === undefined) {
    const minute = Math.floor(now / 60000)
    let c = sigCache.get(db)
    if (!c || c.at !== minute) sigCache.set(db, (c = { at: minute, map: new Map() }))
    const hit = c.map.get(m.id)
    if (hit && m === hit.row) return hit.s
    const s = computeSignals(db, m, now)
    c.map.set(m.id, { row: m, s })
    return s
  }
  return computeSignals(db, m, now)
}

function computeSignals(db: DB, m: MizitoItem, now: number): MzSignals {
  const c = cfg
  const tier = topTier(db, m)
  const mentions = 1 + mentionsOf(db, m.id).length
  const open = !mzClosed(m)
  const cat = mzCat(m.status)
  const last = stampMs(m.last_mention_at || m.received_at || m.created_at)
  // the SLA is for asks: a task the agent brought only because it is assigned (no mention) has no clock,
  // and an answer in Mizito after the last mention stops it
  const asked = m.source !== 'agent' || !!m.ext_id || mentions > 1
  const slaLeft = open && cat === 'open' && last && tier && asked && !answered(m) ? Math.round(tier.sla - (now - last) / 3600000) : null
  const breached = slaLeft !== null && slaLeft < 0
  const touched = Math.max(last, stampMs(m.updated_at))
  const quietDays = touched ? Math.floor((now - touched) / 86400000) : 0
  const toDue = open && m.due_date ? daysFromToday(m.due_date) : null
  const act = c.actions.find((a) => a.id === m.action)
  let score = (tier?.weight || 0) + (act?.weight || 0) + (mentions - 1) * c.weights.per_mention
  if (m.urgent === '1') score += c.weights.urgent
  if (toDue !== null && toDue < 0) score += c.weights.overdue
  else if (toDue !== null && toDue <= 2) score += c.weights.due_soon
  if (breached) score += c.weights.sla_breach
  const computed = (score >= c.thresholds.p0 ? 0 : score >= c.thresholds.p1 ? 1 : score >= c.thresholds.p2 ? 2 : 3) as MzSignals['p']
  const ov = /^P?([0-3])$/i.exec(String(m.priority_override || '').trim())
  return {
    p: ov ? (Number(ov[1]) as MzSignals['p']) : computed,
    score,
    overridden: !!ov,
    tier,
    mentions,
    slaLeft,
    breached,
    quietDays,
    stale: open && quietDays >= c.staleDays,
    toDue,
    ageDays: Math.max(0, Math.floor((now - (stampMs(m.received_at || m.created_at) || now)) / 86400000)),
  }
}

export const P_COLOR = ['#c4314b', '#e8650a', '#2f6f9f', '#7a8a90']
export const P_HINT: T2[] = [
  ['امروز؛ همه چیز متوقف می‌شود', 'Today. Everything else stops.'],
  ['همین هفته', 'This week'],
  ['همین ماه', 'This month'],
  ['خوب است انجام شود', 'Good to do'],
]

export type MzView = 'queue' | 'inbox' | 'changed' | 'p0' | 'exec' | 'breached' | 'waiting' | 'stale' | 'mine_cpto' | 'mine_pgm' | 'closed' | 'all'
export const MZ_VIEWS: MzView[] = ['queue', 'inbox', 'changed', 'p0', 'exec', 'breached', 'waiting', 'stale', 'closed', 'all']

/** The two highest tiers count as "exec asks". */
export const isExecTier = (t?: Tier) => !!t && [...cfg.tiers].sort((a, b) => b.weight - a.weight).slice(0, 2).some((x) => x.id === t.id)

export function inMzView(db: DB, m: MizitoItem, v: MzView, s = mzSignals(db, m)): boolean {
  const cat = mzCat(m.status)
  switch (v) {
    case 'all':
      return true
    case 'closed':
      return mzClosed(m)
    case 'queue':
      return !mzClosed(m)
    case 'inbox':
      return m.review === 'new' && !mzClosed(m)
    case 'changed':
      return recentlyChanged(m) && m.review !== 'ignored'
    case 'p0':
      return !mzClosed(m) && s.p === 0
    case 'exec':
      return !mzClosed(m) && isExecTier(s.tier)
    case 'breached':
      return s.breached
    case 'waiting':
      return cat === 'waiting' || cat === 'blocked'
    case 'stale':
      return s.stale
    default:
      return !mzClosed(m)
  }
}

/** The reminder text to paste into Mizito. */
export function reminderText(m: { title: string; link?: string }, name: string, days: number, askedBy = '') {
  return cfg.template
    .replace(/\{name\}/g, name || '')
    .replace(/\{title\}/g, m.title || '')
    .replace(/\{days\}/g, String(days))
    .replace(/\{link\}/g, m.link || '')
    .replace(/\{asked_by\}/g, askedBy)
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export const nowStampMz = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${todayISO()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Stamps a Mizito row as it is saved: key from the link, first/last mention, update and close times. */
export function stampMizito(prev: MizitoItem | undefined, next: MizitoItem): MizitoItem {
  const out = { ...next }
  const now = nowStampMz()
  if (out.link && !out.mz_key) out.mz_key = mzKeyOf(out.link)
  if (out.link && prev && prev.link !== out.link) out.mz_key = mzKeyOf(out.link)
  if (!out.status) out.status = firstMzStatus('open')
  if (!out.created_at) out.created_at = todayISO()
  if (!out.received_at) out.received_at = now
  else if (/^\d{4}-\d{2}-\d{2}$/.test(out.received_at)) out.received_at = `${out.received_at} 09:00`
  if (!out.last_mention_at) {
    out.last_mention_at = out.received_at
    out.last_mention_by = out.last_mention_by || out.asked_by
  }
  const closed = mzClosed(out)
  out.closed_at = closed ? out.closed_at || prev?.closed_at || now : ''
  out.updated_at = now
  return out
}

export interface AgentRun {
  /** last batch received, last finished run, last full read */
  at?: string
  done_at?: string
  full?: string
  error?: string
  key_at?: string
  revoked?: string
  version?: string
  /** the task link: learned | failed | none */
  link?: string
  run?: { tasks?: number; mentions?: number; comments?: number; pages?: number }
}
export function agentRun(raw?: string): AgentRun {
  try {
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** When the Mizito assistant first wrote to a person about the item (the agent keeps one line per person). */
export function firstFor(m: MizitoItem, who?: string) {
  if (who) {
    for (const line of String(m.mz_first || '').split('\n')) {
      const i = line.lastIndexOf('=')
      if (i > 0 && line.slice(0, i).trim() === who) return line.slice(i + 1).trim()
    }
  }
  return m.received_at || m.created_at || ''
}
