// Team plans (roadmap) for teams that work without sprints: every item on a quarter timeline, with
// its progress, how it stands against its own window, and how far its end has moved.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileBarChart, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Empty, HealthDot, Overlap, Progress, Segmented, StatStrip, cx } from '../components/ui'
import { teamName } from '../components/TeamParts'
import { PlanSheet, PlanStatusChip } from '../components/PlanParts'
import { L, locale, tr } from '../lib/i18n'
import { addDays, daysBetween, fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { allTeams } from '../lib/teams'
import { CONF, addQuarter, elapsed, quarterLabel, quarterOf, quarterRange } from '../lib/okr'
import { PLAN_KIND, isLate, planHealth, planOpen, planProgress, plansIn, slipDays } from '../lib/plans'
import { sprintCfg } from '../lib/sprints'
import type { PlanItem } from '../lib/types'

const HEX = { on_track: 'rgb(var(--ink) / 0.75)', at_risk: 'rgb(var(--warn))', off_track: 'rgb(var(--bad))' }

export default function Plan() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(quarterOf)
  const [view, setView] = useState<'timeline' | 'list'>('timeline')
  const sprintTeams = sprintCfg().teams
  // design, product and other non-sprint teams first; sprint teams can still keep a plan
  const teams = allTeams(db).filter(Boolean).sort((a, b) => Number(sprintTeams.includes(a)) - Number(sprintTeams.includes(b)))
  const only = params.get('team') || ''
  const openId = params.get('id') || ''
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }
  const [a, b] = quarterRange(q)
  const items = useMemo(() => plansIn(db, only, a, b), [db, only, a, b])
  const today = todayISO()
  const open_ = items.filter(planOpen)
  const health = (p: PlanItem) => planHealth(db, p, today)
  const atRisk = open_.filter((p) => health(p) !== 'on_track')
  const late = open_.filter((p) => isLate(p, today))
  const moved = items.filter((p) => slipDays(p) > 0)
  const Prev = locale.lang === 'fa' ? ChevronRight : ChevronLeft
  const Next = locale.lang === 'fa' ? ChevronLeft : ChevronRight
  const shownTeams = (only ? [only] : teams).filter((t) => only || items.some((p) => p.team === t) || !sprintTeams.includes(t))

  return (
    <>
      <Band
        title={L('برنامه‌ی تیم‌ها', 'Team plans')}
        sub={L('برنامه‌ی تیم‌های طراحی و محصول (بدون اسپرینت): هر کار با بازه‌ی زمانی، پیشرفت، وضعیت و جابه‌جایی از تعهد.', 'Plans for the design and product teams (no sprints): each item with its window, progress, status and slippage.')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, -1))} aria-label={L('فصل قبل', 'Previous quarter')}><Prev size={18} /></button>
              <span className="min-w-[8rem] text-center text-sm font-semibold text-white">{quarterLabel(q)}</span>
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, 1))} aria-label={L('فصل بعد', 'Next quarter')}><Next size={18} /></button>
            </div>
            <Link to="/report" className="btn h-10 border border-white/15 text-white hover:bg-white/10"><FileBarChart size={15} /> {L('گزارش برای CPTO', 'Report for the CPTO')}</Link>
            {canEdit && <button className="btn h-10 bg-white text-band" onClick={() => open('Plans', { team: only || teams[0] || '', start_date: today > a ? today : a, end_date: addDays(today > a ? today : a, 13) })}><Plus size={16} /> {L('آیتم برنامه', 'Plan item')}</button>}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('آیتم در این فصل', 'Items this quarter'), value: fa(items.length) },
            { label: L('در جریان', 'In progress'), value: fa(items.filter((p) => p.status === 'in_progress' || p.status === 'review').length) },
            { label: L('انجام‌شده', 'Done'), value: fa(items.filter((p) => p.status === 'done').length), tone: 'green' },
            { label: L('در خطر یا عقب', 'At risk or behind'), value: fa(atRisk.length), tone: atRisk.length ? 'amber' : 'green' },
            { label: L('از موعد گذشته', 'Past their end'), value: fa(late.length), tone: late.length ? 'red' : 'green' },
            { label: L('جابه‌جاشده از تعهد', 'Moved from commitment'), value: fa(moved.length), tone: moved.length ? 'amber' : 'muted' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="card mb-4 flex flex-wrap items-center gap-1.5 p-3">
          {[{ id: '', label: L('همه‌ی تیم‌ها', 'All teams') }, ...teams.map((t) => ({ id: t, label: teamName(t) }))].map((x) => (
            <button key={x.id || 'all'} onClick={() => set('team', x.id)} className={cx('h-8 rounded-full border px-3 text-xs transition', only === x.id ? 'border-transparent bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>{x.label}</button>
          ))}
          <span className="ms-auto">
            <Segmented value={view} onChange={setView} options={[{ value: 'timeline', label: L('خط زمانی', 'Timeline') }, { value: 'list', label: L('فهرست', 'List') }]} />
          </span>
        </div>

        {items.length === 0 && !canEdit ? (
          <div className="card p-6"><Empty text={L('برای این فصل برنامه‌ای ثبت نشده', 'No plan for this quarter')} /></div>
        ) : view === 'timeline' ? (
          <Timeline q={q} teams={shownTeams} items={items} onOpen={(id) => set('id', id)} onAdd={(team) => open('Plans', { team, start_date: today > a ? today : a, end_date: addDays(today > a ? today : a, 13) })} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  {[L('عنوان', 'Title'), L('تیم', 'Team'), L('نوع', 'Kind'), L('مسئول', 'Owner'), L('بازه', 'Window'), L('وضعیت', 'Status'), L('پیشرفت', 'Progress'), L('سلامت', 'Health')].map((h) => <th key={h} className="th text-start">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const h = health(p)
                  return (
                    <tr key={p.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-muted/40" onClick={() => set('id', p.id)}>
                      <td className="td"><span className="font-medium">{p.title}</span>{p.note && <span className="block max-w-md truncate text-[0.6875rem] text-sub">{p.note}</span>}</td>
                      <td className="td text-xs">{teamName(p.team)}</td>
                      <td className="td text-xs text-sub">{tr(PLAN_KIND[p.kind] || PLAN_KIND.other)}</td>
                      <td className="td text-xs">{p.owner || '—'}</td>
                      <td className="td text-xs num">{fmtDayMonth(p.start_date)} → {fmtDayMonth(p.end_date)}{slipDays(p) > 0 && <span className="block text-warn">{L(`+${fa(slipDays(p))} روز`, `+${slipDays(p)}d`)}</span>}</td>
                      <td className="td"><PlanStatusChip p={p} /></td>
                      <td className="td w-36"><Progress value={planProgress(db, p)} /><span className="text-[0.6875rem] text-sub num">{fa(planProgress(db, p))}٪</span></td>
                      <td className={cx('td text-xs font-medium', CONF[h].tone)}>{tr(CONF[h].label)}</td>
                    </tr>
                  )
                })}
                {!items.length && <tr><td colSpan={8} className="td py-8 text-center text-xs text-sub">{L('برای این فصل برنامه‌ای ثبت نشده', 'No plan for this quarter')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Overlap>
      {openId && <PlanSheet id={openId} onClose={() => set('id', '')} />}
    </>
  )
}

/** The quarter as week columns; one row per item, the bar spanning its window. */
function Timeline({ q, teams, items, onOpen, onAdd }: { q: string; teams: string[]; items: PlanItem[]; onOpen: (id: string) => void; onAdd: (team: string) => void }) {
  const { db, canEdit } = useStore()
  const [a, b] = quarterRange(q)
  const span = Math.max(1, daysBetween(a, b) + 1)
  const weeks = Array.from({ length: Math.ceil(span / 7) }, (_, i) => addDays(a, i * 7))
  const pos = (d: string) => Math.max(0, Math.min(100, (daysBetween(a, d) / span) * 100))
  const now = elapsed(q)
  const today = todayISO()
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[17rem_1fr] border-b border-line text-[0.6875rem] text-sub">
        <div className="px-4 py-2">{L('آیتم', 'Item')}</div>
        <div className="relative flex">
          {weeks.map((w) => <div key={w} className="flex-1 border-s border-line px-1 py-2 num">{fmtDayMonth(w)}</div>)}
        </div>
      </div>
      {teams.map((t) => {
        const rows = items.filter((p) => p.team === t)
        return (
          <div key={t}>
            <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 text-xs font-semibold">
              {teamName(t)} <span className="font-normal text-sub num">{fa(rows.length)}</span>
              {canEdit && <button className="ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-normal text-sub hover:bg-surface hover:text-ink" onClick={() => onAdd(t)}><Plus size={12} /> {L('آیتم', 'Item')}</button>}
            </div>
            {rows.length === 0 && <div className="px-4 py-3 text-xs text-sub">{L('آیتمی در این فصل نیست', 'Nothing in this quarter')}</div>}
            {rows.map((p) => {
              const h = planHealth(db, p, today)
              const prog = planProgress(db, p)
              const s = pos(p.start_date || a)
              const e = pos(addDays(p.end_date || p.start_date || a, 1))
              const base = p.baseline_end && slipDays(p) > 0 ? pos(addDays(p.baseline_end, 1)) : null
              return (
                <div key={p.id} className="grid grid-cols-[17rem_1fr] border-b border-line last:border-0 hover:bg-muted/30">
                  <button onClick={() => onOpen(p.id)} className="min-w-0 px-4 py-2.5 text-start">
                    <span className="flex items-center gap-1.5 text-sm"><HealthDot h={h === 'on_track' ? 'green' : h === 'at_risk' ? 'amber' : 'red'} /><span className="truncate">{p.title}</span></span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-sub"><PlanStatusChip p={p} /> {p.owner}</span>
                  </button>
                  <div className="relative">
                    {weeks.map((w, i) => <div key={w} className="absolute inset-y-0 border-s border-line/60" style={{ insetInlineStart: `${(i * 7 * 100) / span}%` }} />)}
                    <div className="absolute inset-y-0 w-[2px] bg-ink/40" style={{ insetInlineStart: `${now}%` }} title={L('امروز', 'Today')} />
                    {base !== null && <div className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md border border-dashed border-warn/70" style={{ insetInlineStart: `${s}%`, width: `${Math.max(1, base - s)}%` }} title={L('بازه‌ی تعهد اول', 'First committed window')} />}
                    <button
                      onClick={() => onOpen(p.id)}
                      className={cx('absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md text-start text-[0.625rem] text-white shadow-sm transition hover:brightness-110', !planOpen(p) && 'opacity-60')}
                      style={{ insetInlineStart: `${s}%`, width: `${Math.max(1.5, e - s)}%`, background: 'rgb(var(--ink) / 0.18)' }}
                      title={`${p.title} · ${fa(prog)}٪`}
                    >
                      <span className="absolute inset-y-0 start-0" style={{ width: `${prog}%`, background: p.status === 'done' ? 'rgb(var(--good))' : HEX[h] }} />
                      <span className="relative px-1.5 font-medium num">{fa(prog)}٪</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-[0.6875rem] text-sub">
        <span className="flex items-center gap-1"><span className="h-3 w-[2px] bg-ink/40" /> {L('امروز', 'Today')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-ink/75" /> {L('پیشرفت (در مسیر)', 'Progress (on track)')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-warn" /> {L('در خطر', 'At risk')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-bad" /> {L('عقب', 'Behind')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm border border-dashed border-warn" /> {L('بازه‌ی تعهد اول (اگر جابه‌جا شده)', 'First committed window (if moved)')}</span>
      </div>
    </div>
  )
}
