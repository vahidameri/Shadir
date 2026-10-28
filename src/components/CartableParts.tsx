// Putting something in a cartable (from a Mizito item, a task, a follow-up or plain text), and one
// item as it shows in a cartable, with what its owner can do: done, or back with a line of answer.
import { dirOf } from '../lib/dir'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CornerUpLeft, ExternalLink, Inbox, Pencil, Send, Trash2, Undo2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Avatar, Segmented, Sheet, cx } from './ui'
import { DatePicker } from './DatePicker'
import { L, tr } from '../lib/i18n'
import { fa, fmtDate, timeAgo, todayISO } from '../lib/jalali'
import { uid } from '../lib/api'
import { nowStamp } from '../lib/taskstamp'
import { can } from '../lib/access'
import { CART_KIND, CART_KINDS, cartableOwners, periodOf } from '../lib/cartable'
import { weekLabel } from '../lib/weeks'
import type { CartableBox, CartableItem } from '../lib/types'

const toDate = (s: string) => new Date(String(s).replace(' ', 'T'))
type Source = Pick<CartableItem, 'entity' | 'entity_id' | 'title'>

/** The sheet that adds (or edits) a cartable item. */
export function CartableAdd({ source, item, onClose, owner: initialOwner, box: initialBox, day: initialDay }: { source?: Source; item?: CartableItem; onClose: () => void; owner?: string; box?: CartableBox; day?: string }) {
  const { db, me, upsert, toast } = useStore()
  const owners = cartableOwners(db)
  // the PgM fills the CPTO's cartable by default; the CPTO their own
  const [owner, setOwner] = useState(item?.owner || initialOwner || owners.find((n) => n !== me) || me)
  const [box, setBox] = useState<CartableBox>(item?.box || initialBox || 'daily')
  const [day, setDay] = useState(item?.period || initialDay || todayISO())
  const [title, setTitle] = useState(item?.title || source?.title || '')
  const [ask, setAsk] = useState(item?.ask || '')
  const [kind, setKind] = useState(item?.kind || 'decide')
  const [priority, setPriority] = useState(item?.priority || 'medium')
  const [due, setDue] = useState(item?.due_date || '')
  const [now, setNow] = useState(owner === me)
  const save = async () => {
    if (!title.trim()) return toast(L('عنوان لازم است', 'A title is needed'), 'err')
    const send = owner === me || now
    const row: CartableItem = {
      id: item?.id || uid('CB'),
      owner,
      box,
      period: periodOf(box, day),
      from: item?.from || me,
      entity: item?.entity ?? source?.entity ?? '',
      entity_id: item?.entity_id ?? source?.entity_id ?? '',
      title: title.trim(),
      ask: ask.trim(),
      kind,
      priority,
      due_date: due,
      status: item && item.status !== 'draft' ? item.status : send ? 'sent' : 'draft',
      response: item?.response || '',
      sent_at: item?.sent_at || (send ? nowStamp() : ''),
      done_at: item?.done_at || '',
      sort: item?.sort ?? Date.now(),
      created_at: item?.created_at || nowStamp(),
    }
    await upsert('Cartable', row)
    toast(item ? L('ذخیره شد', 'Saved') : row.status === 'draft' ? L(`به پیش‌نویس کارتابل ${owner} اضافه شد؛ از صفحه‌ی کارتابل بفرستید`, `Added to ${owner}’s draft cartable; send it from the cartable page`) : L(`در کارتابل ${owner} گذاشته شد`, `Put in ${owner}’s cartable`))
    onClose()
  }
  const label = (t: string, el: React.ReactNode) => (
    <label className="block">
      <span className="label">{t}</span>
      {el}
    </label>
  )
  return (
    <Sheet open onClose={onClose} header={<h2 className="font-semibold">{item ? L('ویرایش مورد کارتابل', 'Edit cartable item') : owner === me ? L('افزودن به کارتابل من', 'Add to my cartable') : L(`افزودن به کارتابل ${owner}`, `Add to ${owner}’s cartable`)}</h2>} footer={<><div className="flex-1" /><button className="btn-ghost btn-sm" onClick={onClose}>{L('انصراف', 'Cancel')}</button><button className="btn-primary btn-sm" onClick={save}><Inbox size={14} /> {item ? L('ذخیره', 'Save') : owner === me ? L('به کارتابل من', 'To my cartable') : L(`به کارتابل ${owner}`, `To ${owner}’s cartable`)}</button></>}>
      <div className="space-y-4 p-5">
        {!item && (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={owner} onChange={(v) => (setOwner(v), setNow(v === me))} options={owners.map((n) => ({ value: n, label: n === me ? L('کارتابل خودم', 'My cartable') : L(`کارتابل ${n}`, `${n}’s`) }))} />
            <Segmented value={box} onChange={setBox} options={[{ value: 'daily', label: L('روزانه', 'Daily') }, { value: 'weekly', label: L('آخر هفته', 'End of week') }]} />
          </div>
        )}
        {label(box === 'weekly' ? L('هفته (هر روزی از آن)', 'Week (any day in it)') : L('روز', 'Day'), (
          <div className="flex items-center gap-2">
            <DatePicker value={day} onChange={(v) => v && setDay(v)} />
            {box === 'weekly' && <span className="text-xs text-sub num">{weekLabel(periodOf('weekly', day))}</span>}
          </div>
        ))}
        {label(L('عنوان', 'Title'), <input className="input h-10 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />)}
        {source?.entity && <div className="-mt-2 text-xs text-sub">{source.entity === 'Mizito' ? L('از میزیتو', 'From Mizito') : source.entity === 'Tasks' ? L('از تسک‌ها', 'From tasks') : L('از پیگیری‌ها', 'From follow-ups')}</div>}
        {label(L('چه اقدامی؟', 'What is needed?'), (
          <div className="flex flex-wrap gap-1.5">
            {CART_KINDS.map((k) => <button key={k} className={cx('btn-sm', kind === k ? 'btn-primary' : 'btn-outline')} onClick={() => setKind(k)}>{tr(CART_KIND[k])}</button>)}
          </div>
        ))}
        {label(L('توضیح برای انجام‌دهنده', 'A note for them'), <textarea className="input min-h-[5rem] w-full py-2 leading-7" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={L('مثلاً «لطفاً تا ظهر در میزیتو تأیید کنید؛ مبلغ از بودجه‌ی Q3 است»', 'e.g. “Please approve in Mizito by noon”')} />)}
        <div className="flex flex-wrap items-end gap-4">
          {label(L('اولویت', 'Priority'), <Segmented value={priority} onChange={setPriority} options={[{ value: 'high', label: L('بالا', 'High') }, { value: 'medium', label: L('عادی', 'Normal') }, { value: 'low', label: L('کم', 'Low') }]} />)}
          {label(L('مهلت', 'By'), <DatePicker compact value={due} onChange={setDue} />)}
        </div>
        {!item && owner !== me && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} />
            {L('همین حالا بفرست (وگرنه در پیش‌نویس می‌ماند تا کارتابل را یک‌جا بفرستید)', 'Send now (otherwise it waits in the draft until you send the cartable)')}
          </label>
        )}
      </div>
    </Sheet>
  )
}

