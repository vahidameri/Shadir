// A task can have several assignees: Task.assignee holds the names comma-separated (the first one leads).
export const assigneesOf = (t: { assignee?: string }) => String(t.assignee || '').split(',').map((x) => x.trim()).filter(Boolean)
export const isAssignee = (t: { assignee?: string }, name: string) => !!name && assigneesOf(t).includes(name)
export const leadAssignee = (t: { assignee?: string }) => assigneesOf(t)[0] || ''
export const joinNames = (names: string[]) => [...new Set(names.map((x) => x.trim()).filter(Boolean))].join(',')
