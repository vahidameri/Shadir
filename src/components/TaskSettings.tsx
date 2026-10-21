// Task configuration for the program manager: rules, which fields a task has, areas, statuses, flags and alerts.
// Shown in the back office (Settings) and from the Tasks page; everything is stored in the Config tab.
import { useState } from 'react'
import { ArrowDown, ArrowUp, Bell, Columns3, Flag as FlagIcon, ListChecks, Plus, SlidersHorizontal, Tags, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, Sheet, cx } from './ui'
import { L, tr, type T2 } from '../lib/i18n'
import { TASK_FIELDS, TASK_KEYS, fieldKey, taskCfg, type FieldMode, type Flag, type TaskField } from '../lib/taskcfg'
import { BUILTIN, COLUMNS_KEY, catOf, columnHex, columns, firstOf, statusLabel, withColumn, type Column } from '../lib/columns'
import { STATUS_CAT } from '../lib/labels'
import type { StatusCat } from '../lib/types'
import { StatusIcon } from './ui'
import { useEditor } from './Editor'
import { NOTIFY_KEY, NOTIFY_KINDS, notifyOff } from '../lib/inbox'

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', on ? 'bg-good' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'start-[1.375rem]' : 'start-0.5')} />
    </button>
  )
}

const DUE_OPTS: [string, T2][] = [['', ['بدون ددلاین', 'None']], ['0', ['امروز', 'Today']], ['1', ['فردا', 'Tomorrow']], ['3', ['۳ روز بعد', 'In 3 days']], ['7', ['هفته‌ی بعد', 'Next week']]]

/** Task rules: defaults, what is required, and who may skip the due date or log personal tasks. */
export function TaskCard({ admin }: { admin: boolean }) {
  const { db, setSetting } = useStore()
  const c = taskCfg()
  const people = db.Team.filter((m) => String(m.active) !== 'false')
  const due = (label: string, key: string, value: string) => (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm font-medium">{label}</div>
      <select className="input h-9 w-36 text-xs" disabled={!admin} value={value} onChange={(e) => setSetting(key, e.target.value)}>
        {DUE_OPTS.map(([v, t]) => (
          <option key={v} value={v}>
            {tr(t)}
          </option>
        ))}
      </select>
    </div>
  )
  const toggle = (label: string, key: string, on: boolean) => (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm font-medium">{label}</div>
      <Switch on={on} onChange={(v) => setSetting(key, v ? '1' : '0')} disabled={!admin} />
    </div>
  )
  const pick = (label: string, key: string, ids: string[]) => (
    <div>
      <div className="mb-2 text-sm font-medium">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {people.map((m) => {
          const on = ids.includes(m.id)
          return (
            <button key={m.id} disabled={!admin} onClick={() => setSetting(key, (on ? ids.filter((x) => x !== m.id) : [...ids, m.id]).join(','))} className={cx('h-8 rounded-full border px-3 text-xs transition disabled:opacity-60', on ? 'border-ink bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
              {m.name}
            </button>
          )
        })}
      </div>
    </div>
  )
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><ListChecks size={12} /> {L('تسک', 'Tasks')}</span>} title={L('قوانین تسک', 'Task rules')}>
      <div className="space-y-4">
        {due(L('ددلاین پیش‌فرض', 'Default deadline'), TASK_KEYS.defaultDue, c.defaultDue)}
        {toggle(L('ددلاین اجباری', 'Deadline required'), TASK_KEYS.dueRequired, c.dueRequired)}
        {toggle(L('پروژه اجباری', 'Project required'), TASK_KEYS.projectRequired, c.projectRequired)}
        <div className="space-y-4 border-t border-line pt-4">
          {pick(L('بدون ددلاین مجاز برای', 'May skip the deadline'), TASK_KEYS.noDue, c.noDue)}
          {due(L('ددلاین پیش‌فرض این افراد', 'Their default due date'), TASK_KEYS.flexDefaultDue, c.flexDefaultDue)}
          {pick(L('تسک شخصی (بدون پروژه) برای', 'Personal tasks (no project) for'), TASK_KEYS.personal, c.personal)}
        </div>
      </div>
    </Card>
  )
}

