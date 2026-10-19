import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import {
  LayoutGrid, Briefcase, ListChecks, BellRing, ShieldAlert, FileText, Settings, Moon, Sun, Search, Plus, RefreshCw, Menu,
  Sparkles, CheckCircle2, AlertCircle, Bell, PanelLeftClose, PanelLeftOpen, Languages, Star, AtSign, Flag, Clock, CircleAlert, Ban, CalendarDays, Keyboard, PackageCheck, CalendarRange, Gauge, UserRound, LogOut,
  Binoculars, Repeat, Map, Zap, Target, FileSignature, Send,
} from 'lucide-react'
import { useStore, clearSnaps } from '../lib/store'
import { useI18n, L } from '../lib/i18n'
import { usePins, usePref } from '../lib/prefs'
import { buildInbox, type InboxItem } from '../lib/inbox'
import { projectMetrics } from '../lib/metrics'
import { useEditor } from './Editor'
import { cx, Avatar, HealthDot, Popover, MenuItem } from './ui'
import { fa, fmtDayMonth, todayISO as todayISOStr } from '../lib/jalali'
import { inWeek, updateDue, weekStart } from '../lib/weeks'
import { overloaded } from '../lib/capacity'
import { isLate, tracking } from '../lib/radar'
import { needsAttention, weekState } from '../lib/cadence'
import { useGoogle } from '../lib/google'
import { APP_NAME, VERSION } from '../lib/brand'
import { hubOf, type Hub } from './HubNav'
import { can } from '../lib/access'
import { isPlanning } from '../lib/planning'
import { ACCESS, JOB_TITLE } from '../lib/labels'
import { CommandPalette } from './CommandPalette'
import { AcgMark } from './Brand'
import { lbl } from '../lib/i18n'