/** "To X's cartable": one button per cartable (the CPTO's, mine), so where it goes is never a guess. */
export function CartableButton({ source, className }: { source: Source; className?: string }) {
  const { access, db, me } = useStore()
  const [target, setTarget] = useState('')
  if (!can.cartable(access)) return null
  // the CPTO's first for the PgM, my own first for the CPTO
  const owners = cartableOwners(db).sort((a, b) => Number(a === me) - Number(b === me))
  const there = (n: string) => db.Cartable.some((c) => c.owner === n && c.entity === source.entity && c.entity_id === source.entity_id && (c.status === 'sent' || c.status === 'draft'))
  return (
    <>
      {owners.map((n) => (
        <button key={n} className={cx('btn-outline btn-sm', className)} onClick={() => setTarget(n)} title={there(n) ? L('همین حالا در این کارتابل است', 'Already in this cartable') : undefined}>
          <Inbox size={14} /> {n === me ? L('به کارتابل من', 'To my cartable') : L(`به کارتابل ${n.split(' ')[0]}`, `To ${n.split(' ')[0]}’s cartable`)}
          {there(n) && <Check size={12} className="text-good" />}
        </button>
      ))}
      {target && <CartableAdd source={source} owner={target} onClose={() => setTarget('')} />}
    </>
  )
}

