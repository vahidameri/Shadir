// Mizito import: the JSON that Claude (in Chrome, on the Mizito page) writes after reading the
// «دستیار میزیتو» chat, turned into the items the server's Mizito ingest takes. Dates may be Jalali
// ("1405/07/12 14:30") or Gregorian, in Persian or Latin digits. Every id is derived from the
// content, so importing the same thing twice (or overlapping parts) adds nothing twice.
import { toGregorian } from './jalali'

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
  completed: boolean
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
}

const latin = (s: unknown) =>
  String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const clean = (s: unknown) => latin(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()
const text = (s: unknown) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim()
const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,،]/)).map(clean).filter(Boolean)

/** "1405/07/12 14:30", "1405-7-12", "2026-10-03T11:00", Persian digits → ISO with Tehran time ('' if unreadable) */
export function mzDate(v: unknown): string {
  const s = latin(v).trim()
  if (!s) return ''
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[ T،,]+(\d{1,2}):(\d{2}))?/.exec(s)
  if (m) {
    let y = +m[1], mo = +m[2], d = +m[3]
    if (y < 1700) {
      const g = toGregorian(y, mo, d)
      y = g.gy
      mo = g.gm
      d = g.gd
    } else if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      const t = new Date(s)
      if (!isNaN(t.getTime())) return t.toISOString()
    }
    const p = (n: number) => String(n).padStart(2, '0')
    return `${y}-${p(mo)}-${p(d)}T${p(+(m[4] || 0))}:${m[5] || '00'}:00+03:30`
  }
  return ''
}

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The task's id in Mizito from its «لینک وظیفه» (…_sl<id>, or the last 24-hex part). */
export function mzKeyFromLink(link: string) {
  const s = String(link || '')
  const sl = /_sl([0-9a-f]{24})/i.exec(s)
  if (sl) return sl[1].toLowerCase()
  const hex = s.match(/[0-9a-f]{24}/gi)
  return hex ? hex[hex.length - 1].toLowerCase() : ''
}

