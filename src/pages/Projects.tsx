import { useState } from 'react'
import { Plus, Archive } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ArchiveButton } from '../components/ArchiveButton'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Toolbar, FilterSelect, Empty, SearchInput, Segmented } from '../components/ui'
import { ProjectCard } from '../components/shared'
import { PRIORITY, PROJECT_STATUS, HEALTH, options } from '../lib/labels'
import { projectMetrics } from '../lib/metrics'
import { fa, fmtDate } from '../lib/jalali'
import { L, lbl, useI18n } from '../lib/i18n'
import { TRACK, TRACKS } from '../lib/tracks'
import { usePins } from '../lib/prefs'

export default function Projects() {
  const { db, archived, canEdit: editor, access } = useStore()
  const canEdit = editor && can.manage(access)
  const { lang } = useI18n()
  const { open } = useEditor()
  const { pins } = usePins()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'all' | 'pinned' | 'archived'>('all')
  const [status, setStatus] = useState('active')
  const [cat, setCat] = useState('')
  const [prio, setPrio] = useState('')
  const [health, setHealth] = useState('')
  const [owner, setOwner] = useState('')

  const owners = Array.from(new Set(db.Projects.map((p) => p.owner).filter(Boolean)))
  const list = db.Projects.filter(
    (p) =>
      (scope === 'all' || pins.includes(p.id)) &&
      (!status || p.status === status) &&
      (!cat || (p.team || '') === cat) &&
      (!prio || p.priority === prio) &&
      (!owner || p.owner === owner) &&
      (!health || projectMetrics(p, db).health === health) &&
      (!q || p.name.includes(q) || p.code.toLowerCase().includes(q.toLowerCase())),
  )

  return (
    <>
      <Band
        title={can.portfolio(access) ? L('پروژه‌ها', 'Projects') : L('پروژه‌های من', 'My projects')}
        sub={L(`${fa(list.length)} از ${fa(db.Projects.length)} پروژه`, `${list.length} of ${db.Projects.length} projects`)}
        actions={
          canEdit && (
            <button className="btn h-10 bg-white text-band" onClick={() => open('Projects')}>
              <Plus size={16} /> {L('پروژه‌ی جدید', 'New project')}
            </button>
          )
        }
      />
      <Overlap>
        <div className="card mb-5 p-3">
          <Toolbar className="!mb-0">
            <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: L('همه', 'All') }, { value: 'pinned', label: L(`پین‌شده · ${fa(pins.length)}`, `Pinned · ${pins.length}`) }, ...(archived.length ? [{ value: 'archived' as const, label: L(`آرشیو · ${fa(archived.length)}`, `Archive · ${archived.length}`) }] : [])]} />
            <SearchInput value={q} onChange={setQ} />
            <FilterSelect value={status} onChange={setStatus} placeholder={L('همه‌ی وضعیت‌ها', 'Any status')} options={options(PROJECT_STATUS, lang)} />
            <FilterSelect value={health} onChange={setHealth} placeholder={L('سلامت', 'Health')} options={options(HEALTH, lang)} />
            <FilterSelect value={prio} onChange={setPrio} placeholder={L('اولویت', 'Priority')} options={options(PRIORITY, lang)} />
            <FilterSelect value={cat} onChange={setCat} placeholder={L('همه‌ی تیم‌ها', 'All teams')} options={TRACKS.map((t) => ({ value: t, label: lbl(TRACK, t) }))} />
            <FilterSelect value={owner} onChange={setOwner} placeholder={L('مدیر محصول پروژه', 'Lead')} options={owners.map((c) => ({ value: c, label: c }))} />
          </Toolbar>
        </div>
        {scope === 'archived' ? (
          <Card pad={false}>
            {!archived.length ? (
              <Empty text={L('پروژه‌ی آرشیوشده‌ای نیست', 'No archived projects')} />
            ) : (
              <ul className="divide-y divide-line">
                {archived.filter((p) => !q || p.name.includes(q) || p.code.toLowerCase().includes(q.toLowerCase())).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <Archive size={16} className="text-sub" />
                    <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-sub">
                        <span dir="ltr">{p.code}</span> · {p.owner || '—'} · {L(`آرشیو از ${fmtDate(p.archived_at || '')}`, `archived ${fmtDate(p.archived_at || '')}`)}
                      </div>
                    </Link>
                    <ArchiveButton p={p} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : list.length === 0 ? (
          <div className="card">
            <Empty text={L('پروژه‌ای با این فیلترها پیدا نشد', 'No projects match these filters')} />
          </div>
        ) : (
          <div className="stagger grid gap-4 @md:grid-cols-2 @xl:grid-cols-3 @2xl:grid-cols-4">
            {list.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </Overlap>
    </>
  )
}
