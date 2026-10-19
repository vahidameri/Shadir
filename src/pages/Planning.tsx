import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck2, Check, ChevronDown, ExternalLink, ListPlus, Pencil, Plus, Target, Video, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { useAuto } from '../lib/automations'
import { HubNav } from '../components/HubNav'
import { Checklist } from '../components/ItemSheet'
import { Band, Card, Chip, Empty, MenuItem, Overlap, Popover, Progress, Segmented, Sheet, TaskStatusBadge, cx } from '../components/ui'
import { L, lbl, locale, tr } from '../lib/i18n'
import { fa, fmtDate, fmtWeekday, relDays, todayISO } from '../lib/jalali'
import { DELIVERABLE_STATUS, MILESTONE_STATUS, PLAN_PURPOSE } from '../lib/labels'
import { PREP, READY_PURPOSES, isPlanning, isReady, itemsOf, purposeOf, readiness, refsOf, type PlanItem } from '../lib/planning'
import type { Meeting } from '../lib/types'

const byWhen = (a: Meeting, b: Meeting) => (a.date + a.time < b.date + b.time ? -1 : 1)
const tone = (pct: number) => (pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red') as 'green' | 'amber' | 'red'
const prepFor = (purpose: string) => (PREP[purpose] || []).map(([f, e]) => `[ ] ${locale.lang === 'fa' ? f : e}`).join('\n')

/** What the items section is called for each purpose. */
const COVERS: Record<string, [string, string]> = {
  demo: ['چه چیزی نمایش داده می‌شود', 'What we’ll show'],
  roadmap: ['چه چیزی در رودمپ قرار می‌گیرد', 'What goes on the roadmap'],
  sprint: ['چه چیزی وارد اسپرینت می‌شود', 'What goes into the sprint'],
  release: ['چه چیزی منتشر و تحویل می‌شود', 'What ships'],
}

/** Planning sessions — for a demo, closing the roadmap, a sprint, a release… — and how ready each is. */
export default function Planning() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [purpose, setPurpose] = useState('all')
  const [sel, setSel] = useState('')
  const today = todayISO()
  const purposes = Object.keys(PLAN_PURPOSE)
  const all = db.Meetings.filter(isPlanning).filter((m) => purpose === 'all' || purposeOf(m) === purpose)
  const upcoming = all.filter((m) => m.status === 'scheduled' && m.date >= today).sort(byWhen)
  const past = all.filter((m) => !(m.status === 'scheduled' && m.date >= today)).sort(byWhen).reverse().slice(0, 12)
  const selected = db.Meetings.find((m) => m.id === sel)

  const plan = (p: string) =>
    open('Meetings', { series: 'planning', purpose: p, title: lbl(PLAN_PURPOSE, p), duration: p === 'roadmap' ? 90 : 60, checklist: prepFor(p) })

  const newButton = (light: boolean) => (
    <Popover align="end" width={240} trigger={({ toggle }) => (
      <button className={cx('btn h-10', light ? 'bg-white text-band' : 'btn-primary')} onClick={toggle}>
        <Plus size={16} /> {L('برنامه‌ریزی جدید', 'New planning')} <ChevronDown size={14} />
      </button>
    )}>
      {(close) => (
        <div className="py-1">
          <div className="px-3 pb-1 pt-2 text-[0.6875rem] text-sub">{L('برنامه‌ریزی برای…', 'Planning for…')}</div>
          {purposes.map((p) => <MenuItem key={p} icon={<Target size={14} />} onClick={() => (close(), plan(p))}>{lbl(PLAN_PURPOSE, p)}</MenuItem>)}
        </div>
      )}
    </Popover>
  )

  return (
    <>
      <Band nav={<HubNav hub="plan" />}
        title={L('جلسات برنامه‌ریزی', 'Planning sessions')}
        sub={L('برای دمو، بستن رودمپ، اسپرینت یا انتشار: چه چیزی پوشش داده می‌شود، چقدر آماده است و چه تصمیمی گرفته شد. هر جلسه خودش در تقویم گوگل ثبت می‌شود.', 'For a demo, the roadmap, a sprint or a release: what it covers, how ready it is and what was decided. Each session goes on Google Calendar by itself.')}
        actions={canEdit && newButton(true)}
      >
        <Segmented dark value={purpose} onChange={setPurpose} options={[{ value: 'all', label: L('همه', 'All') }, ...purposes.map((p) => ({ value: p, label: lbl(PLAN_PURPOSE, p) }))]} />
      </Band>
      <Overlap className="space-y-4">
        <Card eyebrow={L('پیش رو', 'Coming up')} title={L(`${fa(upcoming.length)} جلسه`, `${upcoming.length} sessions`)}>
          {upcoming.length ? (
            <div className="grid gap-3 @md:grid-cols-2 @xl:grid-cols-3">{upcoming.map((m) => <SessionCard key={m.id} m={m} onOpen={() => setSel(m.id)} />)}</div>
          ) : (
            <Empty icon={<Target size={20} />} text={L('جلسه‌ی برنامه‌ریزی‌ای پیش رو نیست', 'No planning session coming up')} action={canEdit && newButton(false)} />
          )}
        </Card>
        {past.length > 0 && (
          <Card eyebrow={L('گذشته', 'Past')} title={L('جلسه‌های قبلی و تصمیم‌ها', 'Earlier sessions & decisions')}>
            <div className="grid gap-3 @md:grid-cols-2 @xl:grid-cols-3">{past.map((m) => <SessionCard key={m.id} m={m} onOpen={() => setSel(m.id)} />)}</div>
          </Card>
        )}
      </Overlap>
      <Sheet open={!!selected} onClose={() => setSel('')} wide header={selected && <h2 className="truncate font-semibold">{selected.title}</h2>}>
        {selected && <Planner m={selected} />}
      </Sheet>
    </>
  )
}

