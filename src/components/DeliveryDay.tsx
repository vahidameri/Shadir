// Weekly delivery day: badge, the "record this week" popover, the last weeks as dots, and the week strip.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck } from 'lucide-react'
import type { DeliveryStatus, Project, WeeklyDelivery } from '../lib/types'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { DAYS, WEEK_STATE, deliveryDate, everyDay, hasDeliveryDay, history, onTimeRate, recordOf, weekLine, weekState, type WeekState } from '../lib/cadence'
import { L, lbl, tr } from '../lib/i18n'
import { addDays, fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { weekStart } from '../lib/weeks'
import { Popover, cx } from './ui'

export const stateTone: Record<WeekState, string> = {
  delivered: 'bg-good/10 text-good',
  partial: 'bg-warn/12 text-warn',
  skipped: 'bg-muted text-sub',
  today: 'bg-warn/15 text-warn',
  soon: 'bg-brand-soft/50 text-ink',
  upcoming: 'bg-muted text-sub',
  late: 'bg-bad/10 text-bad',
  missed: 'bg-bad/10 text-bad',
}
const dotTone: Record<WeekState, string> = {
  delivered: 'bg-good', partial: 'bg-warn', skipped: 'bg-line-strong', today: 'bg-warn', soon: 'bg-brand', upcoming: 'bg-line-strong', late: 'bg-bad', missed: 'bg-bad',
}

export function DeliveryBadge({ p, dark }: { p: Project; dark?: boolean }) {
  const { db } = useStore()
  const st = weekState(p, db)
  if (!st) return null
  return (
    <span title={everyDay(p) ? L(`روز تحویل: ${everyDay(p)}`, `Delivery day: ${everyDay(p)}`) : undefined} className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[0.6875rem] font-medium', dark ? 'bg-white/10 text-white' : stateTone[st])}>
      <PackageCheck size={12} className="shrink-0" /> {weekLine(p, st)}
    </span>
  )
}

/** The last weeks as dots (oldest first) and the on-time rate. */
export function DeliveryHistory({ p, n = 8 }: { p: Project; n?: number }) {
  const { db } = useStore()
  if (!hasDeliveryDay(p)) return null
  const rate = onTimeRate(p, db, n)
  return (
    <span className="inline-flex items-center gap-1" title={L('هفته‌های اخیر', 'Recent weeks')}>
      {history(p, db, n).map((h) => (
        <span key={h.ws} title={`${fmtDayMonth(h.ws)} · ${h.state ? lbl(WEEK_STATE, h.state) : '—'}`} className={cx('h-2 w-2 rounded-full', h.state ? dotTone[h.state] : 'bg-muted')} />
      ))}
      {rate !== null && <span className="ms-1 text-[0.625rem] text-sub num">{fa(rate)}٪</span>}
    </span>
  )
}

/** The lead (or leadership) records this week: delivered, partly, or nothing due this week. */
export function DeliveredButton({ p, dark, small }: { p: Project; dark?: boolean; small?: boolean }) {
  const { db, canEdit, access, me, upsert, toast } = useStore()
  const [note, setNote] = useState('')
  const st = weekState(p, db)
  if (!st || !canEdit || !(can.manage(access) || p.owner === me)) return null
  const ws = weekStart()
  const rec = recordOf(db, p, ws)
  const save = async (status: DeliveryStatus, close: () => void) => {
    const row: WeeklyDelivery = { id: `${p.id}-${ws}`, project_id: p.id, week: ws, date: todayISO(), status, note: note.trim() || rec?.note || '', by: me }
    await upsert('Deliveries', row)
    toast(L(`${p.name}: ${lbl(WEEK_STATE, status)}`, `${p.name}: ${lbl(WEEK_STATE, status)}`))
    setNote('')
    close()
  }
  const cls = dark ? 'btn h-10 bg-white text-band' : cx(rec ? 'btn-ghost' : 'btn-tonal', small ? 'btn-sm h-8' : 'btn-sm')
  return (
    <Popover
      width={280}
      align="end"
      trigger={({ toggle }) => (
        <button className={cls} onClick={(e) => (e.preventDefault(), e.stopPropagation(), toggle())}>
          <PackageCheck size={14} /> {rec ? L('ویرایش تحویل', 'Edit delivery') : L('ثبت تحویل', 'Record delivery')}
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-2 p-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold">{L(`تحویل هفتگی ${p.name}`, `${p.name} — weekly delivery`)}</div>
          <div className="text-[0.6875rem] text-sub">{L(`روز تحویل این هفته: ${tr(DAYS[Number(p.delivery_day)])}، ${fmtDayMonth(deliveryDate(p))}`, `This week’s delivery day: ${tr(DAYS[Number(p.delivery_day)])}, ${fmtDayMonth(deliveryDate(p))}`)}</div>
          <textarea className="input text-xs" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={rec?.note || L('چه چیزی تحویل شد؟ لینک یا توضیح', 'What was delivered? Link or note')} />
          <div className="grid gap-1.5">
            <button className="btn-primary btn-sm" onClick={() => save('delivered', close)}>{L('کامل تحویل شد', 'Fully delivered')}</button>
            <button className="btn-outline btn-sm" onClick={() => save('partial', close)}>{L('بخشی تحویل شد', 'Partly delivered')}</button>
            <button className="btn-ghost btn-sm" onClick={() => save('skipped', close)}>{L('این هفته تحویل ندارد', 'No delivery this week')}</button>
          </div>
        </div>
      )}
    </Popover>
  )
}

/** This week, day by day: which project delivers when, and how it went. */
export function DeliveryWeek() {
  const { db } = useStore()
  const ws = weekStart()
  const today = todayISO()
  const list = db.Projects.filter(hasDeliveryDay)
  if (!list.length)
    return <p className="text-xs leading-6 text-sub">{L('هنوز برای هیچ پروژه‌ای روز تحویل هفتگی تعیین نشده. در ویرایش پروژه «روز تحویل هفتگی» را انتخاب کنید.', 'No project has a weekly delivery day yet. Pick one in the project’s edit form.')}</p>
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => list.some((p) => deliveryDate(p) === d) || d === today)
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d) => {
        const ps = list.filter((p) => deliveryDate(p) === d)
        return (
          <div key={d} className={cx('min-w-0 rounded-2xl border p-2', d === today ? 'border-warn/40 bg-warn/[0.04]' : 'border-line')}>
            <div className="mb-1.5 flex items-baseline justify-between gap-1 px-0.5">
              <span className="text-xs font-semibold">{tr(DAYS[(Number(new Date(d + 'T12:00:00').getDay()) + 1) % 7])}</span>
              <span className="text-[0.625rem] text-sub num">{fmtDayMonth(d)}</span>
            </div>
            <div className="space-y-1">
              {ps.map((p) => {
                const st = weekState(p, db) || 'upcoming'
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className={cx('block truncate rounded-lg px-2 py-1 text-[0.6875rem] font-medium', stateTone[st])} title={`${p.name} · ${lbl(WEEK_STATE, st)}`} dir="auto">
                    {p.code || p.name}
                  </Link>
                )
              })}
              {!ps.length && <div className="px-1 py-1 text-[0.625rem] text-sub">—</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
