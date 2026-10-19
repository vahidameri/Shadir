// Task configuration for the program manager: rules, which fields a task has, areas and kanban columns.
// Shown in the back office (Settings) and from the Tasks page; everything is stored in the Config tab.
import { useState } from 'react'
import { ArrowDown, ArrowUp, Bell, Columns3, ListChecks, Plus, SlidersHorizontal, Tags, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, Sheet, cx } from './ui'
import { L, tr, type T2 } from '../lib/i18n'
import { TASK_FIELDS, TASK_KEYS, fieldKey, taskCfg, type FieldMode, type TaskField } from '../lib/taskcfg'
import { BUILTIN, COLUMNS_KEY, columnColor, columns, statusLabel, withColumn, type Column } from '../lib/columns'
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

const DUE_OPTS: [string, T2][] = [['', ['بدون سررسید', 'None']], ['0', ['امروز', 'Today']], ['1', ['فردا', 'Tomorrow']], ['3', ['۳ روز بعد', 'In 3 days']], ['7', ['هفته‌ی بعد', 'Next week']]]

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
        {due(L('سررسید پیش‌فرض', 'Default due date'), TASK_KEYS.defaultDue, c.defaultDue)}
        {toggle(L('سررسید اجباری', 'Due date required'), TASK_KEYS.dueRequired, c.dueRequired)}
        {toggle(L('پروژه اجباری', 'Project required'), TASK_KEYS.projectRequired, c.projectRequired)}
        <div className="space-y-4 border-t border-line pt-4">
          {pick(L('بدون سررسید مجاز برای', 'May skip the due date'), TASK_KEYS.noDue, c.noDue)}
          {due(L('سررسید پیش‌فرض این افراد', 'Their default due date'), TASK_KEYS.flexDefaultDue, c.flexDefaultDue)}
          {pick(L('تسک شخصی (بدون پروژه) برای', 'Personal tasks (no project) for'), TASK_KEYS.personal, c.personal)}
        </div>
      </div>
    </Card>
  )
}

const FIELD_LABEL: Record<TaskField, T2> = {
  start_date: ['تاریخ شروع', 'Start date'],
  estimate: ['تخمین زمان (ساعت)', 'Time estimate (hours)'],
  checklist: ['چک‌لیست', 'Checklist'],
  deadline: ['ددلاین (تحویل نهایی)', 'Deadline (final delivery)'],
  handoff_date: ['تحویل به پروداکت', 'Hand-off to product'],
  test_date: ['زمان تست', 'Testing'],
  follow_date: ['تاریخ یادآوری', 'Reminder date'],
  area: ['حوزه', 'Area'],
  collaborators: ['همکاران (تسک مشترک)', 'Shared with'],
  watchers: ['ناظرها', 'Watchers'],
  sprint_id: ['اسپرینت', 'Sprint'],
  points: ['امتیاز', 'Story points'],
  tags: ['برچسب', 'Tags'],
  track: ['تیم (پروداکت/تک)', 'Track'],
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

/** Kanban columns: rename, reorder, add; added columns can be removed (their tasks go back to "to do"). */
export function ColumnsCard({ admin }: { admin: boolean }) {
  const { db, setSetting, upsert, toast } = useStore()
  const list = columns()
  const [name, setName] = useState('')
  const save = (next: Column[]) => setSetting(COLUMNS_KEY, JSON.stringify(next))
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
    for (const t of moved) await upsert('Tasks', { ...t, status: 'todo' })
    toast(L(`ستون حذف شد${moved.length ? ` و ${moved.length} تسک به «برای انجام» رفت` : ''}`, `Column removed${moved.length ? `; ${moved.length} task(s) moved to To do` : ''}`))
  }
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Columns3 size={12} /> {L('کانبان', 'Kanban')}</span>} title={L('ستون‌های بورد', 'Board columns')}>
      <ul className="space-y-1.5">
        {list.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl border border-line px-2.5 py-1.5">
            {admin ? (
              <input type="color" className="h-6 w-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" defaultValue={c.color || columnColor(c.id)} onBlur={(e) => e.target.value !== (c.color || '') && save(list.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)))} aria-label={L('رنگ ستون', 'Column colour')} />
            ) : (
              <StatusIcon s={c.id} size={15} />
            )}
            <input key={statusLabel(c.id)} className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none focus:bg-muted disabled:opacity-80" disabled={!admin} defaultValue={statusLabel(c.id)} onBlur={(e) => rename(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
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
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && save(withColumn(list, name.trim())), setName(''))}>
          <input className="input h-9 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('ستون جدید، مثلاً «آماده‌ی تست»', 'New column, e.g. “Ready for QA”')} />
          <button className="btn-outline btn-sm h-9" disabled={!name.trim()}>
            <Plus size={14} /> {L('افزودن', 'Add')}
          </button>
        </form>
      )}
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
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <FieldsCard admin={admin} />
        <ColumnsCard admin={admin} />
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
    <Card eyebrow={<span className="flex items-center gap-1.5"><Bell size={12} /> {L('اعلان‌ها', 'Notifications')}</span>} title={L('اعلان‌های داخل اطلس', 'Notifications inside Atlas')}>
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