function SessionCard({ m, onOpen }: { m: Meeting; onOpen: () => void }) {
  const { db } = useStore()
  const r = readiness(m, db)
  const p = purposeOf(m)
  const project = db.Projects.find((x) => x.id === m.project_id)
  const decisions = String(m.decisions || '').split('\n').filter((l) => l.trim()).length
  return (
    <button onClick={onOpen} className={cx('card card-hover p-5 text-start', m.status === 'cancelled' && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <Chip className="bg-brand/10 text-brand dark:text-brand-soft">{lbl(PLAN_PURPOSE, p)}</Chip>
        <span className="text-xs text-sub">{m.status === 'cancelled' ? L('لغو شد', 'Cancelled') : relDays(m.date)}</span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold">{m.title}</div>
      <div className="mt-0.5 truncate text-xs text-sub">
        {project ? project.name + ' · ' : ''}{fmtWeekday(m.date)} {fmtDate(m.date)}{m.time ? ` · ${fa(m.time)}` : ''}
      </div>
      {READY_PURPOSES.includes(p) ? (
        <>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-sub">{r.total ? L(`${fa(r.ready)} از ${fa(r.total)} مورد آماده`, `${r.ready} of ${r.total} ready`) : L('هنوز موردی انتخاب نشده', 'Nothing picked yet')}</span>
            {r.total > 0 && <span className="num font-semibold">{fa(r.pct)}٪</span>}
          </div>
          <Progress className="mt-1.5" value={r.pct} h={tone(r.pct)} />
        </>
      ) : (
        <div className="mt-4 text-xs text-sub">{r.total ? L(`${fa(r.total)} مورد در دستور جلسه`, `${r.total} items on the agenda`) : L('دستور جلسه هنوز خالی است', 'Agenda still empty')}</div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.6875rem] text-sub">
        {r.prep > 0 && <span className="flex items-center gap-1"><Check size={12} /> {L(`آمادگی ${fa(r.prepDone)}/${fa(r.prep)}`, `Prep ${r.prepDone}/${r.prep}`)}</span>}
        {decisions > 0 && <span>{L(`${fa(decisions)} تصمیم`, `${decisions} decisions`)}</span>}
        {m.gcal_id && <span className="flex items-center gap-1 text-good"><CalendarCheck2 size={12} /> {L('در تقویم', 'On calendar')}</span>}
      </div>
    </button>
  )
}

type Pick = 'T' | 'D' | 'M'

function Planner({ m }: { m: Meeting }) {
  const { db, upsert, canEdit } = useStore()
  const { open } = useEditor()
  const auto = useAuto()
  const p = purposeOf(m)
  const r = readiness(m, db)
  const refs = refsOf(m)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick>(p === 'roadmap' ? 'M' : p === 'release' ? 'D' : 'T')
  const project = db.Projects.find((x) => x.id === m.project_id)
  const sprints = db.Sprints.filter((s) => !m.project_id || s.project_id === m.project_id)
  const sprint = db.Sprints.find((s) => s.id === m.sprint_id)

  const save = async (patch: Partial<Meeting>) => {
    const next = { ...m, ...patch }
    await upsert('Meetings', next)
    // the agenda goes into the calendar invitation too
    if ('items' in patch) auto.meetingSaved(next, m)
  }
  const setRefs = (list: string[]) => save({ items: list.join(',') })

  // suggestions from the session's project (and sprint): finished work first for a demo
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hit = (title: string) => !needle || title.toLowerCase().includes(needle)
    const inProject = (pid: string) => !m.project_id || pid === m.project_id
    if (pick === 'D')
      return db.Deliverables.filter((d) => inProject(d.project_id) && d.status !== 'dropped' && !refs.includes(`D:${d.id}`) && hit(d.title))
        .sort((a, b) => (a.target_date < b.target_date ? -1 : 1)).slice(0, 10).map((d) => ({ ref: `D:${d.id}`, title: d.title }))
    if (pick === 'M')
      return db.Milestones.filter((x) => inProject(x.project_id) && !refs.includes(`M:${x.id}`) && hit(x.title))
        .sort((a, b) => (a.planned_date < b.planned_date ? -1 : 1)).slice(0, 10).map((x) => ({ ref: `M:${x.id}`, title: x.title }))
    const ready = (s: string) => Number(s === 'done' || s === 'review')
    return db.Tasks.filter((t) => inProject(t.project_id) && (!m.sprint_id || t.sprint_id === m.sprint_id) && !refs.includes(`T:${t.id}`) && hit(t.title))
      .sort((a, b) => (p === 'demo' ? ready(b.status) - ready(a.status) : ready(a.status) - ready(b.status)))
      .slice(0, 10).map((t) => ({ ref: `T:${t.id}`, title: t.title }))
  }, [db, m.project_id, m.sprint_id, q, refs, pick, p])

  const items = itemsOf(m, db)
  const showReady = READY_PURPOSES.includes(p)
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{fmtWeekday(m.date)} {fmtDate(m.date, 'long')}{m.time ? ` · ${fa(m.time)}` : ''}</span>
        {project && <Link to={`/projects/${project.id}`} className="text-brand hover:underline">{project.name}</Link>}
        {m.meet_url && <a href={m.meet_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand hover:underline"><Video size={14} /> Meet</a>}
        {m.gcal_id
          ? <span className="flex items-center gap-1 text-xs text-good"><CalendarCheck2 size={14} /> {L('در تقویم گوگل ثبت شده', 'On Google Calendar')}</span>
          : <span className="text-xs text-sub">{L('هنوز در تقویم نیست', 'Not on the calendar yet')}</span>}
        {canEdit && <button className="btn btn-ghost ms-auto h-8" onClick={() => open('Meetings', m as never)}><Pencil size={14} /> {L('ویرایش جلسه', 'Edit session')}</button>}
      </div>

      {canEdit && (
        <div className="grid gap-3 @md:grid-cols-2">
          <label className="block">
            <span className="label">{L('برنامه‌ریزی برای', 'Planning for')}</span>
            <select className="input h-9" value={p} onChange={(e) => save({ purpose: e.target.value, series: 'planning' })}>
              {Object.keys(PLAN_PURPOSE).map((x) => <option key={x} value={x}>{lbl(PLAN_PURPOSE, x)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{L('اسپرینت', 'Sprint')}</span>
            <select className="input h-9" value={m.sprint_id || ''} onChange={(e) => save({ sprint_id: e.target.value })}>
              <option value="">{L('— بدون اسپرینت —', '— No sprint —')}</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {sprint?.goal && <div className="text-xs text-sub @md:col-span-2">{L('هدف اسپرینت: ', 'Sprint goal: ')}{sprint.goal}</div>}
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="eyebrow">{tr(COVERS[p] || ['دستور جلسه', 'Agenda'])}</h3>
          {r.total > 0 && <span className="text-xs text-sub">{showReady ? L(`${fa(r.ready)} از ${fa(r.total)} آماده · ${fa(r.pct)}٪`, `${r.ready}/${r.total} ready · ${r.pct}%`) : L(`${fa(r.total)} مورد`, `${r.total} items`)}</span>}
        </div>
        {showReady && r.total > 0 && <Progress value={r.pct} h={tone(r.pct)} className="mb-3" />}
        {items.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {items.map((i) => <ItemRow key={i.ref} i={i} onRemove={canEdit ? () => setRefs(refs.filter((x) => x !== i.ref)) : undefined} />)}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-sub">{L('تسک‌ها، خروجی‌ها یا مایلستون‌هایی را که این جلسه درباره‌شان است از پایین اضافه کنید.', 'Add the tasks, outputs or milestones this session is about from below.')}</div>
        )}
        {canEdit && (
          <div className="mt-3 rounded-2xl bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={pick} onChange={setPick} options={[
                { value: 'T', label: L('تسک', 'Tasks') },
                { value: 'D', label: L('خروجی', 'Outputs') },
                { value: 'M', label: L('مایلستون', 'Milestones') },
              ]} />
              <input className="input h-9 min-w-40 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('جستجو…', 'Search…')} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button key={c.ref} className="chip bg-surface text-ink hover:bg-brand/10" onClick={() => setRefs([...refs, c.ref])}>
                  <Plus size={11} /> <span className="max-w-[16rem] truncate">{c.title}</span>
                </button>
              ))}
              {!candidates.length && <span className="text-xs text-sub">{m.project_id ? L('مورد دیگری پیدا نشد', 'Nothing else found') : L('موردی پیدا نشد؛ برای پیشنهاد دقیق‌تر پروژه‌ی جلسه را مشخص کنید', 'Nothing found; set the session’s project for better suggestions')}</span>}
            </div>
          </div>
        )}
      </section>

      <div>
        <Checklist title={L('آمادگی جلسه', 'Preparation')} value={m.checklist || ''} onChange={(v) => save({ checklist: v })} />
        {canEdit && !String(m.checklist || '').trim() && PREP[p] && (
          <button className="btn btn-ghost mt-1 h-8 text-xs" onClick={() => save({ checklist: prepFor(p) })}><ListPlus size={14} /> {L('چک‌لیست پیشنهادی', 'Suggested checklist')}</button>
        )}
      </div>

      <section className="grid gap-4 @md:grid-cols-2">
        <TextBox label={L('تصمیم‌ها (هر خط یک تصمیم)', 'Decisions (one per line)')} value={m.decisions || ''} onSave={(decisions) => save({ decisions })}
          placeholder={p === 'roadmap' ? L('مثلاً: انتشار نسخه‌ی ۲ به خرداد رفت', 'e.g. v2 moves to June') : L('چه تصمیمی گرفته شد؟', 'What was decided?')} />
        <TextBox label={L('یادداشت و بازخورد', 'Notes & feedback')} value={m.notes || ''} onSave={(notes) => save({ notes })}
          placeholder={p === 'demo' ? L('ترتیب ارائه، سوال‌ها و بازخورد ذی‌نفعان…', 'Running order, questions, stakeholder feedback…') : L('نکته‌ها و پیگیری‌ها…', 'Notes and follow-ups…')} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {m.status === 'scheduled' && m.date <= todayISO() && canEdit && (
          <button className="btn btn-primary h-9" onClick={() => save({ status: 'held' }).then(() => auto.meetingHeld({ ...m, status: 'held' }))}>
            <Check size={14} /> {L('برگزار شد', 'Mark held')}
          </button>
        )}
        <Link to="/meetings" className="flex items-center gap-1 text-xs text-sub hover:text-ink"><ExternalLink size={12} /> {L('اکشن‌ها در صفحه‌ی جلسات', 'Actions in Meetings')}</Link>
      </div>
    </div>
  )
}

function ItemRow({ i, onRemove }: { i: PlanItem; onRemove?: () => void }) {
  const { open } = useEditor()
  const kind = i.kind === 'D' ? L('خروجی', 'Output') : i.kind === 'M' ? L('مایلستون', 'Milestone') : i.row.assignee
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <span className={cx('h-2 w-2 shrink-0 rounded-full', isReady(i) ? 'bg-good' : 'bg-warn')} />
      <span className="min-w-0 flex-1">
        <button className="block truncate text-start text-sm hover:underline" onClick={() => open(i.kind === 'T' ? 'Tasks' : i.kind === 'D' ? 'Deliverables' : 'Milestones', i.row as never)}>{i.row.title}</button>
        <span className="text-[0.6875rem] text-sub">{kind}</span>
      </span>
      {i.kind === 'T' ? <TaskStatusBadge s={i.row.status} /> : <Chip className="bg-muted text-sub">{i.kind === 'D' ? lbl(DELIVERABLE_STATUS, i.row.status) : lbl(MILESTONE_STATUS, i.row.status)}</Chip>}
      {onRemove && <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" aria-label={L('حذف', 'Remove')} onClick={onRemove}><X size={13} /></button>}
    </li>
  )
}

function TextBox({ label, value, onSave, placeholder }: { label: string; value: string; onSave: (v: string) => void; placeholder: string }) {
  const { canEdit } = useStore()
  const [v, setV] = useState(value)
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input min-h-28 py-2" value={v} disabled={!canEdit} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} placeholder={placeholder} />
    </label>
  )
}
