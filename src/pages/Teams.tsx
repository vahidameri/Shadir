import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Link2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, StatStrip, Segmented, FilterSelect, Toolbar, Ring, Avatar, AvatarStack, cx, StatusIcon, Due } from '../components/ui'
import { TaskRow } from '../components/shared'
import { TRACK, TRACKS, trackOf, trackStats, handoffs, sideDot, sideSoft, sideColor, waitingOn } from '../lib/tracks'
import { isReturn, pairStats, recent, stuck } from '../lib/handoffs'
import { HandoffBoard, Flow } from '../components/Handoffs'
import { fa } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import type { Task, Track } from '../lib/types'
import { TrackBadge } from '../components/ItemSheet'
import { assigneesOf, isAssignee } from '../lib/assignees'

/** The sides (product, design, tech…) side by side: their own tracking plus the hand-offs between them. */
export default function Teams() {
  const { db } = useStore()
  const { open } = useEditor()
  const [view, setView] = useState<'handoffs' | 'side' | 'deps' | 'projects'>('handoffs')
  const [project, setProject] = useState('')
  const [side, setSide] = useState('')
  const pid = project || undefined
  const hs = handoffs(db, pid)
  const pending = hs.filter((h) => !h.ready && h.to.status !== 'done')
  const ready = hs.filter((h) => h.ready && h.to.status !== 'done')
  const passes = db.Handoffs.filter((h) => !pid || h.project_id === pid)
  const last14 = recent(db).filter((h) => !pid || h.project_id === pid)
  const returned = passes.filter(isReturn).length
  const sitting = stuck(db).filter((x) => !pid || x.t.project_id === pid).length
  const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
  const pairs = pairStats(db, pid)

  return (
    <>
      <Band nav={<HubNav hub="work" />}
        title={L('واحدها و تحویل‌ها', 'Units & hand-offs')}
        sub={TRACKS.map((t) => lbl(TRACK, t)).join(' · ')}
        actions={<Segmented dark value={view} onChange={setView} options={[{ value: 'handoffs', label: L('رفت و برگشت', 'Hand-offs') }, { value: 'side', label: L('کنار هم', 'Side by side') }, { value: 'deps', label: L('وابستگی‌ها', 'Dependencies') }, { value: 'projects', label: L('به تفکیک پروژه', 'By project') }]} />}
      >
        <StatStrip
          items={[
            ...TRACKS.slice(0, 3).map((t) => {
              const st = trackStats(db, t, pid)
              return { label: L(`${lbl(TRACK, t)} · باز`, `${lbl(TRACK, t)} · open`), value: fa(st.open), sub: st.overdue ? L(`${fa(st.overdue)} معوق`, `${st.overdue} overdue`) : L(`${fa(st.doneWeek)} انجام این هفته`, `${st.doneWeek} done this week`), tone: st.overdue ? ('amber' as const) : undefined }
            }),
            { label: L('تحویل در ۱۴ روز', 'Hand-overs · 14 days'), value: fa(last14.length) },
            { label: L('برگشت‌ها', 'Returns'), value: fa(returned), tone: returned ? 'red' : 'green', sub: passes.length ? L(`نرخ برگشت ${fa(Math.round((returned / passes.length) * 100))}٪`, `return rate ${Math.round((returned / passes.length) * 100)}%`) : undefined },
            { label: L('مانده در یک واحد', 'Sitting in a unit'), value: fa(sitting), tone: sitting ? 'amber' : undefined, sub: L('۳ روز یا بیشتر', '3+ days') },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <div className="card p-3">
          <Toolbar className="!mb-0">
            <FilterSelect value={project} onChange={setProject} placeholder={L('همه‌ی پروژه‌ها', 'All projects')} options={db.Projects.filter((p) => p.status !== 'cancelled').map((p) => ({ value: p.id, label: p.name }))} />
            {view === 'handoffs' && <FilterSelect value={side} onChange={setSide} placeholder={L('همه‌ی واحدها', 'All units')} options={TRACKS.map((t) => ({ value: t, label: lbl(TRACK, t) }))} />}
            <span className="ms-auto flex items-center gap-4 text-xs text-sub">
              {TRACKS.map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={sideDot(t)} /> {lbl(TRACK, t)}
                </span>
              ))}
            </span>
          </Toolbar>
        </div>

        {view === 'handoffs' && (
          <>
            {pairs.length > 0 && (
              <Card pad={false} eyebrow={L('مسیرها', 'Lanes')} title={L('رفت و برگشت بین واحدها', 'Back and forth between units')}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem]">
                    <thead className="border-b border-line">
                      <tr>
                        <th className="th">{L('مسیر', 'Lane')}</th>
                        <th className="th">{L('تحویل', 'Passes')}</th>
                        <th className="th">{L('برگشت', 'Returned')}</th>
                        <th className="th">{L('نرخ برگشت', 'Return rate')}</th>
                        <th className="th">{L('میانگین ماندن در واحد بعدی', 'Avg. days in the next unit')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pairs.map((p) => (
                        <tr key={p.from + p.to}>
                          <td className="td"><Flow from={p.from} to={p.to} /></td>
                          <td className="td num">{fa(p.total)}</td>
                          <td className={cx('td num', p.returned > 0 && 'text-bad')}>{fa(p.returned)}</td>
                          <td className={cx('td num', p.returnRate >= 30 && 'font-semibold text-bad')}>{fa(p.returnRate)}٪</td>
                          <td className="td num">{L(`${fa(p.avgDays)} روز`, `${p.avgDays}d`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <HandoffBoard projectId={pid} side={side || undefined} />
            {!passes.length && (
              <p className="text-center text-xs leading-6 text-sub">{L('وقتی مسئول تسکی را به کسی در واحد دیگر بدهید، این‌جا ثبت می‌شود؛ برگشت به واحد قبلی «برگشت» و دور بعد شمرده می‌شود.', 'Assign a task to someone in another unit and it shows here; going back to an earlier unit counts as a return and the next round.')}</p>
            )}
          </>
        )}

        {view === 'side' && (
          <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
            {TRACKS.map((tr) => (
              <TrackColumn key={tr} track={tr} projectId={pid} />
            ))}
          </div>
        )}

        {view === 'deps' && (
          <div className="grid gap-4 @2xl:grid-cols-2">
            {[
              { title: L('منتظر پیش‌نیاز', 'Waiting on a dependency'), items: pending, tone: 'bad' as const },
              { title: L('آماده برای شروع', 'Ready to start'), items: ready, tone: 'good' as const },
            ].map((g) => (
              <Card key={g.title} eyebrow={L('وابستگی بین واحدها', 'Cross-unit dependencies')} title={`${g.title} · ${fa(g.items.length)}`}>
                {g.items.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {g.items.map((h) => (
                      <div key={h.from.id + h.to.id} className={cx('rounded-2xl border p-3', g.tone === 'bad' ? 'border-warn/30 bg-warn/[0.04]' : 'border-good/30 bg-good/[0.04]')}>
                        <div className="mb-2 flex items-center justify-between text-[0.6875rem] text-sub">
                          <span>{pname(h.to.project_id)}</span>
                          {g.tone === 'bad' ? (
                            <span className="flex items-center gap-1 text-warn"><Clock size={12} /> {L('منتظر', 'Waiting')}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-good"><CheckCircle2 size={12} /> {L('آماده', 'Ready')}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <HandoffNode t={h.from} onClick={() => open('Tasks', h.from as never)} />
                          <span className={cx('grid h-8 min-w-8 place-items-center rounded-full px-2', h.ready ? 'bg-good text-white' : 'bg-warn/15 text-warn')}>
                            <span className="text-[0.625rem] font-medium">{L('سپس', 'then')}</span>
                          </span>
                          <HandoffNode t={h.to} onClick={() => open('Tasks', h.to as never)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {view === 'projects' && (
          <Card pad={false} eyebrow={L('مقایسه', 'Comparison')} title={L('پیشرفت هر واحد در هر پروژه', 'Each unit’s progress per project')}>
            <div className="divide-y divide-line">
              {db.Projects.filter((p) => p.status === 'active' || p.status === 'planning').map((p) => {
                const open = recent(db).filter((x) => x.project_id === p.id).length
                const back = db.Handoffs.filter((x) => x.project_id === p.id && isReturn(x)).length
                return (
                  <div key={p.id} className="grid items-center gap-4 px-5 py-4" style={{ gridTemplateColumns: `minmax(10rem,14rem) repeat(${TRACKS.length}, minmax(0,1fr)) 8rem` }}>
                    <Link to={`/projects/${p.id}`} className="min-w-0">
                      <div className="truncate font-medium hover:underline" dir="auto">{p.name}</div>
                      <div className="font-mono text-[0.625rem] text-sub" dir="ltr">{p.code}</div>
                    </Link>
                    {TRACKS.map((tr) => {
                      const st = trackStats(db, tr, p.id)
                      return (
                        <div key={tr}>
                          <div className="mb-1 flex items-center justify-between text-[0.6875rem]">
                            <span className="chip side-soft" style={sideSoft(tr)}>{lbl(TRACK, tr)}</span>
                            <span className="text-sub num">{fa(st.done)}/{fa(st.total)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${st.pct}%`, background: sideColor(tr) }} />
                          </div>
                          {(st.overdue > 0 || st.blocked > 0) && (
                            <div className="mt-1 text-[0.625rem] text-bad">
                              {st.overdue > 0 && L(`${fa(st.overdue)} معوق `, `${st.overdue} overdue `)}
                              {st.blocked > 0 && L(`${fa(st.blocked)} مسدود`, `${st.blocked} blocked`)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="text-xs">
                      {open + back > 0 ? (
                        <span className={cx('chip', back ? 'bg-bad/10 text-bad' : 'bg-warn/12 text-warn')}>
                          <Link2 size={11} /> {L(`${fa(open)} تحویل اخیر · ${fa(back)} برگشت`, `${open} recent · ${back} back`)}
                        </span>
                      ) : (
                        <span className="text-sub">{L('بدون گلوگاه', 'No bottleneck')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </Overlap>
    </>
  )
}

function HandoffNode({ t, onClick }: { t: Task; onClick: () => void }) {
  const { db } = useStore()
  return (
    <button onClick={onClick} className="min-w-0 rounded-xl border border-line bg-surface p-2.5 text-start transition hover:shadow-card">
      <div className="mb-1 flex items-center gap-1.5">
        <TrackBadge track={trackOf(t, db)} />
        <StatusIcon s={t.status} size={13} />
      </div>
      <div className={cx('line-clamp-2 text-[0.8125rem] leading-5', t.status === 'done' && 'text-sub line-through')}>{t.title}</div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 truncate text-[0.6875rem] text-sub">
          <AvatarStack names={assigneesOf(t)} max={2} /> {assigneesOf(t).join('، ')}
        </span>
        <Due iso={t.due_date} done={t.status === 'done'} />
      </div>
    </button>
  )
}

function TrackColumn({ track, projectId }: { track: Track; projectId?: string }) {
  const { db } = useStore()
  const st = trackStats(db, track, projectId)
  const members = db.Team.filter((m) => m.track === track)
  const open = db.Tasks.filter((t) => trackOf(t, db) === track && t.status !== 'done' && (!projectId || t.project_id === projectId)).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const waiting = open.filter((t) => waitingOn(t, db).some((d) => trackOf(d, db) && trackOf(d, db) !== track))
  const inbox = recent(db).filter((h) => h.to_side === track && (!projectId || h.project_id === projectId)).length
  return (
    <div className="min-w-0 space-y-4">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-5 p-5" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${sideColor(track)} 9%, transparent), transparent 60%)` }}>
          <Ring value={st.pct} size={76} stroke={7} h={st.overdue ? 'amber' : 'green'} />
          <div className="min-w-0 flex-1">
            <div className="chip side-soft mb-1" style={sideSoft(track)}>{lbl(TRACK, track)}</div>
            <div className="text-lg font-bold">{L(`واحد ${lbl(TRACK, track)}`, `${lbl(TRACK, track)} unit`)}</div>
            <div className="text-xs text-sub">{L(`${fa(st.done)} از ${fa(st.total)} کار انجام شده · ${fa(inbox)} تحویل به این واحد در ۱۴ روز`, `${st.done} of ${st.total} done · ${inbox} handed in · 14 days`)}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-line border-t border-line rtl:divide-x-reverse">
          {[
            [L('باز', 'Open'), st.open, ''],
            [L('معوق', 'Overdue'), st.overdue, st.overdue ? 'text-bad' : ''],
            [L('مسدود', 'Blocked'), st.blocked, st.blocked ? 'text-bad' : ''],
            [L('منتظر واحد دیگر', 'Waiting'), st.waiting, st.waiting ? 'text-warn' : ''],
          ].map(([l, v, c]) => (
            <div key={l as string} className="px-3 py-3 text-center">
              <div className={cx('display text-2xl num', c as string)}>{fa(v as number)}</div>
              <div className="text-[0.625rem] text-sub">{l}</div>
            </div>
          ))}
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line p-4">
            {members.map((m) => {
              const n = db.Tasks.filter((t) => isAssignee(t, m.name) && t.status !== 'done').length
              return (
                <Link key={m.id} to={`/tasks?assignee=${encodeURIComponent(m.name)}`} className="flex items-center gap-2 rounded-full border border-line py-1 pe-3 ps-1 text-xs transition hover:border-line-strong">
                  <Avatar name={m.name} size="xs" />
                  {m.name}
                  <span className="text-sub num">{fa(n)}</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
      {waiting.length > 0 && (
        <Card eyebrow={L('گلوگاه', 'Bottleneck')} title={L('منتظر واحدهای دیگر', 'Waiting on other units')}>
          <div className="-mx-2">{waiting.map((t) => <TaskRow key={t.id} t={t} dense />)}</div>
        </Card>
      )}
      <Card pad={false} eyebrow={L('کارهای باز', 'Open work')} title={L(`${fa(open.length)} کار`, `${open.length} items`)}>
        <div className="px-2 pb-2">{open.length ? open.slice(0, 12).map((t) => <TaskRow key={t.id} t={t} />) : <Empty />}</div>
        {open.length > 12 && (
          <Link to={`/tasks?track=${track}`} className="block border-t border-line py-3 text-center text-xs font-medium text-sub hover:text-ink">
            {L(`همه‌ی ${fa(open.length)} کار ←`, `All ${open.length} →`)}
          </Link>
        )}
      </Card>
    </div>
  )
}
