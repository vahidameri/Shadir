import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { mzCfg } from '../lib/mizito'
import { Plus, Trash2 } from 'lucide-react'
import { ORG_KEYS, orgList } from '../lib/org'
import type { SheetName } from '../lib/types'
import { weekCfg } from '../lib/weeks'
import { canPersonal, dueFor, fieldOn, fieldReq, needsDue, needsProject, taskCfg, TASK_FIELDS, type TaskField } from '../lib/taskcfg'
import { columns, isBlocked, statusLabel } from '../lib/columns'
import { useStore } from '../lib/store'
import { uid } from '../lib/api'
import { todayISO } from '../lib/jalali'
import { L, lbl, tr, type T2 } from '../lib/i18n'
import { TRACK, TRACKS } from '../lib/tracks'
import {
  CHANNEL, CONFIDENCE, CONTRACT_KIND, CONTRACT_STATUS, DELIVERABLE_STATUS, MEETING_SERIES, MEETING_STATUS, PLAN_PURPOSE, AGILE_SERIES, FOLLOWUP_STATUS, HEALTH, MILESTONE_STATUS, PRIORITY, PROJECT_STATUS, RISK_STATUS, RISK_TYPE, SCOPE_STATUS, SPRINT_STATUS,
  ACCESS, JOB_TITLE_OPTIONS, TEAM_NAMES } from '../lib/labels'
import { Sheet, cx } from './ui'
import { DatePicker } from './DatePicker'
import { ItemSheet } from './ItemSheet'
import { useAuto } from '../lib/automations'
import { can } from '../lib/access'
import { addQuarter, quarterLabel, quarterOf, quarterOptions } from '../lib/okr'

type FieldType = 'text' | 'textarea' | 'select' | 'multi' | 'date' | 'number' | 'project' | 'person' | 'people' | 'sprint' | 'member' | 'scale' | 'status' | 'area' | 'side' | 'title' | 'assignees' | 'flag' | 'tier' | 'mzstatus' | 'mzcat' | 'mzaction' | 'pprio' | 'kr' | 'quarter' | 'objective'
interface Field {
  key: string
  label: T2
  type: FieldType
  options?: Record<string, T2>
  half?: boolean
  required?: boolean
  placeholder?: T2
}

export type EditableSheet = Exclude<SheetName, 'Comments' | 'Files' | 'Config' | 'Handoffs' | 'Deliveries' | 'History' | 'MizitoMentions'>

