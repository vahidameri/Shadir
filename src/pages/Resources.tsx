// Resource allocation: for one quarter, what share of each person's time goes to each product.
// Rows are people, columns are products (grouped by team). A row over 100% of the person's
// capacity is over-allocated; the small number in a cell is their open tasks there (plan vs reality).
import { dirOf } from '../lib/dir'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Empty, Overlap, StatStrip, cx } from '../components/ui'
import { teamName } from '../components/TeamParts'
import { L, locale } from '../lib/i18n'
import { fa } from '../lib/jalali'
import { can } from '../lib/access'
import { assigneesOf } from '../lib/assignees'
import { closed } from '../lib/columns'
import { capOf } from '../lib/capacity'
import { allTeams } from '../lib/teams'
import { isArchived } from '../lib/archive'
import { addQuarter, quarterLabel, quarterOf, quarterRange } from '../lib/okr'
import { uid } from '../lib/api'
import type { Allocation, DB } from '../lib/types'

/** Allocations that count in a quarter: tagged with it, or untagged with a window that overlaps it. */
export function allocsIn(db: DB, q: string) {
  const [a, b] = quarterRange(q)
  return db.Allocations.filter((x) => (x.quarter ? x.quarter === q : (!x.start_date || x.start_date <= b) && (!x.end_date || x.end_date >= a)))
}

