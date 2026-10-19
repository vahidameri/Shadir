import { isAssignee } from '../lib/assignees'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Pencil, Plus, Target, Send, Building2, Contact, User, Pause } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor, type EditableSheet } from '../components/Editor'
import { Band, Card, Empty, HealthBadge, Overlap, Progress, StatStrip, Tabs, cx, healthText, Avatar, Chip, Segmented } from '../components/ui'
import { projectMetrics, riskScore } from '../lib/metrics'
import { fa, fmtDate, relDays, timeAgo } from '../lib/jalali'
import { PROJECT_STATUS, RISK_STATUS, RISK_TYPE, SCOPE_STATUS, SPRINT_STATUS, PRIORITY, JOB_TITLE } from '../lib/labels'
import { L, lbl } from '../lib/i18n'
import { TaskRow, FollowUpRow, PinButton } from '../components/shared'
import { PauseButton } from '../components/PauseButton'
import { ArchiveButton } from '../components/ArchiveButton'
import { ProjectLinks } from '../components/ProjectLinks'
import { everyDay } from '../lib/cadence'
import { DeliveredButton, DeliveryBadge } from '../components/DeliveryDay'
import type { Project } from '../lib/types'
import { Archive } from 'lucide-react'
import { ContractsList, NewContractButton } from '../components/Contracts'
import { can } from '../lib/access'
import { Attachments } from '../components/Files'
import { BurndownChart, Kanban, MilestoneList, RiskMatrix, SprintHeader, UpdateCard, VelocityChart, riskTone, ActivityFeed, HealthTrend, RagStrip } from '../components/widgets'
import { buildActivity } from '../lib/activity'
import { assess } from '../lib/rag'
import { renderMentions, stampToDate } from '../components/ItemSheet'
import { uid } from '../lib/api'
import { todayISO } from '../lib/jalali'
import { useComposer } from '../components/UpdateComposer'
import { DeliverableRow, DeliveryEmpty } from '../components/delivery'
import { deliverySummary, isClosed } from '../lib/delivery'
import { memberWeek } from '../lib/capacity'

type Tab = 'overview' | 'scope' | 'milestones' | 'sprints' | 'tasks' | 'risks' | 'updates' | 'team' | 'delivery' | 'contracts'