const SCHEMAS: Record<EditableSheet, { title: T2; prefix: string; fields: Field[]; defaults: () => Record<string, unknown> }> = {
  Tasks: {
    title: ['تسک', 'Task'],
    prefix: 'T',
    fields: [
      { key: 'title', label: ['عنوان تسک', 'Task title'], type: 'text', required: true },
      { key: 'description', label: ['توضیحات', 'Description'], type: 'textarea' },
      { key: 'project_id', label: ['محصول / پروژه', 'Product / project'], type: 'project', half: true },
      { key: 'area', label: ['حوزه', 'Area'], type: 'area', half: true },
      { key: 'kr_id', label: ['کی‌ریزالت (OKR)', 'Key result (OKR)'], type: 'kr', half: true },
      { key: 'assignee', label: ['مسئول انجام (یک یا چند نفر)', 'Assignees (one or more)'], type: 'assignees' },
      { key: 'requested_by', label: ['درخواست‌دهنده', 'Requested by'], type: 'person', half: true },
      { key: 'assigned_at', label: ['تاریخ اساین', 'Assigned on'], type: 'date', half: true },
      { key: 'collaborators', label: ['همکاران (تسک مشترک)', 'Shared with'], type: 'people' },
      { key: 'watchers', label: ['ناظرها (دیده‌بان و اعلان)', 'Watchers (Lookout & alerts)'], type: 'people' },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'status', half: true },
      { key: 'priority', label: ['اولویت', 'Priority'], type: 'select', options: PRIORITY, half: true },
      { key: 'blocked_reason', label: ['علت انسداد', 'Why is it blocked?'], type: 'textarea' },
      { key: 'blocked_by', label: ['مسدود به‌خاطر (شخص، واحد یا موضوع)', 'Blocked by (person, unit or thing)'], type: 'person', half: true },
      { key: 'flag', label: ['پرچم', 'Flag'], type: 'flag', half: true },
      { key: 'start_date', label: ['تاریخ شروع', 'Start date'], type: 'date', half: true },
      { key: 'due_date', label: ['ددلاین', 'Deadline'], type: 'date', half: true },
      { key: 'follow_date', label: ['تاریخ یادآوری', 'Reminder date'], type: 'date', half: true },
      { key: 'handoff_date', label: ['تحویل به پروداکت', 'Hand-off to product'], type: 'date', half: true },
      { key: 'test_date', label: ['زمان تست', 'Testing'], type: 'date', half: true },
      { key: 'deadline', label: ['ددلاین (تحویل نهایی)', 'Deadline (final delivery)'], type: 'date', half: true },
      { key: 'notify', label: ['اعلان‌ها', 'Alerts'], type: 'select', options: { '': ['روشن', 'On'], off: ['خاموش', 'Off'] }, half: true },
      { key: 'estimate', label: ['تخمین (ساعت)', 'Estimate (hours)'], type: 'number', half: true },
      { key: 'points', label: ['امتیاز', 'Story points'], type: 'number', half: true },
      { key: 'tags', label: ['برچسب‌ها', 'Tags'], type: 'text', half: true, placeholder: ['با کاما جدا کنید', 'Comma separated'] },
      { key: 'track', label: ['تیم', 'Team'], type: 'side', half: true },
      { key: 'private', label: ['دیده‌شدن', 'Visibility'], type: 'select', options: { '': ['عمومی', 'Visible'], '1': ['خصوصی', 'Private'] }, half: true },
      { key: 'link', label: ['لینک (میزیتو یا سند)', 'Link (Mizito or doc)'], type: 'text', placeholder: ['https://mizito.noyanet.com/…', 'https://mizito.noyanet.com/…'] },
    ],
    defaults: () => ({ private: '', flag: '', link: '', requested_by: '', assigned_at: '', blocked_reason: '', blocked_by: '', blocked_since: '', updated_at: '', status: 'todo', priority: 'medium', points: 0, created_at: todayISO(), track: '', depends_on: '', meeting_id: '', deadline: '', handoff_date: '', test_date: '', follow_date: '', area: '', collaborators: '', watchers: '', notify: '', start_date: '', estimate: '', checklist: '' }),
  },
  Contacts: {
    title: ['شخص', 'Person'],
    prefix: 'CT',
    fields: [
      { key: 'name', label: ['نام (فارسی)', 'Name (Persian)'], type: 'text', required: true, half: true },
      { key: 'name_en', label: ['نام (انگلیسی)', 'Name (English)'], type: 'text', half: true },
      { key: 'title', label: ['سمت', 'Title'], type: 'text', half: true },
      { key: 'org', label: ['واحد یا سازمان', 'Unit or organisation'], type: 'text', half: true },
      { key: 'tier', label: ['رده (تعیین SLA و اولویت)', 'Tier (sets SLA & priority)'], type: 'tier', half: true },
      { key: 'active', label: ['وضعیت', 'Status'], type: 'select', options: { true: ['فعال', 'Active'], false: ['غیرفعال', 'Inactive'] }, half: true },
      { key: 'email', label: ['ایمیل', 'Email'], type: 'text', half: true },
      { key: 'phone', label: ['تلفن', 'Phone'], type: 'text', half: true },
      { key: 'notes', label: ['یادداشت', 'Notes'], type: 'textarea' },
    ],
    defaults: () => ({ active: 'true', tier: '', name_en: '', title: '', org: '', email: '', phone: '', notes: '' }),
  },
  Mizito: {
    title: ['مورد میزیتو', 'Mizito item'],
    prefix: 'MZ',
    fields: [
      { key: 'link', label: ['لینک تسک در میزیتو', 'Mizito task link'], type: 'text', placeholder: ['https://mizito.noyanet.com/#/ws/tasks/…', 'https://mizito.noyanet.com/#/ws/tasks/…'] },
      { key: 'title', label: ['عنوان', 'Title'], type: 'text', required: true },
      { key: 'asked_by', label: ['چه کسی مطرح کرد / منشن کرد', 'Raised / mentioned by'], type: 'person', half: true },
      { key: 'mentioned', label: ['چه کسی منشن شد', 'Who was mentioned'], type: 'people', half: true },
      { key: 'category', label: ['دسته', 'Category'], type: 'mzcat', half: true },
      { key: 'action', label: ['نوع اقدام', 'Action needed'], type: 'mzaction', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'mzstatus', half: true },
      { key: 'due_date', label: ['ددلاین', 'Deadline'], type: 'date', half: true },
      { key: 'urgent', label: ['فوری', 'Urgent'], type: 'select', options: { '': ['عادی', 'Normal'], '1': ['فوری', 'Urgent'] }, half: true },
      { key: 'priority_override', label: ['اولویت دستی', 'Manual priority'], type: 'pprio', half: true },
      { key: 'assigned_to', label: ['سپرده به (واحد یا فرد)', 'Handed to (unit or person)'], type: 'person', half: true },
      { key: 'received_at', label: ['تاریخ منشن', 'Mentioned on'], type: 'date', half: true },
      { key: 'description', label: ['شرح', 'Description'], type: 'textarea' },
      { key: 'docs', label: ['مستندات (هر لینک در یک خط)', 'Documents (one link per line)'], type: 'textarea' },
      { key: 'outcome', label: ['نتیجه', 'Outcome'], type: 'textarea' },
    ],
    defaults: () => ({ mz_key: '', link: '', description: '', docs: '', asked_by: '', mentioned: '', category: '', action: '', status: '', priority_override: '', override_reason: '', urgent: '', assigned_to: '', due_date: '', received_at: '', last_mention_at: '', last_mention_by: '', outcome: '', notes: '', created_at: '', updated_at: '', closed_at: '' }),
  },
  FollowUps: {
    title: ['پیگیری', 'Follow-up'],
    prefix: 'F',
    fields: [
      { key: 'subject', label: ['موضوع پیگیری', 'Follow-up subject'], type: 'text', required: true },
      { key: 'person', label: ['از چه کسی؟', 'With whom?'], type: 'person', half: true },
      { key: 'waiting_for', label: ['منتظر چه چیزی هستیم؟', 'What are we waiting for?'], type: 'text' },
      { key: 'channel', label: ['کانال', 'Channel'], type: 'select', options: CHANNEL, half: true },
      { key: 'project_id', label: ['محصول / پروژه', 'Product / project'], type: 'project', half: true },
      { key: 'due_date', label: ['پینگ بعدی', 'Next ping'], type: 'date', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: FOLLOWUP_STATUS, half: true },
      { key: 'priority', label: ['اولویت', 'Priority'], type: 'select', options: PRIORITY, half: true },
      { key: 'link', label: ['لینک (مثلاً تسک میزیتو)', 'Link (e.g. the Mizito task)'], type: 'text', placeholder: ['https://mizito.noyanet.com/…', 'https://mizito.noyanet.com/…'] },
      { key: 'notes', label: ['یادداشت / سابقه', 'Notes / history'], type: 'textarea' },
    ],
    defaults: () => ({ waiting_for: '', link: '', last_ping: '', ping_count: 0, status: 'open', priority: 'medium', channel: 'meeting', created_at: todayISO(), due_date: todayISO(), owner: '' }),
  },
  Projects: {
    title: ['پروژه', 'Project'],
    prefix: 'P',
    fields: [
      { key: 'name', label: ['نام', 'Name'], type: 'text', required: true },
      { key: 'kind', label: ['نوع', 'Kind'], type: 'select', options: { product: ['محصول (همیشگی، مثل کلاسا)', 'Product (always on, e.g. Kelasa)'], project: ['پروژه (شروع و پایان دارد)', 'Project (has a start and an end)'] }, half: true },
      { key: 'team', label: ['تیم', 'Team'], type: 'side', half: true, required: true },
      { key: 'code', label: ['کد', 'Code'], type: 'text', half: true, placeholder: ['PRJ-XXX', 'PRJ-XXX'] },
      { key: 'owner', label: ['مدیر محصول / مسئول', 'Product manager / lead'], type: 'person', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: PROJECT_STATUS, half: true },
      { key: 'priority', label: ['اولویت', 'Priority'], type: 'select', options: PRIORITY, half: true },
      { key: 'phase', label: ['فاز فعلی', 'Current phase'], type: 'text', half: true },
      { key: 'start_date', label: ['شروع', 'Start'], type: 'date', half: true },
      { key: 'end_date', label: ['ددلاین', 'Deadline'], type: 'date', half: true },
      { key: 'progress', label: ['پیشرفت دستی (٪؛ خالی = از تسک‌ها)', 'Manual progress (%; blank = from tasks)'], type: 'number', half: true },
      { key: 'health_override', label: ['سلامت دستی', 'Health override'], type: 'select', options: { '': ['خودکار', 'Automatic'], ...HEALTH }, half: true },
      { key: 'objective', label: ['چشم‌انداز / هدف', 'Vision / goal'], type: 'text' },
      { key: 'description', label: ['شرح', 'Description'], type: 'textarea' },
    ],
    defaults: () => ({ kind: 'product', team: '', status: 'active', priority: 'medium', start_date: todayISO(), progress: '', health_override: '', paused_at: '', pause_reason: '', delivery_day: '', last_delivery: '', archived: '', archived_at: '', client: '', liaison: '', liaison_contact: '', category: '' }),
  },
  Milestones: {
    title: ['مایلستون', 'Milestone'],
    prefix: 'MS',
    fields: [
      { key: 'title', label: ['عنوان', 'Title'], type: 'text', required: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'owner', label: ['مسئول', 'Assignee'], type: 'person', half: true },
      { key: 'planned_date', label: ['تاریخ برنامه', 'Planned date'], type: 'date', half: true },
      { key: 'actual_date', label: ['تاریخ واقعی', 'Actual date'], type: 'date', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: MILESTONE_STATUS, half: true },
      { key: 'weight', label: ['وزن در پیشرفت', 'Weight in progress'], type: 'number', half: true },
    ],
    defaults: () => ({ status: 'pending', weight: 1 }),
  },
  Sprints: {
    title: ['اسپرینت', 'Sprint'],
    prefix: 'S',
    fields: [
      { key: 'name', label: ['نام', 'Name'], type: 'text', required: true, half: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'goal', label: ['هدف اسپرینت', 'Sprint goal'], type: 'text' },
      { key: 'start_date', label: ['شروع', 'Start'], type: 'date', half: true },
      { key: 'end_date', label: ['پایان', 'End'], type: 'date', half: true },
      { key: 'committed_points', label: ['امتیاز تعهدشده', 'Committed points'], type: 'number', half: true },
      { key: 'completed_points', label: ['امتیاز انجام‌شده', 'Completed points'], type: 'number', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: SPRINT_STATUS },
    ],
    defaults: () => ({ status: 'planned', committed_points: 0, completed_points: 0 }),
  },
  Risks: {
    title: ['ریسک / مسئله', 'Risk / issue'],
    prefix: 'R',
    fields: [
      { key: 'title', label: ['عنوان', 'Title'], type: 'text', required: true },
      { key: 'type', label: ['نوع', 'Type'], type: 'select', options: RISK_TYPE, half: true },
      { key: 'project_id', label: ['محصول / پروژه', 'Product / project'], type: 'project', half: true },
      { key: 'probability', label: ['احتمال', 'Probability'], type: 'scale', half: true },
      { key: 'impact', label: ['اثر', 'Impact'], type: 'scale', half: true },
      { key: 'owner', label: ['مالک', 'Owner'], type: 'person', half: true },
      { key: 'due_date', label: ['تاریخ اقدام', 'Action date'], type: 'date', half: true },
      { key: 'mitigation', label: ['برنامه‌ی کاهش / اقدام', 'Mitigation / action'], type: 'textarea' },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: RISK_STATUS },
    ],
    defaults: () => ({ type: 'risk', probability: 3, impact: 3, status: 'open' }),
  },
  Scope: {
    title: ['آیتم محدوده‌ی کار', 'Scope item'],
    prefix: 'SC',
    fields: [
      { key: 'item', label: ['آیتم', 'Item'], type: 'text', required: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'type', label: ['داخل / خارج محدوده‌ی کار', 'In / out of scope'], type: 'select', options: { in: ['داخل محدوده‌ی کار', 'In scope'], out: ['خارج از محدوده‌ی کار', 'Out of scope'] }, half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: SCOPE_STATUS, half: true },
      { key: 'date', label: ['تاریخ', 'Date'], type: 'date', half: true },
      { key: 'change_note', label: ['یادداشت تغییر', 'Change note'], type: 'textarea' },
    ],
    defaults: () => ({ type: 'in', status: 'planned', date: todayISO() }),
  },
  Updates: {
    title: ['گزارش وضعیت هفتگی', 'Weekly status update'],
    prefix: 'U',
    fields: [
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'week_date', label: ['تاریخ', 'Date'], type: 'date', half: true },
      { key: 'health', label: ['وضعیت کلی', 'Overall health'], type: 'select', options: HEALTH, half: true },
      { key: 'author', label: ['گزارش‌دهنده', 'Reporter'], type: 'person', half: true },
      { key: 'summary', label: ['خلاصه برای مدیریت', 'Executive summary'], type: 'textarea', required: true },
      { key: 'done', label: ['انجام‌شده‌ها', 'Done'], type: 'textarea' },
      { key: 'next', label: ['برنامه‌ی هفته‌ی بعد', 'Next week'], type: 'textarea' },
      { key: 'blockers', label: ['موانع / نیاز به کمک مدیریت', 'Blockers / help needed'], type: 'textarea' },
    ],
    defaults: () => ({ health: 'green', week_date: todayISO() }),
  },
  Team: {
    title: ['عضو تیم', 'Team member'],
    prefix: 'M',
    fields: [
      { key: 'name', label: ['نام', 'Name'], type: 'text', required: true, half: true },
      { key: 'name_en', label: ['نام انگلیسی', 'Name in English'], type: 'text', half: true },
      { key: 'username', label: ['نام کاربری', 'Username'], type: 'text', half: true, placeholder: ['خودکار از نام انگلیسی', 'From the English name'] },
      { key: 'role', label: ['سمت', 'Title'], type: 'title', half: true },
      { key: 'team', label: ['تیم‌ها', 'Teams'], type: 'multi', options: TEAM_NAMES },
      { key: 'track', label: ['تیم', 'Team'], type: 'side', half: true },
      { key: 'capacity', label: ['ظرفیت', 'Capacity'], type: 'number', half: true },
      { key: 'email', label: ['ایمیل گوگل', 'Google email'], type: 'text', half: true },
      { key: 'phone', label: ['تلفن', 'Phone'], type: 'text', half: true },
      { key: 'access', label: ['سطح دسترسی', 'Access level'], type: 'select', options: ACCESS, half: true },
      { key: 'active', label: ['ورود', 'Sign-in'], type: 'select', options: { true: ['فعال', 'Active'], false: ['غیرفعال', 'Disabled'] }, half: true },
      { key: 'tasks_private', label: ['تسک‌های این فرد', 'This person’s tasks'], type: 'select', options: { '': ['عمومی', 'Visible'], '1': ['خصوصی', 'Private'] } },
    ],
    defaults: () => ({ name_en: '', capacity: 100, photo: '', tasks_private: '', phone: '', access: 'member', active: 'true' }),
  },
  Objectives: {
    title: ['هدف (Objective)', 'Objective'],
    prefix: 'O',
    fields: [
      { key: 'title', label: ['هدف', 'Objective'], type: 'text', required: true, placeholder: ['مثلاً «تجربه‌ی ثبت‌نام کلاسا را روان کنیم»', 'e.g. “Make Kelasa sign-up effortless”'] },
      { key: 'team', label: ['تیم', 'Team'], type: 'side', half: true, required: true },
      { key: 'quarter', label: ['فصل', 'Quarter'], type: 'quarter', half: true, required: true },
      { key: 'owner', label: ['مسئول', 'Owner'], type: 'person', half: true },
      { key: 'sort', label: ['ترتیب', 'Order'], type: 'number', half: true },
      { key: 'description', label: ['چرا این هدف؟', 'Why this objective?'], type: 'textarea' },
    ],
    defaults: () => ({ quarter: quarterOf(), sort: 1, description: '' }),
  },
  KeyResults: {
    title: ['کی‌ریزالت', 'Key result'],
    prefix: 'KR',
    fields: [
      { key: 'title', label: ['نتیجه‌ی کلیدی', 'Key result'], type: 'text', required: true, placeholder: ['مثلاً «نرخ تکمیل ثبت‌نام از ۴۰٪ به ۶۰٪»', 'e.g. “Sign-up completion from 40% to 60%”'] },
      { key: 'objective_id', label: ['زیر هدف', 'Under objective'], type: 'objective', required: true },
      { key: 'kind', label: ['نوع سنجش', 'Measured as'], type: 'select', options: { number: ['عدد', 'Number'], percent: ['درصد', 'Percent'], done: ['انجام شد / نشد', 'Done / not done'] }, half: true },
      { key: 'unit', label: ['واحد (برای عدد)', 'Unit (for numbers)'], type: 'text', half: true },
      { key: 'start', label: ['مقدار شروع', 'Start value'], type: 'number', half: true },
      { key: 'target', label: ['هدف', 'Target'], type: 'number', half: true, required: true },
      { key: 'current', label: ['مقدار فعلی', 'Current value'], type: 'number', half: true },
      { key: 'confidence', label: ['اطمینان', 'Confidence'], type: 'select', options: { '': ['خودکار (از پیشرفت و زمان)', 'Automatic (progress vs time)'], on_track: ['در مسیر', 'On track'], at_risk: ['در خطر', 'At risk'], off_track: ['عقب', 'Off track'] }, half: true },
      { key: 'owner', label: ['مسئول', 'Owner'], type: 'person', half: true },
      { key: 'project_id', label: ['محصول مرتبط', 'Related product'], type: 'project', half: true },
      { key: 'note', label: ['یادداشت', 'Note'], type: 'textarea' },
    ],
    defaults: () => ({ kind: 'number', start: 0, current: 0, target: '', unit: '', confidence: '', project_id: '', note: '' }),
  },
  Kpis: {
    title: ['شاخص (KPI)', 'KPI'],
    prefix: 'K',
    fields: [
      { key: 'name', label: ['نام شاخص', 'KPI name'], type: 'text', required: true, placeholder: ['مثلاً «کاربر فعال هفتگی»', 'e.g. “Weekly active users”'] },
      { key: 'project_id', label: ['محصول', 'Product'], type: 'project', half: true, required: true },
      { key: 'unit', label: ['واحد', 'Unit'], type: 'text', half: true },
      { key: 'direction', label: ['بهتر یعنی', 'Better is'], type: 'select', options: { up: ['بیشتر', 'Higher'], down: ['کمتر', 'Lower'] }, half: true },
      { key: 'target', label: ['هدف', 'Target'], type: 'number', half: true },
      { key: 'current', label: ['مقدار فعلی', 'Current value'], type: 'number', half: true },
      { key: 'note', label: ['یادداشت', 'Note'], type: 'textarea' },
    ],
    defaults: () => ({ direction: 'up', target: '', current: '', previous: '', note: '' }),
  },
  Allocations: {
    title: ['تخصیص منابع', 'Allocation'],
    prefix: 'A',
    fields: [
      { key: 'member_id', label: ['عضو', 'Member'], type: 'member', half: true, required: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'percent', label: ['درصد از وقت این فرد', 'Share of this person’s time (%)'], type: 'number', half: true },
      { key: 'quarter', label: ['فصل', 'Quarter'], type: 'quarter', half: true },
    ],
    defaults: () => ({ percent: 50, start_date: '', end_date: '', quarter: quarterOf() }),
  },
  Deliverables: {
    title: ['خروجی', 'Deliverable'],
    prefix: 'D',
    fields: [
      { key: 'title', label: ['چه چیزی تحویل می‌شود؟', 'What gets delivered?'], type: 'text', required: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'owner', label: ['مسئول', 'Owner'], type: 'person', half: true },
      { key: 'target_date', label: ['تاریخ تحویل', 'Target date'], type: 'date', half: true, required: true },
      { key: 'track', label: ['تیم', 'Team'], type: 'side', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: DELIVERABLE_STATUS, half: true },
      { key: 'confidence', label: ['اطمینان', 'Confidence'], type: 'select', options: CONFIDENCE, half: true },
      { key: 'baseline_date', label: ['تاریخ تعهد اولیه', 'Baseline date'], type: 'date', half: true },
      { key: 'delivered_date', label: ['تاریخ تحویل واقعی', 'Actual delivery'], type: 'date', half: true },
      { key: 'notes', label: ['یادداشت', 'Notes'], type: 'textarea' },
    ],
    defaults: () => ({ status: 'planned', confidence: 'medium', track: '', baseline_date: '', delivered_date: '', notes: '' }),
  },
  Meetings: {
    title: ['جلسه', 'Meeting'],
    prefix: 'MT',
    fields: [
      { key: 'title', label: ['عنوان', 'Title'], type: 'text', required: true },
      { key: 'series', label: ['نوع / سری', 'Series'], type: 'select', options: MEETING_SERIES, half: true },
      { key: 'purpose', label: ['برنامه‌ریزی برای', 'Planning for'], type: 'select', options: PLAN_PURPOSE, half: true },
      { key: 'project_id', label: ['محصول / پروژه', 'Product / project'], type: 'project', half: true },
      { key: 'date', label: ['تاریخ', 'Date'], type: 'date', half: true, required: true },
      { key: 'time', label: ['ساعت', 'Time'], type: 'text', half: true, placeholder: ['10:00', '10:00'] },
      { key: 'duration', label: ['مدت', 'Duration'], type: 'number', half: true },
      { key: 'meet_url', label: ['لینک Google Meet', 'Google Meet link'], type: 'text', half: true },
      { key: 'facilitator', label: ['برگزارکننده', 'Facilitator'], type: 'person', half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: MEETING_STATUS, half: true },
      { key: 'attendees', label: ['حاضران', 'Attendees'], type: 'people' },
      { key: 'guests', label: ['مهمانان بیرونی (ایمیل یا نام از «اشخاص»؛ با کاما یا هر نفر در یک خط)', 'Outside guests (emails or names from People; comma or one per line)'], type: 'textarea', placeholder: ['ali@example.com، خانم رضایی', 'ali@example.com, Ms Rezaei'] },
      { key: 'notes', label: ['صورت‌جلسه', 'Minutes'], type: 'textarea' },
      { key: 'decisions', label: ['تصمیم‌ها', 'Decisions'], type: 'textarea' },
    ],
    defaults: () => ({ guests: '', series: 'portfolio', status: 'scheduled', date: todayISO(), time: weekCfg().weeklyTime, duration: 45, notes: '', decisions: '', project_id: '', gcal_id: '', meet_url: '', attendees: '', facilitator: '', items: '', checklist: '', sprint_id: '' }),
  },
  Contracts: {
    title: ['قرارداد', 'Contract'],
    prefix: 'K',
    fields: [
      { key: 'title', label: ['عنوان قرارداد', 'Contract title'], type: 'text', required: true },
      { key: 'project_id', label: ['پروژه', 'Project'], type: 'project', half: true, required: true },
      { key: 'counterparty', label: ['طرف قرارداد', 'Counterparty'], type: 'text', half: true },
      { key: 'kind', label: ['نوع', 'Type'], type: 'select', options: CONTRACT_KIND, half: true },
      { key: 'status', label: ['وضعیت', 'Status'], type: 'select', options: CONTRACT_STATUS, half: true },
      { key: 'number', label: ['شماره', 'Number'], type: 'text', half: true },
      { key: 'value', label: ['شرایط مالی', 'Commercial terms'], type: 'text', half: true },
      { key: 'start_date', label: ['شروع', 'Start'], type: 'date', half: true },
      { key: 'end_date', label: ['پایان', 'End'], type: 'date', half: true },
      { key: 'notes', label: ['یادداشت', 'Notes'], type: 'textarea' },
    ],
    defaults: () => ({ kind: 'client', status: 'draft', start_date: todayISO(), notes: '', value: '', number: '' }),
  },
}

