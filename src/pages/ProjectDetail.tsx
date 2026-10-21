import { isAssignee } from '../lib/assignees'
import { closed } from '../lib/columns'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Pencil, Plus, Target, Send, User, Pause, TrendingDown, TrendingUp, Minus, Infinity as Always, CalendarRange } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor, type EditableSheet } from '../components/Editor'
import { Band, Card, Empty, HealthBadge, Overlap, Progress, StatStrip, Tabs, cx, healthText, Avatar, Chip, Segmented, Popover, HealthDot } from '../components/ui'
import { isProduct, kpiOff, projectMetrics, riskScore } from '../lib/metrics'
import { fa, fmtDate, relDays, timeAgo } from '../lib/jalali'
import { PROJECT_STATUS, RISK_STATUS, RISK_TYPE, PRIORITY, JOB_TITLE } from '../lib/labels'
import { L, lbl, tr } from '../lib/i18n'
import { TaskRow, FollowUpRow, PinButton } from '../components/shared'
import { PauseButton } from '../components/PauseButton'
import { ArchiveButton } from '../components/ArchiveButton'
import { ProjectLinks } from '../components/ProjectLinks'
import type { Kpi, Project } from '../lib/types'
import { Archive } from 'lucide-react'
import { Attachments } from '../components/Files'
import { Kanban, RiskMatrix, UpdateCard, riskTone, ActivityFeed, HealthTrend } from '../components/widgets'
import { buildActivity } from '../lib/activity'
import { renderMentions, stampToDate } from '../components/ItemSheet'
import { uid } from '../lib/api'
import { todayISO } from '../lib/jalali'
import { useComposer } from '../components/UpdateComposer'
import { capOf } from '../lib/capacity'
import { teamName } from '../components/TeamParts'
import { CONF, elapsed, fmtVal, krConfidence, krProgress, krWork, quarterLabel, quarterOf } from '../lib/okr'
import { allocsIn } from './Resources'
import { nowStamp } from '../lib/taskstamp'

type Tab = 'overview' | 'tasks' | 'okr' | 'kpis' | 'resources' | 'risks' | 'updates'

