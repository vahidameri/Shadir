// Mizito import: the JSON that Claude (in Chrome, on the Mizito page) writes after reading the
// «دستیار میزیتو» chat, turned into the items the server's Mizito ingest takes.
//
// Built to never add a task twice and never lose part of one:
//  - a task is the same task when its «لینک وظیفه» id matches, or (without two different links) when
//    its title matches, ignoring spaces, half-spaces, punctuation and Arabic/Persian letter forms —
//    within one paste, across parts, and against what Madar already has
//  - the same task listed twice (two parts, or a light second entry) is merged: every field takes
//    the fuller value, mentions and comments are joined
//  - a field Claude left empty is sent empty and the server keeps what it had (see mzIngest_)
//  - names are matched to the people Madar knows, so tiers (and SLA) follow the right person
//  - ids of mentions and comments come from their content, so a re-import adds nothing twice
//  - one broken part does not stop the others; a cut-off part keeps its complete tasks
import { toGregorian } from './jalali'
import readerSrc from './mizito-reader.js?raw'

export interface MzImportItem {
  key: string
  title: string
  notes: string
  link: string
  first_at: string
  project: string
  owner: string
  assignees: string[]
  labels: string[]
  created_at: string
  /** undefined = Claude did not say: Madar keeps what it has */
  completed?: boolean
  completed_at: string
  completed_by: string
  progress?: number
  deadline: string
  checklist: { t: string; ok: boolean }[]
  mentions: { id: string; by: string; at: string; comment: string }[]
  comments: { id: string; by: string; at: string; body: string; mentions: string[]; reply_to: string; files: string[] }[]
  last_by?: string
  last_at?: string
  sig: string
}

export interface MzImportResult {
  account: string
  items: MzImportItem[]
  problems: string[]
  /** parts read / parts that could not be read */
  parts: number
  broken: number
  /** tasks in the paste before merging the same task listed twice */
  listed: number
}

/** The Mizito workspace id (the part before _sl in every task link): never a task's id. */
const WORKSPACE = '6676840b66142fd4ac5d5f1a'
const BOT = /دستیار\s*‌?\s*میزیتو|mizito\s*assistant/i

