import { Printer, Copy } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { Band, HealthBadge, HealthDot, Overlap, Progress, cx, healthText } from '../components/ui'
import { portfolioSummary, riskScore } from '../lib/metrics'
import { fa, fmtDate, todayISO, relDays } from '../lib/jalali'
import { HEALTH, RISK_TYPE } from '../lib/labels'
import { L, lbl } from '../lib/i18n'
import { useProjectName } from '../components/shared'
import { AcgLogo } from '../components/Brand'
import { RagStrip } from '../components/widgets'
import { assess, DIM, DIMS } from '../lib/rag'
import { tr } from '../lib/i18n'

export default function Report() {
  const { db, toast } = useStore()
  const pname = useProjectName()
  const s = portfolioSummary(db)
  const today = todayISO()
  const rows = [...s.live].sort((a, b) => s.metrics.get(a.id)!.score - s.metrics.get(b.id)!.score)
  const lastUpdate = (pid: string) => db.Updates.filter((u) => u.project_id === pid).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))[0]
  const topRisks = db.Risks.filter((r) => r.status !== 'closed' && r.type !== 'decision').sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 6)
  const decisions = db.Risks.filter((r) => r.type === 'decision' && r.status !== 'closed')

  const copyText = () => {
    const lines = [
      `${L('گزارش وضعیت ACG', 'ACG status report')} — ${fmtDate(today, 'long')}`,
      L(
        `پروژه‌های جاری: ${fa(s.live.length)} | سالم: ${fa(s.counts.green)} | نیازمند توجه: ${fa(s.counts.amber)} | در خطر: ${fa(s.counts.red)}`,
        `Live: ${s.live.length} | On track: ${s.counts.green} | At risk: ${s.counts.amber} | Off track: ${s.counts.red}`,
      ),
      L(`میانگین پیشرفت: ${fa(s.avgProgress)}٪`, `Avg. progress: ${s.avgProgress}%`),
      '',
      ...rows.map((p) => {
        const m = s.metrics.get(p.id)!
        return `${m.health === 'red' ? '🔴' : m.health === 'amber' ? '🟡' : '🟢'} ${p.name} — ${fa(`${m.progress}%`)} — ${m.reasons[0].text}`
      }),
      ...(decisions.length ? ['', L('تصمیم‌های مورد نیاز:', 'Decisions needed:'), ...decisions.map((d) => `• ${d.title} (${pname(d.project_id)})`)] : []),
    ]
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast(L('خلاصه‌ی متنی کپی شد', 'Summary copied')))
  }

  return (
    <>
      <Band nav={<HubNav hub="lookout" />}
        title={L('گزارش مدیریتی', 'Executive report')}
        actions={
          <>
            <button className="btn h-10 border border-white/15 text-white" onClick={copyText}>
              <Copy size={15} /> {L('کپی خلاصه', 'Copy summary')}
            </button>
            <button className="btn h-10 bg-white text-band" onClick={() => window.print()}>
              <Printer size={15} /> {L('چاپ / PDF', 'Print / PDF')}
            </button>
          </>
        }
      />
      <Overlap>
        <article className="card mx-auto max-w-5xl overflow-hidden print:border-0 print:shadow-none">
          <header className="bg-band px-10 py-9 text-on-band print:bg-black">
            <div className="flex items-start justify-between">
              <AcgLogo className="h-7 text-white" />
              <div className="text-end font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-band-sub">
                <div>{L('محرمانه · داخلی', 'Confidential · internal')}</div>
                <div className="mt-1 num">{fmtDate(today, 'long')}</div>
              </div>
            </div>
            <h2 className="display mt-10 text-4xl leading-tight">{L('وضعیت پروژه‌های ACG', 'ACG status')}</h2>
            <div className="mt-8 grid grid-cols-2 border-t border-band-line @sm:grid-cols-5">
              {[
                [L('پروژه‌های جاری', 'Live'), fa(s.live.length), ''],
                [L('سالم', 'On track'), fa(s.counts.green), 'text-[#7fe0b0]'],
                [L('نیازمند توجه', 'At risk'), fa(s.counts.amber), 'text-[#f5c565]'],
                [L('در خطر', 'Off track'), fa(s.counts.red), 'text-[#ff8a9a]'],
                [L('میانگین پیشرفت', 'Avg. progress'), `${fa(`${s.avgProgress}%`)}`, ''],
              ].map(([l, v, c]) => (
                <div key={l} className="border-band-line py-4 pe-4 @sm:border-e @sm:ps-4 @sm:first:ps-0 @sm:last:border-e-0">
                  <div className={cx('display text-3xl num', c)}>{v}</div>
                  <div className="mt-1 text-xs text-band-sub">{l}</div>
                </div>
              ))}
            </div>
          </header>

          <div className="space-y-10 px-10 py-9">
            <section>
              <div className="eyebrow mb-3">01 — {L('وضعیت پروژه‌ها', 'Projects')}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-ink">
                    <th className="th !px-0">{L('پروژه', 'Project')}</th>
                    <th className="th">{L('سلامت', 'Health')}</th>
                    <th className="th">{L('ابعاد', 'Dimensions')}</th>
                    <th className="th w-40">{L('پیشرفت', 'Progress')}</th>
                    <th className="th">{L('ددلاین', 'Deadline')}</th>
                    <th className="th">{L('مهم‌ترین نکته', 'Key signal')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((p) => {
                    const m = s.metrics.get(p.id)!
                    return (
                      <tr key={p.id}>
                        <td className="py-3 pe-4">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-[0.6875rem] text-sub">{p.owner}</div>
                        </td>
                        <td className="td">
                          <HealthBadge h={m.health} />
                        </td>
                        <td className="td">
                          <RagStrip a={assess(p, db)} compact />
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <Progress value={m.progress} h={m.health} marker={m.elapsed} />
                            <span className="text-xs num">{fa(`${m.progress}%`)}</span>
                          </div>
                        </td>
                        <td className="td text-xs num">
                          {fmtDate(p.end_date)}
                          <div className={cx(m.daysLeft < 0 ? 'text-bad' : 'text-sub')}>{relDays(p.end_date)}</div>
                        </td>
                        <td className={cx('td text-xs leading-5', healthText[m.health])}>{m.reasons[0].text}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            <section>
              <div className="eyebrow mb-4">02 — {L('روایت مدیران پروژه', 'From the project leads')}</div>
              <div className="space-y-5">
                {rows.map((p) => {
                  const u = lastUpdate(p.id)
                  if (!u) return null
                  return (
                    <div key={p.id} className="border-s-[3px] ps-4" style={{ borderColor: `rgb(var(--${u.health === 'green' ? 'good' : u.health === 'amber' ? 'warn' : 'bad'}))` }}>
                      <div className="text-sm font-semibold">
                        {p.name} <span className="text-xs font-normal text-sub">· {u.author} · {fmtDate(u.week_date)}</span>
                      </div>
                      <div className="mt-1 text-sm leading-7">{u.summary}</div>
                      {u.blockers && (
                        <div className="mt-1 text-xs text-bad">
                          {L('موانع', 'Blockers')}: {u.blockers.split('\n').join(L('، ', ', '))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="grid gap-10 @md:grid-cols-2">
              <div>
                <div className="eyebrow mb-4">03 — {L('ریسک‌ها و مسائل کلیدی', 'Key risks & issues')}</div>
                <ul className="space-y-3">
                  {topRisks.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 text-sm">
                      <span className={cx('mt-0.5 rounded-md px-1.5 text-[0.6875rem] font-bold text-white num', riskScore(r) >= 15 ? 'bg-bad' : riskScore(r) >= 8 ? 'bg-warn' : 'bg-good')}>{fa(riskScore(r))}</span>
                      <div>
                        {r.title} <span className="text-xs text-sub">({lbl(RISK_TYPE, r.type)} · {pname(r.project_id)})</span>
                        <div className="text-xs text-sub">{r.mitigation}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="eyebrow mb-4">04 — {L('تصمیم‌های مورد نیاز', 'Decisions required')}</div>
                {decisions.length ? (
                  <ol className="list-decimal space-y-3 ps-5 text-sm">
                    {decisions.map((d) => (
                      <li key={d.id}>
                        {d.title} <span className="text-xs text-sub">({pname(d.project_id)} · {fmtDate(d.due_date)})</span>
                        <div className="text-xs text-sub">{d.mitigation}</div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-sm text-sub">{L('موردی نیست.', 'None.')}</div>
                )}
                <div className="eyebrow mb-3 mt-8">05 — {L('مایلستون‌های ۳۰ روز آینده', 'Milestones, next 30 days')}</div>
                <ul className="space-y-1.5 text-sm">
                  {s.upcomingMilestones.slice(0, 8).map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-sub num">{fmtDate(m.planned_date)}</span>
                      <span>{m.title}</span>
                      <span className="text-xs text-sub">· {pname(m.project_id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <footer className="flex flex-wrap items-center gap-4 border-t border-line pt-4 text-[0.6875rem] text-sub">
              {(['green', 'amber', 'red'] as const).map((h) => (
                <span key={h} className="flex items-center gap-1.5">
                  <HealthDot h={h} /> {lbl(HEALTH, h)}
                </span>
              ))}
              <span className="ms-auto">{L('ترتیب ابعاد', 'Dimension order')}: {DIMS.map((d) => tr(DIM[d])).join(' · ')}</span>
            </footer>
          </div>
        </article>
      </Overlap>
    </>
  )
}
