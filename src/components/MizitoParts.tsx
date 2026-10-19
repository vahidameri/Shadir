// Mizito pieces: the priority badge, the signal chips, the capture sheet ("a new mention"), the item
// sheet (thread, status, outcome, reminder text) and the settings (statuses, categories, actions,
// weights, thresholds, reminder template).
import { useMemo, useState } from 'react'
import { AtSign, Ban, Check, Clock, Copy, ExternalLink, FileText, Flame, Hourglass, Link2, MessageSquarePlus, MoonStar, Plus, Settings2, Trash2, UserRound, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Avatar, Card, MenuItem, Popover, Sheet, cx } from './ui'
import { DatePicker } from './DatePicker'
import { PersonPicker } from './pickers'
import { L, locale } from '../lib/i18n'
import { fa, fmtDate, fmtDayMonth, timeAgo, todayISO } from '../lib/jalali'
import { uid } from '../lib/api'
import { historyOf } from '../lib/history'
import { historyText } from './TaskTracking'
import {
  MZ_KEYS, P_COLOR, P_HINT, allPeople, askersOf, firstMzStatus, isMizitoLink, mentionsOf, mzCat, mzCfg, mzClosed, mzKeyOf, mzSignals, nowStampMz, optLabel, reminderText, statusById, tierOf,
  type MzCat, type MzOption, type MzStatus,
} from '../lib/mizito'
import type { MizitoItem, MizitoMention } from '../lib/types'

const toDate = (s: string) => new Date(String(s).replace(' ', 'T'))
const chip = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] leading-5'

export function PBadge({ p, big }: { p: number; big?: boolean }) {
  return (
    <span className={cx('inline-grid shrink-0 place-items-center rounded-lg font-mono font-bold text-white', big ? 'h-9 w-11 text-sm' : 'h-6 w-8 text-[0.6875rem]')} style={{ background: P_COLOR[p] }} title={L(...P_HINT[p])}>
      P{p}
    </span>
  )
}

export function MzStatusChip({ id }: { id: string }) {
  const s = statusById(id)
  const cat = mzCat(id)
  const tone: Record<MzCat, string> = { open: 'bg-warn/10 text-warn', waiting: 'bg-violet-500/10 text-violet-600', blocked: 'bg-bad/10 text-bad', done: 'bg-good/10 text-good', cancelled: 'bg-muted text-sub' }
  return <span className={cx(chip, tone[cat])}>{s ? optLabel(s) : id || '—'}</span>
}

/** SLA, deadline, mentions, quiet days — the row's story in chips. */
export function MzSignals({ m, compact }: { m: MizitoItem; compact?: boolean }) {
  const { db } = useStore()
  const s = mzSignals(db, m)
  const h = (n: number) => (Math.abs(n) >= 48 ? L(`${fa(Math.round(Math.abs(n) / 24))} روز`, `${Math.round(Math.abs(n) / 24)}d`) : L(`${fa(Math.abs(n))} ساعت`, `${Math.abs(n)}h`))
  return (
    <span className="flex flex-wrap items-center gap-1">
      {m.urgent === '1' && (
        <span className={cx(chip, 'bg-bad/10 font-medium text-bad')}>
          <Flame size={11} /> {L('فوری', 'Urgent')}
        </span>
      )}
      {s.slaLeft !== null && (
        <span className={cx(chip, s.breached ? 'bg-bad/10 font-semibold text-bad' : s.slaLeft <= 4 ? 'bg-warn/10 text-warn' : 'bg-muted text-sub')} title={`SLA ${s.tier ? optLabel(s.tier) : ''}: ${s.tier?.sla || ''}h`}>
          <Hourglass size={11} />
          {s.breached ? L(`${h(s.slaLeft)} عبور از SLA`, `SLA breached ${h(s.slaLeft)}`) : L(`${h(s.slaLeft)} تا SLA`, `${h(s.slaLeft)} to SLA`)}
        </span>
      )}
      {s.toDue !== null && (
        <span className={cx(chip, s.toDue < 0 ? 'bg-bad/10 text-bad' : s.toDue <= 2 ? 'bg-warn/10 text-warn' : 'bg-muted text-sub')}>
          <Clock size={11} />
          {s.toDue === 0 ? L('ددلاین امروز', 'Due today') : s.toDue > 0 ? L(`${fa(s.toDue)} روز تا ددلاین`, `${s.toDue}d left`) : L(`${fa(-s.toDue)} روز تأخیر`, `${-s.toDue}d late`)}
        </span>
      )}
      {s.mentions > 1 && (
        <span className={cx(chip, 'bg-brand/10 text-brand')} title={L('تعداد منشن', 'Mentions')}>
          <AtSign size={11} />
          {L(`${fa(s.mentions)} منشن`, `${s.mentions} mentions`)}
          {!compact && m.last_mention_by && <span className="opacity-80">· {L('آخرین', 'last')}: {m.last_mention_by}</span>}
        </span>
      )}
      {s.stale && (
        <span className={cx(chip, 'bg-muted text-sub')}>
          <MoonStar size={11} /> {L(`راکد ${fa(s.quietDays)} روز`, `Quiet ${s.quietDays}d`)}
        </span>
      )}
      {m.assigned_to && (
        <span className={cx(chip, 'text-sub')}>
          <UserRound size={11} /> {L('سپرده به', 'with')} {m.assigned_to}
        </span>
      )}
    </span>
  )
}