/** Reads what Claude wrote: a JSON object {account, tasks:[…]} or just the array, maybe inside ```json fences or with text around it. */
export function parseMzImport(raw: string, fallbackAccount: string, existing: { mz_key?: string; title?: string }[] = []): MzImportResult {
  const problems: string[] = []
  const src = String(raw || '').trim()
  // one or more ```json blocks (several parts pasted together), or the bare JSON with text around it
  const fenced = [...src.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim()).filter(Boolean)
  const chunks = fenced.length ? fenced : [src.slice(Math.max(0, src.search(/[[{]/)))]
  const parsed: unknown[] = []
  for (const c of chunks) {
    try {
      parsed.push(JSON.parse(c))
    } catch (e) {
      return { account: fallbackAccount, items: [], problems: ['متن JSON درست نیست: ' + (e instanceof Error ? e.message : String(e))] }
    }
  }
  const data: unknown = parsed.length === 1 ? parsed[0] : parsed
  const blocks: { account?: string; tasks?: unknown[] }[] = Array.isArray(data) && data.length && data.every((x) => x && typeof x === 'object' && 'tasks' in (x as object)) ? (data as { tasks: unknown[] }[]) : Array.isArray(data) ? [{ tasks: data }] : [data as { account?: string; tasks?: unknown[] }]
  const account = clean(blocks.find((b) => b.account)?.account) || fallbackAccount
  const byTitle = new Map(existing.filter((m) => m.mz_key && m.title).map((m) => [clean(m.title), String(m.mz_key)]))
  const items = new Map<string, MzImportItem>()

  blocks.forEach((b) =>
    (b.tasks || []).forEach((raw0, i) => {
      const t = (raw0 || {}) as Record<string, unknown>
      const title = text(t.title)
      if (!title) return problems.push(`تسک ${i + 1}: بدون عنوان، کنار گذاشته شد`)
      const link = String(t.link || '').trim()
      // a task imported earlier without its link keeps its row when the link arrives
      const seen = byTitle.get(clean(title)) || ''
      const fromLink = mzKeyFromLink(link)
      const key = fromLink ? (seen.startsWith('imp') ? seen : fromLink) : seen || 'imp' + hash(clean(title))
      if (!link) problems.push(`«${title.slice(0, 50)}»: بدون لینک`)
      const mentions = (Array.isArray(t.mentions) ? t.mentions : []).map((x: Record<string, unknown>) => {
        const at = mzDate(x.at)
        return { id: 'imp' + hash(`${key}|${at}|${clean(x.by)}|${clean(x.text)}`), by: clean(x.by), at, comment: text(x.text) }
      }).filter((x) => x.at)
      const comments = (Array.isArray(t.comments) ? t.comments : []).map((c: Record<string, unknown>) => {
        const at = mzDate(c.at)
        return { id: 'imp' + hash(`${key}|${at}|${clean(c.by)}|${clean(c.text)}`), by: clean(c.by), at, body: text(c.text), mentions: list(c.mentions), reply_to: '', files: list(c.files) }
      }).filter((c) => c.at && (c.body || c.files.length))
      const firstMention = mentions.map((x) => x.at).sort()[0] || ''
      const first = mzDate(t.first_mention_at) || firstMention
      if (!first) problems.push(`«${title.slice(0, 50)}»: تاریخ منشن ندارد`)
      const status = clean(t.status).toLowerCase()
      const done = /done|انجام|بسته|complete/.test(status)
      const newest = comments.reduce<(typeof comments)[number] | null>((a, c) => (!a || c.at > a.at ? c : a), null)
      const item: MzImportItem = {
        key,
        title,
        notes: text(t.description),
        link,
        first_at: first,
        project: clean(t.project),
        owner: clean(t.owner),
        assignees: list(t.assignees),
        labels: list(t.labels),
        created_at: mzDate(t.created_at),
        completed: done,
        completed_at: done ? mzDate(t.done_at) : '',
        completed_by: done ? clean(t.done_by) : '',
        progress: t.progress === undefined || t.progress === '' ? undefined : Number(latin(t.progress).replace(/[^\d.]/g, '')) || 0,
        deadline: mzDate(t.deadline),
        checklist: (Array.isArray(t.checklist) ? t.checklist : []).map((c: Record<string, unknown>) => ({ t: text(c.title ?? c.t), ok: !!(c.done ?? c.ok) })).filter((c) => c.t),
        mentions,
        comments,
        sig: '',
      }
      if (newest) {
        item.last_by = newest.by
        item.last_at = newest.at
      }
      // the same task in two parts: one item, mentions and comments together
      const prev = items.get(key)
      if (prev) {
        const ids = new Set(prev.mentions.map((x) => x.id))
        prev.mentions.push(...item.mentions.filter((x) => !ids.has(x.id)))
        const cids = new Set(prev.comments.map((x) => x.id))
        prev.comments.push(...item.comments.filter((x) => !cids.has(x.id)))
        if (item.first_at && (!prev.first_at || item.first_at < prev.first_at)) prev.first_at = item.first_at
        if (!prev.link && item.link) prev.link = item.link
      } else items.set(key, item)
    }),
  )
  const out = [...items.values()].sort((a, b) => (a.first_at || '9') < (b.first_at || '9') ? -1 : 1)
  return { account, items: out, problems }
}

/** What to tell Claude in Chrome, on the Mizito page, so its answer can be pasted straight into Madar. */
export function mzClaudePrompt(account: string, since: string) {
  return `روی میزیتو (https://mizito.noyanet.com) هستیم و من «${account}» هستم. فقط بخوان؛ در میزیتو هیچ چیزی را تغییر نده، کامنت نگذار، تیک نزن و هیچ دکمه‌ی «تایید» یا «ذخیره» را نزن.

کار:
۱. از نوار سمت راست «گفتگو» را باز کن و گفتگوی «دستیار میزیتو» را انتخاب کن.
۲. در این گفتگو آن‌قدر بالا برو (اسکرول) تا به پیام‌های قبل از ${since} برسی. همه‌ی پیام‌های از ${since} تا امروز را در نظر بگیر؛ هیچ پیامی را جا نینداز، حتی اگر چند پیام درباره‌ی یک تسک باشد.
۳. هر پیامی که درباره‌ی یک تسک است (منشن، ارجاع، کامنت، تغییر مهلت، انجام شدن یا هر نوع دیگر) را برای آن تسک ثبت کن: چه کسی، چه زمانی، و متن پیام.
۴. برای هر تسکِ یکتا (فقط یک بار برای هر تسک):
   - روی «مشاهده وظیفه» بزن تا پنل تسک باز شود.
   - این‌ها را از پنل بخوان: عنوان، توضیحات کامل، پروژه، سازنده‌ی تسک، مسئولان، مهلت، وضعیت (باز یا انجام‌شده، و اگر انجام شده چه کسی و کی)، درصد پیشرفت، چک‌لیست (هر مورد و تیک خوردن یا نخوردنش)، برچسب‌ها، و همه‌ی کامنت‌ها (نویسنده، زمان، متن کامل، نام فایل‌های پیوست، و کسانی که در کامنت منشن شده‌اند).
   - لینک: منوی ⋮ بالای پنل ← «لینک وظیفه». آدرس کامل داخل کادر را بخوان (اگر بریده نشان داده شد، روی «کپی» بزن و متن کامل را بردار). هرگز «تایید» را نزن. آدرس باید با https://mizito.noyanet.com/#/ws/tasks/ شروع شود.
   - پنل را ببند و سراغ تسک بعدی برو.
۵. تاریخ‌ها را همیشه کامل و شمسی با ارقام انگلیسی بنویس: «1405/07/12 14:30». تاریخ‌های نسبی مثل «دیروز» یا «۲ ساعت پیش» را با توجه به تاریخ امروز به تاریخ کامل تبدیل کن.
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

- "status" فقط "open" یا "done".
- "mentions" = همه‌ی پیام‌های «دستیار میزیتو» درباره‌ی همین تسک.
- اگر تعداد تسک‌ها زیاد است و جواب در یک پیام جا نمی‌شود، کار را بخش‌بخش انجام بده: هر بار حداکثر ۱۵ تسک، هر بخش یک JSON کامل با همین ساختار، و بنویس «بخش ۱ از ۴» و ... . بعد از هر بخش منتظر بمان تا بگویم «ادامه».
- در آخر بنویس چند پیام و چند تسک یکتا دیدی تا بتوانم شمارش را چک کنم.`
}
