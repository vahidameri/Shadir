// OKRs: each team's objectives and key results for a quarter, with check-ins (value + confidence,
// kept in History), the work linked to each key result, and how much open work sits outside them.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pencil, Plus, Target } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Empty, HealthDot, Overlap, Popover, Progress, StatStrip, cx } from '../components/ui'
import { Ring, teamName } from '../components/TeamParts'
import { L, locale, tr } from '../lib/i18n'
import { fa, timeAgo } from '../lib/jalali'
import { allTeams, teamStats } from '../lib/teams'
import { CONF, addQuarter, elapsed, fmtVal, krConfidence, krProgress, krWork, krsOf, objectiveProgress, quarterLabel, quarterOf, teamOkr } from '../lib/okr'
import { nowStamp } from '../lib/taskstamp'
import type { KeyResult, KrConfidence } from '../lib/types'

export default function OkrPage() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [q, setQ] = useState(quarterOf)
  const [only, setOnly] = useState('')
  const el = elapsed(q)
  const teams = useMemo(() => allTeams(db).filter(Boolean).map((id) => ({ id, okr: teamOkr(db, id, q, teamStats(db, id).tasks) })), [db, q])
  const krs = teams.flatMap((t) => t.okr.krs)
  const conf = { on_track: 0, at_risk: 0, off_track: 0 }
  krs.forEach((k) => conf[krConfidence(k, q)]++)
  const withObj = teams.filter((t) => t.okr.objectives.length)
  const avg = withObj.length ? Math.round(withObj.reduce((a, t) => a + t.okr.progress, 0) / withObj.length) : 0
  const Prev = locale.lang === 'fa' ? ChevronRight : ChevronLeft
  const Next = locale.lang === 'fa' ? ChevronLeft : ChevronRight
  const shown = teams.filter((t) => !only || t.id === only)

  return (
    <>
      <Band
        title={L('OKR تیم‌ها', 'Team OKRs')}
        sub={L('هدف‌ها و نتایج کلیدی هر تیم در این فصل؛ کارهای بیرون از OKR هم جدا شمرده می‌شوند.', 'Each team’s objectives and key results this quarter; work outside the OKRs is counted separately.')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, -1))} aria-label={L('فصل قبل', 'Previous quarter')}><Prev size={18} /></button>
              <span className="min-w-[8rem] text-center text-sm font-semibold text-white">{quarterLabel(q)}</span>
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, 1))} aria-label={L('فصل بعد', 'Next quarter')}><Next size={18} /></button>
              {q !== quarterOf() && <button className="btn h-8 bg-white px-3 text-xs text-band" onClick={() => setQ(quarterOf())}>{L('فصل جاری', 'This quarter')}</button>}
            </div>
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => open('Objectives', { quarter: q, team: only })}>
                <Plus size={16} /> {L('هدف جدید', 'New objective')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('هدف', 'Objectives'), value: fa(withObj.reduce((a, t) => a + t.okr.objectives.length, 0)) },
            { label: L('نتیجه‌ی کلیدی', 'Key results'), value: fa(krs.length) },
            { label: L('میانگین پیشرفت', 'Average progress'), value: `${fa(avg)}٪`, sub: L(`${fa(el)}٪ از فصل گذشته`, `${el}% of the quarter gone`) },
            { label: tr(CONF.on_track.label), value: fa(conf.on_track), tone: 'green' },
            { label: tr(CONF.at_risk.label), value: fa(conf.at_risk), tone: conf.at_risk ? 'amber' : 'muted' },
            { label: tr(CONF.off_track.label), value: fa(conf.off_track), tone: conf.off_track ? 'red' : 'muted' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="card mb-4 flex flex-wrap items-center gap-1.5 p-3">
          {[{ id: '', label: L('همه‌ی تیم‌ها', 'All teams') }, ...teams.map((t) => ({ id: t.id, label: teamName(t.id) }))].map((x) => (
            <button key={x.id || 'all'} onClick={() => setOnly(x.id)} className={cx('h-8 rounded-full border px-3 text-xs transition', only === x.id ? 'border-transparent bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>{x.label}</button>
          ))}
        </div>
        <div className="space-y-4">
          {shown.map(({ id, okr }) => (
            <section key={id} className="card overflow-hidden">
              <header className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
                <Ring value={okr.progress} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{teamName(id)}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-sub">
                    <span>{L(`${fa(okr.objectives.length)} هدف · ${fa(okr.krs.length)} نتیجه‌ی کلیدی`, `${okr.objectives.length} objectives · ${okr.krs.length} key results`)}</span>
                    {(['on_track', 'at_risk', 'off_track'] as const).filter((c) => okr.conf[c]).map((c) => <span key={c} className={CONF[c].tone}>{fa(okr.conf[c])} {tr(CONF[c].label)}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Link to={`/tasks?track=${id}`} className="rounded-xl px-2.5 py-1.5 text-sub hover:bg-muted">{L(`${fa(okr.okrOpen)} کار باز روی OKR`, `${okr.okrOpen} open on OKRs`)}</Link>
                  <Link to={`/tasks?track=${id}&kr=none`} className={cx('rounded-xl px-2.5 py-1.5 hover:bg-muted', okr.otherOpen > okr.okrOpen ? 'text-warn' : 'text-sub')} title={L('کارهای باز این تیم که به هیچ نتیجه‌ی کلیدی وصل نیستند', 'Open work of this team not linked to a key result')}>
                    {L(`${fa(okr.otherOpen)} کار دیگر`, `${okr.otherOpen} other work`)}
                  </Link>
                  {canEdit && <button className="btn-outline btn-sm" onClick={() => open('Objectives', { quarter: q, team: id, sort: okr.objectives.length + 1 })}><Plus size={13} /> {L('هدف', 'Objective')}</button>}
                </div>
              </header>
              {okr.objectives.length === 0 ? (
                <div className="px-5 py-6 text-sm text-sub">{L('برای این فصل هدفی تعریف نشده.', 'No objectives for this quarter yet.')}</div>
              ) : (
                <ol className="divide-y divide-line">
                  {okr.objectives.map((o, i) => {
                    const p = objectiveProgress(db, o)
                    return (
                      <li key={o.id} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold num">{fa(i + 1)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{o.title}</span>
                              {o.owner && <span className="text-xs text-sub">· {o.owner}</span>}
                              {canEdit && <button className="icon-btn h-7 w-7 text-sub" onClick={() => open('Objectives', o as never)} aria-label={L('ویرایش هدف', 'Edit objective')}><Pencil size={13} /></button>}
                            </div>
                            {o.description && <div className="mt-0.5 text-xs text-sub">{o.description}</div>}
                            <div className="mt-2 flex items-center gap-3">
                              <Progress value={p} marker={el} className="max-w-md" />
                              <span className="text-xs font-medium num">{fa(p)}٪</span>
                            </div>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1.5 ps-9">
                          {krsOf(db, o.id).map((k) => <KrRow key={k.id} k={k} quarter={q} />)}
                          {canEdit && (
                            <li>
                              <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-sub hover:bg-muted hover:text-ink" onClick={() => open('KeyResults', { objective_id: o.id, owner: o.owner })}>
                                <Plus size={12} /> {L('نتیجه‌ی کلیدی', 'Key result')}
                              </button>
                            </li>
                          )}
                        </ul>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          ))}
          {shown.length === 0 && <div className="card p-6"><Empty icon={<Target size={22} />} text={L('اول تیم‌ها را در بک‌آفیس تعریف کنید.', 'Define the teams in the back office first.')} /></div>}
        </div>
      </Overlap>
    </>
  )
}

/** One key result: value against target, progress against the quarter, confidence, its work, and a check-in. */
function KrRow({ k, quarter }: { k: KeyResult; quarter: string }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const p = krProgress(k)
  const c = krConfidence(k, quarter)
  const w = krWork(db, k.id)
  const product = k.project_id ? db.Projects.find((x) => x.id === k.project_id) : undefined
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_9rem_7rem_auto] items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <HealthDot h={c === 'on_track' ? 'green' : c === 'at_risk' ? 'amber' : 'red'} />
          <span className="truncate">{k.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.6875rem] text-sub">
          {k.owner && <span>{k.owner}</span>}
          {product && <Link to={`/projects/${product.id}`} className="hover:text-ink">{product.name}</Link>}
          <Link to={`/tasks?v=all&kr=${k.id}`} className="hover:text-ink">{L(`${fa(w.open)} کار باز`, `${w.open} open`)}{w.late > 0 && <span className="text-bad">{L(` · ${fa(w.late)} معوق`, ` · ${w.late} late`)}</span>}</Link>
          {k.updated_at && <span>{L('آخرین به‌روزرسانی', 'updated')} {timeAgo(new Date(k.updated_at.replace(' ', 'T')))}</span>}
        </div>
      </div>
      <div>
        <Progress value={p} marker={elapsed(quarter)} h={c === 'on_track' ? 'green' : c === 'at_risk' ? 'amber' : 'red'} />
        <div className="mt-1 text-[0.6875rem] text-sub num">{k.kind === 'done' ? fmtVal(k, k.current) : L(`${fmtVal(k, k.current)} از ${fmtVal(k, k.target)}`, `${fmtVal(k, k.current)} / ${fmtVal(k, k.target)}`)}</div>
      </div>
      <span className={cx('text-xs font-medium', CONF[c].tone)}>{tr(CONF[c].label)}{!k.confidence && <span className="font-normal text-sub"> {L('(خودکار)', '(auto)')}</span>}</span>
      <div className="flex items-center gap-1">
        {canEdit && <CheckIn k={k} />}
        {canEdit && <button className="icon-btn h-7 w-7 text-sub" onClick={() => open('KeyResults', k as never)} aria-label={L('ویرایش', 'Edit')}><Pencil size={13} /></button>}
      </div>
    </li>
  )
}

/** Check-in: the new value, how confident we are, and a short note — all kept in the History log. */
function CheckIn({ k }: { k: KeyResult }) {
  const { upsert, toast } = useStore()
  const [v, setV] = useState(String(k.current ?? ''))
  const [conf, setConf] = useState<KrConfidence>(k.confidence || '')
  const [note, setNote] = useState('')
  return (
    <Popover
      width={280}
      align="end"
      trigger={({ open, toggle }) => (
        <button
          className="btn-outline btn-sm"
          onClick={() => {
            // start from the key result as it is now, not as it was when the row first rendered
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
          <div className="text-sm font-medium">{k.title}</div>
          {k.kind === 'done' ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Number(v) >= 1} onChange={(e) => setV(e.target.checked ? '1' : '0')} /> {L('انجام شد', 'Done')}</label>
          ) : (
            <label className="block text-xs text-sub">{L('مقدار فعلی', 'Current value')}<input dir="ltr" inputMode="decimal" className="input mt-1 h-9 w-full text-sm" value={v} onChange={(e) => setV(e.target.value)} /></label>
          )}
          <div className="flex flex-wrap gap-1">
            {([['', L('خودکار', 'Auto')], ...(['on_track', 'at_risk', 'off_track'] as const).map((c) => [c, tr(CONF[c].label)])] as [KrConfidence, string][]).map(([id, label]) => (
              <button key={id || 'auto'} onClick={() => setConf(id)} className={cx('h-7 rounded-full border px-2.5 text-xs', conf === id ? 'border-transparent bg-ink text-surface' : 'border-line text-sub')}>{label}</button>
            ))}
          </div>
          <input className="input h-9 w-full text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('یادداشت (اختیاری)', 'Note (optional)')} />
          <button
            className="btn-primary btn-sm w-full"
            onClick={async () => {
              const raw = String(v).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
              const n = Number(raw)
              await upsert('KeyResults', { ...k, current: raw && Number.isFinite(n) ? n : k.current, confidence: conf, note: note || k.note, updated_at: nowStamp() })
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
