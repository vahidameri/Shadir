// OKRs: each team's objectives and key results for a quarter. A team card shows the quarter at a
// glance and opens to the full tree. Key results carry a weight (a team's add up to 100), a Mizito
// link, check-ins (the trend), documents and notes; their detail opens in a side panel.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Target } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Empty, HealthDot, Overlap, Progress, StatStrip, cx } from '../components/ui'
import { Ring, teamName } from '../components/TeamParts'
import { CheckIn, KrSheet } from '../components/KrSheet'
import { L, locale, tr } from '../lib/i18n'
import { fa, timeAgo } from '../lib/jalali'
import { allTeams, teamStats } from '../lib/teams'
import { CONF, addQuarter, checkinsOf, elapsed, fmtVal, krConfidence, krProgress, krWork, krsOf, objectiveProgress, quarterLabel, quarterOf, teamOkr } from '../lib/okr'
import type { KeyResult } from '../lib/types'

const OPEN_KEY = 'madar.okr.open'
const readOpen = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'))
  } catch {
    return new Set<string>()
  }
}

export default function OkrPage() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(quarterOf)
  const [only, setOnly] = useState('')
  const [expanded, setExpanded] = useState(readOpen)
  const krOpen = params.get('kr') || ''
  const setKr = (id: string) => {
    const n = new URLSearchParams(params)
    if (id) n.set('kr', id)
    else n.delete('kr')
    setParams(n, { replace: true })
  }
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
  const save = (s: Set<string>) => {
    setExpanded(s)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...s]))
    } catch {
      /* the open/closed state is only a convenience */
    }
  }
  const toggle = (id: string) => {
    const s = new Set(expanded)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    save(s)
  }
  const allOpen = shown.every((t) => expanded.has(t.id))

  return (
    <>
      <Band
        title={L('OKR تیم‌ها', 'Team OKRs')}
        sub={L('هر تیم چند هدف دارد و هر هدف چند نتیجه‌ی کلیدی؛ وزن نتایج کلیدی هر تیم روی هم ۱۰۰ است.', 'Each team has a few objectives, each with key results; a team’s key-result weights add up to 100.')}
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
          <span className="ms-auto flex items-center gap-1.5 text-[0.6875rem] text-sub">
            <span className="relative inline-block h-1.5 w-10 rounded-full bg-ink/10"><span className="absolute inset-y-0 start-0 w-5 rounded-full bg-ink/60" /><span className="absolute -top-1 start-7 h-3.5 w-[2px] rounded bg-ink/60" /></span>
            {L(`خط عمودی روی نوارها = امروز (${fa(el)}٪ از فصل گذشته)؛ نواری که به آن نرسیده عقب است`, `The vertical line = today (${el}% of the quarter gone); a bar short of it is behind`)}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => save(allOpen ? new Set([...expanded].filter((x) => !shown.some((t) => t.id === x))) : new Set([...expanded, ...shown.map((t) => t.id)]))}>
            <ChevronDown size={14} className={cx('transition', allOpen && 'rotate-180')} /> {allOpen ? L('بستن همه', 'Collapse all') : L('باز کردن همه', 'Expand all')}
          </button>
        </div>
        <div className="space-y-4">
          {shown.map(({ id, okr }) => {
            const isOpen = expanded.has(id)
            const first = okr.objectives[0]
            return (
              <section key={id} className="card overflow-hidden">
                <header className={cx('flex flex-wrap items-center gap-4 px-5 py-4', isOpen && 'border-b border-line')}>
                  <button onClick={() => toggle(id)} className="flex min-w-0 flex-1 items-center gap-4 text-start" aria-expanded={isOpen}>
                    <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-sub transition', isOpen && 'rotate-180')}><ChevronDown size={16} /></span>
                    <Ring value={okr.progress} size={56} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{teamName(id)}</span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-sub">
                        <span>{L(`${fa(okr.objectives.length)} هدف · ${fa(okr.krs.length)} نتیجه‌ی کلیدی`, `${okr.objectives.length} objectives · ${okr.krs.length} key results`)}</span>
                        {(['on_track', 'at_risk', 'off_track'] as const).filter((c) => okr.conf[c]).map((c) => <span key={c} className={CONF[c].tone}>{fa(okr.conf[c])} {tr(CONF[c].label)}</span>)}
                        {okr.krs.length > 0 && okr.weights !== 100 && <span className="text-warn">{L(`جمع وزن‌ها ${fa(okr.weights)} از ۱۰۰`, `weights total ${okr.weights} of 100`)}</span>}
                      </span>
                      {!isOpen && okr.objectives.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {okr.objectives.map((o) => (
                            <span key={o.id} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.6875rem]">
                              <span className="truncate">{o.title}</span>
                              <b className="font-medium num">{fa(objectiveProgress(db, o))}٪</b>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    <Link to={`/tasks?track=${id}`} className="rounded-xl px-2.5 py-1.5 text-sub hover:bg-muted">{L(`${fa(okr.okrOpen)} کار باز روی OKR`, `${okr.okrOpen} open on OKRs`)}</Link>
                    <Link to={`/tasks?track=${id}&kr=none`} className={cx('rounded-xl px-2.5 py-1.5 hover:bg-muted', okr.otherOpen > okr.okrOpen ? 'text-warn' : 'text-sub')} title={L('کارهای باز این تیم که به هیچ نتیجه‌ی کلیدی وصل نیستند', 'Open work of this team not linked to a key result')}>
                      {L(`${fa(okr.otherOpen)} کار دیگر`, `${okr.otherOpen} other work`)}
                    </Link>
                    {canEdit && <button className="btn-outline btn-sm" onClick={() => open('Objectives', { quarter: q, team: id, sort: okr.objectives.length + 1 })}><Plus size={13} /> {L('هدف', 'Objective')}</button>}
                    {canEdit && (
                      <button
                        className="btn-outline btn-sm"
                        disabled={!first}
                        title={first ? undefined : L('اول یک هدف بسازید', 'Add an objective first')}
                        onClick={() => first && open('KeyResults', { objective_id: first.id, owner: first.owner })}
                      >
                        <Plus size={13} /> {L('نتیجه‌ی کلیدی', 'Key result')}
                      </button>
                    )}
                  </div>
                </header>
                {isOpen &&
                  (okr.objectives.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-sub">{L('برای این فصل هدفی تعریف نشده.', 'No objectives for this quarter yet.')}</div>
                  ) : (
                    <ol className="divide-y divide-line">
                      {okr.objectives.map((o, i) => {
                        const p = objectiveProgress(db, o)
                        const ks = krsOf(db, o.id)
                        const w = ks.reduce((a, k) => a + (Number(k.weight) || 0), 0)
                        return (
                          <li key={o.id} className="px-5 py-4">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold num">{fa(i + 1)}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{o.title}</span>
                                  {o.owner && <span className="text-xs text-sub">· {o.owner}</span>}
                                  {w > 0 && <span className="text-xs text-sub">· {L(`وزن ${fa(w)}`, `weight ${w}`)}</span>}
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
                              {ks.map((k) => <KrRow key={k.id} k={k} quarter={q} onOpen={() => setKr(k.id)} />)}
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
                  ))}
              </section>
            )
          })}
          {shown.length === 0 && <div className="card p-6"><Empty icon={<Target size={22} />} text={L('اول تیم‌ها را در بک‌آفیس تعریف کنید.', 'Define the teams in the back office first.')} /></div>}
        </div>
      </Overlap>
      {krOpen && <KrSheet id={krOpen} onClose={() => setKr('')} />}
    </>
  )
}

/** One key result: weight, value against target, progress against the quarter, confidence, work, check-in. */
function KrRow({ k, quarter, onOpen }: { k: KeyResult; quarter: string; onOpen: () => void }) {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const p = krProgress(k)
  const c = krConfidence(k, quarter)
  const w = krWork(db, k.id)
  const last = checkinsOf(db, k.id).slice(-1)[0]
  const product = k.project_id ? db.Projects.find((x) => x.id === k.project_id) : undefined
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_9rem_7rem_auto] items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
      <div className="min-w-0">
        <button onClick={onOpen} className="flex max-w-full items-center gap-1.5 text-start text-sm hover:underline">
          <HealthDot h={c === 'on_track' ? 'green' : c === 'at_risk' ? 'amber' : 'red'} />
          <span className="truncate">{k.title}</span>
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-sub">
          <span className="rounded-full bg-muted px-1.5 font-medium text-ink num">{L(`وزن ${fa(Number(k.weight) || 0)}`, `w ${Number(k.weight) || 0}`)}</span>
          {k.owner && <span>{k.owner}</span>}
          {product && <Link to={`/projects/${product.id}`} className="hover:text-ink">{product.name}</Link>}
          {k.mizito_link && (
            <a href={k.mizito_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink">
              <ExternalLink size={11} /> {L('میزیتو', 'Mizito')}
            </a>
          )}
          <Link to={`/tasks?v=all&kr=${k.id}`} className="hover:text-ink">{L(`${fa(w.open)} کار باز`, `${w.open} open`)}{w.late > 0 && <span className="text-bad">{L(` · ${fa(w.late)} معوق`, ` · ${w.late} late`)}</span>}</Link>
          {last && <span>{L('آخرین چک‌این', 'last check-in')} {timeAgo(new Date(last.at.replace(' ', 'T')))}</span>}
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