const latin = (s: unknown) =>
  String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const letters = (s: unknown) => latin(s).replace(/ي/g, 'ی').replace(/ى/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا')
const clean = (s: unknown) => letters(s).replace(/[‌‏‎ ]/g, ' ').replace(/\s+/g, ' ').trim()
const text = (s: unknown) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\r/g, '').trim()
/** Compare key: no spaces, half-spaces, punctuation or letter-form differences. Same rule as Code.gs mzTitleKey_. */
export const mzTitleKey = (s: unknown) =>
  letters(s)
    .toLowerCase()
    .replace(/[\s‌‏‎ .,،:;!?؟«»"'`()[\]{}\-_/\\|*#@…ـ+=<>~^%$&]+/g, '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,،]/)).map(clean).filter(Boolean)

const J_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

/** "1405/07/12 14:30", "14:30 - 1405/7/12", "12 مهر 1405 ساعت 14:30", "2026-10-03T11:00", Persian digits → ISO with Tehran time ('' if unreadable) */
export function mzDate(v: unknown): string {
  const s = clean(v)
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = new Date(s)
    if (!isNaN(t.getTime())) return t.toISOString()
  }
  let y = 0, mo = 0, d = 0
  const ymd = /(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})/.exec(s)
  if (ymd) [y, mo, d] = [+ymd[1], +ymd[2], +ymd[3]]
  else {
    const named = new RegExp(`(\\d{1,2})\\s*(${J_MONTH_NAMES.join('|')})\\s*(\\d{4})`).exec(s.replace(/ارديبهشت/g, 'اردیبهشت'))
    if (named) [y, mo, d] = [+named[3], J_MONTH_NAMES.indexOf(named[2]) + 1, +named[1]]
  }
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  if (y < 1700) {
    const g = toGregorian(y, mo, d)
    ;[y, mo, d] = [g.gy, g.gm, g.gd]
  }
  const rest = ymd ? s.replace(ymd[0], ' ') : s
  const tm = /(\d{1,2}):(\d{2})/.exec(rest)
  const p = (n: number) => String(n).padStart(2, '0')
  const hh = tm ? Math.min(23, +tm[1]) : 0
  return `${y}-${p(mo)}-${p(d)}T${p(hh)}:${tm ? tm[2] : '00'}:00+03:30`
}

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let h2 = 0x01000193
  for (let i = s.length - 1; i >= 0; i--) {
    h2 ^= s.charCodeAt(i)
    h2 = Math.imul(h2, 0x811c9dc5)
  }
  return (h >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

/** The task's id in Mizito from its «لینک وظیفه»: the part after _sl, or a 24-hex part that is not the workspace. */
export function mzKeyFromLink(link: string) {
  const s = String(link || '')
  const sl = /_sl([0-9a-f]{24})/i.exec(s)
  if (sl) return sl[1].toLowerCase()
  const hex = (s.match(/[0-9a-f]{24}/gi) || []).map((x) => x.toLowerCase()).filter((x) => x !== WORKSPACE)
  return hex.length ? hex[hex.length - 1] : ''
}

/** People Madar knows, by compare key; a written name becomes the name Madar uses. */
export function nameMatcher(known: string[]) {
  const byKey = new Map<string, string>()
  known.filter(Boolean).forEach((n) => byKey.set(mzTitleKey(n), n))
  const keys = [...byKey.keys()]
  return (raw: unknown): string => {
    const n = clean(raw).replace(/^@/, '')
    if (!n || BOT.test(n)) return ''
    const k = mzTitleKey(n)
    if (byKey.has(k)) return byKey.get(k)!
    // a shorter or longer form of one known name ("علیزاده", "جلیل علیزاده (CPTO)")
    if (k.length >= 4) {
      const hit = keys.filter((x) => x.length >= 4 && (x.includes(k) || k.includes(x)))
      if (hit.length === 1) return byKey.get(hit[0])!
    }
    return n
  }
}

/** Parts pasted: every ```json block, or the bare JSON with text around it. A cut-off part keeps its complete tasks. */
function readParts(src: string, problems: string[]) {
  const fenced = [...src.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi)].map((m) => m[1].trim()).filter(Boolean)
  const chunks = fenced.length ? fenced : [src.slice(Math.max(0, src.search(/[[{]/)))]
  const out: unknown[] = []
  let broken = 0
  chunks.forEach((c, i) => {
    try {
      out.push(JSON.parse(c))
      return
    } catch {}
    // cut off mid-answer: close it after the last complete task
    for (let end = c.lastIndexOf('}'); end > 0; end = c.lastIndexOf('}', end - 1)) {
      for (const tail of [']}', ']', '}]}']) {
        try {
          out.push(JSON.parse(c.slice(0, end + 1) + tail))
          problems.push(`بخش ${i + 1} ناقص بود؛ تسک‌های کاملش خوانده شد (آخرین تسکش را دوباره از Claude بگیرید)`)
          return
        } catch {}
      }
    }
    broken++
    problems.push(`بخش ${i + 1} خوانده نشد (JSON درست نیست)؛ این بخش را دوباره از Claude بخواهید`)
  })
  return { parsed: out, parts: chunks.length, broken }
}

interface Existing {
  mz_key?: string
  title?: string
  link?: string
}

/** Reads what Claude wrote and turns it into one item per task. */
export function parseMzImport(raw: string, fallbackAccount: string, existing: Existing[] = [], people: string[] = []): MzImportResult {
  const problems: string[] = []
  const { parsed, parts, broken } = readParts(String(raw || '').trim(), problems)
  const blocks: { account?: string; tasks?: unknown[] }[] = []
  parsed.forEach((d) => {
    if (Array.isArray(d)) {
      if (d.length && d.every((x) => x && typeof x === 'object' && 'tasks' in (x as object))) blocks.push(...(d as { tasks: unknown[] }[]))
      else blocks.push({ tasks: d })
    } else if (d && typeof d === 'object') blocks.push(d as { account?: string; tasks?: unknown[] })
  })
  const who = nameMatcher(people)
  const account = who(blocks.find((b) => b.account)?.account) || fallbackAccount

  // tasks Madar has: by Mizito id and by title (a title with two different Mizito ids is ambiguous)
  const realKey = (k: string) => /^[0-9a-f]{24}$/i.test(k)
  const haveByKey = new Map<string, Existing>()
  const haveByTitle = new Map<string, Existing[]>()
  existing.forEach((m) => {
    const k = String(m.mz_key || '').replace(/^.*_sl/i, '')
    if (!k) return
    haveByKey.set(k, m)
    const t = mzTitleKey(m.title)
    if (t) haveByTitle.set(t, [...(haveByTitle.get(t) || []), m])
  })
  const keyOfExisting = (m: Existing) => String(m.mz_key || '').replace(/^.*_sl/i, '')
  const linkKeyOf = (m: Existing) => mzKeyFromLink(String(m.link || ''))

  const items = new Map<string, MzImportItem>()
  const byTitle = new Map<string, string>() // title key → item key, within this paste
  let listed = 0

  blocks.forEach((b) =>
    (b.tasks || []).forEach((raw0, i) => {
      const t = (raw0 || {}) as Record<string, unknown>
      const title = text(t.title).replace(/\s+/g, ' ')
      if (!title) return problems.push(`یک تسک بدون عنوان کنار گذاشته شد (شماره‌ی ${i + 1} در بخش خودش)`)
      listed++
      const link = String(t.link || '').trim().replace(/\s+/g, '')
      const fromLink = mzKeyFromLink(link)
      const tk = mzTitleKey(title)
      // which task is this: the link's id; else the same title already in this paste or in Madar
      let key = ''
      if (fromLink && (items.has(fromLink) || haveByKey.has(fromLink))) key = fromLink
      if (!key) {
        const here = byTitle.get(tk)
        const hereItem = here ? items.get(here) : undefined
        if (hereItem && !(fromLink && realKey(hereItem.key) && mzKeyFromLink(hereItem.link) && mzKeyFromLink(hereItem.link) !== fromLink)) key = hereItem.key
      }
      if (!key) {
        const same = (haveByTitle.get(tk) || []).filter((m) => !(fromLink && linkKeyOf(m) && linkKeyOf(m) !== fromLink))
        if (same.length === 1) key = keyOfExisting(same[0])
        else if (same.length > 1) {
          key = keyOfExisting(same.find((m) => linkKeyOf(m)) || same[0])
          problems.push(`«${title.slice(0, 50)}» در مدار چند بار هست؛ «یکی کردن تکراری‌ها» را بزنید`)
        }
      }
      if (!key) key = fromLink || 'imp' + hash(tk)

      const mentionId = (by: string, at: string, body: string) => {
        const b2 = mzTitleKey(body)
        return 'imp' + hash(`${key}|${mzTitleKey(by)}|${b2.length >= 15 ? b2.slice(0, 300) : b2 + '|' + at.slice(0, 10)}`)
      }
      const mentions = (Array.isArray(t.mentions) ? t.mentions : [])
        .map((x: Record<string, unknown>) => {
          const at = mzDate(x.at)
          const by = who(x.by)
          const body = text(x.text)
          return { id: mentionId(by, at, body), by, at, comment: body }
        })
        .filter((x) => {
          if (!x.at) problems.push(`«${title.slice(0, 40)}»: یک منشن بی‌تاریخ کنار گذاشته شد`)
          return !!x.at
        })
      const comments = (Array.isArray(t.comments) ? t.comments : [])
        .map((c: Record<string, unknown>) => {
          const at = mzDate(c.at)
          const by = who(c.by)
          const body = text(c.text)
          return { id: mentionId(by, at, body), by, at, body, mentions: list(c.mentions).map(who).filter(Boolean), reply_to: '', files: list(c.files) }
        })
        .filter((c) => c.body || c.files.length)
      const status = clean(t.status).toLowerCase()
      const completed = !status ? undefined : /done|انجام|بسته|complete|closed|تمام/.test(status)
      const progressRaw = latin(t.progress).replace(/[^\d.]/g, '')
      const item: MzImportItem = {
        key,
        title,
        notes: text(t.description),
        link: fromLink ? link : '',
        first_at: mzDate(t.first_mention_at),
        project: clean(t.project),
        owner: who(t.owner),
        assignees: list(t.assignees).map(who).filter(Boolean),
        labels: list(t.labels),
        created_at: mzDate(t.created_at),
        completed,
        completed_at: completed ? mzDate(t.done_at) : '',
        completed_by: completed ? who(t.done_by) : '',
        progress: progressRaw === '' ? undefined : Math.max(0, Math.min(100, Number(progressRaw) || 0)),
        deadline: mzDate(t.deadline),
        checklist: (Array.isArray(t.checklist) ? t.checklist : []).map((c: Record<string, unknown>) => ({ t: text(c.title ?? c.t), ok: !!(c.done ?? c.ok) })).filter((c) => c.t),
        mentions,
        comments,
        sig: '',
      }
      if (link && !fromLink) problems.push(`«${title.slice(0, 50)}»: لینکش شناسه‌ی تسک ندارد (${link.slice(0, 60)})`)

      const prev = items.get(key)
      if (!prev) {
        items.set(key, item)
        byTitle.set(tk, key)
        return
      }
      // the same task listed again: keep the fuller value of every field, join mentions and comments
      const longer = (a: string, b: string) => (b.length > a.length ? b : a)
      prev.notes = longer(prev.notes, item.notes)
      prev.link = prev.link || item.link
      prev.project = prev.project || item.project
      prev.owner = prev.owner || item.owner
      prev.assignees = prev.assignees.length >= item.assignees.length ? prev.assignees : item.assignees
      prev.labels = prev.labels.length >= item.labels.length ? prev.labels : item.labels
      prev.checklist = prev.checklist.length >= item.checklist.length ? prev.checklist : item.checklist
      prev.deadline = prev.deadline || item.deadline
      prev.created_at = prev.created_at || item.created_at
      if (item.completed !== undefined && (prev.completed === undefined || item.completed)) {
        prev.completed = item.completed
        prev.completed_at = item.completed_at || prev.completed_at
        prev.completed_by = item.completed_by || prev.completed_by
      }
      if (item.progress !== undefined && (prev.progress === undefined || item.progress > prev.progress)) prev.progress = item.progress
      if (item.first_at && (!prev.first_at || item.first_at < prev.first_at)) prev.first_at = item.first_at
      const ids = new Set(prev.mentions.map((x) => x.id))
      prev.mentions.push(...item.mentions.filter((x) => !ids.has(x.id)))
      const cids = new Set(prev.comments.map((x) => x.id))
      prev.comments.push(...item.comments.filter((x) => !cids.has(x.id)))
    }),
  )

  const out = [...items.values()]
  out.forEach((it) => {
    it.mentions.sort((a, b) => (a.at < b.at ? -1 : 1))
    it.comments.sort((a, b) => (a.at < b.at ? -1 : 1))
    // the first mention is when it reached this person
    const firstMention = it.mentions[0]?.at || ''
    it.first_at = [it.first_at, firstMention].filter(Boolean).sort()[0] || ''
    if (!it.first_at) problems.push(`«${it.title.slice(0, 50)}»: تاریخ منشن ندارد`)
    if (!it.link) problems.push(`«${it.title.slice(0, 50)}»: بدون لینک`)
    const newest = it.comments.filter((c) => c.at).slice(-1)[0]
    if (newest) {
      it.last_by = newest.by
      it.last_at = newest.at
    }
  })
  out.sort((a, b) => ((a.first_at || '9') < (b.first_at || '9') ? -1 : 1))
  return { account, items: out, problems: [...new Set(problems)], parts, broken, listed }
}

// ---------------------------------------------------------------- the reader (exactly once)
// The reliable way in: lib/mizito-reader.js runs in the Mizito tab, reads Mizito's own data and saves a
// file in which every task, mention and comment carries Mizito's own id. Imported, a task is matched
// by that id only — never by its title — so it is recorded once, however many times it is imported.

/** The code to run in the Mizito tab (browser console, a bookmark, or Claude's JavaScript tool). */
export function mzReaderScript(since: string) {
  return `(${readerSrc.trim()})(${JSON.stringify({ since })})`
}

/** For Claude in Chrome: run the reader, nothing else. */
export function mzReaderPrompt(since: string) {
  return `در تب میزیتو (که در آن وارد شده‌ام) فقط این کار را بکن: کد زیر را با ابزار اجرای JavaScript در همان صفحه اجرا کن و متنی را که برمی‌گرداند به من بگو. کد فقط از میزیتو می‌خواند، چیزی در میزیتو تغییر نمی‌دهد و نتیجه را به‌صورت یک فایل دانلود می‌کند. خودت چیزی را باز نکن، کلیک نکن و چیزی ننویس.

\`\`\`js
${mzReaderScript(since)}
\`\`\``
}

interface ReaderDoc {
  source: 'madar-reader'
  account?: string
  since?: string
  read_at?: string
  messages?: number
  items: MzImportItem[]
}

/** A file from the reader: tasks keyed by Mizito's id, names matched to the people Madar knows. */
export function parseReaderDoc(raw: string, fallbackAccount: string, people: string[] = []): MzImportResult | null {
  let doc: ReaderDoc
  try {
    doc = JSON.parse(String(raw || '').trim())
  } catch {
    return null
  }
  if (!doc || doc.source !== 'madar-reader' || !Array.isArray(doc.items)) return null
  const who = nameMatcher(people)
  const names = (l: unknown) => (Array.isArray(l) ? l : []).map(who).filter(Boolean)
  const problems: string[] = []
  const seen = new Set<string>()
  const items = doc.items
    .filter((t) => t && /^[0-9a-f]{24}$/i.test(String(t.key)) && !seen.has(t.key) && !!seen.add(t.key))
    .map((t) => ({
      ...t,
      owner: who(t.owner),
      assignees: names(t.assignees),
      completed_by: who(t.completed_by),
      last_by: who(t.last_by),
      mentions: (t.mentions || []).map((x) => ({ ...x, by: who(x.by) })),
      comments: (t.comments || []).map((c) => ({ ...c, by: who(c.by), mentions: names(c.mentions) })),
    }))
  if (items.length !== doc.items.length) problems.push(`${doc.items.length - items.length} ردیف تکراری یا بی‌شناسه در فایل کنار گذاشته شد`)
  const account = who(doc.account)
  if (!account) problems.push('نام صاحب فایل در مدار پیدا نشد؛ «میزیتوی چه کسی» را خودتان انتخاب کنید')
  return { account: account || fallbackAccount, items, problems, parts: 1, broken: 0, listed: doc.items.length }
}

// ---------------------------------------------------------------- links (they never add a task)
export interface LinkMatch {
  pairs: { key: string; title: string; link: string }[]
  unmatched: string[]
  ambiguous: string[]
  bad: string[]
}

/** Claude's list of {title, link}: each link goes to the one task in Madar with that title. Nothing is created. */
export function parseLinks(raw: string, rows: { mz_key?: string; title?: string; link?: string }[]): LinkMatch | null {
  const out: LinkMatch = { pairs: [], unmatched: [], ambiguous: [], bad: [] }
  const src = String(raw || '')
  const fenced = [...src.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi)].map((m) => m[1].trim()).filter(Boolean)
  const list: { title?: string; link?: string }[] = []
  for (const c of fenced.length ? fenced : [src.slice(Math.max(0, src.search(/[[{]/)))]) {
    try {
      const v = JSON.parse(c)
      const arr = Array.isArray(v) ? v : Array.isArray(v?.links) ? v.links : Array.isArray(v?.tasks) ? v.tasks : []
      list.push(...arr)
    } catch {}
  }
  if (!list.length) return null
  const byTitle = new Map<string, { mz_key?: string; title?: string }[]>()
  rows.forEach((r) => {
    const k = mzTitleKey(r.title)
    if (k && r.mz_key) byTitle.set(k, [...(byTitle.get(k) || []), r])
  })
  const done = new Set<string>()
  list.forEach((x) => {
    const title = String(x?.title || '').trim()
    const link = String(x?.link || '').trim().replace(/\s+/g, '')
    if (!title) return
    if (!/^https?:\/\/[^\s]*#\/ws\//.test(link) || !mzKeyFromLink(link)) return out.bad.push(title)
    const tk = mzTitleKey(title)
    let hit = byTitle.get(tk) || []
    // a title Claude cut short: the one task whose title starts with it
    if (!hit.length && tk.length >= 8) hit = [...byTitle.entries()].filter(([k]) => k.startsWith(tk) || tk.startsWith(k)).flatMap(([, v]) => v)
    if (!hit.length) return out.unmatched.push(title)
    if (hit.length > 1) return out.ambiguous.push(title)
    const key = String(hit[0].mz_key)
    if (done.has(key)) return
    done.add(key)
    out.pairs.push({ key, title: String(hit[0].title || title), link })
  })
  return out
}

/** For Claude in Chrome: only the links, as a list of title → link. */
export function mzLinksPrompt(since: string) {
  return `در میزیتو فقط لینک تسک‌ها را جمع کن؛ در میزیتو چیزی را تغییر نده و هیچ‌وقت دکمه‌ی «تایید» را نزن.

۱. از نوار سمت راست «گفتگو» ← «دستیار میزیتو» را باز کن.
۲. از ${since} تا امروز، برای هر تسکی که در پیام‌ها آمده (هر تسک فقط یک بار):
   «مشاهده وظیفه» ← منوی ⋮ بالای پنل ← «لینک وظیفه» ← آدرس کامل داخل کادر (اگر بریده بود «کپی» را بزن و متن کامل را بردار) ← پنل را ببند.
۳. خروجی فقط یک بلوک JSON، عنوان دقیقاً همان‌طور که در میزیتو نوشته شده:

\`\`\`json
[{ "title": "عنوان کامل تسک", "link": "https://mizito.noyanet.com/#/ws/tasks/..." }]
\`\`\`

اگر زیاد است، هر بار ۳۰ تسک بفرست و منتظر «ادامه» بمان.`
}

/** What to tell Claude in Chrome, on the Mizito page, so its answer can be pasted straight into Madar. */
export function mzClaudePrompt(account: string, since: string) {
  return `روی میزیتو (https://mizito.noyanet.com) هستیم و من «${account}» هستم. فقط بخوان؛ در میزیتو هیچ چیزی را تغییر نده، کامنت نگذار، تیک نزن و هیچ دکمه‌ی «تایید» یا «ذخیره» را نزن.

کار:
۱. از نوار سمت راست «گفتگو» را باز کن و گفتگوی «دستیار میزیتو» را انتخاب کن.
۲. در این گفتگو آن‌قدر بالا برو (اسکرول) تا به پیام‌های قبل از ${since} برسی. همه‌ی پیام‌های از ${since} تا امروز را در نظر بگیر؛ هیچ پیامی را جا نینداز، حتی اگر چند پیام درباره‌ی یک تسک باشد.
۳. هر پیامی که درباره‌ی یک تسک است (منشن، ارجاع، کامنت، تغییر مهلت، انجام شدن یا هر نوع دیگر) را برای آن تسک ثبت کن: چه کسی، چه زمانی، و متن پیام. «چه کسی» همان فردی است که منشن کرده یا کار را انجام داده (نامش در متن پیام آمده)، نه «دستیار میزیتو». نام‌ها را کامل و دقیقاً همان‌طور که در میزیتو نوشته شده بنویس.
۴. برای هر تسکِ یکتا (فقط یک بار برای هر تسک):
   - روی «مشاهده وظیفه» بزن تا پنل تسک باز شود.
   - این‌ها را از پنل بخوان: عنوان (کامل و دقیقاً همان متن، بدون کوتاه کردن)، توضیحات کامل، پروژه، سازنده‌ی تسک، مسئولان، مهلت، وضعیت (باز یا انجام‌شده، و اگر انجام شده چه کسی و کی)، درصد پیشرفت، چک‌لیست (هر مورد و تیک خوردن یا نخوردنش)، برچسب‌ها، و همه‌ی کامنت‌ها (نویسنده، زمان، متن کامل، نام فایل‌های پیوست، و کسانی که در کامنت منشن شده‌اند).
   - لینک: منوی ⋮ بالای پنل ← «لینک وظیفه». آدرس کامل داخل کادر را بخوان (اگر بریده نشان داده شد، روی «کپی» بزن و متن کامل را بردار). هرگز «تایید» را نزن. آدرس باید با https://mizito.noyanet.com/#/ws/tasks/ شروع شود.
   - پنل را ببند و سراغ تسک بعدی برو.
۵. تاریخ‌ها را همیشه کامل و شمسی با ارقام انگلیسی بنویس: «1405/07/12 14:30». اگر میزیتو تاریخ نسبی نشان می‌دهد («دیروز»، «۲ ساعت پیش»)، اول ماوس را روی آن نگه دار تا تاریخ دقیق دیده شود؛ اگر نشد، با توجه به تاریخ امروز تبدیلش کن.
۶. چیزی حدس نزن و از خودت نساز؛ اگر چیزی نبود، "" یا [] بگذار.

خروجی: فقط یک بلوک JSON دقیقاً با این ساختار، بدون هیچ توضیح دیگری. تسک‌ها به ترتیب تاریخ اولین پیام دستیار (قدیمی‌ترین اول) باشند:

\`\`\`json
{
  "account": "${account}",
  "tasks": [
    {
      "title": "",
      "link": "https://mizito.noyanet.com/#/ws/tasks/...",
      "first_mention_at": "1405/04/09 10:15",
      "project": "",
      "owner": "",
      "assignees": [""],
      "deadline": "1405/07/20",
      "status": "open",
      "done_at": "",
      "done_by": "",
      "progress": 0,
      "description": "",
      "labels": [""],
      "checklist": [{ "title": "", "done": false }],
      "mentions": [{ "by": "", "at": "1405/04/09 10:15", "text": "" }],
      "comments": [{ "by": "", "at": "1405/04/09 11:00", "text": "", "mentions": [""], "files": [""] }]
    }
  ]
}
\`\`\`

- "status" همیشه یکی از "open" یا "done" (خالی نگذار).
- هر تسک فقط یک بار در کل خروجی بیاید؛ همه‌ی پیام‌های دستیار درباره‌ی آن را در "mentions" همان تسک بگذار. تسکی را که در یک بخش آوردی، در بخش‌های بعد تکرار نکن.
- "description" و متن کامنت‌ها را کامل بنویس، خلاصه نکن.
- "mentions" = همه‌ی پیام‌های «دستیار میزیتو» درباره‌ی همین تسک.
- اگر تعداد تسک‌ها زیاد است و جواب در یک پیام جا نمی‌شود، کار را بخش‌بخش انجام بده: هر بار حداکثر ۱۵ تسک، هر بخش یک JSON کامل با همین ساختار، و بنویس «بخش ۱ از ۴» و ... . بعد از هر بخش منتظر بمان تا بگویم «ادامه».
- در آخر بنویس چند پیام و چند تسک یکتا دیدی تا بتوانم شمارش را چک کنم.`
}
