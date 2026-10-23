import type { DB, Role, SheetName } from './types'

export interface Config {
  apiUrl: string
  /** fallback personal key (when Google sign-in isn't configured) */
  token: string
  /** OAuth Web client ID from Google Cloud — enables "Sign in with Google" and Calendar */
  googleClientId?: string
}

// Google access token of the signed-in user (set by GoogleProvider); preferred over the key.
let accessToken = ''
export const setAccessToken = (t: string) => {
  accessToken = t
}
// Email-code session (sign-in without a Google account).
let sessionToken = ''
export const setSessionToken = (t: string) => {
  sessionToken = t
}
const auth = (c: Config): Record<string, string> => (accessToken ? { access_token: accessToken } : sessionToken ? { session: sessionToken } : { token: c.token })

/** Calls that need no sign-in: request a code, verify it, revoke a session. */
export async function otpCall<T = Record<string, unknown>>(apiUrl: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
  const json = await readJson(res)
  if (!json.ok) throw new Error(json.error || 'خطا')
  return json as T
}

const CFG_KEY = 'madar.config'

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const env = import.meta.env
  return { apiUrl: env.VITE_API_URL || '', token: '', googleClientId: env.VITE_GOOGLE_CLIENT_ID || '' }
}

export function saveConfig(c: Config) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(c))
  } catch {}
}

interface RemoteUser {
  name: string
  role: Role
  email?: string
}

interface AllResponse {
  ok: boolean
  error?: string
  data: DB
  user: RemoteUser
}

/** Apps Script answers with an HTML page (sign-in or error) when the data deployment isn't public. */
async function readJson(res: Response) {
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    // show what actually answered, so the misconfiguration is obvious
    const title = (text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim()
    const where = res.url.replace(/[?#].*$/, '')
    throw new Error(`آدرس داده به‌جای داده یک صفحه برگرداند (${res.status}${title ? ` · ${title}` : ''}). انتشار «Madar Team» باید Web app با Execute as: Me و Who has access: Anyone باشد و API_URL همان آدرس باشد.\n${where}`)
  }
  return JSON.parse(text)
}

/** The whole data; with `since` (the data version last received) the server only says "same" when nothing changed. */
export async function fetchAll(c: Config, since = ''): Promise<{ data: DB | null; user: RemoteUser; version: string; ver: string }> {
  const q = new URLSearchParams({ action: 'all', ...auth(c), ...(since ? { v: since } : {}) }).toString()
  const url = `${c.apiUrl}${c.apiUrl.includes('?') ? '&' : '?'}${q}`
  const res = await fetch(url, { method: 'GET', redirect: 'follow' })
  const json = (await readJson(res)) as AllResponse & { same?: boolean; ver?: string; version?: string }
  if (!json.ok) throw new Error(json.error || 'خطای ناشناخته از سرور')
  return { data: json.same ? null : json.data, user: json.user, version: String(json.version || ''), ver: String(json.ver || '') }
}

// text/plain avoids a CORS preflight, which Apps Script doesn't answer.
async function post(c: Config, body: Record<string, unknown>) {
  // a request that never answers must not hold the app (refreshes wait for writes): give up after
  // 60s, or 3 minutes for an upload
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), body.action === 'upload' ? 180000 : 60000)
  let res: Response
  try {
    res = await fetch(c.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, ...auth(c) }),
      redirect: 'follow',
      signal: ctl.signal,
    })
  } catch (e) {
    throw new Error(ctl.signal.aborted ? 'سرور پاسخ نداد؛ دوباره تلاش کنید' : e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(timer)
  }
  const json = await readJson(res)
  if (!json.ok) throw new Error(json.error || 'ذخیره انجام نشد')
  return json
}

export function remoteUpsert(c: Config, sheet: SheetName, row: Record<string, unknown>) {
  return post(c, { action: 'upsert', sheet, row })
}

export function remoteDelete(c: Config, sheet: SheetName, id: string) {
  return post(c, { action: 'delete', sheet, id })
}

/** Upload a file to the shared Drive folder; the server records it in the Files tab. */
export function remoteUpload(c: Config, f: { name: string; mime: string; data: string; entity: string; entity_id: string }) {
  return post(c, { action: 'upload', ...f }) as Promise<{ ok: true; row: Record<string, unknown> }>
}

/** Server-side actions (e.g. email the minutes of a meeting). */
export function remoteAction(c: Config, action: string, payload: Record<string, unknown>) {
  return post(c, { action, ...payload })
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
