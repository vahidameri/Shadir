// Overview: the department at a glance. Its sections (and their order) are a setting:
// back office → settings → overview sections (Config dash.widgets).
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, Ban, CalendarClock, MoonStar, Settings2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, Overlap, Progress, StatStrip, StatusIcon, cx } from '../components/ui'
import { elapsed, quarterLabel, quarterOf, teamOkr } from '../lib/okr'
import { activeSprint, sprintCfg, sprintStats } from '../lib/sprints'
import { L } from '../lib/i18n'
import { useEditor } from '../components/Editor'
import { daysFromToday, fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { can } from '../lib/access'
import { assigneesOf } from '../lib/assignees'
import { catOf, closed, columns, statusLabel } from '../lib/columns'
import { signals } from '../lib/signals'
import { allTeams, teamOf, teamStats } from '../lib/teams'
import { mzClosed, mzSignals, P_COLOR } from '../lib/mizito'
import { DASH_KEY, DASH_WIDGETS, readPicks, type DashWidget } from '../lib/views'
import { Bars, CatBar, Ring, TeamCard, teamColor, teamName } from '../components/TeamParts'
import type { StatusCat } from '../lib/types'

const WIDE: DashWidget[] = ['teams']

export default function Overview() {
  const { db, access, setting } = useStore()
  const { open: edit } = useEditor()
  const today = todayISO()
  const mz = can.mizito(access)
  const picks = readPicks(setting(DASH_KEY), DASH_WIDGETS).filter((p) => p.on && (p.id !== 'mizito' || mz))
  const on = (id: DashWidget) => picks.some((p) => p.id === id)

  const d = useMemo(() => {
    const open = db.Tasks.filter((t) => !closed(t))
    const sig = new Map(open.map((t) => [t.id, signals(t, today)]))
    const teams = allTeams(db).map((id) => teamStats(db, id))
    const byCat = { intake: 0, open: 0, active: 0, waiting: 0, blocked: 0, done: 0, cancelled: 0 } as Record<StatusCat, number>
    db.Tasks.forEach((t) => byCat[catOf(t.status)]++)
    const mzOpen = mz ? db.Mizito.filter((m) => !mzClosed(m)).map((m) => ({ m, s: mzSignals(db, m) })) : []
    return { open, sig, teams, byCat, mzOpen }
  }, [db, today, mz])
  const late = d.open.filter((t) => d.sig.get(t.id)!.late)
  const blocked = d.open.filter((t) => catOf(t.status) === 'blocked')
  const stale = d.open.filter((t) => d.sig.get(t.id)!.stale)
  const doneRecent = d.teams.reduce((a, s) => a + s.doneRecent, 0)
  const onTime = d.open.length ? Math.round(((d.open.length - late.length) / d.open.length) * 100) : 100

  const widgets: Record<DashWidget, () => React.ReactNode> = {
    kpis: () => null, // shown in the band
    sprint: () => {
      const rows = sprintCfg().teams.map((t) => ({ t, s: activeSprint(db, t) }))
      return (
        <Card eyebrow={L('اسپرینت', 'Sprint')} title={L('تیم فنی در این اسپرینت', 'The tech team this sprint')} action={<Link to="/sprints" className="text-xs text-sub hover:text-ink">{L('بورد', 'Board')}</Link>}>
          {rows.every((r) => !r.s) ? (
            <Empty text={L('اسپرینتی در جریان نیست', 'No sprint running')} />
          ) : (
            <ul className="space-y-4">
              {rows.filter((r) => r.s).map(({ t, s }) => {
                const st = sprintStats(db, s!)
                return (
                  <li key={t}>
                    <Link to={`/sprints/${s!.id}`} className="block rounded-xl hover:bg-muted/40">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{s!.name} <span className="text-xs font-normal text-sub">· {teamName(t)}</span></span>
                        <span className="shrink-0 text-xs text-sub num">{L(`${fa(st.daysLeft)} روز مانده`, `${st.daysLeft} days left`)}</span>
                      </div>
                      {s!.goal && <div className="mt-0.5 truncate text-xs text-sub">{s!.goal}</div>}
                      <Progress value={st.pct} marker={st.elapsed} className="mt-2" />
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[0.6875rem] text-sub num">
                        <span>{L(`${fa(st.done)} از ${fa(st.total)} امتیاز`, `${st.done} of ${st.total} pts`)}</span>
                        {st.added.points > 0 && <span className="text-warn">{L(`+${fa(st.added.points)} بعد از شروع`, `+${st.added.points} after start`)}</span>}
                        {st.blocked.length > 0 && <span className="text-bad">{L(`${fa(st.blocked.length)} مسدود`, `${st.blocked.length} blocked`)}</span>}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )
    },
    okr: () => {
      const qq = quarterOf()
      const rows = d.teams.filter((t) => t.id).map((t) => ({ id: t.id, o: teamOkr(db, t.id, qq, t.tasks) }))
      return (
        <Card eyebrow={`OKR · ${quarterLabel(qq)}`} title={L('پیشرفت هدف‌های تیم‌ها', 'Team objectives')} action={<Link to="/okr" className="text-xs text-sub hover:text-ink">{L('همه', 'All')}</Link>}>
          {rows.every((r) => !r.o.objectives.length) ? (
            <Empty text={L('برای این فصل OKR تعریف نشده', 'No OKRs this quarter')} />
          ) : (
            <ul className="space-y-3">
              {rows.map(({ id, o }) => (
                <li key={id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span>{teamName(id)}</span>
                    <span className="text-sub num">
                      {o.objectives.length ? `${fa(o.progress)}٪` : '—'}
                      {o.conf.off_track > 0 && <b className="ms-2 font-medium text-bad">{fa(o.conf.off_track)} {L('عقب', 'off')}</b>}
                      {o.conf.at_risk > 0 && <b className="ms-2 font-medium text-warn">{fa(o.conf.at_risk)} {L('در خطر', 'at risk')}</b>}
                    </span>
                  </div>
                  <Progress value={o.progress} marker={elapsed(qq)} className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )
    },
    teams: () => (
      <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
        {d.teams.filter((s) => s.id || s.tasks.length).map((s) => <TeamCard key={s.id || '-'} id={s.id} stats={s} compact />)}
      </div>
    ),
    status: () => (
      <Card eyebrow={L('تسک‌ها', 'Tasks')} title={L('بر اساس وضعیت', 'By status')} action={<Link to="/tasks?v=all" className="text-xs text-sub hover:text-ink">{L('همه', 'All')}</Link>}>
        <div className="flex items-center gap-5">
          <Ring value={onTime} size={84} color={onTime >= 85 ? 'rgb(var(--ink))' : onTime >= 70 ? 'rgb(var(--warn))' : 'rgb(var(--bad))'} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{L('سهم کارهای باز که از ددلاین عقب نیستند', 'Open work that is not past its deadline')}</div>
            <CatBar by={d.byCat} legend className="mt-3" />
          </div>
        </div>
        <div className="mt-5">
          <Bars rows={columns().filter((c) => catOf(c.id) !== 'cancelled').map((c) => ({ label: statusLabel(c.id), value: db.Tasks.filter((t) => t.status === c.id).length, to: `/tasks?v=all&status=${c.id}` })).filter((r) => r.value)} />
        </div>
      </Card>
    ),
    team_load: () => (
      <Card eyebrow={L('تیم‌ها', 'Teams')} title={L('کار باز، معوق و مسدود', 'Open, late and blocked')}>
        {d.teams.every((s) => !s.open) ? <Empty /> : (
          <ul className="space-y-3">
            {d.teams.filter((s) => s.open).sort((a, b) => b.late + b.blocked - (a.late + a.blocked) || b.open - a.open).map((s) => {
              const max = Math.max(...d.teams.map((x) => x.open), 1)
              const rest = Math.max(0, s.open - s.late - s.blocked)
              return (
                <li key={s.id || '-'}>
                  <Link to={`/tasks?track=${s.id}`} className="block rounded-lg hover:bg-muted/50">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 truncate">{teamName(s.id)}</span>
                      <span className="shrink-0 text-sub num">
                        {fa(s.open)} {L('باز', 'open')}
                        {s.late > 0 && <b className="ms-2 font-medium text-bad">{fa(s.late)} {L('معوق', 'late')}</b>}
                        {s.blocked > 0 && <b className="ms-2 font-medium text-bad">{fa(s.blocked)} {L('مسدود', 'blocked')}</b>}
                      </span>
                    </div>
                    <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-ink/[0.06]" style={{ width: `${Math.max(8, (s.open / max) * 100)}%` }}>
                      <span style={{ width: `${(s.late / s.open) * 100}%`, background: 'rgb(var(--bad))' }} />
                      <span style={{ width: `${(s.blocked / s.open) * 100}%`, background: 'rgb(var(--bad) / 0.4)' }} />
                      <span style={{ width: `${(rest / s.open) * 100}%`, background: teamColor(s.id) }} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    ),
    mizito: () => {
      const byP = [0, 1, 2, 3].map((p) => d.mzOpen.filter((x) => x.s.p === p).length)
      const breached = d.mzOpen.filter((x) => x.s.breached).length
      return (
        <Card eyebrow={<span className="flex items-center gap-1.5"><AtSign size={12} /> {L('میزیتو', 'Mizito')}</span>} title={L('باز بر اساس اولویت', 'Open by priority')} action={<Link to="/mizito" className="text-xs text-sub hover:text-ink">{L('صف میزیتو', 'Mizito queue')}</Link>}>
          <div className="grid grid-cols-4 gap-2">
            {byP.map((n, p) => (
              <Link key={p} to={`/mizito?v=${p === 0 ? 'p0' : 'queue'}`} className="rounded-2xl border border-line p-3 text-center transition hover:bg-muted/50">
                <div className="font-mono text-xs font-bold" style={{ color: P_COLOR[p] }}>P{p}</div>
                <div className="display mt-1 text-2xl num">{fa(n)}</div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
            <span>{L('کل باز', 'Open')}: <b className="text-ink num">{fa(d.mzOpen.length)}</b></span>
            <span className={cx(breached > 0 && 'text-bad')}>{L('عبور از SLA', 'SLA breached')}: <b className="num">{fa(breached)}</b></span>
            <span>{L('راکد', 'Quiet')}: <b className="text-ink num">{fa(d.mzOpen.filter((x) => x.s.stale).length)}</b></span>
          </div>
        </Card>
      )
    },
    people: () => {
      const map = new Map<string, { n: number; late: number }>()
      d.open.forEach((t) => assigneesOf(t).forEach((p) => {
        const r = map.get(p) || { n: 0, late: 0 }
        r.n++
        if (d.sig.get(t.id)!.late) r.late++
        map.set(p, r)
      }))
      const rows = [...map].sort((a, b) => b[1].n - a[1].n).slice(0, 10)
      return (
        <Card eyebrow={L('افراد', 'People')} title={L('بار کاری (تسک باز)', 'Workload (open tasks)')}>
          {rows.length === 0 ? <Empty /> : <Bars rows={rows.map(([p, r]) => ({ label: p, value: r.n, sub: r.late ? L(`${fa(r.late)} معوق`, `${r.late} late`) : undefined, color: r.late ? 'rgb(var(--bad))' : undefined, to: `/tasks?assignee=${encodeURIComponent(p)}` }))} />}
        </Card>
      )
    },
    upcoming: () => {
      const rows = [
        ...d.open.filter((t) => t.due_date && daysFromToday(t.due_date) >= 0 && daysFromToday(t.due_date) <= 7).map((t) => ({ id: t.id, date: t.due_date, title: t.title, sub: assigneesOf(t).join('، '), icon: <StatusIcon s={t.status} size={14} />, to: '', go: () => edit('Tasks', t as never) })),
        ...d.mzOpen.filter((x) => x.m.due_date && daysFromToday(x.m.due_date) >= 0 && daysFromToday(x.m.due_date) <= 7).map(({ m, s }) => ({ id: m.id, date: m.due_date, title: m.title, sub: L('میزیتو', 'Mizito'), icon: <AtSign size={14} style={{ color: P_COLOR[s.p] }} />, to: `/mizito?id=${m.id}` })),
      ].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12)
      return (
        <Card eyebrow={<span className="flex items-center gap-1.5"><CalendarClock size={12} /> {L('۷ روز آینده', 'Next 7 days')}</span>} title={L('ددلاین‌های پیش‌رو', 'Upcoming deadlines')} action={<Link to="/calendar" className="text-xs text-sub hover:text-ink">{L('تقویم', 'Calendar')}</Link>}>
          {rows.length === 0 ? <Empty text={L('ددلاینی در ۷ روز آینده نیست', 'No deadlines in the next 7 days')} /> : <List rows={rows} today={today} />}
        </Card>
      )
    },
    blocked: () => {
      const rows = [
        ...blocked.map((t) => ({ id: t.id, title: t.title, sub: `${teamName(teamOf(t, db))} · ${L(`${fa(d.sig.get(t.id)!.blockedDays || 0)} روز مسدود`, `blocked ${d.sig.get(t.id)!.blockedDays || 0}d`)}`, icon: <Ban size={14} className="text-bad" />, to: '', go: () => edit('Tasks', t as never) })),
        ...stale.filter((t) => catOf(t.status) !== 'blocked').map((t) => ({ id: t.id, title: t.title, sub: `${teamName(teamOf(t, db))} · ${L(`${fa(d.sig.get(t.id)!.staleDays || 0)} روز بی‌تغییر`, `quiet ${d.sig.get(t.id)!.staleDays || 0}d`)}`, icon: <MoonStar size={14} className="text-sub" />, to: '', go: () => edit('Tasks', t as never) })),
      ].slice(0, 12)
      return (
        <Card eyebrow={L('نیازمند توجه', 'Needs attention')} title={L('مسدودها و راکدها', 'Blocked & quiet')}>
          {rows.length === 0 ? <Empty text={L('چیزی گیر نکرده', 'Nothing is stuck')} /> : <List rows={rows} today={today} />}
        </Card>
      )
    },
  }

  return (
    <>
      <Band
        title={L('نمای کلی', 'Overview')}
        sub={L('وضعیت دپارتمان محصول و فناوری در یک نگاه', 'The product & technology department at a glance')}
        actions={access === 'super' && (
          <Link to="/admin?tab=settings" className="btn h-10 w-10 bg-white/10 px-0 text-white hover:bg-white/20" title={L('بخش‌های این صفحه', 'Sections on this page')} aria-label={L('بخش‌های این صفحه', 'Sections on this page')}>
            <Settings2 size={17} />
          </Link>
        )}
      >
        {on('kpis') && (
          <StatStrip
            items={[
              { label: L('تسک باز', 'Open tasks'), value: fa(d.open.length) },
              { label: L('معوق', 'Overdue'), value: fa(late.length), tone: late.length ? 'red' : 'green' },
              { label: L('مسدود', 'Blocked'), value: fa(blocked.length), tone: blocked.length ? 'amber' : 'green' },
              { label: L('راکد', 'Quiet'), value: fa(stale.length), tone: stale.length ? 'amber' : 'green' },
              { label: L('انجام‌شده‌ی اخیر', 'Done recently'), value: fa(doneRecent), tone: 'green' },
              mz
                ? { label: L('میزیتو باز', 'Open Mizito'), value: fa(d.mzOpen.length), tone: d.mzOpen.some((x) => x.s.p === 0 || x.s.breached) ? 'red' : 'muted' }
                : { label: L('تیم‌های قرمز', 'Red teams'), value: fa(d.teams.filter((s) => s.health === 'red').length), tone: d.teams.some((s) => s.health === 'red') ? 'red' : 'green' },
            ]}
          />
        )}
      </Band>
      <Overlap>
        {picks.length === 0 || (picks.length === 1 && on('kpis')) ? (
          <div className="card p-6"><Empty text={L('همه‌ی بخش‌ها در تنظیمات خاموش‌اند', 'Every section is switched off in settings')} /></div>
        ) : (
          <div className="stagger grid gap-4 @xl:grid-cols-2">
            {picks.filter((p) => p.id !== 'kpis').map((p) => (
              <div key={p.id} className={cx('min-w-0', WIDE.includes(p.id) && "@xl:col-span-2")}>
                {widgets[p.id]()}
              </div>
            ))}
          </div>
        )}
      </Overlap>
    </>
  )
}

type Row = { id: string; title: string; sub: string; icon: React.ReactNode; to: string; go?: () => void; date?: string }
function List({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <ul className="-mx-2 space-y-0.5">
      {rows.map((r) => (
        <li key={r.id}>
          <Item r={r}>
            <span className="mt-0.5 shrink-0">{r.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{r.title}</span>
              <span className="block truncate text-[0.6875rem] text-sub">{r.sub}</span>
            </span>
            {r.date && <span className={cx('shrink-0 text-[0.6875rem]', r.date === today ? 'font-medium text-warn' : 'text-sub')}>{r.date === today ? L('امروز', 'Today') : fmtDayMonth(r.date)}</span>}
          </Item>
        </li>
      ))}
    </ul>
  )
}

const rowCls = 'flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-start transition hover:bg-muted'
function Item({ r, children }: { r: Row; children: React.ReactNode }) {
  return r.go ? <button className={rowCls} onClick={r.go}>{children}</button> : <Link to={r.to} className={rowCls}>{children}</Link>
}
