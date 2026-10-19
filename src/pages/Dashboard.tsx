import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Gavel, Printer, LayoutGrid } from 'lucide-react'
import { useStore } from '../lib/store'
import { deliverySummary } from '../lib/delivery'
import { HubNav } from '../components/HubNav'
import { portfolioSummary, riskScore } from '../lib/metrics'
import { Band, Card, Empty, HealthBadge, Overlap, Progress, StatStrip, cx, Avatar, Segmented } from '../components/ui'
import { fa, fmtDate, fmtDayMonth, relDays, todayISO } from '../lib/jalali'
import { PROJECT_STATUS, RISK_TYPE } from '../lib/labels'
import { L, lbl } from '../lib/i18n'
import { useProjectName, ProjectCard } from '../components/shared'
import { useEditor } from '../components/Editor'
import { ActivityFeed, HealthTrend } from '../components/widgets'
import { buildActivity } from '../lib/activity'

export default function Dashboard() {
  const { db } = useStore()
  const { open } = useEditor()
  const pname = useProjectName()
  const s = portfolioSummary(db)
  const [view, setView] = useState<'table' | 'cards'>('table')
  const today = todayISO()

  const attention = s.live
    .map((p) => ({ p, m: s.metrics.get(p.id)! }))
    .filter((x) => x.m.health !== 'green' && x.p.status === 'active')
    .sort((a, b) => a.m.score - b.m.score)
  const topRisks = db.Risks.filter((r) => r.status !== 'closed' && r.type !== 'decision').sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5)
  const decisions = db.Risks.filter((r) => r.type === 'decision' && r.status !== 'closed')
  const sorted = [...s.live].sort((a, b) => s.metrics.get(a.id)!.score - s.metrics.get(b.id)!.score)
  const ds = deliverySummary(db)
  const critical = db.Risks.filter((r) => r.status !== 'closed' && riskScore(r) >= 15).length

  return (
    <>
      <Band nav={<HubNav hub="lookout" />}
        eyebrow={
          <>
            <span>{L('ACG', 'ACG')}</span>
            <span className="opacity-40">/</span>
            <span>{L('نمای کلی', 'Overview')}</span>
            <span className="opacity-40">/</span>
            <span className="num">{fmtDate(today, 'long')}</span>
          </>
        }
        title={L('وضعیت ACG', 'ACG status')}
        actions={
          <>
            <Link to="/pulse" className="btn h-10 bg-white text-band">
              <LayoutGrid size={15} /> {L('برد وضعیت', 'Status board')}
            </Link>
            <Link to="/report" className="btn h-10 border border-white/15 text-white">
              <Printer size={15} /> {L('گزارش مدیریتی', 'Executive report')}
            </Link>
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('پروژه‌های جاری', 'Live projects'), value: fa(s.live.length), sub: L(`${fa(db.Projects.filter((p) => p.status === 'completed').length)} تکمیل‌شده`, `${db.Projects.filter((p) => p.status === 'completed').length} completed`) },
            { label: L('میانگین پیشرفت', 'Avg. progress'), value: `${fa(`${s.avgProgress}%`)}` },
            { label: L('در خطر', 'Off track'), value: fa(s.counts.red), tone: s.counts.red ? 'red' : 'green', sub: L(`${fa(s.counts.amber)} نیازمند توجه`, `${s.counts.amber} at risk`) },
            { label: L('تحویل به‌موقع (۹۰ روز)', 'On-time delivery (90d)'), value: ds.onTimeRate === null ? '—' : `${fa(`${ds.onTimeRate}%`)}`, tone: ds.onTimeRate !== null && ds.onTimeRate < 70 ? 'amber' : undefined, sub: L(`${fa(ds.overdue.length)} تحویل عقب‌افتاده`, `${ds.overdue.length} overdue deliveries`) },
            { label: L('مایلستون معوق', 'Overdue milestones'), value: fa(s.overdueMilestones.length), tone: s.overdueMilestones.length ? 'amber' : 'green', sub: L(`${fa(s.upcomingMilestones.length)} در ۳۰ روز آینده`, `${s.upcomingMilestones.length} in next 30 days`) },
            { label: L('ریسک بحرانی', 'Critical risks'), value: fa(critical), tone: critical ? 'red' : 'green', sub: L(`${fa(db.Risks.filter((r) => r.status !== 'closed').length)} ریسک باز`, `${db.Risks.filter((r) => r.status !== 'closed').length} open`) },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <div className="grid gap-4 @xl:grid-cols-3">
          <Card className="@xl:col-span-2" eyebrow={L('نیازمند توجه مدیریت', 'Needs leadership attention')} title={L(`${fa(attention.length)} پروژه خارج از برنامه`, `${attention.length} projects off plan`)}>
            {attention.length === 0 ? (
              <Empty text={L('همه‌ی پروژه‌ها سالم هستند', 'Every project is on track')} />
            ) : (
              <div className="-mx-2 divide-y divide-line">
                {attention.map(({ p, m }) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="group flex items-start gap-4 rounded-xl px-2 py-3.5 transition hover:bg-muted/50">
                    <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold num', m.health === 'red' ? 'bg-bad/10 text-bad' : 'bg-warn/12 text-warn')}>{fa(m.score)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.name}</span>
                        <HealthBadge h={m.health} />
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {m.reasons
                          .filter((r) => r.level !== 'green')
                          .slice(0, 3)
                          .map((r, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-sub">
                              <span className={cx('h-1 w-1 rounded-full', r.level === 'red' ? 'bg-bad' : 'bg-warn')} /> {r.text}
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div className="hidden text-end @sm:block">
                      <div className="text-sm font-semibold num">{fa(`${m.progress}%`)}</div>
                      <div className="text-[0.6875rem] text-sub">{p.owner}</div>
                    </div>
                    <ArrowUpRight size={16} className="mt-1 text-sub/40 transition group-hover:text-ink rtl:-scale-x-100" />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card eyebrow={L('تصمیم‌ها', 'Decisions')} title={L('در انتظار مدیریت', 'Awaiting leadership')} action={<Gavel size={18} className="text-sub" />}>
            {decisions.length === 0 ? (
              <Empty text={L('تصمیم معوقی نیست', 'No pending decisions')} />
            ) : (
              <div className="space-y-2">
                {decisions.map((r) => (
                  <button key={r.id} onClick={() => open('Risks', r as never)} className="w-full rounded-2xl border border-line p-4 text-start transition hover:border-line-strong hover:bg-muted/40">
                    <div className="text-sm font-medium leading-6">{r.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-sub">{r.mitigation}</div>
                    <div className="mt-3 flex items-center justify-between text-[0.6875rem] text-sub">
                      <span className="truncate">{pname(r.project_id)}</span>
                      <span className={cx('num', r.due_date < today && 'font-semibold text-bad')}>{relDays(r.due_date)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card
          pad={false}
          eyebrow={L('ACG', 'ACG')}
          title={L('همه‌ی پروژه‌های جاری', 'All live projects')}
          action={<Segmented value={view} onChange={setView} options={[{ value: 'table', label: L('جدول', 'Table') }, { value: 'cards', label: L('کارت', 'Cards') }]} />}
        >
          {view === 'cards' ? (
            <div className="grid gap-4 p-5 pt-1 @md:grid-cols-2 @xl:grid-cols-3">
              {sorted.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem]">
                <thead className="border-y border-line">
                  <tr>
                    <th className="th">{L('پروژه', 'Project')}</th>
                    <th className="th">{L('سلامت', 'Health')}</th>
                    <th className="th">{L('روند گزارش‌ها', 'Update trend')}</th>
                    <th className="th w-60">{L('پیشرفت / زمان', 'Progress / time')}</th>
                    <th className="th">{L('ددلاین', 'Deadline')}</th>
                    <th className="th">{L('ریسک', 'Risks')}</th>
                    <th className="th">{L('مایلستون بعدی', 'Next milestone')}</th>
                    <th className="th">{L('ریسک', 'Risks')}</th>
                    <th className="th">{L('مدیر', 'Lead')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sorted.map((p) => {
                    const m = s.metrics.get(p.id)!
                    return (
                      <tr key={p.id} className="transition hover:bg-muted/40">
                        <td className="td">
                          <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-sub">
                            <span className="font-mono" dir="ltr">{p.code}</span> · {lbl(PROJECT_STATUS, p.status)}
                          </div>
                        </td>
                        <td className="td">
                          <HealthBadge h={m.health} />
                        </td>
                        <td className="td">
                          <HealthTrend projectId={p.id} />
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <Progress value={m.progress} h={m.health} marker={m.elapsed} />
                            <span className="w-10 text-xs font-semibold num">{fa(`${m.progress}%`)}</span>
                          </div>
                          <div className={cx('mt-1 text-[0.6875rem] num', m.scheduleGap < -10 ? 'text-bad' : 'text-sub')}>
                            {m.scheduleGap >= 0 ? L(`${fa(m.scheduleGap)}٪ جلوتر`, `${m.scheduleGap}% ahead`) : L(`${fa(-m.scheduleGap)}٪ عقب‌تر`, `${-m.scheduleGap}% behind`)}
                          </div>
                        </td>
                        <td className="td">
                          <div className="text-sm num">{fmtDate(p.end_date)}</div>
                          <div className={cx('text-[0.6875rem]', m.daysLeft < 0 ? 'font-semibold text-bad' : 'text-sub')}>{relDays(p.end_date)}</div>
                        </td>
                        <td className="td">
                          <div className={cx('text-sm font-semibold num', m.highRisks > 0 && 'text-bad')}>{fa(m.openRisks)}</div>
                          <div className="text-[0.6875rem] text-sub">{m.highRisks ? L(`${fa(m.highRisks)} بحرانی`, `${m.highRisks} critical`) : L('ریسک‌های باز', 'open risks')}</div>
                        </td>
                        <td className="td max-w-[13rem]">
                          {m.nextMilestone ? (
                            <>
                              <div className="truncate text-sm">{m.nextMilestone.title}</div>
                              <div className="text-[0.6875rem] text-sub">{fmtDayMonth(m.nextMilestone.planned_date)}</div>
                            </>
                          ) : (
                            <span className="text-sub">—</span>
                          )}
                        </td>
                        <td className="td">
                          <span className={cx('text-sm num', m.highRisks ? 'font-semibold text-bad' : '')}>{fa(m.openRisks)}</span>
                          {m.highRisks > 0 && <span className="text-[0.6875rem] text-bad"> · {fa(m.highRisks)}!</span>}
                        </td>
                        <td className="td">
                          <Avatar name={p.owner} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-4 @lg:grid-cols-2 @xl:grid-cols-3">
          <Card eyebrow={L('۳۰ روز آینده', 'Next 30 days')} title={L('مایلستون‌ها', 'Milestones')} action={<Link to="/roadmap" className="text-xs font-medium text-sub hover:text-ink">{L('رودمپ', 'Roadmap')} →</Link>}>
            {s.overdueMilestones.length + s.upcomingMilestones.length === 0 ? (
              <Empty />
            ) : (
              <div className="-mx-2 space-y-0.5">
                {[...s.overdueMilestones, ...s.upcomingMilestones].slice(0, 7).map((m) => {
                  const late = m.planned_date < today
                  const [d, mo] = fmtDayMonth(m.planned_date).split(' ')
                  return (
                    <button key={m.id} onClick={() => open('Milestones', m as never)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition hover:bg-muted/60">
                      <div className={cx('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl leading-none', late ? 'bg-bad/10 text-bad' : 'bg-muted')}>
                        <span className="text-sm font-semibold num">{d}</span>
                        <span className="mt-0.5 text-[0.5625rem]">{mo}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{m.title}</div>
                        <div className="truncate text-xs text-sub">{pname(m.project_id)}</div>
                      </div>
                      <span className={cx('text-[0.6875rem]', late ? 'font-semibold text-bad' : 'text-sub')}>{relDays(m.planned_date)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card eyebrow={L('ریسک', 'Risk')} title={L('ریسک‌های برتر ACG', 'Top ACG risks')} action={<Link to="/risks" className="text-xs font-medium text-sub hover:text-ink">{L('همه', 'All')} →</Link>}>
            <div className="-mx-2 space-y-0.5">
              {topRisks.map((r) => {
                const sc = riskScore(r)
                return (
                  <button key={r.id} onClick={() => open('Risks', r as never)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition hover:bg-muted/60">
                    <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold num', sc >= 15 ? 'bg-bad text-white' : sc >= 8 ? 'bg-warn text-white' : 'bg-good text-white')}>{fa(sc)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.title}</div>
                      <div className="truncate text-xs text-sub">
                        {lbl(RISK_TYPE, r.type)} · {pname(r.project_id)}
                      </div>
                    </div>
                    <Avatar name={r.owner} size="xs" />
                  </button>
                )
              })}
              {!topRisks.length && <Empty />}
            </div>
          </Card>

          <Card eyebrow={L('نبض ACG', 'ACG pulse')} title={L('فعالیت اخیر', 'Recent activity')} className="@lg:col-span-2 @xl:col-span-1">
            <ActivityFeed items={buildActivity(db, undefined, 6)} />
          </Card>
        </div>

      </Overlap>
    </>
  )
}

