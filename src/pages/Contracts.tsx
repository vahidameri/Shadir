import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Overlap, StatStrip } from '../components/ui'
import { ContractsList } from '../components/Contracts'
import { L } from '../lib/i18n'
import { fa } from '../lib/jalali'

/** Contracts across all projects — only the program manager and the CEO ever receive these rows. */
export default function Contracts() {
  const { db, canEdit } = useStore()
  const { open } = useEditor()
  const live = db.Contracts.filter((c) => c.status === 'active' || c.status === 'signed')
  const pending = db.Contracts.filter((c) => c.status === 'negotiation' || c.status === 'draft')
  return (
    <>
      <Band
        eyebrow={L('محرمانه · فقط مدیر برنامه و مدیرعامل', 'Confidential · program manager & CEO only')}
        title={L('قراردادها', 'Contracts')}
        actions={canEdit && (
          <button className="btn h-10 bg-white text-band" onClick={() => open('Contracts')}>
            <Plus size={16} /> {L('قرارداد جدید', 'New contract')}
          </button>
        )}
      >
        <StatStrip items={[
          { label: L('قراردادهای فعال', 'Active'), value: fa(live.length) },
          { label: L('در جریان', 'In progress'), value: fa(pending.length), tone: pending.length ? 'amber' : undefined },
          { label: L('همه', 'All'), value: fa(db.Contracts.length) },
        ]} />
      </Band>
      <Overlap>
        <Card pad={false} title={L('قراردادهای همه‌ی پروژه‌ها', 'Contracts across projects')}>
          <ContractsList />
        </Card>
      </Overlap>
    </>
  )
}
