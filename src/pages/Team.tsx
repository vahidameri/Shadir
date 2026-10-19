import { isAssignee } from '../lib/assignees'
import { useState } from 'react'
import { JOB_TITLE, TEAM_NAMES, teamCodes } from '../lib/labels'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Avatar, cx, StatStrip, Segmented, Tabs } from '../components/ui'
import { addDays, fa, fmtDayMonth } from '../lib/jalali'
import { isTaskOverdue } from '../lib/metrics'
import { L, lbl } from '../lib/i18n'
import { allocActive, capOf, fte, loadTone, memberWeek, trackWeek, type WeekLoad } from '../lib/capacity'
import { uid } from '../lib/api'
import { weekLabel, weekRel, weekStart, weeksFrom } from '../lib/weeks'
import { TRACK, TRACKS } from '../lib/tracks'
import { usePref } from '../lib/prefs'
import type { Member, Track } from '../lib/types'

const HORIZON = 12
const toneText = { red: 'text-bad', amber: 'text-warn', green: 'text-good', muted: 'text-sub' }
const toneCell = {
  red: 'bg-bad text-white',
  amber: 'bg-warn/80 text-white',
  green: 'bg-good/15 text-good',
  muted: 'bg-muted text-sub',
}
const PALETTE = ['#1D4F61', '#6A0421', '#3c7d8f', '#b0475f', '#7a96a3', '#d0838f', '#2b6a5a', '#8b6f47', '#58508d', '#bc5090', '#4f7cac']

export default function Team() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [tab, setTab] = usePref<'people' | 'timeline' | 'matrix'>('acg.capacity.tab2', 'matrix')
  const [track, setTrack] = useState<string>('all')
  const ws0 = weekStart()
  const weeks = weeksFrom(ws0, HORIZON)

  const people = db.Team.filter((m) => track === 'all' || teamCodes(m.team, m.role, m.track).includes(track))
  const now = people.map((m) => ({ m, w: memberWeek(db, m, ws0) }))
  const available = now.reduce((s, r) => s + r.w.available, 0)
  const allocated = now.reduce((s, r) => s + r.w.allocated, 0)
  const over = now.filter((r) => r.w.load > 100)

  // Forecast: the first upcoming week a track goes over capacity
  const forecast = TRACKS
    .map((t) => {
      const hit = weeks.slice(1).map((w) => trackWeek(db, t, w)).find((x) => x.load > 100)
      return hit ? { t, hit } : null
    })
    .filter(Boolean) as { t: Track; hit: ReturnType<typeof trackWeek> }[]

  const sentence = [
    over.length ? L(`این هفته ${fa(over.length)} نفر بیش از ظرفیت‌اند`, `${over.length} over capacity this week`) : L('این هفته کسی بیش از ظرفیت نیست', 'Nobody is over capacity this week'),
    ...forecast.map(({ t, hit }) =>
      L(`تیم ${lbl(TRACK, t)} از ${weekRel(hit.ws)} به ${fa(hit.load)}٪ می‌رسد`, `${lbl(TRACK, t)} reaches ${hit.load}% ${weekRel(hit.ws).toLowerCase()}`),
    ),
  ].join(L('؛ ', '; '))

  return (
    <>
      <Band
        title={L('ظرفیت و منابع', 'Capacity & resourcing')}
        sub={sentence + '.'}
        actions={
          canEdit && (
            <>
              <button className="btn h-10 border border-white/15 text-white" onClick={() => open('Allocations')}>
                <Plus size={16} /> {L('تخصیص', 'Allocation')}
              </button>
              <button className="btn h-10 bg-white text-band" onClick={() => open('Team')}>
                <Plus size={16} /> {L('عضو جدید', 'New member')}
              </button>
            </>
          )
        }
      >
        <StatStrip
          items={[
            { label: L('ظرفیت این هفته', 'Capacity this week'), value: fa(fte(available)), sub: L('نفر تمام‌وقت', 'full-time people') },
            { label: L('تخصیص‌یافته', 'Allocated'), value: fa(fte(allocated)), sub: L(`${fa(available ? Math.round((allocated / available) * 100) : 0)}٪ از ظرفیت`, `${available ? Math.round((allocated / available) * 100) : 0}% of capacity`) },
            { label: L('ظرفیت آزاد', 'Free capacity'), value: fa(fte(Math.max(0, available - allocated))), tone: available - allocated <= 0 ? 'red' : undefined },
            { label: L('بیش از ظرفیت', 'Over capacity'), value: fa(over.length), tone: over.length ? 'red' : 'green' },
            { label: L('پروژه‌های متوقف', 'Paused projects'), value: fa(db.Projects.filter((p) => p.status === 'on_hold').length), sub: L('ظرفیت مصرف نمی‌کنند', 'use no capacity') },
            { label: L('افراد', 'People'), value: fa(people.length) },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <div className="grid gap-4 @xl:grid-cols-2">
          {TRACKS.map((t) => (
            <TrackCard key={t} track={t} weeks={weeks} />
          ))}
        </div>

        <Card pad={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'matrix', label: L('تخصیص منابع', 'Allocation planner') },
                { value: 'people', label: L('افراد', 'People') },
                { value: 'timeline', label: L(`پیش‌بینی ${fa(HORIZON)} هفته`, `${HORIZON}-week forecast`) },
              ]}
            />
            <Segmented
              value={track}
              onChange={setTrack}
              options={[
                { value: 'all', label: L('همه', 'All') },
                ...Object.keys(TEAM_NAMES).filter((k) => db.Team.some((m) => teamCodes(m.team).includes(k))).map((k) => ({ value: k, label: lbl(TEAM_NAMES, k) })),
              ]}
            />
          </div>
          {tab === 'people' && <PeopleGrid people={people} />}
          {tab === 'timeline' && <Timeline people={people} weeks={weeks} />}
          {tab === 'matrix' && <Matrix people={people} />}
        </Card>
      </Overlap>
    </>
  )
}

