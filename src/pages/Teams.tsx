// Teams: every unit of the department with its status and the projects under it.
// The list of teams (names, colours, order) is set in the back office.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Settings2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Overlap, SearchInput, Segmented, StatStrip } from '../components/ui'
import { L } from '../lib/i18n'
import { fa } from '../lib/jalali'
import { can } from '../lib/access'
import { allTeams, teamStats } from '../lib/teams'
import { TeamCard } from '../components/TeamParts'

export default function Teams() {
  const { db, canEdit, access } = useStore()
  const { open } = useEditor()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'order' | 'health' | 'late'>('order')
  const stats = useMemo(() => allTeams(db).map((id) => teamStats(db, id)), [db])
  const rank = { red: 0, amber: 1, green: 2 } as const
  const list = stats
    .filter((s) => !q || s.projects.some((p) => p.name.includes(q)) || s.members.some((m) => m.includes(q)))
    .sort((a, b) => (sort === 'health' ? rank[a.health] - rank[b.health] : sort === 'late' ? b.late + b.blocked - (a.late + a.blocked) : 0))
  const sum = (k: 'open' | 'late' | 'blocked' | 'doneRecent') => stats.reduce((a, s) => a + s[k], 0)
  return (
    <>
      <Band
        title={L('تیم‌ها', 'Teams')}
        sub={L('هر تیم با پروژه‌ها، افراد و وضعیت کارهایش', 'Every team with its projects, people and the state of its work')}
        actions={
          <>
            {access === 'super' && (
              <Link to="/admin?tab=org" className="btn h-10 w-10 bg-white/10 px-0 text-white hover:bg-white/20" title={L('تعریف تیم‌ها', 'Define teams')} aria-label={L('تعریف تیم‌ها', 'Define teams')}>
                <Settings2 size={17} />
              </Link>
            )}
            {canEdit && can.manage(access) && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Projects')}>
                <Plus size={16} /> {L('پروژه‌ی جدید', 'New project')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('تیم', 'Teams'), value: fa(stats.filter((s) => s.id).length) },
            { label: L('پروژه‌ی فعال', 'Active projects'), value: fa(db.Projects.filter((p) => p.status === 'active').length) },
            { label: L('تسک باز', 'Open tasks'), value: fa(sum('open')) },
            { label: L('معوق', 'Overdue'), value: fa(sum('late')), tone: sum('late') ? 'red' : 'green' },
            { label: L('مسدود', 'Blocked'), value: fa(sum('blocked')), tone: sum('blocked') ? 'amber' : 'green' },
            { label: L('انجام‌شده (۲ هفته)', 'Done (2 weeks)'), value: fa(sum('doneRecent')), tone: 'green' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
          <SearchInput value={q} onChange={setQ} placeholder={L('جستجوی پروژه یا فرد…', 'Search a project or person…')} />
          <Segmented value={sort} onChange={setSort} options={[{ value: 'order', label: L('ترتیب تعریف', 'As defined') }, { value: 'health', label: L('اول نیازمند توجه', 'Needs attention first') }, { value: 'late', label: L('بیشترین معوق و مسدود', 'Most late & blocked') }]} />
        </div>
        <div className="stagger grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
          {list.map((s) => <TeamCard key={s.id || '-'} id={s.id} stats={s} />)}
        </div>
      </Overlap>
    </>
  )
}
