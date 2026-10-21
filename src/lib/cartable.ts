// The cartable: what the PgM puts in front of the CPTO to act on (and either of them for
// themselves) — daily, and a weekly one for the end of the week. Items come from a Mizito item, a
// task, a follow-up or plain text. A draft is only the writer's until it is sent; the owner marks
// each item done or sends it back with a line of answer. Anything not done carries over.
import type { CartableBox, CartableItem, DB } from './types'
import type { T2 } from './i18n'
import { todayISO } from './jalali'
import { weekStart } from './weeks'

export const CART_KIND: Record<string, T2> = {
  approve: ['تأیید', 'Approve'],
  decide: ['تصمیم', 'Decide'],
  reply: ['پاسخ در میزیتو', 'Reply in Mizito'],
  review: ['بررسی', 'Review'],
  sign: ['امضا', 'Sign'],
  meet: ['جلسه / تماس', 'Meet / call'],
  info: ['جهت اطلاع', 'FYI'],
}
export const CART_KINDS = Object.keys(CART_KIND)

/** The period an item for a box belongs to, for a given day. */
export const periodOf = (box: CartableBox, day = todayISO()) => (box === 'weekly' ? weekStart(day) : day)

/** People who have a cartable: the PgM and the CPTO. */
export const cartableOwners = (db: DB) => db.Team.filter((m) => (m.access === 'super' || m.access === 'exec') && String(m.active) !== 'false').map((m) => m.name)

/** Open items in someone's box up to a period (anything sent earlier and not done carries over). */
export const pendingFor = (db: DB, owner: string, box?: CartableBox, period?: string) =>
  db.Cartable.filter((c) => c.owner === owner && c.status === 'sent' && (!box || c.box === box) && (!period || c.period <= period)).sort(order)

export const order = (a: CartableItem, b: CartableItem) =>
  (Number(a.sort) || 0) - (Number(b.sort) || 0) || (a.due_date || '9999').localeCompare(b.due_date || '9999') || String(a.created_at).localeCompare(String(b.created_at))

/** Where an item's source lives in the app. */
export function sourceLink(c: Pick<CartableItem, 'entity' | 'entity_id'>) {
  if (!c.entity_id) return ''
  if (c.entity === 'Mizito') return `/mizito?id=${c.entity_id}`
  if (c.entity === 'Tasks') return `/tasks?task=${c.entity_id}`
  if (c.entity === 'FollowUps') return `/followups?id=${c.entity_id}`
  return ''
}
