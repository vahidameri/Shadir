import { NavLink } from 'react-router-dom'
import { L } from '../lib/i18n'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { cx } from './ui'

type Tab = { to: string; label: string; lead?: boolean }

// Related pages share one sidebar entry and switch with these tabs on the band.
// `lead` tabs are for leadership only (they are hidden for everyone else).
export const HUBS = {
  work: (): Tab[] => [
    { to: '/tasks', label: L('تسک‌ها', 'Tasks') },
    { to: '/followups', label: L('پیگیری‌ها', 'Follow-ups') },
  ],
}
export type Hub = keyof typeof HUBS
export const hubOf = (path: string): Hub | undefined => (Object.keys(HUBS) as Hub[]).find((h) => HUBS[h]().some((x) => x.to === path))

export function HubNav({ hub }: { hub: Hub }) {
  const { access } = useStore()
  const tabs = HUBS[hub]().filter((x) => !x.lead || can.portfolio(access))
  if (tabs.length < 2) return null
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 no-print">
      {tabs.map((x) => (
        <NavLink key={x.to} to={x.to} end className={({ isActive }) => cx('h-8 rounded-full px-3.5 text-xs font-medium leading-8 transition', isActive ? 'bg-white text-band' : 'text-white/65 hover:text-white')}>
          {x.label}
        </NavLink>
      ))}
    </div>
  )
}