function TrackCard({ track, weeks }: { track: Track; weeks: string[] }) {
  const { db } = useStore()
  const rows = weeks.map((w) => trackWeek(db, track, w))
  const cur = rows[0]
  const peak = rows.reduce((a, b) => (b.load > a.load ? b : a), rows[0])
  const tone = loadTone(cur.load)
  const top = Math.max(120, ...rows.map((r) => r.load))
  return (
    <Card
      eyebrow={L(`تیم ${lbl(TRACK, track)}`, `${lbl(TRACK, track)} track`)}
      title={L(`${fa(cur.people)} نفر · ظرفیت این هفته معادل ${fa(fte(cur.available))} نفر تمام‌وقت`, `${cur.people} people · ${fte(cur.available)} full-time this week`)}
      action={<span className={cx('display text-3xl num', toneText[tone])}>{fa(`${cur.load}%`)}</span>}
    >
      <div className="relative flex h-28 items-end gap-1.5">
        {/* 100% line */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/25" style={{ bottom: `${(100 / top) * 100}%` }}>
          <span className="absolute -top-4 end-0 text-[0.625rem] text-sub">{fa('100%')}</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.ws} className="group relative flex h-full flex-1 flex-col justify-end" title={`${weekLabel(r.ws)} — ${r.load}%`}>
            <div
              className={cx('rounded-t-md transition-all', r.load > 100 ? 'bg-bad' : r.load >= 85 ? 'bg-warn' : 'bg-brand dark:bg-[#7fb3c4]')}
              style={{ height: `${(Math.min(r.load, top) / top) * 100}%`, opacity: i === 0 ? 1 : 0.7 }}
            />
            <span className="pointer-events-none absolute -top-5 start-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 text-[0.625rem] text-surface num group-hover:block">{fa(`${r.load}%`)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.625rem] text-sub num">
        <span>{weekRel(weeks[0])}</span>
        <span>{weekLabel(weeks[weeks.length - 1])}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-sub">
        <span>
          {L('تخصیص‌یافته', 'Allocated')}: <b className="text-ink num">{fa(fte(cur.allocated))}</b> {L('نفر', 'people')}
        </span>
        <span>
          {L('اوج', 'Peak')}: <b className={cx('num', toneText[loadTone(peak.load)])}>{fa(`${peak.load}%`)}</b> {weekRel(peak.ws)}
        </span>
        {cur.over > 0 && <span className="text-bad">{L(`${fa(cur.over)} نفر بیش از ظرفیت`, `${cur.over} over capacity`)}</span>}
      </div>
    </Card>
  )
}

