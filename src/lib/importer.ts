// Import from old sheets: parse pasted / CSV / Google Sheet rows, guess which column is which,
// map values (statuses, priorities, people, units…), drop duplicates and build the rows to save.
// Mizito rows that point at the same task (same link id, or the same title) become ONE item with the
// later rows threaded as mentions. Every imported row carries a batch id so the import can be undone.
import type { Comment, Contact, DB, FollowUp, HistoryRow, Member, MizitoItem, MizitoMention, Task } from './types'
import { toGregorian } from './jalali'
import { columns, statusLabel } from './columns'
import { tr } from './i18n'
import { FOLLOWUP_STATUS, PRIORITY } from './labels'
import { TRACK, TRACKS } from './tracks'
import { taskCfg } from './taskcfg'
import { mzCfg, mzKeyOf } from './mizito'
import { uid } from './api'

export type Target = 'Tasks' | 'FollowUps' | 'Mizito' | 'Contacts' | 'Log'
export type Kind = 'text' | 'long' | 'date' | 'stamp' | 'person' | 'people' | 'enum' | 'link' | 'id'
export interface FieldDef {
  key: string
  fa: string
  en: string
  kind: Kind
  /** header names that point at this field (lower case) */
  syn: string[]
  required?: boolean
}

export const TARGETS: Record<Target, { fa: string; en: string; fields: FieldDef[] }> = {
  Tasks: {
    fa: 'تسک‌ها', en: 'Tasks',
    fields: [
      { key: 'ext_id', fa: 'شناسه‌ی قدیمی', en: 'Old ID', kind: 'id', syn: ['id', 'شناسه', 'کد'] },
      { key: 'title', fa: 'عنوان', en: 'Title', kind: 'text', syn: ['task', 'title', 'request', 'عنوان', 'تسک', 'موضوع'], required: true },
      { key: 'description', fa: 'توضیحات', en: 'Description', kind: 'long', syn: ['description', 'description / why now', 'desc', 'شرح', 'توضیحات'] },
      { key: 'notes', fa: 'یادداشت‌ها (به توضیحات اضافه می‌شود)', en: 'Notes (appended to description)', kind: 'long', syn: ['notes', 'note', 'update', 'یادداشت'] },
      { key: 'assignee', fa: 'مسئول', en: 'Assignee', kind: 'person', syn: ['owner', 'assignee', 'assign to', 'owner / assign to', 'مسئول'] },
      { key: 'requested_by', fa: 'درخواست‌دهنده', en: 'Requested by', kind: 'person', syn: ['asked by', 'requested by', 'requester', 'درخواست', 'درخواست‌دهنده'] },
      { key: 'status', fa: 'وضعیت', en: 'Status', kind: 'enum', syn: ['status', 'وضعیت', 'outcome'] },
      { key: 'priority', fa: 'اولویت', en: 'Priority', kind: 'enum', syn: ['priority', 'اولویت'] },
      { key: 'flag', fa: 'پرچم', en: 'Flag', kind: 'enum', syn: ['⚑', 'flag', 'my flag', 'flag / board', 'پرچم'] },
      { key: 'track', fa: 'تیم', en: 'Team', kind: 'enum', syn: ['area', 'team', 'unit', 'line', 'تیم', 'واحد', 'لاین', 'حوزه'] },
      { key: 'assigned_at', fa: 'تاریخ اساین', en: 'Assigned on', kind: 'date', syn: ['assigned', 'assigned at', 'logged', 'date', 'تاریخ اساین'] },
      { key: 'due_date', fa: 'ددلاین', en: 'Deadline', kind: 'date', syn: ['due', 'deadline', 'due date', 'due (shamsi)', 'ددلاین', 'سررسید'] },
      { key: 'link', fa: 'لینک', en: 'Link', kind: 'link', syn: ['link', 'task link', 'لینک'] },
      { key: 'completed_at', fa: 'تاریخ بسته شدن', en: 'Closed on', kind: 'date', syn: ['closed', 'completed', 'done at'] },
    ],
  },
  FollowUps: {
    fa: 'پیگیری‌ها', en: 'Follow-ups',
    fields: [
      { key: 'ext_id', fa: 'شناسه‌ی قدیمی', en: 'Old ID', kind: 'id', syn: ['id', 'شناسه'] },
      { key: 'subject', fa: 'موضوع', en: 'Subject', kind: 'text', syn: ['task', 'subject', 'title', 'موضوع', 'عنوان'], required: true },
      { key: 'person', fa: 'از چه کسی', en: 'With whom', kind: 'person', syn: ['owner', 'person', 'with', 'طرف', 'از چه کسی'] },
      { key: 'waiting_for', fa: 'منتظر چه چیزی', en: 'Waiting for', kind: 'text', syn: ['waiting for', 'منتظر'] },
      { key: 'notes', fa: 'یادداشت / سابقه', en: 'Notes', kind: 'long', syn: ['notes', 'description', 'update', 'یادداشت', 'شرح'] },
      { key: 'status', fa: 'وضعیت', en: 'Status', kind: 'enum', syn: ['status', 'وضعیت'] },
      { key: 'priority', fa: 'اولویت', en: 'Priority', kind: 'enum', syn: ['priority', 'اولویت'] },
      { key: 'due_date', fa: 'پینگ بعدی', en: 'Next ping', kind: 'date', syn: ['next ping', 'due', 'due (shamsi)', 'پینگ بعدی'] },
      { key: 'created_at', fa: 'تاریخ ثبت', en: 'Created', kind: 'date', syn: ['assigned', 'created', 'date', 'تاریخ'] },
      { key: 'link', fa: 'لینک', en: 'Link', kind: 'link', syn: ['link', 'task link', 'لینک'] },
    ],
  },
  Mizito: {
    fa: 'میزیتو', en: 'Mizito',
    fields: [
      { key: 'ext_id', fa: 'شناسه‌ی قدیمی', en: 'Old ID', kind: 'id', syn: ['id', 'شناسه'] },
      { key: 'title', fa: 'عنوان', en: 'Title', kind: 'text', syn: ['task', 'title', 'عنوان'], required: true },
      { key: 'description', fa: 'شرح', en: 'Description', kind: 'long', syn: ['description', 'شرح', 'توضیحات'] },
      { key: 'link', fa: 'لینک میزیتو', en: 'Mizito link', kind: 'link', syn: ['link', 'لینک'] },
      { key: 'asked_by', fa: 'مطرح‌کننده / منشن‌کننده', en: 'Asked by', kind: 'person', syn: ['asked by', 'from', 'mentioned by', 'مطرح‌کننده'] },
      { key: 'received_at', fa: 'تاریخ منشن', en: 'Mentioned on', kind: 'stamp', syn: ['date', 'shamsi', 'received', 'تاریخ'] },
      { key: 'status', fa: 'وضعیت', en: 'Status', kind: 'enum', syn: ['status', 'وضعیت'] },
      { key: 'priority_override', fa: 'اولویت (دستی؛ خالی = محاسبه)', en: 'Priority (manual; blank = computed)', kind: 'enum', syn: ['priority', 'اولویت'] },
      { key: 'category', fa: 'دسته', en: 'Category', kind: 'enum', syn: ['category', 'دسته'] },
      { key: 'action', fa: 'نوع اقدام', en: 'Action', kind: 'enum', syn: ['action', 'نوع اقدام'] },
      { key: 'outcome', fa: 'نتیجه', en: 'Outcome', kind: 'long', syn: ['outcome', 'نتیجه'] },
      { key: 'due_date', fa: 'ددلاین', en: 'Deadline', kind: 'date', syn: ['due', 'deadline', 'ددلاین'] },
      { key: 'assigned_to', fa: 'سپرده به', en: 'Handed to', kind: 'person', syn: ['assigned to', 'handed to', 'سپرده به'] },
    ],
  },
  Contacts: {
    fa: 'اشخاص', en: 'People',
    fields: [
      { key: 'name', fa: 'نام', en: 'Name', kind: 'text', syn: ['name', 'نام'], required: true },
      { key: 'tier', fa: 'رده', en: 'Tier', kind: 'enum', syn: ['level', 'tier', 'rank', 'رده'] },
      { key: 'title', fa: 'سمت', en: 'Title', kind: 'text', syn: ['title', 'role', 'position', 'سمت'] },
      { key: 'org', fa: 'واحد / سازمان', en: 'Unit / org', kind: 'text', syn: ['org', 'organisation', 'organization', 'unit', 'سازمان', 'واحد'] },
      { key: 'email', fa: 'ایمیل', en: 'Email', kind: 'text', syn: ['email', 'mail', 'ایمیل'] },
      { key: 'phone', fa: 'تلفن', en: 'Phone', kind: 'text', syn: ['phone', 'mobile', 'تلفن', 'موبایل'] },
    ],
  },
  Log: {
    fa: 'لاگ قدیمی (تاریخچه‌ی تسک‌ها و پیگیری‌ها)', en: 'Old log (history of tasks & follow-ups)',
    fields: [
      { key: 'ext_id', fa: 'شناسه‌ی تسک / پیگیری', en: 'Task / follow-up ID', kind: 'id', syn: ['id', 'شناسه'], required: true },
      { key: 'at', fa: 'زمان', en: 'When', kind: 'stamp', syn: ['when', 'time', 'date', 'زمان', 'تاریخ'] },
      { key: 'event', fa: 'رویداد', en: 'Event', kind: 'text', syn: ['event', 'رویداد'] },
      { key: 'detail', fa: 'جزئیات', en: 'Detail', kind: 'long', syn: ['detail', 'details', 'جزئیات'] },
    ],
  },
}

