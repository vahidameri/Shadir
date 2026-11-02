import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { HubNav } from '../components/HubNav'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, FilterSelect, Overlap, Segmented, Toolbar, Avatar, StatStrip, cx } from '../components/ui'
import { FollowUpRow, TaskRow } from '../components/shared'
import { closed } from '../lib/columns'
import { isAssignee } from '../lib/assignees'
import { addDays, fa, todayISO } from '../lib/jalali'
import { L } from '../lib/i18n'
import type { FollowUp } from '../lib/types'

export default function FollowUps() {
  const { db, canEdit, me } = useStore()
  const { open } = useEditor()
  const [project, setProject] = useState('')
  const [person, setPerson] = useState('')
  const [group, setGroup] = useState<'time' | 'person'>('time')
  const [showDone, setShowDone] = useState(false)
  const today = todayISO()
  const week = addDays(today, 7)

  const all = db.FollowUps.filter((f) => (!project || f.project_id === project) && (!person || f.person === person))
  const openFu = all.filter((f) => f.status !== 'done')
  const people = Array.from(new Set(db.FollowUps.map((f) => f.person).filter(Boolean)))
  const sort = (a: FollowUp, b: FollowUp) => (a.due_date || '9999').localeCompare(b.due_date || '9999')

  // a ping is due when its date has come, whether we are still to ask (open) or waiting on an answer
  const overdue = openFu.filter((f) => f.due_date && f.due_date < today)
  const groups: { key: string; title: string; tone: string; items: FollowUp[] }[] =
    group === 'time'
      ? [
          { key: 'overdue', title: L('پینگ عقب‌افتاده', 'Ping overdue'), tone: 'text-bad', items: overdue },
          { key: 'today', title: L('پینگ امروز', 'Ping today'), tone: 'text-warn', items: openFu.filter((f) => f.due_date === today) },
          { key: 'waiting', title: L('منتظر پاسخ', 'Waiting'), tone: 'text-purple-500', items: openFu.filter((f) => f.status === 'waiting' && (!f.due_date || f.due_date > today)) },
          { key: 'week', title: L('این هفته', 'This week'), tone: '', items: openFu.filter((f) => f.status === 'open' && f.due_date > today && f.due_date <= week) },
          { key: 'later', title: L('بعداً', 'Later'), tone: 'text-sub', items: openFu.filter((f) => f.status === 'open' && (!f.due_date || f.due_date > week)) },
        ]
      : people
          .map((p) => ({ key: p, title: p, tone: '', items: openFu.filter((f) => f.person === p) }))
          .filter((g) => g.items.length)
          .sort((a, b) => b.items.length - a.items.length)
  const done = all.filter((f) => f.status === 'done').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))

  return (
    <>
      <Band nav={<HubNav hub="work" />}
        title={L('پیگیری‌ها', 'Follow-ups')}
        actions={
          canEdit && (
            <button className="btn h-10 bg-white text-band" onClick={() => open('FollowUps', { project_id: project, person })}>
              <Plus size={16} /> {L('پیگیری جدید', 'New follow-up')}
            </button>
          )
        }
      >
        <StatStrip
          items={[
            { label: L('پیگیری باز', 'Open'), value: fa(openFu.length) },
            { label: L('معوق', 'Overdue'), value: fa(overdue.length), tone: overdue.length ? 'red' : 'green' },
            { label: L('پینگ امروز', 'Ping today'), value: fa(openFu.filter((f) => f.due_date === today).length), tone: 'amber' },
            { label: L('منتظر پاسخ', 'Waiting'), value: fa(openFu.filter((f) => f.status === 'waiting').length) },
            { label: L('افراد', 'People'), value: fa(new Set(openFu.map((f) => f.person)).size) },
            { label: L('بسته‌شده', 'Closed'), value: fa(done.length), tone: 'green' },
          ]}
        />
      </Band>
      <Overlap>
        <ChaseTasks me={me} />
        <div className="card mb-4 p-3">
          <Toolbar className="!mb-0">
            <Segmented value={group} onChange={setGroup} options={[{ value: 'time', label: L('بر اساس زمان', 'By time') }, { value: 'person', label: L('بر اساس فرد', 'By person') }]} />
            <FilterSelect value={project} onChange={setProject} placeholder={L('همه‌ی پروژه‌ها', 'All projects')} options={db.Projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={person} onChange={setPerson} placeholder={L('همه‌ی افراد', 'Everyone')} options={people.map((p) => ({ value: p, label: p }))} />
            <button aria-pressed={showDone} className="chip-btn ms-auto" onClick={() => setShowDone((x) => !x)}>
              {L('نمایش بسته‌شده‌ها', 'Show closed')}
            </button>
          </Toolbar>
        </div>

        <div className="stagger grid gap-4 @lg:grid-cols-2">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Card
                key={g.key}
                pad={false}
                title={
                  <span className={cx('flex items-center gap-2', g.tone)}>
                    {group === 'person' && <Avatar name={g.title} size="xs" />}
                    {g.title} <span className="font-normal text-sub num">· {fa(g.items.length)}</span>
                  </span>
                }
              >
                <div className="px-2 pb-2">{[...g.items].sort(sort).map((f) => <FollowUpRow key={f.id} f={f} />)}</div>
              </Card>
            ))}
          {groups.every((g) => !g.items.length) && (
            <div className="card @lg:col-span-2">
              <Empty text={L('پیگیری بازی وجود ندارد', 'No open follow-ups')} />
            </div>
          )}
        </div>

        {showDone && (
          <Card className="mt-4" pad={false} title={L(`بسته‌شده · ${fa(done.length)}`, `Closed · ${done.length}`)}>
            <div className="px-2 pb-2">{done.length ? done.map((f) => <FollowUpRow key={f.id} f={f} compact />) : <Empty />}</div>
          </Card>
        )}
      </Overlap>
    </>
  )
}

