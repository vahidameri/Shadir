import { useState } from 'react'
import { Plus, FileSignature, ChevronDown } from 'lucide-react'
import type { Contract } from '../lib/types'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Attachments } from './Files'
import { Empty, cx } from './ui'
import { L, lbl } from '../lib/i18n'
import { CONTRACT_KIND, CONTRACT_STATUS } from '../lib/labels'
import { fa, fmtDate, relDays, todayISO, daysFromToday } from '../lib/jalali'
import { useProjectName } from './shared'

const tone: Record<string, string> = {
  draft: 'bg-muted text-sub',
  negotiation: 'bg-warn/12 text-warn',
  signed: 'bg-brand/10 text-brand dark:text-brand-soft',
  active: 'bg-good/10 text-good',
  expired: 'bg-muted text-sub',
  terminated: 'bg-bad/10 text-bad',
}

/** The "new contract" action, placed in the card header like every other add button. */
export function NewContractButton({ projectId = '' }: { projectId?: string }) {
  const { canEdit } = useStore()
  const { open } = useEditor()
  if (!canEdit) return null
  return (
    <button className="btn-outline btn-sm" onClick={() => open('Contracts', { project_id: projectId })}>
      <Plus size={14} /> {L('قرارداد', 'Contract')}
    </button>
  )
}

/** Contracts list — only the CEO and the program manager ever receive these rows. */
export function ContractsList({ projectId }: { projectId?: string }) {
  const { db } = useStore()
  const { open } = useEditor()
  const pname = useProjectName()
  const [openId, setOpenId] = useState('')
  const list = db.Contracts.filter((c) => !projectId || c.project_id === projectId).sort((a, b) => (a.end_date < b.end_date ? -1 : 1))
  const t = todayISO()
  const ending = (c: Contract) => (c.status === 'active' || c.status === 'signed') && c.end_date && daysFromToday(c.end_date) <= 30
  return (
    <div>
      {list.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((c) => {
            const files = db.Files.filter((f) => f.entity === 'Contracts' && f.entity_id === c.id).length
            const isOpen = openId === c.id
            return (
              <li key={c.id}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-muted/40">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-sub">
                    <FileSignature size={16} />
                  </span>
                  <button className="min-w-0 flex-1 basis-56 text-start" onClick={() => open('Contracts', c as never)}>
                    <span className="block truncate text-sm font-medium hover:underline">{c.title}</span>
                    <span className="block truncate text-[0.6875rem] text-sub">
                      {!projectId && `${pname(c.project_id)} · `}
                      {c.counterparty} · {lbl(CONTRACT_KIND, c.kind)}
                      {c.number && <span dir="ltr"> · {c.number}</span>}
                    </span>
                  </button>
                  <span className={cx('chip', tone[c.status])}>{lbl(CONTRACT_STATUS, c.status)}</span>
                  <span className={cx('w-40 text-xs num', ending(c) ? 'font-medium text-warn' : 'text-sub')}>
                    {fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : '…'}
                    {ending(c) && <span className="block text-[0.625rem]">{c.end_date < t ? L('منقضی شده', 'Expired') : L(`پایان ${relDays(c.end_date)}`, `ends ${relDays(c.end_date)}`)}</span>}
                  </span>
                  {c.value && <span className="hidden w-36 truncate text-xs text-sub @lg:inline">{c.value}</span>}
                  <button className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink" onClick={() => setOpenId(isOpen ? '' : c.id)}>
                    {L(`${fa(files)} فایل`, `${files} file(s)`)} <ChevronDown size={13} className={cx('transition', isOpen && 'rotate-180')} />
                  </button>
                </div>
                {isOpen && (
                  <div className="bg-muted/30 px-5 py-3 ps-[4.25rem]">
                    {c.notes && <p className="mb-3 text-xs leading-5 text-ink/80">{c.notes}</p>}
                    <Attachments entity="Contracts" id={c.id} compact />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty text={L('قراردادی ثبت نشده', 'No contracts yet')} />
      )}
    </div>
  )
}