const FIELD_LABEL: Record<TaskField, T2> = {
  assigned_at: ['تاریخ اساین', 'Assigned on'],
  flag: ['پرچم', 'Flag'],
  requested_by: ['درخواست‌دهنده', 'Requested by'],
  link: ['لینک (مثلاً میزیتو)', 'Link (e.g. Mizito)'],
  start_date: ['تاریخ شروع', 'Start date'],
  estimate: ['تخمین زمان (ساعت)', 'Time estimate (hours)'],
  checklist: ['چک‌لیست', 'Checklist'],
  deadline: ['ددلاین دوم (تحویل نهایی)', 'Second deadline (final delivery)'],
  handoff_date: ['تحویل به پروداکت', 'Hand-off to product'],
  test_date: ['زمان تست', 'Testing'],
  follow_date: ['تاریخ یادآوری', 'Reminder date'],
  area: ['حوزه', 'Area'],
  collaborators: ['همکاران (تسک مشترک)', 'Shared with'],
  watchers: ['ناظرها', 'Watchers'],
  sprint_id: ['اسپرینت', 'Sprint'],
  points: ['امتیاز', 'Story points'],
  tags: ['برچسب', 'Tags'],
  track: ['تیم', 'Team'],
}
const MODES: [FieldMode, T2][] = [['off', ['خاموش', 'Off']], ['on', ['اختیاری', 'Optional']], ['req', ['اجباری', 'Required']]]

/** Which fields a task has, and the list of areas. */
export function FieldsCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = taskCfg()
  const [area, setArea] = useState('')
  const saveAreas = (list: string[]) => setSetting(TASK_KEYS.areas, list.join(','))
  const addArea = () => {
    const a = area.trim().replace(/,/g, ' ')
    setArea('')
    if (a && !c.areas.includes(a)) saveAreas([...c.areas, a])
  }
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><SlidersHorizontal size={12} /> {L('تسک', 'Tasks')}</span>} title={L('فیلدهای تسک و حوزه‌ها', 'Task fields & areas')}>
      <div className="space-y-2.5">
        {TASK_FIELDS.map((f) => (
          <div key={f} className="flex items-center justify-between gap-3">
            <div className="text-sm">{tr(FIELD_LABEL[f])}</div>
            <div className="inline-flex gap-0.5 rounded-full bg-muted p-0.5">
              {MODES.map(([m, l]) => (
                <button key={m} disabled={!admin} onClick={() => setSetting(fieldKey(f), m)} className={cx('h-7 rounded-full px-2.5 text-[0.6875rem] transition disabled:opacity-60', c.fields[f] === m ? 'bg-surface font-medium text-ink shadow-sm' : 'text-sub hover:text-ink')}>
                  {tr(l)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Tags size={14} /> {L('حوزه‌ها', 'Areas')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.areas.map((a) => (
            <span key={a} className="inline-flex h-8 items-center gap-1 rounded-full border border-line ps-3 pe-1 text-xs">
              {a}
              {admin && (
                <button className="grid h-6 w-6 place-items-center rounded-full text-sub hover:bg-muted hover:text-bad" onClick={() => saveAreas(c.areas.filter((x) => x !== a))} aria-label={L('حذف', 'Remove')}>
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ))}
          {!c.areas.length && <span className="text-xs text-sub">{L('هنوز حوزه‌ای تعریف نشده (فیلد حوزه پنهان است).', 'No areas yet (the area field stays hidden).')}</span>}
        </div>
        {admin && (
          <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), addArea())}>
            <input className="input h-9 flex-1 text-xs" value={area} onChange={(e) => setArea(e.target.value)} placeholder={L('مثلاً طراحی، توسعه، محتوا، فروش', 'e.g. Design, Engineering, Content, Sales')} />
            <button className="btn-outline btn-sm h-9" disabled={!area.trim()}>
              <Plus size={14} /> {L('افزودن', 'Add')}
            </button>
          </form>
        )}
      </div>
    </Card>
  )
}

/** Statuses: rename, recolour, reorder, add; each added status has a category; added ones can be removed (their tasks go back to "to do"). */
export function ColumnsCard({ admin }: { admin: boolean }) {
  const { db, setSetting, upsert, toast } = useStore()
  const list = columns()
  const [name, setName] = useState('')
  const [cat, setCat] = useState<StatusCat>('active')
  const save = (next: Column[]) => setSetting(COLUMNS_KEY, JSON.stringify(next))
  const cats = Object.keys(STATUS_CAT) as StatusCat[]
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const rename = (i: number, v: string) => {
    if (!v.trim() || v === statusLabel(list[i].id)) return
    save(list.map((c, k) => (k === i ? { ...c, fa: L(v.trim(), c.fa), en: L(c.en, v.trim()) } : c)))
  }
  const del = async (c: Column) => {
    const moved = db.Tasks.filter((t) => t.status === c.id)
    await save(list.filter((x) => x.id !== c.id))
    for (const t of moved) await upsert('Tasks', { ...t, status: firstOf('open') })
    toast(L(`ستون حذف شد${moved.length ? ` و ${moved.length} تسک به «برای انجام» رفت` : ''}`, `Column removed${moved.length ? `; ${moved.length} task(s) moved to To do` : ''}`))
  }
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Columns3 size={12} /> {L('وضعیت‌ها و بورد', 'Statuses & board')}</span>} title={L('وضعیت‌های تسک', 'Task statuses')}>
      <p className="mb-3 text-xs leading-6 text-sub">{L('هر وضعیت یک «دسته» دارد که معنی‌اش را برای پیگیری مشخص می‌کند: باز، در جریان، در انتظار، مسدود، انجام‌شده یا لغوشده. معوق‌ها، داشبورد و هشدارها از روی دسته حساب می‌شوند. «ورودی» و «لغوشده» در بورد نمی‌آیند.', 'Each status has a category that says what it means for tracking. Overdue counts, the desk and alerts follow the category. Intake and cancelled stay off the board.')}</p>
      <ul className="space-y-1.5">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl border border-line px-2.5 py-1.5">
            {admin ? (
              <input type="color" className="h-6 w-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" defaultValue={c.color || columnHex(c.id)} onBlur={(e) => e.target.value !== (c.color || columnHex(c.id)) && save(list.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)))} aria-label={L('رنگ ستون', 'Column colour')} />
            ) : (
              <StatusIcon s={c.id} size={15} />
            )}
            <input key={statusLabel(c.id)} className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none focus:bg-muted disabled:opacity-80" disabled={!admin} defaultValue={statusLabel(c.id)} onBlur={(e) => rename(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            {BUILTIN.has(c.id) || !admin ? (
              <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] text-sub sm:inline">{tr(STATUS_CAT[catOf(c.id)])}</span>
            ) : (
              <select className="h-7 shrink-0 rounded-lg bg-muted px-1.5 text-[0.6875rem]" value={catOf(c.id)} onChange={(e) => save(list.map((x, k) => (k === i ? { ...x, cat: e.target.value as StatusCat } : x)))} aria-label={L('دسته', 'Category')}>
                {cats.map((k) => <option key={k} value={k}>{tr(STATUS_CAT[k])}</option>)}
              </select>
            )}
            <span className="text-[0.6875rem] text-sub num">{db.Tasks.filter((t) => t.status === c.id).length}</span>
            {admin && (
              <>
                <button className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={L('بالا', 'Up')}>
                  <ArrowUp size={13} />
                </button>
                <button className="icon-btn h-7 w-7" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={L('پایین', 'Down')}>
                  <ArrowDown size={13} />
                </button>
                {!BUILTIN.has(c.id) ? (
                  <button className="icon-btn h-7 w-7 hover:text-bad" onClick={() => del(c)} aria-label={L('حذف ستون', 'Remove column')}>
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span className="w-7" />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && save(withColumn(list, name.trim(), cat)), setName(''))}>
          <input className="input h-9 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('وضعیت جدید، مثلاً «منتظر تأیید CPTO»', 'New status, e.g. “Awaiting CPTO sign-off”')} />
          <select className="input h-9 w-36 text-xs" value={cat} onChange={(e) => setCat(e.target.value as StatusCat)} aria-label={L('دسته', 'Category')}>
            {cats.map((k) => <option key={k} value={k}>{tr(STATUS_CAT[k])}</option>)}
          </select>
          <button className="btn-outline btn-sm h-9" disabled={!name.trim()}>
            <Plus size={14} /> {L('افزودن', 'Add')}
          </button>
        </form>
      )}
    </Card>
  )
}

