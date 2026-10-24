import { DAYS as CADENCE_DAYS, DELIVERY_KEYS, deliveryCfg } from '../lib/cadence'
import { dirOf } from '../lib/dir'
import { MizitoSettings } from '../components/MizitoParts'
import { useState } from 'react'
import { CalendarClock, CheckCircle2, Link2, Loader2, RotateCcw, Unplug, XCircle, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import { useGoogle } from '../lib/google'
import { useAuto, AUTOMATIONS } from '../lib/automations'
import { Band, Card, Overlap, Segmented, cx } from '../components/ui'
import { fetchAll } from '../lib/api'
import { fa, timeAgo } from '../lib/jalali'
import { L, lbl, tr, useI18n } from '../lib/i18n'
import { ROLE } from '../lib/labels'
import { APP_NAME } from '../lib/brand'
import { WEEK_KEYS, weekCfg } from '../lib/weeks'
import { CalendarLayersCard, DashboardWidgetsCard, SprintSettingsCard, TeamHealthCard } from '../components/ViewSettings'
import { ColumnsCard, FieldsCard, FlagsCard, NotifyCard, Switch, TaskCard } from '../components/TaskSettings'

export default function Settings({ embedded }: { embedded?: boolean }) {
  const { config, setConfig, mode, resetDemo, role, db, access } = useStore()
  const g = useGoogle()
  const { session } = g
  const auto = useAuto()
  const { lang, setLang, cal, setCal } = useI18n()
  const [url, setUrl] = useState(config.apiUrl)
  const [client, setClient] = useState(config.googleClientId || '')
  const [token, setToken] = useState(config.token)
  const [test, setTest] = useState<{ state: 'idle' | 'loading' | 'ok' | 'err'; msg?: string }>({ state: 'idle' })
  const admin = access === 'super'

  const runTest = async () => {
    setTest({ state: 'loading' })
    try {
      const r = await fetchAll({ apiUrl: url.trim(), token: token.trim() })
      const n = Object.values(r.data || {}).reduce((s: number, rows) => s + (rows as unknown[]).length, 0)
      setTest({ state: 'ok', msg: L(`اتصال موفق — ${fa(n)} ردیف · ${r.user.name} (${lbl(ROLE, r.user.role)})`, `Connected — ${n} rows · ${r.user.name} (${lbl(ROLE, r.user.role)})`) })
    } catch (e) {
      setTest({ state: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <>
      {!embedded && <Band title={L('تنظیمات', 'Settings')} sub={L(`اتصال ${APP_NAME()} به گوگل، اتوماسیون‌ها و نمایش.`, `${APP_NAME()}’s Google connection, automations and display.`)} />}
      <Wrap embedded={embedded}>
        <Card
          eyebrow={<span className="flex items-center gap-1.5"><Zap size={12} /> {L('اتوماسیون', 'Automations')}</span>}
          title={L('کارهایی که خودکار انجام می‌شوند', 'Work that happens on its own')}
          className="@xl:row-span-2"
        >
          <ul className="divide-y divide-line">
            {AUTOMATIONS.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-ink">
                  <a.icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{tr(a.title)}</div>
                </div>
                <Switch on={auto.on(a.id)} onChange={(v) => auto.setOn(a.id, v)} disabled={!admin} />
              </li>
            ))}
          </ul>
          {auto.log.length > 0 && (
            <div className="mt-4 rounded-2xl bg-muted/60 p-3">
              <div className="eyebrow mb-2">{L('آخرین اجراها', 'Recent runs')}</div>
              <ul className="space-y-1 text-xs">
                {auto.log.slice(0, 6).map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span dir={dirOf(l.text)}>{l.text}</span>
                    <span className="shrink-0 text-sub">{timeAgo(l.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <WeekCard admin={admin} />
        <NotifyCard admin={admin} />
        <TaskCard admin={admin} />
        <FieldsCard admin={admin} />
        <ColumnsCard admin={admin} />
        <FlagsCard admin={admin} />
        <DashboardWidgetsCard admin={admin} />
        <TeamHealthCard admin={admin} />
        <CalendarLayersCard admin={admin} />
        <SprintSettingsCard admin={admin} />

        <Card eyebrow="Google" title={L('ورود با گوگل و تقویم', 'Google sign-in & calendar')}>
          <div className="space-y-4">
            {admin && <TeamPasswordField />}
            {admin && <GoogleLinkField />}
            <div className="rounded-2xl bg-muted/70 p-4 text-xs leading-6 text-sub">
              {L('وضعیت', 'Status')}:{' '}
              <b className="text-ink">
                {mode === 'demo'
                  ? L('حالت نمایشی (تقویم نمونه)', 'Demo (sample calendar)')
                  : session
                    ? L(`وارد شده با ${session.email} · تقویم ${auto.calStatus === 'live' ? 'متصل' : 'در دسترس نیست'}`, `Signed in as ${session.email} · calendar ${auto.calStatus === 'live' ? 'connected' : 'unavailable'}`)
                    : L(`ورود با کلید · ${lbl(ROLE, role)}`, `Key sign-in · ${lbl(ROLE, role)}`)}
              </b>
              <br />
              {L(`پروژه‌ها ${fa(db.Projects.length)} · تسک‌ها ${fa(db.Tasks.length)} · جلسات ${fa(db.Meetings.length)} · فایل‌ها ${fa(db.Files.length)}`, `Projects ${db.Projects.length} · Tasks ${db.Tasks.length} · Meetings ${db.Meetings.length} · Files ${db.Files.length}`)}
            </div>
            {g.hosted ? (
              <p className="rounded-2xl bg-good/10 px-4 py-3 text-xs text-good">{L('متصل از طریق Google Apps Script', 'Connected via Google Apps Script')}</p>
            ) : (
              <>
            <div>
              <label className="label">{L('آدرس Web App (از Apps Script → Deploy)', 'Web App URL (Apps Script → Deploy)')}</label>
              <input className="input font-mono text-xs" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
            </div>
            <div>
              <label className="label">Google OAuth Client ID</label>
              <input className="input font-mono text-xs" dir="ltr" value={client} onChange={(e) => setClient(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" />
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-sub">{L('ورود با کلید (بدون گوگل)', 'Key sign-in (without Google)')}</summary>
              <input className="input mt-2 font-mono text-xs" dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="••••••••••••" />
            </details>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={runTest} disabled={!url || !token || test.state === 'loading'} title={L('تست با کلید', 'Tests with the key')}>
                {test.state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} {L('تست', 'Test')}
              </button>
              <button className="btn-primary" disabled={!url} onClick={() => setConfig({ apiUrl: url.trim(), token: token.trim(), googleClientId: client.trim() })}>
                {L('ذخیره و اتصال', 'Save & connect')}
              </button>
              {mode === 'live' && (
                <button className="btn-ghost" onClick={() => setConfig({ apiUrl: '', token: '', googleClientId: client.trim() })}>
                  <Unplug size={16} /> {L('قطع اتصال', 'Disconnect')}
                </button>
              )}
            </div>
            {test.state === 'ok' && (
              <div className="flex items-center gap-2 rounded-2xl bg-good/10 px-4 py-3 text-sm text-good">
                <CheckCircle2 size={16} /> {test.msg}
              </div>
            )}
            {test.state === 'err' && (
              <div className="flex items-center gap-2 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">
                <XCircle size={16} /> {test.msg}
              </div>
            )}
              </>
            )}
          </div>
        </Card>

        <Card eyebrow={L('نمایش', 'Display')} title={L('زبان و تقویم', 'Language & calendar')}>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium">{L('زبان', 'Language')}</div>
              <Segmented value={lang} onChange={setLang} options={[{ value: 'fa', label: 'فارسی' }, { value: 'en', label: 'English' }]} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium">{L('تقویم', 'Calendar')}</div>
              <Segmented value={cal} onChange={setCal} options={[{ value: 'jalali', label: L('شمسی', 'Jalali') }, { value: 'gregorian', label: L('میلادی', 'Gregorian') }]} />
            </div>
            {mode === 'demo' && (
              <div className="border-t border-line pt-4">
                <button className="btn-outline btn-sm mt-3" onClick={resetDemo}>
                  <RotateCcw size={14} /> {L('بازنشانی داده‌های نمونه', 'Reset sample data')}
                </button>
              </div>
            )}
          </div>
        </Card>
      </Wrap>
      <div className="mt-6">
        <div className="eyebrow mb-3 px-1">{L('میزیتو', 'Mizito')}</div>
        <MizitoSettings admin={admin} />
      </div>
    </>
  )
}

const DAYS = CADENCE_DAYS

/** Weekly cycle: shared for everyone, edited by the program manager. */
function WeekCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = weekCfg()
  const day = (label: string, key: string, value: number) => (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm font-medium">{label}</div>
      <select className="input h-9 w-36 text-xs" disabled={!admin} value={value} onChange={(e) => setSetting(key, e.target.value)}>
        {DAYS.map((d, i) => (
          <option key={i} value={i}>
            {L(d[0], d[1])}
          </option>
        ))}
      </select>
    </div>
  )
  const toggle = (i: number) => {
    const next = c.workdays.includes(i) ? c.workdays.filter((x) => x !== i) : [...c.workdays, i].sort()
    setSetting(WEEK_KEYS.workdays, next.join(','))
  }
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><CalendarClock size={12} /> {L('هفته', 'Week')}</span>} title={L('چرخه‌ی هفتگی', 'Weekly cycle')}>
      <div className="space-y-4">
        {day(L('جلسه‌ی هفتگی', 'Weekly meeting'), WEEK_KEYS.weeklyDay, c.weeklyDay)}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">{L('ساعت جلسه', 'Meeting time')}</div>
          <input type="time" dir="ltr" className="input h-9 w-36 text-xs" disabled={!admin} value={c.weeklyTime} onChange={(e) => e.target.value && setSetting(WEEK_KEYS.weeklyTime, e.target.value)} />
        </div>
        {day(L('مهلت گزارش هفتگی', 'Weekly report due'), WEEK_KEYS.dueDay, c.dueDay)}
        {day(L('شروع هفته', 'Week starts'), WEEK_KEYS.start, c.start)}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">{L('یادآوری روز تحویل پروژه‌ها', 'Remind before a delivery day')}</div>
          <select className="input h-9 w-36 text-xs" disabled={!admin} value={deliveryCfg().remind} onChange={(e) => setSetting(DELIVERY_KEYS.remind, e.target.value)}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n ? L(`${n} روز قبل`, `${n} day(s) before`) : L('همان روز', 'On the day')}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">{L('مهلت ثبت تحویل', 'Grace to record a delivery')}</div>
          <select className="input h-9 w-36 text-xs" disabled={!admin} value={deliveryCfg().grace} onChange={(e) => setSetting(DELIVERY_KEYS.grace, e.target.value)}>
            {[0, 1, 2].map((n) => <option key={n} value={n}>{n ? L(`${n} روز بعد`, `${n} day(s) after`) : L('همان روز', 'Same day')}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">{L('روزهای کاری', 'Workdays')}</div>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={i} disabled={!admin} onClick={() => toggle(i)} className={cx('h-8 rounded-full border px-3 text-xs transition disabled:opacity-60', c.workdays.includes(i) ? 'border-ink bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
                {L(d[0], d[1].slice(0, 3))}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** One shared password for username sign-in; stored hashed on the server. */
function TeamPasswordField() {
  const { mode, action, toast } = useStore()
  const [v, setV] = useState('')
  const [show, setShow] = useState(false)
  const save = async () => {
    try {
      await action('setTeamPassword', { password: v })
      setV('')
      toast(L('رمز عبور تیم عوض شد', 'Team password changed'))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }
  return (
    <div>
      <div className="label">{L('رمز عبور تیم', 'Team password')}</div>
      <div className="flex gap-2">
        <input className="input h-10 flex-1 text-xs" dir="ltr" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={L('رمز جدید (حداقل ۶ کاراکتر)', 'New password (6+ characters)')} value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn-ghost h-10 px-3 text-xs" type="button" onClick={() => setShow((x) => !x)}>
          {show ? L('پنهان', 'Hide') : L('نمایش', 'Show')}
        </button>
        <button className="btn-outline h-10 px-4 text-xs" disabled={mode !== 'live' || v.length < 6} onClick={save}>
          {L('ذخیره', 'Save')}
        </button>
      </div>
    </div>
  )
}

/** The "app" (Google sign-in) link. Teammates only get "Continue with Google" when it is saved here. */
function GoogleLinkField() {
  const { setting, setSetting } = useStore()
  const g = useGoogle()
  const saved = setting('app.google_url', '')
  const [v, setV] = useState(saved)
  const url = v.trim()
  const base = (x: string) => x.split('?')[0].replace(/\/+$/, '')
  const problem = !url
    ? ''
    : !/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/.test(base(url))
      ? L('این لینک انتشار Apps Script نیست. باید شبیه https://script.google.com/macros/s/…/exec باشد (لینک‌هایی که به /dev ختم می‌شوند فقط برای خود شما کار می‌کنند).', 'Not an Apps Script deployment link. It should look like https://script.google.com/macros/s/…/exec (links ending in /dev only work for you).')
      : g.apiUrl && base(url) === base(g.apiUrl)
        ? L('این همان لینک Madar Team است. لینک انتشار دوم، «Madar Google» (Execute as: User accessing) را بگذارید.', 'This is the Madar Team link. Use the second deployment, “Madar Google” (Execute as: User accessing).')
        : ''
  return (
    <div>
      <div className="label">{L('لینک ورود با گوگل (Madar Google)', 'Google sign-in link (Madar Google)')}</div>
      <div className="flex gap-2">
        <input className="input h-10 flex-1 text-xs" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn-outline h-10 px-4 text-xs" disabled={url === saved || !!problem} onClick={() => setSetting('app.google_url', url)}>
          {L('ذخیره', 'Save')}
        </button>
      </div>
      {problem ? (
        <p className="mt-1.5 text-[0.6875rem] leading-5 text-bad">{problem}</p>
      ) : (
        <p className="mt-1.5 text-[0.6875rem] leading-5 text-sub">
          {saved
            ? L('ذخیره شده؛ همه‌ی اعضا در صفحه‌ی ورود دکمه‌ی «ورود با حساب گوگل» را می‌بینند.', 'Saved; everyone sees “Continue with Google” on the sign-in page.')
            : L('تا این لینک ذخیره نشود، فقط خود شما (صاحب اسکریپت) دکمه‌ی ورود با گوگل را می‌بینید. لینک را از Deploy ← Manage deployments ← Madar Google ← Web app URL بردارید.', 'Until this is saved only you (the script owner) see Google sign-in. Copy it from Deploy → Manage deployments → Madar Google → Web app URL.')}
        </p>
      )}
    </div>
  )
}

function Wrap({ embedded, children }: { embedded?: boolean; children: React.ReactNode }) {
  const cls = 'grid items-start gap-4 @xl:grid-cols-[3fr_2fr]'
  return embedded ? <div className={cls}>{children}</div> : <Overlap className={cls}>{children}</Overlap>
}
