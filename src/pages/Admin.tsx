import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KeyRound, Plus, Pencil, Lock, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, StatStrip, Avatar, cx } from '../components/ui'
import { PauseButton } from '../components/PauseButton'
import Settings from './Settings'
import { PeopleRegistry } from '../components/PeopleRegistry'
import { ImportPage } from '../components/Import'
import { OrgPage } from '../components/OrgSettings'
import { L, lbl } from '../lib/i18n'
import { ACCESS, PROJECT_STATUS, JOB_TITLE, usernameOf } from '../lib/labels'
import { TRACK, TRACKS } from '../lib/tracks'
import { closed } from '../lib/columns'
import { isAssignee } from '../lib/assignees'
import { isTaskOverdue } from '../lib/metrics'
import { fa } from '../lib/jalali'
import type { Access } from '../lib/types'

type Tab = 'people' | 'contacts' | 'org' | 'projects' | 'tasks' | 'planning' | 'mizito' | 'import' | 'settings'

/** Back office — the program manager's control room: people & access, organisation, projects, settings.
 *  Contracts have their own page (/contracts) for the program manager and the CEO. */
/** The back office, one module per tab. */
const MODULES: { id: Tab; fa: string; en: string; hintFa: string; hintEn: string }[] = [
  { id: 'people', fa: 'افراد و دسترسی', en: 'People & access', hintFa: '', hintEn: '' },
  { id: 'org', fa: 'تیم‌ها و سمت‌ها', en: 'Teams & titles', hintFa: '', hintEn: '' },
  { id: 'contacts', fa: 'اشخاص و رده‌ها', en: 'Contacts & tiers', hintFa: '', hintEn: '' },
  { id: 'projects', fa: 'پروژه‌ها', en: 'Projects', hintFa: '', hintEn: '' },
  { id: 'tasks', fa: 'تسک‌ها', en: 'Tasks', hintFa: 'قواعد تسک، فیلدها، حوزه‌ها، ستون‌ها و پرچم‌ها.', hintEn: 'Task rules, fields, areas, columns and flags.' },
  { id: 'planning', fa: 'برنامه‌ریزی و نمایش', en: 'Planning & views', hintFa: 'چرخه‌ی هفتگی، اسپرینت، سلامت تیم، داشبورد و تقویم.', hintEn: 'Week cycle, sprints, team health, dashboard and calendar.' },
  { id: 'mizito', fa: 'میزیتو', en: 'Mizito', hintFa: 'ایمپورت، وضعیت‌ها، دسته‌ها، اولویت و SLA.', hintEn: 'Import, statuses, categories, priority and SLA.' },
  { id: 'import', fa: 'ایمپورت', en: 'Import', hintFa: '', hintEn: '' },
  { id: 'settings', fa: 'عمومی', en: 'General', hintFa: 'ورود با گوگل، اتوماسیون‌ها، اعلان‌ها، زبان و تقویم.', hintEn: 'Google sign-in, automations, notifications, language and calendar.' },
]

