import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, FilterSelect, Overlap, Toolbar, Person, Chip, cx, StatStrip } from '../components/ui'
import { RiskMatrix, riskTone } from '../components/widgets'
import { riskScore } from '../lib/metrics'
import { RISK_STATUS, RISK_TYPE, options } from '../lib/labels'
import { fa, todayISO, fmtDate } from '../lib/jalali'
import { L, lbl, useI18n } from '../lib/i18n'
import { useProjectName } from '../components/shared'

export default function Risks() {
  const { db, canEdit } = useStore()
  const { lang } = useI18n()
  const { open } = useEditor()
  const pname = useProjectName()
  const [project, setProject] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('active')
  const [cell, setCell] = useState('')
  const today = todayISO()

  const list = db.Risks.filter((r) => (!project || r.project_id === project) && (!type || r.type === type) && (status === 'active' ? r.status !== 'closed' : !status || r.status === status)).sort((a, b) => riskScore(b) - riskScore(a))
  const rows = cell ? list.filter((r) => `${r.probability}-${r.impact}` === cell) : list
  const openAll = db.Risks.filter((r) => r.status !== 'closed')
  const count = (t: string) => openAll.filter((r) => r.type === t).length

  return (
    <>
      <Band
        eyebrow={<span>RAID</span>}
        title={L('ریسک‌ها و تصمیم‌ها', 'Risks & decisions')}
        actions={
          canEdit && (
            <button className="btn h-10 bg-white text-band" onClick={() => open('Risks', { project_id: project })}>
              <Plus size={16} /> {L('مورد جدید', 'New item')}
            </button>
          )
        }
      >
        <StatStrip
          items={[
            { label: L('ریسک‌های باز', 'Open risks'), value: fa(count('risk')) },
            { label: L('بحرانی (≥۱۵)', 'Critical (≥15)'), value: fa(openAll.filter((r) => riskScore(r) >= 15).length), tone: 'red' },
            { label: L('مسئله', 'Issues'), value: fa(count('issue')), tone: count('issue') ? 'amber' : undefined },
            { label: L('وابستگی', 'Dependencies'), value: fa(count('dependency')) },
            { label: L('تصمیم معوق', 'Pending decisions'), value: fa(count('decision')) },
            { label: L('مهلت گذشته', 'Past action date'), value: fa(openAll.filter((r) => r.due_date && r.due_date < today).length), tone: 'red' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="card mb-4 p-3">
          <Toolbar className="!mb-0">
            <FilterSelect value={project} onChange={setProject} placeholder={L('همه‌ی پروژه‌ها', 'All projects')} options={db.Projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={type} onChange={setType} placeholder={L('همه‌ی انواع', 'All types')} options={options(RISK_TYPE, lang)} />
            <FilterSelect value={status} onChange={setStatus} placeholder={L('همه‌ی وضعیت‌ها', 'Any status')} options={[{ value: 'active', label: L('فعال', 'Active') }, ...options(RISK_STATUS, lang)]} />
          </Toolbar>
        </div>
        <div className="grid gap-4 @xl:grid-cols-3">
          <Card eyebrow={L('ماتریس', 'Matrix')} title={L('احتمال × اثر', 'Probability × impact')}>
            <RiskMatrix risks={list} cell={cell} onCell={setCell} onPick={(r) => open('Risks', r as never)} />
          </Card>
          <Card className="@xl:col-span-2" pad={false}>
            {rows.length === 0 ? (
              <Empty />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48.75rem]">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="th">#</th>
                      <th className="th">{L('امتیاز', 'Score')}</th>
                      <th className="th">{L('عنوان و اقدام', 'Item & action')}</th>
                      <th className="th">{L('نوع', 'Type')}</th>
                      <th className="th">{L('پروژه', 'Project')}</th>
                      <th className="th">{L('مالک', 'Owner')}</th>
                      <th className="th">{L('مهلت', 'Due')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r, i) => (
                      <tr key={r.id} onClick={() => open('Risks', r as never)} className="cursor-pointer transition hover:bg-muted/40">
                        <td className="td text-sub num">{fa(i + 1)}</td>
                        <td className="td">
                          <span className={cx('inline-grid h-8 w-8 place-items-center rounded-xl text-xs font-bold num', riskTone(r))}>{fa(riskScore(r))}</span>
                        </td>
                        <td className="td max-w-sm">
                          <div className="font-medium">{r.title}</div>
                          <div className="line-clamp-1 text-xs text-sub">{r.mitigation}</div>
                        </td>
                        <td className="td">
                          <Chip>{lbl(RISK_TYPE, r.type)}</Chip>
                          {r.status === 'mitigating' && <Chip className="ms-1 bg-brand-soft/50 text-ink">{lbl(RISK_STATUS, 'mitigating')}</Chip>}
                        </td>
                        <td className="td text-xs text-sub">{pname(r.project_id)}</td>
                        <td className="td">
                          <Person name={r.owner} />
                        </td>
                        <td className={cx('td text-xs num', r.status !== 'closed' && r.due_date && r.due_date < today ? 'font-semibold text-bad' : 'text-sub')}>{fmtDate(r.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Overlap>
    </>
  )
}