interface EditorCtx {
  open: (sheet: EditableSheet, row?: Record<string, unknown>) => void
}
const Ctx = createContext<EditorCtx | null>(null)
export const useEditor = () => useContext(Ctx)!

export function EditorProvider({ children }: { children: ReactNode }) {
  const { db, me } = useStore()
  const [state, setState] = useState<{ sheet: EditableSheet; row: Record<string, unknown>; isNew: boolean } | null>(null)
  const open = useCallback((sheet: EditableSheet, row?: Record<string, unknown>) => {
    const isNew = !row?.id
    const who = db.Team.find((m) => m.name === (String(row?.assignee || '').split(',')[0] || me))
    const base = { ...SCHEMAS[sheet].defaults(), ...(sheet === 'Tasks' ? { due_date: dueFor(who) } : {}) }
    setState({ sheet, row: isNew ? { ...base, ...row } : { ...row }, isNew })
  }, [db.Team, me])
  const close = () => setState(null)
  // Existing tasks & follow-ups open in the rich item sheet (inline edit + comments).
  const rich = state && !state.isNew && (state.sheet === 'Tasks' || state.sheet === 'FollowUps')
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && rich && <ItemSheet key={String(state.row.id)} sheet={state.sheet as 'Tasks' | 'FollowUps'} id={String(state.row.id)} onClose={close} />}
      {state && !rich && <EditorModal key={String(state.row.id ?? 'new')} {...state} onClose={close} />}
    </Ctx.Provider>
  )
}

