// Hand-offs between units, read from the assignments (see lib/handoffs): the task's path through the
// units, cards for the board, and the board itself. Nothing to press — re-assigning a task is the hand-off.
import { Repeat } from 'lucide-react'
import type { Handoff, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { L, lbl } from '../lib/i18n'
import { TRACK, sideSoft, trackOf } from '../lib/tracks'
import { daysHeld, forTask, isReturn, recent, stuck } from '../lib/handoffs'
import { fa, fmtDayMonth } from '../lib/jalali'
import { Avatar, cx } from './ui'
import { useEditor } from './Editor'

export function SideChip({ side }: { side: string }) {
  if (!side) return <span className="text-[0.6875rem] text-sub">—</span>
  return (
    <span className="chip side-soft" style={sideSoft(side)}>
      {lbl(TRACK, side)}
    </span>
  )
}

/** "from product to design" — written out, so the direction reads the same in Persian and English. */
export function Flow({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[0.6875rem] text-sub">
      {L('از', 'From')} <SideChip side={from} /> {L('به', 'to')} <SideChip side={to} />
    </span>
  )
}

const Kind = ({ h }: { h: Handoff }) =>
  isReturn(h) ? (
    <span className="rounded-full bg-bad/10 px-2 text-[0.625rem] font-medium leading-5 text-bad">{L('برگشت', 'Back')}{Number(h.round) > 1 ? L(` · دور ${fa(h.round)}`, ` · R${h.round}`) : ''}</span>
  ) : (
    <span className="rounded-full bg-good/10 px-2 text-[0.625rem] font-medium leading-5 text-good">{L('تحویل', 'Handed over')}{Number(h.round) > 1 ? L(` · دور ${fa(h.round)}`, ` · R${h.round}`) : ''}</span>
  )

/** The task's path through the units, in the task sheet. */
export function HandoffSection({ task }: { task: Task }) {
  const { db } = useStore()
  const list = forTask(db, task.id)
  const now = trackOf(task, db)
  return (
    <div className="mt-8">
      <div className="eyebrow mb-2 flex items-center gap-2">
        <Repeat size={13} /> {L('مسیر بین واحدها', 'Path between units')}
      </div>
      {!list.length ? (
        <p className="text-xs leading-6 text-sub">
          {now ? L(`الان در واحد ${lbl(TRACK, now)}. `, `Now with ${lbl(TRACK, now)}. `) : ''}
          {L('وقتی مسئول تسک را به کسی در واحد دیگر بدهید، این‌جا ثبت می‌شود؛ برگشت به واحد قبلی هم «برگشت» شمرده می‌شود.', 'Assign the task to someone in another unit and it is logged here; going back to an earlier unit counts as a return.')}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {list.map((h) => (
            <li key={h.id} className={cx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', isReturn(h) ? 'border-bad/25 bg-bad/[0.03]' : 'border-line')}>
              <Kind h={h} />
              <Flow from={h.from_side} to={h.to_side} />
              <span className="text-sub">{h.from_person} {L('به', 'to')} {h.to_person}</span>
              <span className="ms-auto text-[0.6875rem] text-sub num">
                {fmtDayMonth(h.sent_at.slice(0, 10))} · {L(`${fa(daysHeld(h, db))} روز`, `${daysHeld(h, db)}d`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** One pass as a card. */
export function HandoffCard({ h, onOpen, held }: { h: Handoff; onOpen: () => void; held?: boolean }) {
  const { db } = useStore()
  const code = db.Projects.find((p) => p.id === h.project_id)?.code
  const days = daysHeld(h, db)
  return (
    <div onClick={onOpen} className={cx('cursor-pointer rounded-2xl border bg-surface p-3 shadow-sm transition hover:shadow-float', isReturn(h) ? 'border-bad/30' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <Kind h={h} />
        <Flow from={h.from_side} to={h.to_side} />
        {code && <span className="ms-auto font-mono text-[0.625rem] uppercase text-sub" dir="ltr">{code}</span>}
      </div>
      <div className="mt-2 text-sm leading-6">{db.Tasks.find((t) => t.id === h.task_id)?.title || h.title}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-sub">
        <Avatar name={h.from_person} size="xs" />
        <span className="truncate">{h.from_person}</span>
        <span>{L('به', 'to')}</span>
        <Avatar name={h.to_person} size="xs" />
        <span className="truncate">{h.to_person}</span>
        <span className="flex-1" />
        <span className={cx(held && days >= 3 && 'font-medium text-warn')}>{held ? L(`${fa(days)} روز در این واحد`, `${days}d in this unit`) : fmtDayMonth(h.sent_at.slice(0, 10))}</span>
      </div>
    </div>
  )
}

/** Board: recent hand-overs, recent returns, and tasks sitting in one unit for 3+ days. */
export function HandoffBoard({ projectId, side }: { projectId?: string; side?: string }) {
  const { db } = useStore()
  const { open } = useEditor()
  const openTask = (id: string) => {
    const t = db.Tasks.find((x) => x.id === id)
    if (t) open('Tasks', t as never)
  }
  const fit = (h: Handoff) => (!projectId || h.project_id === projectId) && (!side || h.from_side === side || h.to_side === side)
  const last14 = recent(db).filter(fit).sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1))
  const cols: { id: string; title: string; tone: string; rows: Handoff[]; held?: boolean }[] = [
    { id: 'sent', title: L('تحویل‌های ۱۴ روز اخیر', 'Hand-overs · last 14 days'), tone: 'text-good', rows: last14.filter((h) => !isReturn(h)) },
    { id: 'back', title: L('برگشت‌های ۱۴ روز اخیر', 'Returns · last 14 days'), tone: 'text-bad', rows: last14.filter(isReturn) },
    { id: 'stuck', title: L('مانده در یک واحد (۳ روز یا بیشتر)', 'Sitting in one unit (3+ days)'), tone: 'text-warn', rows: stuck(db).map((x) => x.h).filter(fit), held: true },
  ]
  return (
    <div className="grid gap-3 @2xl:grid-cols-3">
      {cols.map((c) => (
        <div key={c.id} className="flex min-h-[12rem] flex-col rounded-3xl bg-muted/60 p-2">
          <div className={cx('px-2.5 py-2 text-sm font-semibold', c.tone)}>
            {c.title} · {fa(c.rows.length)}
          </div>
          <div className="flex flex-col gap-2">
            {c.rows.map((h) => (
              <HandoffCard key={h.id} h={h} held={c.held} onOpen={() => openTask(h.task_id)} />
            ))}
            {!c.rows.length && <div className="px-3 py-6 text-center text-xs text-sub">{L('موردی نیست', 'Nothing here')}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