export default function ProjectDetail() {
  const { id } = useParams()
  const { db, archived, canEdit, upsert, me } = useStore()
  const { open } = useEditor()
  const [tab, setTab] = useState<Tab>('overview')
  const { openComposer } = useComposer()
  const [taskView, setTaskView] = useState<'board' | 'list'>('board')
  const [note, setNote] = useState('')
  const p = db.Projects.find((x) => x.id === id)
  const gone = archived.find((x) => x.id === id)
  if (gone) return <ArchivedProject p={gone} />
  if (!p) return <Empty text={L('محصول یا پروژه پیدا نشد', 'Product or project not found')} />

  const product = isProduct(p)
  const q = quarterOf()
  const m = projectMetrics(p, db)
  const tasks = db.Tasks.filter((t) => t.project_id === p.id)
  const risks = db.Risks.filter((r) => r.project_id === p.id).sort((a, b) => riskScore(b) - riskScore(a))
  const updates = db.Updates.filter((u) => u.project_id === p.id).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))
  const fus = db.FollowUps.filter((f) => f.project_id === p.id && f.status !== 'done')
  const allocs = allocsIn(db, q).filter((a) => a.project_id === p.id)
  const fte = Math.round(allocs.reduce((s, a) => s + (Number(a.percent) || 0), 0) / 10) / 10
  const kpis = db.Kpis.filter((k) => k.project_id === p.id)
  const krs = db.KeyResults.filter((k) => k.project_id === p.id)
  const krsNow = krs.filter((k) => db.Objectives.some((o) => o.id === k.objective_id && o.quarter === q))
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
            <Link to="/teams" className="flex items-center gap-1 hover:text-white">
              <ArrowRight size={12} className="ltr:rotate-180" /> {teamName(p.team || '')}
            </Link>
            <span className="opacity-40">/</span>
            <span className="flex items-center gap-1">{product ? <><Always size={12} /> {L('محصول همیشگی', 'Always-on product')}</> : <><CalendarRange size={12} /> {L('پروژه', 'Project')}</>}</span>
            <span className="opacity-40">/</span>
            <span>{lbl(PROJECT_STATUS, p.status)}</span>
          </>
        }
        title={p.name}
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
            <User size={14} /> {L('مدیر محصول', 'PM')}: <span className="text-white">{p.owner || '—'}</span>
          </span>
          {!product && (
            <span className="num">
              {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
            </span>
          )}
        </div>
        <div className="-mt-3 mb-6">
          <ProjectLinks p={p} dark />
        </div>
        <StatStrip
          items={[
            { label: L('سلامت', 'Health'), value: fa(m.score), tone: m.health, sub: L('از ۱۰۰', 'of 100') },
            product
              ? { label: L(`OKR ${quarterLabel(q)}`, `OKRs ${quarterLabel(q)}`), value: krsNow.length ? `${fa(m.progress)}٪` : '—', sub: L(`${fa(krsNow.length)} نتیجه‌ی کلیدی`, `${krsNow.length} key results`) }
              : { label: L('پیشرفت', 'Progress'), value: `${fa(m.progress)}٪`, tone: m.health, sub: L(`${fa(m.elapsed)}٪ از زمان`, `${m.elapsed}% of time`) },
            product
              ? { label: L('شاخص‌ها در هدف', 'KPIs on target'), value: kpis.length ? `${fa(kpis.filter((k) => !kpiOff(k)).length)}/${fa(kpis.length)}` : '—', tone: kpis.some(kpiOff) ? 'amber' : undefined }
              : { label: m.daysLeft >= 0 ? L('تا ددلاین', 'To deadline') : L('از ددلاین گذشته', 'Past deadline'), value: p.end_date ? fa(Math.abs(m.daysLeft)) : '—', tone: m.daysLeft < 0 ? 'red' : undefined, sub: L('روز', 'days') },
            { label: L('تسک باز', 'Open tasks'), value: fa(m.openTasks), sub: L(`${fa(m.overdueTasks)} معوق · ${fa(m.blockedTasks)} مسدود`, `${m.overdueTasks} overdue · ${m.blockedTasks} blocked`) },
            { label: L('ریسک‌های باز', 'Open risks'), value: fa(m.openRisks), tone: m.highRisks ? 'red' : undefined, sub: L(`${fa(m.highRisks)} بحرانی`, `${m.highRisks} critical`) },
            { label: L('نیرو در این فصل', 'People this quarter'), value: fa(fte), sub: L('نفر تمام‌وقت', 'FTE'), tone: allocs.length ? undefined : 'amber' },
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
                { value: 'okr', label: 'OKR', count: krsNow.length },
                { value: 'kpis', label: L('شاخص‌ها (KPI)', 'KPIs'), count: kpis.length },
                { value: 'resources', label: L('منابع', 'Resources'), count: allocs.length },
                { value: 'risks', label: L('ریسک‌ها', 'Risks'), count: m.openRisks },
                { value: 'updates', label: L('گزارش وضعیت', 'Status reports'), count: updates.length },
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
                <ul className="space-y-2">
                  {m.reasons.map((r) => (
                    <li key={r.text} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5"><HealthDot h={r.level} /></span> {r.text}
                    </li>
                  ))}
                </ul>
                {!product && (
                  <div className="mt-5">
                    <div className="mb-1.5 flex justify-between text-[0.6875rem] text-sub">
                      <span>{L('پیشرفت', 'Progress')} {fa(`${m.progress}%`)}</span>
                      <span>{L(`${fa(m.elapsed)}٪ از زمان گذشته`, `${m.elapsed}% of time used`)}</span>
                    </div>
                    <Progress value={m.progress} h={m.health} marker={m.elapsed} className="h-2" />
                  </div>
                )}
              </Card>
              <Card eyebrow={L('شاخص‌ها', 'KPIs')} title={L('وضعیت شاخص‌های محصول', 'Product KPIs')} action={<AddBtn sheet="Kpis" label={L('شاخص', 'KPI')} />}>
                {kpis.length ? <div className="space-y-1">{kpis.map((k) => <KpiRow key={k.id} k={k} compact />)}</div> : <Empty text={L('شاخصی تعریف نشده', 'No KPIs yet')} />}
              </Card>
              <Card eyebrow={`OKR · ${quarterLabel(q)}`} title={L('نتایج کلیدی مرتبط', 'Related key results')} action={<Link to="/okr" className="text-xs text-sub hover:text-ink">{L('همه‌ی OKRها', 'All OKRs')}</Link>}>
                {krsNow.length ? <div className="space-y-3">{krsNow.map((k) => <KrMini key={k.id} id={k.id} />)}</div> : <Empty text={L('این فصل نتیجه‌ی کلیدی‌ای به این محصول وصل نیست', 'No key results linked this quarter')} />}
              </Card>
              <div className="min-w-0 @xl:col-span-2">
                {updates[0] ? (
                  <>
                    <div className="eyebrow mb-2 px-1">{L('آخرین گزارش وضعیت', 'Latest status report')}</div>
                    <UpdateCard u={updates[0]} />
                  </>
                ) : (
                  <Card>
                    <Empty text={L('هنوز گزارش وضعیتی ثبت نشده', 'No status reports yet')} action={canEdit ? <button className="btn-outline btn-sm" onClick={() => openComposer({ projectId: p.id })}><Plus size={14} /> {L('گزارش هفتگی', 'Weekly report')}</button> : undefined} />
                  </Card>
                )}
              </div>
              <Card pad={false} eyebrow={L('دنبال کردن', 'Chasing')} title={L('پیگیری‌های باز', 'Open follow-ups')} action={<AddBtn sheet="FollowUps" label={L('پیگیری', 'Follow-up')} />}>
                <div className="px-2 pb-2">{fus.length ? fus.map((f) => <FollowUpRow key={f.id} f={f} compact />) : <Empty />}</div>
              </Card>
              <Card eyebrow={L('یادداشت‌ها', 'Notes')} title={L('گفتگو', 'Discussion')}>
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
              <Card className="@xl:col-span-2" eyebrow={L('فعالیت', 'Activity')} title={L('آنچه اخیراً گذشت', 'What happened recently')}>
                <ActivityFeed items={buildActivity(db, p.id, 10)} showProject={false} />
              </Card>
              <Card eyebrow={L('مشخصات', 'Key facts')} title={L('در یک نگاه', 'At a glance')}>
                <dl className="space-y-3 text-sm">
                  {[
                    [L('تیم', 'Team'), teamName(p.team || '')],
                    [L('نوع', 'Kind'), product ? L('محصول همیشگی', 'Always-on product') : L('پروژه', 'Project')],
                    [L('اولویت', 'Priority'), lbl(PRIORITY, p.priority)],
                    ...(product ? [] : [[L('شروع', 'Start'), fmtDate(p.start_date, 'long')], [L('ددلاین', 'Deadline'), `${fmtDate(p.end_date, 'long')} · ${relDays(p.end_date)}`]]),
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                      <dt className="shrink-0 text-sub">{k}</dt>
                      <dd className="text-end font-medium num">{v || '—'}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                  <span className="text-xs text-sub">{L('روند گزارش‌های وضعیت', 'Status report trend')}</span>
                  <HealthTrend projectId={p.id} n={6} />
                </div>
              </Card>
              <Card className="@xl:col-span-3" eyebrow={L('فایل‌ها', 'Files')} title={L('اسناد', 'Documents')}>
                <Attachments entity="Projects" id={p.id} />
              </Card>
            </div>
          )}

          {tab === 'tasks' && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <Segmented value={taskView} onChange={setTaskView} options={[{ value: 'board', label: L('بورد', 'Board') }, { value: 'list', label: L('لیست', 'List') }]} />
                <AddBtn sheet="Tasks" label={L('تسک', 'Task')} />
              </div>
              {taskView === 'board' ? (
                <Kanban tasks={tasks} defaults={{ project_id: p.id }} showProject={false} />
              ) : (
                <Card pad={false}>
                  <div className="p-2">{tasks.length ? tasks.map((t) => <TaskRow key={t.id} t={t} showProject={false} />) : <Empty />}</div>
                </Card>
              )}
            </>
          )}

          {tab === 'okr' && (
            <Card eyebrow="OKR" title={L('نتایج کلیدی مرتبط با این محصول', 'Key results about this product')} action={<Link to="/okr" className="btn-outline btn-sm">{L('صفحه‌ی OKR', 'OKR page')}</Link>}>
              {krs.length ? (
                <div className="space-y-4">
                  {[...new Set(krs.map((k) => db.Objectives.find((o) => o.id === k.objective_id)?.quarter || ''))].sort().reverse().map((qq) => (
                    <div key={qq}>
                      <div className="eyebrow mb-2">{quarterLabel(qq)}</div>
                      <div className="space-y-3">{krs.filter((k) => (db.Objectives.find((o) => o.id === k.objective_id)?.quarter || '') === qq).map((k) => <KrMini key={k.id} id={k.id} />)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text={L('هنوز نتیجه‌ی کلیدی‌ای به این محصول وصل نشده؛ در صفحه‌ی OKR هنگام تعریف نتیجه‌ی کلیدی، محصول را انتخاب کنید.', 'No key results linked yet; pick this product when defining a key result on the OKR page.')} />
              )}
            </Card>
          )}

          {tab === 'kpis' && (
            <Card eyebrow={L('شاخص‌ها', 'KPIs')} title={L('شاخص‌های همیشگی محصول', 'The product’s ongoing metrics')} action={<AddBtn sheet="Kpis" label={L('شاخص جدید', 'New KPI')} />}>
              {kpis.length ? <div className="divide-y divide-line">{kpis.map((k) => <KpiRow key={k.id} k={k} />)}</div> : <Empty text={L('مثلاً «کاربر فعال هفتگی»، «نرخ تبدیل»، «تیکت پشتیبانی باز»', 'e.g. “Weekly active users”, “Conversion”, “Open support tickets”')} />}
            </Card>
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

          {tab === 'updates' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                {canEdit && (
                  <button className="btn-primary btn-sm" onClick={() => openComposer({ projectId: p.id })}>
                    <Plus size={14} /> {L('ثبت گزارش هفتگی', 'Submit weekly report')}
                  </button>
                )}
              </div>
              {updates.length ? (
                updates.map((u) => <UpdateCard key={u.id} u={u} />)
              ) : (
                <Card>
                  <Empty text={L('هنوز گزارشی ثبت نشده', 'No reports yet')} />
                </Card>
              )}
            </div>
          )}

          {tab === 'resources' && (
            <Card eyebrow={quarterLabel(q)} title={L('نیروها و سهم وقتشان', 'People and their share of time')} action={<span className="flex items-center gap-2"><Link to="/resources" className="text-xs text-sub hover:text-ink">{L('همه‌ی محصولات', 'All products')}</Link><AddBtn sheet="Allocations" label={L('تخصیص', 'Allocate')} extra={{ quarter: q }} /></span>}>
              <div className="grid gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
                {allocs.map((a) => {
                  const mem = db.Team.find((x) => x.id === a.member_id)
                  if (!mem) return null
                  const total = allocsIn(db, q).filter((x) => x.member_id === mem.id).reduce((s, x) => s + (Number(x.percent) || 0), 0)
                  const memTasks = tasks.filter((t) => isAssignee(t, mem.name) && !closed(t)).length
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
                        {total > capOf(mem) && <div className="mt-1 text-[0.6875rem] text-bad">{L(`جمع تخصیص این فرد ${fa(total)}٪ — بیش از ظرفیت`, `This person is at ${total}% — over capacity`)}</div>}
                      </div>
                    </button>
                  )
                })}
                {!allocs.length && <Empty text={L('برای این فصل نیرویی تخصیص داده نشده', 'Nobody allocated this quarter')} />}
              </div>
              {(() => {
                const extra = [...new Set(tasks.filter((t) => !closed(t)).flatMap((t) => t.assignee.split(',').map((x) => x.trim()).filter(Boolean)))].filter((n) => !allocs.some((a) => db.Team.find((x) => x.id === a.member_id)?.name === n))
                return extra.length ? <div className="mt-4 rounded-2xl bg-warn/[0.07] px-4 py-3 text-xs text-ink">{L(`تسک باز دارند ولی تخصیصی ندارند: ${extra.join('، ')}`, `Have open tasks but no allocation: ${extra.join(', ')}`)}</div> : null
              })()}
            </Card>
          )}
        </div>
      </Overlap>
    </>
  )
}

/** A KPI: latest value against target, its direction since the previous value, and a quick update. */
function KpiRow({ k, compact }: { k: Kpi; compact?: boolean }) {
  const { canEdit, upsert, toast } = useStore()
  const { open } = useEditor()
  const off = kpiOff(k)
  const cur = k.current === '' ? null : Number(k.current)
  const prev = k.previous === '' || k.previous === undefined ? null : Number(k.previous)
  const better = cur !== null && prev !== null && cur !== prev ? (k.direction === 'down' ? cur < prev : cur > prev) : null
  const Trend = cur === null || prev === null || cur === prev ? Minus : cur > prev ? TrendingUp : TrendingDown
  const [v, setV] = useState('')
  const unit = k.unit ? ` ${k.unit}` : ''
  return (
    <div className={cx('flex items-center gap-3', compact ? 'py-1.5' : 'py-3')}>
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', better === null ? 'bg-muted text-sub' : better ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad')}><Trend size={15} /></span>
      <div className="min-w-0 flex-1">
        <button className="truncate text-start text-sm hover:underline" onClick={() => canEdit && open('Kpis', k as never)}>{k.name}</button>
        {!compact && <div className="text-[0.6875rem] text-sub">{k.updated_at ? L(`به‌روزرسانی ${timeAgo(stampToDate(k.updated_at))}`, `updated ${timeAgo(stampToDate(k.updated_at))}`) : L('هنوز مقداری ثبت نشده', 'No value yet')}{prev !== null && L(` · قبلی ${fa(prev)}${unit}`, ` · previous ${prev}${unit}`)}</div>}
      </div>
      <div className="text-end">
        <div className={cx('text-sm font-semibold num', off && 'text-bad')}>{cur === null ? '—' : `${fa(cur)}${unit}`}</div>
        {k.target !== '' && <div className="text-[0.6875rem] text-sub num">{L('هدف', 'target')} {fa(Number(k.target))}{unit}</div>}
      </div>
      {canEdit && !compact && (
        <Popover width={220} align="end" trigger={({ toggle }) => <button className="btn-outline btn-sm" onClick={toggle}>{L('مقدار جدید', 'New value')}</button>}>
          {(close) => (
            <div className="space-y-2 p-3">
              <input dir="ltr" inputMode="decimal" autoFocus className="input h-9 w-full text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={cur === null ? '' : String(cur)} />
              <button
                className="btn-primary btn-sm w-full"
                onClick={async () => {
                  const n = Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
                  if (!v.trim() || !Number.isFinite(n)) return
                  await upsert('Kpis', { ...k, previous: k.current, current: n, updated_at: nowStamp() })
                  toast(L('شاخص به‌روز شد', 'KPI updated'))
                  setV('')
                  close()
                }}
              >
                {L('ثبت', 'Save')}
              </button>
            </div>
          )}
        </Popover>
      )}
    </div>
  )
}

/** A key result in one line: progress against the quarter, confidence, its work. */
function KrMini({ id }: { id: string }) {
  const { db } = useStore()
  const k = db.KeyResults.find((x) => x.id === id)
  const o = k && db.Objectives.find((x) => x.id === k.objective_id)
  if (!k || !o) return null
  const c = krConfidence(k, o.quarter)
  const w = krWork(db, k.id)
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">{k.title}</span>
        <span className={cx('shrink-0 text-xs', CONF[c].tone)}>{tr(CONF[c].label)}</span>
      </div>
      <Progress value={krProgress(k)} marker={elapsed(o.quarter)} h={c === 'on_track' ? 'green' : c === 'at_risk' ? 'amber' : 'red'} className="mt-1.5" />
      <div className="mt-1 flex justify-between text-[0.6875rem] text-sub">
        <span>{teamName(o.team)} · {o.title}</span>
        <Link to={`/tasks?v=all&kr=${k.id}`} className="hover:text-ink num">{k.kind === 'done' ? fmtVal(k, k.current) : L(`${fmtVal(k, k.current)} از ${fmtVal(k, k.target)}`, `${fmtVal(k, k.current)} / ${fmtVal(k, k.target)}`)} · {L(`${fa(w.open)} کار باز`, `${w.open} open`)}</Link>
      </div>
    </div>
  )
}

/** A new project starts empty: say what's missing instead of pretending it's healthy. */
function SetupPrompt({ p }: { p: Project }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const product = isProduct(p)
  const steps = [
    { done: !!p.owner, label: L('مدیر محصول', 'Product manager') },
    { done: !!p.team, label: L('تیم', 'Team') },
    ...(product ? [{ done: db.Kpis.some((x) => x.project_id === p.id), label: L('شاخص‌ها (KPI)', 'KPIs'), sheet: 'Kpis' as const }] : [{ done: !!(p.start_date && p.end_date), label: L('تاریخ شروع و ددلاین', 'Start date & deadline') }]),
    { done: allocsIn(db, quarterOf()).some((x) => x.project_id === p.id), label: L('نیروی این فصل', 'People this quarter'), sheet: 'Allocations' as const },
  ]
  const left = steps.filter((x) => !x.done)
  if (!left.length) return null
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-4 border-warn/30 bg-warn/[0.05] p-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{L('اطلاعات کامل نیست', 'Not set up yet')}</div>
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
          {(!p.owner || !p.team || (!product && (!p.start_date || !p.end_date))) && (
            <button className="btn-primary btn-sm" onClick={() => open('Projects', p as never)}>
              {L('تکمیل مشخصات', 'Complete details')}
            </button>
          )}
          {left.some((x) => x.sheet === 'Kpis') && (
            <button className="btn-outline btn-sm" onClick={() => open('Kpis', { project_id: p.id })}>
              + {L('شاخص', 'KPI')}
            </button>
          )}
          {left.some((x) => x.sheet === 'Allocations') && (
            <button className="btn-outline btn-sm" onClick={() => open('Allocations', { project_id: p.id, quarter: quarterOf() })}>
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
          <Link to="/teams" className="flex items-center gap-1 hover:text-white">
            <ArrowRight size={12} className="ltr:rotate-180" /> {L('تیم‌ها و محصولات', 'Teams & products')}
          </Link>
        }
        title={p.name}
        sub={L(`این پروژه از ${fmtDate(p.archived_at || '')} آرشیو است؛ تسک‌ها و برنامه‌اش تا خروج از آرشیو پنهان‌اند.`, `Archived since ${fmtDate(p.archived_at || '')}; its tasks and plan stay hidden until it is restored.`)}
        actions={<ArchiveButton p={p} dark />}
      />
      <Overlap>
        <Card>
          <div className="flex items-center gap-3 text-sm text-sub">
            <Archive size={18} /> {L('مدیر محصول', 'PM')}: <b className="text-ink">{p.owner || '—'}</b> · {teamName(p.team || '')} · {lbl(PROJECT_STATUS, p.status)}
          </div>
        </Card>
      </Overlap>
    </>
  )
}
