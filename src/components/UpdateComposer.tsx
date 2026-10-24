import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { dirOf } from '../lib/dir'
import { Sparkles, Check, CornerUpLeft, AlertTriangle, Loader } from 'lucide-react'
import type { Deliverable, Health, Update } from '../lib/types'
import { useStore } from '../lib/store'
import { uid } from '../lib/api'
import { Sheet, cx, HealthDot } from './ui'
import { L, lbl } from '../lib/i18n'
import { HEALTH } from '../lib/labels'
import { addDays, fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { projectMetrics } from '../lib/metrics'
import { isClosed, isOverdue } from '../lib/delivery'
import { inWeek, weekLabel, weekStart } from '../lib/weeks'

interface Ctx {
  openComposer: (o?: { projectId?: string; update?: Update }) => void
}
const C = createContext<Ctx | null>(null)
export const useComposer = () => useContext(C)!

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ projectId?: string; update?: Update } | null>(null)
  const openComposer = useCallback((o: { projectId?: string; update?: Update } = {}) => setState(o), [])
  return (
    <C.Provider value={{ openComposer }}>
      {children}
      {state && <Composer key={(state.update?.id || '') + (state.projectId || '')} {...state} onClose={() => setState(null)} />}
    </C.Provider>
  )
}

/** Latest update for a project, optionally before a date. */
function lastUpdate(updates: Update[], projectId: string, before?: string) {
  return updates.filter((u) => u.project_id === projectId && (!before || u.week_date < before)).sort((a, b) => (a.week_date < b.week_date ? 1 : -1))[0]
}

type Change = { status?: Deliverable['status']; push?: number }

