// Inline property pickers — click a value to change it in place (Linear-style).
import { useState } from 'react'
import { UserRound, FolderKanban, Search } from 'lucide-react'
import type { Priority, TaskStatus } from '../lib/types'
import { PRIORITY } from '../lib/labels'
import { columns, statusLabel } from '../lib/columns'
import { lbl, L } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Avatar, AvatarStack, MenuItem, Popover, PriorityIcon, StatusIcon, cx } from './ui'

const trig = 'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition hover:bg-muted disabled:pointer-events-none'

export function StatusPicker({ value, onChange, label = true }: { value: TaskStatus; onChange: (v: TaskStatus) => void; label?: boolean }) {
  const { canEdit } = useStore()
  return (
    <Popover
      width={200}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit} title={statusLabel(value)}>
          <StatusIcon s={value} size={15} />
          {label && <span>{statusLabel(value)}</span>}
        </button>
      )}
    >
      {(close) =>
        columns().map(({ id: s }, i) => (
          <MenuItem
            key={s}
            icon={<StatusIcon s={s} size={14} />}
            active={s === value}
            hint={String(i + 1)}
            onClick={() => {
              onChange(s)
              close()
            }}
          >
            {statusLabel(s)}
          </MenuItem>
        ))
      }
    </Popover>
  )
}

export function PriorityPicker({ value, onChange, label = true }: { value: Priority; onChange: (v: Priority) => void; label?: boolean }) {
  const { canEdit } = useStore()
  return (
    <Popover
      width={190}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit} title={lbl(PRIORITY, value)}>
          <PriorityIcon p={value} />
          {label && <span>{lbl(PRIORITY, value)}</span>}
        </button>
      )}
    >
      {(close) =>
        (['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
          <MenuItem
            key={p}
            icon={<PriorityIcon p={p} />}
            active={p === value}
            onClick={() => {
              onChange(p)
              close()
            }}
          >
            {lbl(PRIORITY, p)}
          </MenuItem>
        ))
      }
    </Popover>
  )
}

