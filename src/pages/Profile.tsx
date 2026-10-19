import { isAssignee } from '../lib/assignees'
import { closed } from '../lib/columns'
import { Link, useParams } from 'react-router-dom'
import { JOB_TITLE, TEAM_NAMES, teamCodes } from '../lib/labels'
import { Mail, Phone, Pencil, Lock, CalendarDays, Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from '../components/Editor'
import { Band, Card, Empty, Overlap, StatStrip, cx } from '../components/ui'
import { PhotoUpload } from '../components/Files'
import { TaskRow } from '../components/shared'
import { DeliverableRow } from '../components/delivery'
import { fa, fmtDayMonth, fmtWeekday, todayISO } from '../lib/jalali'
import { L, lbl } from '../lib/i18n'
import { capOf, loadTone, memberWeek } from '../lib/capacity'
import { isClosed } from '../lib/delivery'
import { isTaskOverdue } from '../lib/metrics'
import { weekStart, weeksFrom } from '../lib/weeks'


/** A person's page: photo, contact, load, projects, open work, meetings and time off. */
export default function Profile() {
  const { id } = useParams()
  const { db, me, access, canEdit } = useStore()
  const role = access === 'super' ? 'admin' : ''
  const { open } = useEditor()
  const m = db.Team.find((x) => x.id === id) || db.Team.find((x) => x.name === me)
  if (!m) return <Empty text={L('این فرد پیدا نشد', 'Person not found')} />
  const isMe = m.name === me
  const today = todayISO()
  const w = memberWeek(db, m)
  const tasks = db.Tasks.filter((t) => isAssignee(t, m.name) && !closed(t)).sort((a, b) => ((a.due_date || '9') < (b.due_date || '9') ? -1 : 1))
  const hiddenCount = String(m.tasks_private) === '1' && !isMe ? true : false
  const dels = db.Deliverables.filter((d) => d.owner === m.name && !isClosed(d)).sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
  const meetings = db.Meetings.filter((x) => x.date >= today && x.status === 'scheduled' && x.attendees.split(',').map((s) => s.trim()).includes(m.name)).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1)).slice(0, 5)
  const led = db.Projects.filter((p) => p.owner === m.name && p.status !== 'completed' && p.status !== 'cancelled')
  const weeks = weeksFrom(weekStart(), 8).map((ws) => memberWeek(db, m, ws))

  return (
    <>
      <Band
        title={
          <span className="flex flex-wrap items-center gap-5">
            <PhotoUpload member={m} editable={canEdit && (isMe || role === 'admin')} />
            <span>
              {m.name}
              <span className="mt-2 block text-base font-normal text-band-sub">
                {lbl(JOB_TITLE, m.role)}
                {teamCodes(m.team).length > 0 && ` · ${teamCodes(m.team).map((t) => lbl(TEAM_NAMES, t)).join(L('، ', ', '))}`}
              </span>
            </span>
          </span>
        }
        sub={
          <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {m.email && (
              <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 hover:text-white" dir="ltr">
                <Mail size={14} /> {m.email}
              </a>
            )}
            {m.phone && (
              <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1.5 hover:text-white" dir="ltr">
                <Phone size={14} /> {m.phone}
              </a>
            )}
            {String(m.tasks_private) === '1' && (
              <span className="inline-flex items-center gap-1.5">
                <Lock size={13} /> {L('تسک‌ها خصوصی', 'Tasks are private')}
              </span>
            )}
          </span>
        }
        actions={
          canEdit &&
          (isMe || role === 'admin') && (
            <>
              <button className="btn h-10 bg-white text-band" onClick={() => open('Team', m as never)}>
                <Pencil size={15} /> {L('ویرایش پروفایل', 'Edit profile')}
              </button>
            </>
          )
        }
      >
        <StatStrip
          items={[
            { label: L('بار این هفته', 'Load this week'), value: `${fa(`${w.load}%`)}`, tone: loadTone(w.load) === 'muted' ? undefined : loadTone(w.load) },
            { label: L('ظرفیت آزاد', 'Free'), value: `${fa(`${Math.max(0, w.free)}%`)}`, sub: capOf(m) !== 100 ? L(`از ظرفیت ${fa(capOf(m))}٪`, `of ${capOf(m)}%`) : undefined },
            { label: L('پروژه‌ها', 'Projects'), value: fa(w.projects.length) },
            { label: L('تسک باز', 'Open tasks'), value: hiddenCount ? '—' : fa(tasks.length), sub: hiddenCount ? L('خصوصی', 'private') : undefined },
            { label: L('معوق', 'Overdue'), value: hiddenCount ? '—' : fa(tasks.filter(isTaskOverdue).length), tone: tasks.some(isTaskOverdue) ? 'red' : undefined },
            { label: L('خروجی‌های باز', 'Open deliverables'), value: fa(dels.length) },
          ]}
        />
      </Band>

      <Overlap className="space-y-4">
        <div className="grid items-start gap-4 @xl:grid-cols-2">
          <Card eyebrow={L('تخصیص', 'Allocation')} title={L('روی چه پروژه‌هایی است', 'Working on')} action={canEdit && <button className="btn-ghost btn-sm" onClick={() => open('Allocations', { member_id: m.id })}><Plus size={14} /> {L('تخصیص', 'Allocate')}</button>}>
            {w.projects.length ? (
              <ul className="space-y-3">
                {w.projects.map((a) => {
                  const p = db.Projects.find((x) => x.id === a.project_id)
                  return (
                    <li key={a.project_id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/projects/${a.project_id}`} className="truncate font-medium hover:underline">
                          {p?.name}
                          {led.some((x) => x.id === a.project_id) && <span className="ms-2 text-[0.6875rem] font-normal text-sub">{L('مدیر محصول پروژه', 'Lead')}</span>}
                        </Link>
                        <span className="text-xs text-sub num">{fa(`${a.percent}%`)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-brand dark:bg-brand-soft" style={{ width: `${Math.min(100, (a.percent / Math.max(1, w.available)) * 100)}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty text={L('تخصیصی ندارد', 'No allocations')} />
            )}
            <div className="mt-5 border-t border-line pt-4">
              <div className="eyebrow mb-2">{L('بار ۸ هفته‌ی آینده', 'Load, next 8 weeks')}</div>
              <div className="flex gap-1">
                {weeks.map((x) => (
                  <div key={x.ws} className={cx('flex-1 rounded-md py-1.5 text-center text-[0.625rem] font-semibold num', x.load > 100 ? 'bg-bad text-white' : x.load >= 85 ? 'bg-warn/80 text-white' : 'bg-muted text-sub')} title={fmtDayMonth(x.ws)}>
                    {fa(x.load)}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card eyebrow={L('پیش رو', 'Coming up')} title={L('جلسات پیش رو', 'Upcoming meetings')}>
            {meetings.length ? (
              <ul className="space-y-1">
                {meetings.map((x) => (
                  <li key={x.id}>
                    <Link to="/meetings" className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted">
                      <CalendarDays size={15} className="text-sub" />
                      <span className="min-w-0 flex-1 truncate text-sm">{x.title}</span>
                      <span className="text-xs text-sub num">
                        {x.date === today ? L('امروز', 'Today') : fmtWeekday(x.date)} {fa(x.time)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-sub">{L('جلسه‌ای در پیش نیست', 'No upcoming meetings')}</p>
            )}
          </Card>
        </div>

        <div className="grid items-start gap-4 @xl:grid-cols-2">
          <Card eyebrow={L('کارها', 'Work')} title={L('تسک‌های باز', 'Open tasks')}>
            {hiddenCount ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm text-sub">
                <Lock size={18} /> {L('تسک‌ها خصوصی است', 'Tasks are private')}
              </div>
            ) : null}
            {tasks.length ? (
              <div className="-mx-2 mt-2">
                {tasks.slice(0, 12).map((t) => (
                  <TaskRow key={t.id} t={t} dense />
                ))}
              </div>
            ) : (
              !hiddenCount && <Empty text={L('تسک بازی ندارد', 'No open tasks')} />
            )}
          </Card>
          <Card pad={false} eyebrow={L('تحویل', 'Delivery')} title={L('خروجی‌هایی که مسئولش است', 'Deliverables owned')}>
            {dels.length ? (
              <div className="divide-y divide-line border-t border-line">
                {dels.slice(0, 8).map((d) => (
                  <DeliverableRow key={d.id} d={d} />
                ))}
              </div>
            ) : (
              <Empty text={L('خروجی ندارد', 'None')} />
            )}
          </Card>
        </div>
      </Overlap>
    </>
  )
}
