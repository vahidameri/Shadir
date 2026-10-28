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
import { isoToJalaliParts, jalaliMonthLength, jalaliPartsToISO, toGregorian } from './jalali'

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
      // which task is this. The title decides first (Claude may give the same task another link on
      // another day): the same title in this paste, then in Madar; then the link's id; then a title
      // that is a cut-short form of exactly one task in Madar. Only then is it a new task.
      let key = ''
      const here = byTitle.get(tk)
      if (here && items.has(here)) key = here
      if (!key) {
        const same = haveByTitle.get(tk) || []
        if (same.length) {
          key = keyOfExisting(same.find((m) => linkKeyOf(m)) || same[0])
          if (same.length > 1) problems.push(`«${title.slice(0, 50)}» در مدار چند بار هست؛ «یکی کردن تکراری‌ها» را بزنید`)
        }
      }
      if (!key && fromLink && (items.has(fromLink) || haveByKey.has(fromLink))) key = fromLink
      if (!key && tk.length >= 12) {
        const near = [...haveByTitle.entries()].filter(([k2]) => k2.length >= 12 && (k2.startsWith(tk) || tk.startsWith(k2))).flatMap(([, v]) => v)
        if (near.length === 1) key = keyOfExisting(near[0])
      }
      if (!key) key = fromLink || 'imp' + hash(tk)

      // the id comes from the words (copied as written in Mizito); the server also knows a message by its
      // writer and minute, so neither a re-worded copy nor a drifted time comes in twice
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

/**
 * The next range to read: the day after the last one imported, for `days` days (a week by default —
 * Claude reads a short range completely; a month at once is where messages got skipped).
 */
export function nextRange(lastTo: string, start: string, today: string, days = 7): { from: string; to: string } {
  const from = lastTo ? addDaysISO(lastTo, 1) : start
  if (days >= 28) {
    const j = isoToJalaliParts(from)
    if (j) {
      const end = jalaliPartsToISO(j.jy, j.jm, jalaliMonthLength(j.jy, j.jm))
      return { from, to: end < today ? end : today }
    }
  }
  const end = addDaysISO(from, days - 1)
  return { from, to: end < today ? end : today }
}
const addDaysISO = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
/** "1405/04/01" for an ISO day */
export const jNum = (iso: string) => {
  const j = isoToJalaliParts(iso)
  return j ? `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}` : iso
}

/** What to tell Claude in Chrome, on the Mizito page, for one range of days. */
export function mzClaudePrompt(account: string, from: string, to: string, fromFa: string, toFa: string) {
  const a = jNum(from), b = jNum(to)
  return `روی میزیتو (https://mizito.noyanet.com) هستیم و من «${account}» هستم. فقط بخوان؛ در میزیتو هیچ چیزی را تغییر نده، کامنت نگذار، تیک نزن و هیچ دکمه‌ی «تایید» یا «ذخیره» را نزن.

بازه: فقط پیام‌های «دستیار میزیتو» از ${fromFa} (${a}) تا ${toFa} (${b})، هر دو روز هم جزو بازه است. پیام‌های قبل و بعد از این بازه را کاملاً نادیده بگیر.

کار:
۱. از نوار سمت راست «گفتگو» را باز کن و گفتگوی «دستیار میزیتو» را انتخاب کن.
۲. آن‌قدر بالا برو تا به اولین پیام ${a} برسی، و از همان‌جا رو به پایین تا آخرین پیام ${b} همه را ببین. هیچ پیامی از این بازه را جا نینداز.
۳. هر پیام این بازه که درباره‌ی یک تسک است (منشن، ارجاع، کامنت، تغییر مهلت، انجام شدن یا هر نوع دیگر) را برای همان تسک ثبت کن: by = کسی که منشن کرده یا کار را انجام داده (نامش در متن پیام آمده، نه «دستیار میزیتو»)، at = زمان پیام، text = متن پیام. اگر یک تسک چند بار در این بازه آمده، همه‌ی پیام‌هایش زیر همان یک تسک بیاید.
۴. برای هر تسکِ یکتا فقط یک بار:
   - «مشاهده وظیفه» را بزن.
   - از پنل بخوان: عنوان (کامل و دقیقاً همان متن)، توضیحات کامل، پروژه، سازنده، مسئولان، مهلت، وضعیت (باز یا انجام‌شده؛ اگر انجام شده چه کسی و کی)، درصد پیشرفت، چک‌لیست، برچسب‌ها، و همه‌ی کامنت‌ها (نویسنده، زمان، متن کامل، نام پیوست‌ها، منشن‌شده‌ها).
   - لینک: منوی ⋮ بالای پنل ← «لینک وظیفه» ← آدرس کامل داخل کادر (اگر بریده بود «کپی» را بزن و متن کامل را بردار؛ هرگز «تایید» را نزن). باید با https://mizito.noyanet.com/#/ws/tasks/ شروع شود.
   - پنل را ببند.
۵. تاریخ‌ها کامل، شمسی و با ارقام انگلیسی: «1405/04/12 14:30». تاریخ نسبی («دیروز»، «۲ ساعت پیش») را با ماوس روی آن ببین یا با تاریخ امروز به تاریخ کامل تبدیل کن.
۶. چیزی حدس نزن؛ اگر نبود "" یا [] بگذار.
۷. پیش از نوشتن خروجی، یک بار دیگر گفتگو را از اولین پیام ${a} تا آخرین پیام ${b} مرور کن و هر پیام را با فهرستت تطبیق بده؛ پیامی که جا افتاده را اضافه کن. تعداد کل پیام‌های بازه باید با جمع "mentions" همه‌ی تسک‌ها برابر باشد.

خروجی فقط یک بلوک JSON با همین ساختار (تسک‌ها به ترتیب اولین پیامشان در بازه):

\`\`\`json
{
  "account": "${account}",
  "range": { "from": "${a}", "to": "${b}" },
  "tasks": [
    {
      "title": "",
      "link": "https://mizito.noyanet.com/#/ws/tasks/...",
      "first_mention_at": "${a} 10:15",
      "project": "",
      "owner": "",
      "assignees": [""],
      "deadline": "",
      "status": "open",
      "done_at": "",
      "done_by": "",
      "progress": 0,
      "description": "",
      "labels": [""],
      "checklist": [{ "title": "", "done": false }],
      "mentions": [{ "by": "", "at": "${a} 10:15", "text": "" }],
      "comments": [{ "by": "", "at": "${a} 11:00", "text": "", "mentions": [""], "files": [""] }]
    }
  ]
}
\`\`\`

- "status" همیشه "open" یا "done".
- هر تسک فقط یک بار در کل خروجی؛ تسکی را که در یک بخش آوردی در بخش بعد تکرار نکن.
- توضیحات و کامنت‌ها را کامل بنویس، خلاصه نکن.
- اگر جواب در یک پیام جا نمی‌شود، هر بار ۱۵ تسک بفرست با «بخش ۱ از N» و منتظر «ادامه» بمان.
- در آخر بنویس در این بازه چند پیام و چند تسک یکتا دیدی (این دو عدد را در مدار با پیش‌نمایش مقایسه می‌کنم).`
}