// ------------------------------------------------------------------ parsing
const SEP = '\u0001'
/** A cell from a Google Sheet may carry its link: "text\u0001url". */
export const cellText = (v: string) => String(v ?? '').split(SEP)[0].trim()
export const cellLink = (v: string) => {
  const parts = String(v ?? '').split(SEP)
  if (parts[1]) return parts[1].trim()
  const t = parts[0].trim()
  return /^https?:\/\//i.test(t) ? t : ''
}

/** Pasted text (tabs from a spreadsheet) or CSV. */
export function parseText(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n')
  const firstLine = t.split('\n', 1)[0]
  const delim = firstLine.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === delim) row.push(cell), (cell = '')
    else if (ch === '\n') row.push(cell), rows.push(row), (row = []), (cell = '')
    else cell += ch
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

const norm = (s: string) => cellText(s).toLowerCase().replace(/[\s_]+/g, ' ').trim()

/** The header row: the first row where several cells look like known column names. */
export function detectHeader(rows: string[][], target: Target): number {
  const syn = new Set(TARGETS[target].fields.flatMap((f) => f.syn))
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = rows[i].filter((c) => syn.has(norm(c))).length
    if (hits >= 2) return i
  }
  return 0
}

export function guessColumns(headers: string[], target: Target): Record<string, number> {
  const out: Record<string, number> = {}
  const used = new Set<number>()
  for (const f of TARGETS[target].fields) {
    // the synonyms are in order of preference ("notes" before "update")
    for (const syn of f.syn) {
      const i = headers.findIndex((h, k) => !used.has(k) && norm(h) === syn)
      if (i >= 0) {
        out[f.key] = i
        used.add(i)
        break
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ values
const pad = (n: number) => String(n).padStart(2, '0')
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/** "2026-08-11", "2026-08-11 09:14:26", "1405/05/31", "1405/05/20 9:32", "8/11/2026" → ISO (with time when asked). */
export function parseDate(v: string, withTime = false): string {
  const s = toLatin(cellText(v)).replace(/‏|‎/g, '')
  if (!s || s === '-' || s === '—') return ''
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s)
  if (m) {
    let y = +m[1], mo = +m[2], d = +m[3]
    if (y < 1700) {
      const g = toGregorian(y, mo, d)
      y = g.gy
      mo = g.gm
      d = g.gd
    }
    const date = `${y}-${pad(mo)}-${pad(d)}`
    return withTime ? `${date} ${m[4] ? `${pad(+m[4])}:${m[5]}` : '09:00'}` : date
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (m) {
    const date = `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`
    return withTime ? `${date} 09:00` : date
  }
  return ''
}

export interface EnumOpt { value: string; label: string }
/** The choices for an enum field of a target. */
export function enumOptions(target: Target, key: string): EnumOpt[] {
  const c = mzCfg()
  const L2 = (fa: string, en: string) => tr([fa, en])
  if (key === 'status' && target === 'Tasks') return columns().map((x) => ({ value: x.id, label: statusLabel(x.id) }))
  if (key === 'status' && target === 'FollowUps') return (Object.keys(FOLLOWUP_STATUS) as (keyof typeof FOLLOWUP_STATUS)[]).map((k) => ({ value: k, label: tr(FOLLOWUP_STATUS[k]) }))
  if (key === 'status' && target === 'Mizito') return c.statuses.map((s) => ({ value: s.id, label: L2(s.fa, s.en) }))
  if (key === 'priority') return (Object.keys(PRIORITY) as (keyof typeof PRIORITY)[]).map((k) => ({ value: k, label: tr(PRIORITY[k]) }))
  if (key === 'priority_override') return ['P0', 'P1', 'P2', 'P3'].map((p) => ({ value: p, label: p }))
  if (key === 'flag') return taskCfg().flags.map((f) => ({ value: f.id, label: L2(f.fa, f.en) }))
  if (key === 'track') return TRACKS.map((t) => ({ value: t, label: tr(TRACK[t] || [t, t]) }))
  if (key === 'category') return c.categories.map((o) => ({ value: o.id, label: L2(o.fa, o.en) }))
  if (key === 'action') return c.actions.map((o) => ({ value: o.id, label: L2(o.fa, o.en) }))
  if (key === 'tier') return c.tiers.map((t) => ({ value: t.id, label: L2(t.fa, t.en) }))
  return []
}

const ALIASES: Record<string, Record<string, string>> = {
  status: {
    'to do': 'todo', todo: 'todo', open: 'todo', 'not started': 'todo', 'in progress': 'in_progress', doing: 'in_progress', waiting: 'waiting', 'on hold': 'waiting', blocked: 'blocked',
    'in review': 'review', review: 'review', qa: 'qa', testing: 'qa', done: 'done', closed: 'done', delivered: 'done', cancelled: 'cancelled', canceled: 'cancelled', backlog: 'backlog', intake: 'intake',
    'needs action': 'needs_action', 'awaiting reply': 'awaiting', awaiting: 'awaiting',
  },
  priority: { p0: 'critical', p1: 'high', p2: 'medium', p3: 'low', urgent: 'critical', critical: 'critical', high: 'high', medium: 'medium', normal: 'medium', low: 'low' },
  priority_override: { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3' },
  flag: { watch: 'watch', key: 'key', escalate: 'escalate' },
  tier: { executive: 'executive', exec: 'executive', ceo: 'executive', deputy: 'deputy', vp: 'deputy', manager: 'manager', standard: 'standard', staff: 'standard' },
  action: { approve: 'approve', advise: 'advise', 'follow-up': 'followup', followup: 'followup', fyi: 'fyi' },
  category: { 'product & development': 'product', 'finance & contracts': 'finance', 'infrastructure & access': 'infra', 'people & hr': 'people', 'cross-team coordination': 'cross' },
}

/** Best guess for a source value: an alias, an exact id or label, or a label that contains it. */
export function guessValue(target: Target, key: string, raw: string): string {
  const opts = enumOptions(target, key)
  const v = cellText(raw).replace(/[^\p{L}\p{N}&\s/-]+/gu, ' ').trim().toLowerCase()
  if (!v) return ''
  const alias = ALIASES[key]?.[v]
  if (alias && (opts.some((o) => o.value === alias) || key === 'status')) {
    if (opts.some((o) => o.value === alias)) return alias
    // FollowUps: open / waiting / done
    if (target === 'FollowUps') return alias === 'done' || alias === 'cancelled' ? 'done' : alias === 'waiting' || alias === 'blocked' || alias === 'review' ? 'waiting' : 'open'
    if (target === 'Mizito') return alias === 'done' ? opts.find((o) => o.value === 'done')?.value || '' : ''
  }
  const hit = opts.find((o) => o.value.toLowerCase() === v || o.label.toLowerCase() === v) || opts.find((o) => o.label.toLowerCase().includes(v) || v.includes(o.label.toLowerCase()))
  return hit?.value || ''
}

// ------------------------------------------------------------------ building rows
export interface Plan {
  target: Target
  rows: string[][]
  header: number
  cols: Record<string, number>
  values: Record<string, Record<string, string>>
  /** add names nobody knows to People (and assignees to the department) */
  addPeople: boolean
  me: string
}
export interface Built {
  Tasks: Task[]
  FollowUps: FollowUp[]
  Mizito: MizitoItem[]
  MizitoMentions: MizitoMention[]
  Contacts: Contact[]
  Team: Member[]
  History: HistoryRow[]
  Comments: Comment[]
  /** rows skipped because they already exist */
  dupes: number
  /** source rows merged into an existing / earlier item as mentions */
  merged: number
  /** rows without the required field */
  empty: number
  unknownPeople: string[]
  batch: string
}

export function distinctValues(p: Plan, key: string): string[] {
  const i = p.cols[key]
  if (i === undefined || i < 0) return []
  return [...new Set(p.rows.slice(p.header + 1).map((r) => cellText(r[i] || '')).filter(Boolean))].slice(0, 80)
}

const titleKey = (s: string) => cellText(s).replace(/\s+/g, ' ').trim().toLowerCase()

export function build(db: DB, p: Plan): Built {
  const batch = `B-${Date.now().toString(36)}`
  const out: Built = { Tasks: [], FollowUps: [], Mizito: [], MizitoMentions: [], Contacts: [], Team: [], History: [], Comments: [], dupes: 0, merged: 0, empty: 0, unknownPeople: [], batch }
  const fields = TARGETS[p.target].fields
  const known = new Set([...db.Team.map((m) => m.name), ...db.Contacts.map((c) => c.name)])
  const unknown = new Set<string>()
  const person = (v: string) => {
    const n = cellText(v)
    if (!n || n === '-' || n === '—') return ''
    if (/^(me|من)$/i.test(n)) return p.me
    if (/^other$/i.test(n)) return ''
    if (!known.has(n)) unknown.add(n)
    return n
  }
  const read = (r: string[], key: string) => {
    const i = p.cols[key]
    if (i === undefined || i < 0) return ''
    const f = fields.find((x) => x.key === key)!
    const raw = r[i] ?? ''
    switch (f.kind) {
      case 'date':
        return parseDate(raw)
      case 'stamp':
        return parseDate(raw, true)
      case 'person':
        return person(raw)
      case 'link':
        return cellLink(raw)
      case 'enum':
        return p.values[key]?.[cellText(raw)] ?? guessValue(p.target, key, raw)
      default:
        return cellText(raw)
    }
  }
  const data = p.rows.slice(p.header + 1)
  const req = fields.find((f) => f.required)!

  if (p.target === 'Tasks' || p.target === 'FollowUps') {
    const list = p.target === 'Tasks' ? db.Tasks : db.FollowUps
    const seenIds = new Set(list.map((x) => (x as { ext_id?: string }).ext_id).filter(Boolean))
    const seenTitles = new Set(list.map((x) => titleKey('title' in x ? x.title : (x as FollowUp).subject)))
    for (const r of data) {
      const title = read(r, req.key)
      if (!title) {
        out.empty++
        continue
      }
      const ext = read(r, 'ext_id')
      if ((ext && seenIds.has(ext)) || (!ext && seenTitles.has(titleKey(title)))) {
        out.dupes++
        continue
      }
      if (ext) seenIds.add(ext)
      seenTitles.add(titleKey(title))
      if (p.target === 'Tasks') {
        const notes = read(r, 'notes')
        const desc = [read(r, 'description'), notes && `— ${notes}`].filter(Boolean).join('\n\n')
        const status = read(r, 'status') || 'todo'
        out.Tasks.push({
          id: uid('T'), project_id: '', sprint_id: '', title, description: desc, assignee: read(r, 'assignee'), reporter: p.me, status, priority: (read(r, 'priority') || 'medium') as Task['priority'],
          due_date: read(r, 'due_date'), points: 0, tags: '', created_at: read(r, 'assigned_at') || new Date().toISOString().slice(0, 10), completed_at: status === 'done' ? read(r, 'completed_at') || read(r, 'due_date') || '' : '',
          track: read(r, 'track'), depends_on: '', meeting_id: '', private: '', assigned_at: read(r, 'assigned_at'), flag: read(r, 'flag'), blocked_reason: '', blocked_by: '',
          blocked_since: status === 'blocked' ? new Date().toISOString().slice(0, 10) : '', updated_at: '', link: read(r, 'link'), requested_by: read(r, 'requested_by'),
          ext_id: ext, batch,
        } as Task)
      } else {
        const status = (read(r, 'status') || 'open') as FollowUp['status']
        out.FollowUps.push({
          id: uid('F'), project_id: '', subject: title, person: read(r, 'person'), channel: 'other', due_date: read(r, 'due_date'), status, priority: (read(r, 'priority') || 'medium') as FollowUp['priority'],
          notes: read(r, 'notes'), created_at: read(r, 'created_at') || new Date().toISOString().slice(0, 10), done_at: status === 'done' ? read(r, 'due_date') || read(r, 'created_at') : '', owner: p.me,
          waiting_for: read(r, 'waiting_for'), link: read(r, 'link'), last_ping: '', ping_count: 0, ext_id: ext, batch,
        } as FollowUp)
      }
    }
  }

  if (p.target === 'Mizito') {
    // group the rows by Mizito task: the link's id, else the title
    const groups = new Map<string, string[][]>()
    for (const r of data) {
      const title = read(r, 'title')
      if (!title) {
        out.empty++
        continue
      }
      const key = mzKeyOf(read(r, 'link')) || `t:${titleKey(title)}`
      groups.set(key, [...(groups.get(key) || []), r])
    }
    for (const [key, rs] of groups) {
      const sorted = [...rs].sort((a, b) => (read(a, 'received_at') < read(b, 'received_at') ? -1 : 1))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const existing = db.Mizito.find((m) => (key.startsWith('t:') ? titleKey(m.title) === key.slice(2) : m.mz_key === key))
      const itemId = existing?.id || uid('MZ')
      const mentionRows = existing ? sorted : sorted.slice(1)
      if (!existing) {
        const link = read(first, 'link') || sorted.map((r) => read(r, 'link')).find(Boolean) || ''
        const outcome = sorted.map((r) => read(r, 'outcome')).filter(Boolean)
        const status = read(last, 'status') || mzCfg().statuses[0]?.id || ''
        const closed = ['done', 'cancelled'].includes(mzCfg().statuses.find((s) => s.id === status)?.cat || '')
        out.Mizito.push({
          id: itemId, mz_key: key.startsWith('t:') ? '' : key, link, title: read(first, 'title'), description: read(first, 'description'), docs: '', asked_by: read(first, 'asked_by'), mentioned: p.me,
          category: read(last, 'category') || read(first, 'category'), action: read(last, 'action') || read(first, 'action'), status, priority_override: read(last, 'priority_override'), override_reason: '',
          urgent: '', assigned_to: read(last, 'assigned_to'), due_date: read(last, 'due_date'), received_at: read(first, 'received_at'), last_mention_at: read(last, 'received_at'),
          last_mention_by: read(last, 'asked_by'), outcome: [...new Set(outcome)].join('\n'), notes: '', created_at: (read(first, 'received_at') || '').slice(0, 10), updated_at: read(last, 'received_at'),
          closed_at: closed ? read(last, 'received_at') : '', ext_id: read(first, 'ext_id'), batch,
        } as MizitoItem)
      }
      for (const r of mentionRows) {
        out.merged++
        const desc = read(r, 'description')
        out.MizitoMentions.push({ id: uid('MM'), item_id: itemId, by: read(r, 'asked_by'), at: read(r, 'received_at'), note: [read(r, 'outcome'), desc && desc !== read(first, 'description') ? desc : ''].filter(Boolean).join('\n'), status: read(r, 'status'), batch })
      }
    }
  }

  if (p.target === 'Contacts') {
    const names = new Set(db.Contacts.map((c) => c.name))
    for (const r of data) {
      const name = cellText(r[p.cols.name] || '')
      if (!name) {
        out.empty++
        continue
      }
      if (names.has(name)) {
        out.dupes++
        continue
      }
      names.add(name)
      out.Contacts.push({ id: uid('CT'), name, name_en: /^[\x20-\x7e]+$/.test(name) ? name : '', title: read(r, 'title'), org: read(r, 'org'), tier: read(r, 'tier'), email: read(r, 'email'), phone: read(r, 'phone'), notes: '', active: 'true', batch })
    }
  }

  if (p.target === 'Log') {
    // the old log: notes become comments, field changes ("A → B") become history lines on the imported rows
    const byExt = new Map<string, { entity: 'Tasks' | 'FollowUps'; id: string }>()
    db.Tasks.forEach((t) => t.ext_id && byExt.set(t.ext_id, { entity: 'Tasks', id: t.id }))
    db.FollowUps.forEach((f) => f.ext_id && byExt.set(f.ext_id, { entity: 'FollowUps', id: f.id }))
    const FIELD: Record<string, string> = { status: 'status', due: 'due_date', priority: 'priority', flag: 'flag', owner: 'assignee', assignee: 'assignee' }
    for (const r of data) {
      const hit = byExt.get(read(r, 'ext_id'))
      if (!hit) {
        out.empty++
        continue
      }
      const at = read(r, 'at') || ''
      const ev = read(r, 'event')
      const detail = read(r, 'detail')
      const field = FIELD[ev.toLowerCase()]
      if (/^note$/i.test(ev) || (!field && !ev)) {
        out.Comments.push({ id: uid('C'), entity: hit.entity, entity_id: hit.id, author: p.me, body: detail, created_at: at } as Comment)
        continue
      }
      const [from, to] = detail.includes('→') ? detail.split('→').map((x) => x.trim()) : ['', detail]
      out.History.push({ id: uid('H'), entity: hit.entity, entity_id: hit.id, field: field || '_event', from: field ? from.replace(/^—$/, '') : ev, to: field ? to.replace(/^—$/, '') : detail, by: p.me, at } as HistoryRow)
    }
  }

  // people nobody knows: add them to People (assignees also to the department) so pickers and tiers work
  out.unknownPeople = [...unknown]
  if (p.addPeople) {
    const assignees = new Set([...out.Tasks.map((t) => t.assignee)])
    for (const n of unknown) {
      if (assignees.has(n)) out.Team.push({ id: uid('M'), name: n, name_en: /^[\x20-\x7e]+$/.test(n) ? n : '', role: '', email: '', team: '', track: '', capacity: 100, photo: '', tasks_private: '', phone: '', access: 'member', active: 'true', batch } as Member)
      else out.Contacts.push({ id: uid('CT'), name: n, name_en: /^[\x20-\x7e]+$/.test(n) ? n : '', title: '', org: '', tier: '', email: '', phone: '', notes: '', active: 'true', batch })
    }
  }
  return out
}
