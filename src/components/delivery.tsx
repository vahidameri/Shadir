import { Check, CornerUpLeft, CalendarClock, Package } from 'lucide-react'
import type { Deliverable } from '../lib/types'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { cx, Avatar, Popover, MenuItem } from './ui'
import { CONFIDENCE, DELIVERABLE_STATUS } from '../lib/labels'
import { L, lbl } from '../lib/i18n'
import { addDays, fa, fmtDayMonth, relDays, todayISO } from '../lib/jalali'
import { deliveryState, deliveryTrack, isClosed, slipDays } from '../lib/delivery'
import { TRACK, sideDot } from '../lib/tracks'
import { useProjectName } from './shared'

type State = ReturnType<typeof deliveryState>
export const stateTone: Record<State, string> = {
  delivered: 'bg-good/10 text-good border-good/25',
  in_progress: 'bg-brand/10 text-brand border-brand/25 dark:text-brand-soft',
  at_risk: 'bg-warn/12 text-warn border-warn/30',
  overdue: 'bg-bad/10 text-bad border-bad/30',
  planned: 'bg-surface text-ink border-line-strong',
  dropped: 'bg-muted text-sub border-line line-through',
}
export const stateBar: Record<State, string> = {
  delivered: 'bg-good',
  in_progress: 'bg-brand dark:bg-brand-soft',
  at_risk: 'bg-warn',
  overdue: 'bg-bad',
  planned: 'bg-line-strong',
  dropped: 'bg-line',
}
export const stateLabel = (s: State) => (s === 'overdue' ? L('عقب‌افتاده', 'Overdue') : lbl(DELIVERABLE_STATUS, s))

export function useDeliveryActions() {
  const { upsert, toast } = useStore()
  const setStatus = async (d: Deliverable, status: Deliverable['status']) => {
    const prev = d
    const next = { ...d, status, delivered_date: status === 'delivered' ? d.delivered_date || todayISO() : '' }
    await upsert('Deliverables', next)
    toast(L(`«${d.title}»: ${lbl(DELIVERABLE_STATUS, status)}`, `“${d.title}”: ${lbl(DELIVERABLE_STATUS, status)}`), 'ok', { label: L('برگرداندن', 'Undo'), run: () => upsert('Deliverables', prev) })
  }
  /** Move the target; the baseline stays so the slip is recorded. */
  const push = async (d: Deliverable, days: number) => {
    const prev = d
    await upsert('Deliverables', { ...d, baseline_date: d.baseline_date || d.target_date, target_date: addDays(d.target_date || todayISO(), days) })
    toast(L(`«${d.title}» ${fa(days / 7)} هفته جابجا شد`, `“${d.title}” moved ${days / 7} week(s)`), 'ok', { label: L('برگرداندن', 'Undo'), run: () => upsert('Deliverables', prev) })
  }
  return { setStatus, push }
}

export function TrackDot({ d }: { d: Deliverable }) {
  const { db } = useStore()
  const t = deliveryTrack(d, db)
  return t ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={sideDot(t)} title={lbl(TRACK, t)} /> : null
}

/** Compact chip for timeline cells. */
export function DeliverableChip({ d, showProject }: { d: Deliverable; showProject?: boolean }) {
  const { open } = useEditor()
  const name = useProjectName()
  const st = deliveryState(d)
  const slip = slipDays(d)
  return (
    <button
      onClick={() => open('Deliverables', d as never)}
      className={cx('group flex w-full min-w-0 items-start gap-1.5 rounded-xl border px-2 py-1.5 text-start text-[0.6875rem] leading-4 transition hover:shadow-card', stateTone[st])}
      title={`${d.title} — ${stateLabel(st)}`}
    >
      <TrackDot d={d} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-medium text-ink">{d.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 opacity-80">
          {showProject && <span className="truncate">{name(d.project_id)}</span>}
          <span className="num">{fmtDayMonth(d.target_date)}</span>
          {slip > 0 && !isClosed(d) && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-bad">
              <CornerUpLeft size={10} />
              {L(`${fa(Math.round(slip / 7) || 1)} هفته`, `${Math.round(slip / 7) || 1}w`)}
            </span>
          )}
        </span>
      </span>
      {d.status === 'delivered' && <Check size={12} className="mt-0.5 shrink-0 text-good" />}
    </button>
  )
}

/** Full row for lists: status menu, title, project, owner, date, slip, quick actions. */
export function DeliverableRow({ d, showProject = true }: { d: Deliverable; showProject?: boolean }) {
  const { canEdit } = useStore()
  const { open } = useEditor()
  const name = useProjectName()
  const { setStatus, push } = useDeliveryActions()
  const st = deliveryState(d)
  const slip = slipDays(d)
  return (
    <div className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 transition hover:bg-muted/40 @lg:flex-nowrap">
      <Popover
        width={210}
        trigger={({ toggle }) => (
          <button disabled={!canEdit} onClick={toggle} className={cx('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem] font-medium', stateTone[st])}>
            <span className={cx('h-1.5 w-1.5 rounded-full', stateBar[st])} />
            {stateLabel(st)}
          </button>
        )}
      >
        {(close) => (
          <>
            {(Object.keys(DELIVERABLE_STATUS) as Deliverable['status'][]).map((s) => (
              <MenuItem key={s} active={d.status === s} onClick={() => (setStatus(d, s), close())}>
                {lbl(DELIVERABLE_STATUS, s)}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
      <button className="min-w-0 flex-1 basis-48 text-start" onClick={() => open('Deliverables', d as never)}>
        <span className="flex items-center gap-2">
          <TrackDot d={d} />
          <span className="truncate text-sm font-medium group-hover:underline">{d.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-[0.6875rem] text-sub">
          {showProject && `${name(d.project_id)} · `}
          {d.owner || '—'}
          {d.confidence && !isClosed(d) && ` · ${lbl(CONFIDENCE, d.confidence)}`}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        {slip > 0 && !isClosed(d) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-bad/10 px-2 py-0.5 text-[0.6875rem] font-medium text-bad" title={L(`تعهد اولیه: ${fmtDayMonth(d.baseline_date)}`, `Baseline: ${fmtDayMonth(d.baseline_date)}`)}>
            <CornerUpLeft size={11} />
            {L(`${fa(slip)} روز جابجایی`, `${slip}d slip`)}
          </span>
        )}
        <span className={cx('inline-flex items-center gap-1 num', st === 'overdue' ? 'font-semibold text-bad' : 'text-sub')}>
          <CalendarClock size={13} />
          {d.status === 'delivered' ? fmtDayMonth(d.delivered_date || d.target_date) : `${fmtDayMonth(d.target_date)} · ${relDays(d.target_date)}`}
        </span>
        <Avatar name={d.owner || '?'} size="xs" />
        {canEdit && !isClosed(d) && (
          <span className="flex gap-1 opacity-100 transition @lg:opacity-0 @lg:group-hover:opacity-100">
            <button className="icon-btn h-7 w-7" title={L('تحویل شد', 'Mark delivered')} onClick={() => setStatus(d, 'delivered')}>
              <Check size={14} />
            </button>
            <button className="icon-btn h-7 w-7 text-[0.625rem] font-semibold" title={L('یک هفته عقب', 'Push one week')} onClick={() => push(d, 7)}>
              {L('+۱ه', '+1w')}
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

export function DeliveryEmpty() {
  return (
    <div className="grid place-items-center gap-2 py-10 text-center text-sm text-sub">
      <Package size={22} className="opacity-50" />
      {L('خروجی برای این بازه ثبت نشده', 'Nothing planned in this window')}
    </div>
  )
}