function FieldInput({ f, value, set, form, disabled, autoFocus, onSubmit }: { f: Field; value: unknown; set: (v: unknown) => void; form: Record<string, unknown>; disabled?: boolean; autoFocus?: boolean; onSubmit?: () => void }) {
  const { db } = useStore()
  const v = value ?? ''
  const common = { className: 'input', disabled }
  const people = Array.from(new Set([...db.Team.map((m) => m.name), ...db.Contacts.map((c) => c.name), ...db.FollowUps.map((x) => x.person)].filter(Boolean)))
  switch (f.type) {
    case 'textarea':
      return <textarea {...common} rows={3} value={String(v)} placeholder={f.placeholder && tr(f.placeholder)} onChange={(e) => set(e.target.value)} />
    case 'select':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          {Object.entries(f.options!).map(([k, l]) => (
            <option key={k} value={k}>
              {tr(l)}
            </option>
          ))}
        </select>
      )
    case 'multi': {
      const on = String(v || '').split(',').filter(Boolean)
      return (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(f.options!).map(([k, l]) => {
            const sel = on.includes(k)
            return (
              <button key={k} type="button" disabled={disabled} onClick={() => set((sel ? on.filter((x) => x !== k) : [...on, k]).join(','))} className={cx('h-9 rounded-full border px-3.5 text-xs transition disabled:opacity-60', sel ? 'border-ink bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
                {tr(l)}
              </button>
            )
          })}
        </div>
      )
    }
    case 'status':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          {columns().map((c) => (
            <option key={c.id} value={c.id}>
              {statusLabel(c.id)}
            </option>
          ))}
        </select>
      )
    case 'tier':
    case 'mzstatus':
    case 'mzcat':
    case 'mzaction': {
      const c = mzCfg()
      const opts = f.type === 'tier' ? c.tiers : f.type === 'mzstatus' ? c.statuses : f.type === 'mzcat' ? c.categories : c.actions
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{f.type === 'tier' ? L('پیش‌فرض (پایین‌ترین رده)', 'Default (lowest tier)') : '—'}</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {L(o.fa, o.en)}
              {'sla' in o ? ` · SLA ${o.sla}h` : ''}
            </option>
          ))}
        </select>
      )
    }
    case 'pprio':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{L('خودکار (محاسبه‌شده)', 'Automatic (computed)')}</option>
          {['P0', 'P1', 'P2', 'P3'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )
    case 'flag':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{L('بدون پرچم', 'No flag')}</option>
          {taskCfg().flags.map((x) => (
            <option key={x.id} value={x.id}>
              {L(x.fa, x.en)}
            </option>
          ))}
        </select>
      )
    case 'side':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{f.key === 'track' && 'assignee' in form ? L('خودکار (تیم پروژه یا مسئول)', 'Auto (project’s team or assignee’s)') : '—'}</option>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {lbl(TRACK, t)}
            </option>
          ))}
        </select>
      )
    case 'title':
      return <TitleField value={String(v)} set={set} disabled={disabled} />
    case 'area':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {[...taskCfg().areas, ...(v && !taskCfg().areas.includes(String(v)) ? [String(v)] : [])].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )
    case 'assignees': {
      const on = String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
      const team = Array.from(new Set([...db.Team.filter((m) => String(m.active) !== 'false').map((m) => m.name), ...on]))
      return (
        <div className="flex flex-wrap gap-1.5">
          {team.map((n) => {
            const i = on.indexOf(n)
            return (
              <button key={n} type="button" disabled={disabled} onClick={() => set((i >= 0 ? on.filter((x) => x !== n) : [...on, n]).join(','))} className={cx('h-8 rounded-full border px-3 text-xs transition disabled:opacity-60', i >= 0 ? 'border-ink bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
                {n}
                {i === 0 && on.length > 1 && <span className="ms-1 opacity-60">{L('· اصلی', '· lead')}</span>}
              </button>
            )
          })}
        </div>
      )
    }
    case 'people': {
      const on = String(v || '').split(',').map((x) => x.trim()).filter(Boolean)
      const team = db.Team.filter((m) => String(m.active) !== 'false' && !String(form.assignee || '').split(',').includes(m.name))
      return (
        <div className="flex flex-wrap gap-1.5">
          {team.map((m) => {
            const sel = on.includes(m.name)
            return (
              <button key={m.id} type="button" disabled={disabled} onClick={() => set((sel ? on.filter((x) => x !== m.name) : [...on, m.name]).join(','))} className={cx('h-8 rounded-full border px-3 text-xs transition disabled:opacity-60', sel ? 'border-ink bg-ink text-surface' : 'border-line text-sub hover:text-ink')}>
                {m.name}
              </button>
            )
          })}
        </div>
      )
    }
    case 'date':
      return <DatePicker value={String(v)} onChange={(iso) => set(iso)} />
    case 'number':
      return <input {...common} type="number" dir="ltr" className="input num" value={v === '' ? '' : Number(v)} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />
    case 'scale':
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              disabled={disabled}
              onClick={() => set(n)}
              className={cx('h-11 flex-1 rounded-xl border text-sm font-semibold transition', Number(v) === n ? 'border-ink bg-ink text-surface' : 'border-line-strong hover:bg-muted')}
            >
              {n.toLocaleString(document.documentElement.lang === 'fa' ? 'fa-IR' : 'en-US')}
            </button>
          ))}
        </div>
      )
    case 'project':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{canPersonal(db.Team.find((m) => m.name === String(form.assignee || '').split(',')[0])) ? L('— شخصی —', '— Personal —') : L('— بدون پروژه —', '— No project —')}</option>
          {db.Projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )
    case 'quarter':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          {f.key === 'quarter' && !f.required && <option value="">{L('همه‌ی فصل‌ها', 'Every quarter')}</option>}
          {quarterOptions(db).map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
        </select>
      )
    case 'objective':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {[...db.Objectives].sort((a, b) => (a.quarter < b.quarter ? 1 : -1)).map((o) => <option key={o.id} value={o.id}>{`${quarterLabel(o.quarter)} · ${o.title}`}</option>)}
        </select>
      )
    case 'kr': {
      // key results of the current and next quarter, those of the task's team first
      const qs = [quarterOf(), addQuarter(quarterOf(), 1), quarterOf(String(form.due_date || '') || undefined)]
      const objs = db.Objectives.filter((o) => qs.includes(o.quarter) || db.KeyResults.some((k) => k.id === v && k.objective_id === o.id))
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{L('— کار دیگر (خارج از OKR) —', '— Other work (outside OKRs) —')}</option>
          {objs.map((o) => (
            <optgroup key={o.id} label={`${o.title} · ${quarterLabel(o.quarter)}`}>
              {db.KeyResults.filter((k) => k.objective_id === o.id).map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
            </optgroup>
          ))}
        </select>
      )
    }
    case 'sprint': {
      const ss = db.Sprints.filter((s) => !form.project_id || s.project_id === form.project_id)
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">{L('— بک‌لاگ —', '— Backlog —')}</option>
          {ss.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.status === 'active' ? L('(فعال)', '(active)') : ''}
            </option>
          ))}
        </select>
      )
    }
    case 'member':
      return (
        <select {...common} value={String(v)} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {db.Team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )
    case 'person':
      return (
        <>
          <input {...common} list="people-list" value={String(v)}  onChange={(e) => set(e.target.value)} />
          <datalist id="people-list">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </>
      )
    default:
      return (
        <input
          {...common}
          value={String(v)}
          placeholder={f.placeholder && tr(f.placeholder)}
          autoFocus={autoFocus}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit?.()}
        />
      )
  }
}

