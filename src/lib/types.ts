// Each type maps 1:1 to a tab in the Google Sheet. Column names = field names.

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type Health = 'green' | 'amber' | 'red'

export interface Project {
  id: string
  code: string
  name: string
  description: string
  category: string
  owner: string
  /** the client organisation (کارفرما) */
  client: string
  /** the client-side contact for the project (رابط پروژه) and how to reach them */
  liaison: string
  liaison_contact: string
  status: ProjectStatus
  priority: Priority
  phase: string
  start_date: string
  end_date: string
  progress: number // 0..100 (manual). If empty, computed from milestones.
  health_override: Health | ''
  objective: string
  /** set while the project is paused (status on_hold) */
  paused_at: string
  pause_reason: string
  /** weekly delivery day, Saturday = 0 … Friday = 6 ('' = none) */
  delivery_day?: string
  /** last date a weekly delivery was recorded */
  last_delivery?: string
  /** '1' = archived: hidden from every list until it is restored */
  archived?: string
  archived_at?: string
  /** links (stage, production, Figma…) as JSON: [{ type, url, label }] */
  links?: string
}

export interface ScopeItem {
  id: string
  project_id: string
  item: string
  type: 'in' | 'out'
  status: 'planned' | 'in_progress' | 'delivered' | 'changed' | 'removed'
  change_note: string
  date: string
}

export interface Milestone {
  id: string
  project_id: string
  title: string
  planned_date: string
  actual_date: string
  status: 'pending' | 'in_progress' | 'done' | 'missed'
  owner: string
  weight: number
}

export interface Sprint {
  id: string
  project_id: string
  name: string
  start_date: string
  end_date: string
  goal: string
  committed_points: number
  completed_points: number
  status: 'planned' | 'active' | 'closed'
}

export type BuiltinStatus = 'intake' | 'backlog' | 'todo' | 'in_progress' | 'review' | 'qa' | 'waiting' | 'blocked' | 'done' | 'cancelled'
/** What a status means for tracking; every column (built-in or custom) has one. */
export type StatusCat = 'intake' | 'open' | 'active' | 'waiting' | 'blocked' | 'done' | 'cancelled'
/** a built-in status or the id of a kanban column added in the settings */
export type TaskStatus = BuiltinStatus | (string & {})

export interface Task {
  id: string
  project_id: string
  sprint_id: string
  title: string
  description: string
  assignee: string
  reporter: string
  status: TaskStatus
  priority: Priority
  due_date: string
  points: number
  tags: string
  created_at: string
  completed_at: string
  /** 'product' | 'tech' — blank = inferred from the assignee's team */
  track: Track | ''
  /** comma-separated task ids this task waits on (cross-team handoffs) */
  depends_on: string
  /** set when the task is an action item agreed in a meeting */
  meeting_id: string
  /** '1' = only the assignee and the reporter can see it */
  private: string
  /** final delivery date (ددلاین / تحویل نهایی) */
  deadline?: string
  /** hand-over to product, and the test window */
  handoff_date?: string
  test_date?: string
  /** follow-up / reminder date: everyone on the task is notified that morning */
  follow_date?: string
  /** area of work, from the list set in the task settings */
  area?: string
  /** comma-separated names sharing the task (they see it like their own) */
  collaborators?: string
  /** comma-separated names tracking the task (their Lookout + notifications) */
  watchers?: string
  /** 'off' mutes the reminders for this task */
  notify?: string
  /** when work starts (with due_date it gives the task's window) */
  start_date?: string
  /** time estimate in hours */
  estimate?: number | string
  /** checklist, one item per line: "[ ] item" / "[x] item" */
  checklist?: string
  /** when the task was handed to its (lead) assignee — set automatically, editable */
  assigned_at?: string
  /** tracking flag id from the settings (watch, key, escalate, …) */
  flag?: string
  /** why it is blocked, and on whom / what (a person, a unit or free text) */
  blocked_reason?: string
  blocked_by?: string
  /** first day of the current blocked spell — set and cleared automatically */
  blocked_since?: string
  /** last change, "YYYY-MM-DD HH:mm" — set automatically (stale detection) */
  updated_at?: string
  /** outside link, e.g. the task in Mizito */
  link?: string
  /** who asked for it */
  requested_by?: string
  /** id in the sheet it was imported from */
  ext_id?: string
  /** import batch */
  batch?: string
}

