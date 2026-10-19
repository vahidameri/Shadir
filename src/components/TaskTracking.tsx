// Tracking pieces shared by the task list, the board and the task panel: the flag, the signal chips
// (deadline, days since assign, blocked, stale), the blocker panel and the change-log lines.
import { Ban, CalendarClock, ExternalLink, Flag, Hourglass, MoonStar, Unlock, UserRound } from 'lucide-react'
import type { HistoryRow, Task } from '../lib/types'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { L, lbl } from '../lib/i18n'
import { fa, fmtDate, fmtDayMonth } from '../lib/jalali'
import { flagOf, taskCfg } from '../lib/taskcfg'
import { blockedOn, signals } from '../lib/signals'
import { firstOf, statusLabel } from '../lib/columns'
import { FOLLOWUP_STATUS, PRIORITY } from '../lib/labels'
import { TRACK } from '../lib/tracks'
import { MenuItem, Popover, cx } from './ui'

export function FlagMark({ id, size = 13, label }: { id?: string; size?: number; label?: boolean }) {
  const f = flagOf(id)
  if (!f) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium" style={{ color: f.color }} title={L(f.fa, f.en)}>
      <Flag size={size} fill={f.color} strokeWidth={1.8} />
      {label && L(f.fa, f.en)}
    </span>
  )
}

export function FlagPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const { canEdit } = useStore()
  const f = flagOf(value)
  return (
    <Popover
      width={200}
      trigger={({ toggle }) => (
        <button onClick={toggle} disabled={!canEdit} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition hover:bg-muted disabled:pointer-events-none">
          {f ? <FlagMark id={value} label /> : <span className="inline-flex items-center gap-1.5 text-sub"><Flag size={14} /> {L('بدون پرچم', 'No flag')}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          {taskCfg().flags.map((x) => (
            <MenuItem key={x.id} active={x.id === value} icon={<Flag size={14} fill={x.color} style={{ color: x.color }} />} onClick={() => (onChange(x.id), close())}>
              {L(x.fa, x.en)}
            </MenuItem>
          ))}
          <MenuItem active={!value} icon={<Flag size={14} />} onClick={() => (onChange(''), close())}>
            {L('بدون پرچم', 'No flag')}
          </MenuItem>
        </>
      )}
    </Popover>
  )
}

const chip = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] leading-5'

/** Deadline countdown: "۳ روز مانده", "امروز", "۵ روز تأخیر". */
export function DeadlineChip({ t }: { t: Task }) {
  const s = signals(t)
  if (s.toDeadline === null) return null
  const d = s.toDeadline
  const text = d === 0 ? L('ددلاین امروز', 'Due today') : d > 0 ? L(`${fa(d)} روز مانده`, `${d}d left`) : L(`${fa(-d)} روز تأخیر`, `${-d}d late`)
  return (
    <span className={cx(chip, d < 0 ? 'bg-bad/10 text-bad font-medium' : d <= 2 ? 'bg-warn/10 text-warn' : 'bg-muted text-sub')} title={`${L('ددلاین', 'Deadline')}: ${fmtDate(t.due_date)}`}>
      <CalendarClock size={11} />
      {text}
    </span>
  )
}

/** Every signal of a task as small chips (the list and the board). */
export function TaskSignals({ t, assign = true, className }: { t: Task; assign?: boolean; className?: string }) {
  const { db } = useStore()
  const s = signals(t)
  const on = s.blockedDays !== null ? blockedOn(t, db) : ''
  return (
    <span className={cx('flex flex-wrap items-center gap-1', className)}>
      <FlagMark id={t.flag} />
      {s.blockedDays !== null && (
        <span className={cx(chip, 'bg-bad/10 text-bad', s.blockedLong && 'font-semibold')} title={t.blocked_reason || ''}>
          <Ban size={11} />
          {L(`مسدود ${fa(s.blockedDays)} روز`, `Blocked ${s.blockedDays}d`)}
          {on && <span className="max-w-[8rem] truncate opacity-80">· {on}</span>}
        </span>
      )}
      <DeadlineChip t={t} />
      {s.stale && (
        <span className={cx(chip, 'bg-muted text-sub')} title={L('مدتی است تغییری نکرده', 'No change for a while')}>
          <MoonStar size={11} />
          {L(`راکد ${fa(s.staleDays || 0)} روز`, `Quiet ${s.staleDays}d`)}
        </span>
      )}
      {assign && s.sinceAssign !== null && s.sinceAssign > 0 && (
        <span className={cx(chip, 'text-sub')} title={`${L('اساین', 'Assigned')}: ${fmtDate(t.assigned_at || '')}`}>
          <Hourglass size={11} />
          {L(`${fa(s.sinceAssign)} روز از اساین`, `${s.sinceAssign}d since assigned`)}
        </span>
      )}
      {t.link && (
        <a href={t.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cx(chip, 'text-sub hover:bg-muted hover:text-ink')} title={t.link}>
          <ExternalLink size={11} />
          {/mizito/i.test(t.link) ? L('میزیتو', 'Mizito') : L('لینک', 'Link')}
        </a>
      )}
    </span>
  )
}

