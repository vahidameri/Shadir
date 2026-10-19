// Rich detail sheet for a task or follow-up: inline-editable properties, description, comments & activity.
import { useMemo, useState } from 'react'
import { copyFollowUp } from './shared'
import { Copy } from 'lucide-react'
import { catOf, closed, firstOf } from '../lib/columns'
import { historyOf } from '../lib/history'
import { BlockerPanel, FlagPicker, TaskSignals, historyText } from './TaskTracking'
import { Link } from 'react-router-dom'
import { Mail, ListChecks, Trash2, Send, Check, Clock, AlarmClockOff, Hash, Zap, MessageSquare, CircleDot, CheckCircle2, Sparkles, Bell, BellOff, Binoculars, Ban, XCircle, Inbox, History as HistoryIcon, ExternalLink } from 'lucide-react'
import { fieldOn, taskCfg } from '../lib/taskcfg'
import type { FollowUp, Task, Comment, TaskStatus } from '../lib/types'

type Item = Omit<Task, 'status'> & Omit<FollowUp, 'status'> & { status: Task['status'] | FollowUp['status'] }
import { useStore } from '../lib/store'
import { Attachments } from './Files'
import { assigneesOf } from '../lib/assignees'
import { can } from '../lib/access'
import { uid } from '../lib/api'
import { addDays, fa, fmtDate, nowStamp, relDays, todayISO, timeAgo } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import { CHANNEL, FOLLOWUP_STATUS } from '../lib/labels'
import { Avatar, AvatarStack, Sheet, cx, Chip, MenuItem, Popover } from './ui'
import { DatePicker } from './DatePicker'
import { useEditor } from './Editor'
import { SaveClose } from './SaveClose'
import { addQuarter, quarterOf } from '../lib/okr'
import { teamName } from './TeamParts'
import { AssigneesPicker, ListPicker, PeoplePicker, PersonPicker, PriorityPicker, ProjectPicker, StatusPicker } from './pickers'
import { TRACK, TRACKS, trackOf, depsOf, dependentsOf, depIds, sideSoft, autoTrack } from '../lib/tracks'
import type { Track } from '../lib/types'
import { StatusIcon } from './ui'
import { Link2, X, Plus, ArrowLeftRight } from 'lucide-react'

export const stampToDate = (s: string) => new Date(String(s).replace(' ', 'T'))

