// Google sign-in with Google Identity Services (token model). One consent gives us the user's
// identity (sent to Apps Script, which checks it against the Users tab) and Calendar access.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { otpCall, setAccessToken, setSessionToken } from './api'

export const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'].join(' ')
const KEY = 'acg.gsession'

export interface GSession {
  token: string
  exp: number // ms epoch
  email: string
  name: string
  picture: string
  /** 'otp' = signed in with an email code: no Google token (no personal calendar) */
  kind?: 'google' | 'otp'
}
const OTP_KEY = 'acg.otp'
function loadOtp(): GSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(OTP_KEY) || 'null') as (GSession & { sid: string }) | null
    if (!s || s.exp < Date.now()) return null
    setSessionToken(s.sid)
    return { token: '', exp: s.exp, email: s.email, name: '', picture: '', kind: 'otp' }
  } catch {
    return null
  }
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string; login_hint?: string }) => void
}
interface ScriptRun {
  withSuccessHandler: (f: (r: unknown) => void) => ScriptRun
  withFailureHandler: (f: (e: Error) => void) => ScriptRun
  atlasSession: () => void
}
declare global {
  interface Window {
    google?: {
      script?: { run: ScriptRun; url?: { getLocation: (cb: (l: { parameter?: Record<string, string> }) => void) => void } }
      accounts: {
        oauth2: {
          initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient
          revoke: (token: string, cb?: () => void) => void
        }
      }
    }
  }
}

function load(): GSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null') as GSession | null
    return s && s.exp > Date.now() + 60_000 ? s : null
  } catch {
    return null
  }
}

let gisPromise: Promise<void> | null = null
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Google sign-in could not load'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/** True when the app is served by Apps Script (HtmlService) — the zero-hosting setup. */
export const hosted = () => typeof window !== 'undefined' && !!window.google?.script?.run

/** Query parameters of the Apps Script page (e.g. ?login=… from the email link). */
function pageParams(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    try {
      window.google!.script!.url!.getLocation((l) => resolve(l.parameter || {}))
    } catch {
      resolve({})
    }
  })
}

function scriptSession(): Promise<{ token: string; email: string; apiUrl: string; otp?: boolean; appUrl?: string; google?: { token: string; email: string } }> {
  return new Promise((resolve, reject) =>
    window.google!.script!.run.withSuccessHandler((r) => resolve(r as never)).withFailureHandler(reject).atlasSession(),
  )
}

interface Ctx {
  hosted: boolean
  /** data API address handed over by Apps Script in hosted mode */
  apiUrl: string
  session: GSession | null
  /** opened from the public (data) link: sign in with an email code */
  otp: boolean
  /** the Google sign-in link (set in the back office), offered on the code login page */
  appUrl: string
  /** this page already runs as the visitor's Google account: one click signs them in with it */
  googleEmail: string
  continueWithGoogle: () => Promise<void>
  passwordLogin: (username: string, password: string) => Promise<void>
  /** forgot password: a sign-in link + code to the person's email */
  sendCode: (id: string) => Promise<void>
  verifyCode: (id: string, code: string) => Promise<void>
  signIn: (clientId: string, opts?: { silent?: boolean; hint?: string }) => Promise<GSession>
  signOut: () => void
  busy: boolean
  error: string
}
const C = createContext<Ctx | null>(null)
export const useGoogle = () => useContext(C)!