/** The blocker, front and centre: since when, why, on whom — and the two ways out. */
export function BlockerPanel({ t, patch }: { t: Task; patch: (p: Partial<Task>) => void }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const s = signals(t)
  const on = blockedOn(t, db)
  const people = [...new Set([...db.Team.map((m) => m.name), ...Object.keys(TRACK).map((k) => lbl(TRACK, k))])]
  return (
    <div className={cx('mt-5 rounded-2xl border p-4', s.blockedLong ? 'border-bad/40 bg-bad/[0.06]' : 'border-bad/20 bg-bad/[0.035]')}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-bad">
        <Ban size={15} />
        <span>{L(`${fa(s.blockedDays || 0)} روز است مسدود است`, `Blocked for ${s.blockedDays || 0} days`)}</span>
        {t.blocked_since && <span className="font-normal text-bad/80">{L(`(از ${fmtDayMonth(t.blocked_since)})`, `(since ${fmtDayMonth(t.blocked_since)})`)}</span>}
        {s.blockedLong && <span className="rounded-full bg-bad px-2 py-0.5 text-[0.625rem] text-white">{L('بیش از حد مجاز', 'Over the limit')}</span>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem]">
        <textarea
          key={`r-${t.id}-${t.blocked_reason}`}
          defaultValue={t.blocked_reason || ''}
          disabled={!canEdit}
          rows={2}
          placeholder={L('علت انسداد چیست؟', 'Why is it blocked?')}
          onBlur={(e) => e.target.value !== (t.blocked_reason || '') && patch({ blocked_reason: e.target.value })}
          className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-bad/40"
        />
        <label className="flex h-fit items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <UserRound size={14} className="shrink-0 text-sub" />
          <input
            key={`b-${t.id}-${t.blocked_by}`}
            list="blocker-list"
            defaultValue={t.blocked_by || ''}
            disabled={!canEdit}
            placeholder={on || L('منتظر چه کسی؟', 'Waiting on whom?')}
            onBlur={(e) => e.target.value !== (t.blocked_by || '') && patch({ blocked_by: e.target.value })}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          <datalist id="blocker-list">
            {people.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn-outline btn-sm"
            onClick={() => open('FollowUps', { project_id: t.project_id, person: t.blocked_by || on, subject: L(`رفع انسداد: ${t.title}`, `Unblock: ${t.title}`), priority: 'high', notes: t.blocked_reason || '' })}
          >
            {L('ساخت پیگیری برای رفع', 'Follow up to unblock')}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => patch({ status: firstOf('active') })}>
            <Unlock size={14} /> {L('رفع شد، ادامه‌ی کار', 'Unblocked, back to work')}
          </button>
        </div>
      )}
    </div>
  )
}

const FIELD: Record<string, [string, string]> = {
  title: ['عنوان', 'title'], description: ['توضیحات', 'description'], status: ['وضعیت', 'status'], priority: ['اولویت', 'priority'], assignee: ['مسئول', 'assignee'],
  due_date: ['ددلاین', 'deadline'], assigned_at: ['تاریخ اساین', 'assign date'], flag: ['پرچم', 'flag'], track: ['واحد', 'unit'], project_id: ['پروژه', 'project'],
  blocked_reason: ['علت انسداد', 'blocker reason'], blocked_by: ['مسدودکننده', 'blocked by'], link: ['لینک', 'link'], requested_by: ['درخواست‌دهنده', 'requested by'],
  collaborators: ['همکاران', 'shared with'], watchers: ['ناظرها', 'watchers'], private: ['دیده‌شدن', 'visibility'], deadline: ['ددلاین دوم', 'second deadline'],
  subject: ['موضوع', 'subject'], person: ['طرف پیگیری', 'person'], channel: ['کانال', 'channel'], notes: ['یادداشت', 'notes'], owner: ['پیگیری‌کننده', 'owner'],
}

/** A value from the log, as people read it. */
function show(h: HistoryRow, v: string, projectName: (id: string) => string) {
  if (!v) return L('خالی', 'empty')
  if (h.field === 'status') return h.entity === 'Tasks' ? statusLabel(v) : lbl(FOLLOWUP_STATUS, v as never)
  if (h.field === 'priority') return lbl(PRIORITY, v as never)
  if (h.field === 'flag') return flagOf(v) ? L(flagOf(v)!.fa, flagOf(v)!.en) : v
  if (h.field === 'track') return lbl(TRACK, v) || v
  if (h.field === 'project_id') return projectName(v) || v
  if (h.field === 'private') return v === '1' ? L('خصوصی', 'private') : L('عمومی', 'visible')
  if (/_date$|_at$|^deadline$/.test(h.field)) return fmtDate(v)
  return v.length > 60 ? `${v.slice(0, 60)}…` : v
}

/** One log line: "X changed the status from A to B". Long text fields just say they changed. */
export function historyText(h: HistoryRow, projectName: (id: string) => string) {
  if (h.field === '_created') return L('این مورد را ایجاد کرد', 'created this')
  if (h.field === '_deleted') return L('این مورد را حذف کرد', 'deleted this')
  const f = FIELD[h.field] ? L(...FIELD[h.field]) : h.field
  if (h.field === 'description' || h.field === 'notes') return L(`${f} را ویرایش کرد`, `edited the ${f}`)
  if (!h.from) return L(`${f} را «${show(h, h.to, projectName)}» گذاشت`, `set the ${f} to “${show(h, h.to, projectName)}”`)
  if (!h.to) return L(`${f} را پاک کرد (قبلاً «${show(h, h.from, projectName)}»)`, `cleared the ${f} (was “${show(h, h.from, projectName)}”)`)
  return L(`${f} را از «${show(h, h.from, projectName)}» به «${show(h, h.to, projectName)}» تغییر داد`, `changed the ${f} from “${show(h, h.from, projectName)}” to “${show(h, h.to, projectName)}”`)
}
