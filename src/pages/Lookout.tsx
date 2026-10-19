// Lookout (دیده‌بان) — the leadership desk of the program manager, the CEO and the heads: where the
// portfolio stands, this week's deliveries, the hand-offs between sides, and every task they follow.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Binoculars, PackageCheck, Repeat, UserRound } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { HubNav } from '../components/HubNav'
import { Avatar, AvatarStack, Band, Card, Due, Empty, HealthDot, Overlap, Segmented, StatStrip, StatusIcon, cx } from '../components/ui'
import { DeliveredButton, DeliveryHistory, DeliveryWeek, stateTone } from '../components/DeliveryDay'
import { HandoffCard } from '../components/Handoffs'
import { WEEK_STATE, deliveryDate, hasDeliveryDay, needsAttention, weekState } from '../lib/cadence'
import { bucketOf, isLate, nextDate, tracking, type Bucket } from '../lib/radar'
import { isReturn, recent, stuck as sittingTasks } from '../lib/handoffs'
import { assigneesOf, isAssignee } from '../lib/assignees'
import { portfolioSummary } from '../lib/metrics'
import { TRACK, TRACKS, sideColor, trackStats } from '../lib/tracks'
import { fa, fmtDate, fmtDayMonth, relDays, todayISO } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import { usePref } from '../lib/prefs'
import type { Task } from '../lib/types'

const BUCKETS: { id: Bucket; label: () => string; tone: string }[] = [
  { id: 'late', label: () => L('عقب افتاده', 'Late'), tone: 'text-bad' },
  { id: 'today', label: () => L('امروز', 'Today'), tone: 'text-warn' },
  { id: 'blocked', label: () => L('مسدود', 'Blocked'), tone: 'text-bad' },
  { id: 'week', label: () => L('۷ روز آینده', 'Next 7 days'), tone: 'text-ink' },
  { id: 'later', label: () => L('بعداً / بدون تاریخ', 'Later / undated'), tone: 'text-sub' },
]

