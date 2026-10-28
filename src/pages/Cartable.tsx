// The cartable: one page per person (the CPTO's, the PgM's), daily or for the end of the week.
// The PgM fills the CPTO's from Mizito, tasks and follow-ups (or plain text), and sends it in one go;
// the CPTO works down it: done, or back with a line. What isn't done carries over.
import { dirOf } from '../lib/dir'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Plus, Search, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, Overlap, Segmented, StatStrip, cx } from '../components/ui'
import { WeekNav } from '../components/WeekNav'
import { DatePicker } from '../components/DatePicker'
import { CartableAdd, CartableRow } from '../components/CartableParts'
import { L, locale } from '../lib/i18n'
import { addDays, fa, fmtDate, fmtWeekday, nowStamp, todayISO } from '../lib/jalali'
import { can } from '../lib/access'
import { cartableOwners, order, periodOf } from '../lib/cartable'
import { mzClosed } from '../lib/mizito'
import { closed } from '../lib/columns'
import type { CartableBox, CartableItem } from '../lib/types'

export default function CartablePage() {
  const { db, me, access, action, toast, mode, upsertMany } = useStore()
  const owners = cartableOwners(db)
  const [owner, setOwner] = useState(() => (access === 'super' ? owners.find((n) => n !== me) || me : me))
  const [box, setBox] = useState<CartableBox>('daily')
  const [day, setDay] = useState(todayISO())
  const [adding, setAdding] = useState<false | { entity: CartableItem['entity']; entity_id: string; title: string }>(false)
  const [editing, setEditing] = useState<CartableItem | null>(null)
  const [mail, setMail] = useState(true)
  const [q, setQ] = useState('')
  const period = periodOf(box, day)

  const mineBox = db.Cartable.filter((c) => c.owner === owner && c.box === box)
  // every unsent draft of mine for this box, whatever day it was written for; it goes out with this period
  const drafts = mineBox.filter((c) => c.status === 'draft' && c.from === me).sort(order)
  // what is open: sent for this period, plus anything earlier still not done
  const pending = mineBox.filter((c) => c.status === 'sent' && c.period <= period).sort(order)
  const carried = pending.filter((c) => c.period < period)
  const closedHere = mineBox.filter((c) => (c.status === 'done' || c.status === 'returned') && c.period === period).sort(order)
  const lateCount = pending.filter((c) => c.due_date && c.due_date < todayISO()).length

  // quick pick: open Mizito items, tasks and follow-ups that are not in a cartable yet
  const picks = useMemo(() => {
    const s = q.trim()
    if (!s) return []
    const inBox = new Set(db.Cartable.filter((c) => c.status !== 'done').map((c) => `${c.entity}:${c.entity_id}`))
    const hit = (t: string) => String(t || '').includes(s)
    const out: { entity: CartableItem['entity']; entity_id: string; title: string; where: string }[] = []
    db.Mizito.filter((m) => !mzClosed(m) && hit(m.title)).forEach((m) => out.push({ entity: 'Mizito', entity_id: m.id, title: m.title, where: L('میزیتو', 'Mizito') }))
    db.Tasks.filter((t) => !closed(t) && hit(t.title)).forEach((t) => out.push({ entity: 'Tasks', entity_id: t.id, title: t.title, where: L('تسک', 'Task') }))
    db.FollowUps.filter((f) => f.status !== 'done' && hit(f.subject)).forEach((f) => out.push({ entity: 'FollowUps', entity_id: f.id, title: f.subject, where: L('پیگیری', 'Follow-up') }))
    return out.filter((x) => !inBox.has(`${x.entity}:${x.entity_id}`)).slice(0, 8)
  }, [q, db])

  const send = async () => {
    const at = nowStamp()
    // all drafts go together, in one save
    await upsertMany('Cartable', drafts.map((c) => ({ ...c, status: 'sent', sent_at: at, period: c.period < period ? period : c.period })))
    if (mail && mode !== 'demo') {
      try {
        const r = (await action('mailCartable', { owner, box, period })) as { sent?: boolean; reason?: string } | undefined
        if (r && !r.sent && r.reason) toast(r.reason, 'err')
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'err')
      }
    }
    toast(L(`کارتابل ${owner} فرستاده شد (${fa(drafts.length)} مورد)`, `${owner}’s cartable sent (${drafts.length})`))
  }

  if (!can.cartable(access)) return <Empty text={L('کارتابل برای CPTO و مدیر برنامه است', 'The cartable is for the CPTO and the PgM')} />
  const Prev = locale.lang === 'fa' ? ChevronRight : ChevronLeft
  const Next = locale.lang === 'fa' ? ChevronLeft : ChevronRight
  const dayBtn = 'grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10'
  return (
    <>
      <Band
        eyebrow={<span className="inline-flex items-center gap-1.5"><Inbox size={12} /> {owner === me ? L('کارتابل من', 'My cartable') : L(`کارتابل ${owner}`, `${owner}’s cartable`)}</span>}
        title={L('کارتابل', 'Cartable')}
        sub={owner === me ? L('کارهایی که برای اقدام شما گذاشته شده؛ هر کدام را «انجام شد» بزنید یا با یک خط توضیح برگردانید.', 'What was put in front of you: mark each done, or send it back with a line.') : L(`موارد را از میزیتو، تسک‌ها و پیگیری‌ها جمع کنید و یک‌جا برای ${owner} بفرستید.`, `Gather items from Mizito, tasks and follow-ups and send them to ${owner} in one go.`)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {owners.length > 1 && <Segmented dark value={owner} onChange={setOwner} options={owners.map((n) => ({ value: n, label: n === me ? L('من', 'Me') : n }))} />}
            <Segmented dark value={box} onChange={setBox} options={[{ value: 'daily', label: L('روزانه', 'Daily') }, { value: 'weekly', label: L('آخر هفته', 'End of week') }]} />
            {box === 'weekly' ? (
              <WeekNav ws={period} onChange={(ws) => setDay(ws)} />
            ) : (
              <div className="flex items-center gap-1.5 text-white">
                <button className={dayBtn} onClick={() => setDay(addDays(day, -1))} aria-label={L('روز قبل', 'Previous day')}><Prev size={16} /></button>
                <div className="min-w-[7.5rem] text-center leading-tight">
                  <div className="text-sm font-semibold">{day === todayISO() ? L('امروز', 'Today') : fmtWeekday(day)}</div>
                  <div className="text-[0.6875rem] text-band-sub num">{fmtDate(day)}</div>
                </div>
                <button className={dayBtn} onClick={() => setDay(addDays(day, 1))} aria-label={L('روز بعد', 'Next day')}><Next size={16} /></button>
              </div>
            )}
          </div>
        }
      >
        <StatStrip
          items={[
            { label: L('منتظر اقدام', 'Waiting for action'), value: fa(pending.length), tone: pending.length ? 'amber' : 'green' },
            { label: L('از قبل مانده', 'Carried over'), value: fa(carried.length), tone: carried.length ? 'amber' : 'muted' },
            { label: L('مهلت گذشته', 'Past due'), value: fa(lateCount), tone: lateCount ? 'red' : 'green' },
            { label: L('انجام‌شده', 'Done'), value: fa(closedHere.filter((c) => c.status === 'done').length), tone: 'green' },
            ...(owner !== me ? [{ label: L('پیش‌نویس شما', 'Your draft'), value: fa(drafts.length), tone: 'muted' as const }] : []),
          ]}
        />
      </Band>
      <Overlap className="space-y-4">
        <div className="card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sub" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('جستجو در میزیتو، تسک‌ها و پیگیری‌ها برای افزودن…', 'Search Mizito, tasks and follow-ups to add…')} className="input h-10 w-full ps-9" />
            </div>
            <button className="btn-outline h-10" onClick={() => setAdding({ entity: '', entity_id: '', title: q.trim() })}><Plus size={15} /> {L('مورد آزاد', 'Free item')}</button>
          </div>
          {picks.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {picks.map((p) => (
                <li key={`${p.entity}${p.entity_id}`}>
                  <button className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted/50" onClick={() => (setAdding(p), setQ(''))}>
                    <span className="w-16 shrink-0 text-[0.6875rem] text-sub">{p.where}</span>
                    <span dir={dirOf(p.title)} className="min-w-0 flex-1 truncate">{p.title}</span>
                    <Plus size={14} className="text-sub" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {drafts.length > 0 && (
          <Card
            eyebrow={L('پیش‌نویس', 'Draft')}
            title={L(`آماده‌ی ارسال برای ${owner}`, `Ready to send to ${owner}`)}
            pad={false}
            action={
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-sub"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> {L('ایمیل هم برود', 'Also email')}</label>
                <button className="btn-primary btn-sm" onClick={send}><Send size={14} className="rtl:-scale-x-100" /> {L(`ارسال کارتابل (${fa(drafts.length)})`, `Send (${drafts.length})`)}</button>
              </div>
            }
          >
            <ul className="divide-y divide-line">{drafts.map((c) => <CartableRow key={c.id} c={c} onEdit={() => setEditing(c)} />)}</ul>
          </Card>
        )}

        <Card eyebrow={box === 'weekly' ? L('آخر هفته', 'End of week') : L('امروز', 'Today')} title={L('منتظر اقدام', 'Waiting for action')} pad={false}>
          {pending.length ? (
            <ul className="divide-y divide-line">
              {pending.map((c) => (
                <div key={c.id} className={cx(c.period < period && 'bg-warn/[0.04]')}>
                  {c.period < period && <div className="px-4 pt-2 text-[0.6875rem] text-warn">{L(`مانده از ${box === 'weekly' ? 'هفته‌ی' : ''} ${fmtDate(c.period)}`, `carried over from ${fmtDate(c.period)}`)}</div>}
                  <CartableRow c={c} onEdit={() => setEditing(c)} />
                </div>
              ))}
            </ul>
          ) : (
            <Empty text={L('کارتابل خالی است', 'Nothing waiting')} />
          )}
        </Card>

        {closedHere.length > 0 && (
          <Card eyebrow={L('بسته‌شده', 'Closed')} title={L('انجام‌شده و برگشتی', 'Done and sent back')} pad={false}>
            <ul className="divide-y divide-line">{closedHere.map((c) => <CartableRow key={c.id} c={c} />)}</ul>
          </Card>
        )}
        <div className="flex items-center gap-2 text-xs text-sub">
          <span>{L('برو به روز:', 'Go to day:')}</span>
          <DatePicker compact value={day} onChange={(v) => v && setDay(v)} />
        </div>
      </Overlap>
      {adding && <CartableAdd source={adding} owner={owner} box={box} day={day} onClose={() => setAdding(false)} />}
      {editing && <CartableAdd item={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