export default function Admin({ initial = 'people' }: { initial?: Tab }) {
  const { db, access } = useStore()
  const { open } = useEditor()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || initial)
  const active = db.Team.filter((m) => String(m.active) !== 'false')
  return (
    <>
      <Band
        title={L('بک‌آفیس', 'Back office')}
        actions={
          <>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white/10 p-1">
              {MODULES.map((m) => (
                <button key={m.id} onClick={() => setTab(m.id)} className={cx('h-8 shrink-0 rounded-full px-3 text-xs font-medium transition', tab === m.id ? 'bg-white text-band' : 'text-white/80 hover:bg-white/10')}>
                  {L(m.fa, m.en)}
                </button>
              ))}
            </div>
            {tab === 'people' && (
              <>
                <button className="btn h-10 border border-white/15 text-white hover:bg-white/10" onClick={() => setTab('org')}>
                  {L('تعریف سمت‌ها و تیم‌ها', 'Define titles & teams')}
                </button>
                <button className="btn h-10 bg-white text-band" onClick={() => open('Team')}>
                  <Plus size={16} /> {L('نفر جدید', 'New person')}
                </button>
              </>
            )}
            {tab === 'projects' && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Projects')}>
                <Plus size={16} /> {L('پروژه‌ی جدید', 'New project')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('افراد فعال', 'Active people'), value: fa(active.length) },
            { label: L('پروژه‌های جاری', 'Live projects'), value: fa(db.Projects.filter((p) => p.status === 'active').length), sub: L(`${fa(db.Projects.filter((p) => p.status === 'on_hold').length)} متوقف`, `${db.Projects.filter((p) => p.status === 'on_hold').length} paused`) },
            { label: L('سمت‌ها', 'Job titles'), value: fa(new Set(db.Team.map((m) => m.role).filter(Boolean)).size) },
            { label: L('بدون ایمیل', 'No email'), value: fa(db.Team.filter((m) => !m.email).length), sub: L('فقط با نام کاربری وارد می‌شوند', 'username sign-in only') },
          ]}
        />
      </Band>
      <Overlap>
        {tab === 'people' && <People />}
        {tab === 'projects' && <ProjectsAdmin />}
        {tab === 'contacts' && <PeopleRegistry admin={access === 'super'} />}
        {tab === 'import' && <ImportPage />}
        {tab === 'org' && <OrgPage admin={access === 'super'} />}
        {tab !== 'people' && tab !== 'projects' && tab !== 'contacts' && tab !== 'import' && tab !== 'org' && (
          <p className="mb-3 px-1 text-xs text-sub">{L(MODULES.find((m) => m.id === tab)!.hintFa, MODULES.find((m) => m.id === tab)!.hintEn)}</p>
        )}
        {tab === 'tasks' && <Settings embedded section="tasks" />}
        {tab === 'planning' && <Settings embedded section="planning" />}
        {tab === 'mizito' && <Settings embedded section="mizito" />}
        {tab === 'settings' && <Settings embedded section="general" />}
        {tab === 'settings' && access === 'super' && <WipeCard />}
      </Overlap>
    </>
  )
}