export default function Lookout() {
  const { db, me } = useStore()
  const { open } = useEditor()
  const [scope, setScope] = usePref<'mine' | 'all'>('acg.radar.scope', 'mine')
  const [who, setWho] = useState('')
  const today = todayISO()
  const s = portfolioSummary(db)

  const pool = useMemo(() => db.Tasks.filter((t) => t.status !== 'done' && (scope === 'all' || tracking(t, me))), [db.Tasks, scope, me])
  const list = pool.filter((t) => !who || (who === '-' ? !t.assignee : isAssignee(t, who)))
  const people = useMemo(() => {
    const m = new Map<string, { open: number; late: number }>()
    pool.forEach((t) =>
      (assigneesOf(t).length ? assigneesOf(t) : ['-']).forEach((k) => {
        const v = m.get(k) || { open: 0, late: 0 }
        v.open++
        if (isLate(t, today)) v.late++
        m.set(k, v)
      }),
    )
    return [...m.entries()].sort((a, b) => b[1].late - a[1].late || b[1].open - a[1].open)
  }, [pool, today])
  const by = (b: Bucket) => list.filter((t) => bucketOf(t, today) === b)

  const deliveries = db.Projects.filter(hasDeliveryDay).sort((a, b) => deliveryDate(a).localeCompare(deliveryDate(b)))
  const deliveryAlerts = deliveries.filter((p) => needsAttention(weekState(p, db)))
  const last14 = recent(db)
  const returned = last14.filter(isReturn)
  const sitting = sittingTasks(db).map((x) => x.h)
  const stuck = [...returned, ...sitting.filter((h) => !returned.includes(h))]
  const attention = s.live
    .map((p) => ({ p, m: s.metrics.get(p.id)! }))
    .filter((x) => x.m.health !== 'green')
    .sort((a, b) => a.m.score - b.m.score)
    .slice(0, 6)
  const openTask = (id: string) => {
    const t = db.Tasks.find((x) => x.id === id)
    if (t) open('Tasks', t as never)
  }

  return (
    <>
      <Band nav={<HubNav hub="lookout" />}
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Binoculars size={12} /> {L('اطلس · دید از بالا', 'Atlas · the view from above')}
          </span>
        }
        title={L('دیده‌بان', 'Lookout')}
        sub={L('وضعیت کل ACG، تحویل‌های این هفته، رفت و برگشت بین واحدها و هر کاری که زیر نظر دارید — یکجا.', 'All of ACG, this week’s deliveries, the hand-offs between units and everything you watch — in one place.')}
        actions={<Segmented dark value={scope} onChange={setScope} options={[{ value: 'mine', label: L('زیر نظرِ من', 'My tracking') }, { value: 'all', label: L('همه‌ی تیم', 'Whole team') }]} />}
      >
        <StatStrip
          items={[
            { label: L('پروژه‌ی در خطر', 'Projects off track'), value: fa(s.counts.red), tone: s.counts.red ? 'red' : 'green', sub: L(`${fa(s.counts.amber)} نیازمند توجه · ${fa(s.live.length)} جاری`, `${s.counts.amber} at risk · ${s.live.length} live`) },
            { label: L('تحویل هفتگی نیازمند توجه', 'Weekly deliveries to watch'), value: fa(deliveryAlerts.length), tone: deliveryAlerts.length ? 'amber' : 'green', sub: L(`${fa(deliveries.length)} پروژه با روز تحویل`, `${deliveries.length} with a delivery day`) },
            { label: L('مانده در یک واحد (۳+ روز)', 'Sitting in a unit (3+ days)'), value: fa(sitting.length), tone: sitting.length ? 'amber' : undefined },
            { label: L('برگشت‌ها در ۱۴ روز اخیر', 'Returns, last 14 days'), value: fa(returned.length), tone: returned.length ? 'red' : undefined },
            { label: L('کارهای زیر نظر که عقب افتاده‌اند', 'Tracked and late'), value: fa(pool.filter((t) => isLate(t, today)).length), tone: pool.some((t) => isLate(t, today)) ? 'red' : undefined, sub: L(`${fa(pool.length)} در دیده‌بان`, `${pool.length} on the Lookout`) },
            { label: L('امروز', 'Today'), value: fa(pool.filter((t) => bucketOf(t, today) === 'today').length), tone: 'amber' },
          ]}
        />
      </Band>
      <Overlap className="space-y-4">
        <div className="grid gap-4 @3xl:grid-cols-2">
          <Card eyebrow={<span className="flex items-center gap-1.5"><PackageCheck size={12} /> {L('این هفته', 'This week')}</span>} title={L('روز تحویل پروژه‌ها', 'Project delivery days')}>
            <DeliveryWeek />
            {deliveries.length > 0 && (
              <ul className="mt-4 divide-y divide-line">
                {deliveries.map((p) => {
                  const st = weekState(p, db) || 'upcoming'
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" dir="auto">{p.name}</div>
                        <div className="truncate text-[0.6875rem] text-sub">{p.owner || '—'} · {fmtDayMonth(deliveryDate(p))}</div>
                      </Link>
                      <DeliveryHistory p={p} n={6} />
                      <span className={cx('rounded-full px-2 text-[0.625rem] font-medium leading-5', stateTone[st])}>{lbl(WEEK_STATE, st)}</span>
                      <DeliveredButton p={p} small />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card eyebrow={L('ACG', 'ACG')} title={L('پروژه‌های نیازمند توجه', 'Projects needing attention')} action={<Link to="/" className="text-xs text-sub hover:text-ink">{L('نمای کلی ←', 'Overview →')}</Link>}>
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted">
              {(['green', 'amber', 'red'] as const).map((h) => (
                <span key={h} className={h === 'green' ? 'bg-good' : h === 'amber' ? 'bg-warn' : 'bg-bad'} style={{ width: `${s.live.length ? (s.counts[h] / s.live.length) * 100 : 0}%` }} />
              ))}
            </div>
            {!attention.length ? (
              <Empty text={L('همه‌ی پروژه‌ها سالم هستند', 'Every project is on track')} />
            ) : (
              <ul className="-mx-2 divide-y divide-line">
                {attention.map(({ p, m }) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/50">
                      <HealthDot h={m.health} pulse />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" dir="auto">{p.name}</div>
                        <div className="truncate text-[0.6875rem] text-sub">{m.reasons.filter((r) => r.level !== 'green').map((r) => r.text).slice(0, 2).join(L('؛ ', '; ')) || p.owner}</div>
                      </div>
                      <span className="text-xs text-sub num">{fa(m.progress)}٪</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card eyebrow={L('واحدها', 'Units')} title={L('پروداکت، دیزاین، تک', 'Product, design, tech')} action={<Link to="/teams" className="text-xs text-sub hover:text-ink">{L('همه‌ی تحویل‌ها ←', 'All hand-offs →')}</Link>}>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(TRACKS.length, 3)}, minmax(0,1fr))` }}>
              {TRACKS.map((t) => {
                const st = trackStats(db, t)
                const inbox = last14.filter((h) => h.to_side === t).length
                const back = returned.filter((h) => h.to_side === t).length
                return (
                  <div key={t} className="rounded-2xl border border-line p-3" style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${sideColor(t)} 8%, transparent), transparent 70%)` }}>
                    <div className="text-sm font-semibold" style={{ color: sideColor(t) }}>{lbl(TRACK, t)}</div>
                    <div className="display mt-1 text-2xl num">{fa(st.open)}</div>
                    <div className="text-[0.625rem] text-sub">{L('کار باز', 'open')}</div>
                    <div className="mt-2 space-y-0.5 text-[0.6875rem]">
                      <div className={cx(st.overdue ? 'text-bad' : 'text-sub')}>{L(`${fa(st.overdue)} معوق`, `${st.overdue} overdue`)}</div>
                      <div className={cx(inbox ? 'text-warn' : 'text-sub')}>{L(`${fa(inbox)} تحویل به این واحد`, `${inbox} handed in`)}</div>
                      <div className={cx(back ? 'text-bad' : 'text-sub')}>{L(`${fa(back)} برگشت به این واحد`, `${back} came back here`)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
          <Card eyebrow={<span className="flex items-center gap-1.5"><Repeat size={12} /> {L('رفت و برگشت', 'Back and forth')}</span>} title={L(`${fa(stuck.length)} مورد نیازمند پیگیری`, `${stuck.length} to chase`)}>
            {!stuck.length ? (
              <Empty text={L('برگشت یا تسک مانده‌ای نیست', 'No returns or stuck tasks')} />
            ) : (
              <div className="grid gap-2">
                {stuck.slice(0, 6).map((h) => (
                  <HandoffCard key={h.id} h={h} held={!isReturn(h)} onOpen={() => openTask(h.task_id)} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {people.length > 1 && (
          <div className="card flex flex-wrap items-center gap-1.5 p-3">
            <button aria-pressed={!who} className="chip-btn" onClick={() => setWho('')}>
              {L('همه', 'Everyone')} · {fa(pool.length)}
            </button>
            {people.map(([name, v]) => (
              <button key={name} aria-pressed={who === name} className="chip-btn inline-flex items-center gap-1.5" onClick={() => setWho(who === name ? '' : name)}>
                {name !== '-' ? <Avatar name={name} size="xs" /> : <UserRound size={12} />}
                {name !== '-' ? name : L('بدون مسئول', 'Unassigned')} · {fa(v.open)}
                {v.late > 0 && <span className="text-bad">({fa(v.late)})</span>}
              </button>
            ))}
          </div>
        )}
        {!list.length ? (
          <Card>
            <Empty text={scope === 'mine' ? L('چیزی در دیده‌بان شما نیست. در هر تسک «زیر نظر در دیده‌بان» را بزنید، یا تسکی به کسی بسپارید.', 'Nothing on your Lookout. Press “Track on my Lookout” on any task, or hand a task to someone.') : L('تسک بازی نیست', 'No open tasks')} />
          </Card>
        ) : (
          BUCKETS.map((b) => {
            const rows = by(b.id)
            if (!rows.length) return null
            return (
              <Card key={b.id} pad={false} title={<span className={b.tone}>{b.label()} · {fa(rows.length)}</span>}>
                <ul className="divide-y divide-line">
                  {rows.map((t) => (
                    <LookoutRow key={t.id} t={t} onOpen={() => open('Tasks', t as never)} />
                  ))}
                </ul>
              </Card>
            )
          })
        )}
        <p className="text-center text-[0.6875rem] text-sub">{L(`به‌روز ${fmtDate(today)}`, `As of ${fmtDate(today)}`)}</p>
      </Overlap>
    </>
  )
}

function LookoutRow({ t, onOpen }: { t: Task; onOpen: () => void }) {
  const { db } = useStore()
  const n = nextDate(t)
  const code = db.Projects.find((p) => p.id === t.project_id)?.code
  const pass = db.Handoffs.filter((h) => h.task_id === t.id).slice(-1)[0]
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-3 text-start transition hover:bg-muted/40">
        <StatusIcon s={t.status} size={15} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{t.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-sub">
            {code && <span className="font-mono uppercase" dir="ltr">{code}</span>}
            {t.area && <span>{t.area}</span>}
            {n && <span className={cx(n.d < todayISO() && 'text-bad')}>{n.label} · {relDays(n.d)}</span>}
            {pass && isReturn(pass) && <span className="text-bad">{L(`برگشت از ${lbl(TRACK, pass.from_side)} به ${lbl(TRACK, pass.to_side)}`, `back from ${lbl(TRACK, pass.from_side)} to ${lbl(TRACK, pass.to_side)}`)}</span>}
          </div>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-sub sm:flex">
          <AvatarStack names={assigneesOf(t)} max={2} /> {assigneesOf(t).join('، ') || L('بدون مسئول', 'Unassigned')}
        </span>
        <Due iso={t.deadline || t.due_date} done={false} />
      </button>
    </li>
  )
}
