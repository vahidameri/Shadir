// Two desk cards: the cartable at a glance (what waits for me; for the PgM, the CPTO's too), and a
// person's own to-do notes for the day — write, tick, and clear at the end of the day.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eraser, Inbox, ListTodo, Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, cx } from './ui'
import { L, tr } from '../lib/i18n'
import { daysBetween, fa, fmtDayMonth, nowStamp, todayISO } from '../lib/jalali'
import { uid } from '../lib/api'
import { can } from '../lib/access'
import { CART_KIND, cartableOwners, pendingFor } from '../lib/cartable'

export function CartableCard() {
  const { db, me, access } = useStore()
  if (!can.cartable(access)) return null
  const mine = pendingFor(db, me)
  const others = cartableOwners(db).filter((n) => n !== me)
  const today = todayISO()
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Inbox size={12} /> {L('کارتابل', 'Cartable')}</span>} title={mine.length ? L(`${fa(mine.length)} مورد منتظر اقدام شما`, `${mine.length} waiting for you`) : L('کارتابل شما خالی است', 'Your cartable is empty')} action={<Link to="/cartable" className="text-xs text-sub hover:text-ink">{L('همه', 'All')} ←</Link>}>
      {mine.length > 0 && (
        <ul className="space-y-1.5">
          {mine.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link to="/cartable" className="flex items-center gap-2 text-sm hover:underline">
                <span className={cx('shrink-0 rounded-md px-1.5 text-[0.625rem] font-semibold', c.priority === 'high' ? 'bg-bad/10 text-bad' : 'bg-muted')}>{tr(CART_KIND[c.kind] || CART_KIND.info)}</span>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {c.due_date && <span className={cx('shrink-0 text-[0.6875rem] num', c.due_date < today ? 'text-bad' : 'text-sub')}>{fmtDayMonth(c.due_date)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {others.map((n) => {
        const waiting = pendingFor(db, n)
        const drafts = db.Cartable.filter((c) => c.owner === n && c.status === 'draft' && c.from === me)
        const back = db.Cartable.filter((c) => c.owner === n && c.from === me && c.status === 'returned' && c.done_at && daysBetween(c.done_at.slice(0, 10), today) <= 7)
        return (
          <div key={n} className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-3 py-2 text-xs">
            <b className="font-medium">{L(`کارتابل ${n}:`, `${n}’s:`)}</b>
            <span>{L(`${fa(waiting.length)} منتظر`, `${waiting.length} waiting`)}</span>
            {drafts.length > 0 && <span className="text-brand">{L(`${fa(drafts.length)} پیش‌نویس ارسال‌نشده`, `${drafts.length} unsent`)}</span>}
            {back.length > 0 && <span className="text-warn">{L(`${fa(back.length)} برگشتی`, `${back.length} sent back`)}</span>}
          </div>
        )
      })}
    </Card>
  )
}

/** My own notes for the day: only I receive them (the server keeps them per person). */
export function TodoCard() {
  const { db, me, upsert, remove, canEdit } = useStore()
  const [text, setText] = useState('')
  const today = todayISO()
  const items = db.Todos.filter((t) => t.owner === me).sort((a, b) => Number(a.done === '1') - Number(b.done === '1') || (Number(a.sort) || 0) - (Number(b.sort) || 0))
  const done = items.filter((t) => t.done === '1')
  const add = async () => {
    const v = text.trim()
    if (!v) return
    setText('')
    await upsert('Todos', { id: uid('TD'), owner: me, text: v, done: '', day: today, created_at: nowStamp(), sort: Date.now() })
  }
  const clear = async (all: boolean) => {
    const list = all ? items : done
    if (all && !window.confirm(L('همه‌ی یادداشت‌ها پاک شوند؟', 'Clear all notes?'))) return
    for (const t of list) await remove('Todos', t.id)
  }
  if (!canEdit) return null
  return (
    <Card
      eyebrow={<span className="flex items-center gap-1.5"><ListTodo size={12} /> {L('یادداشت', 'Notes')}</span>}
      title={L('کارهای امروز من', 'My to-dos today')}
      action={
        items.length > 0 && (
          <div className="flex items-center gap-1">
            {done.length > 0 && <button className="btn-ghost btn-sm text-xs" onClick={() => clear(false)}><Eraser size={13} /> {L(`پاک کردن انجام‌شده‌ها (${fa(done.length)})`, `Clear done (${done.length})`)}</button>}
            <button className="btn-ghost btn-sm text-xs text-sub" onClick={() => clear(true)}>{L('پاک کردن همه', 'Clear all')}</button>
          </div>
        )
      }
    >
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), add())}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('یک کار بنویسید و Enter بزنید…', 'Write a to-do and press Enter…')} className="input h-10 flex-1" />
        <button className="btn-primary h-10 w-10 px-0" disabled={!text.trim()} aria-label={L('افزودن', 'Add')}><Plus size={16} /></button>
      </form>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {items.map((t) => (
            <li key={t.id} className="group flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-muted/50">
              <input type="checkbox" className="mt-1.5" checked={t.done === '1'} onChange={() => upsert('Todos', { ...t, done: t.done === '1' ? '' : '1' })} aria-label={L('انجام شد', 'Done')} />
              <span className={cx('min-w-0 flex-1 text-sm leading-7 [overflow-wrap:anywhere]', t.done === '1' && 'text-sub line-through')}>{t.text}</span>
              {t.day && t.day < today && <span className="mt-1 shrink-0 text-[0.6875rem] text-warn num">{fmtDayMonth(t.day)}</span>}
              <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => remove('Todos', t.id)} aria-label={L('حذف', 'Remove')}><X size={13} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-xs text-sub">{L('هنوز چیزی ننوشته‌اید. آخر روز انجام‌شده‌ها را پاک کنید.', 'Nothing yet. Clear what is done at the end of the day.')}</div>
      )}
    </Card>
  )
}
