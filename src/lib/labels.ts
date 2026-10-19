import type { BuiltinStatus, Deliverable, Meeting, MeetingSeries, Health, Priority, ProjectStatus, FollowUpStatus, Risk, Milestone, Sprint, ScopeItem, FollowUp } from './types'
import type { T2 } from './i18n'

export const PROJECT_STATUS: Record<ProjectStatus, T2> = {
  planning: ['برنامه‌ریزی', 'Planning'],
  active: ['در حال اجرا', 'Active'],
  on_hold: ['متوقف', 'On hold'],
  completed: ['تکمیل‌شده', 'Completed'],
  cancelled: ['لغوشده', 'Cancelled'],
}

export const PRIORITY: Record<Priority, T2> = {
  critical: ['بحرانی', 'Critical'],
  high: ['بالا', 'High'],
  medium: ['متوسط', 'Medium'],
  low: ['پایین', 'Low'],
}

export const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const HEALTH: Record<Health, T2> = {
  green: ['سالم', 'On track'],
  amber: ['نیازمند توجه', 'At risk'],
  red: ['در خطر', 'Off track'],
}

export const TASK_STATUS: Record<BuiltinStatus, T2> = {
  todo: ['برای انجام', 'To do'],
  in_progress: ['در حال انجام', 'In progress'],
  review: ['بازبینی', 'In review'],
  blocked: ['مسدود', 'Blocked'],
  done: ['انجام‌شده', 'Done'],
}

export const TASK_STATUS_ORDER: BuiltinStatus[] = ['todo', 'in_progress', 'review', 'blocked', 'done']

export const FOLLOWUP_STATUS: Record<FollowUpStatus, T2> = {
  open: ['باز', 'Open'],
  waiting: ['منتظر پاسخ', 'Waiting'],
  done: ['بسته‌شده', 'Closed'],
}

export const CHANNEL: Record<FollowUp['channel'], T2> = {
  meeting: ['جلسه', 'Meeting'],
  call: ['تماس', 'Call'],
  email: ['ایمیل', 'Email'],
  chat: ['پیام', 'Message'],
  other: ['سایر', 'Other'],
}

export const RISK_TYPE: Record<Risk['type'], T2> = {
  risk: ['ریسک', 'Risk'],
  issue: ['مسئله', 'Issue'],
  dependency: ['وابستگی', 'Dependency'],
  decision: ['تصمیم', 'Decision'],
}

export const RISK_STATUS: Record<Risk['status'], T2> = {
  open: ['باز', 'Open'],
  mitigating: ['در حال کاهش', 'Mitigating'],
  closed: ['بسته', 'Closed'],
}

export const MILESTONE_STATUS: Record<Milestone['status'], T2> = {
  pending: ['آینده', 'Upcoming'],
  in_progress: ['در جریان', 'In progress'],
  done: ['انجام‌شده', 'Done'],
  missed: ['از دست رفته', 'Missed'],
}

export const SPRINT_STATUS: Record<Sprint['status'], T2> = {
  planned: ['برنامه‌ریزی‌شده', 'Planned'],
  active: ['فعال', 'Active'],
  closed: ['بسته‌شده', 'Closed'],
}

export const SCOPE_STATUS: Record<ScopeItem['status'], T2> = {
  planned: ['برنامه‌ریزی‌شده', 'Planned'],
  in_progress: ['در حال انجام', 'In progress'],
  delivered: ['تحویل‌شده', 'Delivered'],
  changed: ['تغییر یافته', 'Changed'],
  removed: ['حذف‌شده', 'Removed'],
}

export const ROLE: Record<string, T2> = {
  admin: ['مدیر سیستم', 'Admin'],
  editor: ['ویرایشگر', 'Editor'],
  viewer: ['فقط مشاهده', 'Viewer'],
}

/** Bilingual label maps as option lists for selects. */
export const options = (map: Record<string, T2>, lang: 'fa' | 'en') => Object.entries(map).map(([value, l]) => ({ value, label: lang === 'fa' ? l[0] : l[1] }))

export const DELIVERABLE_STATUS: Record<Deliverable['status'], T2> = {
  planned: ['برنامه‌ریزی‌شده', 'Planned'],
  in_progress: ['در جریان', 'In progress'],
  at_risk: ['در خطر', 'At risk'],
  delivered: ['تحویل شد', 'Delivered'],
  dropped: ['حذف شد', 'Dropped'],
}
export const CONFIDENCE: Record<Deliverable['confidence'], T2> = {
  high: ['اطمینان بالا', 'High confidence'],
  medium: ['اطمینان متوسط', 'Medium confidence'],
  low: ['اطمینان پایین', 'Low confidence'],
}
/** Meeting series — names are editable in the back office (Config org.series). */
export const MEETING_SERIES: Record<MeetingSeries, T2> = {
  portfolio: ['ویکلی دپارتمان CPTO', 'CPTO department weekly'],
  unit: ['ویکلی لاین / تیم', 'Line / team weekly'],
  one_on_one: ['وان‌آن‌وان', 'One-on-one'],
  adhoc: ['جلسه‌ی موردی / بین‌تیمی', 'Ad-hoc / cross-team'],
  external: ['جلسه با واحدها و سازمان‌های دیگر', 'With other units & organisations'],
  planning: ['جلسه‌ی برنامه‌ریزی', 'Planning session'],
  other: ['سایر جلسات', 'Other meetings'],
}
/** Planning sessions are held once, for a purpose, not copied every week ('demo' and 'retro' are kept
 *  only so meetings saved by 1.11.0 still read as planning sessions). */
