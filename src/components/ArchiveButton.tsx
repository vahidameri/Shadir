import { Archive, ArchiveRestore } from 'lucide-react'
import { closed } from '../lib/columns'
import type { Project } from '../lib/types'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { isArchived } from '../lib/archive'
import { Popover, cx } from './ui'
import { L } from '../lib/i18n'
import { fa, todayISO } from '../lib/jalali'

/** Archive a project (it leaves every list with all its tasks) or bring it back. Leadership only. */
export function ArchiveButton({ p, dark }: { p: Project; dark?: boolean }) {
  const { db, canEdit, access, upsert, toast } = useStore()
  if (!canEdit || !can.manage(access)) return null
  const archived = isArchived(p)
  const cls = dark ? 'btn h-10 border border-white/15 text-white hover:bg-white/10' : 'btn-outline btn-sm'
  const restore = async () => {
    await upsert('Projects', { ...p, archived: '', archived_at: '' })
    toast(L(`${p.name} از آرشیو خارج شد`, `${p.name} restored`))
  }
  if (archived)
    return (
      <button className={cls} onClick={(e) => (e.preventDefault(), e.stopPropagation(), restore())}>
        <ArchiveRestore size={15} /> {L('خروج از آرشیو', 'Unarchive')}
      </button>
    )
  const open = db.Tasks.filter((t) => t.project_id === p.id && !closed(t)).length
  return (
    <Popover
      width={300}
      align="end"
      trigger={({ toggle }) => (
        <button className={cls} onClick={(e) => (e.preventDefault(), e.stopPropagation(), toggle())} title={L('آرشیو پروژه', 'Archive project')}>
          <Archive size={15} /> {L('آرشیو', 'Archive')}
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3 p-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold">{L(`آرشیو ${p.name}`, `Archive ${p.name}`)}</div>
          <p className="text-xs leading-5 text-sub">
            {L('پروژه با همه‌ی تسک‌ها، مایلستون‌ها و خروجی‌هایش از لیست‌ها، بوردها و یادآوری‌ها بیرون می‌رود. هر وقت بخواهید از «پروژه‌ها ← آرشیو» برمی‌گردد.', 'The project and all its tasks, milestones and deliverables leave every list, board and reminder. Bring it back any time from Projects → Archive.')}
            {open > 0 && <b className={cx('mt-1 block text-warn')}>{L(`${fa(open)} تسک باز دارد.`, `It has ${open} open task(s).`)}</b>}
          </p>
          <button
            className="btn-primary btn-sm w-full"
            onClick={async () => {
              close()
              await upsert('Projects', { ...p, archived: '1', archived_at: todayISO() })
              toast(L(`${p.name} آرشیو شد`, `${p.name} archived`))
            }}
          >
            <Archive size={14} /> {L('آرشیو کن', 'Archive')}
          </button>
        </div>
      )}
    </Popover>
  )
}