/** Tracking flags (watch, key, escalate, …) and when an open task counts as stale or a blocker raises an alert. */
export function FlagsCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = taskCfg()
  const [name, setName] = useState('')
  const save = (next: Flag[]) => setSetting(TASK_KEYS.flags, JSON.stringify(next))
  const num = (label: string, hint: string, key: string, value: number) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[0.6875rem] text-sub">{hint}</div>
      </div>
      <input type="number" min={1} max={90} className="input h-9 w-20 text-center text-xs" disabled={!admin} defaultValue={value} onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== value && setSetting(key, String(Number(e.target.value)))} />
    </div>
  )
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><FlagIcon size={12} /> {L('پیگیری', 'Tracking')}</span>} title={L('پرچم‌ها و هشدارها', 'Flags & alerts')}>
      <ul className="space-y-1.5">
        {c.flags.map((x, i) => (
          <li key={x.id} className="flex items-center gap-2 rounded-2xl border border-line px-2.5 py-1.5">
            <input type="color" disabled={!admin} className="h-6 w-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" defaultValue={x.color} onBlur={(e) => e.target.value !== x.color && save(c.flags.map((y, k) => (k === i ? { ...y, color: e.target.value } : y)))} aria-label={L('رنگ', 'Colour')} />
            <FlagIcon size={14} style={{ color: x.color }} className="shrink-0" fill={x.color} />
            <input key={L(x.fa, x.en)} className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none focus:bg-muted disabled:opacity-80" disabled={!admin} defaultValue={L(x.fa, x.en)}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== L(x.fa, x.en) && save(c.flags.map((y, k) => (k === i ? { ...y, fa: L(e.target.value.trim(), y.fa), en: L(y.en, e.target.value.trim()) } : y)))}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            {admin && (
              <button className="icon-btn h-7 w-7 hover:text-bad" onClick={() => save(c.flags.filter((y) => y.id !== x.id))} aria-label={L('حذف', 'Remove')}>
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && save([...c.flags, { id: `f-${Date.now().toString(36)}`, fa: name.trim(), en: name.trim(), color: '#6b7180' }]), setName(''))}>
          <input className="input h-9 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('پرچم جدید، مثلاً «درخواست CPTO»', 'New flag, e.g. “CPTO ask”')} />
          <button className="btn-outline btn-sm h-9" disabled={!name.trim()}>
            <Plus size={14} /> {L('افزودن', 'Add')}
          </button>
        </form>
      )}
      <div className="mt-5 space-y-3 border-t border-line pt-4">
        {num(L('راکد بعد از (روز)', 'Stale after (days)'), L('تسک بازی که این مدت تغییری نکرده «راکد» حساب می‌شود', 'An open task untouched this long counts as stale'), TASK_KEYS.staleDays, c.staleDays)}
        {num(L('پینگ بعدی پیگیری‌ها (روز بعد)', 'Next follow-up ping (days)'), L('بعد از زدن «پینگ زدم»، پینگ بعدی چند روز دیگر باشد', 'After “Pinged”, the next ping is due in'), TASK_KEYS.pingDays, c.pingDays)}
        {num(L('هشدار انسداد بعد از (روز)', 'Blocker alert after (days)'), L('تسکی که این مدت مسدود مانده، هشدار و پیشنهاد پیگیری می‌گیرد', 'A task blocked this long raises an alert and a follow-up suggestion'), TASK_KEYS.blockedDays, c.blockedDays)}
      </div>
    </Card>
  )
}