export function ItemSheet({ sheet, id, onClose }: { sheet: 'Tasks' | 'FollowUps'; id: string; onClose: () => void }) {
  const { db, upsert, remove, toast, canEdit, me, access, action, mode } = useStore()
  const item = (sheet === 'Tasks' ? db.Tasks : db.FollowUps).find((x) => x.id === id) as unknown as Item | undefined
  const [confirmDel, setConfirmDel] = useState(false)
  const [draft, setDraft] = useState('')
  const comments = useMemo(() => db.Comments.filter((c) => c.entity === sheet && c.entity_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)), [db.Comments, sheet, id])
  const log = useMemo(() => historyOf(db, sheet, id).reverse(), [db, sheet, id])
  const [showLog, setShowLog] = useState(true)

  if (!item) return null
  const isTask = sheet === 'Tasks'
  const project = db.Projects.find((p) => p.id === item.project_id)
  const patch = async (p: Partial<Item>) => {
    const next = { ...item, ...p }
    if (!isTask && 'status' in p) next.done_at = p.status === 'done' ? item.done_at || todayISO() : ''
    await upsert(sheet, next as never)
  }

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const c: Comment = { id: uid('C'), entity: sheet, entity_id: id, author: me || L('من', 'Me'), body, created_at: nowStamp() }
    await upsert('Comments', c)
  }

  const del = async () => {
    await remove(sheet, id)
    toast(L('حذف شد', 'Deleted'), 'ok', { label: L('بازگردانی', 'Undo'), run: () => upsert(sheet, item as never) })
    onClose()
  }

  const title = isTask ? item.title : item.subject
  const watchers = String(item.watchers || '').split(',').map((x) => x.trim()).filter(Boolean)
  const watching = watchers.includes(me)
  const people = db.Team.map((m) => m.name)

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="eyebrow">{isTask ? L('تسک', 'Task') : L('پیگیری', 'Follow-up')}</span>
          {project && (
            <>
              <span className="text-line-strong">/</span>
              <Link to={`/projects/${project.id}`} onClick={onClose} className="truncate text-sub hover:text-ink">
                {project.name}
              </Link>
            </>
          )}
        </div>
      }
      footer={
        canEdit && (
          <>
            <span className="text-[0.6875rem] text-sub">
              {L('ایجاد', 'Created')} {fmtDate(item.created_at)}
              {item.reporter && ` · ${item.reporter}`}
            </span>
            <div className="flex-1" />
            {isTask && can.portfolio(access) && mode === 'live' && (
              <button
                className="btn-ghost btn-sm text-sub"
                onClick={() =>
                  action('mailTask', { id })
                    .then(() => toast(L('ایمیل برای افراد تسک ارسال شد', 'Emailed to everyone on the task')))
                    .catch((e) => toast(String(e instanceof Error ? e.message : e), 'err'))
                }
                title={L('فقط وقتی لازم است — اعلان‌ها خودشان داخل مدار می‌آیند', 'Only when needed — notifications already arrive in Madar')}
              >
                <Mail size={14} /> {L('ارسال ایمیل', 'Send email')}
              </button>
            )}
            <SaveClose onClose={onClose} />
            {confirmDel ? (
              <button className="btn-danger btn-sm" onClick={del}>
                {L('تأیید حذف', 'Confirm delete')}
              </button>
            ) : (
              <button className="btn-ghost btn-sm text-sub" onClick={() => setConfirmDel(true)}>
                <Trash2 size={14} /> {L('حذف', 'Delete')}
              </button>
            )}
          </>
        )
      }
    >
      <div className="grid min-h-full lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 px-6 py-6 lg:border-e lg:border-line">
          <textarea
            defaultValue={title}
            disabled={!canEdit}
            rows={1}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== title) patch(isTask ? { title: v } : { subject: v })
            }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = `${t.scrollHeight}px`
            }}
            className="display w-full resize-none bg-transparent text-2xl leading-snug outline-none"
          />
          <textarea
            defaultValue={isTask ? item.description : item.notes}
            disabled={!canEdit}
            rows={4}
            placeholder={L('توضیحات، جزئیات یا سابقه را اینجا بنویسید…', 'Add a description, details or history…')}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== (isTask ? item.description : item.notes)) patch(isTask ? { description: v } : { notes: v })
            }}
            className="mt-3 w-full resize-none rounded-xl bg-transparent text-sm leading-7 text-ink/85 outline-none placeholder:text-sub/60 focus:bg-muted/50 focus:p-3 transition-all"
          />

          {isTask && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sub">
              <TaskSignals t={item as unknown as Task} />
              {item.requested_by && <span>{L('درخواست از', 'Asked by')} <b className="font-medium text-ink">{item.requested_by}</b></span>}
            </div>
          )}

          {isTask && canEdit && catOf(item.status) === 'intake' && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-3 text-sm">
              <Inbox size={15} className="text-sky-600" />
              <span className="flex-1">{L('این مورد در صف ورودی است و هنوز تصمیمی برایش گرفته نشده.', 'This is in intake and waits for a decision.')}</span>
              <button className="btn-primary btn-sm" onClick={() => patch({ status: firstOf('open') })}>
                <Check size={14} /> {L('قبول و ورود به کارها', 'Accept')}
              </button>
              <button className="btn-ghost btn-sm text-sub" onClick={() => patch({ status: 'cancelled' })}>
                <XCircle size={14} /> {L('رد', 'Decline')}
              </button>
            </div>
          )}

          {isTask && canEdit && !closed(item as { status: string }) && catOf(item.status) !== 'intake' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" onClick={() => patch({ status: 'done' })}>
                <Check size={14} /> {L('انجام شد', 'Done')}
              </button>
              {catOf(item.status) !== 'blocked' && (
                <button className="btn-outline btn-sm" onClick={() => patch({ status: 'blocked' })}>
                  <Ban size={14} /> {L('مسدود شد', 'Blocked')}
                </button>
              )}
              {catOf(item.status) !== 'waiting' && (
                <button className="btn-outline btn-sm" onClick={() => patch({ status: 'waiting' })}>
                  <Clock size={14} /> {L('در انتظار', 'Waiting')}
                </button>
              )}
              <button className="btn-ghost btn-sm text-sub" onClick={() => patch({ due_date: addDays(item.due_date && item.due_date > todayISO() ? item.due_date : todayISO(), 7) })}>
                <AlarmClockOff size={14} /> {L('یک هفته عقب', 'Push a week')}
              </button>
              <button className="btn-ghost btn-sm text-sub" onClick={() => patch({ status: 'cancelled' })}>
                <XCircle size={14} /> {L('لغو', 'Cancel')}
              </button>
            </div>
          )}
          {isTask && closed(item as { status: string }) && canEdit && (
            <div className="mt-4">
              <button className="btn-outline btn-sm" onClick={() => patch({ status: firstOf('open') })}>
                {L('بازگشایی', 'Reopen')}
              </button>
            </div>
          )}

          {isTask && catOf(item.status) === 'blocked' && <BlockerPanel t={item as unknown as Task} patch={(p) => patch(p as Partial<Item>)} />}

          {!isTask && canEdit && item.status !== 'done' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" onClick={() => patch({ status: 'done' })}>
                <Check size={14} /> {L('انجام شد', 'Mark done')}
              </button>
              <button className="btn-outline btn-sm" onClick={() => patch({ status: 'waiting', last_ping: todayISO(), ping_count: (Number(item.ping_count) || 0) + 1, due_date: addDays(todayISO(), taskCfg().pingDays) })}>
                <Send size={14} className="rtl:-scale-x-100" /> {L(`پینگ زدم (بعدی ${fa(taskCfg().pingDays)} روز دیگر)`, `Pinged (next in ${taskCfg().pingDays} days)`)}
              </button>
              <button className="btn-outline btn-sm" onClick={() => copyFollowUp(item as unknown as FollowUp, toast)}>
                <Copy size={14} /> {L('کپی متن یادآوری', 'Copy reminder text')}
              </button>
              {item.link && (
                <a className="btn-ghost btn-sm" href={item.link} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {/mizito/i.test(item.link) ? L('باز کردن در میزیتو', 'Open in Mizito') : L('باز کردن لینک', 'Open link')}
                </a>
              )}
              <button className="btn-outline btn-sm" onClick={() => patch({ due_date: addDays(todayISO(), 1) })}>
                <AlarmClockOff size={14} /> {L('فردا', 'Tomorrow')}
              </button>
            </div>
          )}

          {isTask && fieldOn('checklist') && <Checklist value={item.checklist || ''} onChange={(v) => patch({ checklist: v })} />}

          {isTask && <Stages task={item as unknown as Task} />}


          {isTask && <Dependencies task={item as unknown as Task} onChange={(ids) => patch({ depends_on: ids.join(',') })} />}

          {isTask && (
            <div className="mt-8">
              <div className="eyebrow mb-3">{L('فایل‌ها', 'Files')}</div>
              <Attachments entity="Tasks" id={id} compact />
            </div>
          )}

          <div className="mt-8">
            <div className="eyebrow mb-4 flex items-center gap-2">
              <MessageSquare size={13} /> {L('گفتگو و تاریخچه', 'Activity & history')}
              {log.length > 0 && (
                <button className="ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 normal-case tracking-normal text-sub hover:bg-muted hover:text-ink" onClick={() => setShowLog((v) => !v)}>
                  <HistoryIcon size={12} /> {showLog ? L('پنهان کردن تغییرات', 'Hide changes') : L(`نمایش ${fa(log.length)} تغییر`, `Show ${log.length} changes`)}
                </button>
              )}
            </div>
            <ol className="relative space-y-5 border-s border-line ps-6">
              <ActivityDot icon={<CircleDot size={12} />}>
                <span className="text-sub">
                  {item.reporter || L('سیستم', 'System')} {L('این مورد را ایجاد کرد', 'created this')} · {fmtDate(item.created_at)}
                </span>
              </ActivityDot>
              {showLog &&
                log
                  .filter((h) => h.field !== '_created')
                  .map((h) => (
                    <ActivityDot key={h.id} icon={<HistoryIcon size={11} />}>
                      <span className="text-sub">
                        <b className="font-medium text-ink">{h.by || L('سیستم', 'System')}</b> {historyText(h, (pid) => db.Projects.find((p) => p.id === pid)?.name || '')}
                        <span className="text-[0.6875rem]"> · {timeAgo(stampToDate(h.at))}</span>
                      </span>
                    </ActivityDot>
                  ))}
              {comments.map((c) => (
                <li key={c.id} className="relative">
                  <span className="absolute -start-[37px] top-0">
                    <Avatar name={c.author} size="sm" ring />
                  </span>
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="font-medium">{c.author}</span>
                    <span className="text-[0.6875rem] text-sub">{timeAgo(stampToDate(c.created_at))}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap rounded-2xl rounded-ss-md bg-muted px-4 py-2.5 text-sm leading-7">{renderMentions(c.body, people)}</div>
                </li>
              ))}
              {(item.completed_at || item.done_at) && (
                <ActivityDot icon={<CheckCircle2 size={12} className="text-good" />}>
                  <span className="text-sub">
                    {L('انجام شد', 'Completed')} · {fmtDate(item.completed_at || item.done_at)}
                  </span>
                </ActivityDot>
              )}
            </ol>
            {canEdit && (
              <div className="mt-5 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-ink/30">
                <Avatar name={me} size="sm" />
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
                  }}
                  rows={1}
                  placeholder={L('یادداشت بنویسید… با @ از کسی نام ببرید (Ctrl+Enter)', 'Write a note… @mention someone (Ctrl+Enter)')}
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
                />
                <button className="btn-primary btn-sm h-9 w-9 px-0" onClick={send} disabled={!draft.trim()} aria-label={L('ارسال', 'Send')}>
                  <Send size={14} className="rtl:-scale-x-100" />
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-1 bg-muted/30 px-4 py-6">
          {isTask && me && (
            <button
              disabled={!canEdit}
              onClick={() => patch({ watchers: watching ? watchers.filter((x) => x !== me).join(',') : [...watchers, me].join(',') })}
              className={cx('mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-medium transition', watching ? 'border-brand/30 bg-brand-soft/40 text-ink' : 'border-line bg-surface text-sub hover:text-ink')}
            >
              <Binoculars size={14} /> {watching ? L('زیر نظر شماست ✓', 'You’re watching ✓') : L('زیر نظر من باشد', 'Watch this')}
            </button>
          )}
          <div className="eyebrow mb-2 px-2.5">{L('مشخصات', 'Properties')}</div>
          {isTask ? (
            <>
              <Prop label={L('وضعیت', 'Status')}>
                <StatusPicker value={item.status as TaskStatus} onChange={(v) => patch({ status: v })} />
              </Prop>
              <Prop label={L('اولویت', 'Priority')}>
                <PriorityPicker value={item.priority} onChange={(v) => patch({ priority: v })} />
              </Prop>
              <Prop label={L('مسئول', 'Assignee')}>
                <AssigneesPicker value={item.assignee} onChange={(v) => patch({ assignee: v })} />
              </Prop>
              {fieldOn('flag') && (
                <Prop label={L('پرچم', 'Flag')}>
                  <FlagPicker value={item.flag} onChange={(v) => patch({ flag: v })} />
                </Prop>
              )}
              {fieldOn('assigned_at') && (
                <Prop label={L('اساین', 'Assigned')}>
                  <DatePicker compact value={item.assigned_at || ''} onChange={(v) => patch({ assigned_at: v })} />
                </Prop>
              )}
              {fieldOn('requested_by') && (
                <Prop label={L('درخواست از', 'Asked by')}>
                  <PersonPicker value={item.requested_by || ''} onChange={(v) => patch({ requested_by: v })} placeholder={L('انتخاب', 'Choose')} />
                </Prop>
              )}
              {fieldOn('start_date') && (
                <Prop label={L('شروع', 'Start')}>
                  <DatePicker compact value={item.start_date || ''} onChange={(v) => patch({ start_date: v })} />
                </Prop>
              )}
              <Prop label={L('ددلاین', 'Deadline')}>
                <DatePicker compact value={item.due_date} onChange={(v) => patch({ due_date: v })} />
              </Prop>
              {fieldOn('estimate') && (
                <Prop label={L('تخمین', 'Estimate')}>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={item.estimate || ''}
                    disabled={!canEdit}
                    onBlur={(e) => String(e.target.value) !== String(item.estimate || '') && patch({ estimate: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="h-8 w-20 rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong num"
                    placeholder={L('ساعت', 'hours')}
                  />
                </Prop>
              )}
              {fieldOn('follow_date') && (
                <Prop label={L('یادآوری', 'Reminder')}>
                  <DatePicker compact value={item.follow_date || ''} onChange={(v) => patch({ follow_date: v })} />
                </Prop>
              )}
              {fieldOn('handoff_date') && (
                <Prop label={L('تحویل پروداکت', 'To product')}>
                  <DatePicker compact value={item.handoff_date || ''} onChange={(v) => patch({ handoff_date: v })} />
                </Prop>
              )}
              {fieldOn('test_date') && (
                <Prop label={L('تست', 'Testing')}>
                  <DatePicker compact value={item.test_date || ''} onChange={(v) => patch({ test_date: v })} />
                </Prop>
              )}
              {fieldOn('deadline') && (
                <Prop label={L('ددلاین', 'Deadline')}>
                  <DatePicker compact value={item.deadline || ''} onChange={(v) => patch({ deadline: v })} />
                </Prop>
              )}
              {fieldOn('collaborators') && (
                <Prop label={L('همکاران', 'Shared with')}>
                  <PeoplePicker value={item.collaborators || ''} exclude={item.assignee.split(',')[0]} onChange={(v) => patch({ collaborators: v })} />
                </Prop>
              )}
              {fieldOn('watchers') && (
                <Prop label={L('ناظرها', 'Watchers')}>
                  <PeoplePicker value={item.watchers || ''} onChange={(v) => patch({ watchers: v })} />
                </Prop>
              )}
              {fieldOn('area') && (
                <Prop label={L('حوزه', 'Area')}>
                  <ListPicker value={item.area || ''} options={taskCfg().areas} empty={L('بدون حوزه', 'No area')} onChange={(v) => patch({ area: v })} />
                </Prop>
              )}
              <Prop label={L('اعلان‌ها', 'Alerts')}>
                <button disabled={!canEdit} onClick={() => patch({ notify: item.notify === 'off' ? '' : 'off' })} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs hover:bg-muted">
                  {item.notify === 'off' ? <BellOff size={14} className="text-sub" /> : <Bell size={14} className="text-brand" />}
                  {item.notify === 'off' ? L('خاموش', 'Off') : L('روشن', 'On')}
                </button>
              </Prop>
              <Prop label={L('محصول / پروژه', 'Product / project')}>
                <ProjectPicker value={item.project_id} onChange={(v) => patch({ project_id: v, sprint_id: '' })} />
              </Prop>
              <Prop label="OKR">
                <KrPicker value={item.kr_id || ''} onChange={(v) => patch({ kr_id: v })} />
              </Prop>
              {fieldOn('sprint_id') && (
              <Prop label={L('اسپرینت', 'Sprint')}>
                <SprintPicker projectId={item.project_id} value={item.sprint_id} onChange={(v) => patch({ sprint_id: v })} />
              </Prop>
              )}
              {fieldOn('points') && (
              <Prop label={L('امتیاز', 'Points')}>
                <input
                  type="number"
                  defaultValue={item.points || ''}
                  disabled={!canEdit}
                  onBlur={(e) => Number(e.target.value) !== Number(item.points) && patch({ points: Number(e.target.value) || 0 })}
                  className="h-8 w-16 rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong num"
                  placeholder="—"
                />
              </Prop>
              )}
              {fieldOn('link') && (
                <Prop label={L('لینک', 'Link')}>
                  <span className="flex items-center gap-1">
                    <input
                      key={item.link}
                      dir="ltr"
                      defaultValue={item.link || ''}
                      disabled={!canEdit}
                      onBlur={(e) => e.target.value.trim() !== (item.link || '') && patch({ link: e.target.value.trim() })}
                      placeholder="https://mizito…"
                      className="h-8 min-w-0 flex-1 rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong"
                    />
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noreferrer" className="icon-btn h-7 w-7 shrink-0" aria-label={L('باز کردن', 'Open')}>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </span>
                </Prop>
              )}
              <Prop label={L('تیم', 'Team')}>
                <TrackPicker task={item as unknown as Task} onChange={(v) => patch({ track: v })} />
              </Prop>
              <Prop label={L('برچسب', 'Tags')}>
                <input
                  defaultValue={item.tags}
                  disabled={!canEdit}
                  onBlur={(e) => e.target.value !== item.tags && patch({ tags: e.target.value })}
                  placeholder={L('افزودن…', 'Add…')}
                  className="h-8 w-full rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong"
                />
              </Prop>
            </>
          ) : (
            <>
              <Prop label={L('وضعیت', 'Status')}>
                <Popover
                  width={180}
                  trigger={({ toggle }) => (
                    <button onClick={toggle} disabled={!canEdit} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs hover:bg-muted">
                      <span className={cx('h-2 w-2 rounded-full', item.status === 'done' ? 'bg-good' : item.status === 'waiting' ? 'bg-purple-500' : 'bg-warn')} />
                      {lbl(FOLLOWUP_STATUS, item.status as FollowUp['status'])}
                    </button>
                  )}
                >
                  {(close) =>
                    (['open', 'waiting', 'done'] as const).map((s) => (
                      <MenuItem
                        key={s}
                        active={s === item.status}
                        onClick={() => {
                          patch({ status: s })
                          close()
                        }}
                      >
                        {lbl(FOLLOWUP_STATUS, s)}
                      </MenuItem>
                    ))
                  }
                </Popover>
              </Prop>
              <Prop label={L('با', 'With')}>
                <PersonPicker value={item.person} onChange={(v) => patch({ person: v })} placeholder={L('انتخاب', 'Choose')} />
              </Prop>
              <Prop label={L('منتظر', 'Waiting for')}>
                <input key={item.waiting_for} defaultValue={item.waiting_for || ''} disabled={!canEdit} onBlur={(e) => e.target.value !== (item.waiting_for || '') && patch({ waiting_for: e.target.value })} placeholder={L('چه چیزی؟', 'What?')} className="h-8 w-full rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong" />
              </Prop>
              <Prop label={L('لینک', 'Link')}>
                <input key={item.link} dir="ltr" defaultValue={item.link || ''} disabled={!canEdit} onBlur={(e) => e.target.value.trim() !== (item.link || '') && patch({ link: e.target.value.trim() })} placeholder="https://mizito…" className="h-8 w-full rounded-full bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus:bg-surface focus:ring-1 focus:ring-line-strong" />
              </Prop>
              {Number(item.ping_count) > 0 && (
                <Prop label={L('پینگ‌ها', 'Pings')}>
                  <span className="px-2.5 text-xs text-sub">{L(`${fa(Number(item.ping_count))} بار · آخرین ${fmtDate(item.last_ping || '')}`, `${item.ping_count}× · last ${fmtDate(item.last_ping || '')}`)}</span>
                </Prop>
              )}
              <Prop label={L('کانال', 'Channel')}>
                <Popover
                  width={170}
                  trigger={({ toggle }) => (
                    <button onClick={toggle} disabled={!canEdit} className="inline-flex h-8 items-center rounded-full px-2.5 text-xs hover:bg-muted">
                      {lbl(CHANNEL, item.channel)}
                    </button>
                  )}
                >
                  {(close) =>
                    (Object.keys(CHANNEL) as FollowUp['channel'][]).map((c) => (
                      <MenuItem
                        key={c}
                        active={c === item.channel}
                        onClick={() => {
                          patch({ channel: c })
                          close()
                        }}
                      >
                        {lbl(CHANNEL, c)}
                      </MenuItem>
                    ))
                  }
                </Popover>
              </Prop>
              <Prop label={L('اولویت', 'Priority')}>
                <PriorityPicker value={item.priority} onChange={(v) => patch({ priority: v })} />
              </Prop>
              <Prop label={L('پینگ بعدی', 'Next ping')}>
                <DatePicker compact value={item.due_date} onChange={(v) => patch({ due_date: v })} />
              </Prop>
              <Prop label={L('پروژه', 'Project')}>
                <ProjectPicker value={item.project_id} onChange={(v) => patch({ project_id: v })} />
              </Prop>
            </>
          )}
          {isTask && item.tags && (
            <div className="flex flex-wrap gap-1 px-2.5 pt-2">
              {item.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                <Chip key={t}>
                  <Hash size={10} />
                  {t}
                </Chip>
              ))}
            </div>
          )}
          {isTask && project && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles size={13} className="text-brand" /> {L('یادآوری هوشمند', 'Smart nudge')}
              </div>
              <p className="mt-1 leading-6 text-sub">
                {item.status === 'blocked'
                  ? L('این تسک مسدود است. یک پیگیری برای رفع مانع بسازید.', 'This task is blocked. Create a follow-up to clear it.')
                  : L(`این تسک بخشی از ${project.name} است.`, `Part of ${project.name}.`)}
              </p>
              {item.status === 'blocked' && canEdit && (
                <button
                  className="btn-tonal btn-sm mt-2"
                  onClick={() =>
                    upsert('FollowUps', {
                      id: uid('F'), project_id: item.project_id, subject: L(`رفع مانع: ${item.title}`, `Unblock: ${item.title}`), person: item.assignee.split(',')[0] || '', channel: 'chat',
                      due_date: addDays(todayISO(), 1), status: 'open', priority: 'high', notes: item.description, created_at: todayISO(), done_at: '', owner: me,
                    }).then(() => toast(L('پیگیری ساخته شد', 'Follow-up created')))
                  }
                >
                  <Zap size={13} /> {L('ساخت پیگیری', 'Create follow-up')}
                </button>
              )}
            </div>
          )}
          <div className="px-2.5 pt-6 text-[0.6875rem] text-sub">
            ID <span dir="ltr" className="font-mono">{fa(item.id)}</span>
          </div>
        </aside>
      </div>
    </Sheet>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="w-20 shrink-0 px-2.5 text-xs text-sub">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ActivityDot({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="relative text-xs">
      <span className="absolute -start-[31px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-surface text-sub ring-4 ring-surface">{icon}</span>
      {children}
    </li>
  )
}