function People() {
  const { db, upsert, me, toast, action } = useStore()
  // a person's own password: set one, make a new one (shown once), or back to the team password
  const password = async (m: { id: string; name: string; email?: string }) => {
    const choice = window.prompt(L(`رمز ${m.name}:\n۱ = رمز تازه را خودم می‌نویسم\n۲ = رمز تصادفی بساز (نشان داده می‌شود${m.email ? ' و به ایمیلش می‌رود' : ''})\n۳ = برگشت به رمز مشترک تیم\n\nعدد را بنویسید:`, `Password for ${m.name}: 1 = I type it, 2 = generate, 3 = back to the team password`), '2')
    if (!choice) return
    try {
      if (choice.trim() === '1') {
        const pw = window.prompt(L('رمز تازه (حداقل ۶ کاراکتر):', 'New password (6+ characters):'))
        if (!pw) return
        await action('setUserPassword', { id: m.id, password: pw })
        toast(L(`رمز ${m.name} عوض شد`, `${m.name}’s password changed`))
      } else if (choice.trim() === '2') {
        const r = (await action('resetUserPassword', { id: m.id, mail: !!m.email })) as { password?: string; username?: string; sent?: boolean } | undefined
        if (r?.password) window.prompt(L(`رمز تازه‌ی ${m.name}${r.sent ? ' (به ایمیلش هم رفت)' : ''} — کپی کنید و به او بدهید:`, 'New password — copy it:'), `${r.username} / ${r.password}`)
      } else if (choice.trim() === '3') {
        await action('clearUserPassword', { id: m.id })
        toast(L(`${m.name} دوباره با رمز مشترک تیم وارد می‌شود`, `${m.name} uses the team password again`))
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }
  const { open } = useEditor()
  // the team a person is in (the Teams page): set right here
  const setTeam = async (id: string, track: string) => {
    const m = db.Team.find((x) => x.id === id)!
    await upsert('Team', { ...m, track })
    toast(track ? L(`${m.name} ← تیم ${lbl(TRACK, track)}`, `${m.name} → ${lbl(TRACK, track)}`) : L(`${m.name} بدون تیم شد`, `${m.name}: no team`))
  }
  const setAccess = async (id: string, access: Access) => {
    const m = db.Team.find((x) => x.id === id)!
    await upsert('Team', { ...m, access })
    toast(L(`دسترسی ${m.name}: ${lbl(ACCESS, access)}`, `${m.name}: ${lbl(ACCESS, access)}`))
  }
  return (
    <Card pad={false} eyebrow={L('افراد', 'People')} title={L('اعضا، نقش و سطح دسترسی', 'Members, roles and access')}>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[56rem]">
          <thead className="border-b border-line">
            <tr>
              <th className="th">{L('نام', 'Name')}</th>
              <th className="th">{L('سطح دسترسی', 'Access')}</th>
              <th className="th">{L('نام کاربری', 'Username')}</th>
              <th className="th">{L('ایمیل', 'Email')}</th>
              <th className="th">{L('تیم', 'Track')}</th>
              <th className="th text-center">{L('تسک باز', 'Open tasks')}</th>
              <th className="th text-center">{L('ورود', 'Sign-in')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {db.Team.map((m) => {
              const mine = db.Tasks.filter((t) => !closed(t) && isAssignee(t, m.name))
              const openN = mine.length
              const late = mine.filter(isTaskOverdue).length
              const off = String(m.active) === 'false'
              return (
                <tr key={m.id} className={cx('transition hover:bg-muted/30', off && 'opacity-50')}>
                  <td className="td">
                    <Link to={`/people/${m.id}`} className="flex items-center gap-3">
                      <Avatar name={m.name} size="md" />
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-medium hover:underline">
                          {m.name} {String(m.tasks_private) === '1' && <Lock size={12} className="text-sub" />}
                        </span>
                        <span className="block text-[0.6875rem] text-sub">{lbl(JOB_TITLE, m.role)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="td">
                    <select className="input h-9 w-56 text-xs" value={m.access || 'member'} disabled={m.name === me} onChange={(e) => setAccess(m.id, e.target.value as Access)} title={m.name === me ? L('دسترسی خودتان را نمی‌توانید تغییر دهید', 'You can’t change your own access') : undefined}>
                      {Object.keys(ACCESS).map((k) => (
                        <option key={k} value={k}>
                          {lbl(ACCESS, k)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td font-mono text-xs" dir="ltr">{usernameOf(m)}</td>
                  <td className="td text-xs" dir="ltr">
                    {m.email || <span className="text-sub">—</span>}
                  </td>
                  <td className="td">
                    <select className="input h-9 w-40 text-xs" value={m.track || ''} onChange={(e) => setTeam(m.id, e.target.value)} aria-label={L('تیم', 'Team')}>
                      <option value="">{L('بدون تیم', 'No team')}</option>
                      {TRACKS.map((t) => <option key={t} value={t}>{lbl(TRACK, t)}</option>)}
                      {m.track && !TRACKS.includes(m.track) && <option value={m.track}>{m.track} {L('(تعریف‌نشده)', '(not defined)')}</option>}
                    </select>
                  </td>
                  <td className="td text-center text-xs num">
                    <span className={cx(late ? 'font-semibold text-bad' : 'text-sub')}>{fa(openN)}</span>
                    {late > 0 && <span className="text-bad"> · {L(`${fa(late)} معوق`, `${late} late`)}</span>}
                  </td>
                  <td className="td text-center">
                    <button
                      disabled={m.name === me}
                      onClick={() => upsert('Team', { ...m, active: off ? 'true' : 'false' })}
                      className={cx('relative h-6 w-11 rounded-full transition disabled:opacity-40', off ? 'bg-line-strong' : 'bg-good')}
                    >
                      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', off ? 'start-0.5' : 'start-[1.375rem]')} />
                    </button>
                  </td>
                  <td className="td text-end">
                    <button className="icon-btn h-8 w-8" onClick={() => password(m)} title={L('رمز ورود: تعیین یا ریست', 'Password: set or reset')} aria-label={L('رمز ورود', 'Password')}>
                      <KeyRound size={14} />
                    </button>
                    <button className="icon-btn h-8 w-8" onClick={() => open('Team', m as never)} title={L('ویرایش', 'Edit')}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ProjectsAdmin() {
  const { db, upsert } = useStore()
  const { open } = useEditor()
  const people = db.Team.filter((m) => String(m.active) !== 'false')
  return (
    <Card pad={false} eyebrow={L('پروژه‌ها', 'Projects')} title={L('مدیر محصول پروژه، کارفرما و وضعیت', 'Lead, client and status')}>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[52rem]">
          <thead className="border-b border-line">
            <tr>
              <th className="th">{L('پروژه', 'Project')}</th>
              <th className="th">{L('مدیر محصول پروژه', 'Lead')}</th>
              <th className="th">{L('کارفرما / رابط', 'Client / liaison')}</th>
              <th className="th">{L('وضعیت', 'Status')}</th>
              <th className="th text-center">{L('قرارداد', 'Contracts')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {db.Projects.map((p) => (
              <tr key={p.id} className="transition hover:bg-muted/30">
                <td className="td">
                  <Link to={`/projects/${p.id}`} className="text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  <div className="font-mono text-[0.625rem] text-sub" dir="ltr">
                    {p.code}
                  </div>
                </td>
                <td className="td">
                  <select className="input h-9 w-44 text-xs" value={p.owner} onChange={(e) => upsert('Projects', { ...p, owner: e.target.value })}>
                    <option value="">—</option>
                    {people.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="td text-xs">
                  <div className="font-medium">{p.client || <span className="text-sub">—</span>}</div>
                  {p.liaison && <div className="text-[0.6875rem] text-sub">{p.liaison}</div>}
                </td>
                <td className="td text-xs">{lbl(PROJECT_STATUS, p.status)}</td>
                <td className="td text-center text-xs num">{fa(db.Contracts.filter((c) => c.project_id === p.id).length)}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <PauseButton p={p} compact />
                    <button className="icon-btn h-8 w-8" onClick={() => open('Projects', p as never)} title={L('ویرایش', 'Edit')}>
                      <Pencil size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** Starting over: Mizito only, all work, or everything but people, contacts and settings. */
function WipeCard() {
  const { action, toast, refresh } = useStore()
  const [scope, setScope] = useState<'mizito' | 'work' | 'all'>('mizito')
  const [busy, setBusy] = useState(false)
  const what = {
    mizito: L('همه‌ی داده‌های میزیتو (تسک‌ها، منشن‌ها، گفتگوها و لاگشان)', 'All Mizito data'),
    work: L('همه‌ی کارها: تسک‌ها، پیگیری‌ها، جلسات، اسپرینت‌ها، برنامه‌ها، کارتابل‌ها، یادداشت‌ها، کامنت‌ها، لاگ و میزیتو', 'All work: tasks, follow-ups, meetings, sprints, plans, cartables, notes, comments, log and Mizito'),
    all: L('همه‌چیز جز افراد، اشخاص و تنظیمات (پروژه‌ها، OKR و شاخص‌ها هم)', 'Everything but people, contacts and settings (projects, OKRs and KPIs too)'),
  }
  const go = async () => {
    const word = L('پاک کن', 'delete')
    const typed = window.prompt(L(`پاک می‌شود: ${what[scope]}.\nبرگشت ندارد (فقط از تاریخچه‌ی نسخه‌های گوگل‌شیت).\n\nبرای تأیید بنویسید: ${word}`, `This deletes: ${what[scope]}. Type “${word}” to confirm.`))
    if (typed === null) return
    if (typed.trim() !== word) return toast(L('تأیید نشد؛ چیزی پاک نشد', 'Not confirmed; nothing deleted'), 'err')
    setBusy(true)
    try {
      await action('wipeData', { scope })
      toast(L('پاک شد؛ از اول شروع کنید', 'Deleted; start afresh'))
      await refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mt-4" eyebrow={L('داده‌ها', 'Data')} title={L('پاک کردن داده‌ها و شروع از صفر', 'Delete data and start over')}>
      <div className="space-y-2 text-sm">
        {(['mizito', 'work', 'all'] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-start gap-2">
            <input type="radio" className="mt-1.5" checked={scope === k} onChange={() => setScope(k)} />
            <span className="leading-7">{what[k]}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs leading-6 text-sub">{L('افراد، رمزها، اشخاص و رده‌ها و همه‌ی تنظیمات همیشه می‌مانند. اگر اشتباه شد، از File ← Version history در گوگل‌شیت برمی‌گردد.', 'People, passwords, contacts and settings always stay. If it was a mistake, restore from the sheet’s version history.')}</p>
      <button className="btn-outline btn-sm mt-3 border-bad/40 text-bad" disabled={busy} onClick={go}><Trash2 size={13} /> {busy ? L('در حال پاک کردن…', 'Deleting…') : L('پاک کردن', 'Delete')}</button>
    </Card>
  )
}