/**
 * Tasks whose follow-up is mine: open tasks with a reminder date, or that I asked for / watch / reported
 * while someone else does them. Soonest reminder (then deadline) first.
 */
function ChaseTasks({ me }: { me: string }) {
  const { db } = useStore()
  const [all, setAll] = useState(false)
  const today = todayISO()
  const listed = (v: string | undefined) => String(v || '').split(',').map((x) => x.trim()).includes(me)
  const rows = db.Tasks.filter((t) => {
    if (closed(t) || isAssignee(t, me)) return false
    return !!t.follow_date || t.requested_by === me || t.reporter === me || listed(t.watchers)
  }).sort((a, b) => (a.follow_date || a.due_date || '9999').localeCompare(b.follow_date || b.due_date || '9999'))
  if (!rows.length) return null
  const due = rows.filter((t) => (t.follow_date && t.follow_date <= today) || (t.due_date && t.due_date <= today)).length
  const shown = all ? rows : rows.slice(0, 8)
  return (
    <Card
      className="mb-4"
      eyebrow={L('تسک‌هایی که پیگیری‌شان با من است', 'Tasks I follow up')}
      title={L(`${fa(rows.length)} تسک${due ? ` · ${fa(due)} مورد امروز یا گذشته` : ''}`, `${rows.length} tasks${due ? ` · ${due} due` : ''}`)}
      action={rows.length > 8 ? <button className="btn-ghost btn-sm" onClick={() => setAll(!all)}>{all ? L('کمتر', 'Less') : L(`همه (${fa(rows.length)})`, `All (${rows.length})`)}</button> : undefined}
    >
      <p className="mb-2 text-xs text-sub">{L('تسک‌های باز دیگران که «تاریخ یادآوری» دارند، یا شما درخواست‌کننده، گزارش‌دهنده یا ناظرشان هستید.', 'Others’ open tasks with a reminder date, or that you asked for, reported or watch.')}</p>
      <div className="divide-y divide-line">{shown.map((t) => <TaskRow key={t.id} t={t} />)}</div>
    </Card>
  )
}
