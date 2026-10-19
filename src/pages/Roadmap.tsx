import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronDown, Crosshair, Check } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Segmented, FilterSelect, Avatar, cx, Empty } from '../components/ui'
import type { Health, Milestone, Project } from '../lib/types'
import { projectMetrics } from '../lib/metrics'
import { addDays, daysBetween, fa, fmtDate, fmtDayMonth, fmtWeekday, isoToJalaliParts, jalaliPartsToISO, J_MONTHS, J_MONTHS_EN, G_MONTHS_EN, G_MONTHS_FA, parseISO, relDays, toISO, todayISO } from '../lib/jalali'
import { HEALTH, MILESTONE_STATUS, PROJECT_STATUS } from '../lib/labels'
import { L, lbl, locale } from '../lib/i18n'

type Zoom = 'month' | 'quarter' | 'year'
const PPD: Record<Zoom, number> = { month: 16, quarter: 5, year: 2 } // pixels per day
const LABEL_W = 248

// Muted, professional palette: a light track and a solid progress fill in the same hue.
const HUE: Record<Health | 'paused' | 'done', { track: string; fill: string; dot: string }> = {
  green: { track: 'rgb(47 158 110 / .16)', fill: 'rgb(47 158 110 / .85)', dot: 'bg-good' },
  amber: { track: 'rgb(212 147 44 / .18)', fill: 'rgb(212 147 44 / .9)', dot: 'bg-warn' },
  red: { track: 'rgb(214 69 80 / .16)', fill: 'rgb(214 69 80 / .88)', dot: 'bg-bad' },
  paused: { track: 'rgb(120 128 140 / .14)', fill: 'rgb(120 128 140 / .45)', dot: 'bg-line-strong' },
  done: { track: 'rgb(120 128 140 / .12)', fill: 'rgb(90 98 110 / .55)', dot: 'bg-sub' },
}

// ---- calendar-aware month helpers ----
function monthStart(iso: string) {
  if (locale.cal === 'jalali') {
    const j = isoToJalaliParts(iso)!
    return jalaliPartsToISO(j.jy, j.jm, 1)
  }
  const d = parseISO(iso)!
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
}
function nextMonth(iso: string) {
  if (locale.cal === 'jalali') {
    const j = isoToJalaliParts(iso)!
    return j.jm === 12 ? jalaliPartsToISO(j.jy + 1, 1, 1) : jalaliPartsToISO(j.jy, j.jm + 1, 1)
  }
  const d = parseISO(iso)!
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}
function ym(iso: string) {
  if (locale.cal === 'jalali') {
    const j = isoToJalaliParts(iso)!
    return { y: j.jy, m: j.jm }
  }
  const d = parseISO(iso)!
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}
const monthName = (m: number, short: boolean) => {
  const en = locale.lang === 'en'
  const n = locale.cal === 'jalali' ? (en ? J_MONTHS_EN : J_MONTHS)[m - 1] : (en ? G_MONTHS_EN : G_MONTHS_FA)[m - 1]
  return short && en ? n.slice(0, 3) : n
}
const quarterName = (m: number, y: number) => {
  const q = Math.ceil(m / 3)
  if (locale.cal === 'jalali') return `${L(['بهار', 'تابستان', 'پاییز', 'زمستان'][q - 1], ['Spring', 'Summer', 'Autumn', 'Winter'][q - 1])} ${fa(y)}`
  return `Q${fa(q)} ${fa(y)}`
}

type Tip = { x: number; y: number; body: ReactNode } | null