/** a side from the settings: product, design, tech by default */
export type Track = 'product' | 'crm_ops' | 'data' | 'tech' | (string & {})

export type FollowUpStatus = 'open' | 'waiting' | 'done'

export interface FollowUp {
  id: string
  project_id: string
  subject: string
  person: string
  channel: 'meeting' | 'call' | 'email' | 'chat' | 'other'
  due_date: string
  status: FollowUpStatus
  priority: Priority
  notes: string
  created_at: string
  done_at: string
  /** who is chasing — follow-ups are personal */
  owner: string
  /** what exactly we wait for from them */
  waiting_for?: string
  /** link, e.g. the Mizito task where the reminder goes */
  link?: string
  /** last time we pinged them, and how many times */
  last_ping?: string
  ping_count?: number | string
  ext_id?: string
  batch?: string
}

export interface Risk {
  id: string
  project_id: string
  title: string
  type: 'risk' | 'issue' | 'dependency' | 'decision'
  probability: number // 1..5
  impact: number // 1..5
  owner: string
  mitigation: string
  status: 'open' | 'mitigating' | 'closed'
  due_date: string
}

export interface Member {
  id: string
  name: string
  /** name shown in the English interface */
  name_en: string
  role: string
  email: string
  team: string
  /** sign-in name (blank = made from name_en) */
  username?: string
  track: Track | ''
  /** availability as % of one full-time person (100 = full-time, 50 = half-time, 600 = a team of six) */
  capacity: number
  /** profile photo URL (Drive thumbnail, Google profile picture or data URL in the demo) */
  photo: string
  /** '1' = every task assigned to this person is private (e.g. the CEO) */
  tasks_private: string
  phone: string
  /** what they can see: super = program manager (everything + back office), exec = CEO,
   *  head = heads of product/tech (portfolio views), member = sees only their own projects */
  access: Access
  /** 'false' disables sign-in */
  active: string
  batch?: string
}

export type Access = 'super' | 'exec' | 'head' | 'member'

export interface Contract {
  id: string
  project_id: string
  title: string
  counterparty: string
  number: string
  kind: 'client' | 'vendor' | 'partner' | 'nda' | 'other'
  status: 'draft' | 'negotiation' | 'signed' | 'active' | 'expired' | 'terminated'
  start_date: string
  end_date: string
  value: string
  notes: string
}

export interface Allocation {
  id: string
  member_id: string
  project_id: string
  percent: number
  /** optional window; blank = open-ended */
  start_date: string
  end_date: string
}

export interface Update {
  id: string
  project_id: string
  week_date: string
  author: string
  health: Health
  summary: string
  done: string
  next: string
  blockers: string
}

export type DeliverableStatus = 'planned' | 'in_progress' | 'at_risk' | 'delivered' | 'dropped'
export type Confidence = 'high' | 'medium' | 'low'

/** Something a project commits to hand over on a date — the unit of the delivery plan. */
export interface Deliverable {
  id: string
  project_id: string
  title: string
  track: Track | ''
  owner: string
  target_date: string
  /** first committed date; kept when the target moves so slippage stays visible */
  baseline_date: string
  delivered_date: string
  status: DeliverableStatus
  confidence: Confidence
  notes: string
}

/** a meeting series from the settings (portfolio, product, design, tech, project, one_on_one, other by default) */
export type MeetingSeries = 'portfolio' | 'unit' | 'one_on_one' | 'adhoc' | 'external' | 'planning' | 'other' | (string & {})

export interface Meeting {
  id: string
  series: MeetingSeries
  title: string
  project_id: string
  date: string
  time: string
  facilitator: string
  /** comma-separated names */
  attendees: string
  status: 'scheduled' | 'held' | 'cancelled'
  notes: string
  /** one decision per line */
  decisions: string
  /** Google Calendar link */
  gcal_id: string
  meet_url: string
  /** minutes length in minutes */
  duration: number
  /** planning sessions: what it is for (org.plans: demo, roadmap, sprint, release, …) */
  purpose?: string
  /** planning agenda — "T:taskId,D:deliverableId,M:milestoneId" */
  items?: string
  /** preparation checklist — JSON [{id,text,done}] */
  checklist?: string
  sprint_id?: string
  /** guests from outside the department: emails or names from People, comma or line separated */
  guests?: string
}

