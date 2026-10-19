import { fa as toFa } from './jalali'

// Telegram Desktop "Export chat history" (JSON): one chat (result.json) or a full account export.
export interface TgMessage {
  key: string // chatId:messageId — used so nothing is imported twice
  chatId: string
  chat: string
  id: number
  date: string // ISO date-time
  from: string
  text: string
  reply: boolean
}
export interface TgChat {
  id: string
  name: string
  messages: TgMessage[]
}

type Raw = { id?: number | string; name?: string; messages?: RawMsg[] }
type RawMsg = { id: number; type?: string; date?: string; from?: string; actor?: string; text?: unknown; reply_to_message_id?: number; photo?: string; file?: string }

/** Telegram stores text as a string or a list of strings and {type, text} pieces. */
export function plainText(t: unknown): string {
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' && 'text' in x ? String((x as { text: unknown }).text) : '')).join('')
  return ''
}

export function parseExport(json: unknown): TgChat[] {
  const j = json as { chats?: { list?: Raw[] }; messages?: RawMsg[] } & Raw
  const raw: Raw[] = Array.isArray(j?.chats?.list) ? j.chats!.list! : Array.isArray(j?.messages) ? [j] : []
  return raw.map((c) => {
    const id = String(c.id ?? c.name ?? 'chat')
    const name = String(c.name || id)
    const messages = (c.messages || [])
      .filter((m) => m && (m.type === undefined || m.type === 'message'))
      .map((m) => ({
        key: `${id}:${m.id}`,
        chatId: id,
        chat: name,
        id: m.id,
        date: String(m.date || ''),
        from: String(m.from || m.actor || ''),
        text: plainText(m.text).trim() || (m.photo ? '[عکس]' : m.file ? '[فایل]' : ''),
        reply: !!m.reply_to_message_id,
      }))
      .filter((m) => m.text)
    return { id, name, messages }
  }).filter((c) => c.messages.length)
}

/** First line, trimmed to a title. */
export const titleOf = (text: string, max = 110) => {
  const line = text.split('\n').map((x) => x.trim()).find(Boolean) || text
  return line.length > max ? line.slice(0, max - 1).trimEnd() + '…' : line
}

// ---------------------------------------------------------------- weekly status from a group's messages
// A simple, explainable reading of the chat: what was finished, what is stuck, what was decided and what
// comes next. The result is a suggestion the program manager reviews before it is saved as the week's update.

const normText = (s: string) =>
  ` ${s.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, ' ').replace(/[.,،!؟?:;()«»"'\n\r\t-]+/g, ' ').replace(/\s+/g, ' ').trim()} `

const DONE = ['انجام شد', 'انجام دادم', 'انجام دادیم', 'تموم شد', 'تمام شد', 'تموم کردم', 'تموم کردیم', 'اوکی شد', 'دیپلوی شد', 'دیپلوی کردم', 'دپلوی شد', 'رفت روی استیج', 'رفت رو استیج', 'روی استیج رفت', 'آپلود شد', 'ارسال شد', 'تحویل دادم', 'تحویل دادیم', 'تحویل شد', 'فیکس شد', 'فیکس کردم', 'حل شد', 'درست شد', 'مرج شد', 'ریلیز شد', 'منتشر شد', 'لانچ شد', 'آماده شد', ' done ', 'deployed', ' fixed', 'merged', 'released', 'shipped', 'finished', 'completed']
const BLOCK = ['مشکل', 'بلاک', 'گیر کرد', 'گیر کردیم', 'گیره', 'منتظر', 'معطل', 'تاخیر', 'تأخیر', 'عقب افتاد', 'عقبیم', 'باگ', 'خطا', 'ارور', 'قطع', 'کار نمیکنه', 'کار نمی کنه', 'نمیشه', 'نمی شه', 'نمی شود', ' نشد ', 'blocked', 'blocker', ' bug', 'issue', 'delay', 'stuck', 'waiting', 'error']
const DECIDE = ['قرار شد', 'تصمیم', 'توافق', 'تایید شد', 'تأیید شد', 'تایید کرد', 'تأیید کرد', 'approved', 'decided', 'agreed']
const NEXT = ['فردا', 'هفته بعد', 'هفته ی بعد', 'پس فردا', 'قراره', 'باید', 'برنامه', 'بعدش', 'میریم سراغ', 'شروع می کنیم', 'شروع میکنیم', 'next', 'tomorrow', 'todo']
const has = (t: string, words: string[]) => words.some((w) => t.includes(w))

export type TgKind = 'done' | 'blocker' | 'decision' | 'next' | 'other'
export function kindOf(text: string): TgKind {
  const t = normText(text)
  if (has(t, DONE) && !t.includes(' نشد ')) return 'done'
  if (has(t, BLOCK)) return 'blocker'
  if (has(t, DECIDE)) return 'decision'
  if (has(t, NEXT)) return 'next'
  return 'other'
}

export interface TgDigest {
  count: number
  people: number
  from: string
  to: string
  health: 'green' | 'amber' | 'red'
  why: string
  done: TgMessage[]
  blockers: TgMessage[]
  decisions: TgMessage[]
  next: TgMessage[]
  /** open tasks the chat says are finished */
  finished: { id: string; title: string; by: TgMessage }[]
}

export function digest(messages: TgMessage[], openTasks: { id: string; title: string }[], fa: boolean): TgDigest | null {
  const msgs = messages.filter((m) => m.text.length >= 12 && !/^\[(عکس|فایل)\]$/.test(m.text)).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!msgs.length) return null
  const by: Record<TgKind, TgMessage[]> = { done: [], blocker: [], decision: [], next: [], other: [] }
  msgs.forEach((m) => by[kindOf(m.text)].push(m))
  const d = by.done.length
  const b = by.blocker.length
  const health = b >= 3 && b > d ? 'red' : b > 0 || d === 0 ? 'amber' : 'green'
  const n = (x: number) => (fa ? toFa(x) : String(x))
  const why = fa
    ? health === 'red' ? `${n(b)} پیام درباره‌ی مشکل یا تأخیر، بیشتر از کارهای تمام‌شده` : health === 'amber' ? (b ? `${n(b)} مشکل یا مانع در گفت‌وگوها` : 'در این بازه کار تمام‌شده‌ای گزارش نشده') : `${n(d)} کار تمام‌شده و مانعی گزارش نشده`
    : health === 'red' ? `${b} messages about problems or delays, more than finished work` : health === 'amber' ? (b ? `${b} problems or blockers in the chat` : 'no finished work reported in this period') : `${d} pieces of work finished, no blockers`
  const doneText = by.done.map((m) => normText(m.text))
  const finished = openTasks
    .map((t) => ({ t, n: normText(t.title).trim() }))
    .filter((x) => x.n.length >= 5)
    .flatMap((x) => {
      const i = doneText.findIndex((dt) => dt.includes(` ${x.n} `) || dt.includes(x.n))
      return i >= 0 ? [{ id: x.t.id, title: x.t.title, by: by.done[i] }] : []
    })
  return {
    count: msgs.length,
    people: new Set(msgs.map((m) => m.from).filter(Boolean)).size,
    from: msgs[0].date.slice(0, 10),
    to: msgs[msgs.length - 1].date.slice(0, 10),
    health, why,
    done: by.done, blockers: by.blocker, decisions: by.decision, next: by.next, finished,
  }
}

/** Bullet lines for the weekly update ("• first line — sender"), newest last, at most `max`. */
export const bullets = (list: TgMessage[], max = 8) => list.slice(-max).map((m) => `• ${titleOf(m.text, 90)}${m.from ? ` — ${m.from}` : ''}`).join('\n')