function EditorModal({ sheet, row, isNew, onClose }: { sheet: EditableSheet; row: Record<string, unknown>; isNew: boolean; onClose: () => void }) {
  const { db, upsert, remove, toast, canEdit: editor, access, me } = useStore()
  // projects, people, allocations and contracts are managed by leadership only
  const canEdit = editor && (!['Projects', 'Team', 'Allocations', 'Contracts'].includes(sheet) || can.manage(access)) && (sheet !== 'Contracts' || can.contracts(access))
  const auto = useAuto()
  const base = SCHEMAS[sheet]
  const [form, setForm] = useState<Record<string, unknown>>(row)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  // task rules from the back office: deadline / project may be required, except for listed people
  const owner = db.Team.find((m) => m.name === String(form.assignee || '').split(',')[0])
  const optional = new Set<string>(TASK_FIELDS)
  const schema =
    sheet === 'Meetings'
      ? { ...base, fields: base.fields.filter((f) => f.key !== 'purpose' || AGILE_SERIES.includes(String(form.series))) }
      : sheet === 'Projects'
      ? // a product is always on: no start, end or manual progress
        { ...base, fields: base.fields.filter((f) => String(form.kind || 'project') !== 'product' || !['start_date', 'end_date', 'progress'].includes(f.key)) }
      : sheet !== 'Tasks'
      ? base
      : {
          ...base,
          fields: base.fields
            .filter((f) => !optional.has(f.key) || fieldOn(f.key as TaskField))
            // the blocker's reason and owner only matter while the task is blocked
            .filter((f) => (f.key !== 'blocked_reason' && f.key !== 'blocked_by') || isBlocked(String(form.status)))
            .map((f) => ((f.key === 'due_date' && needsDue(owner)) || (f.key === 'project_id' && needsProject(owner)) || (optional.has(f.key) && fieldReq(f.key as TaskField)) ? { ...f, required: true } : f)),
        }
  const missing = schema.fields.filter((f) => f.required && !String(form[f.key] ?? '').trim())
  const title = tr(schema.title)

  const save = async () => {
    if (missing.length) return
    setSaving(true)
    const out = { ...form }
    if (isNew) out.id = uid(schema.prefix)
    // Auto-stamp completion dates so burndown & history stay accurate.
    // completion, blocked-since, assign and update stamps are set by the store (lib/taskstamp)
    if (sheet === 'Tasks' && isNew && !out.reporter) out.reporter = me
    if (sheet === 'FollowUps' && !out.owner) out.owner = me
    if (sheet === 'FollowUps') out.done_at = out.status === 'done' ? out.done_at || todayISO() : ''
    // The first committed date becomes the baseline; later moves show up as slippage.
    if (sheet === 'Deliverables') {
      if (!out.baseline_date) out.baseline_date = out.target_date
      out.delivered_date = out.status === 'delivered' ? out.delivered_date || todayISO() : ''
    }
    try {
      await upsert(sheet, out as never)
      if (sheet === 'Meetings') auto.meetingSaved(out as never, isNew ? undefined : (row as never))
      toast(isNew ? L(`${title} ایجاد شد`, `${title} created`) : L('تغییرات ذخیره شد', 'Changes saved'))
      onClose()
    } catch {
      setSaving(false)
    }
  }

  const del = async () => {
    try {
      await remove(sheet, String(form.id))
      toast(L(`${title} حذف شد`, `${title} deleted`))
      onClose()
    } catch {}
  }

  return (
    <Sheet
      open
      onClose={onClose}
      header={
        <div>
          <div className="eyebrow">{isNew ? L('ایجاد', 'Create') : L('ویرایش', 'Edit')}</div>
          <h2 className="font-semibold">{isNew ? L(`${title} جدید`, `New ${title.toLowerCase()}`) : title}</h2>
        </div>
      }
      footer={
        canEdit ? (
          <>
            <button className="btn-primary" onClick={save} disabled={saving || missing.length > 0}>
              {saving ? L('در حال ذخیره…', 'Saving…') : isNew ? L('ایجاد', 'Create') : L('ذخیره', 'Save')}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              {L('انصراف', 'Cancel')}
            </button>
            <div className="flex-1" />
            {!isNew &&
              (confirmDel ? (
                <button className="btn-danger" onClick={del}>
                  {L('تأیید حذف', 'Confirm delete')}
                </button>
              ) : (
                <button className="btn-danger" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={16} /> {L('حذف', 'Delete')}
                </button>
              ))}
          </>
        ) : (
          <span className="text-xs text-sub">{L('دسترسی شما فقط مشاهده است.', 'You have view-only access.')}</span>
        )
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-6 py-6">
        {schema.fields.map((f, i) => (
          <div key={f.key} className={f.half ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
            <label className="label">
              {tr(f.label)}
              {f.required && <span className="ms-0.5 text-bad">*</span>}
            </label>
            <FieldInput f={f} value={form[f.key]} set={(v) => set(f.key, v)} form={form} disabled={!canEdit} autoFocus={isNew && i === 0} onSubmit={save} />
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** Job title: pick from the list, or (program manager) add a new one right here — e.g. APM. */
function TitleField({ value, set, disabled }: { value: string; set: (v: unknown) => void; disabled?: boolean }) {
  const { access, setSetting } = useStore()
  const [adding, setAdding] = useState(false)
  const [d, setD] = useState({ id: '', fa: '', en: '' })
  const add = async () => {
    const id = (d.id || d.en).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!id || !d.fa.trim()) return
    const list = orgList('titles')
    // a code that already exists is renamed; a new code is added
    const item = { id, fa: d.fa.trim(), en: (d.en || d.fa).trim() }
    await setSetting(ORG_KEYS.titles, JSON.stringify(list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [...list, item]))
    set(id)
    setAdding(false)
    setD({ id: '', fa: '', en: '' })
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <select className="input flex-1" disabled={disabled} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {[...Object.keys(JOB_TITLE_OPTIONS), ...(value && !JOB_TITLE_OPTIONS[value] ? [value] : [])].map((k) => (
            <option key={k} value={k}>
              {JOB_TITLE_OPTIONS[k] ? tr(JOB_TITLE_OPTIONS[k]) : k}
            </option>
          ))}
        </select>
        {access === 'super' && !disabled && (
          <button type="button" className="btn-outline btn-sm h-11 shrink-0" onClick={() => setAdding((x) => !x)} title={L('سمت جدید', 'New title')}>
            <Plus size={14} />
          </button>
        )}
      </div>
      {adding && (
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line p-2">
          <input dir="ltr" className="input h-9 w-20 text-xs" placeholder="APM" value={d.id} onChange={(e) => setD({ ...d, id: e.target.value })} />
          <input autoFocus className="input h-9 min-w-0 flex-1 text-xs" placeholder={L('دستیار مدیر محصول', 'Persian name')} value={d.fa} onChange={(e) => setD({ ...d, fa: e.target.value })} />
          <input dir="ltr" className="input h-9 w-36 text-xs" placeholder="Assistant PM" value={d.en} onChange={(e) => setD({ ...d, en: e.target.value })} />
          <button type="button" className="btn-primary btn-sm h-9" disabled={!d.fa.trim() || !(d.id || d.en).trim()} onClick={add}>
            {L('افزودن سمت', 'Add title')}
          </button>
        </div>
      )}
    </div>
  )
}
