// Display settings shared by everyone (Config tab): which calendar layers exist and are on by
// default, and which overview widgets show and in what order. Each is stored as a comma list of
// ids — "id" on, "-id" off — so new layers or widgets added later still appear (on) by default.
import type { T2 } from './i18n'

export interface Choice<K extends string = string> { id: K; label: T2; hint?: T2 }

export const CAL_KEY = 'cal.layers'
export type CalLayer = 'tasks' | 'followups' | 'meetings' | 'google' | 'mizito'
export const CAL_LAYERS: Choice<CalLayer>[] = [
  { id: 'tasks', label: ['ددلاین تسک‌ها', 'Task deadlines'] },
  { id: 'meetings', label: ['جلسه‌ها', 'Meetings'] },
  { id: 'followups', label: ['پیگیری‌ها', 'Follow-ups'] },
  { id: 'mizito', label: ['موعد میزیتو', 'Mizito due dates'], hint: ['فقط برای CPTO و PgM', 'CPTO and PgM only'] },
  { id: 'google', label: ['تقویم گوگل (رویدادهای دیگر)', 'Google Calendar (other events)'], hint: ['رویدادهای تقویم که جلسه‌ی ثبت‌شده نیستند', 'Calendar events that are not a saved meeting'] },
]

export const DASH_KEY = 'dash.widgets'
export type DashWidget = 'kpis' | 'okr' | 'teams' | 'status' | 'team_load' | 'mizito' | 'people' | 'upcoming' | 'blocked'
export const DASH_WIDGETS: Choice<DashWidget>[] = [
  { id: 'kpis', label: ['شاخص‌های کلیدی', 'Key numbers'] },
  { id: 'okr', label: ['OKR فصل جاری', 'This quarter’s OKRs'] },
  { id: 'teams', label: ['وضعیت تیم‌ها', 'Team status'] },
  { id: 'status', label: ['تسک‌ها بر اساس وضعیت', 'Tasks by status'] },
  { id: 'team_load', label: ['معوق و مسدود هر تیم', 'Late & blocked per team'] },
  { id: 'mizito', label: ['میزیتو بر اساس اولویت', 'Mizito by priority'], hint: ['فقط برای CPTO و PgM', 'CPTO and PgM only'] },
  { id: 'people', label: ['بار کاری افراد', 'Workload per person'] },
  { id: 'upcoming', label: ['ددلاین‌های پیش‌رو', 'Upcoming deadlines'] },
  { id: 'blocked', label: ['مسدودها و راکدها', 'Blocked & quiet'] },
]

interface Pick<K extends string> { id: K; on: boolean }

/** Reads an ordered on/off list; ids missing from the stored value keep their default place, on. */
export function readPicks<K extends string>(raw: string | undefined, all: Choice<K>[]): Pick<K>[] {
  const known = new Set(all.map((c) => c.id as string))
  const out: Pick<K>[] = []
  String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((s) => {
      const off = s.startsWith('-')
      const id = (off ? s.slice(1) : s) as K
      if (known.has(id) && !out.some((p) => p.id === id)) out.push({ id, on: !off })
    })
  all.forEach((c) => !out.some((p) => p.id === c.id) && out.push({ id: c.id, on: true }))
  return out
}
export const writePicks = <K extends string>(p: Pick<K>[]) => p.map((x) => (x.on ? x.id : `-${x.id}`)).join(',')