export const AGILE_SERIES = ['planning', 'demo', 'retro']
/** What a planning session is for — names are editable in the back office (Config org.plans). */
export const PLAN_PURPOSE: Record<string, T2> = {
  demo: ['آماده‌سازی دمو', 'Demo prep'],
  roadmap: ['بستن رودمپ', 'Roadmap'],
  sprint: ['برنامه‌ریزی اسپرینت', 'Sprint planning'],
  release: ['انتشار و تحویل', 'Release'],
  other: ['سایر', 'Other'],
}
/** Series that repeat every week (everything except planning sessions, one-on-ones, ad-hoc, external and other meetings). */
export const isWeeklySeries = (s: string) => !!s && !['one_on_one', 'adhoc', 'external', 'other'].includes(s) && !AGILE_SERIES.includes(s)
export const MEETING_STATUS: Record<Meeting['status'], T2> = {
  scheduled: ['برنامه‌ریزی‌شده', 'Scheduled'],
  held: ['برگزار شد', 'Held'],
  cancelled: ['لغو شد', 'Cancelled'],
}

/** Job titles (Team.role). Stored as the code; old free-text titles are mapped by jobCode. */
export const JOB_TITLE: Record<string, T2> = {
  cpto: ['مدیر ارشد محصول و فناوری', 'CPTO'],
  pgm: ['مدیر برنامه', 'Program Manager'],
  line: ['مدیر لاین', 'Line Manager'],
  pm: ['مدیر محصول', 'Product Manager'],
  lead: ['سرپرست تیم', 'Team Lead'],
  data: ['تحلیلگر داده', 'Data Analyst'],
  eng: ['مهندس نرم‌افزار', 'Software Engineer'],
  pd: ['طراح محصول', 'Product Designer'],
  spec: ['کارشناس', 'Specialist'],
}
const LEGACY_TITLE: Record<string, string> = {
  'مدیر برنامه': 'pgm', 'پروداکت منیجر': 'pm', 'مدیر محصول': 'pm', 'پروداکت دیزاینر': 'pd',
  'program manager': 'pgm', 'pgm': 'pgm', 'product manager': 'pm', 'product designer': 'pd', 'cpto': 'cpto',
}
/** Title options with their code visible, e.g. "مدیرعامل · CEO". */
export const JOB_TITLE_OPTIONS: Record<string, T2> = Object.fromEntries(
  Object.entries(JOB_TITLE).map(([k, [fa, en]]) => [k, [`${fa} · ${k.toUpperCase()}`, en === k.toUpperCase() ? en : `${en} · ${k.toUpperCase()}`]]),
)
export const jobCode = (role: string) => {
  const r = String(role || '').trim()
  const k = r.toLowerCase()
  return JOB_TITLE[k] ? k : LEGACY_TITLE[k] || LEGACY_TITLE[r] || r
}

/** Teams (Team.team, comma-separated — a person can be in several). */
export const TEAM_NAMES: Record<string, T2> = {
  leadership: ['مدیریت دپارتمان', 'Department leadership'],
  pmo: ['PMO', 'PMO'],
  product: ['محصول', 'Product'],
  crm_ops: ['CRM و عملیات', 'CRM & operations'],
  data: ['داده', 'Data'],
  tech: ['فنی', 'Tech'],
}
const LEGACY_TEAM: Record<string, string> = { 'مدیریت': 'leadership', 'فنی': 'tech', 'پروداکت': 'product', 'محصول': 'product', 'فناوری': 'tech', 'داده': 'data' }
/** Team codes for a person; blank = derived from the title (CPTO → leadership) and unit. */
export function teamCodes(team: string, role = '', track = ''): string[] {
  const list = String(team || '').split(/[,،]/).map((x) => x.trim()).filter(Boolean).map((x) => LEGACY_TEAM[x] || x.toLowerCase())
  if (list.length) return [...new Set(list)]
  const r = jobCode(role)
  const out: string[] = []
  if (r === 'cpto') out.push('leadership')
  if (r === 'pgm') out.push('pmo')
  if (r === 'line' || r === 'pm' || r === 'pd' || track === 'product') out.push('product')
  if (r === 'data' || track === 'data') out.push('data')
  if (r === 'eng' || track === 'tech') out.push('tech')
  if (track === 'crm_ops') out.push('crm_ops')
  return [...new Set(out)]
}

/** Sign-in name: the username column, or made from the English name (Vahid Ameri → vahid.ameri). Mirrors Code.gs. */
export function usernameOf(m: { username?: string; name_en?: string; email?: string }) {
  const u = String(m.username || '').trim().toLowerCase()
  if (u) return u
  const n = String(m.name_en || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  return n || String(m.email || '').split('@')[0].toLowerCase()
}

export const ACCESS: Record<string, T2> = {
  super: ['مدیر برنامه · همه‌چیز + بک‌آفیس', 'Program manager · everything + back office'],
  exec: ['CPTO · همه‌چیز', 'CPTO · everything'],
  head: ['هد · نمای کل', 'Head · company-wide view'],
  member: ['عضو · پروژه‌های خودش', 'Member · own projects'],
}
export const CONTRACT_KIND: Record<string, T2> = {
  client: ['کارفرما', 'Client'],
  vendor: ['تأمین‌کننده', 'Vendor'],
  partner: ['شریک', 'Partner'],
  nda: ['محرمانگی (NDA)', 'NDA'],
  other: ['سایر', 'Other'],
}
export const CONTRACT_STATUS: Record<string, T2> = {
  draft: ['پیش‌نویس', 'Draft'],
  negotiation: ['در مذاکره', 'Negotiation'],
  signed: ['امضا شده', 'Signed'],
  active: ['در حال اجرا', 'Active'],
  expired: ['پایان یافته', 'Expired'],
  terminated: ['فسخ شده', 'Terminated'],
}
