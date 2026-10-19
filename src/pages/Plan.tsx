import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Segmented, StatStrip, FilterSelect, cx, Avatar } from '../components/ui'
import { DeliverableChip, DeliverableRow, DeliveryEmpty, stateBar } from '../components/delivery'
import { WeekNav } from '../components/WeekNav'
import { addDays, fa, todayISO } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import { deliveryState, deliverySummary, deliveryTrack, isClosed, isOverdue } from '../lib/delivery'
import { inWeek, weekLabel, weekRel, weekStart, weeksFrom } from '../lib/weeks'
import { TRACK, TRACKS } from '../lib/tracks'
import { usePref } from '../lib/prefs'
import type { Deliverable, Track } from '../lib/types'

const WEEKS = 8

/** Delivery plan: what lands in which week, per project, with slippage against the baseline. */
export default function Plan() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const ws0 = weekStart()
  const [view, setView] = usePref<'timeline' | 'list'>('acg.plan.view', window.innerWidth < 768 ? 'list' : 'timeline')
  const [from, setFrom] = useState(addDays(ws0, -7))
  const [project, setProject] = useState('')
  const [track, setTrack] = useState<Track | ''>('')
  const [owner, setOwner] = useState('')

  const sum = deliverySummary(db)
  const pass = (d: Deliverable) => (!project || d.project_id === project) && (!track || deliveryTrack(d, db) === track) && (!owner || d.owner === owner) && d.status !== 'dropped'
  const items = db.Deliverables.filter(pass)

  const thisWeek = sum.list.filter((d) => inWeek(d.target_date, ws0) && d.status !== 'dropped')
  const nextWeek = sum.open.filter((d) => inWeek(d.target_date, addDays(ws0, 7)))
  const next30 = sum.open.filter((d) => d.target_date >= today && d.target_date <= addDays(today, 30))
  const doneThisWeek = thisWeek.filter((d) => d.status === 'delivered').length

  const weeks = weeksFrom(from, WEEKS)
  const owners = Array.from(new Set(db.Deliverables.map((d) => d.owner).filter(Boolean)))

  return (
    <>
      <Band nav={<HubNav hub="plan" />}
        title={L('برنامه‌ی تحویل', 'Delivery plan')}
        actions={
          canEdit && (
            <button className="btn h-10 bg-white text-band" onClick={() => open('Deliverables', { project_id: project })}>
              <Plus size={16} /> {L('خروجی جدید', 'New deliverable')}
            </button>
          )
        }
      >
        <StatStrip
          items={[
            { label: L('این هفته', 'This week'), value: fa(thisWeek.length), sub: L(`${fa(doneThisWeek)} تحویل شد`, `${doneThisWeek} delivered`) },
            { label: L('هفته‌ی بعد', 'Next week'), value: fa(nextWeek.length) },
            { label: L('۳۰ روز آینده', 'Next 30 days'), value: fa(next30.length) },
            { label: L('عقب‌افتاده', 'Overdue'), value: fa(sum.overdue.length), tone: sum.overdue.length ? 'red' : 'green' },
            { label: L('جابجا شده از تعهد اولیه', 'Moved from baseline'), value: fa(sum.slipped.length), tone: sum.slipped.length ? 'amber' : 'green' },
            {
              label: L('تحویل به‌موقع (۹۰ روز)', 'On-time (90 days)'),
              value: sum.onTimeRate === null ? '—' : `${fa(`${sum.onTimeRate}%`)}`,
              tone: sum.onTimeRate === null ? undefined : sum.onTimeRate >= 80 ? 'green' : sum.onTimeRate >= 60 ? 'amber' : 'red',
              sub: L(`${fa(sum.delivered90.length)} تحویل`, `${sum.delivered90.length} delivered`),
            },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'timeline', label: L('جدول زمانی', 'Timeline') },
                { value: 'list', label: L('فهرست هفتگی', 'By week') },
              ]}
            />
            <FilterSelect value={project} onChange={setProject} placeholder={L('همه‌ی پروژه‌ها', 'All projects')} options={db.Projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={track} onChange={(v) => setTrack(v as Track | '')} placeholder={L('همه‌ی واحدها', 'All units')} options={TRACKS.map((t) => ({ value: t, label: lbl(TRACK, t) }))} />
            <FilterSelect value={owner} onChange={setOwner} placeholder={L('همه‌ی مسئولان', 'All owners')} options={owners.map((o) => ({ value: o, label: o }))} />
            {view === 'timeline' && (
              <div className="ms-auto">
                <WeekNav ws={from} onChange={setFrom} dark={false} />
              </div>
            )}
          </div>
          {view === 'timeline' ? <Timeline items={items} weeks={weeks} /> : <WeekList items={items} />}
        </Card>
        <Legend />
      </Overlap>
    </>
  )
}

