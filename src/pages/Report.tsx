// The department's status for the CPTO, on one printable page: per team, the quarter's OKRs, the
// plan (what is moving, what is at risk or late, what got done, what starts next), the running
// sprint for sprint teams, and the highest open risks. Everything is computed from the live data;
// the only writing it needs is each plan item's weekly status line.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, HealthDot, Overlap, Progress, Segmented, StatStrip, cx } from '../components/ui'
import { Ring, teamName } from '../components/TeamParts'
import { PlanStatusChip } from '../components/PlanParts'
import { L, tr } from '../lib/i18n'
import { addDays, fa, fmtDate, fmtDayMonth, todayISO } from '../lib/jalali'
import { allTeams, teamStats } from '../lib/teams'
import { CONF, elapsed, quarterLabel, quarterOf, quarterRange, teamOkr } from '../lib/okr'
import { isLate, planHealth, planOpen, planProgress, plansIn, slipDays } from '../lib/plans'
import { activeSprint, sprintCfg, sprintStats } from '../lib/sprints'
import { riskScore } from '../lib/metrics'
import type { PlanItem } from '../lib/types'

export default function Report() {
  const { db } = useStore()
  const [days, setDays] = useState<'7' | '14' | '30'>('14')
  const today = todayISO()
  const since = addDays(today, -Number(days))
  const ahead = addDays(today, Number(days))
  const q = quarterOf()
  const [a, b] = quarterRange(q)
  const el = elapsed(q)
  const teams = allTeams(db).filter(Boolean)
  const data = useMemo(
    () =>
      teams.map((t) => {
        const okr = teamOkr(db, t, q, teamStats(db, t).tasks)
        const plans = plansIn(db, t, a, b)
        const sprint = sprintCfg().teams.includes(t) ? activeSprint(db, t) : undefined
        return {
          t,
          okr,
          sprint,
          sprintSt: sprint ? sprintStats(db, sprint) : undefined,
          moving: plans.filter((p) => p.status === 'in_progress' || p.status === 'review'),
          risky: plans.filter((p) => planOpen(p) && planHealth(db, p, today) !== 'on_track'),
          done: plans.filter((p) => p.status === 'done' && (p.updated_at || '').slice(0, 10) >= since),
          next: db.Plans.filter((p) => p.team === t && planOpen(p) && p.status !== 'in_progress' && p.status !== 'review' && p.start_date > today && p.start_date <= ahead),
        }
      }),
    [db, teams, q, a, b, today, since, ahead],
  )
  const risks = db.Risks.filter((r) => r.status !== 'closed').sort((x, y) => riskScore(y) - riskScore(x)).slice(0, 6)
  const withOkr = data.filter((d) => d.okr.objectives.length)
  const okrAvg = withOkr.length ? Math.round(withOkr.reduce((s, d) => s + d.okr.progress, 0) / withOkr.length) : 0
  const allRisky = data.flatMap((d) => d.risky)
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''

  const line = (p: PlanItem) => {
    const h = planHealth(db, p, today)
    return (
      <li key={p.id} className="py-2">
        <div className="flex items-center gap-2 text-sm">
          <HealthDot h={h === 'on_track' ? 'green' : h === 'at_risk' ? 'amber' : 'red'} />
          <Link to={`/plan?id=${p.id}`} className="min-w-0 flex-1 truncate hover:underline">{p.title}</Link>
          <PlanStatusChip p={p} />
          <span className="w-10 text-end text-xs font-medium num">{fa(planProgress(db, p))}٪</span>
        </div>
        <div className="ms-4 mt-0.5 flex flex-wrap gap-x-3 text-[0.6875rem] text-sub">
          {p.owner && <span>{p.owner}</span>}
          <span className="num">{fmtDayMonth(p.start_date)} → {fmtDayMonth(p.end_date)}</span>
          {isLate(p, today) && <span className="text-bad">{L('از موعد گذشته', 'past its end')}</span>}
          {slipDays(p) > 0 && <span className="text-warn">{L(`${fa(slipDays(p))} روز جابه‌جا`, `moved ${slipDays(p)}d`)}</span>}
        </div>
        {p.note && <div className="ms-4 mt-1 text-xs leading-6 text-ink/80">{p.note}</div>}
      </li>
    )
  }

  return (
    <>
      <Band
        eyebrow={<span>{L(`گزارش ${fmtDate(today, 'long')}`, `Report · ${fmtDate(today, 'long')}`)}</span>}
        title={L('وضعیت دپارتمان محصول و فناوری', 'Product & technology status')}
        sub={L(`برای CPTO · ${quarterLabel(q)} · ${fa(el)}٪ از فصل گذشته`, `For the CPTO · ${quarterLabel(q)} · ${el}% of the quarter gone`)}
        actions={
          <>
            <Segmented dark value={days} onChange={setDays} options={[{ value: '7', label: L('۷ روز', '7 days') }, { value: '14', label: L('۱۴ روز', '14 days') }, { value: '30', label: L('۳۰ روز', '30 days') }]} />
            <button className="btn h-10 bg-white text-band" onClick={() => window.print()}><Printer size={15} /> {L('چاپ / PDF', 'Print / PDF')}</button>
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('پیشرفت OKR تیم‌ها', 'Team OKR progress'), value: `${fa(okrAvg)}٪`, sub: L(`زمان: ${fa(el)}٪`, `time: ${el}%`), tone: okrAvg >= el - 10 ? 'green' : okrAvg >= el - 25 ? 'amber' : 'red' },
            { label: L('کارهای در جریان', 'Work in progress'), value: fa(data.reduce((s, d) => s + d.moving.length, 0)) },
            { label: L('در خطر یا عقب', 'At risk or behind'), value: fa(allRisky.length), tone: allRisky.length ? 'amber' : 'green' },
            { label: L(`انجام‌شده در ${fa(days)} روز`, `Done in ${days} days`), value: fa(data.reduce((s, d) => s + d.done.length, 0)), tone: 'green' },
            { label: L('ریسک‌های باز بالا', 'High open risks'), value: fa(risks.filter((r) => riskScore(r) >= 15).length), tone: risks.some((r) => riskScore(r) >= 15) ? 'red' : 'green' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="space-y-4">
          {data.map((d) => (
            <section key={d.t} className="card overflow-hidden break-inside-avoid">
              <header className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
                <Ring value={d.okr.progress} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{teamName(d.t)}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-sub">
                    {d.okr.objectives.length ? <span>{L(`OKR: ${fa(d.okr.objectives.length)} هدف · ${fa(d.okr.krs.length)} نتیجه‌ی کلیدی`, `OKR: ${d.okr.objectives.length} objectives · ${d.okr.krs.length} key results`)}</span> : <span>{L('OKR این فصل تعریف نشده', 'No OKRs this quarter')}</span>}
                    {(['at_risk', 'off_track'] as const).filter((c) => d.okr.conf[c]).map((c) => <span key={c} className={CONF[c].tone}>{fa(d.okr.conf[c])} {tr(CONF[c].label)}</span>)}
                  </div>
                </div>
                {d.sprint && d.sprintSt && (
                  <Link to={`/sprints/${d.sprint.id}`} className="min-w-[14rem] rounded-2xl bg-muted/60 px-3 py-2 text-xs hover:bg-muted">
                    <div className="flex justify-between gap-2"><b className="font-medium">{d.sprint.name}</b><span className="text-sub num">{L(`${fa(d.sprintSt.daysLeft)} روز مانده`, `${d.sprintSt.daysLeft}d left`)}</span></div>
                    <Progress value={d.sprintSt.pct} marker={d.sprintSt.elapsed} className="mt-1.5" />
                    <div className="mt-1 text-[0.6875rem] text-sub num">{L(`${fa(d.sprintSt.done)} از ${fa(d.sprintSt.total)} امتیاز`, `${d.sprintSt.done} of ${d.sprintSt.total} pts`)}{d.sprintSt.blocked.length > 0 && <span className="text-bad">{L(` · ${fa(d.sprintSt.blocked.length)} مسدود`, ` · ${d.sprintSt.blocked.length} blocked`)}</span>}</div>
                  </Link>
                )}
              </header>
              <div className="grid gap-x-6 px-5 py-3 @xl:grid-cols-2">
                <Block title={L('نیازمند توجه', 'Needs attention')} tone="text-bad" items={d.risky} empty={L('موردی در خطر نیست', 'Nothing at risk')} line={line} />
                <Block title={L('در جریان', 'In progress')} items={d.moving.filter((p) => !d.risky.includes(p))} empty={L('کاری در جریان نیست', 'Nothing in progress')} line={line} />
                <Block title={L(`انجام‌شده در ${fa(days)} روز گذشته`, `Done in the last ${days} days`)} tone="text-good" items={d.done} empty={L('—', '—')} line={line} />
                <Block title={L(`شروع در ${fa(days)} روز آینده`, `Starting in the next ${days} days`)} items={d.next} empty={L('—', '—')} line={line} />
              </div>
            </section>
          ))}
          <Card eyebrow="RAID" title={L('ریسک‌های باز با بیشترین شدت', 'Highest open risks')}>
            {risks.length ? (
              <ul className="divide-y divide-line">
                {risks.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold num', riskScore(r) >= 15 ? 'bg-bad/10 text-bad' : riskScore(r) >= 8 ? 'bg-warn/15 text-warn' : 'bg-muted text-sub')}>{fa(riskScore(r))}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-xs text-sub">{pname(r.project_id)}</span>
                    <span className="text-xs text-sub">{r.owner}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text={L('ریسک بازی نیست', 'No open risks')} />
            )}
          </Card>
        </div>
      </Overlap>
    </>
  )
}

function Block({ title, items, empty, line, tone }: { title: string; items: PlanItem[]; empty: string; line: (p: PlanItem) => React.ReactNode; tone?: string }) {
  return (
    <div className="py-2">
      <div className={cx('eyebrow mb-1', tone)}>{title} <span className="num">({fa(items.length)})</span></div>
      {items.length ? <ul className="divide-y divide-line">{items.map(line)}</ul> : <div className="py-1 text-xs text-sub">{empty}</div>}
    </div>
  )
}
