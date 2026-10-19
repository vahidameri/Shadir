import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BellRing, PenLine, ArrowLeft, ArrowRight, Check, Clock, Send } from 'lucide-react'
import { can } from '../lib/access'
import { useStore } from '../lib/store'
import { Band, Card, Empty, Overlap, StatStrip, Avatar, HealthDot, cx } from '../components/ui'
import { UpdateCard } from '../components/widgets'
import { WeekNav } from '../components/WeekNav'
import { useComposer, lastUpdate } from '../components/UpdateComposer'
import { uid } from '../lib/api'
import { addDays, fa, fmtDayMonth, fmtWeekday, todayISO } from '../lib/jalali'
import { L, locale } from '../lib/i18n'
import { inWeek, updateDue, weekStart, weeksFrom } from '../lib/weeks'
import type { Health, Project, Update } from '../lib/types'

const rank: Record<Health, number> = { green: 0, amber: 1, red: 2 }
type Row = { p: Project; u?: Update; prev?: Update; state: 'on_time' | 'late' | 'pending' | 'missing' }

/** Weekly update cycle: who has reported, who is late, what changed — and one click to report. */
export default function Updates() {
  const { db, canEdit, upsert, toast, me, access } = useStore()
  const { openComposer } = useComposer()
  const today = todayISO()
  const [ws, setWs] = useState(weekStart())
  const due = updateDue(ws)
  const isCurrent = ws === weekStart()
  const expected = db.Projects.filter((p) => p.status === 'active')

  const rows: Row[] = expected.map((p) => {
    const u = db.Updates.filter((x) => x.project_id === p.id && inWeek(x.week_date, ws)).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))[0]
    const prev = lastUpdate(db.Updates, p.id, ws)
    const state: Row['state'] = u ? (u.week_date <= due ? 'on_time' : 'late') : today > due || ws < weekStart() ? 'missing' : 'pending'
    return { p, u, prev, state }
  })
  const submitted = rows.filter((r) => r.u)
  const missing = rows.filter((r) => r.state === 'missing')
  const pending = rows.filter((r) => r.state === 'pending')
  const late = rows.filter((r) => r.state === 'late')
  const better = submitted.filter((r) => r.prev && rank[r.u!.health] < rank[r.prev.health])
  const worse = submitted.filter((r) => r.prev && rank[r.u!.health] > rank[r.prev.health])
  const asks = submitted.filter((r) => String(r.u!.blockers || '').trim())
  const pct = expected.length ? Math.round((submitted.length / expected.length) * 100) : 0

  const remind = async (r: Row) => {
    const subject = L(`گزارش هفتگی ${r.p.name}`, `${r.p.name} weekly update`)
    if (db.FollowUps.some((f) => f.subject === subject && f.status !== 'done')) return toast(L('یادآوری قبلاً ثبت شده', 'Reminder already exists'))
    await upsert('FollowUps', {
      id: uid('F'), project_id: r.p.id, subject, person: r.p.owner, channel: 'chat', due_date: today, status: 'open', priority: 'high',
      notes: L(`مهلت ارسال: ${fmtWeekday(due)} ${fmtDayMonth(due)}`, `Due: ${fmtWeekday(due)} ${fmtDayMonth(due)}`), created_at: today, done_at: '', owner: me,
    })
    toast(L(`یادآوری برای ${r.p.owner} در پیگیری‌ها ثبت شد`, `Reminder for ${r.p.owner} added to follow-ups`))
  }
  const remindAll = async () => {
    for (const r of [...missing, ...pending]) await remind(r)
  }

  const weekUpdates = submitted.map((r) => r.u!).sort((a, b) => rank[b.health] - rank[a.health])
  const Arrow = locale.lang === 'fa' ? ArrowLeft : ArrowRight

  return (
    <>
      <Band
        title={L('گزارش‌های هفتگی', 'Weekly updates')}
        actions={
          <>
            <WeekNav ws={ws} onChange={setWs} />
            {isCurrent && can.backoffice(access) && (
              <Link to="/telegram" className="btn h-10 border border-white/20 text-white hover:bg-white/10">
                <Send size={15} className="rtl:-scale-x-100" /> {L('از تلگرام', 'From Telegram')}
              </Link>
            )}
            {canEdit && isCurrent && (
              <button className="btn h-10 bg-white text-band" onClick={() => openComposer({ projectId: expected.find((p) => p.owner === me)?.id })}>
                <Plus size={16} /> {L('ثبت گزارش', 'Submit update')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('ارسال‌شده', 'Submitted'), value: `${fa(submitted.length)}/${fa(expected.length)}`, sub: `${fa(`${pct}%`)}`, tone: pct === 100 ? 'green' : undefined },
            { label: isCurrent && today <= due ? L('در انتظار', 'Pending') : L('ارسال نشده', 'Missing'), value: fa(missing.length + pending.length), tone: missing.length ? 'red' : pending.length ? 'amber' : 'green' },
            { label: L('با تأخیر', 'Late'), value: fa(late.length), tone: late.length ? 'amber' : undefined },
            { label: L('بهتر از هفته‌ی قبل', 'Better than last week'), value: fa(better.length), tone: better.length ? 'green' : undefined },
            { label: L('بدتر از هفته‌ی قبل', 'Worse than last week'), value: fa(worse.length), tone: worse.length ? 'red' : undefined },
            { label: L('درخواست کمک / مانع', 'Blockers raised'), value: fa(asks.length), tone: asks.length ? 'amber' : undefined },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <Card
          eyebrow={L(`مهلت: ${fmtWeekday(due)} ${fmtDayMonth(due)}`, `Due ${fmtWeekday(due)} ${fmtDayMonth(due)}`)}
          title={L('وضعیت ارسال گزارش‌ها', 'Submission status')}
          action={
            canEdit && missing.length + pending.length > 0 && isCurrent ? (
              <button className="btn-outline btn-sm" onClick={remindAll}>
                <BellRing size={14} /> {L(`یادآوری به ${fa(missing.length + pending.length)} نفر`, `Remind ${missing.length + pending.length}`)}
              </button>
            ) : undefined
          }
        >
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-muted">
            <span className="bg-good" style={{ width: `${(rows.filter((r) => r.state === 'on_time').length / Math.max(1, rows.length)) * 100}%` }} />
            <span className="bg-warn" style={{ width: `${(late.length / Math.max(1, rows.length)) * 100}%` }} />
            <span className="bg-bad" style={{ width: `${(missing.length / Math.max(1, rows.length)) * 100}%` }} />
          </div>
          <div className="grid gap-2.5 @lg:grid-cols-2 @2xl:grid-cols-3 @3xl:grid-cols-4">
            {rows
              .sort((a, b) => ['missing', 'pending', 'late', 'on_time'].indexOf(a.state) - ['missing', 'pending', 'late', 'on_time'].indexOf(b.state))
              .map((r) => (
                <SubmissionTile key={r.p.id} r={r} canEdit={canEdit && isCurrent} onWrite={() => openComposer(r.u ? { update: r.u } : { projectId: r.p.id })} onRemind={() => remind(r)} Arrow={Arrow} />
              ))}
          </div>
        </Card>

        <HealthHistory />

        <div className="flex items-baseline justify-between px-1 pt-2">
          <h3 className="text-[0.9375rem] font-semibold">{L('گزارش‌های این هفته', 'This week’s updates')}</h3>
          <Link to="/report" className="text-xs font-medium text-sub hover:text-ink">
            {L('گزارش مدیریتی قابل چاپ', 'Printable executive report')} →
          </Link>
        </div>
        <div className="stagger space-y-4">
          {weekUpdates.length ? (
            weekUpdates.map((u) => <UpdateCard key={u.id} u={u} showProject />)
          ) : (
            <Card>
              <Empty text={L('برای این هفته هنوز گزارشی ثبت نشده', 'No updates for this week yet')} />
            </Card>
          )}
        </div>
      </Overlap>
    </>
  )
}

function SubmissionTile({ r, canEdit, onWrite, onRemind, Arrow }: { r: Row; canEdit: boolean; onWrite: () => void; onRemind: () => void; Arrow: typeof ArrowLeft }) {
  const tone = {
    on_time: ['border-line', 'bg-good/10 text-good', L('به‌موقع', 'On time')],
    late: ['border-warn/30', 'bg-warn/12 text-warn', L('با تأخیر', 'Late')],
    pending: ['border-dashed border-line-strong', 'bg-muted text-sub', L('در انتظار', 'Pending')],
    missing: ['border-bad/30 bg-bad/[0.03]', 'bg-bad/10 text-bad', L('ارسال نشده', 'Missing')],
  }[r.state]
  return (
    <div className={cx('flex flex-col rounded-2xl border p-3.5', tone[0])}>
      <div className="flex items-center gap-2.5">
        <Avatar name={r.p.owner} size="sm" />
        <div className="min-w-0 flex-1">
          <Link to={`/projects/${r.p.id}`} className="block truncate text-sm font-semibold hover:underline">
            {r.p.name}
          </Link>
          <div className="truncate text-[0.6875rem] text-sub">{r.p.owner}</div>
        </div>
        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium', tone[1])}>
          {r.state === 'on_time' ? <Check size={10} /> : <Clock size={10} />}
          {tone[2]}
        </span>
      </div>
      {r.u ? (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[0.6875rem] text-sub">
            {r.prev && (
              <>
                <HealthDot h={r.prev.health} />
                <Arrow size={11} />
              </>
            )}
            <HealthDot h={r.u.health} />
            <span className="ms-1 num">{fmtDayMonth(r.u.week_date)}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink/80">{r.u.summary}</p>
        </>
      ) : (
        <p className="mt-3 text-xs leading-5 text-sub">
          {r.prev ? L(`آخرین گزارش: ${fmtDayMonth(r.prev.week_date)}`, `Last report: ${fmtDayMonth(r.prev.week_date)}`) : L('تا حالا گزارشی نداده', 'Never reported')}
        </p>
      )}
      {canEdit && (
        <div className="mt-auto flex gap-1.5 pt-3">
          <button className="btn-tonal btn-sm flex-1" onClick={onWrite}>
            <PenLine size={13} /> {r.u ? L('ویرایش', 'Edit') : L('ثبت گزارش', 'Write')}
          </button>
          {!r.u && (
            <button className="btn-outline btn-sm" onClick={onRemind} title={L('یادآوری به مدیر محصول پروژه', 'Remind the lead')}>
              <BellRing size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Health per project across the last 8 weeks — reads like a heat strip. */
function HealthHistory() {
  const { db } = useStore()
  const weeks = weeksFrom(addDays(weekStart(), -7 * 7), 8)
  const projects = db.Projects.filter((p) => p.status === 'active')
  const cell: Record<Health, string> = { green: 'bg-good/70', amber: 'bg-warn', red: 'bg-bad' }
  return (
    <Card eyebrow={L('روند', 'Trend')} title={L('وضعیت گزارش‌شده در ۸ هفته‌ی اخیر', 'Reported status, last 8 weeks')}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[36rem] items-center gap-x-1.5 gap-y-1.5" style={{ gridTemplateColumns: `minmax(8rem,12rem) repeat(${weeks.length}, minmax(2rem,1fr))` }}>
          <span />
          {weeks.map((w) => (
            <span key={w} className="text-center text-[0.625rem] text-sub num">
              {fmtDayMonth(w)}
            </span>
          ))}
          {projects.map((p) => (
            <div key={p.id} className="contents">
              <Link to={`/projects/${p.id}`} className="truncate text-xs font-medium hover:underline">
                {p.name}
              </Link>
              {weeks.map((w) => {
                const u = db.Updates.filter((x) => x.project_id === p.id && inWeek(x.week_date, w)).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))[0]
                return <span key={w} className={cx('h-6 rounded-md', u ? cell[u.health] : 'border border-dashed border-line-strong')} title={u ? u.summary : L('بدون گزارش', 'No update')} />
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