/** Everything about tasks in one panel, opened from the Tasks page. */
export function TaskSettingsSheet({ onClose }: { onClose: () => void }) {
  const { access } = useStore()
  const { open } = useEditor()
  const admin = access === 'super'
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div>
          <div className="eyebrow">{L('مدیر برنامه', 'Program manager')}</div>
          <h2 className="font-semibold">{L('تنظیمات تسک‌ها', 'Task settings')}</h2>
        </div>
      }
      footer={
        <>
          <button className="btn-outline btn-sm" onClick={() => open('Projects')}>
            <Plus size={14} /> {L('پروژه‌ی جدید', 'New project')}
          </button>
          <div className="flex-1" />
          <button className="btn-primary btn-sm" onClick={onClose}>
            {L('بستن', 'Close')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 p-4 @2xl:grid-cols-2">
        <FieldsCard admin={admin} />
        <ColumnsCard admin={admin} />
        <FlagsCard admin={admin} />
        <TaskCard admin={admin} />
      </div>
    </Sheet>
  )
}

/** In-app notifications: which kinds the team gets. Email is separate (Automations, off by default). */
export function NotifyCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const off = notifyOff()
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Bell size={12} /> {L('اعلان‌ها', 'Notifications')}</span>} title={L('اعلان‌های داخل مدار', 'Notifications inside Madar')}>
      <p className="mb-3 text-xs leading-6 text-sub">{L('اعلان‌ها داخل اپ (زنگوله‌ی بالا و پیام کوتاه) می‌آیند. ایمیل فقط برای مواردی می‌رود که در «اتوماسیون‌ها» روشن کنید، یا با دکمه‌ی «ارسال ایمیل» در هر تسک.', 'Notifications arrive in the app (the bell and a short pop-up). Email goes only for what you switch on under Automations, or with “Send email” on a task.')}</p>
      <div className="space-y-2.5">
        {NOTIFY_KINDS.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-3">
            <div className="text-sm">{tr(k.label)}</div>
            <Switch on={!off.includes(k.id)} disabled={!admin} onChange={(v) => setSetting(NOTIFY_KEY, (v ? off.filter((x) => x !== k.id) : [...off, k.id]).join(','))} />
          </div>
        ))}
      </div>
    </Card>
  )
}