export function Layout({ children }: { children: ReactNode }) {
  const { db, me, setMe, mode, loading, error, refresh, lastSync, toasts, canEdit, dismissToast, config, setConfig, access, serverVersion, setting } = useStore()
  const { signOut } = useGoogle()
  const [, setEntered] = usePref<boolean>('acg.entered', false)
  const myMember = db.Team.find((m) => m.name === me)
  const leader = can.portfolio(access)
  const { lang, setLang } = useI18n()
  const { open } = useEditor()
  const { pins } = usePins()
  const [collapsed, setCollapsed] = usePref('acg.sidebar.collapsed', false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [nav, setNav] = useState(false)
  const [palette, setPalette] = useState(false)
  const [keys, setKeys] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()

  useEffect(() => setNav(false), [loc.pathname])
  // every page opens at the top
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      } else if (!typing && !e.metaKey && !e.ctrlKey && canEdit && (e.key === 'n' || e.key === 'د')) {
        e.preventDefault()
        open('Tasks', { assignee: me })
      } else if (!typing && !e.metaKey && !e.ctrlKey && canEdit && (e.key === 'f' || e.key === 'ب')) {
        e.preventDefault()
        open('FollowUps')
      } else if (!typing && e.key === '[') {
        if (window.innerWidth < 1280) setForceWide((v) => !v)
        else setCollapsed((c) => !c)
      }
      else if (!typing && e.key === '?') setKeys(true)
      else if (e.key === 'Escape') setKeys(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [canEdit, me, open, setCollapsed])

  const toggleTheme = () => {
    const d = !dark
    setDark(d)
    document.documentElement.classList.toggle('dark', d)
    try {
      localStorage.setItem('acg.theme', d ? 'dark' : 'light')
    } catch {}
  }

  const inbox = useMemo(() => buildInbox(db, me), [db, me])
  const myCount = inbox.filter((i) => i.kind !== 'milestone' && i.kind !== 'risk' && i.kind !== 'blocked').length

  const ws = weekStart()
  const updatesMissing = todayISOStr() > updateDue(ws)
    ? db.Projects.filter((p) => p.status === 'active' && !db.Updates.some((u) => u.project_id === p.id && inWeek(u.week_date, ws))).length
    : 0
  const overCap = overloaded(db, ws).length
  const radarLate = leader ? db.Tasks.filter((t) => tracking(t, me) && isLate(t)).length + db.Projects.filter((p) => needsAttention(weekState(p, db))).length : 0

  // agile layout: my work → planning → doing → watching
  const openTasks = db.Tasks.filter((t) => t.status !== 'done').length
  const nextPlans = db.Meetings.filter((m) => isPlanning(m) && m.status === 'scheduled' && m.date >= todayISOStr()).length
  const groups: { label: string; links: { to: string; label: string; icon: typeof LayoutGrid; badge?: number; count?: number; hub?: Hub }[] }[] = [
    {
      label: L('کار من', 'My work'),
      links: [
        { to: '/my', label: L('خانه', 'Home'), icon: Sparkles, badge: myCount },
        { to: '/calendar', label: L('تقویم', 'Calendar'), icon: CalendarDays },
        { to: '/meetings', label: L('جلسات', 'Meetings'), icon: CalendarRange },
      ],
    },
    {
      label: L('برنامه‌ریزی', 'Planning'),
      links: [
        ...(leader ? [{ to: '/roadmap', label: L('رودمپ', 'Roadmap'), icon: Map }] : []),
        { to: '/sprints', label: L('اسپرینت‌ها', 'Sprints'), icon: Zap },
        { to: '/planning', label: L('جلسات برنامه‌ریزی', 'Planning sessions'), icon: Target, count: nextPlans },
        { to: '/plan', label: L('برنامه‌ی تحویل', 'Delivery plan'), icon: PackageCheck },
      ],
    },
    {
      label: L('اجرا', 'Delivery'),
      links: [
        { to: '/projects', label: leader ? L('پروژه‌ها', 'Projects') : L('پروژه‌های من', 'My projects'), icon: Briefcase, count: db.Projects.filter((p) => p.status === 'active').length },
        { to: '/tasks', label: L('تسک‌ها', 'Tasks'), icon: ListChecks, count: openTasks },
        { to: '/followups', label: L('پیگیری‌ها', 'Follow-ups'), icon: BellRing },
        ...(leader ? [{ to: '/teams', label: L('واحدها و تحویل‌ها', 'Units & hand-offs'), icon: Repeat }] : []),
      ],
    },
    {
      label: L('پایش', 'Watching'),
      links: [
        ...(leader ? [{ to: '/lookout', label: L('دیده‌بان', 'Lookout'), icon: Binoculars, badge: radarLate, hub: 'lookout' as Hub }] : []),
        { to: '/updates', label: L('گزارش‌های هفتگی', 'Weekly updates'), icon: FileText, badge: updatesMissing },
        ...(can.backoffice(access) ? [{ to: '/telegram', label: L('به‌روزرسانی از تلگرام', 'Update from Telegram'), icon: Send }] : []),
        ...(leader ? [
          { to: '/team', label: L('ظرفیت و منابع', 'Capacity & resourcing'), icon: Gauge, badge: overCap },
          { to: '/risks', label: L('ریسک‌ها و تصمیم‌ها', 'Risks & decisions'), icon: ShieldAlert },
        ] : []),
      ],
    },
    ...(can.contracts(access)
      ? [{
          label: L('مدیریت', 'Admin'),
          links: [
            { to: '/contracts', label: L('قراردادها', 'Contracts'), icon: FileSignature },
            ...(can.backoffice(access) ? [{ to: '/admin', label: L('بک‌آفیس', 'Back office'), icon: Settings }] : []),
          ],
        }]
      : []),
  ]

  const pinned = db.Projects.filter((p) => pins.includes(p.id))
  // Laptops under 1280px get the compact icon rail automatically; the user can still expand it.
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1280)
  const [forceWide, setForceWide] = useState(false)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < 1280)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const wide = nav || (narrow ? forceWide : !collapsed)
  const toggleSidebar = () => (narrow ? setForceWide((v) => !v) : setCollapsed(!collapsed))

  const sidebar = (
    <aside className={cx('flex h-full flex-col bg-band text-on-band transition-[width] duration-300', wide ? 'w-64' : 'w-[4.5rem]')}>
      <div className={cx('flex h-16 shrink-0 items-center border-b border-band-line', wide ? 'gap-3 px-5' : 'justify-center')}>
        <Link to="/" className="flex items-center gap-3">
          <AcgMark className="h-7 text-white" />
          {wide && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">{APP_NAME()}</div>
              <div className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-band-sub">ACG · Atlas</div>
            </div>
          )}
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label}>
            {wide && <div className="mb-1.5 px-3 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-band-sub/80">{g.label}</div>}
            <div className="space-y-0.5">
              {g.links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  title={!wide ? l.label : undefined}
                  className={({ isActive: a }) => {
                    const isActive = a || (!!l.hub && hubOf(loc.pathname) === l.hub) || (l.to === '/team' && loc.pathname.startsWith('/people'))
                    return cx(
                      'group relative flex h-10 items-center gap-3 rounded-xl text-sm transition',
                      wide ? 'px-3' : 'justify-center',
                      isActive ? 'bg-white/[0.09] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
                    )
                  }}
                >
                  {({ isActive: a }) => {
                    const isActive = a || (!!l.hub && hubOf(loc.pathname) === l.hub) || (l.to === '/team' && loc.pathname.startsWith('/people'))
                    return (
                    <>
                      {isActive && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-brand-soft" />}
                      <l.icon size={18} strokeWidth={1.7} />
                      {wide && <span className="flex-1 truncate">{l.label}</span>}
                      {wide && !l.badge && !!l.count && <span className="font-mono text-[0.6875rem] text-white/35 num">{fa(l.count)}</span>}
                      {!!l.badge && (
                        <span className={cx('rounded-full bg-[#c4314b] text-[0.625rem] font-semibold text-white num leading-[18px]', wide ? 'px-1.5' : 'absolute end-2 top-1.5 h-2 w-2 overflow-hidden text-transparent')}>{fa(l.badge)}</span>
                      )}
                    </>
                    )
                  }}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        {wide && pinned.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 px-3 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-band-sub/80">
              <Star size={10} /> {L('پین‌شده', 'Pinned')}
            </div>
            <div className="space-y-0.5">
              {pinned.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className={({ isActive }) => cx('flex h-9 items-center gap-3 rounded-xl px-3 text-[0.8125rem] transition', isActive ? 'bg-white/[0.09] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white')}
                >
                  <HealthDot h={projectMetrics(p, db).health} />
                  <span className="truncate">{p.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>
      <div className="border-t border-band-line p-3">
        <Popover
          width={260}
          trigger={({ toggle }) => (
            <button onClick={toggle} className={cx('flex w-full items-center gap-3 rounded-xl p-2 text-start transition hover:bg-white/[0.06]', !wide && 'justify-center')}>
              <Avatar name={me || 'ACG'} size="md" />
              {wide && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{me || L('مهمان', 'Guest')}</div>
                  <div className="truncate text-[0.6875rem] text-band-sub">{lbl(JOB_TITLE, db.Team.find((m) => m.name === me)?.role || '') || lbl(ACCESS, access)}</div>
                </div>
              )}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2.5 py-2">
                <div className="text-sm font-medium">{me}</div>
                <div className="text-xs text-sub">{mode === 'demo' ? L('حالت نمایشی با داده‌ی نمونه', 'Demo mode with sample data') : L('متصل به Google Sheets', 'Connected to Google Sheets')}</div>
              </div>
              <div className="my-1 h-px bg-line" />
              {myMember && (
                <MenuItem icon={<UserRound size={15} />} onClick={() => { close(); navigate(`/people/${myMember.id}`) }}>
                  {L('پروفایل من', 'My profile')}
                </MenuItem>
              )}
              {mode === 'demo' && (
                <div className="px-2.5 pb-1 pt-2">
                  <div className="mb-1 text-[0.6875rem] text-sub">{L('مشاهده به‌عنوان (نمایشی)', 'View as (demo)')}</div>
                  <select className="input h-9 text-xs" value={me} onChange={(e) => { setMe(e.target.value); close() }}>
                    {db.Team.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} — {lbl(JOB_TITLE, m.role)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <MenuItem icon={<Languages size={15} />} hint={lang === 'fa' ? 'EN' : 'فا'} onClick={() => { setLang(lang === 'fa' ? 'en' : 'fa'); close() }}>
                {L('English', 'فارسی')}
              </MenuItem>
              <MenuItem icon={dark ? <Sun size={15} /> : <Moon size={15} />} onClick={() => { toggleTheme(); close() }}>
                {dark ? L('حالت روشن', 'Light mode') : L('حالت تیره', 'Dark mode')}
              </MenuItem>
              <MenuItem icon={wide ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />} hint="[" onClick={() => { toggleSidebar(); close() }}>
                {!wide ? L('باز کردن منو', 'Expand sidebar') : L('جمع کردن منو', 'Collapse sidebar')}
              </MenuItem>
              <MenuItem icon={<Keyboard size={15} />} hint="?" onClick={() => { close(); setKeys(true) }}>
                {L('میانبرهای صفحه‌کلید', 'Keyboard shortcuts')}
              </MenuItem>
              {can.backoffice(access) && (
                <MenuItem icon={<Settings size={15} />} onClick={() => { close(); navigate('/admin') }}>
                  {L('بک‌آفیس و تنظیمات', 'Back office & settings')}
                </MenuItem>
              )}
              <MenuItem icon={<LogOut size={15} />} danger onClick={() => { close(); if (mode === 'live') { signOut(); clearSnaps(); setConfig({ ...config, token: '' }) } setEntered(false) }}>
                {L('خروج', 'Sign out')}
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </aside>
  )

  const syncText = loading ? L('همگام‌سازی…', 'Syncing…') : error ? L('خطا در اتصال', 'Connection error') : lastSync ? fa(lastSync.toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })) : ''

  return (
    <div className="flex h-full">
      <div className="hidden shrink-0 lg:block no-print">{sidebar}</div>
      {nav && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-black/40 fade-in" onClick={() => setNav(false)} />
          <div className="absolute inset-y-0 start-0 sheet-in">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-band-line bg-band/95 px-4 text-on-band backdrop-blur-md sm:px-6 no-print">
          <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setNav(true)}>
            <Menu size={20} />
          </button>
          <button
            onClick={() => setPalette(true)}
            className="flex h-10 max-w-md flex-1 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-white/55 transition hover:border-white/20 hover:bg-white/[0.09]"
          >
            <Search size={16} />
            <span className="flex-1 truncate text-start">{L('جستجو یا فرمان…', 'Search or jump to…')}</span>
            <kbd className="hidden rounded-md border border-white/15 px-1.5 font-mono text-[0.625rem] text-white/50 sm:inline" dir="ltr">
              Ctrl K
            </kbd>
          </button>
          <div className="flex-1" />
          <span className={cx('hidden items-center gap-1.5 font-mono text-[0.6875rem] md:flex', error ? 'text-[#ff8a9a]' : 'text-white/45')} title={error}>
            <span className={cx('h-1.5 w-1.5 rounded-full', mode === 'demo' ? 'bg-[#f5c565]' : error ? 'bg-[#ff8a9a]' : 'bg-[#7fe0b0]')} />
            {mode === 'demo' ? L('نمایشی', 'DEMO') : syncText}
            <span className="text-white/30" dir="ltr">v{VERSION}</span>
          </span>
          <button className="icon-btn text-white/75 hover:bg-white/10 hover:text-white" onClick={() => refresh()} title={L('همگام‌سازی', 'Sync')}>
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="hidden rounded-full border border-white/10 p-0.5 sm:flex">
            {(['fa', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={cx('h-7 rounded-full px-2.5 text-[0.6875rem] font-semibold transition', lang === l ? 'bg-white text-band' : 'text-white/60 hover:text-white')}>
                {l === 'fa' ? 'فا' : 'EN'}
              </button>
            ))}
          </div>
          <button className="icon-btn text-white/75 hover:bg-white/10 hover:text-white" onClick={toggleTheme} title={L('تم', 'Theme')}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <InboxButton items={inbox} />
          {canEdit && (
            <Popover
              align="end"
              width={230}
              trigger={({ toggle }) => (
                <button className="btn h-9 bg-white px-3.5 text-band" onClick={toggle}>
                  <Plus size={16} />
                  <span className="hidden sm:inline">{L('جدید', 'New')}</span>
                </button>
              )}
            >
              {(close) =>
                (
                  [
                    ['Tasks', L('تسک', 'Task'), 'N', ListChecks],
                    ['FollowUps', L('پیگیری', 'Follow-up'), 'F', BellRing],
                    ['Updates', L('گزارش هفتگی', 'Weekly update'), '', FileText],
                    ['Risks', L('ریسک / تصمیم', 'Risk / decision'), '', ShieldAlert],
                    ['Milestones', L('مایلستون', 'Milestone'), '', Flag],
                    ['Projects', L('پروژه', 'Project'), '', Briefcase],
                  ] as const
                ).map(([s, l, k, Icon]) => (
                  <MenuItem
                    key={s}
                    icon={<Icon size={15} />}
                    hint={k ? <span className="kbd">{k}</span> : undefined}
                    onClick={() => {
                      close()
                      open(s, s === 'Tasks' ? { assignee: me } : undefined)
                    }}
                  >
                    {l}
                  </MenuItem>
                ))
              }
            </Popover>
          )}
        </header>

        {/* page and server must be the same release; a half-done update shows here for the program manager */}
        {mode === 'live' && lastSync && can.backoffice(access) && serverVersion !== VERSION && (
          <div className="bg-warn px-4 py-2 text-center text-xs text-white no-print">
            {L(
              `نسخه‌ی صفحه ${VERSION} است ولی سرور (Code.gs) ${serverVersion || 'قدیمی‌تر از 1.10.1'} — Code.gs را جایگزین کنید و در Manage deployments برای Atlas Team «New version» بزنید.`,
              `This page is ${VERSION} but the server (Code.gs) is ${serverVersion || 'older than 1.10.1'} — replace Code.gs and create a New version of Atlas Team in Manage deployments.`,
            )}
          </div>
        )}
        {mode === 'live' && lastSync && can.backoffice(access) && !setting('app.google_url', '') && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 bg-warn px-4 py-2 text-center text-xs text-white no-print">
            {L('ورود با گوگل برای تیم فعال نیست: لینک انتشار «Atlas Google» هنوز در تنظیمات ثبت نشده و فعلاً فقط خود شما این دکمه را می‌بینید.', 'Google sign-in is off for the team: the “Atlas Google” deployment link is not saved (only you see the button).')}
            <Link to="/settings" className="font-semibold underline">{L('ذخیره‌ی لینک', 'Save the link')}</Link>
          </div>
        )}
        {error && mode === 'live' && <div className="bg-bad px-4 py-2 text-center text-xs text-white no-print">{L('اتصال به Google Sheet برقرار نشد', 'Could not reach Google Sheet')}: {error}</div>}

        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="@container px-4 pb-16 sm:px-6 lg:px-8 print-full" key={loc.pathname}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {keys && <Shortcuts onClose={() => setKeys(false)} />}

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4 no-print">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-pop rise', t.kind === 'err' ? 'bg-bad text-white' : 'bg-[#111214] text-white')}>
            {t.kind === 'err' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} className="text-[#7fe0b0]" />}
            <span>{t.text}</span>
            {t.action && (
              <button
                className="ms-2 font-semibold text-brand-soft hover:underline dark:text-[#C1D6DE]"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const kindIcon = { mention: AtSign, overdue: Clock, followup: BellRing, milestone: Flag, risk: CircleAlert, blocked: Ban, assigned: UserRound, remind: Bell, deadline: Flag, delivery: PackageCheck, handoff: Repeat }

function InboxButton({ items }: { items: InboxItem[] }) {
  const [read, setRead] = usePref<string[]>('acg.inbox.read', [])
  const { open } = useEditor()
  const { db } = useStore()
  const navigate = useNavigate()
  const unread = items.filter((i) => !read.includes(i.id))
  // a new notification pops up once, inside the app
  const [seen, setSeen] = usePref<string[]>('acg.inbox.seen', [])
  const { toast } = useStore()
  useEffect(() => {
    const fresh = unread.filter((i) => !seen.includes(i.id))
    if (!fresh.length) return
    // the first time, everything already waiting is just marked seen
    if (seen.length) fresh.slice(0, 3).forEach((i) => toast(`🔔 ${i.title} — ${i.sub}`))
    setSeen((s) => Array.from(new Set([...s, ...fresh.map((i) => i.id), '_'])).slice(-500))
  }, [unread.map((i) => i.id).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: InboxItem) => {
    setRead((r) => Array.from(new Set([...r, i.id])))
    if ('href' in i.target) navigate(i.target.href)
    else {
      const t = i.target
      const row = (db[t.sheet] as { id: string }[]).find((x) => x.id === t.id)
      if (row) open(t.sheet, row as never)
    }
  }
  return (
    <Popover
      align="end"
      width={380}
      className="!p-0"
      trigger={({ toggle }) => (
        <button className="icon-btn text-white/75 hover:bg-white/10 hover:text-white" onClick={toggle} title={L('اعلان‌ها', 'Inbox')}>
          <Bell size={17} />
          {unread.length > 0 && <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#c4314b] px-1 text-[0.5625rem] font-bold text-white num">{fa(unread.length > 9 ? '9+' : unread.length)}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{L('صندوق اعلان‌ها', 'Inbox')}</div>
              <div className="text-[0.6875rem] text-sub">{L(`${fa(unread.length)} مورد خوانده‌نشده`, `${unread.length} unread`)}</div>
            </div>
            {unread.length > 0 && (
              <button className="text-xs font-medium text-brand hover:underline" onClick={() => setRead(items.map((i) => i.id))}>
                {L('همه خوانده شد', 'Mark all read')}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.length === 0 && <div className="py-10 text-center text-sm text-sub">{L('همه‌چیز مرتب است ✨', 'All clear ✨')}</div>}
            {items.slice(0, 40).map((i) => {
              const Icon = kindIcon[i.kind]
              const isUnread = !read.includes(i.id)
              return (
                <button
                  key={i.id}
                  onClick={() => {
                    close()
                    go(i)
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-start transition hover:bg-muted"
                >
                  <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', i.tone === 'bad' ? 'bg-bad/10 text-bad' : i.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-brand-soft/60 text-ink')}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm', isUnread && 'font-semibold')}>{i.title}</span>
                    <span className="block truncate text-xs text-sub">{i.sub}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5">
                    <span className="text-[0.625rem] text-sub num">{fmtDayMonth(i.when.slice(0, 10))}</span>
                    {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Popover>
  )
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Ctrl K', L('جستجو و فرمان‌ها', 'Search & commands')],
    ['N', L('تسک جدید', 'New task')],
    ['F', L('پیگیری جدید', 'New follow-up')],
    ['[', L('جمع / باز کردن منو', 'Toggle sidebar')],
    ['Ctrl Enter', L('ارسال یادداشت / ذخیره فرم', 'Send note / save form')],
    ['Esc', L('بستن پنل', 'Close panel')],
    ['?', L('همین راهنما', 'This help')],
  ]
  return (
    <div className="fixed inset-0 z-[78] grid place-items-center p-4 no-print">
      <div className="absolute inset-0 bg-[#0a0d12]/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-pop pop-in">
        <div className="eyebrow">{L('راهنما', 'Help')}</div>
        <h2 className="mt-1 text-lg font-bold">{L('میانبرهای صفحه‌کلید', 'Keyboard shortcuts')}</h2>
        <div className="mt-5 divide-y divide-line">
          {rows.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-sm">
              <span>{l}</span>
              <span className="flex gap-1" dir="ltr">
                {k.split(' ').map((x) => (
                  <kbd key={x} className="kbd h-6 min-w-6 text-[0.6875rem]">
                    {x}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <button className="btn-primary mt-5 w-full" onClick={onClose}>
          {L('متوجه شدم', 'Got it')}
        </button>
      </div>
    </div>
  )
}