export function GoogleProvider({ children }: { children: ReactNode }) {
  const isHosted = hosted()
  const [session, setSession] = useState<GSession | null>(isHosted ? null : load)
  const [busy, setBusy] = useState(isHosted)
  const [error, setError] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [otp, setOtp] = useState(false)
  const [appUrl, setAppUrl] = useState('')
  const [offer, setOffer] = useState<{ token: string; email: string } | null>(null)
  const adoptGoogle = async (o: { token: string; email: string }) => {
    let name = ''
    let picture = ''
    try {
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${o.token}` } }).then((x) => x.json())
      name = info.name || ''
      picture = info.picture || ''
    } catch {}
    setSessionToken('')
    setAccessToken(o.token)
    setSession({ token: o.token, exp: Date.now() + 50 * 60_000, email: String(o.email).toLowerCase(), name, picture, kind: 'google' })
  }
  const adopt = (r: { session: string; email: string; exp: number }) => {
    try {
      localStorage.setItem(OTP_KEY, JSON.stringify({ sid: r.session, email: r.email, exp: r.exp }))
    } catch {}
    setSessionToken(r.session)
    setSession({ token: '', exp: r.exp, email: r.email, name: '', picture: '', kind: 'otp' })
  }

  // Hosted in Apps Script: the page already runs as the signed-in Google user — just ask for a token.
  const loadHosted = useCallback(async () => {
    setBusy(true)
    try {
      const r = await scriptSession()
      if (r.otp) {
        setOtp(true)
        setApiUrl(r.apiUrl)
        setAppUrl(r.appUrl || '')
        setOffer(r.google || null)
        setError('')
        // chose Google before on this device → keep using it (token refreshes every 45 min)
        let viaGoogle = false
        try {
          viaGoogle = localStorage.getItem('acg.auth') === 'google'
        } catch {}
        if (r.google && viaGoogle) {
          await adoptGoogle(r.google)
          return
        }
        // one-click link from the email: ?login=…
        const p = await pageParams()
        const used = (() => {
          try {
            return sessionStorage.getItem('acg.otp.link')
          } catch {
            return null
          }
        })()
        if (p.login && p.login !== used) {
          try {
            sessionStorage.setItem('acg.otp.link', p.login)
          } catch {}
          try {
            adopt(await otpCall<{ session: string; email: string; exp: number }>(r.apiUrl, { action: 'otpLink', token: p.login }))
            return
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }
        setSession((s) => (s?.kind === 'otp' ? s : loadOtp()))
        return
      }
      let name = ''
      let picture = ''
      try {
        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${r.token}` } }).then((x) => x.json())
        name = info.name || ''
        picture = info.picture || ''
      } catch {}
      setAccessToken(r.token)
      setApiUrl(r.apiUrl)
      setSession({ token: r.token, exp: Date.now() + 50 * 60_000, email: String(r.email).toLowerCase(), name, picture })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => {
    if (!isHosted) return
    loadHosted()
    const t = setInterval(loadHosted, 45 * 60_000)
    return () => clearInterval(t)
  }, [isHosted, loadHosted])
  useEffect(() => setAccessToken(session?.kind === 'otp' ? '' : session?.token || ''), [session])
  // token lifetime is one hour; renew quietly a few minutes before it expires
  useEffect(() => {
    if (!session || isHosted || session.kind === 'otp') return
    const t = setTimeout(() => setSession(null), Math.max(0, session.exp - Date.now() - 120_000))
    return () => clearTimeout(t)
  }, [session, isHosted])

  const signIn = useCallback(async (clientId: string, opts: { silent?: boolean; hint?: string } = {}) => {
    if (hosted()) {
      await loadHosted()
      return session as GSession
    }
    setBusy(true)
    setError('')
    try {
      await loadGis()
      const tr = await new Promise<TokenResponse>((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPES,
          callback: (r) => (r.error ? reject(new Error(r.error)) : resolve(r)),
          error_callback: (e) => reject(new Error(e.type)),
        })
        client.requestAccessToken({ prompt: opts.silent ? '' : 'select_account', login_hint: opts.hint })
      })
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tr.access_token}` } }).then((r) => r.json())
      const s: GSession = { token: tr.access_token!, exp: Date.now() + (tr.expires_in || 3600) * 1000, email: String(info.email || '').toLowerCase(), name: info.name || '', picture: info.picture || '' }
      try {
        sessionStorage.setItem(KEY, JSON.stringify(s))
        localStorage.setItem('acg.ghint', s.email)
      } catch {}
      setAccessToken(s.token)
      setSession(s)
      return s
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setBusy(false)
    }
  }, [loadHosted, session])

  const passwordLogin = useCallback(async (username: string, password: string) => {
    const r = await otpCall<{ session: string; email: string; exp: number }>(apiUrl, { action: 'pwLogin', username, password })
    adopt({ ...r, email: r.email || username.toLowerCase() })
  }, [apiUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendCode = useCallback(async (id: string) => {
    await otpCall(apiUrl, { action: 'otpSend', email: id })
  }, [apiUrl])
  const verifyCode = useCallback(async (id: string, code: string) => {
    adopt(await otpCall<{ session: string; email: string; exp: number }>(apiUrl, { action: 'otpVerify', email: id, code }))
  }, [apiUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const continueWithGoogle = useCallback(async () => {
    if (!offer) return
    try {
      localStorage.setItem('acg.auth', 'google')
    } catch {}
    await adoptGoogle(offer)
  }, [offer]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem('acg.auth')
    } catch {}
    if (session?.kind === 'otp') {
      try {
        const s = JSON.parse(localStorage.getItem(OTP_KEY) || 'null')
        if (s?.sid && apiUrl) otpCall(apiUrl, { action: 'otpLogout', session: s.sid }).catch(() => {})
        localStorage.removeItem(OTP_KEY)
      } catch {}
      setSessionToken('')
    }
    try {
      if (session?.token) window.google?.accounts?.oauth2?.revoke(session.token)
    } catch {}
    try {
      sessionStorage.removeItem(KEY)
    } catch {}
    setAccessToken('')
    setSession(null)
  }, [session, apiUrl])

  return <C.Provider value={{ hosted: isHosted, apiUrl, session, otp, appUrl, googleEmail: offer?.email || '', continueWithGoogle, passwordLogin, sendCode, verifyCode, signIn, signOut, busy, error }}>{children}</C.Provider>
}