export default function Roadmap() {
  const { db } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const [zoom, setZoom] = useState<Zoom>('quarter')
  const [status, setStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ completed: true })
  const [cursor, setCursor] = useState('')
  const [tip, setTip] = useState<Tip>(null)
  const [drag, setDrag] = useState(false)
  const todayRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  const ppd = PPD[zoom]

  const all = db.Projects.filter((p) => p.status !== 'cancelled' && (!status || p.status === status) && (!owner || p.owner === owner))
  const dated = all.filter((p) => p.start_date && p.end_date)
  const undated = all.filter((p) => !p.start_date || !p.end_date)
  const owners = Array.from(new Set(db.Projects.map((p) => p.owner).filter(Boolean)))
  const span = dated.map((p) => p.start_date + p.end_date).join()

  // Visible range: every dated project, with breathing room, and always today.
  const { from, to, months } = useMemo(() => {
    const f = monthStart(addDays([today, ...dated.map((p) => p.start_date)].sort()[0], -30))
    const last = [addDays(today, zoom === 'year' ? 365 : 150), ...dated.map((p) => p.end_date)].sort().reverse()[0]
    const t = nextMonth(addDays(last, 20))
    const months: { start: string; days: number; y: number; m: number }[] = []
    for (let c = f; c < t; c = nextMonth(c)) months.push({ start: c, days: daysBetween(c, nextMonth(c)), ...ym(c) })
    return { from: f, to: t, months }
  }, [span, today, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  const width = daysBetween(from, to) * ppd
  const x = (iso: string) => Math.max(0, Math.min(width, daysBetween(from, iso) * ppd))
  const quarters = useMemo(() => {
    const out: { key: string; label: string; days: number }[] = []
    months.forEach((mo) => {
      const key = `${mo.y}-${Math.ceil(mo.m / 3)}`
      const last = out[out.length - 1]
      if (last?.key === key) last.days += mo.days
      else out.push({ key, label: quarterName(mo.m, mo.y), days: mo.days })
    })
    return out
  }, [months])

  // Open on today.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [zoom, from])

  // Drag along the header to look at any date.
  const dateAt = (clientX: number) => {
    const r = axisRef.current!.getBoundingClientRect()
    const off = locale.lang === 'fa' ? r.right - clientX : clientX - r.left
    return addDays(from, Math.round(Math.max(0, off) / ppd))
  }

  const groups = (['active', 'planning', 'on_hold', 'completed'] as const)
    .map((k) => ({ key: k, list: dated.filter((p) => p.status === k).sort((a, b) => (a.start_date < b.start_date ? -1 : 1)) }))
    .filter((g) => g.list.length)

  const show = (e: React.MouseEvent, body: ReactNode) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, body })
  }

  return (
    <>
      <Band
        nav={<HubNav hub="plan" />}
        title={L('رودمپ', 'Roadmap')}
      />
      <Overlap className="space-y-4">
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Segmented
              value={zoom}
              onChange={setZoom}
              options={[
                { value: 'month', label: L('ماه', 'Month') },
                { value: 'quarter', label: L('فصل', 'Quarter') },
                { value: 'year', label: L('سال', 'Year') },
              ]}
            />
            <button className="btn-outline btn-sm" onClick={() => (setCursor(''), todayRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }))}>
              <Crosshair size={14} /> {L('امروز', 'Today')}
            </button>
            <FilterSelect value={status} onChange={setStatus} placeholder={L('همه‌ی وضعیت‌ها', 'Any status')} options={(['active', 'planning', 'on_hold', 'completed'] as const).map((s) => ({ value: s, label: lbl(PROJECT_STATUS, s) }))} />
            <FilterSelect value={owner} onChange={setOwner} placeholder={L('همه‌ی مدیران پروژه', 'Any lead')} options={owners.map((o) => ({ value: o, label: o }))} />
            {cursor && (
              <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs text-brand dark:text-brand-soft">
                {L('نمای برنامه در', 'Plan as of')} <b className="num">{fmtDate(cursor)}</b>
                <button className="underline-offset-2 hover:underline" onClick={() => setCursor('')}>
                  {L('پاک کردن', 'clear')}
                </button>
              </span>
            )}
            <div className="ms-auto hidden items-center gap-4 text-[0.6875rem] text-sub @2xl:flex">
              {(['green', 'amber', 'red'] as Health[]).map((h) => (
                <span key={h} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-5 rounded" style={{ background: HUE[h].fill }} /> {lbl(HEALTH, h)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rotate-45 border-2 border-ink/70" /> {L('مایلستون', 'Milestone')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rotate-45 bg-good" /> {L('انجام‌شده', 'Done')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rotate-45 bg-bad" /> {L('عقب‌افتاده', 'Overdue')}
              </span>
            </div>
          </div>

          {dated.length ? (
            <div className="relative overflow-x-auto" onScroll={() => setTip(null)}>
              <div className="relative" style={{ width: LABEL_W + width }}>
                {/* ---------- header ---------- */}
                <div className="flex border-b border-line bg-muted/40">
                  <div className="sticky start-0 z-30 flex shrink-0 items-end border-e border-line bg-surface px-4 pb-2 text-[0.6875rem] font-medium text-sub" style={{ width: LABEL_W }}>
                    {L(`${fa(dated.length)} پروژه`, `${dated.length} projects`)}
                  </div>
                  <div
                    ref={axisRef}
                    className="relative cursor-ew-resize select-none"
                    style={{ width }}
                    onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), setDrag(true), setCursor(dateAt(e.clientX)))}
                    onPointerMove={(e) => drag && setCursor(dateAt(e.clientX))}
                    onPointerUp={() => setDrag(false)}
                  >
                    <div className="flex h-7 border-b border-line/60">
                      {quarters.map((q) => (
                        <div key={q.key} className="truncate border-e border-line/60 px-2 pt-1.5 text-[0.6875rem] font-semibold text-ink/80" style={{ width: q.days * ppd }}>
                          {q.days * ppd > 60 ? q.label : ''}
                        </div>
                      ))}
                    </div>
                    <div className="flex h-7">
                      {months.map((mo) => {
                        const cur = today >= mo.start && today < addDays(mo.start, mo.days)
                        return (
                          <div key={mo.start} className={cx('truncate border-e border-line/60 px-2 pt-1.5 text-[0.6875rem]', cur ? 'font-semibold text-ink' : 'text-sub')} style={{ width: mo.days * ppd }}>
                            {mo.days * ppd > 34 ? monthName(mo.m, zoom === 'year') : ''}
                          </div>
                        )
                      })}
                    </div>
                    <div ref={todayRef} className="pointer-events-none absolute inset-y-0" style={{ insetInlineStart: x(today) }}>
                      <span className="absolute top-0.5 -translate-x-1/2 rounded-full bg-bad px-1.5 py-px text-[0.5625rem] font-semibold text-white rtl:translate-x-1/2">{L('امروز', 'Today')}</span>
                    </div>
                    {cursor && (
                      <span className="pointer-events-none absolute bottom-0.5 z-10 -translate-x-1/2 rounded-full bg-brand px-1.5 py-px text-[0.5625rem] font-semibold text-white num rtl:translate-x-1/2 dark:text-band" style={{ insetInlineStart: x(cursor) }}>
                        {fmtDayMonth(cursor)}
                      </span>
                    )}
                  </div>
                </div>

                {/* ---------- body ---------- */}
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 flex" style={{ insetInlineStart: LABEL_W, width }}>
                    {months.map((mo) => (
                      <div key={mo.start} className="border-e border-line/50" style={{ width: mo.days * ppd }} />
                    ))}
                    <div className="absolute inset-y-0 w-px bg-bad/70" style={{ insetInlineStart: x(today) }} />
                    {cursor && <div className="absolute inset-y-0 w-0 border-s border-dashed border-brand" style={{ insetInlineStart: x(cursor) }} />}
                  </div>

                  {groups.map((g) => (
                    <div key={g.key}>
                      <div className="flex h-8 items-center border-t border-line/60">
                        <button
                          onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                          className="sticky start-0 z-20 flex h-full items-center gap-2 bg-surface px-4 text-[0.6875rem] font-semibold text-sub hover:text-ink"
                          style={{ width: LABEL_W }}
                        >
                          <ChevronDown size={13} className={cx('transition', collapsed[g.key] && '-rotate-90 rtl:rotate-90')} />
                          {lbl(PROJECT_STATUS, g.key)} <span className="font-normal num">{fa(g.list.length)}</span>
                        </button>
                      </div>
                      {!collapsed[g.key] && g.list.map((p) => <Row key={p.id} p={p} x={x} cursor={cursor} today={today} onTip={show} onLeave={() => setTip(null)} openMs={(m) => open('Milestones', m as never)} />)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Empty text={L('هنوز هیچ پروژه‌ای تاریخ شروع و ددلاین ندارد', 'No project has a start date and deadline yet')} />
          )}

          {undated.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-xs">
              <span className="text-sub">{L(`${fa(undated.length)} پروژه بدون زمان‌بندی:`, `${undated.length} not scheduled:`)}</span>
              {undated.map((p) => (
                <button key={p.id} onClick={() => open('Projects', p as never)} className="chip-btn">
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </Card>

        <UpcomingMilestones projects={dated} />
      </Overlap>
      {tip &&
        createPortal(
          <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-full pb-2" style={{ left: tip.x, top: tip.y }}>
            <div className="min-w-[13rem] max-w-[18rem] rounded-xl bg-band px-3 py-2.5 text-xs leading-5 text-on-band shadow-pop">{tip.body}</div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Row({
  p, x, cursor, today, onTip, onLeave, openMs,
}: { p: Project; x: (iso: string) => number; cursor: string; today: string; onTip: (e: React.MouseEvent, b: ReactNode) => void; onLeave: () => void; openMs: (m: Milestone) => void }) {
  const { db } = useStore()
  const m = projectMetrics(p, db)
  const ms = db.Milestones.filter((x0) => x0.project_id === p.id && x0.planned_date).sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))
  const hue = p.status === 'on_hold' ? HUE.paused : p.status === 'completed' ? HUE.done : HUE[m.health]
  const s = x(p.start_date)
  const w = Math.max(6, x(p.end_date) - s)
  const planned = cursor ? Math.round(Math.max(0, Math.min(100, (daysBetween(p.start_date, cursor) / Math.max(1, daysBetween(p.start_date, p.end_date))) * 100))) : null
  const next = ms.find((x0) => x0.status !== 'done')
  return (
    <div className="group flex h-12 items-center border-t border-line/60 transition hover:bg-muted/30">
      <div className="sticky start-0 z-20 flex h-full shrink-0 items-center gap-2.5 border-e border-line bg-surface px-4" style={{ width: LABEL_W }}>
        <span className={cx('h-2 w-2 shrink-0 rounded-full', hue.dot)} />
        <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-medium hover:underline">{p.name}</span>
          <span className="block truncate text-[0.625rem] text-sub">{p.owner || L('بدون مدیر محصول پروژه', 'No lead')}</span>
        </Link>
        <span className="shrink-0 text-end text-[0.6875rem] num">
          <b className="font-semibold">{fa(`${m.progress}%`)}</b>
          {planned !== null && <span className={cx('block text-[0.5625rem]', m.progress < planned - 10 ? 'text-bad' : 'text-sub')}>{L(`برنامه ${fa(planned)}٪`, `plan ${planned}%`)}</span>}
        </span>
      </div>
      <div className="relative h-full flex-1">
        <Link
          to={`/projects/${p.id}`}
          onMouseEnter={(e) =>
            onTip(
              e,
              <>
                <div className="font-semibold">{p.name}</div>
                <div className="text-band-sub num">
                  {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                </div>
                <div className="mt-1.5 flex justify-between gap-3">
                  <span>{L('پیشرفت', 'Progress')}</span>
                  <b className="num">{fa(`${m.progress}%`)}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span>{L('ددلاین', 'Deadline')}</span>
                  <span>{relDays(p.end_date)}</span>
                </div>
                {next && (
                  <div className="flex justify-between gap-3">
                    <span>{L('مایلستون بعدی', 'Next milestone')}</span>
                    <span className="truncate">{next.title}</span>
                  </div>
                )}
              </>,
            )
          }
          onMouseLeave={onLeave}
          className="absolute top-1/2 h-[22px] -translate-y-1/2 overflow-hidden rounded-md"
          style={{ insetInlineStart: s, width: w, background: hue.track }}
        >
          <span className="block h-full rounded-md" style={{ width: `${m.progress}%`, background: hue.fill }} />
        </Link>
        {ms.map((x0) => {
          const late = x0.status !== 'done' && x0.planned_date < today
          return (
            <button
              key={x0.id}
              onClick={() => openMs(x0)}
              onMouseEnter={(e) =>
                onTip(
                  e,
                  <>
                    <div className="font-semibold">{x0.title}</div>
                    <div className="text-band-sub">
                      {p.name} · <span className="num">{fmtDate(x0.planned_date)}</span>
                    </div>
                    <div className={cx('mt-1', late ? 'text-[#ff8a9a]' : x0.status === 'done' ? 'text-[#7fe0b0]' : '')}>{late ? L('عقب‌افتاده', 'Overdue') : lbl(MILESTONE_STATUS, x0.status)}</div>
                  </>,
                )
              }
              onMouseLeave={onLeave}
              className={cx(
                'absolute top-1/2 z-10 h-[10px] w-[10px] -translate-y-1/2 rotate-45 rounded-[2px] transition hover:scale-150',
                x0.status === 'done' ? 'bg-good ring-2 ring-surface' : late ? 'bg-bad ring-2 ring-surface' : 'border-2 border-ink/70 bg-surface',
              )}
              style={{ insetInlineStart: x(x0.planned_date) - 5 }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Milestones in a clean list: overdue first, then the next 90 days by month. */
function UpcomingMilestones({ projects }: { projects: Project[] }) {
  const { db, canEdit, upsert, toast } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const ids = new Set(projects.map((p) => p.id))
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  const pending = db.Milestones.filter((m) => ids.has(m.project_id) && m.status !== 'done' && m.planned_date)
  const overdue = pending.filter((m) => m.planned_date < today).sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))
  const soon = pending.filter((m) => m.planned_date >= today && m.planned_date <= addDays(today, 90)).sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))
  const byMonth = new Map<string, Milestone[]>()
  soon.forEach((m) => {
    const k = monthStart(m.planned_date)
    byMonth.set(k, [...(byMonth.get(k) || []), m])
  })
  const done = async (m: Milestone) => {
    await upsert('Milestones', { ...m, status: 'done', actual_date: today })
    toast(L('مایلستون انجام شد', 'Milestone done'), 'ok', { label: L('برگرداندن', 'Undo'), run: () => upsert('Milestones', m) })
  }
  const item = (m: Milestone) => {
    const late = m.planned_date < today
    return (
      <li key={m.id} className="group flex items-center gap-4 px-5 py-2.5 transition hover:bg-muted/40">
        <div className={cx('w-20 shrink-0 text-xs num', late && 'font-semibold text-bad')}>
          <div>{fmtDayMonth(m.planned_date)}</div>
          <div className="text-[0.625rem] font-normal text-sub">{fmtWeekday(m.planned_date)}</div>
        </div>
        <span className={cx('h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]', late ? 'bg-bad' : m.status === 'in_progress' ? 'bg-brand dark:bg-brand-soft' : 'border-2 border-ink/70')} />
        <div className="min-w-0 flex-1">
          <button className="block max-w-full truncate text-start text-sm font-medium hover:underline" onClick={() => open('Milestones', m as never)}>
            {m.title}
          </button>
          <Link to={`/projects/${m.project_id}`} className="block truncate text-[0.6875rem] text-sub hover:text-ink">
            {pname(m.project_id)}
          </Link>
        </div>
        <span className={cx('hidden w-24 text-end text-[0.6875rem] @lg:block', late ? 'text-bad' : 'text-sub')}>{relDays(m.planned_date)}</span>
        {m.owner ? <Avatar name={m.owner} size="xs" /> : <span className="w-5" />}
        {canEdit && (
          <button className="icon-btn h-7 w-7 opacity-0 transition group-hover:opacity-100" title={L('انجام شد', 'Mark done')} onClick={() => done(m)}>
            <Check size={14} />
          </button>
        )}
      </li>
    )
  }
  return (
    <Card pad={false} eyebrow={L('مایلستون‌ها', 'Milestones')} title={L('عقب‌افتاده و ۹۰ روز آینده', 'Overdue and the next 90 days')}>
      {overdue.length + soon.length ? (
        <div className="border-t border-line">
          {overdue.length > 0 && (
            <section>
              <div className="flex items-center justify-between bg-bad/[0.05] px-5 py-1.5 text-[0.6875rem] font-semibold text-bad">
                <span>{L('عقب‌افتاده', 'Overdue')}</span>
                <span className="num">{fa(overdue.length)}</span>
              </div>
              <ul className="divide-y divide-line">{overdue.map(item)}</ul>
            </section>
          )}
          {[...byMonth.entries()].map(([k, list]) => (
            <section key={k}>
              <div className="flex items-center justify-between bg-muted/50 px-5 py-1.5 text-[0.6875rem] font-semibold text-sub">
                <span>
                  {monthName(ym(k).m, false)} {fa(ym(k).y)}
                </span>
                <span className="num">{fa(list.length)}</span>
              </div>
              <ul className="divide-y divide-line">{list.map(item)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <Empty text={L('مایلستون بازی در این بازه نیست', 'No open milestones in this window')} />
      )}
    </Card>
  )
}