function SprintPicker({ projectId, value, onChange }: { projectId: string; value: string; onChange: (v: string) => void }) {
  const { db, canEdit } = useStore()
  const ss = db.Sprints.filter((s) => !projectId || s.project_id === projectId)
  const cur = db.Sprints.find((s) => s.id === value)
  return (
    <Popover
      width={220}
      trigger={({ toggle }) => (
        <button onClick={toggle} disabled={!canEdit} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs hover:bg-muted">
          <Zap size={14} className="text-sub" />
          <span className={cx(!cur && 'text-sub')}>{cur ? cur.name : L('بک‌لاگ', 'Backlog')}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            active={!value}
            onClick={() => {
              onChange('')
              close()
            }}
          >
            {L('بک‌لاگ', 'Backlog')}
          </MenuItem>
          {ss.map((s) => (
            <MenuItem
              key={s.id}
              active={s.id === value}
              hint={s.status === 'active' ? L('فعال', 'active') : undefined}
              onClick={() => {
                onChange(s.id)
                close()
              }}
            >
              {s.name}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  )
}

export function renderMentions(text: string, people: string[]) {
  // Highlight "@Name" for any known team member (names may contain spaces).
  const names = [...people].sort((a, b) => b.length - a.length)
  const parts: React.ReactNode[] = []
  let rest = text
  let k = 0
  while (rest) {
    const i = rest.indexOf('@')
    if (i < 0) {
      parts.push(rest)
      break
    }
    parts.push(rest.slice(0, i))
    const after = rest.slice(i + 1)
    const n = names.find((nm) => after.startsWith(nm))
    if (n) {
      parts.push(
        <span key={k++} className="rounded-md bg-brand-soft/60 px-1 font-medium text-ink">
          @{n}
        </span>,
      )
      rest = after.slice(n.length)
    } else {
      parts.push('@')
      rest = after
    }
  }
  return parts
}

export function TrackBadge({ track, inferred }: { track: Track | ''; inferred?: boolean }) {
  if (!track) return <span className="text-[0.6875rem] text-sub/60">—</span>
  return (
    <span className="chip side-soft" style={sideSoft(track)} title={inferred ? L('از روی تیم مسئول', 'Inferred from assignee') : undefined}>
      {lbl(TRACK, track)}
      {inferred && <span className="opacity-60">·{L('خودکار', 'auto')}</span>}
    </span>
  )
}

function TrackPicker({ task, onChange }: { task: Task; onChange: (v: Track | '') => void }) {
  const { db, canEdit } = useStore()
  const eff = trackOf(task, db)
  return (
    <Popover
      width={220}
      trigger={({ toggle }) => (
        <button onClick={toggle} disabled={!canEdit} className="inline-flex h-8 items-center rounded-full px-1.5 hover:bg-muted">
          <TrackBadge track={eff} inferred={!task.track && !!eff} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem active={!task.track} hint={autoTrack(task, db) ? lbl(TRACK, autoTrack(task, db) as Track) : ''} onClick={() => { onChange(''); close() }}>
            {L('خودکار (واحد مسئول)', 'Auto (assignee’s unit)')}
          </MenuItem>
          {TRACKS.map((t) => (
            <MenuItem key={t} active={task.track === t} onClick={() => { onChange(t); close() }}>
              {lbl(TRACK, t)}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  )
}

/** Cross-team links: what this task waits on, and what waits on it. */
function Dependencies({ task, onChange }: { task: Task; onChange: (ids: string[]) => void }) {
  const { db, canEdit } = useStore()
  const { open } = useEditorLite()
  const [q, setQ] = useState('')
  const deps = depsOf(task, db)
  const blocking = dependentsOf(task, db)
  const waiting = deps.filter((d) => !closed(d))
  const ids = depIds(task)
  const candidates = db.Tasks.filter((t) => t.id !== task.id && !ids.includes(t.id) && (!q || t.title.includes(q)) && (t.project_id === task.project_id || q)).slice(0, 8)
  const RowT = ({ t, onRemove }: { t: Task; onRemove?: () => void }) => {
    const tr = trackOf(t, db)
    return (
      <div className="group flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
        <StatusIcon s={t.status} size={14} />
        <button onClick={() => open(t)} className={cx('min-w-0 flex-1 truncate text-start text-sm hover:underline', t.status === 'done' && 'text-sub line-through')}>
          {t.title}
        </button>
        <TrackBadge track={tr} />
        <AvatarStack names={assigneesOf(t)} max={2} />
        {onRemove && canEdit && (
          <button className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100" onClick={onRemove} title={L('حذف وابستگی', 'Remove link')}>
            <X size={12} />
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="mt-8">
      <div className="eyebrow mb-3 flex items-center gap-2">
        <ArrowLeftRight size={13} /> {L('وابستگی‌ها (پیش‌نیازها)', 'Dependencies')}
      </div>
      {waiting.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-warn/[0.09] px-3 py-2 text-xs text-warn">
          <Link2 size={13} />
          {L(`منتظر ${waiting.length === 1 ? 'یک کار' : `${fa(waiting.length)} کار`} از ${Array.from(new Set(waiting.map((w) => lbl(TRACK, trackOf(w, db) || 'tech')))).join(' و ')} است`, `Waiting on ${waiting.length} item(s) from ${Array.from(new Set(waiting.map((w) => lbl(TRACK, trackOf(w, db) || 'tech')))).join(' & ')}`)}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-xs text-sub">{L('وابسته به (پیش‌نیازها)', 'Waits on')}</div>
          <div className="space-y-1.5">
            {deps.map((d) => (
              <RowT key={d.id} t={d} onRemove={() => onChange(ids.filter((x) => x !== d.id))} />
            ))}
            {canEdit && (
              <Popover
                width={360}
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs text-sub hover:border-ink/30 hover:text-ink">
                    <Plus size={13} /> {L('افزودن پیش‌نیاز', 'Add dependency')}
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('جستجوی تسک…', 'Search tasks…')} className="mb-1 h-9 w-full border-b border-line bg-transparent px-2.5 text-sm outline-none" />
                    <div className="max-h-72 overflow-y-auto">
                      {candidates.map((t) => (
                        <MenuItem key={t.id} icon={<StatusIcon s={t.status} size={13} />} hint={trackOf(t, db) ? lbl(TRACK, trackOf(t, db) as Track) : undefined} onClick={() => { onChange([...ids, t.id]); close(); setQ('') }}>
                          {t.title}
                        </MenuItem>
                      ))}
                      {!candidates.length && <div className="px-3 py-4 text-center text-xs text-sub">{L('موردی پیدا نشد', 'No matches')}</div>}
                    </div>
                  </>
                )}
              </Popover>
            )}
          </div>
        </div>
        {blocking.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs text-sub">{L('این کار پیش‌نیازِ', 'Unblocks')}</div>
            <div className="space-y-1.5">
              {blocking.map((d) => (
                <RowT key={d.id} t={d} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Opening another task from inside the sheet goes through the editor context.
function useEditorLite() {
  const { open } = useEditor()
  return { open: (t: Task) => open('Tasks', t as never) }
}

/** The road to final delivery: hand-off to product → testing → deadline, with today's position. */
function Stages({ task }: { task: Task }) {
  const steps = [
    { on: fieldOn('handoff_date'), d: task.handoff_date || '', label: L('تحویل به پروداکت', 'Hand-off to product') },
    { on: fieldOn('test_date'), d: task.test_date || '', label: L('تست', 'Testing') },
    { on: fieldOn('deadline'), d: task.deadline || '', label: L('تحویل نهایی', 'Final delivery') },
  ].filter((x) => x.on && x.d)
  if (!steps.length) return null
  const today = todayISO()
  const done = task.status === 'done'
  return (
    <div className="mt-6">
      <div className="eyebrow mb-3">{L('مراحل تحویل', 'Delivery stages')}</div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((x) => {
          const past = x.d < today
          const now = x.d === today
          return (
            <li key={x.label} className={cx('rounded-2xl border px-3 py-2.5', done || past ? 'border-line bg-muted/50' : now ? 'border-warn/40 bg-warn/[0.08]' : 'border-line bg-surface')}>
              <div className="text-[0.6875rem] text-sub">{x.label}</div>
              <div className={cx('mt-0.5 text-sm font-medium num', !done && past && 'text-bad')}>{fmtDate(x.d)}</div>
              <div className="text-[0.625rem] text-sub">{done ? L('انجام شد', 'Done') : now ? L('امروز', 'Today') : past ? L('گذشته', 'Passed') : relDays(x.d)}</div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** ClickUp-style checklist kept as text lines: "[ ] item" / "[x] item". */
function parseChecklist(v: string) {
  return String(v || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ done: /^\[x\]/i.test(l), text: l.replace(/^\[( |x)\]\s*/i, '') }))
}
const serialize = (items: { done: boolean; text: string }[]) => items.map((i) => `[${i.done ? 'x' : ' '}] ${i.text}`).join('\n')

function Checklist({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const { canEdit } = useStore()
  const items = parseChecklist(value)
  const [draft, setDraft] = useState('')
  const done = items.filter((i) => i.done).length
  return (
    <div className="mt-6">
      <div className="eyebrow mb-2 flex items-center gap-2">
        <ListChecks size={13} /> {title || L('چک‌لیست', 'Checklist')}
        {items.length > 0 && <span className="num">{fa(done)}/{fa(items.length)}</span>}
      </div>
      {items.length > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/50">
            <input type="checkbox" disabled={!canEdit} checked={it.done} onChange={() => onChange(serialize(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x))))} />
            <span className={cx('flex-1 text-sm', it.done && 'text-sub line-through')}>{it.text}</span>
            {canEdit && (
              <button className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onChange(serialize(items.filter((_, j) => j !== i)))} aria-label={L('حذف', 'Remove')}>
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="mt-1" onSubmit={(e) => (e.preventDefault(), draft.trim() && (onChange(serialize([...items, { done: false, text: draft.trim() }])), setDraft('')))}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={L('+ افزودن مورد', '+ Add an item')} className="h-8 w-full rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-sub/70 focus:bg-muted/50" />
        </form>
      )}
    </div>
  )
}

/** Which key result a task moves; empty = other work outside the OKRs. */
function KrPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db, canEdit } = useStore()
  const qs = [quarterOf(), addQuarter(quarterOf(), 1)]
  const objs = db.Objectives.filter((o) => qs.includes(o.quarter) || db.KeyResults.some((k) => k.id === value && k.objective_id === o.id))
  return (
    <select disabled={!canEdit} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full truncate rounded-full bg-transparent px-2 text-xs hover:bg-muted">
      <option value="">{L('کار دیگر (خارج از OKR)', 'Other work (outside OKRs)')}</option>
      {objs.map((o) => (
        <optgroup key={o.id} label={`${teamName(o.team)} · ${o.title}`}>
          {db.KeyResults.filter((k) => k.objective_id === o.id).map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
