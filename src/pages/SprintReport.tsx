// One sprint, for the people who need to see it rather than run it (the CPTO): what was committed,
// what got done, what changed after it started, the burndown, who did what, what is blocked or
// carried over, and the retro. Printable.
import { dirOf } from '../lib/dir'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Pencil, Printer } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, StatStrip, cx } from '../components/ui'
import { Bars, teamName } from '../components/TeamParts'
import { Burndown, CompleteSprint, IssueBadge, KeyTag } from '../components/SprintParts'
import { L, tr } from '../lib/i18n'
import { fa, fmtDate } from '../lib/jalali'
import { ISSUE, SPRINT_LABEL, pts, sprintStats } from '../lib/sprints'
import { assigneesOf } from '../lib/assignees'
import { catOf, statusLabel } from '../lib/columns'
import type { Task } from '../lib/types'

export default function SprintReport() {
  const { id } = useParams()
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const [closing, setClosing] = useState(false)
  const s = db.Sprints.find((x) => x.id === id)
  if (!s) return <Empty text={L('اسپرینت پیدا نشد', 'Sprint not found')} />
  const st = sprintStats(db, s)
  const done = st.tasks.filter((t) => catOf(t.status) === 'done')
  const people = [...new Set(st.tasks.flatMap(assigneesOf))]
  const byType = (Object.keys(ISSUE) as (keyof typeof ISSUE)[]).map((k) => ({ k, all: st.tasks.filter((t) => t.issue_type === k), done: done.filter((t) => t.issue_type === k) })).filter((x) => x.all.length)
  const completion = st.committed ? Math.round((st.done / st.committed) * 100) : 0
  const list = (ts: Task[], empty: string) =>
    ts.length ? (
      <ul className="divide-y divide-line">
        {ts.map((t) => (
          <li key={t.id}>
            <button onClick={() => open('Tasks', t as never)} className="flex w-full items-center gap-2 px-1 py-2 text-start text-sm hover:bg-muted/50">
              <IssueBadge type={t.issue_type} />
              <KeyTag k={t.key} />
              <span dir={dirOf(t.title)} className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-xs text-sub">{assigneesOf(t)[0] || '—'}</span>
              <span className="w-24 truncate text-end text-xs text-sub">{statusLabel(t.status)}</span>
              <span className="w-8 text-end text-xs font-medium num">{pts(t) ? fa(pts(t)) : '—'}</span>
            </button>
            {catOf(t.status) === 'blocked' && t.blocked_reason && <div className="mb-2 ms-1 rounded-lg bg-bad/[0.07] px-2 py-1 text-xs text-bad">{t.blocked_reason}</div>}
          </li>
        ))}
      </ul>
    ) : (
      <div className="py-4 text-xs text-sub">{empty}</div>
    )

  return (
    <>
      <Band
        eyebrow={
          <>
            <Link to={`/sprints?team=${s.team || ''}`} className="flex items-center gap-1 hover:text-white"><ArrowRight size={12} className="ltr:rotate-180" /> {teamName(s.team || '')}</Link>
            <span className="opacity-40">/</span>
            <span>{tr(SPRINT_LABEL[s.status])}</span>
            <span className="opacity-40">/</span>
            <span className="num">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</span>
          </>
        }
        title={s.name}
        sub={s.goal || L('هدف اسپرینت ثبت نشده', 'No sprint goal')}
        actions={
          <>
            <button className="btn h-10 border border-white/15 text-white hover:bg-white/10" onClick={() => window.print()}><Printer size={15} /> {L('چاپ / PDF', 'Print / PDF')}</button>
            {canEdit && <button className="btn h-10 border border-white/15 text-white hover:bg-white/10" onClick={() => open('Sprints', s as never)}><Pencil size={15} /> {L('ویرایش', 'Edit')}</button>}
            {canEdit && s.status === 'active' && <button className="btn h-10 bg-white text-band" onClick={() => setClosing(true)}>{L('بستن اسپرینت', 'Complete sprint')}</button>}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('تعهد', 'Committed'), value: fa(st.committed), sub: L('امتیاز', 'points') },
            { label: L('انجام‌شده', 'Completed'), value: fa(st.done), sub: L(`${fa(completion)}٪ از تعهد`, `${completion}% of commitment`), tone: completion >= 80 ? 'green' : completion >= 60 ? 'amber' : s.status === 'planned' ? 'muted' : 'red' },
            { label: L('اضافه‌شده بعد از شروع', 'Added after start'), value: `+${fa(st.added.points)}`, sub: L(`${fa(st.added.tasks.length)} کار`, `${st.added.tasks.length} items`), tone: st.added.points ? 'amber' : 'muted' },
            { label: L('خارج‌شده', 'Removed'), value: fa(st.removed), sub: L('کار', 'items') },
            { label: s.status === 'closed' ? L('منتقل به بعد', 'Carried over') : L('باقی‌مانده', 'Remaining'), value: fa(s.status === 'closed' ? st.carried.length : st.remaining), sub: s.status === 'closed' ? L('کار', 'items') : L('امتیاز', 'points') },
            { label: L('مسدود', 'Blocked'), value: fa(st.blocked.length), tone: st.blocked.length ? 'red' : 'green' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="grid gap-4 @xl:grid-cols-3">
          <Card className="@xl:col-span-2" eyebrow={L('برن‌داون', 'Burndown')} title={L('امتیاز باقی‌مانده، روز به روز', 'Points remaining, day by day')}>
            <Burndown s={s} />
          </Card>
          <Card eyebrow={L('نوع کار', 'Work by type')} title={L('چه چیزی ساخته شد', 'What was built')}>
            {byType.length ? (
              <ul className="space-y-3">
                {byType.map((x) => (
                  <li key={x.k} className="flex items-center gap-2 text-sm">
                    <IssueBadge type={x.k} withLabel />
                    <span className="ms-auto num">{L(`${fa(x.done.length)} از ${fa(x.all.length)}`, `${x.done.length} of ${x.all.length}`)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text={L('نوع کارها مشخص نشده', 'No issue types set')} />
            )}
          </Card>
          <Card eyebrow={L('افراد', 'People')} title={L('امتیاز انجام‌شده هر نفر', 'Points done per person')}>
            {people.length ? <Bars unit={L(' امتیاز', ' pts')} rows={people.map((p) => {
              const open = st.tasks.filter((t) => assigneesOf(t).includes(p) && catOf(t.status) !== 'done').length
              return { label: open ? L(`${p} · ${fa(open)} کار باز`, `${p} · ${open} open`) : p, value: done.filter((t) => assigneesOf(t).includes(p)).reduce((a, t) => a + pts(t), 0) }
            })} /> : <Empty />}
          </Card>
          <Card className="@xl:col-span-2" eyebrow={L('نیازمند توجه', 'Needs attention')} title={L('مسدودها', 'Blocked')}>
            {list(st.blocked, L('چیزی مسدود نیست', 'Nothing is blocked'))}
          </Card>
          <Card className={cx(s.status === 'closed' ? '@xl:col-span-3' : '@xl:col-span-3')} eyebrow={s.status === 'closed' ? L('منتقل به بعد', 'Carried over') : L('در جریان', 'In progress')} title={s.status === 'closed' ? L('کارهای ناتمام', 'Unfinished work') : L('کارهای باز', 'Open work')}>
            {list(st.carried, L('همه انجام شد', 'All done'))}
          </Card>
          {st.added.tasks.length > 0 && (
            <Card className="@xl:col-span-3" eyebrow={L('تغییر دامنه', 'Scope change')} title={L('اضافه‌شده بعد از شروع اسپرینت', 'Added after the sprint started')}>
              {list(st.added.tasks, '')}
            </Card>
          )}
          <Card className="@xl:col-span-3" eyebrow={L('انجام‌شده', 'Done')} title={L(`${fa(done.length)} کار · ${fa(st.done)} امتیاز`, `${done.length} items · ${st.done} points`)}>
            {list(done, L('هنوز کاری تمام نشده', 'Nothing finished yet'))}
          </Card>
          {s.retro && (
            <Card className="@xl:col-span-3" eyebrow={L('رترو', 'Retro')} title={L('آنچه یاد گرفتیم', 'What we learned')}>
              <p className="whitespace-pre-wrap text-sm leading-7">{s.retro}</p>
            </Card>
          )}
        </div>
      </Overlap>
      {closing && <CompleteSprint s={s} onClose={() => setClosing(false)} />}
    </>
  )
}
