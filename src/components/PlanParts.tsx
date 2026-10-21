// A roadmap item in full: dates and slippage, progress against its window, the weekly status line
// (each one kept as a note), the tasks under it, documents and links.
import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Attachments } from './Files'
import { TaskRow } from './shared'
import { Avatar, Empty, Progress, Sheet, cx } from './ui'
import { teamName } from './TeamParts'
import { L, tr } from '../lib/i18n'
import { fa, fmtDate, timeAgo } from '../lib/jalali'
import { uid } from '../lib/api'
import { nowStamp } from '../lib/taskstamp'
import { CONF } from '../lib/okr'
import { PLAN_KIND, PLAN_STATUS, planElapsed, planHealth, planProgress, slipDays, tasksOfPlan } from '../lib/plans'
import type { PlanItem } from '../lib/types'

const toDate = (s: string) => new Date(String(s).replace(' ', 'T'))

export function PlanStatusChip({ p }: { p: PlanItem }) {
  const s = PLAN_STATUS[p.status] || PLAN_STATUS.planned
  return <span className={cx('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium', s.tone)}>{tr(s.label)}</span>
}

export function PlanSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, canEdit, upsert, me } = useStore()
  const { open } = useEditor()
  const [note, setNote] = useState('')
  const p = db.Plans.find((x) => x.id === id)
  if (!p) return null
  const h = planHealth(db, p)
  const prog = planProgress(db, p)
  const slip = slipDays(p)
  const tasks = tasksOfPlan(db, p.id)
  const log = db.Comments.filter((c) => c.entity === 'Plans' && c.entity_id === p.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const product = p.project_id ? db.Projects.find((x) => x.id === p.project_id) : undefined
  const kr = p.kr_id ? db.KeyResults.find((x) => x.id === p.kr_id) : undefined
  // a status update is both the item's latest line (for reports) and a kept note (the history)
  const post = async () => {
    const body = note.trim()
    if (!body) return
    await upsert('Comments', { id: uid('C'), entity: 'Plans', entity_id: p.id, author: me, body, created_at: nowStamp() })
    await upsert('Plans', { ...p, note: body })
    setNote('')
  }
  const prop = (label: string, v: React.ReactNode) => (
    <div className="flex min-h-9 items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-sub">{label}</span>
      <span className="min-w-0 flex-1">{v}</span>
    </div>
  )
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="eyebrow">{L('برنامه', 'Plan')}</span>
          <span className="text-line-strong">/</span>
          <span className="truncate text-sub">{teamName(p.team)}</span>
        </div>
      }
      footer={
        canEdit && (
          <>
            <span className="text-[0.6875rem] text-sub">{p.updated_at && L(`آخرین به‌روزرسانی ${timeAgo(toDate(p.updated_at))}`, `Updated ${timeAgo(toDate(p.updated_at))}`)}</span>
            <div className="flex-1" />
            <button className="btn-outline btn-sm" onClick={() => open('Plans', p as never)}><Pencil size={13} /> {L('ویرایش', 'Edit')}</button>
          </>
        )
      }
    >
      <div className="grid min-h-full lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-6 px-6 py-6 lg:border-e lg:border-line">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
              <span>{tr(PLAN_KIND[p.kind] || PLAN_KIND.other)}</span>
              <PlanStatusChip p={p} />
              <span className={cx('font-medium', CONF[h].tone)}>{tr(CONF[h].label)}{!p.confidence && <span className="font-normal text-sub"> {L('(خودکار)', '(auto)')}</span>}</span>
            </div>
            <h2 className="display mt-2 text-2xl leading-snug">{p.title}</h2>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={prog} marker={planElapsed(p)} h={h === 'on_track' ? 'green' : h === 'at_risk' ? 'amber' : 'red'} className="h-2" />
              <span className="text-sm font-semibold num">{fa(prog)}٪</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-sub">
              <span className="num">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</span>
              {slip > 0 && <span className="text-warn">{L(`${fa(slip)} روز جابه‌جا از تعهد اول (${fmtDate(p.baseline_end)})`, `moved ${slip} days from the first commitment (${fmtDate(p.baseline_end)})`)}</span>}
              {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink"><ExternalLink size={12} /> {L('لینک', 'Link')}</a>}
            </div>
          </div>

          <section>
            <div className="eyebrow mb-2">{L('وضعیت این هفته (برای گزارش CPTO)', 'This week’s status (for the CPTO report)')}</div>
            {p.note && <div className="mb-3 whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-sm leading-7">{p.note}</div>}
            {canEdit && (
              <div className="flex items-end gap-2 rounded-2xl border border-line p-2 focus-within:border-ink/30">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && post()} rows={2} placeholder={L('چه شد، چه مانده، به چه چیزی نیاز است؟ (Ctrl+Enter)', 'What happened, what is left, what is needed? (Ctrl+Enter)')} className="flex-1 resize-none bg-transparent px-1 text-sm outline-none" />
                <button className="btn-primary btn-sm h-9 w-9 px-0" onClick={post} disabled={!note.trim()} aria-label={L('ثبت', 'Post')}><Send size={14} className="rtl:-scale-x-100" /></button>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">{L(`تسک‌ها (${fa(tasks.length)})`, `Tasks (${tasks.length})`)}</span>
              {canEdit && (
                <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-sub hover:bg-muted hover:text-ink" onClick={() => open('Tasks', { plan_id: p.id, track: p.team, project_id: p.project_id || '', kr_id: p.kr_id || '' })}>
                  <Plus size={12} /> {L('تسک', 'Task')}
                </button>
              )}
            </div>
            {tasks.length ? <div className="-mx-2">{tasks.map((t) => <TaskRow key={t.id} t={t} dense />)}</div> : <div className="text-xs text-sub">{L('تسکی زیر این آیتم نیست؛ پیشرفت را دستی ثبت کنید یا تسک اضافه کنید.', 'No tasks yet; set progress by hand or add tasks.')}</div>}
          </section>

          <section>
            <div className="eyebrow mb-2">{L('مستندات', 'Documents')}</div>
            <Attachments entity="Plans" id={p.id} />
          </section>

          <section>
            <div className="eyebrow mb-2">{L('تاریخچه‌ی وضعیت', 'Status history')}</div>
            {log.length ? (
              <div className="space-y-4">
                {log.map((x) => (
                  <div key={x.id} className="flex gap-3">
                    <Avatar name={x.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 text-sm"><span className="font-medium">{x.author}</span><span className="text-[0.6875rem] text-sub">{fmtDate(x.created_at)} · {timeAgo(toDate(x.created_at))}</span></div>
                      <div className="mt-0.5 whitespace-pre-wrap text-sm leading-7 text-ink/85">{x.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text={L('هنوز وضعیتی ثبت نشده', 'No status updates yet')} />
            )}
          </section>
        </div>
        <aside className="space-y-1 bg-muted/30 px-4 py-6">
          <div className="eyebrow mb-2">{L('مشخصات', 'Properties')}</div>
          {prop(L('تیم', 'Team'), teamName(p.team))}
          {prop(L('مسئول', 'Owner'), p.owner || '—')}
          {prop(L('نوع کار', 'Kind'), tr(PLAN_KIND[p.kind] || PLAN_KIND.other))}
          {prop(L('شروع', 'Start'), <span className="num">{fmtDate(p.start_date)}</span>)}
          {prop(L('پایان', 'End'), <span className="num">{fmtDate(p.end_date)}</span>)}
          {prop(L('تعهد اول', 'First commitment'), <span className="num">{fmtDate(p.baseline_end)}</span>)}
          {prop(L('محصول', 'Product'), product ? product.name : '—')}
          {prop(L('نتیجه‌ی کلیدی', 'Key result'), kr ? kr.title : '—')}
        </aside>
      </div>
    </Sheet>
  )
}
