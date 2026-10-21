// Settings for what the shared views show: calendar layers, overview widgets (on/off and order)
// and the thresholds behind team health.
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, LayoutDashboard, Users, Zap } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card } from './ui'
import { Switch } from './TaskSettings'
import { L, tr } from '../lib/i18n'
import { CAL_KEY, CAL_LAYERS, DASH_KEY, DASH_WIDGETS, readPicks, writePicks, type Choice } from '../lib/views'
import { TEAM_KEYS, teamCfg } from '../lib/teams'
import { SPRINT_KEYS, sprintCfg } from '../lib/sprints'
import { TRACKS } from '../lib/tracks'
import { teamName } from './TeamParts'
import { cx } from './ui'

/** An ordered list of on/off items stored in one Config key. */
function Picks<K extends string>({ admin, cfgKey, all, order }: { admin: boolean; cfgKey: string; all: Choice<K>[]; order?: boolean }) {
  const { setting, setSetting } = useStore()
  const picks = readPicks(setting(cfgKey), all)
  const save = (next: typeof picks) => setSetting(cfgKey, writePicks(next))
  const move = (i: number, d: number) => {
    const next = [...picks]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  return (
    <ul className="divide-y divide-line">
      {picks.map((p, i) => {
        const c = all.find((x) => x.id === p.id)!
        return (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            {order && (
              <span className="flex shrink-0 flex-col">
                <button className="text-sub hover:text-ink disabled:opacity-30" disabled={!admin || i === 0} onClick={() => move(i, -1)} aria-label={L('بالاتر', 'Up')}>
                  <ArrowUp size={13} />
                </button>
                <button className="text-sub hover:text-ink disabled:opacity-30" disabled={!admin || i === picks.length - 1} onClick={() => move(i, 1)} aria-label={L('پایین‌تر', 'Down')}>
                  <ArrowDown size={13} />
                </button>
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{tr(c.label)}</span>
              {c.hint && <span className="block text-[0.6875rem] text-sub">{tr(c.hint)}</span>}
            </span>
            <Switch on={p.on} disabled={!admin} onChange={(v) => save(picks.map((x) => (x.id === p.id ? { ...x, on: v } : x)))} />
          </li>
        )
      })}
    </ul>
  )
}

export function CalendarLayersCard({ admin }: { admin: boolean }) {
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><CalendarDays size={12} /> {L('تقویم', 'Calendar')}</span>} title={L('لایه‌های تقویم', 'Calendar layers')}>
      <p className="mb-2 text-xs leading-6 text-sub">{L('لایه‌های خاموش در تقویم نمایش داده نمی‌شوند؛ لایه‌های روشن را هر کس می‌تواند موقتاً پنهان کند.', 'Layers that are off never show; anyone can hide the others for a while.')}</p>
      <Picks admin={admin} cfgKey={CAL_KEY} all={CAL_LAYERS} />
    </Card>
  )
}

export function DashboardWidgetsCard({ admin }: { admin: boolean }) {
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><LayoutDashboard size={12} /> {L('نمای کلی', 'Overview')}</span>} title={L('بخش‌های داشبورد', 'Overview sections')}>
      <p className="mb-2 text-xs leading-6 text-sub">{L('هر بخش را روشن یا خاموش کنید و ترتیب نمایش را با فلش‌ها تغییر دهید.', 'Switch each section on or off and reorder them with the arrows.')}</p>
      <Picks admin={admin} cfgKey={DASH_KEY} all={DASH_WIDGETS} order />
    </Card>
  )
}

export function TeamHealthCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = teamCfg()
  const field = (label: string, hint: string, key: string, value: number, unit: string) => <NumField key={key} label={label} hint={hint} value={value} unit={unit} disabled={!admin} onSave={(v) => setSetting(key, String(v))} />
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Users size={12} /> {L('تیم‌ها', 'Teams')}</span>} title={L('سلامت تیم', 'Team health')}>
      <p className="mb-3 text-xs leading-6 text-sub">{L('سهم تسک‌های معوق و مسدودِ طولانی از کارهای باز، رنگ هر تیم را تعیین می‌کند.', 'The share of late and long-blocked tasks among open work sets each team’s colour.')}</p>
      <div className="space-y-3">
        {field(L('قرمز از', 'Red from'), L('درصد کارهای باز', '% of open work'), TEAM_KEYS.redPct, c.redPct, '٪')}
        {field(L('زرد از', 'Amber from'), L('درصد کارهای باز (هر مسدودی هم زرد می‌کند)', '% of open work (any blocked task also turns it amber)'), TEAM_KEYS.amberPct, c.amberPct, '٪')}
        {field(L('بازه‌ی «انجام‌شده‌ی اخیر»', '“Done recently” window'), L('برای سرعت تیم', 'For the team’s pace'), TEAM_KEYS.doneDays, c.doneDays, L('روز', 'days'))}
      </div>
    </Card>
  )
}

export function SprintSettingsCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const c = sprintCfg()
  const [prefix, setPrefix] = useState(c.prefix)
  useEffect(() => setPrefix(c.prefix), [c.prefix])
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Zap size={12} /> {L('اسپرینت', 'Sprints')}</span>} title={L('تیم‌هایی که اسپرینتی کار می‌کنند', 'Teams that work in sprints')}>
      <div className="flex flex-wrap gap-1.5">
        {TRACKS.map((t) => {
          const on = c.teams.includes(t)
          return (
            <button key={t} disabled={!admin} onClick={() => setSetting(SPRINT_KEYS.teams, (on ? c.teams.filter((x) => x !== t) : [...c.teams, t]).join(','))} className={cx('h-9 rounded-full border px-3 text-xs transition disabled:opacity-60', on ? 'border-transparent bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
              {teamName(t)}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs leading-6 text-sub">{L('کارهای این تیم‌ها نوع کار، امتیاز، اسپرینت و کلید خوانا (مثل TECH-42) می‌گیرند.', 'Work of these teams gets an issue type, points, a sprint and a readable key (e.g. TECH-42).')}</p>
      <div className="mt-4 space-y-3">
        <NumField label={L('طول پیش‌فرض اسپرینت', 'Default sprint length')} hint={L('برای اسپرینت جدید', 'For a new sprint')} value={c.days} unit={L('روز', 'days')} disabled={!admin} onSave={(v) => setSetting(SPRINT_KEYS.days, String(v))} />
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{L('پیشوند کلید کارها', 'Key prefix')}</div>
            <div className="text-[0.6875rem] text-sub">{L('مثلاً TECH ← TECH-42', 'e.g. TECH → TECH-42')}</div>
          </div>
          <input dir="ltr" className="input h-9 w-28 text-center text-sm uppercase" disabled={!admin} value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} onBlur={() => prefix && prefix !== c.prefix && setSetting(SPRINT_KEYS.prefix, prefix)} />
        </div>
      </div>
    </Card>
  )
}

function NumField({ label, hint, value, unit, disabled, onSave }: { label: string; hint: string; value: number; unit: string; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[0.6875rem] text-sub">{hint}</div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-sub">
        <input
          className="input h-9 w-20 text-center text-sm"
          inputMode="numeric"
          disabled={disabled}
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d۰-۹]/g, ''))}
          onBlur={() => {
            const n = Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
            if (n > 0 && n !== value) onSave(n)
            else setV(String(value))
          }}
        />
        {unit}
      </span>
    </div>
  )
}
