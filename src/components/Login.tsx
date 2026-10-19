import { useState } from 'react'
import { JOB_TITLE } from '../lib/labels'
import { ArrowRight, Eye, EyeOff, KeyRound, Loader, User } from 'lucide-react'
import { useStore } from '../lib/store'
import { useGoogle } from '../lib/google'
import { useI18n, L, lbl } from '../lib/i18n'
import { MarkDraw, NoyanMark } from './Brand'
import { VERSION } from '../lib/brand'
import { cx } from './ui'

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** The front door: Google sign-in. In the demo you can enter as any team member to see their view. */
export function Login({ onEnter }: { onEnter: () => void }) {
  const { config, mode, db, setMe } = useStore()
  const g = useGoogle()
  const { lang, setLang } = useI18n()
  const [who, setWho] = useState(db.Team[0]?.id || '')
  const [err, setErr] = useState('')
  const busy = g.busy

  const google = async () => {
    setErr('')
    if (mode === 'demo') return onEnter()
    try {
      if (g.hosted) {
        if (!g.session) await g.signIn('')
      } else await g.signIn(config.googleClientId || '', { hint: localStorage.getItem('madar.ghint') || undefined })
      onEnter()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  const error = err || g.error

  // username + team password (public link, no Google account needed)
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('madar.pw.user') || ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  // forgot password → sign-in link + code by email
  const [forgot, setForgot] = useState<'' | 'ask' | 'code'>('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const sendCode = async () => {
    setErr('')
    setWorking(true)
    try {
      await g.sendCode(username.trim())
      setForgot('code')
      setCode('')
      setNotice(L('اگر ایمیلی برای این حساب ثبت شده باشد، لینک ورود و کد ۶ رقمی به آن رفت.', 'If this account has an email, a sign-in link and a 6-digit code are on their way.'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }
  const verifyCode = async (c: string) => {
    setErr('')
    setWorking(true)
    try {
      await g.verifyCode(username.trim(), c)
      onEnter()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }
  const [working, setWorking] = useState(false)
  const pwLogin = async () => {
    setErr('')
    setWorking(true)
    try {
      await g.passwordLogin(username.trim(), password)
      try {
        localStorage.setItem('madar.pw.user', username.trim())
      } catch {}
      onEnter()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  const gBtn = 'light-btn flex h-12 w-full items-center justify-center gap-3 rounded-2xl text-sm font-semibold text-[#16181d] disabled:opacity-60'

  return (
    <div className="login-scene fixed inset-0 z-[90] overflow-y-auto text-white">
      {/* living backdrop: aurora, stars and a perspective map floor */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <span className="aurora aurora-1" />
        <span className="aurora aurora-2" />
        <span className="aurora aurora-3" />
        <span className="stars" />
        <span className="floor" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col">
        <header className="flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <NoyanMark className="h-7 w-7" />
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.25em] text-white/50">Noyan · Madar</span>
          </div>
          <div className="glass flex rounded-full p-0.5">
            {(['fa', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cx('h-7 rounded-full px-3 text-[0.6875rem] font-semibold transition', lang === l ? 'bg-white text-[#111]' : 'text-white/60 hover:text-white')}>
                {l === 'fa' ? 'فا' : 'EN'}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-5 pb-8 sm:gap-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-10">
          {/* hero: the Noyan frame draws itself inside its orbits (madar = orbit) */}
          <section className="flex flex-col items-center text-center">
            <div className="hero-mark relative mx-auto h-44 w-44 sm:h-64 sm:w-64 lg:h-80 lg:w-80">
              <span className="mark-glow" />
              <span className="orb orb-outer"><i /></span>
              <span className="orb orb-mid"><i /></span>
              <span className="orb orb-inner"><i /></span>
              <MarkDraw className="absolute inset-0 m-auto h-[40%] w-[40%] overflow-visible" />
            </div>
            <h2 className="display hero-title mt-5 text-5xl leading-none sm:text-7xl lg:text-8xl">{L('مدار', 'Madar')}</h2>
            <p className="hero-sub mt-3 text-sm text-white/60 sm:text-lg">{L('مدار محصول و فناوری نویان', 'Noyan product & technology, in one orbit')}</p>
          </section>

          {/* the form, on glass */}
          <section className="login-card light-card mx-auto w-full max-w-md rounded-[2rem] p-7 text-[#16181d] sm:p-9">
            <h1 className="text-2xl font-semibold tracking-tight">{L('ورود به مدار', 'Sign in to Madar')}</h1>
            <p className="mt-1.5 text-sm text-[#6b7180]">{L('خوش آمدید', 'Welcome back')}</p>

            {g.otp ? (
              <div className="mt-7 space-y-3">
                {forgot ? (
                  <form onSubmit={(e) => (e.preventDefault(), forgot === 'ask' ? sendCode() : verifyCode(code))} className="space-y-3">
                    <div className="text-sm font-semibold">{L('بازیابی ورود', 'Sign-in help')}</div>
                    {forgot === 'ask' ? (
                      <>
                        <label className="light-field">
                          <User size={16} className="shrink-0 text-[#9aa0ad]" />
                          <input dir="ltr" autoFocus autoCapitalize="none" spellCheck={false} placeholder={L('نام کاربری یا ایمیل', 'Username or email')} value={username} onChange={(e) => setUsername(e.target.value)} />
                        </label>
                        <button className="shine-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-[#111]" disabled={working || !username.trim()}>
                          {working ? <Loader size={16} className="animate-spin" /> : null}
                          {L('ارسال کد به ایمیل', 'Email me a code')}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs leading-6 text-[#6b7180]">{notice}</p>
                        <input className="light-field w-full text-center font-mono text-2xl tracking-[0.5em] outline-none" dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="••••••" value={code} onChange={(e) => {
                          const c = e.target.value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10)).replace(/\D/g, '').slice(0, 6)
                          setCode(c)
                          if (c.length === 6 && !working) verifyCode(c)
                        }} />
                        <button className="shine-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-[#111]" disabled={working || code.length !== 6}>
                          {working ? <Loader size={16} className="animate-spin" /> : <ArrowRight size={16} className="rtl:-scale-x-100" />}
                          {L('ورود', 'Sign in')}
                        </button>
                      </>
                    )}
                    <div className="flex justify-between text-xs">
                      <button type="button" className="text-[#6b7180] transition hover:text-[#16181d]" onClick={() => (setForgot(''), setErr(''))}>
                        {L('بازگشت به ورود', 'Back to sign in')}
                      </button>
                      {forgot === 'code' && (
                        <button type="button" className="text-[#6b7180] transition hover:text-[#16181d] disabled:opacity-50" disabled={working} onClick={sendCode}>
                          {L('ارسال دوباره', 'Resend')}
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                <form onSubmit={(e) => (e.preventDefault(), pwLogin())} className="space-y-3">
                  <label className="light-field">
                    <User size={16} className="shrink-0 text-[#9aa0ad]" />
                    <input dir="ltr" autoFocus={!username} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={L('نام کاربری', 'Username')} value={username} onChange={(e) => setUsername(e.target.value)} />
                  </label>
                  <label className="light-field">
                    <KeyRound size={16} className="shrink-0 text-[#9aa0ad]" />
                    <input dir="ltr" type={showPw ? 'text' : 'password'} autoFocus={!!username} autoComplete="current-password" placeholder={L('رمز عبور', 'Password')} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPw((x) => !x)} className="shrink-0 text-[#9aa0ad] transition hover:text-[#16181d]" aria-label={L('نمایش رمز', 'Show password')}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </label>
                  <div className="flex justify-end">
                    <button type="button" className="text-xs text-[#6b7180] transition hover:text-[#16181d]" onClick={() => (setForgot('ask'), setErr(''))}>
                      {L('رمز را فراموش کرده‌اید؟', 'Forgot password?')}
                    </button>
                  </div>
                  <button className="shine-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-[#111]" disabled={working || !username.trim() || !password}>
                    {working ? <Loader size={16} className="animate-spin" /> : <ArrowRight size={16} className="rtl:-scale-x-100" />}
                    {L('ورود', 'Sign in')}
                  </button>
                </form>
                )}
                {!forgot && (g.googleEmail || g.appUrl) && (
                  <>
                    <div className="flex items-center gap-3 py-1 text-[0.6875rem] text-[#9aa0ad]">
                      <span className="h-px flex-1 bg-[#e6e8ee]" />
                      {L('یا', 'or')}
                      <span className="h-px flex-1 bg-[#e6e8ee]" />
                    </div>
                    {g.googleEmail ? (
                      <button type="button" className={gBtn} disabled={working} onClick={async () => {
                        setErr('')
                        setWorking(true)
                        try {
                          await g.continueWithGoogle()
                          onEnter()
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : String(e))
                        } finally {
                          setWorking(false)
                        }
                      }}>
                        <GoogleG />
                        <span className="truncate">{L('ورود با گوگل', 'Continue with Google')}</span>
                        <span className="truncate text-xs font-normal text-[#6b7180]" dir="ltr">{g.googleEmail}</span>
                      </button>
                    ) : (
                      <a href={g.appUrl} target="_top" className={gBtn}>
                        <GoogleG /> {L('ورود با حساب گوگل', 'Continue with Google')}
                      </a>
                    )}
                  </>
                )}
              </div>
            ) : (
              <button onClick={google} disabled={busy && !g.hosted} className={cx(gBtn, 'mt-7')}>
                {busy ? <Loader size={18} className="animate-spin" /> : <GoogleG />}
                {g.hosted && g.session ? L(`ادامه با ${g.session.email}`, `Continue as ${g.session.email}`) : L('ورود با حساب گوگل', 'Continue with Google')}
              </button>
            )}
            {error && <p className="mt-3 rounded-xl bg-[#fde8eb] px-3 py-2 text-xs leading-5 text-[#c0283d]">{error}</p>}

            {mode === 'demo' && (
              <div className="mt-7 border-t border-[#e6e8ee] pt-6">
                <div className="mb-2 text-xs font-medium text-[#6b7180]">{L('نمایشی', 'Demo')}</div>
                <div className="flex gap-2">
                  <select className="light-select h-11 flex-1 rounded-2xl px-3 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
                    {db.Team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {lbl(JOB_TITLE, m.role)}
                      </option>
                    ))}
                  </select>
                  <button className="shine-btn h-11 rounded-2xl px-5 text-sm font-bold text-[#111]" onClick={() => (setMe(db.Team.find((m) => m.id === who)?.name || ''), onEnter())}>
                    {L('ورود', 'Enter')}
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className="flex items-center justify-between px-6 pb-5 text-[0.6875rem] text-white/35 sm:px-10">
          <span>{L('فن‌آوری شبکه آموزش دانش نویان', 'Noyan Knowledge Education Network Technology')}</span>
          <span className="flex items-center gap-4" dir="ltr">
            <span className="font-mono">v{VERSION}</span>
          </span>
        </footer>
      </div>
    </div>
  )
}