/** One item in a cartable. */
export function CartableRow({ c, onEdit }: { c: CartableItem; onEdit?: () => void }) {
  const { db, me, upsert, remove, toast } = useStore()
  const { open } = useEditor()
  const [answer, setAnswer] = useState<'' | 'done' | 'returned'>('')
  const [text, setText] = useState('')
  const owner = c.owner === me
  const mine = c.from === me
  const late = c.status === 'sent' && c.due_date && c.due_date < todayISO()
  const close = async (status: 'done' | 'returned') => {
    await upsert('Cartable', { ...c, status, response: text.trim(), done_at: nowStamp() })
    setAnswer('')
    setText('')
    toast(status === 'done' ? L('انجام شد', 'Done') : L('برگشت داده شد', 'Sent back'))
  }
  const source = () => {
    if (c.entity === 'Tasks') {
      const t = db.Tasks.find((x) => x.id === c.entity_id)
      if (t) open('Tasks', t as never)
    } else if (c.entity === 'FollowUps') {
      const f = db.FollowUps.find((x) => x.id === c.entity_id)
      if (f) open('FollowUps', f as never)
    }
  }
  const mz = c.entity === 'Mizito' ? db.Mizito.find((x) => x.id === c.entity_id) : undefined
  return (
    <li className={cx('px-4 py-3', c.status === 'done' && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 grid h-7 shrink-0 place-items-center rounded-lg px-2 text-[0.6875rem] font-semibold', c.priority === 'high' ? 'bg-bad/10 text-bad' : 'bg-muted text-ink')}>{tr(CART_KIND[c.kind] || CART_KIND.info)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {c.entity === 'Mizito' ? (
              <Link dir={dirOf(c.title)} to={`/mizito?id=${c.entity_id}`} className={cx('font-medium hover:underline', c.status === 'done' && 'line-through')}>{c.title}</Link>
            ) : c.entity ? (
              <button onClick={source} dir={dirOf(c.title)} className={cx('text-start font-medium hover:underline', c.status === 'done' && 'line-through')}>{c.title}</button>
            ) : (
              <span dir={dirOf(c.title)} className={cx('font-medium', c.status === 'done' && 'line-through')}>{c.title}</span>
            )}
            {mz?.link && <a href={mz.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2 text-[0.6875rem] text-sub hover:text-brand"><ExternalLink size={11} /> {L('میزیتو', 'Mizito')}</a>}
            {c.status === 'draft' && <span className="rounded-full bg-muted px-2 text-[0.6875rem] text-sub">{L('پیش‌نویس', 'Draft')}</span>}
            {c.status === 'returned' && <span className="rounded-full bg-warn/15 px-2 text-[0.6875rem] text-warn">{L('برگشت خورد', 'Sent back')}</span>}
          </div>
          {c.ask && <div dir={dirOf(c.ask)} className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink/85 [overflow-wrap:anywhere]">{c.ask}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 text-[0.6875rem] text-sub">
            {c.from !== c.owner && <span className="inline-flex items-center gap-1"><Avatar name={c.from} size="xs" /> {L(`از ${c.from}`, `from ${c.from}`)}</span>}
            {c.sent_at && <span>{timeAgo(toDate(c.sent_at))}</span>}
            {c.due_date && <span className={cx(late && 'font-medium text-bad')}>{L(`مهلت ${fmtDate(c.due_date)}`, `by ${fmtDate(c.due_date)}`)}</span>}
            {c.done_at && c.status !== 'sent' && <span>{c.status === 'done' ? L('انجام شد', 'done') : L('برگشت', 'back')} {timeAgo(toDate(c.done_at))}</span>}
          </div>
          {c.response && <div className="mt-2 rounded-xl bg-muted px-3 py-2 text-sm leading-7 [overflow-wrap:anywhere]"><b className="font-medium">{c.owner}:</b> {c.response}</div>}
          {answer && (
            <div className="mt-2 flex items-end gap-2 rounded-2xl border border-line p-2">
              <textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={answer === 'done' ? L('نتیجه (اختیاری)، مثلاً «تأیید شد»', 'Outcome (optional)') : L('چرا برمی‌گردد؟ چه چیزی لازم است؟', 'Why is it going back?')} className="flex-1 resize-none bg-transparent px-1 text-sm outline-none" />
              <button className="btn-primary btn-sm" onClick={() => close(answer)} disabled={answer === 'returned' && !text.trim()}><Send size={13} className="rtl:-scale-x-100" /> {L('ثبت', 'Save')}</button>
              <button className="btn-ghost btn-sm" onClick={() => setAnswer('')}>{L('انصراف', 'Cancel')}</button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {c.status === 'sent' && (owner || mine) && !answer && (
            <>
              <button className="btn-primary btn-sm" onClick={() => setAnswer('done')}><Check size={14} /> {L('انجام شد', 'Done')}</button>
              {owner && !mine && <button className="btn-outline btn-sm" onClick={() => setAnswer('returned')}><CornerUpLeft size={14} /> {L('برگشت', 'Back')}</button>}
            </>
          )}
          {c.status !== 'sent' && c.status !== 'draft' && (owner || mine) && (
            <button className="icon-btn h-8 w-8" title={L('باز کردن دوباره', 'Reopen')} aria-label={L('باز کردن دوباره', 'Reopen')} onClick={() => upsert('Cartable', { ...c, status: 'sent', done_at: '' })}><Undo2 size={14} /></button>
          )}
          {mine && onEdit && <button className="icon-btn h-8 w-8" onClick={onEdit} title={L('ویرایش', 'Edit')} aria-label={L('ویرایش', 'Edit')}><Pencil size={14} /></button>}
          {mine && (c.status === 'draft' || c.status === 'sent') && <button className="icon-btn h-8 w-8 hover:text-bad" onClick={() => remove('Cartable', c.id)} title={L('حذف', 'Remove')} aria-label={L('حذف', 'Remove')}><Trash2 size={14} /></button>}
        </div>
      </div>
    </li>
  )
}

export const countLabel = (n: number) => L(`${fa(n)} مورد`, `${n} items`)

/** A whole selection to someone's cartable at once (one save); items already there are skipped. */
export function CartableMany({ items, onDone }: { items: { entity: CartableItem['entity']; entity_id: string; title: string; due_date?: string }[]; onDone?: () => void }) {
  const { db, me, upsertMany, toast } = useStore()
  const owners = cartableOwners(db)
  if (!owners.length || !items.length) return null
  const send = async (owner: string) => {
    const there = (x: { entity: CartableItem['entity']; entity_id: string }) => db.Cartable.some((c) => c.owner === owner && c.entity === x.entity && c.entity_id === x.entity_id && (c.status === 'sent' || c.status === 'draft'))
    const fresh = items.filter((x) => !there(x))
    const mine = owner === me
    const at = nowStamp()
    await upsertMany(
      'Cartable',
      fresh.map((x, i) => ({
        id: uid('CB'), owner, box: 'daily' as CartableBox, period: periodOf('daily'), from: me, entity: x.entity, entity_id: x.entity_id, title: x.title, ask: '', kind: 'review',
        priority: 'medium', due_date: x.due_date || '', status: mine ? 'sent' : 'draft', response: '', sent_at: mine ? at : '', done_at: '', sort: Date.now() + i, created_at: at,
      })),
    )
    toast(L(`${fa(fresh.length)} مورد به کارتابل ${owner === me ? 'شما' : owner} رفت${items.length > fresh.length ? ` (${fa(items.length - fresh.length)} از قبل بود)` : ''}${mine ? '' : '؛ با «ارسال کارتابل» فرستاده می‌شود'}`, `${fresh.length} added`))
    onDone?.()
  }
  return (
    <>
      {owners.map((n) => (
        <button key={n} className="btn-outline btn-sm" onClick={() => void send(n)}>
          <Inbox size={14} /> {n === me ? L('به کارتابل من', 'To my cartable') : L(`به کارتابل ${n.split(' ')[0]}`, `To ${n.split(' ')[0]}’s`)}
        </button>
      ))}
    </>
  )
}