export function PersonPicker({ value, onChange, label = true, placeholder }: { value: string; onChange: (v: string) => void; label?: boolean; placeholder?: string }) {
  const { db, canEdit, me } = useStore()
  const [q, setQ] = useState('')
  const people = Array.from(new Set([me, ...db.Team.map((m) => m.name)].filter(Boolean)))
  const list = people.filter((p) => !q || p.includes(q))
  return (
    <Popover
      width={240}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit}>
          {value ? <Avatar name={value} size="xs" /> : <UserRound size={15} className="text-sub" />}
          {label && <span className={cx('max-w-[9rem] truncate', !value && 'text-sub')}>{value || placeholder || L('بدون مسئول', 'Unassigned')}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-2 border-b border-line px-2.5 pb-1.5">
            <Search size={14} className="text-sub" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && q.trim()) {
                  onChange(list[0] || q.trim())
                  close()
                }
              }}
              placeholder={L('جستجو یا نام جدید…', 'Search or new name…')}
              className="h-8 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto pt-1">
            <MenuItem
              icon={<UserRound size={14} />}
              active={!value}
              onClick={() => {
                onChange('')
                close()
              }}
            >
              {L('بدون مسئول', 'Unassigned')}
            </MenuItem>
            {list.map((p) => (
              <MenuItem
                key={p}
                icon={<Avatar name={p} size="xs" />}
                active={p === value}
                hint={p === me ? L('من', 'me') : undefined}
                onClick={() => {
                  onChange(p)
                  close()
                }}
              >
                {p}
              </MenuItem>
            ))}
            {q && !people.includes(q) && (
              <MenuItem
                icon={<UserRound size={14} />}
                onClick={() => {
                  onChange(q.trim())
                  close()
                }}
              >
                {L(`افزودن «${q}»`, `Add “${q}”`)}
              </MenuItem>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}

export function ProjectPicker({ value, onChange, emptyLabel }: { value: string; onChange: (v: string) => void; emptyLabel?: string }) {
  const { db, canEdit } = useStore()
  const p = db.Projects.find((x) => x.id === value)
  return (
    <Popover
      width={260}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit}>
          <FolderKanban size={14} className="text-sub" />
          <span className={cx('max-w-[12rem] truncate', !p && 'text-sub')}>{p ? p.name : emptyLabel || L('بدون پروژه', 'No project')}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          <MenuItem
            active={!value}
            onClick={() => {
              onChange('')
              close()
            }}
          >
            <span className="text-sub">{L('بدون پروژه', 'No project')}</span>
          </MenuItem>
          {db.Projects.filter((x) => x.status !== 'cancelled').map((x) => (
            <MenuItem
              key={x.id}
              active={x.id === value}
              hint={<span dir="ltr">{x.code}</span>}
              onClick={() => {
                onChange(x.id)
                close()
              }}
            >
              {x.name}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** Several people at once (shared with / tracked by), stored comma-separated. */
export function PeoplePicker({ value, onChange, exclude, empty }: { value: string; onChange: (v: string) => void; exclude?: string; empty?: string }) {
  const { db, canEdit } = useStore()
  const on = String(value || '').split(',').map((x) => x.trim()).filter(Boolean)
  const team = db.Team.filter((m) => String(m.active) !== 'false' && m.name !== exclude).map((m) => m.name)
  return (
    <Popover
      width={240}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit}>
          {on.length ? <AvatarStack names={on} max={4} /> : <UserRound size={15} className="text-sub" />}
          {!on.length && <span className="text-sub">{empty || L('هیچ‌کس', 'Nobody')}</span>}
        </button>
      )}
    >
      {() => (
        <div className="max-h-64 overflow-y-auto">
          {team.map((p) => {
            const sel = on.includes(p)
            return (
              <MenuItem key={p} icon={<Avatar name={p} size="xs" />} active={sel} hint={sel ? '✓' : undefined} onClick={() => onChange((sel ? on.filter((x) => x !== p) : [...on, p]).join(','))}>
                {p}
              </MenuItem>
            )
          })}
        </div>
      )}
    </Popover>
  )
}

/** A value from a short list (the task areas). */
export function ListPicker({ value, options, onChange, empty }: { value: string; options: string[]; onChange: (v: string) => void; empty: string }) {
  const { canEdit } = useStore()
  return (
    <Popover
      width={200}
      trigger={({ toggle }) => (
        <button className={trig} onClick={toggle} disabled={!canEdit}>
          <span className={cx('max-w-[10rem] truncate', !value && 'text-sub')}>{value || empty}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-64 overflow-y-auto">
          {['', ...options].map((o) => (
            <MenuItem key={o || '-'} active={o === value} onClick={() => (onChange(o), close())}>
              {o || <span className="text-sub">{empty}</span>}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** The task's assignees — one or more people (the first leads). */
export function AssigneesPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { db, canEdit, me } = useStore()
  const on = String(value || '').split(',').map((x) => x.trim()).filter(Boolean)
  const people = Array.from(new Set([me, ...db.Team.filter((m) => String(m.active) !== 'false').map((m) => m.name), ...on].filter(Boolean)))
  const toggle = (p: string) => onChange((on.includes(p) ? on.filter((x) => x !== p) : [...on, p]).join(','))
  return (
    <Popover
      width={250}
      trigger={({ toggle: t }) => (
        <button className={trig} onClick={t} disabled={!canEdit}>
          {on.length ? <AvatarStack names={on} max={3} /> : <UserRound size={15} className="text-sub" />}
          <span className={cx('max-w-[9rem] truncate', !on.length && 'text-sub')}>{on.length ? (on.length === 1 ? on[0] : L(`${on[0]} +${on.length - 1}`, `${on[0]} +${on.length - 1}`)) : L('بدون مسئول', 'Unassigned')}</span>
        </button>
      )}
    >
      {() => (
        <div className="max-h-64 overflow-y-auto">
          <div className="px-2.5 pb-1 text-[0.625rem] text-sub">{L('یک یا چند نفر — اولی مسئول اصلی است', 'One or more — the first one leads')}</div>
          {people.map((p) => {
            const i = on.indexOf(p)
            return (
              <MenuItem key={p} icon={<Avatar name={p} size="xs" />} active={i >= 0} hint={i === 0 ? L('اصلی', 'lead') : i > 0 ? '✓' : p === me ? L('من', 'me') : undefined} onClick={() => toggle(p)}>
                {p}
              </MenuItem>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