export interface FileRef {
  id: string
  entity: 'Meetings' | 'Projects' | 'Tasks' | 'Team' | 'Deliverables' | 'Contracts'
  entity_id: string
  name: string
  mime: string
  size: number
  url: string
  uploaded_by: string
  created_at: string
}

/** key/value settings shared by everyone (automation switches etc.); id = key */
export interface ConfigRow {
  id: string
  value: string
}


export interface Comment {
  id: string
  entity: 'Tasks' | 'FollowUps' | 'Projects' | 'Risks'
  entity_id: string
  author: string
  body: string
  created_at: string // ISO datetime
  batch?: string
}

/** Someone who asks, mentions or is chased — inside or outside the department. Their tier sets
 *  the SLA and the weight of what they ask (Mizito priority). */
export interface Contact {
  id: string
  name: string
  name_en: string
  title: string
  /** unit or organisation */
  org: string
  /** tier id from the settings (mz.tiers) */
  tier: string
  email: string
  phone: string
  notes: string
  active: string
  batch?: string
}

/** One Mizito task the CPTO or the PgM was mentioned on. Re-mentions thread into MizitoMentions. */
export interface MizitoItem {
  id: string
  /** the task id taken from the Mizito link (dedupe key) */
  mz_key: string
  link: string
  title: string
  description: string
  /** attachment / document links, one per line */
  docs: string
  /** who raised it (the first mention) */
  asked_by: string
  /** who was mentioned (CPTO / PgM names, comma-separated) */
  mentioned: string
  category: string
  action: string
  status: string
  /** P0..P3 set by hand; blank = computed */
  priority_override: string
  override_reason: string
  /** '1' = urgent by hand */
  urgent: string
  /** handed to a unit or a person (no internal task is created) */
  assigned_to: string
  due_date: string
  /** first mention "YYYY-MM-DD HH:mm" */
  received_at: string
  last_mention_at: string
  last_mention_by: string
  outcome: string
  notes: string
  created_at: string
  updated_at: string
  closed_at: string
  ext_id?: string
  batch?: string
}

export interface MizitoMention {
  id: string
  item_id: string
  by: string
  at: string
  note: string
  /** status set with this mention, if any */
  status: string
  batch?: string
}

/** One change to a tracked row (field-level log). Written by the server; the app mirrors it locally. */
export interface HistoryRow {
  id: string
  entity: 'Tasks' | 'FollowUps' | 'Mizito'
  entity_id: string
  /** the field that changed, or '_created' / '_deleted' */
  field: string
  from: string
  to: string
  by: string
  /** "YYYY-MM-DD HH:mm" */
  at: string
  batch?: string
}

export type HandoffStatus = 'sent' | 'accepted' | 'returned'

/** One pass of work from one side to another (product → design → tech …). A return sends it back;
 *  sending again opens the next round, so the back-and-forth stays visible. */
export interface Handoff {
  id: string
  task_id: string
  project_id: string
  title: string
  from_side: Track | ''
  to_side: Track | ''
  from_person: string
  /** who should pick it up ('' = anyone on that side) */
  to_person: string
  status: HandoffStatus
  round: number
  sent_at: string
  due_date: string
  responded_at: string
  note: string
  /** the receiver's answer — why it came back, or what was accepted */
  reply: string
}

export type DeliveryStatus = 'delivered' | 'partial' | 'skipped'

/** A project's weekly delivery, one row per week. */
export interface WeeklyDelivery {
  id: string
  project_id: string
  /** first day of the week (Config week.start) */
  week: string
  date: string
  status: DeliveryStatus
  note: string
  by: string
}

export interface DB {
  Projects: Project[]
  Scope: ScopeItem[]
  Milestones: Milestone[]
  Sprints: Sprint[]
  Tasks: Task[]
  FollowUps: FollowUp[]
  Risks: Risk[]
  Team: Member[]
  Allocations: Allocation[]
  Updates: Update[]
  Comments: Comment[]
  Deliverables: Deliverable[]
  Meetings: Meeting[]
  Files: FileRef[]
  Config: ConfigRow[]
  Contracts: Contract[]
  Handoffs: Handoff[]
  Deliveries: WeeklyDelivery[]
  History: HistoryRow[]
  Contacts: Contact[]
  Mizito: MizitoItem[]
  MizitoMentions: MizitoMention[]
}

export type SheetName = keyof DB
export type Row<S extends SheetName> = DB[S][number]

export type Role = 'admin' | 'editor' | 'viewer'