function useColors() {
  const { db } = useStore()
  return (pid: string) => PALETTE[Math.max(0, db.Projects.findIndex((p) => p.id === pid)) % PALETTE.length]
}

function PeopleGrid({ people }: { people: Member[] }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const color = useColors()
  const rows = people.map((m) => ({ m, w: memberWeek(db, m) })).sort((a, b) => b.w.load - a.w.load)
  return (
    <div className="grid gap-3 border-t border-line p-4 @lg:grid-cols-2 @2xl:grid-cols-3">
      {rows.map(({ m, w }) => {
        const tone = loadTone(w.load)
        const tasks = db.Tasks.filter((t) => isAssignee(t, m.name) && t.status !== 'done')
        const base = Math.max(w.available, w.allocated, 1)
        return (
          <div key={m.id} className="rounded-2xl border border-line p-4 transition hover:border-line-strong">
            <div className="flex items-start gap-3">
              <Link to={`/people/${m.id}`}>
                <Avatar name={m.name} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/people/${m.id}`} className="block truncate text-start text-sm font-semibold hover:underline">
                  {m.name}
                </Link>
                <div className="truncate text-[0.6875rem] text-sub">
                  {lbl(JOB_TITLE, m.role)}
                  {capOf(m) !== 100 && ` · ${L(`ظرفیت ${fa(capOf(m))}٪`, `${capOf(m)}% capacity`)}`}
                </div>
              </div>
              <div className="text-end">
                <div className={cx('display text-2xl leading-none num', toneText[tone])}>{fa(`${w.load}%`)}</div>
                <div className="mt-1 text-[0.625rem] text-sub">{w.free >= 0 ? L(`${fa(w.free)}٪ آزاد`, `${w.free}% free`) : L(`${fa(-w.free)}٪ اضافه`, `${-w.free}% over`)}</div>
              </div>
            </div>
            {/* stacked allocation bar against availability */}
            <div className="relative mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
              {w.projects.map((p) => (
                <span key={p.project_id} style={{ width: `${(p.percent / base) * 100}%`, background: color(p.project_id) }} />
              ))}
              {w.available < base && <span className="absolute inset-y-0 border-s-2 border-surface" style={{ insetInlineStart: `${(w.available / base) * 100}%` }} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {w.projects.length ? (
                w.projects.map((p) => {
                  const a = db.Allocations.find((x) => x.member_id === m.id && x.project_id === p.project_id)
                  const proj = db.Projects.find((x) => x.id === p.project_id)
                  return (
                    <button
                      key={p.project_id}
                      onClick={() => canEdit && a && open('Allocations', a as never)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[0.6875rem] hover:border-line-strong"
                      title={a?.end_date ? L(`تا ${fmtDayMonth(a.end_date)}`, `until ${fmtDayMonth(a.end_date)}`) : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: color(p.project_id) }} />
                      {proj?.name || p.project_id}
                      <span className="text-sub num">{fa(`${p.percent}%`)}</span>
                    </button>
                  )
                })
              ) : (
                <span className="text-[0.6875rem] text-sub">{L('تخصیصی ندارد', 'No allocations')}</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[0.6875rem] text-sub">
              <Link to={`/tasks?assignee=${encodeURIComponent(m.name)}`} className="hover:text-ink">
                {L(`${fa(tasks.length)} تسک باز`, `${tasks.length} open tasks`)}
                {tasks.filter(isTaskOverdue).length > 0 && <span className="text-bad"> · {L(`${fa(tasks.filter(isTaskOverdue).length)} معوق`, `${tasks.filter(isTaskOverdue).length} overdue`)}</span>}
              </Link>
              {canEdit && (
                <button className="ms-auto font-medium text-ink hover:underline" onClick={() => open('Allocations', { member_id: m.id })}>
                  + {L('تخصیص', 'Allocate')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Timeline({ people, weeks }: { people: Member[]; weeks: string[] }) {
  const { db } = useStore()
  const { open } = useEditor()
  const ws0 = weekStart()
  const name = (pid: string) => db.Projects.find((p) => p.id === pid)?.name || pid
  const tip = (w: WeekLoad) =>
    [`${weekLabel(w.ws)}: ${w.load}%`, ...w.projects.map((p) => `${name(p.project_id)} ${p.percent}%`)].filter(Boolean).join('\n')
  return (
    <div className="overflow-x-auto border-t border-line">
      <table className="w-full min-w-[60rem]">
        <thead className="border-b border-line">
          <tr>
            <th className="th sticky start-0 z-10 bg-surface">{L('عضو', 'Member')}</th>
            {weeks.map((w) => (
              <th key={w} className={cx('th px-1 text-center', w === ws0 && 'text-brand dark:text-brand-soft')}>
                <div>{w === ws0 ? weekRel(w) : fmtDayMonth(w)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {people.map((m) => (
            <tr key={m.id}>
              <td className="td sticky start-0 z-10 bg-surface">
                <button className="flex items-center gap-2.5 text-start" onClick={() => open('Team', m as never)}>
                  <Avatar name={m.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block max-w-[10rem] truncate text-sm font-medium">{m.name}</span>
                    <span className="block text-[0.6875rem] text-sub">{lbl(JOB_TITLE, m.role)}</span>
                  </span>
                </button>
              </td>
              {weeks.map((ws) => {
                const w = memberWeek(db, m, ws)
                return (
                  <td key={ws} className="px-1 py-1.5">
                    <div className={cx('relative grid h-10 min-w-[3.25rem] place-items-center rounded-xl text-xs font-semibold num', toneCell[loadTone(w.load)], !w.allocated && 'opacity-60')} title={tip(w)}>
                      {w.allocated ? `${fa(`${w.load > 999 ? 999 : w.load}%`)}` : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-4 border-t border-line px-5 py-3 text-[0.6875rem] text-sub">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-good/30" /> {L('زیر ۸۵٪', 'Under 85%')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-warn/80" /> {L('۸۵ تا ۱۰۰٪', '85–100%')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-bad" /> {L('بیش از ظرفیت', 'Over capacity')}</span>
        <span>{L(`تا ${fmtDayMonth(addDays(weeks[weeks.length - 1], 6))}`, `through ${fmtDayMonth(addDays(weeks[weeks.length - 1], 6))}`)}</span>
      </div>
    </div>
  )
}

/** Allocation planner: people × projects, edit a cell and totals, load and overloads update live. */
function Matrix({ people }: { people: Member[] }) {
  const { db, canEdit, upsert, remove, toast } = useStore()
  const { open } = useEditor()
  const ws0 = weekStart()
  const projects = db.Projects.filter((p) => p.status === 'active' || p.status === 'planning' || p.status === 'on_hold').sort((a, b) => (a.status === 'on_hold' ? 1 : 0) - (b.status === 'on_hold' ? 1 : 0))
  const [edit, setEdit] = useState<{ m: string; p: string; v: string } | null>(null)
  // the allocation that applies now (or the next one to start)
  const cellAlloc = (mid: string, pid: string) => {
    const list = db.Allocations.filter((x) => x.member_id === mid && x.project_id === pid && (!x.end_date || x.end_date >= ws0)).sort((a, b) => ((a.start_date || '') < (b.start_date || '') ? -1 : 1))
    return list.find((x) => allocActive(x, ws0)) || list[0]
  }
  const commit = async () => {
    if (!edit) return
    const v = Math.max(0, Math.min(600, Math.round(Number(edit.v) || 0)))
    const a = cellAlloc(edit.m, edit.p)
    setEdit(null)
    if (a && v === Number(a.percent)) return
    if (a && v === 0) await remove('Allocations', a.id)
    else if (a) await upsert('Allocations', { ...a, percent: v })
    else if (v > 0) await upsert('Allocations', { id: uid('A'), member_id: edit.m, project_id: edit.p, percent: v, start_date: '', end_date: '' })
    else return
    toast(L('تخصیص به‌روز شد', 'Allocation updated'))
  }
  const cellTone = (v: number, paused: boolean) => (paused ? 'bg-muted text-sub line-through' : v === 0 ? '' : v >= 60 ? 'bg-ink text-surface' : v >= 30 ? 'bg-ink/45 text-surface' : 'bg-ink/[0.12] text-ink')
  const colTotal = (pid: string) => people.reduce((s, m) => s + (Number(cellAlloc(m.id, pid)?.percent) || 0), 0)
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[0.6875rem] text-sub">
        <span className="inline-flex items-center gap-1">● {L('بازه‌ی زمانی دارد', 'has a date window')}</span>
        <span className="line-through">{L('پروژه‌ی متوقف — ظرفیت مصرف نمی‌کند', 'paused project — uses no capacity')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem]">
          <thead className="border-y border-line">
            <tr>
              <th className="th sticky start-0 z-10 bg-surface">{L('عضو', 'Member')}</th>
              {projects.map((p) => (
                <th key={p.id} className={cx('th text-center', p.status === 'on_hold' && 'opacity-50')}>
                  <Link to={`/projects/${p.id}`} className="font-mono hover:text-ink" title={p.name} dir="ltr">
                    {p.code}
                  </Link>
                </th>
              ))}
              <th className="th text-center">{L('بار این هفته', 'Load now')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((m) => {
              const w = memberWeek(db, m)
              return (
                <tr key={m.id} className="transition hover:bg-muted/30">
                  <td className="td sticky start-0 z-10 bg-surface">
                    <Link to={`/people/${m.id}`} className="flex items-center gap-3 text-start">
                      <Avatar name={m.name} size="sm" />
                      <span className="max-w-[10rem] truncate text-sm font-medium hover:underline">{m.name}</span>
                    </Link>
                  </td>
                  {projects.map((p) => {
                    const a = cellAlloc(m.id, p.id)
                    const v = Number(a?.percent) || 0
                    const editing = edit?.m === m.id && edit.p === p.id
                    return (
                      <td key={p.id} className="px-1 py-1.5 text-center">
                        {editing ? (
                          <input
                            autoFocus
                            dir="ltr"
                            inputMode="numeric"
                            className="h-10 w-full min-w-[3.25rem] rounded-xl border border-brand bg-surface text-center text-xs font-semibold num outline-none ring-2 ring-brand/25"
                            value={edit.v}
                            onChange={(e) => setEdit({ ...edit, v: e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) })}
                            onBlur={commit}
                            onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setEdit(null))}
                          />
                        ) : (
                          <button
                            onClick={() => canEdit && setEdit({ m: m.id, p: p.id, v: v ? String(v) : '' })}
                            onDoubleClick={() => canEdit && a && open('Allocations', a as never)}
                            className={cx('h-10 w-full min-w-[3.25rem] rounded-xl text-xs font-semibold num transition hover:ring-2 hover:ring-brand/40', cellTone(v, p.status === 'on_hold'), !v && 'bg-muted/50 text-transparent hover:text-sub')}
                            title={a && (a.start_date || a.end_date) ? `${a.start_date ? fmtDayMonth(a.start_date) : '…'} – ${a.end_date ? fmtDayMonth(a.end_date) : '…'}` : undefined}
                          >
                            {v ? `${fa(`${v}%`)}` : '+'}
                            {a && (a.start_date || a.end_date) && <span className="ms-0.5 align-super text-[0.5rem]">●</span>}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="td text-center">
                    <span className={cx('rounded-full px-2.5 py-1 text-sm font-semibold num', w.load > 100 ? 'bg-bad/10 text-bad' : w.load >= 85 ? 'bg-warn/12 text-warn' : 'text-sub')}>{fa(`${w.load}%`)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-line">
            <tr>
              <td className="td sticky start-0 z-10 bg-surface text-xs font-medium text-sub">{L('جمع (نفر تمام‌وقت)', 'Total (full-time people)')}</td>
              {projects.map((p) => (
                <td key={p.id} className="px-1 py-2 text-center text-xs font-semibold num">
                  {fa(fte(colTotal(p.id)))}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