export function MzLink({ m, label }: { m: MizitoItem; label?: boolean }) {
  if (!m.link) return null
  return (
    <a href={m.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cx('inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 text-xs text-sub transition hover:border-brand/40 hover:text-brand', label ? 'h-8' : 'h-7')} title={L('باز کردن در میزیتو', 'Open in Mizito')}>
      <ExternalLink size={13} /> {label !== false && L('میزیتو', 'Mizito')}
    </a>
  )
}

/** Copies the reminder (settings template) for the person the ball is with. */
export function useReminder() {
  const { db, toast } = useStore()
  return (m: MizitoItem, to?: string) => {
    const who = to || m.assigned_to || m.asked_by
    const days = Math.max(0, Math.floor((Date.now() - toDate(m.last_mention_at || m.received_at || m.created_at).getTime()) / 86400000))
    const text = reminderText(m, who, days, m.asked_by)
    navigator.clipboard?.writeText(text).then(
      () => toast(L('متن یادآوری کپی شد — در میزیتو بچسبانید', 'Reminder copied — paste it in Mizito')),
      () => toast(L('کپی انجام نشد', 'Copy failed'), 'err'),
    )
    void db
  }
}

// ------------------------------------------------------------------ capture: paste a link → thread or new
export function CaptureSheet({ onClose, onOpen, initialLink = '' }: { onClose: () => void; onOpen: (id: string) => void; initialLink?: string }) {
  const { db, upsert, toast, me } = useStore()
  const c = mzCfg()
  const [link, setLink] = useState(initialLink)
  const key = mzKeyOf(link)
  const existing = key ? db.Mizito.find((m) => m.mz_key === key) : undefined
  const leaders = db.Team.filter((m) => m.access === 'super' || m.access === 'exec').map((m) => m.name)
  const [f, setF] = useState<Record<string, string>>({ title: '', asked_by: '', mentioned: leaders.find((n) => n !== me) || me, category: '', action: '', due_date: '', urgent: '', description: '', docs: '', note: '', status: '' })
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const now = nowStampMz()
      if (existing) {
        const mention: MizitoMention = { id: uid('MM'), item_id: existing.id, by: f.asked_by || existing.asked_by, at: now, note: f.note, status: f.status }
        await upsert('MizitoMentions', mention)
        // a new mention re-opens a closed item and restarts the SLA
        const status = f.status || (mzClosed(existing) ? firstMzStatus('open') : existing.status)
        await upsert('Mizito', { ...existing, status, last_mention_at: now, last_mention_by: mention.by, urgent: f.urgent === '1' ? '1' : existing.urgent })
        toast(L('منشن به ترد همین مورد اضافه شد', 'Mention added to the thread'))
        onOpen(existing.id)
      } else {
        const id = uid('MZ')
        const row = {
          id, mz_key: key, link: link.trim(), title: f.title.trim(), description: f.description, docs: f.docs, asked_by: f.asked_by, mentioned: f.mentioned, category: f.category, action: f.action,
          status: f.status || firstMzStatus('open'), priority_override: '', override_reason: '', urgent: f.urgent, assigned_to: '', due_date: f.due_date, received_at: now, last_mention_at: now,
          last_mention_by: f.asked_by, outcome: '', notes: f.note, created_at: todayISO(), updated_at: now, closed_at: '',
        } as MizitoItem
        await upsert('Mizito', row)
        toast(L('مورد میزیتو ثبت شد', 'Mizito item saved'))
        onOpen(id)
      }
      onClose()
    } catch {
      setSaving(false)
    }
  }
  const ok = existing ? true : !!f.title.trim()
  const sel = (k: string, opts: { id: string; fa: string; en: string }[], empty: string) => (
    <select className="input h-10 text-sm" value={f[k]} onChange={(e) => set(k, e.target.value)}>
      <option value="">{empty}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{optLabel(o)}</option>)}
    </select>
  )
  return (
    <Sheet
      open
      onClose={onClose}
      header={
        <div>
          <div className="eyebrow">{L('میزیتو', 'Mizito')}</div>
          <h2 className="font-semibold">{existing ? L('منشن دوباره روی همین تسک', 'Another mention on this task') : L('ثبت منشن جدید', 'Log a mention')}</h2>
        </div>
      }
      footer={
        <>
          <button className="btn-primary" disabled={!ok || saving} onClick={save}>
            {existing ? L('افزودن به ترد', 'Add to thread') : L('ثبت', 'Save')}
          </button>
          <button className="btn-ghost" onClick={onClose}>{L('انصراف', 'Cancel')}</button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="label">{L('لینک تسک در میزیتو', 'Mizito task link')}</span>
          <input autoFocus dir="ltr" className="input h-11 w-full text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder={`${c.base}/#/ws/tasks/inbox/…`} />
          <span className="mt-1 block text-[0.6875rem] text-sub">
            {!link ? L('لینک را از نوار آدرس میزیتو کپی کنید. بدون لینک هم می‌شود ثبت کرد.', 'Copy it from Mizito’s address bar. You can also save without a link.') : isMizitoLink(link) ? L(`شناسه‌ی تسک: ${key}`, `Task id: ${key}`) : L('شناسه‌ی تسک در این لینک پیدا نشد؛ لینک کامل تسک را بچسبانید.', 'No task id in this link; paste the full task link.')}
          </span>
        </label>

        {existing && (
          <div className="rounded-2xl border border-brand/30 bg-brand-soft/30 p-4">
            <div className="flex items-start gap-3">
              <PBadge p={mzSignals(db, existing).p} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{existing.title}</div>
                <div className="mt-1 text-xs text-sub">
                  {L('این تسک قبلاً ثبت شده', 'Already logged')} · {existing.asked_by} · {fmtDate(existing.received_at)} · {L(`${fa(1 + mentionsOf(db, existing.id).length)} منشن`, `${1 + mentionsOf(db, existing.id).length} mentions`)}
                </div>
              </div>
              <MzStatusChip id={existing.status} />
            </div>
            <p className="mt-2 text-xs text-sub">{L('ردیف تازه ساخته نمی‌شود؛ این منشن به ترد همین مورد اضافه می‌شود و SLA از نو شروع می‌شود.', 'No new row: this mention joins the thread and restarts the SLA.')}</p>
          </div>
        )}

        {!existing && (
          <label className="block">
            <span className="label">{L('عنوان', 'Title')} *</span>
            <input className="input h-10 w-full text-sm" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{existing ? L('چه کسی دوباره منشن کرد', 'Who mentioned again') : L('چه کسی مطرح کرد / منشن کرد', 'Raised / mentioned by')}</span>
            <input list="mz-people" className="input h-10 w-full text-sm" value={f.asked_by} onChange={(e) => set('asked_by', e.target.value)} placeholder={existing?.asked_by} />
            <datalist id="mz-people">{allPeople(db).map((p) => <option key={p} value={p} />)}</datalist>
            {f.asked_by && <span className="mt-1 block text-[0.6875rem]" style={{ color: tierOf(db, f.asked_by)?.color }}>{tierOf(db, f.asked_by) ? `${optLabel(tierOf(db, f.asked_by))} · SLA ${fa(tierOf(db, f.asked_by)!.sla)}${L(' ساعت', 'h')}` : ''}</span>}
          </label>
          {existing ? (
            <label className="block">
              <span className="label">{L('وضعیت جدید (اختیاری)', 'New status (optional)')}</span>
              {sel('status', c.statuses, L('بدون تغییر', 'No change'))}
            </label>
          ) : (
            <label className="block">
              <span className="label">{L('چه کسی منشن شد', 'Who was mentioned')}</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {leaders.map((n) => {
                  const on = f.mentioned.split(',').map((x) => x.trim()).includes(n)
                  return (
                    <button key={n} type="button" onClick={() => set('mentioned', (on ? f.mentioned.split(',').map((x) => x.trim()).filter((x) => x !== n) : [...f.mentioned.split(',').map((x) => x.trim()).filter(Boolean), n]).join(','))} className={cx('h-9 rounded-full border px-3 text-xs', on ? 'border-ink bg-ink text-surface' : 'border-line text-sub')}>
                      {n}
                    </button>
                  )
                })}
              </div>
            </label>
          )}
          {!existing && (
            <>
              <label className="block"><span className="label">{L('دسته', 'Category')}</span>{sel('category', c.categories, '—')}</label>
              <label className="block"><span className="label">{L('نوع اقدام', 'Action')}</span>{sel('action', c.actions, '—')}</label>
              <label className="block">
                <span className="label">{L('ددلاین', 'Deadline')}</span>
                <DatePicker value={f.due_date} onChange={(v) => set('due_date', v)} />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={f.urgent === '1'} onChange={(e) => set('urgent', e.target.checked ? '1' : '')} />
            <Flame size={14} className="text-bad" /> {L('فوری', 'Urgent')}
          </label>
        </div>
        {!existing && (
          <>
            <label className="block">
              <span className="label">{L('شرح', 'Description')}</span>
              <textarea rows={3} className="input w-full py-2 text-sm" value={f.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <label className="block">
              <span className="label">{L('مستندات (هر لینک در یک خط)', 'Documents (one link per line)')}</span>
              <textarea rows={2} dir="ltr" className="input w-full py-2 text-xs" value={f.docs} onChange={(e) => set('docs', e.target.value)} />
            </label>
          </>
        )}
        <label className="block">
          <span className="label">{L('یادداشت این منشن', 'Note for this mention')}</span>
          <textarea rows={2} className="input w-full py-2 text-sm" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder={L('مثلاً «دوباره پیگیری کردند، تا فردا جواب می‌خواهند»', 'e.g. “Chased again, want an answer by tomorrow”')} />
        </label>
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ the item
export function MizitoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, upsert, remove, toast, canEdit } = useStore()
  const { open } = useEditor()
  const m = db.Mizito.find((x) => x.id === id)
  const remind = useReminder()
  const [note, setNote] = useState('')
  const [by, setBy] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const thread = useMemo(() => {
    if (!m) return []
    const ms = mentionsOf(db, m.id).map((x) => ({ kind: 'm' as const, at: x.at, x }))
    const hs = historyOf(db, 'Mizito', m.id).filter((h) => h.field !== '_created').map((h) => ({ kind: 'h' as const, at: h.at, h }))
    return [...ms, ...hs].sort((a, b) => (a.at < b.at ? -1 : 1))
  }, [db, m])
  if (!m) return null
  const s = mzSignals(db, m)
  const c = mzCfg()
  const patch = (p: Partial<MizitoItem>) => upsert('Mizito', { ...m, ...p })
  const addMention = async () => {
    const now = nowStampMz()
    const who = by.trim() || m.asked_by
    await upsert('MizitoMentions', { id: uid('MM'), item_id: m.id, by: who, at: now, note: note.trim(), status: '' })
    await patch({ last_mention_at: now, last_mention_by: who, status: mzClosed(m) ? firstMzStatus('open') : m.status })
    setNote('')
    setBy('')
    toast(L('منشن ثبت شد', 'Mention logged'))
  }
  const docs = String(m.docs || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)
  const tier = s.tier
  const prop = (label: string, el: React.ReactNode) => (
    <div className="flex min-h-9 items-center gap-2">
      <span className="w-24 shrink-0 px-2.5 text-xs text-sub">{label}</span>
      <div className="min-w-0 flex-1 text-xs">{el}</div>
    </div>
  )
  const sel = (value: string, opts: MzOption[], onChange: (v: string) => void) => (
    <select disabled={!canEdit} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-full bg-transparent px-2 text-xs hover:bg-muted">
      <option value="">—</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{optLabel(o)}</option>)}
    </select>
  )
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="eyebrow">{L('میزیتو', 'Mizito')}</span>
          {m.mz_key && <span className="truncate font-mono text-[0.625rem] text-sub" dir="ltr">#{m.mz_key.slice(0, 14)}</span>}
        </div>
      }
      footer={
        canEdit && (
          <>
            <span className="text-[0.6875rem] text-sub">{L('ثبت', 'Logged')} {fmtDate(m.received_at || m.created_at)}</span>
            <div className="flex-1" />
            {confirmDel ? (
              <button className="btn-danger btn-sm" onClick={async () => { for (const x of mentionsOf(db, m.id)) await remove('MizitoMentions', x.id); await remove('Mizito', m.id); onClose() }}>{L('تأیید حذف', 'Confirm delete')}</button>
            ) : (
              <button className="btn-ghost btn-sm text-sub" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> {L('حذف', 'Delete')}</button>
            )}
          </>
        )
      }
    >
      <div className="grid min-h-full lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 px-6 py-6 lg:border-e lg:border-line">
          <div className="flex items-start gap-3">
            <PBadge p={s.p} big />
            <textarea
              key={m.title}
              defaultValue={m.title}
              disabled={!canEdit}
              rows={1}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.title && patch({ title: e.target.value.trim() })}
              className="display min-w-0 flex-1 resize-none bg-transparent text-2xl leading-snug outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MzStatusChip id={m.status} />
            <MzSignals m={m} />
            <MzLink m={m} />
          </div>
          <div className="mt-2 text-xs text-sub">
            {L(`امتیاز اولویت ${fa(s.score)}`, `Priority score ${s.score}`)}
            {s.overridden && L(` · اولویت دستی${m.override_reason ? `: ${m.override_reason}` : ''}`, ` · manual${m.override_reason ? `: ${m.override_reason}` : ''}`)}
            {' · '}
            {L(...P_HINT[s.p])}
          </div>

          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              {c.statuses.filter((x) => x.id !== m.status).map((x) => (
                <button key={x.id} className={cx('btn-sm', x.cat === 'done' ? 'btn-primary' : 'btn-outline')} onClick={() => patch({ status: x.id })}>
                  {x.cat === 'done' ? <Check size={14} /> : x.cat === 'blocked' ? <Ban size={14} /> : x.cat === 'waiting' ? <Clock size={14} /> : x.cat === 'cancelled' ? <X size={14} /> : null}
                  {optLabel(x)}
                </button>
              ))}
              <button className="btn-ghost btn-sm" onClick={() => remind(m)}>
                <Copy size={14} /> {L('متن یادآوری', 'Reminder text')}
              </button>
            </div>
          )}

          <textarea
            key={`d${m.description}`}
            defaultValue={m.description}
            disabled={!canEdit}
            rows={4}
            placeholder={L('شرح…', 'Description…')}
            onBlur={(e) => e.target.value !== m.description && patch({ description: e.target.value })}
            className="mt-5 w-full resize-none rounded-xl bg-transparent text-sm leading-7 outline-none placeholder:text-sub/60 focus:bg-muted/50 focus:p-3"
          />

          <div className="mt-4">
            <div className="eyebrow mb-2 flex items-center gap-1.5"><FileText size={12} /> {L('مستندات', 'Documents')}</div>
            {docs.length ? (
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li key={d}>
                    <a href={d} target="_blank" rel="noreferrer" dir="ltr" className="inline-flex max-w-full items-center gap-1.5 truncate text-xs text-brand hover:underline"><Link2 size={12} /> {d}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-sub">{L('مستندی ثبت نشده', 'No documents')}</div>
            )}
            {canEdit && (
              <textarea key={`docs${m.docs}`} defaultValue={m.docs} dir="ltr" rows={2} placeholder={L('لینک مستندات، هر لینک در یک خط', 'Document links, one per line')} onBlur={(e) => e.target.value !== m.docs && patch({ docs: e.target.value })} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs outline-none" />
            )}
          </div>

          <div className="mt-6">
            <div className="eyebrow mb-2">{L('نتیجه', 'Outcome')}</div>
            <textarea key={`o${m.outcome}`} defaultValue={m.outcome} disabled={!canEdit} rows={2} placeholder={L('چه شد؟ (مثلاً «تأیید و بسته شد»)', 'What happened? (e.g. “Approved and closed”)')} onBlur={(e) => e.target.value !== m.outcome && patch({ outcome: e.target.value })} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none" />
          </div>

          <div className="mt-8">
            <div className="eyebrow mb-4 flex items-center gap-2"><AtSign size={13} /> {L('ترد منشن‌ها و تغییرات', 'Mentions & changes')}</div>
            <ol className="relative space-y-4 border-s border-line ps-6">
              <li className="relative">
                <span className="absolute -start-[37px] top-0"><Avatar name={m.asked_by || '?'} size="sm" ring /></span>
                <div className="text-sm"><b className="font-medium">{m.asked_by || L('نامشخص', 'Unknown')}</b> <span className="text-sub">{L('مطرح کرد / منشن کرد', 'raised it')} · {fmtDate(m.received_at)}</span></div>
                {m.notes && <div className="mt-1 whitespace-pre-wrap rounded-2xl rounded-ss-md bg-muted px-4 py-2 text-sm leading-7">{m.notes}</div>}
              </li>
              {thread.map((t) =>
                t.kind === 'm' ? (
                  <li key={t.x.id} className="relative">
                    <span className="absolute -start-[37px] top-0"><Avatar name={t.x.by || '?'} size="sm" ring /></span>
                    <div className="text-sm">
                      <b className="font-medium">{t.x.by}</b> <span className="text-sub">{L('دوباره منشن کرد', 'mentioned again')} · {timeAgo(toDate(t.x.at))}</span>
                      {t.x.status && <span className="ms-2"><MzStatusChip id={t.x.status} /></span>}
                    </div>
                    {t.x.note && <div className="mt-1 whitespace-pre-wrap rounded-2xl rounded-ss-md bg-brand-soft/40 px-4 py-2 text-sm leading-7">{t.x.note}</div>}
                  </li>
                ) : (
                  <li key={t.h.id} className="relative text-xs text-sub">
                    <span className="absolute -start-[31px] top-1 h-2 w-2 rounded-full bg-line-strong" />
                    <b className="font-medium text-ink">{t.h.by}</b> {historyText(t.h, () => '')} · {timeAgo(toDate(t.h.at))}
                  </li>
                ),
              )}
            </ol>
            {canEdit && (
              <div className="mt-5 rounded-2xl border border-line bg-surface p-3">
                <div className="flex flex-wrap gap-2">
                  <input list="mz-people2" value={by} onChange={(e) => setBy(e.target.value)} placeholder={L(`چه کسی؟ (${m.asked_by || ''})`, `Who? (${m.asked_by || ''})`)} className="input h-9 w-48 text-xs" />
                  <datalist id="mz-people2">{allPeople(db).map((p) => <option key={p} value={p} />)}</datalist>
                  <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMention()} placeholder={L('منشن تازه روی همین تسک؟ یادداشت…', 'A new mention on this task? Note…')} className="input h-9 min-w-[12rem] flex-1 text-xs" />
                  <button className="btn-primary btn-sm h-9" onClick={addMention}>
                    <MessageSquarePlus size={14} /> {L('ثبت منشن', 'Log mention')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-1 bg-muted/30 px-4 py-6">
          <div className="eyebrow mb-2 px-2.5">{L('مشخصات', 'Properties')}</div>
          {prop(L('وضعیت', 'Status'), sel(m.status, c.statuses, (v) => patch({ status: v })))}
          {prop(L('مطرح‌کننده', 'Raised by'), (
            <span className="flex flex-wrap items-center gap-1">
              <PersonPicker value={m.asked_by} onChange={(v) => patch({ asked_by: v })} placeholder={L('انتخاب', 'Choose')} />
              {tier && <span className="whitespace-nowrap rounded-full px-1.5 text-[0.625rem] text-white" style={{ background: tier.color }}>{optLabel(tier)} · SLA {fa(tier.sla)}{L('س', 'h')}</span>}
            </span>
          ))}
          {prop(L('همه‌ی منشن‌کننده‌ها', 'All askers'), <span className="text-sub">{askersOf(db, m).join('، ') || '—'}</span>)}
          {prop(L('منشن‌شده', 'Mentioned'), <input key={m.mentioned} disabled={!canEdit} defaultValue={m.mentioned} onBlur={(e) => e.target.value !== m.mentioned && patch({ mentioned: e.target.value })} className="h-8 w-full rounded-full bg-transparent px-2.5 outline-none hover:bg-muted focus:bg-surface" />)}
          {prop(L('دسته', 'Category'), sel(m.category, c.categories, (v) => patch({ category: v })))}
          {prop(L('نوع اقدام', 'Action'), sel(m.action, c.actions, (v) => patch({ action: v })))}
          {prop(L('سپرده به', 'Handed to'), <PersonPicker value={m.assigned_to} onChange={(v) => patch({ assigned_to: v })} placeholder={L('هیچ‌کس', 'No one')} />)}
          {prop(L('ددلاین', 'Deadline'), <DatePicker compact value={m.due_date} onChange={(v) => patch({ due_date: v })} />)}
          {prop(L('فوری', 'Urgent'), (
            <button disabled={!canEdit} onClick={() => patch({ urgent: m.urgent === '1' ? '' : '1' })} className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-2.5', m.urgent === '1' ? 'text-bad' : 'text-sub', 'hover:bg-muted')}>
              <Flame size={14} /> {m.urgent === '1' ? L('فوری', 'Urgent') : L('عادی', 'Normal')}
            </button>
          ))}
          {prop(L('اولویت دستی', 'Manual priority'), (
            <Popover
              width={220}
              trigger={({ toggle }) => (
                <button disabled={!canEdit} onClick={toggle} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 hover:bg-muted">
                  {s.overridden ? <PBadge p={s.p} /> : <span className="text-sub">{L('خودکار', 'Automatic')}</span>}
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem active={!s.overridden} onClick={() => (patch({ priority_override: '', override_reason: '' }), close())}>{L('خودکار (محاسبه‌شده)', 'Automatic')}</MenuItem>
                  {[0, 1, 2, 3].map((p) => (
                    <MenuItem
                      key={p}
                      active={s.overridden && s.p === p}
                      icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: P_COLOR[p] }} />}
                      onClick={() => {
                        const reason = window.prompt(L('دلیل تغییر دستی اولویت؟', 'Why override the priority?'), m.override_reason || '') ?? ''
                        patch({ priority_override: `P${p}`, override_reason: reason })
                        close()
                      }}
                    >
                      P{p} · {L(...P_HINT[p])}
                    </MenuItem>
                  ))}
                </>
              )}
            </Popover>
          ))}
          {prop(L('لینک', 'Link'), <input key={m.link} dir="ltr" disabled={!canEdit} defaultValue={m.link} onBlur={(e) => e.target.value.trim() !== m.link && patch({ link: e.target.value.trim() })} placeholder="https://mizito…" className="h-8 w-full rounded-full bg-transparent px-2.5 outline-none hover:bg-muted focus:bg-surface" />)}
          {prop(L('ثبت', 'Logged'), <span className="text-sub">{fmtDate(m.received_at)} · {L(`${fa(s.ageDays)} روز پیش`, `${s.ageDays}d ago`)}</span>)}
          {m.closed_at && prop(L('بسته شد', 'Closed'), <span className="text-sub">{fmtDayMonth(m.closed_at)}</span>)}
          {canEdit && (
            <div className="pt-4">
              <button className="btn-outline btn-sm w-full" onClick={() => open('FollowUps', { person: m.assigned_to || m.asked_by, subject: L(`میزیتو: ${m.title}`, `Mizito: ${m.title}`), notes: m.link, priority: s.p <= 1 ? 'high' : 'medium' })}>
                <Plus size={14} /> {L('ساخت پیگیری', 'Create a follow-up')}
              </button>
            </div>
          )}
        </aside>
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ settings
function OptionList({ title, items, onSave, kind }: { title: string; items: (MzOption | MzStatus)[]; onSave: (next: (MzOption | MzStatus)[]) => void; kind: 'status' | 'weight' | 'plain' }) {
  const [name, setName] = useState('')
  const cats: [MzCat, string][] = [['open', L('باز (توپ در زمین ما)', 'Open (our move)')], ['waiting', L('منتظر دیگران', 'Waiting on others')], ['blocked', L('مسدود', 'Blocked')], ['done', L('انجام‌شده', 'Done')], ['cancelled', L('لغوشده', 'Cancelled')]]
  const edit = (i: number, p: Partial<MzStatus & MzOption>) => onSave(items.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      <ul className="space-y-1.5">
        {items.map((x, i) => (
          <li key={x.id} className="flex items-center gap-2 rounded-xl border border-line px-2 py-1">
            <input key={optLabel(x)} defaultValue={optLabel(x)} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== optLabel(x) && edit(i, locale.lang === 'en' ? { en: e.target.value.trim() } : { fa: e.target.value.trim() })} className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none focus:bg-muted" />
            {kind === 'status' && (
              <select value={(x as MzStatus).cat} onChange={(e) => edit(i, { cat: e.target.value as MzCat })} className="h-7 rounded-lg bg-muted px-1.5 text-[0.6875rem]">
                {cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {kind === 'weight' && (
              <input type="number" key={`w${(x as MzOption).weight}`} defaultValue={(x as MzOption).weight || 0} onBlur={(e) => Number(e.target.value) !== ((x as MzOption).weight || 0) && edit(i, { weight: Number(e.target.value) || 0 })} className="h-7 w-14 rounded-lg bg-muted px-1.5 text-center text-xs num" title={L('وزن در اولویت', 'Priority weight')} />
            )}
            <button className="icon-btn h-7 w-7 hover:text-bad" disabled={items.length < 2} onClick={() => onSave(items.filter((y) => y.id !== x.id))} aria-label={L('حذف', 'Remove')}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && onSave([...items, { id: `x-${Date.now().toString(36)}`, fa: name.trim(), en: name.trim(), ...(kind === 'status' ? { cat: 'open' as MzCat } : kind === 'weight' ? { weight: 0 } : {}) }]), setName(''))}>
        <input className="input h-8 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مورد جدید…', 'New…')} />
        <button className="btn-outline btn-sm h-8" disabled={!name.trim()}><Plus size={13} /></button>
      </form>
    </div>
  )
}

export function MizitoSettings({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = mzCfg()
  const num = (label: string, value: number, save: (v: number) => void, hint?: string) => (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-[0.6875rem] text-sub">{hint}</span>}
      </span>
      <input type="number" key={`${label}${value}`} disabled={!admin} defaultValue={value} onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== value && save(Number(e.target.value))} className="input h-8 w-20 text-center text-xs num" />
    </label>
  )
  const w = (k: keyof typeof c.weights) => (v: number) => setSetting(MZ_KEYS.weights, JSON.stringify({ ...c.weights, [k]: v }))
  const t = (k: keyof typeof c.thresholds) => (v: number) => setSetting(MZ_KEYS.thresholds, JSON.stringify({ ...c.thresholds, [k]: v }))
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card eyebrow={<span className="flex items-center gap-1.5"><Settings2 size={12} /> {L('میزیتو', 'Mizito')}</span>} title={L('فهرست‌ها', 'Lists')}>
        <fieldset disabled={!admin} className="space-y-5">
          <label className="block">
            <span className="label">{L('آدرس میزیتو', 'Mizito address')}</span>
            <input dir="ltr" key={c.base} defaultValue={c.base} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.base && setSetting(MZ_KEYS.base, e.target.value.trim())} className="input h-9 w-full text-xs" />
          </label>
          <OptionList kind="status" title={L('وضعیت‌ها (و معنی هرکدام)', 'Statuses (and what each means)')} items={c.statuses} onSave={(n) => setSetting(MZ_KEYS.statuses, JSON.stringify(n))} />
          <OptionList kind="plain" title={L('دسته‌ها', 'Categories')} items={c.categories} onSave={(n) => setSetting(MZ_KEYS.categories, JSON.stringify(n))} />
          <OptionList kind="weight" title={L('نوع اقدام (با وزن در اولویت)', 'Action types (with priority weight)')} items={c.actions} onSave={(n) => setSetting(MZ_KEYS.actions, JSON.stringify(n))} />
        </fieldset>
      </Card>
      <div className="space-y-4">
        <Card eyebrow={L('اولویت', 'Priority')} title={L('فرمول اولویت P0 تا P3', 'P0–P3 formula')}>
          <p className="mb-3 text-xs leading-6 text-sub">
            {L('امتیاز = وزن رده‌ی بالاترین منشن‌کننده + وزن نوع اقدام + امتیاز هر منشن اضافه + فوری + عقب‌افتادگی ددلاین یا نزدیکی آن + عبور از SLA. بعد با آستانه‌ها به P0 تا P3 تبدیل می‌شود. اولویت دستی همیشه برنده است.', 'Score = top asker’s tier weight + action weight + per extra mention + urgent + overdue / due soon + SLA breach; thresholds turn it into P0–P3. A manual priority always wins.')}
          </p>
          <fieldset disabled={!admin} className="space-y-2">
            {num(L('فوری', 'Urgent'), c.weights.urgent, w('urgent'))}
            {num(L('ددلاین گذشته', 'Past deadline'), c.weights.overdue, w('overdue'))}
            {num(L('ددلاین ۲ روز آینده', 'Due within 2 days'), c.weights.due_soon, w('due_soon'))}
            {num(L('عبور از SLA', 'SLA breached'), c.weights.sla_breach, w('sla_breach'))}
            {num(L('هر منشن اضافه', 'Each extra mention'), c.weights.per_mention, w('per_mention'))}
            <div className="border-t border-line pt-2" />
            {num(L('آستانه‌ی P0', 'P0 from'), c.thresholds.p0, t('p0'), L(...P_HINT[0]))}
            {num(L('آستانه‌ی P1', 'P1 from'), c.thresholds.p1, t('p1'), L(...P_HINT[1]))}
            {num(L('آستانه‌ی P2', 'P2 from'), c.thresholds.p2, t('p2'), L('زیر این: P3', 'below: P3'))}
            <div className="border-t border-line pt-2" />
            {num(L('راکد بعد از (روز)', 'Quiet after (days)'), c.staleDays, (v) => setSetting(MZ_KEYS.staleDays, String(v)))}
          </fieldset>
        </Card>
        <Card eyebrow={L('یادآوری', 'Reminder')} title={L('متن آماده‌ی یادآوری', 'Reminder template')}>
          <p className="mb-2 text-xs leading-6 text-sub">{L('جای‌نگهدارها: {name} نام طرف، {title} عنوان، {days} چند روز گذشته، {link} لینک، {asked_by} مطرح‌کننده. همین متن برای پیگیری‌ها هم استفاده می‌شود.', 'Placeholders: {name}, {title}, {days}, {link}, {asked_by}. Follow-ups use the same text.')}</p>
          <textarea key={c.template} disabled={!admin} defaultValue={c.template} rows={5} onBlur={(e) => e.target.value.trim() && e.target.value !== c.template && setSetting(MZ_KEYS.template, e.target.value)} className="input w-full py-2 text-sm leading-7" />
        </Card>
      </div>
    </div>
  )
}