export default function ProjectDetail() {
  const { id } = useParams()
  const { db, archived, canEdit, upsert, me, access } = useStore()
  const { open } = useEditor()
  const [tab, setTab] = useState<Tab>('overview')
  const { openComposer } = useComposer()
  const [taskView, setTaskView] = useState<'board' | 'list'>('board')
  const [note, setNote] = useState('')
  const p = db.Projects.find((x) => x.id === id)
  const gone = archived.find((x) => x.id === id)
  if (gone) return <ArchivedProject p={gone} />
  if (!p) return <Empty text={L('پروژه پیدا نشد', 'Project not found')} />

  const m = projectMetrics(p, db)
  const scope = db.Scope.filter((s) => s.project_id === p.id)
  const ms = db.Milestones.filter((x) => x.project_id === p.id)
  const sprints = db.Sprints.filter((s) => s.project_id === p.id).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  const tasks = db.Tasks.filter((t) => t.project_id === p.id)
  const risks = db.Risks.filter((r) => r.project_id === p.id).sort((a, b) => riskScore(b) - riskScore(a))
  const updates = db.Updates.filter((u) => u.project_id === p.id).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))
  const fus = db.FollowUps.filter((f) => f.project_id === p.id && f.status !== 'done')
  const allocs = db.Allocations.filter((a) => a.project_id === p.id)
  const notes = db.Comments.filter((c) => c.entity === 'Projects' && c.entity_id === p.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  const AddBtn = ({ sheet, label, extra }: { sheet: EditableSheet; label: string; extra?: Record<string, unknown> }) =>
    canEdit ? (
      <button className="btn-outline btn-sm" onClick={() => open(sheet, { project_id: p.id, ...extra })}>
        <Plus size={14} /> {label}
      </button>
    ) : null

  const postNote = async () => {
    if (!note.trim()) return
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    await upsert('Comments', { id: uid('C'), entity: 'Projects', entity_id: p.id, author: me, body: note.trim(), created_at: `${todayISO()} ${pad(d.getHours())}:${pad(d.getMinutes())}` })
    setNote('')
  }

  return (
    <>
      <Band
        eyebrow={
          <>
            <Link to="/projects" className="flex items-center gap-1 hover:text-white">
              <ArrowRight size={12} className="ltr:rotate-180" /> {L('پروژه‌ها', 'Projects')}
            </Link>
            <span className="opacity-40">/</span>
            <span dir="ltr">{p.code}</span>
            <span className="opacity-40">/</span>
            <span>{lbl(PROJECT_STATUS, p.status)}</span>
            {p.phase && (
              <>
                <span className="opacity-40">/</span>
                <span>{p.phase}</span>
              </>
            )}
          </>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {p.name}
            {everyDay(p) && <span className="rounded-full bg-white/10 px-3 py-1 align-middle text-sm font-medium text-white/85">{L(`روز تحویل: ${everyDay(p)}`, `Delivery day: ${everyDay(p)}`)}</span>}
          </span>
        }
        sub={
          <>
            {p.status === 'on_hold' && (
              <span className="mb-3 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                <Pause size={13} /> {L('متوقف', 'Paused')}
                {p.paused_at && ` · ${L(`از ${fmtDate(p.paused_at)}`, `since ${fmtDate(p.paused_at)}`)}`}
                {p.pause_reason && ` — ${p.pause_reason}`}
              </span>
            )}
            {p.description}
            {p.objective && (
              <span className="mt-3 flex items-center gap-2 text-white/80">
                <Target size={14} /> {p.objective}
              </span>
            )}
          </>
        }
        actions={
          <>
            <span className="rounded-full bg-white/10 p-0.5">
              <PinButton id={p.id} className="text-white/70 hover:bg-white/10" />
            </span>
            <DeliveredButton p={p} dark />
            <PauseButton p={p} dark />
            <ArchiveButton p={p} dark />
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Projects', p as never)}>
                <Pencil size={15} /> {L('ویرایش', 'Edit')}
              </button>
            )}
          </>
        }
      >
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-band-sub">
          <span className="flex items-center gap-2">
            <User size={14} /> {L('مدیر محصول', 'PM')}: <span className="text-white">{p.owner}</span>
          </span>
          {p.client && (
            <span className="flex items-center gap-2">
              <Building2 size={14} /> {L('کارفرما', 'Client')}: <span className="text-white">{p.client}</span>
            </span>
          )}
          {p.liaison && (
            <span className="flex items-center gap-2">
              <Contact size={14} /> {L('رابط پروژه', 'Liaison')}: <span className="text-white">{p.liaison}</span>
              {p.liaison_contact && (
                <a href={p.liaison_contact.includes('@') ? `mailto:${p.liaison_contact}` : `tel:${p.liaison_contact}`} className="text-white/70 underline-offset-2 hover:underline" dir="ltr">
                  {p.liaison_contact}
                </a>
              )}
            </span>
          )}
          <span className="num">
            {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
          </span>
          <DeliveryBadge p={p} dark />
        </div>
        <div className="-mt-3 mb-6">
          <ProjectLinks p={p} dark />
        </div>
        <StatStrip
          items={[
            { label: L('پیشرفت', 'Progress'), value: `${fa(`${m.progress}%`)}`, tone: m.health },
            { label: L('زمان سپری‌شده', 'Time elapsed'), value: `${fa(`${m.elapsed}%`)}` },
            { label: m.daysLeft >= 0 ? L('تا ددلاین', 'To deadline') : L('از ددلاین گذشته', 'Past deadline'), value: p.end_date ? fa(Math.abs(m.daysLeft)) : '—', tone: m.daysLeft < 0 ? 'red' : undefined, sub: L('روز', 'days') },
            { label: L('خروجی‌های باز', 'Open deliverables'), value: fa(deliverySummary(db, p.id).open.length), tone: deliverySummary(db, p.id).overdue.length ? 'red' : undefined, sub: L(`${fa(deliverySummary(db, p.id).overdue.length)} عقب‌افتاده`, `${deliverySummary(db, p.id).overdue.length} overdue`) },
            { label: L('تسک باز', 'Open tasks'), value: fa(m.openTasks), sub: L(`${fa(m.overdueTasks)} معوق · ${fa(m.blockedTasks)} مسدود`, `${m.overdueTasks} overdue · ${m.blockedTasks} blocked`) },
            { label: L('ریسک‌های باز', 'Open risks'), value: fa(m.openRisks), tone: m.highRisks ? 'red' : undefined, sub: L(`${fa(m.highRisks)} بحرانی`, `${m.highRisks} critical`) },
          ]}
        />
      </Band>

      <Overlap>
        <div className="card overflow-hidden">
          <div className="px-3">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'overview', label: L('خلاصه', 'Overview') },
                { value: 'tasks', label: L('تسک‌ها', 'Tasks'), count: m.openTasks },
                { value: 'delivery', label: L('برنامه‌ی تحویل', 'Delivery plan'), count: db.Deliverables.filter((d) => d.project_id === p.id && !isClosed(d)).length },
                { value: 'milestones', label: L('مایلستون‌ها', 'Milestones'), count: ms.length },
                { value: 'sprints', label: L('اسپرینت‌ها', 'Sprints'), count: sprints.length },
                { value: 'scope', label: L('محدوده‌ی کار', 'Scope'), count: scope.length },
                { value: 'risks', label: L('ریسک‌ها', 'Risks'), count: m.openRisks },
                { value: 'updates', label: L('گزارش‌ها', 'Updates'), count: updates.length },
                { value: 'team', label: L('تیم', 'Team'), count: allocs.length },
                ...(can.contracts(access) ? [{ value: 'contracts' as Tab, label: L('قراردادها', 'Contracts'), count: db.Contracts.filter((c) => c.project_id === p.id).length }] : []),
              ]}
            />
          </div>
        </div>

        <div className="mt-4 fade-in" key={tab}>
          {tab === 'overview' && <SetupPrompt p={p} />}
          {tab === 'overview' && (
            <div className="grid gap-4 @xl:grid-cols-3">
              <Card eyebrow={L('تحلیل خودکار', 'Automatic analysis')} title={L('چرا این وضعیت؟', 'Why this status?')}>
                <div className="mb-4 flex items-end gap-3">
                  <div className={cx('display text-5xl num', healthText[m.health])}>{fa(m.score)}</div>
                  <div className="pb-1.5 text-xs leading-5 text-sub">
                    {L('نمره‌ی سلامت از ۱۰۰', 'Health score / 100')}
                    <br />
                    <HealthBadge h={m.health} />
                  </div>
                </div>
                <div className="mb-4">
                  <RagStrip a={assess(p, db)} />
                </div>
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[0.6875rem] text-sub">
                    <span>{L('پیشرفت', 'Progress')} {fa(`${m.progress}%`)}</span>
                    <span>{L(`${fa(m.elapsed)}٪ از زمان گذشته`, `${m.elapsed}% of time used`)}</span>
                  </div>
                  <Progress value={m.progress} h={m.health} marker={m.elapsed} className="h-2" />
                </div>
              </Card>
              <Card eyebrow={L('رودمپ', 'Roadmap')} title={L('مایلستون‌ها', 'Milestones')} action={<AddBtn sheet="Milestones" label={L('مایلستون', 'Milestone')} />}>
                {ms.length ? <MilestoneList milestones={ms} compact /> : <Empty text={L('مایلستونی ثبت نشده', 'No milestones yet')} />}
              </Card>
              <div className="min-w-0 space-y-4">
                {m.activeSprint && (
                  <Card eyebrow={L('اسپرینت جاری', 'Current sprint')} title={<SprintHeader s={m.activeSprint} db={db} />}>
                    <BurndownChart sprint={m.activeSprint} db={db} height={180} />
                  </Card>
                )}
                <Card pad={false} eyebrow={L('دنبال کردن', 'Chasing')} title={L('پیگیری‌های باز', 'Open follow-ups')} action={<AddBtn sheet="FollowUps" label={L('پیگیری', 'Follow-up')} />}>
                  <div className="px-2 pb-2">{fus.length ? fus.map((f) => <FollowUpRow key={f.id} f={f} compact />) : <Empty />}</div>
                </Card>
              </div>
              <div className="min-w-0 @xl:col-span-2">
                {updates[0] ? (
                  <>
                    <div className="eyebrow mb-2 px-1">{L('آخرین گزارش وضعیت', 'Latest status update')}</div>
                    <UpdateCard u={updates[0]} />
                  </>
                ) : (
                  <Card>
                    <Empty text={L('هنوز گزارشی ثبت نشده', 'No updates yet')} action={<AddBtn sheet="Updates" label={L('گزارش هفتگی', 'Weekly update')} extra={{ author: p.owner, health: m.health }} />} />
                  </Card>
                )}
              </div>
              <Card eyebrow={L('یادداشت‌ها', 'Notes')} title={L('گفتگوی پروژه', 'Project discussion')}>
                {canEdit && (
                  <div className="mb-4 flex items-end gap-2 rounded-2xl border border-line p-2 focus-within:border-ink/30">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && postNote()}
                      rows={2}
                      placeholder={L('یادداشت برای تیم و مدیریت… (Ctrl+Enter)', 'Note for the team and leadership… (Ctrl+Enter)')}
                      className="flex-1 resize-none bg-transparent px-1 text-sm outline-none"
                    />
                    <button className="btn-primary btn-sm h-9 w-9 px-0" onClick={postNote} disabled={!note.trim()}>
                      <Send size={14} className="rtl:-scale-x-100" />
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  {notes.length === 0 && <div className="text-xs text-sub">{L('یادداشتی نیست', 'No notes yet')}</div>}
                  {notes.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <Avatar name={c.author} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium">{c.author}</span>
                          <span className="text-[0.6875rem] text-sub">{timeAgo(stampToDate(c.created_at))}</span>
                        </div>
                        <div className="mt-0.5 text-sm leading-7 text-ink/85">{renderMentions(c.body, db.Team.map((t) => t.name))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="@xl:col-span-2" eyebrow={L('فعالیت', 'Activity')} title={L('آنچه اخیراً در این پروژه گذشت', 'What happened recently')}>
                <ActivityFeed items={buildActivity(db, p.id, 10)} showProject={false} />
              </Card>
              <Card eyebrow={L('مشخصات', 'Key facts')} title={L('پروژه در یک نگاه', 'At a glance')}>
                <dl className="space-y-3 text-sm">
                  {[
                    [L('دسته', 'Category'), p.category],
                    [L('فاز', 'Phase'), p.phase],
                    [L('اولویت', 'Priority'), lbl(PRIORITY, p.priority)],
                    [L('شروع', 'Start'), fmtDate(p.start_date, 'long')],
                    [L('ددلاین', 'Deadline'), `${fmtDate(p.end_date, 'long')} · ${relDays(p.end_date)}`],
                    [L('مایلستون بعدی', 'Next milestone'), m.nextMilestone ? `${m.nextMilestone.title} · ${relDays(m.nextMilestone.planned_date)}` : '—'],
                    [L('اسپرینت جاری', 'Current sprint'), m.activeSprint ? m.activeSprint.name : '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                      <dt className="shrink-0 text-sub">{k}</dt>
                      <dd className="text-end font-medium num">{v || '—'}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                  <span className="text-xs text-sub">{L('روند سلامت (گزارش‌ها)', 'Health trend (updates)')}</span>
                  <HealthTrend projectId={p.id} n={6} />
                </div>
              </Card>
              <Card className="@xl:col-span-3" eyebrow={L('فایل‌ها', 'Files')} title={L('اسناد پروژه', 'Project documents')}>
                <Attachments entity="Projects" id={p.id} />
              </Card>
            </div>
          )}

          {tab === 'tasks' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <Segmented value={taskView} onChange={setTaskView} options={[{ value: 'board', label: L('بورد', 'Board') }, { value: 'list', label: L('لیست', 'List') }]} />
                <AddBtn sheet="Tasks" label={L('تسک', 'Task')} extra={{ sprint_id: m.activeSprint?.id || '' }} />
              </div>
              {taskView === 'board' ? (
                <Kanban tasks={tasks} defaults={{ project_id: p.id, sprint_id: m.activeSprint?.id || '' }} showProject={false} />
              ) : (
                <Card pad={false}>
                  <div className="p-2">{tasks.length ? tasks.map((t) => <TaskRow key={t.id} t={t} showProject={false} />) : <Empty />}</div>
                </Card>
              )}
            </>
          )}

          {tab === 'milestones' && (
            <Card eyebrow={L('رودمپ پروژه', 'Project roadmap')} title={L('مایلستون‌ها', 'Milestones')} action={<AddBtn sheet="Milestones" label={L('مایلستون', 'Milestone')} />}>
              {ms.length ? (
                <MilestoneList milestones={ms} />
              ) : (
                <Empty text={L('مایلستونی ثبت نشده', 'No milestones yet')} />
              )}
            </Card>
          )}

          {tab === 'sprints' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <AddBtn sheet="Sprints" label={L('اسپرینت جدید', 'New sprint')} />
              </div>
              {sprints.length === 0 && (
                <Card>
                  <Empty text={L('این پروژه اسپرینت ندارد', 'No sprints for this project')} />
                </Card>
              )}
              {sprints.length > 1 && (
                <Card eyebrow="Velocity" title={L('تعهد در برابر تحویل', 'Committed vs delivered')}>
                  <VelocityChart sprints={sprints} db={db} />
                </Card>
              )}
              <div className="grid gap-4 @lg:grid-cols-2">
                {sprints.map((s) => (
                  <Card
                    key={s.id}
                    title={<SprintHeader s={s} db={db} />}
                    action={
                      <span className="flex items-center gap-1">
                        <Chip className={s.status === 'active' ? 'bg-ink text-surface' : ''}>{lbl(SPRINT_STATUS, s.status)}</Chip>
                        {canEdit && (
                          <button className="icon-btn h-8 w-8" onClick={() => open('Sprints', s as never)}>
                            <Pencil size={13} />
                          </button>
                        )}
                      </span>
                    }
                  >
                    {s.status !== 'planned' ? <BurndownChart sprint={s} db={db} height={170} /> : <Empty text={L('هنوز شروع نشده', 'Not started')} />}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === 'scope' && (
            <div className="grid gap-4 @lg:grid-cols-2">
              {(['in', 'out'] as const).map((type) => (
                <Card key={type} eyebrow={L('محدوده‌ی کار', 'Scope')} title={type === 'in' ? L('داخل محدوده‌ی کار', 'In scope') : L('خارج از محدوده‌ی کار', 'Out of scope')} action={<AddBtn sheet="Scope" label={L('آیتم', 'Item')} extra={{ type }} />}>
                  <div className="space-y-2">
                    {scope
                      .filter((s) => s.type === type)
                      .map((s) => (
                        <button key={s.id} onClick={() => open('Scope', s as never)} className="w-full rounded-2xl border border-line p-3.5 text-start transition hover:border-line-strong">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cx('text-sm', s.status === 'removed' && 'text-sub line-through')}>{s.item}</span>
                            <Chip className={cx(s.status === 'delivered' && 'bg-good/10 text-good', s.status === 'changed' && 'bg-warn/10 text-warn', s.status === 'in_progress' && 'bg-brand-soft/50 text-ink')}>{lbl(SCOPE_STATUS, s.status)}</Chip>
                          </div>
                          {s.change_note && (
                            <div className="mt-1 text-xs text-sub">
                              {s.change_note} · {fmtDate(s.date)}
                            </div>
                          )}
                        </button>
                      ))}
                    {!scope.some((s) => s.type === type) && <Empty />}
                  </div>
                </Card>
              ))}
              <Card className="@lg:col-span-2" eyebrow="Change log" title={L('تغییرات محدوده‌ی کار', 'Scope changes')}>
                {scope.filter((s) => s.status === 'changed' || s.status === 'removed').length === 0 ? (
                  <Empty text={L('تغییری در محدوده‌ی کار ثبت نشده', 'No scope changes logged')} />
                ) : (
                  <div className="divide-y divide-line">
                    {scope
                      .filter((s) => s.status === 'changed' || s.status === 'removed')
                      .sort((a, b) => (a.date < b.date ? 1 : -1))
                      .map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                          <span className="w-24 text-xs text-sub num">{fmtDate(s.date)}</span>
                          <Chip className={s.status === 'removed' ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn'}>{lbl(SCOPE_STATUS, s.status)}</Chip>
                          <span className="font-medium">{s.item}</span>
                          <span className="text-xs text-sub">— {s.change_note}</span>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === 'risks' && (
            <div className="grid gap-4 @lg:grid-cols-5">
              <Card className="@lg:col-span-2" eyebrow={L('ماتریس', 'Matrix')} title={L('احتمال × اثر', 'Probability × impact')}>
                <RiskMatrix risks={risks.filter((r) => r.status !== 'closed')} onPick={(r) => open('Risks', r as never)} />
              </Card>
              <Card className="@lg:col-span-3" eyebrow="RAID" title={L('ریسک، مسئله، وابستگی و تصمیم', 'Risks, issues, dependencies, decisions')} action={<AddBtn sheet="Risks" label={L('مورد جدید', 'New item')} />}>
                <div className="space-y-2">
                  {risks.map((r, i) => (
                    <button key={r.id} onClick={() => open('Risks', r as never)} className={cx('flex w-full items-start gap-3 rounded-2xl border border-line p-3.5 text-start transition hover:border-line-strong', r.status === 'closed' && 'opacity-60')}>
                      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold num', riskTone(r))}>{fa(riskScore(r))}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="text-sub num">#{fa(i + 1)}</span> {r.title}
                          <Chip>{lbl(RISK_TYPE, r.type)}</Chip>
                          <Chip>{lbl(RISK_STATUS, r.status)}</Chip>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-sub">{r.mitigation}</div>
                        <div className="mt-1 text-[0.6875rem] text-sub">
                          {r.owner} · {relDays(r.due_date)}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!risks.length && <Empty />}
                </div>
              </Card>
            </div>
          )}

          {tab === 'delivery' && <ProjectDelivery projectId={p.id} />}
          {tab === 'contracts' && can.contracts(access) && (
            <Card pad={false} eyebrow={L('محرمانه', 'Confidential')} title={L('قراردادهای این پروژه', 'Contracts for this project')} action={<NewContractButton projectId={p.id} />}>
              <ContractsList projectId={p.id} />
            </Card>
          )}

          {tab === 'updates' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                {canEdit && (
                  <button className="btn-primary btn-sm" onClick={() => openComposer({ projectId: p.id })}>
                    <Plus size={14} /> {L('ثبت گزارش هفتگی', 'Submit weekly update')}
                  </button>
                )}
              </div>
              {updates.length ? (
                updates.map((u) => <UpdateCard key={u.id} u={u} />)
              ) : (
                <Card>
                  <Empty text={L('هنوز گزارشی ثبت نشده', 'No updates yet')} />
                </Card>
              )}
            </div>
          )}

          {tab === 'team' && (
            <Card eyebrow={L('تیم', 'Team')} title={L('اعضا و درصد تخصیص', 'Members & allocation')} action={<AddBtn sheet="Allocations" label={L('تخصیص', 'Allocation')} />}>
              <div className="grid gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
                {allocs.map((a) => {
                  const mem = db.Team.find((x) => x.id === a.member_id)
                  if (!mem) return null
                  const total = memberWeek(db, mem).load
                  const memTasks = tasks.filter((t) => isAssignee(t, mem.name) && t.status !== 'done').length
                  return (
                    <button key={a.id} onClick={() => open('Allocations', a as never)} className="flex items-center gap-3 rounded-2xl border border-line p-4 text-start transition hover:border-line-strong">
                      <Avatar name={mem.name} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{mem.name}</div>
                        <div className="text-xs text-sub">
                          {lbl(JOB_TITLE, mem.role)} · {L(`${fa(memTasks)} تسک باز`, `${memTasks} open tasks`)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={Number(a.percent)} />
                          <span className="text-xs num">{fa(`${a.percent}%`)}</span>
                        </div>
                        {total > 100 && <div className="mt-1 text-[0.6875rem] text-bad">{L(`بار کل این هفته ${fa(total)}٪ — بیش از ظرفیت`, `Total load this week ${total}% — over capacity`)}</div>}
                      </div>
                    </button>
                  )
                })}
                {!allocs.length && <Empty />}
              </div>
            </Card>
          )}
        </div>
      </Overlap>
    </>
  )
}

function ProjectDelivery({ projectId }: { projectId: string }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const sum = deliverySummary(db, projectId)
  const list = [...sum.list].filter((d) => d.status !== 'dropped').sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
  const upcoming = list.filter((d) => !isClosed(d))
  const done = list.filter((d) => d.status === 'delivered').reverse()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        {[
          [L('در پیش رو', 'Upcoming'), fa(upcoming.length), ''],
          [L('عقب‌افتاده', 'Overdue'), fa(sum.overdue.length), sum.overdue.length ? 'text-bad' : ''],
          [L('جابجا شده از تعهد', 'Moved from baseline'), fa(sum.slipped.length), sum.slipped.length ? 'text-warn' : ''],
          [L('تحویل به‌موقع', 'On-time'), sum.onTimeRate === null ? '—' : `${fa(`${sum.onTimeRate}%`)}`, ''],
        ].map(([l, v, c]) => (
          <div key={l} className="card p-4">
            <div className="text-[0.6875rem] text-sub">{l}</div>
            <div className={cx('mt-1 text-2xl font-semibold num', c)}>{v}</div>
          </div>
        ))}
      </div>
      <Card
        pad={false}
        eyebrow={L('برنامه', 'Plan')}
        title={L('تحویل‌های پیش رو', 'Upcoming deliveries')}
        action={
          canEdit && (
            <button className="btn-outline btn-sm" onClick={() => open('Deliverables', { project_id: projectId })}>
              <Plus size={14} /> {L('خروجی', 'Deliverable')}
            </button>
          )
        }
      >
        {upcoming.length ? (
          <div className="divide-y divide-line border-t border-line">
            {upcoming.map((d) => (
              <DeliverableRow key={d.id} d={d} showProject={false} />
            ))}
          </div>
        ) : (
          <DeliveryEmpty />
        )}
      </Card>
      {done.length > 0 && (
        <Card pad={false} eyebrow={L('سابقه', 'History')} title={L('تحویل‌شده', 'Delivered')}>
          <div className="divide-y divide-line border-t border-line">
            {done.map((d) => (
              <DeliverableRow key={d.id} d={d} showProject={false} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

/** A new project starts empty: say what's missing instead of pretending it's healthy. */
function SetupPrompt({ p }: { p: import('../lib/types').Project }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const steps = [
    { done: !!p.owner, label: L('مدیر محصول پروژه', 'Project lead') },
    { done: !!p.client, label: L('کارفرما و رابط', 'Client & liaison') },
    { done: !!(p.start_date && p.end_date), label: L('تاریخ شروع و ددلاین', 'Start date & deadline') },
    { done: db.Milestones.some((x) => x.project_id === p.id), label: L('مایلستون‌ها', 'Milestones'), sheet: 'Milestones' as const },
    { done: db.Allocations.some((x) => x.project_id === p.id), label: L('تخصیص نفرات', 'People allocated'), sheet: 'Allocations' as const },
  ]
  const left = steps.filter((x) => !x.done)
  if (!left.length) return null
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-4 border-warn/30 bg-warn/[0.05] p-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{L('اطلاعات پروژه کامل نیست', 'This project isn’t set up yet')}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {steps.map((x) => (
            <span key={x.label} className={cx('chip', x.done ? 'bg-good/10 text-good' : 'bg-surface text-ink ring-1 ring-line-strong')}>
              {x.done ? '✓' : '○'} {x.label}
            </span>
          ))}
        </div>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {(!p.owner || !p.client || !p.start_date || !p.end_date) && (
            <button className="btn-primary btn-sm" onClick={() => open('Projects', p as never)}>
              {L('تکمیل مشخصات', 'Complete details')}
            </button>
          )}
          {left.some((x) => x.sheet === 'Milestones') && (
            <button className="btn-outline btn-sm" onClick={() => open('Milestones', { project_id: p.id })}>
              + {L('مایلستون', 'Milestone')}
            </button>
          )}
          {left.some((x) => x.sheet === 'Allocations') && (
            <button className="btn-outline btn-sm" onClick={() => open('Allocations', { project_id: p.id })}>
              + {L('تخصیص', 'Allocate')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** An archived project: who led it and when it was archived, with the way back. */
function ArchivedProject({ p }: { p: Project }) {
  return (
    <>
      <Band
        eyebrow={
          <Link to="/projects" className="flex items-center gap-1 hover:text-white">
            <ArrowRight size={12} className="ltr:rotate-180" /> {L('پروژه‌ها', 'Projects')}
          </Link>
        }
        title={p.name}
        sub={L(`این پروژه از ${fmtDate(p.archived_at || '')} آرشیو است؛ تسک‌ها و برنامه‌اش تا خروج از آرشیو پنهان‌اند.`, `Archived since ${fmtDate(p.archived_at || '')}; its tasks and plan stay hidden until it is restored.`)}
        actions={<ArchiveButton p={p} dark />}
      />
      <Overlap>
        <Card>
          <div className="flex items-center gap-3 text-sm text-sub">
            <Archive size={18} /> {L('مدیر محصول پروژه', 'Lead')}: <b className="text-ink">{p.owner || '—'}</b> · <span dir="ltr">{p.code}</span> · {lbl(PROJECT_STATUS, p.status)}
          </div>
        </Card>
      </Overlap>
    </>
  )
}
