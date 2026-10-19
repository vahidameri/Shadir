import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Minus, Gavel, Siren, Flag } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, Segmented, cx, Avatar, Progress, Empty } from '../components/ui'
import { portfolioSummary, type ProjectMetrics } from '../lib/metrics'
import { addDays, daysFromToday, fa, fmtDayMonth, relDays, todayISO } from '../lib/jalali'
import { HEALTH } from '../lib/labels'
import { L, lbl, tr } from '../lib/i18n'
import { assess, DIM, DIMS, type Assessment, type Dim } from '../lib/rag'
import type { Health, Project } from '../lib/types'

const rank: Record<Health, number> = { red: 0, amber: 1, green: 2 }
const cellTone: Record<Health, string> = {
  red: 'bg-bad text-white',
  amber: 'bg-warn text-white',
  green: 'bg-good/15 text-good',
}
const softTone: Record<Health, string> = { red: 'bg-bad/10 text-bad', amber: 'bg-warn/12 text-warn', green: 'bg-good/10 text-good' }

/** Portfolio status board: one row per project, one RAG cell per dimension. */
export default function Pulse() {
  const { db } = useStore()
  const s = portfolioSummary(db)
  const [filter, setFilter] = useState<'all' | 'red' | 'amber'>('all')
  const rows = s.live
    .map((p) => ({ p, m: s.metrics.get(p.id)!, a: assess(p, db) }))
    .sort((x, y) => rank[x.a.overall] - rank[y.a.overall] || x.m.score - y.m.score)
  const shown = rows.filter((r) => filter === 'all' || r.a.overall === filter)
  const count = (h: Health) => rows.filter((r) => r.a.overall === h).length

  // Where do problems concentrate?
  const byDim = DIMS.map((d) => ({ d, red: rows.filter((r) => r.a.dims[d].h === 'red').length, amber: rows.filter((r) => r.a.dims[d].h === 'amber').length, n: rows.length }))
  const worst = [...byDim].sort((a, b) => b.red * 2 + b.amber - (a.red * 2 + a.amber)).filter((x) => x.red + x.amber > 0).slice(0, 2)
  const reds = count('red')
  const worse = rows.filter((r) => r.a.trend === 'down').length

  return (
    <>
      <Band nav={<HubNav hub="lookout" />}
        title={L('برد وضعیت', 'Status board')}
        sub={
          worst.length
            ? L(
                `${fa(reds)} پروژه قرمز${worse ? `، ${fa(worse)} پروژه بدتر از هفته‌ی قبل` : ''}. بیشترین مشکل در ${worst.map((w) => tr(DIM[w.d])).join(' و ')} است.`,
                `${reds} project${reds === 1 ? '' : 's'} red${worse ? `, ${worse} worse than last week` : ''}. Most issues sit in ${worst.map((w) => tr(DIM[w.d]).toLowerCase()).join(' and ')}.`,
              )
            : L('همه‌ی پروژه‌ها در همه‌ی ابعاد سبز هستند.', 'Every project is green on every dimension.')
        }
      >
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 @md:grid-cols-3 @xl:grid-cols-5">
          {byDim.map(({ d, red, amber, n }) => (
            <div key={d} className="bg-[#1f2024]/85 p-4 dark:bg-black/40">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-[#c3d0e8]">{tr(DIM[d])}</span>
                <span className={cx('display text-2xl num', red ? 'text-[#ff8a9a]' : amber ? 'text-[#f5c565]' : 'text-[#7fe0b0]')}>{fa(red + amber)}</span>
              </div>
              <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
                {red > 0 && <span className="bg-[#e5485f]" style={{ flex: red }} />}
                {amber > 0 && <span className="bg-[#e8a93a]" style={{ flex: amber }} />}
                {n - red - amber > 0 && <span className="bg-[#3fb27f]" style={{ flex: n - red - amber }} />}
              </div>
              <div className="mt-2 text-[0.625rem] text-band-sub">{red + amber ? L(`${fa(red)} قرمز · ${fa(amber)} زرد`, `${red} red · ${amber} amber`) : L('همه سبز', 'all green')}</div>
            </div>
          ))}
        </div>
      </Band>

      <Overlap className="space-y-4">
        <div className="grid gap-4 @xl:grid-cols-[3fr_2fr]">
          <LeadershipAsks rows={rows} />
          <NextTwoWeeks />
        </div>
        <div>
          <Card
            pad={false}
            eyebrow={L('برد RAG', 'RAG board')}
            title={L('هر ردیف یک پروژه، هر خانه یک بُعد', 'One row per project, one cell per dimension')}
            action={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: L(`همه · ${fa(rows.length)}`, `All · ${rows.length}`) },
                  { value: 'red', label: L(`قرمز · ${fa(count('red'))}`, `Red · ${count('red')}`) },
                  { value: 'amber', label: L(`زرد · ${fa(count('amber'))}`, `Amber · ${count('amber')}`) },
                ]}
              />
            }
          >
            <div className="hidden overflow-x-auto @2xl:block">
              <table className="w-full min-w-[56rem]">
                <thead className="border-y border-line">
                  <tr>
                    <th className="th">{L('پروژه', 'Project')}</th>
                    <th className="th text-center">{L('کلی', 'Overall')}</th>
                    <th className="th text-center">{L('روند گزارش‌ها', 'Update trend')}</th>
                    {DIMS.map((d) => (
                      <th key={d} className="th text-center">
                        {tr(DIM[d])}
                      </th>
                    ))}
                    <th className="th w-40">{L('پیشرفت / زمان', 'Progress / time')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map(({ p, m, a }) => (
                    <tr key={p.id} className="group transition hover:bg-muted/40">
                      <td className="td">
                        <Link to={`/projects/${p.id}`} className="flex items-center gap-2.5">
                          <Avatar name={p.owner} size="sm" />
                          <span className="min-w-0">
                            <span className="block max-w-[14rem] truncate font-medium group-hover:underline">{p.name}</span>
                            <span className="block text-[0.6875rem] text-sub">
                              {p.owner} · {relDays(p.end_date)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 text-center">
                        <span className={cx('inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold', cellTone[a.overall])}>{lbl(HEALTH, a.overall)}</span>
                      </td>
                      <td className="px-2">
                        <TrendCell a={a} />
                      </td>
                      {DIMS.map((d) => (
                        <td key={d} className="px-1 py-2 text-center">
                          <Cell d={d} a={a} />
                        </td>
                      ))}
                      <td className="td">
                        <Progress value={m.progress} h={m.health} marker={m.elapsed} />
                        <div className="mt-1 flex justify-between text-[0.625rem] text-sub num">
                          <span>{fa(`${m.progress}%`)}</span>
                          <span>
                            {L(`${fa(m.elapsed)}٪ از زمان گذشته`, `${m.elapsed}% of time used`)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 pt-0 @2xl:hidden">
              {shown.map(({ p, m, a }) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-2xl border border-line p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <TrendCell a={a} />
                    <span className={cx('rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold', cellTone[a.overall])}>{lbl(HEALTH, a.overall)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 @md:grid-cols-3">
                    {DIMS.map((d) => (
                      <div key={d} className={cx('rounded-xl px-2 py-1.5 text-[0.6875rem]', softTone[a.dims[d].h])}>
                        <div className="font-semibold">{tr(DIM[d])}</div>
                        <div className="truncate opacity-80">{a.dims[d].why}</div>
                      </div>
                    ))}
                  </div>
                  <Progress value={m.progress} h={m.health} marker={m.elapsed} className="mt-3" />
                </Link>
              ))}
            </div>
            {!shown.length && <Empty text={L('پروژه‌ای در این وضعیت نیست', 'No projects in this state')} />}
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-[0.6875rem] text-sub">
              {(['green', 'amber', 'red'] as Health[]).map((h) => (
                <span key={h} className="flex items-center gap-1.5">
                  <span className={cx('h-3 w-3 rounded', h === 'green' ? 'bg-good/30' : h === 'amber' ? 'bg-warn' : 'bg-bad')} /> {lbl(HEALTH, h)}
                </span>
              ))}
              <span className="ms-auto">{L('روند = مقایسه‌ی دو گزارش هفتگی آخر', 'Trend = last two weekly updates')}</span>
            </div>
          </Card>
        </div>
      </Overlap>
    </>
  )
}

function Cell({ d, a }: { d: Dim; a: Assessment }) {
  const r = a.dims[d]
  return (
    <span title={`${tr(DIM[d])}: ${r.why}`} className={cx('mx-auto flex h-11 w-full max-w-[8rem] items-center justify-center rounded-xl px-2 text-center leading-tight', cellTone[r.h])}>
      <span className="line-clamp-2 text-[0.6875rem] font-medium">{r.why}</span>
    </span>
  )
}

function TrendCell({ a }: { a: Assessment }) {
  const Icon = a.trend === 'up' ? ArrowUpRight : a.trend === 'down' ? ArrowDownRight : Minus
  const tone = a.trend === 'up' ? 'text-good' : a.trend === 'down' ? 'text-bad' : 'text-sub'
  const label = a.trend === 'up' ? L('بهتر شده', 'Improving') : a.trend === 'down' ? L('بدتر شده', 'Worsening') : a.trend === 'flat' ? L('بدون تغییر', 'Steady') : L('گزارشی نیست', 'No updates')
  return (
    <span className="flex flex-col items-center gap-1" title={label}>
      <Icon size={16} className={cx(tone, 'rtl:-scale-x-100')} />
      <span className="flex gap-0.5">
        {a.history.slice(-4).map((h, i) => (
          <span key={i} className={cx('h-1.5 w-1.5 rounded-full', h === 'red' ? 'bg-bad' : h === 'amber' ? 'bg-warn' : 'bg-good')} />
        ))}
      </span>
    </span>
  )
}

/** What the leadership team needs to act on. */
function LeadershipAsks({ rows }: { rows: { p: Project; m: ProjectMetrics; a: Assessment }[] }) {
  const { db } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const decisions = db.Risks.filter((r) => r.type === 'decision' && r.status !== 'closed')
  const escalate = rows.filter((r) => r.a.overall === 'red')
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  const total = decisions.length + escalate.length
  const item = 'flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-start transition hover:bg-white/[0.08]'
  return (
    <section className="relative overflow-hidden rounded-2xl bg-band p-5 text-on-band shadow-card">
      <div className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 rounded-full bg-[#3a5585]/50 blur-3xl" />
      <div className="relative">
        <div className="eyebrow !text-[#c3d0e8]">{L('برای لیدرشیپ', 'For leadership')}</div>
        <h3 className="mt-1 text-[0.9375rem] font-semibold">{L(`${fa(total)} مورد نیاز به اقدام شما`, `${total} items need you`)}</h3>
        <div className="mt-4 space-y-2">
          {decisions.map((r) => (
            <button key={r.id} onClick={() => open('Risks', r as never)} className={item}>
              <Gavel size={15} className="mt-0.5 shrink-0 text-[#c3d0e8]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] font-medium leading-5">{r.title}</span>
                <span className="block text-[0.6875rem] text-band-sub">
                  {L('تصمیم', 'Decision')} · {pname(r.project_id)} · <span className={cx(r.due_date < today && 'text-[#ff8a9a]')}>{relDays(r.due_date)}</span>
                </span>
              </span>
            </button>
          ))}
          {escalate.map(({ p, a }) => (
            <Link key={p.id} to={`/projects/${p.id}`} className={item}>
              <Siren size={15} className="mt-0.5 shrink-0 text-[#ff8a9a]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] font-medium leading-5">{L(`بازبینی با کارفرما — ${p.name}`, `Client review — ${p.name}`)}</span>
                <span className="block text-[0.6875rem] text-band-sub">
                  {DIMS.filter((d) => a.dims[d].h === 'red')
                    .map((d) => `${tr(DIM[d])}: ${a.dims[d].why}`)
                    .join(' · ')}
                </span>
              </span>
            </Link>
          ))}
          {!total && <p className="text-sm text-band-sub">{L('موردی نیست.', 'Nothing pending.')}</p>}
        </div>
      </div>
    </section>
  )
}

/** Late milestones and the ones due in the next 14 days. */
function NextTwoWeeks() {
  const { db } = useStore()
  const { open } = useEditor()
  const today = todayISO()
  const ms = db.Milestones.filter((m) => m.status !== 'done' && m.planned_date <= addDays(today, 14)).sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1))
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  return (
    <Card eyebrow={L('دو هفته‌ی آینده', 'Next two weeks')} title={L('مایلستون‌های معوق و پیش رو', 'Late & upcoming milestones')}>
      {ms.length === 0 ? (
        <Empty />
      ) : (
        <ol className="relative space-y-3 border-s-2 border-line ps-5">
          {ms.map((m) => {
            const d = daysFromToday(m.planned_date)
            return (
              <li key={m.id} className="relative">
                <span className={cx('absolute -start-[1.65rem] top-1 grid h-4 w-4 place-items-center rounded-full ring-4 ring-surface', d < 0 ? 'bg-bad' : d <= 3 ? 'bg-warn' : 'bg-ink')}>
                  <Flag size={8} className="text-white" />
                </span>
                <button onClick={() => open('Milestones', m as never)} className="text-start">
                  <span className="block text-sm font-medium leading-5 hover:underline">{m.title}</span>
                  <span className="block text-[0.6875rem] text-sub">
                    {pname(m.project_id)} · {fmtDayMonth(m.planned_date)} · <span className={cx(d < 0 ? 'font-semibold text-bad' : d <= 3 && 'font-medium text-warn')}>{relDays(m.planned_date)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