function Composer({ projectId, update, onClose }: { projectId?: string; update?: Update; onClose: () => void }) {
  const { db, me, upsert, toast, canEdit } = useStore()
  const today = todayISO()
  const ws = weekStart()
  const mine = db.Projects.filter((p) => p.status === 'active' || p.status === 'planning')
  const initialPid = update?.project_id || projectId || mine.find((p) => p.owner === me)?.id || mine[0]?.id || ''
  const [pid, setPid] = useState(initialPid)
  const project = db.Projects.find((p) => p.id === pid)
  const m = project ? projectMetrics(project, db) : null
  const prev = project ? lastUpdate(db.Updates, project.id, update ? update.week_date : addDays(today, 1)) : undefined
  const existingThisWeek = !update && project ? db.Updates.find((u) => u.project_id === project.id && inWeek(u.week_date, ws)) : undefined
  const editing = update || existingThisWeek

  // Facts gathered since the previous report — they pre-fill the narrative.
  const facts = useMemo(() => {
    if (!project) return null
    const since = prev ? prev.week_date : addDays(today, -7)
    const tasksDone = db.Tasks.filter((t) => t.project_id === project.id && t.status === 'done' && t.completed_at && t.completed_at > since)
    const blocked = db.Tasks.filter((t) => t.project_id === project.id && t.status === 'blocked')
    const decisions = db.Risks.filter((r) => r.project_id === project.id && r.type === 'decision' && r.status !== 'closed')
    const dels = db.Deliverables.filter((d) => d.project_id === project.id)
    const deliveredRecently = dels.filter((d) => d.status === 'delivered' && d.delivered_date > since)
    const due = dels
      .filter((d) => !isClosed(d) && (isOverdue(d) || d.target_date <= addDays(ws, 13)))
      .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
    const nextUp = dels.filter((d) => !isClosed(d) && inWeek(d.target_date, addDays(ws, 7)))
    return { tasksDone, blocked, decisions, deliveredRecently, due, nextUp }
  }, [db, project, prev, today, ws])

  const prefill = () => {
    if (!facts) return { done: '', next: '', blockers: '' }
    const done = [...facts.deliveredRecently.map((d) => d.title), ...facts.tasksDone.map((t) => t.title)].slice(0, 6).join('\n')
    const next = [...facts.nextUp.map((d) => d.title), ...db.Tasks.filter((t) => t.project_id === pid && t.status === 'in_progress').map((t) => t.title)].slice(0, 5).join('\n')
    const blockers = [...facts.blocked.map((t) => t.title), ...facts.decisions.map((r) => L(`تصمیم: ${r.title}`, `Decision: ${r.title}`))].slice(0, 5).join('\n')
    return { done, next, blockers }
  }

  const seed = editing || null
  const [health, setHealth] = useState<Health>(seed?.health || m?.health || 'green')
  const [summary, setSummary] = useState(seed?.summary || '')
  const [text, setText] = useState(() => (seed ? { done: seed.done, next: seed.next, blockers: seed.blockers } : prefill()))
  const [progress, setProgress] = useState<number>(Number(project?.progress) || m?.progress || 0)
  const [changes, setChanges] = useState<Record<string, Change>>({})
  const [saving, setSaving] = useState(false)

  const switchProject = (id: string) => {
    setPid(id)
    const p = db.Projects.find((x) => x.id === id)
    const mm = p ? projectMetrics(p, db) : null
    const ex = db.Updates.find((u) => u.project_id === id && inWeek(u.week_date, ws))
    setHealth(ex?.health || mm?.health || 'green')
    setSummary(ex?.summary || '')
    setProgress(Number(p?.progress) || mm?.progress || 0)
    setChanges({})
    setTimeout(() => setText(ex ? { done: ex.done, next: ex.next, blockers: ex.blockers } : prefillFor(id)), 0)
  }
  // prefill for a project that isn't the current one yet
  const prefillFor = (id: string) => {
    const dels = db.Deliverables.filter((d) => d.project_id === id)
    const pv = lastUpdate(db.Updates, id, addDays(today, 1))
    const since = pv ? pv.week_date : addDays(today, -7)
    return {
      done: [...dels.filter((d) => d.status === 'delivered' && d.delivered_date > since).map((d) => d.title), ...db.Tasks.filter((t) => t.project_id === id && t.status === 'done' && t.completed_at > since).map((t) => t.title)].slice(0, 6).join('\n'),
      next: dels.filter((d) => !isClosed(d) && inWeek(d.target_date, addDays(ws, 7))).map((d) => d.title).slice(0, 5).join('\n'),
      blockers: db.Tasks.filter((t) => t.project_id === id && t.status === 'blocked').map((t) => t.title).join('\n'),
    }
  }

  const setChange = (id: string, c: Change) => setChanges((x) => ({ ...x, [id]: { ...x[id], ...c } }))
  const nChanges = Object.keys(changes).length + (project && progress !== (Number(project.progress) || m?.progress || 0) ? 1 : 0)

  const submit = async () => {
    if (!project || !summary.trim()) return
    setSaving(true)
    try {
      const row: Update = {
        id: editing?.id || uid('U'), project_id: project.id, week_date: editing?.week_date || today, author: editing?.author || me, health, summary: summary.trim(),
        done: text.done, next: text.next, blockers: text.blockers,
      }
      await upsert('Updates', row)
      for (const [id, c] of Object.entries(changes)) {
        const d = db.Deliverables.find((x) => x.id === id)
        if (!d) continue
        const next: Deliverable = { ...d }
        if (c.status) {
          next.status = c.status
          next.delivered_date = c.status === 'delivered' ? today : ''
        }
        if (c.push) {
          next.baseline_date = d.baseline_date || d.target_date
          next.target_date = addDays(d.target_date, c.push)
        }
        await upsert('Deliverables', next)
      }
      if (progress !== (Number(project.progress) || m?.progress || 0)) await upsert('Projects', { ...project, progress })
      toast(L(`گزارش ${project.name} ثبت شد${nChanges ? ` و ${fa(nChanges)} مورد به‌روز شد` : ''}`, `${project.name} update saved${nChanges ? `, ${nChanges} item(s) updated` : ''}`))
      onClose()
    } catch {
      setSaving(false)
    }
  }

  const healthBtn: Record<Health, string> = {
    green: 'border-good bg-good/10 text-good',
    amber: 'border-warn bg-warn/12 text-warn',
    red: 'border-bad bg-bad/10 text-bad',
  }

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div className="min-w-0">
          <div className="eyebrow">{L(`گزارش هفتگی · ${weekLabel(ws)}`, `Weekly update · ${weekLabel(ws)}`)}</div>
          <h2 className="truncate font-semibold">{editing ? L('ویرایش گزارش این هفته', 'Edit this week’s update') : L('ثبت گزارش وضعیت', 'Submit status update')}</h2>
        </div>
      }
      footer={
        canEdit ? (
          <>
            <button className="btn-primary" onClick={submit} disabled={saving || !summary.trim() || !project}>
              {saving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
              {L('ثبت گزارش', 'Submit update')}
              {nChanges > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[0.6875rem] num">+{fa(nChanges)}</span>}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              {L('انصراف', 'Cancel')}
            </button>
            {!summary.trim() && <span className="ms-auto text-[0.6875rem] text-sub">{L('خلاصه برای مدیریت لازم است', 'An executive summary is required')}</span>}
          </>
        ) : (
          <span className="text-xs text-sub">{L('دسترسی شما فقط مشاهده است.', 'You have view-only access.')}</span>
        )
      }
    >
      <div className="grid gap-0 @lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ---------------- narrative */}
        <div className="space-y-5 px-6 py-6">
          <div>
            <label className="label">{L('پروژه', 'Project')}</label>
            <select className="input" value={pid} onChange={(e) => switchProject(e.target.value)} disabled={!!update}>
              {mine.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.owner}
                </option>
              ))}
            </select>
            {prev && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-sub">
                <HealthDot h={prev.health} />
                {L(`گزارش قبلی: ${fmtDayMonth(prev.week_date)} — ${lbl(HEALTH, prev.health)}`, `Previous: ${fmtDayMonth(prev.week_date)} — ${lbl(HEALTH, prev.health)}`)}
              </div>
            )}
          </div>

          <div>
            <label className="label">{L('وضعیت کلی این هفته', 'Overall status this week')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['green', 'amber', 'red'] as Health[]).map((h) => (
                <button key={h} type="button" onClick={() => setHealth(h)} className={cx('flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition', health === h ? healthBtn[h] : 'border-line-strong hover:bg-muted')}>
                  <HealthDot h={h} />
                  {lbl(HEALTH, h)}
                </button>
              ))}
            </div>
            {m && (
              <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[0.6875rem] leading-5 text-sub">
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <Sparkles size={12} /> {L(`پیشنهاد سیستم: ${lbl(HEALTH, m.computedHealth)}`, `System suggests: ${lbl(HEALTH, m.computedHealth)}`)}
                </span>
                {m.reasons.length > 0 && <span> — {m.reasons.slice(0, 2).map((r) => r.text).join(L('؛ ', '; '))}</span>}
              </div>
            )}
          </div>

          <div>
            <label className="label">
              {L('پیشرفت کلی', 'Overall progress')} <span className="text-ink num">{fa(`${progress}%`)}</span>
              {m && <span className="ms-2 text-[0.6875rem] font-normal text-sub">{L(`زمان سپری‌شده: ${fa(Math.round(m.elapsed))}٪`, `time elapsed: ${Math.round(m.elapsed)}%`)}</span>}
            </label>
            <input type="range" min={0} max={100} step={1} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full accent-[rgb(var(--brand))]" />
          </div>

          <div>
            <label className="label">
              {L('خلاصه برای مدیریت', 'Executive summary')}
              <span className="ms-0.5 text-bad">*</span>
            </label>
            <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus />
          </div>
          {(
            [
              ['done', L('انجام‌شده از گزارش قبل', 'Done since last update'), 'bg-good'],
              ['next', L('برنامه‌ی هفته‌ی بعد', 'Plan for next week'), 'bg-brand'],
              ['blockers', L('موانع و درخواست کمک', 'Blockers & asks'), 'bg-bad'],
            ] as const
          ).map(([k, label, dot]) => (
            <div key={k}>
              <label className="label flex items-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
                {label}
              </label>
              <textarea className="input" rows={3} value={text[k]} onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} />
            </div>
          ))}
        </div>

        {/* ---------------- structured updates */}
        <aside className="space-y-5 border-t border-line bg-muted/30 px-6 py-6 md:border-s md:border-t-0">
          <div>
            <div className="eyebrow mb-1">{L('به‌روزرسانی خروجی‌ها', 'Update deliverables')}</div>
            {facts?.due.length ? (
              <div className="space-y-2">
                {facts.due.map((d) => {
                  const c = changes[d.id] || {}
                  const st = c.status || d.status
                  const target = c.push ? addDays(d.target_date, c.push) : d.target_date
                  return (
                    <div key={d.id} className="rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div dir={dirOf(d.title)} className="truncate text-sm font-medium">{d.title}</div>
                          <div className={cx('text-[0.6875rem] num', isOverdue(d) && !c.push && st !== 'delivered' ? 'text-bad' : 'text-sub')}>
                            {fmtDayMonth(target)}
                            {c.push ? <span className="text-bad"> ({L(`+${fa(c.push / 7)} هفته`, `+${c.push / 7}w`)})</span> : isOverdue(d) ? ` · ${L('عقب‌افتاده', 'overdue')}` : ''}
                          </div>
                        </div>
                        {(c.status || c.push) && (
                          <button className="text-[0.625rem] text-sub hover:text-ink" onClick={() => setChanges(({ [d.id]: _, ...rest }) => rest)}>
                            {L('بازگردانی', 'Reset')}
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(
                          [
                            ['delivered', L('تحویل شد', 'Delivered'), 'border-good bg-good/10 text-good'],
                            ['in_progress', L('در جریان', 'On track'), 'border-brand bg-brand/10 text-brand dark:text-brand-soft'],
                            ['at_risk', L('در خطر', 'At risk'), 'border-warn bg-warn/12 text-warn'],
                          ] as const
                        ).map(([s, l, on]) => (
                          <button key={s} type="button" onClick={() => setChange(d.id, { status: s, push: s === 'delivered' ? 0 : c.push })} className={cx('h-7 rounded-full border px-2.5 text-[0.6875rem] transition', st === s ? on : 'border-line hover:bg-muted')}>
                            {s === 'delivered' && <Check size={11} className="me-1 inline" />}
                            {l}
                          </button>
                        ))}
                        <button type="button" onClick={() => setChange(d.id, { push: (c.push || 0) + 7, status: st === 'delivered' ? 'in_progress' : c.status })} className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[0.6875rem] hover:bg-muted">
                          <CornerUpLeft size={11} /> {L('یک هفته عقب', '+1 week')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-[0.6875rem] text-sub">{L('خروجی برای دو هفته‌ی پیش رو ثبت نشده', 'No deliverables in the next two weeks')}</div>
            )}
          </div>

          {facts && (
            <div>
              <div className="eyebrow mb-2">{L('از آخرین گزارش', 'Since the last update')}</div>
              <ul className="space-y-1.5 text-xs">
                <li className="flex justify-between">
                  <span className="text-sub">{L('تسک انجام‌شده', 'Tasks completed')}</span>
                  <b className="num">{fa(facts.tasksDone.length)}</b>
                </li>
                <li className="flex justify-between">
                  <span className="text-sub">{L('تحویل‌شده', 'Delivered')}</span>
                  <b className="num">{fa(facts.deliveredRecently.length)}</b>
                </li>
                <li className="flex justify-between">
                  <span className="text-sub">{L('تسک مسدود', 'Blocked tasks')}</span>
                  <b className={cx('num', facts.blocked.length > 0 && 'text-bad')}>{fa(facts.blocked.length)}</b>
                </li>
                <li className="flex justify-between">
                  <span className="text-sub">{L('تصمیم در انتظار', 'Decisions pending')}</span>
                  <b className={cx('num', facts.decisions.length > 0 && 'text-warn')}>{fa(facts.decisions.length)}</b>
                </li>
              </ul>
              {!editing && (
                <button className="mt-3 text-[0.6875rem] font-medium text-sub hover:text-ink" onClick={() => setText(prefill())}>
                  <Sparkles size={11} className="me-1 inline" />
                  {L('پرکردن دوباره از روی داده‌ها', 'Re-fill from data')}
                </button>
              )}
            </div>
          )}
          {existingThisWeek && (
            <div className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[0.6875rem] leading-5 text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {L('این هفته قبلاً گزارش ثبت شده', 'Already reported this week')}
            </div>
          )}
        </aside>
      </div>
    </Sheet>
  )
}
