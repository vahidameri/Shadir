// Counts looked up per row (comments on a task) are built once per change of the tab, not scanned
// again for every row.
import type { Comment } from './types'

const byList = new WeakMap<Comment[], Map<string, number>>()
/** How many comments an item has (entity + id), from a cached index of the Comments tab. */
export function commentCount(comments: Comment[], entity: string, id: string) {
  let m = byList.get(comments)
  if (!m) {
    m = new Map()
    for (const c of comments) m.set(`${c.entity}|${c.entity_id}`, (m.get(`${c.entity}|${c.entity_id}`) || 0) + 1)
    byList.set(comments, m)
  }
  return m.get(`${entity}|${id}`) || 0
}