export default function Resources() {
  const { db, canEdit, access, bulk, toast } = useStore()
  const { open } = useEditor()
  const [q, setQ] = useState(quarterOf)
  const edit = canEdit && can.manage(access)
  const people = db.Team.filter((m) => String(m.active) !== 'false')
  const products = useMemo(() => {
    const live = db.Projects.filter((p) => !isArchived(p) && p.status !== 'completed' && p.status !== 'cancelled')
    return allTeams(db).flatMap((t) => live.filter((p) => (p.team || '') === t))
  }, [db])
  const allocs = allocsIn(db, q)
  const cell = (memberId: string, pid: string) => allocs.filter((a) => a.member_id === memberId && a.project_id === pid)
  const pct = (list: Allocation[]) => list.reduce((s, a) => s + (Number(a.percent) || 0), 0)
  const openTasks = (name: string, pid: string) => db.Tasks.filter((t) => t.project_id === pid && !closed(t) && assigneesOf(t).includes(name)).length
  const rowTotal = (memberId: string) => pct(allocs.filter((a) => a.member_id === memberId))
  const over = people.filter((m) => rowTotal(m.id) > capOf(m))
  const idle = people.filter((m) => rowTotal(m.id) < capOf(m) * 0.5)
  const unstaffed = products.filter((p) => !allocs.some((a) => a.project_id === p.id))
  const Prev = locale.lang === 'fa' ? ChevronRight : ChevronLeft
  const Next = locale.lang === 'fa' ? ChevronLeft : ChevronRight

  const copyPrev = async () => {
    const prev = allocsIn(db, addQuarter(q, -1)).filter((a) => !allocs.some((x) => x.member_id === a.member_id && x.project_id === a.project_id))
    if (!prev.length) return toast(L('چیزی برای کپی از فصل قبل نیست', 'Nothing to copy from last quarter'), 'err')
    await bulk('Allocations', prev.map((a) => ({ ...a, id: uid('A'), quarter: q, start_date: '', end_date: '' })))
    toast(L(`${fa(prev.length)} تخصیص از فصل قبل کپی شد`, `${prev.length} allocations copied from last quarter`))
  }

  return (
    <>
      <Band
        title={L('توزیع منابع', 'Resource allocation')}
        sub={L('سهم وقت هر نفر برای هر محصول در این فصل. عدد کوچک در هر خانه، تسک‌های باز همان نفر در همان محصول است.', 'Each person’s share of time per product this quarter. The small number in a cell is their open tasks there.')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, -1))} aria-label={L('فصل قبل', 'Previous quarter')}><Prev size={18} /></button>
              <span className="min-w-[8rem] text-center text-sm font-semibold text-white">{quarterLabel(q)}</span>
              <button className="icon-btn text-white/80 hover:bg-white/10 hover:text-white" onClick={() => setQ(addQuarter(q, 1))} aria-label={L('فصل بعد', 'Next quarter')}><Next size={18} /></button>
            </div>
            {edit && access === 'super' && <button className="btn h-10 border border-white/15 text-white hover:bg-white/10" onClick={copyPrev}><Copy size={15} /> {L('کپی از فصل قبل', 'Copy last quarter')}</button>}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('نفر', 'People'), value: fa(people.length) },
            { label: L('محصول و پروژه', 'Products & projects'), value: fa(products.length) },
            { label: L('تخصیص‌یافته (FTE)', 'Allocated (FTE)'), value: fa(Math.round(pct(allocs) / 10) / 10) },
            { label: L('بیش از ظرفیت', 'Over-allocated'), value: fa(over.length), tone: over.length ? 'red' : 'green' },
            { label: L('کم‌بار (زیر ۵۰٪)', 'Under 50%'), value: fa(idle.length), tone: idle.length ? 'amber' : 'green' },
            { label: L('بدون نیرو', 'Unstaffed'), value: fa(unstaffed.length), tone: unstaffed.length ? 'amber' : 'green' },
          ]}
        />
      </Band>
      <Overlap>
        {!people.length || !products.length ? (
          <div className="card p-6"><Empty text={L('اول افراد و محصولات را تعریف کنید.', 'Add people and products first.')} /></div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="th sticky start-0 z-10 bg-surface text-start">{L('نفر', 'Person')}</th>
                  {products.map((p) => (
                    <th key={p.id} className="th min-w-[6.5rem] text-center align-bottom">
                      <div className="text-[0.625rem] font-normal text-sub">{teamName(p.team || '')}</div>
                      <div dir={dirOf(p.name)} className="truncate">{p.name}</div>
                    </th>
                  ))}
                  <th className="th text-center">{L('جمع', 'Total')}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((m) => {
                  const total = rowTotal(m.id)
                  const cap = capOf(m)
                  return (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="td sticky start-0 z-10 bg-surface">
                        <div dir={dirOf(m.name)} className="font-medium">{m.name}</div>
                        <div className="text-[0.6875rem] text-sub">{teamName(m.track || '')}</div>
                      </td>
                      {products.map((p) => {
                        const list = cell(m.id, p.id)
                        const v = pct(list)
                        const n = openTasks(m.name, p.id)
                        return (
                          <td key={p.id} className="p-1 text-center">
                            <button
                              disabled={!edit}
                              onClick={() => open('Allocations', (list.find((a) => a.quarter === q) || list[0]) ? ((list.find((a) => a.quarter === q) || list[0]) as never) : { id: undefined, member_id: m.id, project_id: p.id, quarter: q, percent: 20 })}
                              className={cx('group relative h-11 w-full rounded-lg text-xs transition', v ? 'font-semibold text-ink' : 'text-sub/40 hover:bg-muted', !v && n > 0 && 'ring-1 ring-inset ring-warn/50')}
                              style={v ? { background: `rgb(var(--ink) / ${0.05 + Math.min(1, v / 100) * 0.35})`, color: v >= 60 ? 'rgb(var(--surface))' : undefined } : undefined}
                              title={!v && n > 0 ? L('تسک باز دارد ولی تخصیصی ندارد', 'Has open tasks but no allocation') : undefined}
                            >
                              {v ? `${fa(v)}٪` : edit ? <Plus size={12} className="mx-auto opacity-0 group-hover:opacity-100" /> : '—'}
                              {n > 0 && <span className={cx('absolute bottom-0.5 end-1 text-[0.5625rem] font-normal', v >= 60 ? 'text-surface/70' : 'text-sub')}>{fa(n)}</span>}
                            </button>
                          </td>
                        )
                      })}
                      <td className={cx('td text-center font-semibold num', total > cap ? 'text-bad' : total < cap * 0.5 ? 'text-warn' : 'text-good')}>
                        {fa(total)}٪{cap !== 100 && <span className="block text-[0.625rem] font-normal text-sub">{L(`از ${fa(cap)}٪`, `of ${cap}%`)}</span>}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-muted/40">
                  <td className="td sticky start-0 z-10 bg-muted/40 text-xs text-sub">{L('جمع (نفر تمام‌وقت)', 'Total (FTE)')}</td>
                  {products.map((p) => {
                    const v = pct(allocs.filter((a) => a.project_id === p.id))
                    return <td key={p.id} className={cx('p-2 text-center text-xs num', v ? 'font-medium' : 'text-warn')}>{v ? fa(Math.round(v / 10) / 10) : L('بدون نیرو', 'none')}</td>
                  })}
                  <td className="td text-center text-xs font-medium num">{fa(Math.round(pct(allocs) / 10) / 10)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Overlap>
    </>
  )
}
