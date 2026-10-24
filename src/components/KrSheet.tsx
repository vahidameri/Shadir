// A key result in full: its trend (every check-in against the target and the quarter's pace), the
// check-in log, notes, documents, the Mizito link and the tasks that move it. Also the check-in
// popover used on the OKR page.
import { dirOf } from '../lib/dir'
import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Send } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Attachments } from './Files'
import { TaskRow } from './shared'
import { Avatar, Empty, Popover, Progress, Sheet, cx } from './ui'
import { teamName } from './TeamParts'
import { L, tr } from '../lib/i18n'
import { fa, fmtDate, timeAgo } from '../lib/jalali'
import { uid } from '../lib/api'
import { nowStamp } from '../lib/taskstamp'
import { CONF, checkinsOf, elapsed, fmtVal, krConfidence, krProgress, krWork, quarterLabel, quarterRange } from '../lib/okr'
import { daysBetween } from '../lib/jalali'
import type { Checkin, KeyResult, KrConfidence } from '../lib/types'

const toDate = (s: string) => new Date(String(s).replace(' ', 'T'))

/** Check-in: the new value, how confident we are, and a note. Each one is kept (the trend). */
export function CheckIn({ k }: { k: KeyResult }) {
  const { upsert, toast, me } = useStore()
  const [v, setV] = useState('')
  const [conf, setConf] = useState<KrConfidence>('')
  const [note, setNote] = useState('')
  return (
    <Popover
      width={280}
      align="end"
      trigger={({ open, toggle }) => (
        <button
          className="btn-outline btn-sm"
          onClick={() => {
            // start from the key result as it is now
            if (!open) {
              setV(String(k.current ?? ''))
              setConf(k.confidence || '')
              setNote('')
            }
            toggle()
          }}
        >
          {L('چک‌این', 'Check in')}
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3 p-3">
          <div dir={dirOf(k.title)} className="text-sm font-medium">{k.title}</div>
          {k.kind === 'done' ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Number(v) >= 1} onChange={(e) => setV(e.target.checked ? '1' : '0')} /> {L('انجام شد', 'Done')}</label>
          ) : (
            <label className="block text-xs text-sub">
              {L(`مقدار فعلی (هدف: ${fmtVal(k, k.target)})`, `Current value (target ${fmtVal(k, k.target)})`)}
              <input dir="ltr" inputMode="decimal" className="input mt-1 h-9 w-full text-sm" value={v} onChange={(e) => setV(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-1">
            {([['', L('خودکار', 'Auto')], ...(['on_track', 'at_risk', 'off_track'] as const).map((c) => [c, tr(CONF[c].label)])] as [KrConfidence, string][]).map(([id, label]) => (
              <button key={id || 'auto'} onClick={() => setConf(id)} className={cx('h-7 rounded-full border px-2.5 text-xs', conf === id ? 'border-transparent bg-ink text-surface' : 'border-line text-sub')}>{label}</button>
            ))}
          </div>
          <textarea rows={2} className="input w-full py-2 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('چه شد؟ چه چیزی مانع است؟ (اختیاری)', 'What happened? What is in the way? (optional)')} />
          <button
            className="btn-primary btn-sm w-full"
            onClick={async () => {
              const raw = String(v).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
              const n = Number(raw)
              const value = raw && Number.isFinite(n) ? n : Number(k.current) || 0
              const at = nowStamp()
              await upsert('Checkins', { id: uid('CI'), kr_id: k.id, at, value, confidence: conf, note: note.trim(), by: me } as Checkin)
              await upsert('KeyResults', { ...k, current: value, confidence: conf, updated_at: at })
              toast(L('چک‌این ثبت شد', 'Check-in saved'))
              close()
            }}
          >
            {L('ثبت', 'Save')}
          </button>
        </div>
      )}
    </Popover>
  )
}

/** Value over the quarter: the target line, the even pace from zero to target, and every check-in. */
function Trend({ k, quarter }: { k: KeyResult; quarter: string }) {
  const { db } = useStore()
  const [a, b] = quarterRange(quarter)
  const span = Math.max(1, daysBetween(a, b))
  const target = k.kind === 'done' ? 1 : Number(k.target) || 1
  const pts = checkinsOf(db, k.id).map((c) => ({ x: Math.max(0, Math.min(1, daysBetween(a, c.at.slice(0, 10)) / span)), y: Number(c.value) || 0, c }))
  const top = Math.max(target, ...pts.map((p) => p.y)) * 1.1 || 1
  const W = 600
  const H = 180
  const X = (x: number) => 8 + x * (W - 16)
  const Y = (y: number) => H - 18 - (y / top) * (H - 34)
  const now = elapsed(quarter) / 100
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={L('روند نتیجه‌ی کلیدی', 'Key result trend')}>
        <line x1={X(0)} x2={X(1)} y1={Y(target)} y2={Y(target)} stroke="rgb(var(--good))" strokeDasharray="4 4" strokeWidth="1.5" />
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(target)} stroke="rgb(var(--ink) / 0.18)" strokeWidth="1.5" />
        <line x1={X(now)} x2={X(now)} y1={8} y2={H - 18} stroke="rgb(var(--ink) / 0.25)" strokeDasharray="2 3" />
        <text x={X(now)} y={H - 4} textAnchor="middle" className="fill-[rgb(var(--sub))] text-[10px]">{L('امروز', 'today')}</text>
        <line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} stroke="rgb(var(--line))" />
        {pts.length > 0 && <polyline fill="none" stroke="rgb(var(--ink))" strokeWidth="2.25" strokeLinejoin="round" points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />}
        {pts.map((p) => (
          <circle key={p.c.id} cx={X(p.x)} cy={Y(p.y)} r="4" fill="rgb(var(--surface))" stroke={p.c.confidence ? CONF[p.c.confidence].hex : 'rgb(var(--ink))'} strokeWidth="2">
            <title>{`${fmtDate(p.c.at)} · ${fmtVal(k, p.y)}${p.c.note ? ` — ${p.c.note}` : ''}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 text-[0.6875rem] text-sub">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-ink" /> {L('مقدار ثبت‌شده', 'Recorded value')}</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-ink/20" /> {L('مسیر یکنواخت تا هدف', 'Even pace to target')}</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-good" /> {L(`هدف: ${fmtVal(k, target)}`, `Target: ${fmtVal(k, target)}`)}</span>
        <span>{L(`${fa(pts.length)} چک‌این`, `${pts.length} check-ins`)}</span>
      </div>
    </div>
  )
}

export function KrSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, canEdit, upsert, me } = useStore()
  const { open } = useEditor()
  const [note, setNote] = useState('')
  const k = db.KeyResults.find((x) => x.id === id)
  const o = k && db.Objectives.find((x) => x.id === k.objective_id)
  if (!k || !o) return null
  const c = krConfidence(k, o.quarter)
  const p = krProgress(k)
  const w = krWork(db, k.id)
  const log = checkinsOf(db, k.id).reverse()
  const notes = db.Comments.filter((x) => x.entity === 'KeyResults' && x.entity_id === k.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const product = k.project_id ? db.Projects.find((x) => x.id === k.project_id) : undefined
  const post = async () => {
    if (!note.trim()) return
    await upsert('Comments', { id: uid('C'), entity: 'KeyResults', entity_id: k.id, author: me, body: note.trim(), created_at: nowStamp() })
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
          <span className="eyebrow">{L('نتیجه‌ی کلیدی', 'Key result')}</span>
          <span className="text-line-strong">/</span>
          <span className="truncate text-sub">{teamName(o.team)} · {quarterLabel(o.quarter)}</span>
        </div>
      }
      footer={
        canEdit && (
          <>
            <span className="text-[0.6875rem] text-sub">{k.updated_at && L(`آخرین به‌روزرسانی ${timeAgo(toDate(k.updated_at))}`, `Updated ${timeAgo(toDate(k.updated_at))}`)}</span>
            <div className="flex-1" />
            <CheckIn k={k} />
            <button className="btn-outline btn-sm" onClick={() => open('KeyResults', k as never)}><Pencil size={13} /> {L('ویرایش', 'Edit')}</button>
          </>
        )
      }
    >
      <div className="grid min-h-full @lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6 px-6 py-6 @lg:border-e @lg:border-line">
          <div>
            <div dir={dirOf(o.title)} className="text-xs text-sub">{o.title}</div>
            <h2 dir={dirOf(k.title)} className="display mt-1 text-2xl leading-snug">{k.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={cx('font-medium', CONF[c].tone)}>{tr(CONF[c].label)}{!k.confidence && <span className="font-normal text-sub"> {L('(خودکار)', '(auto)')}</span>}</span>
              <span className="text-sub">·</span>
              <span className="num">{k.kind === 'done' ? fmtVal(k, k.current) : L(`${fmtVal(k, k.current)} از ${fmtVal(k, k.target)}`, `${fmtVal(k, k.current)} of ${fmtVal(k, k.target)}`)}</span>
              {k.mizito_link && (
                <a href={k.mizito_link} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-xs text-sub hover:text-ink">
                  <ExternalLink size={12} /> {L('میزیتو', 'Mizito')}
                </a>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={p} marker={elapsed(o.quarter)} h={c === 'on_track' ? 'green' : c === 'at_risk' ? 'amber' : 'red'} className="h-2" />
              <span className="text-sm font-semibold num">{fa(p)}٪</span>
            </div>
          </div>

          <section>
            <div className="eyebrow mb-2">{L('روند', 'Trend')}</div>
            <Trend k={k} quarter={o.quarter} />
          </section>

          <section>
            <div className="eyebrow mb-2">{L('چک‌این‌ها', 'Check-ins')}</div>
            {log.length ? (
              <ol className="relative space-y-3 border-s border-line ps-5">
                {log.map((x) => (
                  <li key={x.id} className="relative">
                    <span className="absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface" style={{ background: x.confidence ? CONF[x.confidence].hex : 'rgb(var(--ink) / 0.5)' }} />
                    <div className="text-sm">
                      <b className="font-medium num">{fmtVal(k, x.value)}</b>
                      {x.confidence && <span className={cx('ms-2 text-xs', CONF[x.confidence].tone)}>{tr(CONF[x.confidence].label)}</span>}
                      <span className="ms-2 text-xs text-sub">{x.by} · {fmtDate(x.at)} {x.at.slice(11, 16)}</span>
                    </div>
                    {x.note && <div dir={dirOf(x.note)} className="mt-1 whitespace-pre-wrap rounded-2xl rounded-ss-md bg-muted px-3 py-2 text-sm leading-7">{x.note}</div>}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-sub">{L('هنوز چک‌اینی ثبت نشده؛ هر هفته با «چک‌این» مقدار و اطمینان را ثبت کنید تا روند ساخته شود.', 'No check-ins yet; check in weekly (value + confidence) to build the trend.')}</div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">{L(`کارهای این نتیجه (${fa(w.open)} باز از ${fa(w.tasks.length)})`, `Work on it (${w.open} open of ${w.tasks.length})`)}</span>
              {canEdit && (
                <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-sub hover:bg-muted hover:text-ink" onClick={() => open('Tasks', { kr_id: k.id, track: o.team, project_id: k.project_id || '' })}>
                  <Plus size={12} /> {L('تسک', 'Task')}
                </button>
              )}
            </div>
            {w.tasks.length ? <div className="-mx-2">{w.tasks.map((t) => <TaskRow key={t.id} t={t} dense />)}</div> : <div className="text-xs text-sub">{L('تسکی به این نتیجه وصل نیست.', 'No tasks linked.')}</div>}
          </section>

          <section>
            <div className="eyebrow mb-2">{L('مستندات', 'Documents')}</div>
            <Attachments entity="KeyResults" id={k.id} />
          </section>

          <section>
            <div className="eyebrow mb-2">{L('یادداشت‌ها و پیگیری', 'Notes & tracking')}</div>
            {canEdit && (
              <div className="mb-4 flex items-end gap-2 rounded-2xl border border-line p-2 focus-within:border-ink/30">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && post()} rows={2} placeholder={L('یادداشت، تصمیم یا پیگیری… (Ctrl+Enter)', 'A note, decision or follow-up… (Ctrl+Enter)')} className="flex-1 resize-none bg-transparent px-1 text-sm outline-none" />
                <button className="btn-primary btn-sm h-9 w-9 px-0" onClick={post} disabled={!note.trim()} aria-label={L('ثبت', 'Post')}><Send size={14} className="rtl:-scale-x-100" /></button>
              </div>
            )}
            {notes.length ? (
              <div className="space-y-4">
                {notes.map((x) => (
                  <div key={x.id} className="flex gap-3">
                    <Avatar name={x.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 text-sm"><span className="font-medium">{x.author}</span><span className="text-[0.6875rem] text-sub">{timeAgo(toDate(x.created_at))}</span></div>
                      <div dir={dirOf(x.body)} className="mt-0.5 whitespace-pre-wrap text-sm leading-7 text-ink/85">{x.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text={L('یادداشتی نیست', 'No notes yet')} />
            )}
          </section>
        </div>
        <aside className="space-y-1 bg-muted/30 px-4 py-6">
          <div className="eyebrow mb-2">{L('مشخصات', 'Properties')}</div>
          {prop(L('هدف (Objective)', 'Objective'), o.title)}
          {prop(L('تیم', 'Team'), teamName(o.team))}
          {prop(L('فصل', 'Quarter'), quarterLabel(o.quarter))}
          {prop(L('مسئول', 'Owner'), k.owner || '—')}
          {prop(L('وزن', 'Weight'), <span className="num">{fa(Number(k.weight) || 0)} {L('از ۱۰۰', 'of 100')}</span>)}
          {prop(L('نوع سنجش', 'Measured as'), k.kind === 'done' ? L('انجام شد / نشد', 'Done / not') : k.kind === 'percent' ? L('درصد', 'Percent') : L(`عدد${k.unit ? ` (${k.unit})` : ''}`, `Number${k.unit ? ` (${k.unit})` : ''}`))}
          {prop(L('هدف عددی', 'Target'), <span className="num">{fmtVal(k, k.target)}</span>)}
          {prop(L('محصول', 'Product'), product ? product.name : '—')}
          {prop(L('لینک میزیتو', 'Mizito link'), k.mizito_link ? <a href={k.mizito_link} target="_blank" rel="noreferrer" dir="ltr" className="block truncate text-brand hover:underline">{k.mizito_link}</a> : '—')}
          {k.note && <div dir={dirOf(k.note)} className="mt-3 rounded-2xl bg-surface p-3 text-xs leading-6 text-sub">{k.note}</div>}
        </aside>
      </div>
    </Sheet>
  )
}