function Timeline({ items, weeks }: { items: Deliverable[]; weeks: string[] }) {
  const { db } = useStore()
  const ws0 = weekStart()
  const end = addDays(weeks[weeks.length - 1], 6)
  const visible = items.filter((d) => d.target_date >= weeks[0] && d.target_date <= end)
  const projects = db.Projects.filter((p) => visible.some((d) => d.project_id === p.id) || (p.status === 'active' && items.some((d) => d.project_id === p.id)))
  const perWeek = weeks.map((w) => visible.filter((d) => inWeek(d.target_date, w)))
  const max = Math.max(1, ...perWeek.map((l) => l.length))
  if (!projects.length) return <DeliveryEmpty />
  return (
    <div className="overflow-x-auto border-t border-line">
      <div className="grid min-w-[62rem]" style={{ gridTemplateColumns: `minmax(8.5rem,13rem) repeat(${weeks.length}, minmax(7.5rem,1fr))` }}>
        {/* header */}
        <div className="sticky start-0 z-10 border-b border-line bg-surface px-4 py-3 text-[0.6875rem] font-medium text-sub">{L('پروژه', 'Project')}</div>
        {weeks.map((w, i) => (
          <div key={w} className={cx('border-b border-s border-line px-2 py-2.5 text-center', w === ws0 && 'bg-brand/[0.06]')}>
            <div className={cx('text-xs font-semibold', w === ws0 ? 'text-brand dark:text-brand-soft' : '')}>{weekRel(w)}</div>
            <div className="text-[0.625rem] text-sub num">{weekLabel(w)}</div>
            {/* load bar: how many things land this week */}
            <div className="mx-auto mt-2 flex h-1.5 w-full max-w-[5rem] overflow-hidden rounded-full bg-muted">
              {(['delivered', 'in_progress', 'at_risk', 'overdue', 'planned'] as const).map((s) => {
                const n = perWeek[i].filter((d) => deliveryState(d) === s).length
                return n ? <span key={s} className={stateBar[s]} style={{ width: `${(n / max) * 100}%` }} /> : null
              })}
            </div>
            <div className="mt-1 text-[0.625rem] text-sub num">{fa(perWeek[i].length)}</div>
          </div>
        ))}
        {/* rows */}
        {projects.map((p) => (
          <div key={p.id} className="contents">
            <div className="sticky start-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface px-4 py-3">
              <Avatar name={p.owner} size="sm" />
              <Link to={`/projects/${p.id}`} className="min-w-0 hover:underline">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="truncate text-[0.6875rem] text-sub">{p.owner}</div>
              </Link>
            </div>
            {weeks.map((w) => {
              const cell = visible.filter((d) => d.project_id === p.id && inWeek(d.target_date, w))
              return (
                <div key={w} className={cx('space-y-1.5 border-b border-s border-line p-1.5', w === ws0 && 'bg-brand/[0.04]')}>
                  {cell.map((d) => (
                    <DeliverableChip key={d.id} d={d} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function WeekList({ items }: { items: Deliverable[] }) {
  const today = todayISO()
  const ws0 = weekStart()
  const groups = useMemo(() => {
    const open = items.filter((d) => !isClosed(d))
    const g: { key: string; title: string; sub?: string; list: Deliverable[]; tone?: 'red' }[] = []
    const overdue = open.filter(isOverdue)
    if (overdue.length) g.push({ key: 'overdue', title: L('عقب‌افتاده', 'Overdue'), list: overdue, tone: 'red' })
    weeksFrom(ws0, WEEKS).forEach((w) => {
      const list = items.filter((d) => inWeek(d.target_date, w) && !(isOverdue(d)) && (d.status !== 'delivered' || w === ws0))
      g.push({ key: w, title: weekRel(w), sub: weekLabel(w), list })
    })
    const later = open.filter((d) => d.target_date > addDays(ws0, WEEKS * 7 - 1))
    if (later.length) g.push({ key: 'later', title: L('بعدتر', 'Later'), list: later })
    const recent = items.filter((d) => d.status === 'delivered' && d.delivered_date >= addDays(today, -21) && !inWeek(d.target_date, ws0))
    if (recent.length) g.push({ key: 'recent', title: L('تحویل‌شده در ۳ هفته‌ی اخیر', 'Delivered in the last 3 weeks'), list: recent })
    return g
  }, [items, today, ws0])
  return (
    <div className="border-t border-line">
      {groups.map((g) => (
        <section key={g.key}>
          <header className={cx('flex items-baseline gap-2 border-b border-line bg-muted/40 px-5 py-2', g.tone === 'red' && 'bg-bad/[0.05]')}>
            <h4 className={cx('text-xs font-semibold', g.tone === 'red' && 'text-bad')}>{g.title}</h4>
            {g.sub && <span className="text-[0.6875rem] text-sub num">{g.sub}</span>}
            <span className="ms-auto text-[0.6875rem] text-sub num">{fa(g.list.length)}</span>
          </header>
          {g.list.length ? (
            <div className="divide-y divide-line">
              {g.list
                .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
                .map((d) => (
                  <DeliverableRow key={d.id} d={d} />
                ))}
            </div>
          ) : (
            <div className="px-5 py-3 text-xs text-sub">{L('چیزی برای این هفته برنامه‌ریزی نشده', 'Nothing planned this week')}</div>
          )}
        </section>
      ))}
    </div>
  )
}

function Legend() {
  const items: [keyof typeof stateBar, string][] = [
    ['planned', L('برنامه‌ریزی‌شده', 'Planned')],
    ['in_progress', L('در جریان', 'In progress')],
    ['at_risk', L('در خطر', 'At risk')],
    ['overdue', L('عقب‌افتاده', 'Overdue')],
    ['delivered', L('تحویل شد', 'Delivered')],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[0.6875rem] text-sub">
      {items.map(([k, t]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cx('h-2 w-2 rounded-full', stateBar[k])} />
          {t}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8a1c3c]" /> {L('پروداکت', 'Product')}
        <span className="ms-2 h-1.5 w-1.5 rounded-full bg-[#1D4F61]" /> {L('تک', 'Tech')}
      </span>
    </div>
  )
}
