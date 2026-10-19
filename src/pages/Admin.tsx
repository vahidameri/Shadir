import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Lock } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Segmented, StatStrip, Avatar, cx } from '../components/ui'
import { PauseButton } from '../components/PauseButton'
import Settings from './Settings'
import { OrgPage } from '../components/OrgSettings'
import { L, lbl } from '../lib/i18n'
import { ACCESS, PROJECT_STATUS, JOB_TITLE, TEAM_NAMES, teamCodes, usernameOf } from '../lib/labels'
import { capOf, memberWeek } from '../lib/capacity'
import { fa } from '../lib/jalali'
import type { Access } from '../lib/types'

type Tab = 'people' | 'org' | 'projects' | 'settings'

/** Back office — the program manager's control room: people & access, organisation, projects, settings.
 *  Contracts have their own page (/contracts) for the program manager and the CEO. */
export default function Admin({ initial = 'people' }: { initial?: Tab }) {
  const { db, access } = useStore()
  const { open } = useEditor()
  const [tab, setTab] = useState<Tab>(initial)
  const active = db.Team.filter((m) => String(m.active) !== 'false')
  return (
    <>
      <Band
        title={L('بک‌آفیس', 'Back office')}
        actions={
          <>
            <Segmented
              dark
              value={tab}
              onChange={setTab}
              options={[
                { value: 'people', label: L('افراد و دسترسی', 'People & access') },
                { value: 'org', label: L('سمت‌ها و سازمان', 'Titles & organisation') },
                { value: 'projects', label: L('پروژه‌ها', 'Projects') },
                { value: 'settings', label: L('تنظیمات', 'Settings') },
              ]}
            />
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
        {tab === 'org' && <OrgPage admin={access === 'super'} />}
        {tab === 'settings' && <Settings embedded />}
      </Overlap>
    </>
  )
}

function People() {
  const { db, upsert, me, toast } = useStore()
  const { open } = useEditor()
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
              <th className="th text-center">{L('بار / ظرفیت', 'Load / capacity')}</th>
              <th className="th text-center">{L('ورود', 'Sign-in')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {db.Team.map((m) => {
              const w = memberWeek(db, m)
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
                  <td className="td text-xs">{teamCodes(m.team).map((t) => lbl(TEAM_NAMES, t)).join(L('، ', ', ')) || '—'}</td>
                  <td className="td text-center text-xs num">
                    <span className={cx(w.load > 100 ? 'font-semibold text-bad' : 'text-sub')}>{fa(`${w.load}%`)}</span>
                    {capOf(m) !== 100 && <span className="text-sub"> / {fa(`${capOf(m)}%`)}</span>}
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
