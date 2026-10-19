// Task rules, set by the program manager in the back office (Config tab, keys task.*):
// required fields, defaults, flags and the stale / blocked thresholds.
import { addDays, todayISO } from './jalali'

export const TASK_KEYS = {
  defaultDue: 'task.default_due', // '' | days from today, for everyone
  flexDefaultDue: 'task.flex_default_due', // same, for people allowed to skip the deadline
  dueRequired: 'task.due_required', // on by default; '0' = deadline optional for everyone
  projectRequired: 'task.project_required', // '1' = a project is required (except the people below)
  noDue: 'task.no_due_people', // member ids who may leave the deadline empty
  personal: 'task.personal_people', // member ids who may log personal (no-project) tasks
  areas: 'task.areas', // comma-separated list of areas (حوزه‌ها)
  flags: 'task.flags', // JSON [{id, fa, en, color}] — tracking flags
  staleDays: 'task.stale_days', // an open task untouched this many days is "stale" (default 7)
  blockedDays: 'task.blocked_days', // blocked this many days → alert (default 3)
  pingDays: 'fu.ping_days', // after a ping, the next one is due in this many days (default 2)
} as const

export interface Flag { id: string; fa: string; en: string; color: string }
export const DEFAULT_FLAGS: Flag[] = [
  { id: 'watch', fa: 'زیر نظر', en: 'Watch', color: '#2f6f9f' },
  { id: 'key', fa: 'کلیدی', en: 'Key', color: '#d97706' },
  { id: 'escalate', fa: 'اسکالیشن', en: 'Escalate', color: '#c4314b' },
]

/** Optional task fields the program manager can switch off or make required (task.field.<key> = off | on | req). */
export const TASK_FIELDS = ['assigned_at', 'flag', 'requested_by', 'link', 'start_date', 'deadline', 'handoff_date', 'test_date', 'follow_date', 'estimate', 'checklist', 'area', 'collaborators', 'watchers', 'sprint_id', 'points', 'tags', 'track'] as const
export type TaskField = (typeof TASK_FIELDS)[number]
export type FieldMode = 'off' | 'on' | 'req'
// Madar keeps one deadline (due_date) plus the assign date; the agency-era dates, sprints and points start off.
const FIELD_DEFAULT: Record<TaskField, FieldMode> = { assigned_at: 'on', flag: 'on', requested_by: 'on', link: 'on', start_date: 'off', estimate: 'off', checklist: 'on', deadline: 'off', handoff_date: 'off', test_date: 'off', follow_date: 'on', area: 'off', collaborators: 'on', watchers: 'on', sprint_id: 'off', points: 'off', tags: 'on', track: 'on' }
export const fieldKey = (f: TaskField) => `task.field.${f}`

interface Person { id: string; access?: string }
export interface TaskCfg { defaultDue: string; flexDefaultDue: string; dueRequired: boolean; projectRequired: boolean; noDue: string[]; personal: string[]; areas: string[]; fields: Record<TaskField, FieldMode>; flags: Flag[]; staleDays: number; blockedDays: number; pingDays: number }

let cfg: TaskCfg = { defaultDue: '0', flexDefaultDue: '', dueRequired: true, projectRequired: false, noDue: [], personal: [], areas: [], fields: { ...FIELD_DEFAULT }, flags: DEFAULT_FLAGS, staleDays: 7, blockedDays: 3, pingDays: 2 }
export const taskCfg = () => cfg

/** Reads the rules; the people lists default to the CEO (exec). */
export function readTaskCfg(get: (k: string) => string | undefined, team: Person[]): TaskCfg {
  const ceo = team.filter((m) => m.access === 'exec').map((m) => m.id)
  const list = (k: string) => {
    const v = get(k)
    return v === undefined ? ceo : v.split(',').map((x) => x.trim()).filter(Boolean)
  }
  return {
    defaultDue: get(TASK_KEYS.defaultDue) ?? '0',
    flexDefaultDue: get(TASK_KEYS.flexDefaultDue) ?? '',
    dueRequired: get(TASK_KEYS.dueRequired) !== '0',
    projectRequired: get(TASK_KEYS.projectRequired) === '1',
    noDue: list(TASK_KEYS.noDue),
    personal: list(TASK_KEYS.personal),
    areas: (get(TASK_KEYS.areas) || '').split(/[,،\n]/).map((x) => x.trim()).filter(Boolean),
    fields: Object.fromEntries(TASK_FIELDS.map((f) => {
      const v = get(fieldKey(f))
      return [f, v === 'off' || v === 'on' || v === 'req' ? v : FIELD_DEFAULT[f]]
    })) as Record<TaskField, FieldMode>,
    flags: readFlags(get(TASK_KEYS.flags)),
    staleDays: Number(get(TASK_KEYS.staleDays)) || 7,
    blockedDays: Number(get(TASK_KEYS.blockedDays)) || 3,
    pingDays: Number(get(TASK_KEYS.pingDays)) || 2,
  }
}

function readFlags(raw: string | undefined): Flag[] {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (Array.isArray(v)) {
      const list = v.filter((x) => x && x.id).map((x, i) => ({ id: String(x.id), fa: String(x.fa || x.en || x.id), en: String(x.en || x.fa || x.id), color: String(x.color || DEFAULT_FLAGS[i % 3].color) }))
      return list
    }
  } catch {}
  return DEFAULT_FLAGS
}
export const flagOf = (id?: string) => (id ? cfg.flags.find((f) => f.id === id) : undefined)
export const setTaskCfg = (c: TaskCfg) => (cfg = c)

export const canSkipDue = (m?: Person) => !!m && cfg.noDue.includes(m.id)
export const canPersonal = (m?: Person) => !!m && cfg.personal.includes(m.id)
export const needsDue = (m?: Person) => cfg.dueRequired && !canSkipDue(m)
export const needsProject = (m?: Person) => cfg.projectRequired && !canPersonal(m)
/** Default deadline offset in days for this person ('' = none). */
export const dueDaysFor = (m?: Person) => (canSkipDue(m) ? cfg.flexDefaultDue : cfg.defaultDue || '0')
export const dueFor = (m?: Person) => {
  const d = dueDaysFor(m)
  return d === '' ? '' : addDays(todayISO(), Number(d) || 0)
}

/** Whether a field shows on the task form (area only once areas are defined). */
export const fieldOn = (f: TaskField) => cfg.fields[f] !== 'off' && (f !== 'area' || cfg.areas.length > 0)
export const fieldReq = (f: TaskField) => cfg.fields[f] === 'req' && fieldOn(f)
