// Telegram → Atlas: read a Telegram Desktop export (JSON), match each group to a project and each sender
// to a person. Then either let Atlas read each group and propose the project's status for the week
// (what was finished, what is stuck, what was decided, what comes next, which tasks are done), or pick
// single messages by hand and turn them into tasks, follow-ups, decisions or project notes.
import { useMemo, useState } from 'react'
import { CheckCircle2, CheckSquare, FileUp, Gavel, ListTodo, MessageSquareText, Send, Sparkles, StickyNote } from 'lucide-react'
import { useStore } from '../lib/store'
import { uid } from '../lib/api'
import { bullets, digest, parseExport, titleOf, type TgChat, type TgMessage } from '../lib/telegram'
import { L, lbl, locale } from '../lib/i18n'
import { HEALTH } from '../lib/labels'
import { inWeek, weekStart } from '../lib/weeks'
import type { Health, Project, Update } from '../lib/types'
import { fa, fmtDayMonth, todayISO } from '../lib/jalali'
import { Card, Empty, HealthDot, Segmented, cx } from './ui'

const PEOPLE_KEY = 'tg.people'
const PROJECTS_KEY = 'tg.projects'
const doneKey = (chatId: string) => `tg.done.${chatId}`
/** newest message already used for a project's status, per group */
const lastKey = (chatId: string) => `tg.last.${chatId}`
// kept as "at:2026-10-18T09:05:00" so nothing on the way treats it as a plain date and drops the time
const lastOf = (v: string) => v.replace(/^at:/, '')
const json = <T,>(v: string | undefined, d: T): T => {
  try {
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const norm = (s: string) => s.toLowerCase().replace(/[\s‌_.-]+/g, '')

export function TelegramImport() {
  const { db, setting, setSetting, upsert, toast, me } = useStore()
  const [chats, setChats] = useState<TgChat[]>([])
  const [err, setErr] = useState('')
  const [chat, setChat] = useState('')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [hideDone, setHideDone] = useState(true)
  const [minLen, setMinLen] = useState(15)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(200)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'status' | 'manual'>('status')

  const peopleMap = json<Record<string, string>>(setting(PEOPLE_KEY), {})
  const projectMap = json<Record<string, string>>(setting(PROJECTS_KEY), {})
  const done = (chatId: string) => new Set(String(setting(doneKey(chatId), '')).split(',').filter(Boolean))

  // best guesses: a group named after a project, a sender named like a person
  const guessProject = (c: TgChat) => projectMap[c.id] ?? db.Projects.find((p) => norm(c.name).includes(norm(p.name)) || (p.code && norm(c.name).includes(norm(p.code))))?.id ?? ''
  const guessPerson = (sender: string) => {
    if (!sender) return ''
    if (peopleMap[sender] !== undefined) return peopleMap[sender]
    const s = norm(sender)
    const hit = db.Team.filter((m) => [m.name, m.name_en, m.username].filter(Boolean).some((n) => norm(String(n)) === s))
    if (hit.length === 1) return hit[0].name
    const near = db.Team.filter((m) => [m.name, m.name_en].filter((n) => n && norm(String(n)).length >= 4).some((n) => s.includes(norm(String(n))) || (s.length >= 4 && norm(String(n)).includes(s))))
    return near.length === 1 ? near[0].name : ''
  }

  const read = async (files: FileList | null) => {
    setErr('')
    const out: TgChat[] = []
    for (const f of Array.from(files || [])) {
      try {
        out.push(...parseExport(JSON.parse(await f.text())))
      } catch {
        setErr(L(`«${f.name}» خروجی JSON تلگرام نیست. در تلگرام دسکتاپ: ⋮ ← Export chat history ← Format: JSON`, `“${f.name}” is not a Telegram JSON export. In Telegram Desktop: ⋮ → Export chat history → Format: JSON`))
      }
    }
    setChats((c) => [...c.filter((x) => !out.some((o) => o.id === x.id)), ...out])
    setPicked(new Set())
  }

  const all = useMemo(() => chats.flatMap((c) => c.messages), [chats])
  const senders = useMemo(() => [...new Set(all.map((m) => m.from).filter(Boolean))].sort(), [all])
  const doneSets = useMemo(() => Object.fromEntries(chats.map((c) => [c.id, done(c.id)])), [chats, setting]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = all
    .filter((m) => (!chat || m.chatId === chat) && (!who || m.from === who) && (!q || m.text.includes(q)) && m.text.length >= minLen && (!hideDone || !doneSets[m.chatId]?.has(m.key)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const markDone = async (rows: TgMessage[]) => {
    const by = new Map<string, string[]>()
    rows.forEach((m) => by.set(m.chatId, [...(by.get(m.chatId) || []), m.key]))
    for (const [cid, keys] of by) await setSetting(doneKey(cid), [...new Set([...done(cid), ...keys])].join(','))
  }

  const make = async (kind: 'task' | 'followup' | 'decision' | 'note') => {
    const rows = all.filter((m) => picked.has(m.key))
    if (!rows.length) return
    setBusy(true)
    try {
      for (const m of rows) {
        const c = chats.find((x) => x.id === m.chatId)!
        const pid = guessProject(c)
        const person = guessPerson(m.from)
        const day = m.date.slice(0, 10) || todayISO()
        const source = L(`از تلگرام · ${m.chat} · ${m.from} · ${day}`, `From Telegram · ${m.chat} · ${m.from} · ${day}`)
        if (kind === 'task')
          await upsert('Tasks', {
            id: uid('T'), project_id: pid, sprint_id: '', title: titleOf(m.text), description: `${m.text}\n\n— ${source}`, assignee: person, reporter: me, status: 'todo', priority: 'medium',
            due_date: '', points: 0, tags: 'telegram', created_at: day, completed_at: '', track: '', depends_on: '', meeting_id: '', private: '',
          } as never)
        else if (kind === 'followup')
          await upsert('FollowUps', { id: uid('F'), project_id: pid, subject: titleOf(m.text), person: person || m.from, channel: 'chat', due_date: todayISO(), status: 'open', priority: 'medium', notes: `${m.text}\n\n— ${source}`, created_at: day, done_at: '', owner: me })
        else if (kind === 'decision')
          await upsert('Risks', { id: uid('R'), project_id: pid, title: titleOf(m.text), type: 'decision', probability: 3, impact: 3, owner: person, mitigation: `${m.text}\n\n— ${source}`, status: 'closed', due_date: day })
        else if (pid) await upsert('Comments', { id: uid('C'), entity: 'Projects', entity_id: pid, author: person || m.from, body: `${m.text}\n\n— ${source}`, created_at: `${day} ${m.date.slice(11, 16) || '00:00'}` })
      }
      await markDone(rows)
      toast(L(`${fa(rows.length)} پیام وارد اطلس شد`, `${rows.length} messages imported`))
      setPicked(new Set())
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <div className="space-y-4">
      <Card eyebrow={<span className="flex items-center gap-1.5"><Send size={12} className="rtl:-scale-x-100" /> Telegram</span>} title={L('ورود از گروه‌های تلگرام', 'Import from Telegram groups')}>
        <ol className="mb-4 list-decimal space-y-1 ps-5 text-xs leading-6 text-sub">
          <li>{L('در تلگرام دسکتاپ گروه را باز کنید ← ⋮ ← Export chat history.', 'In Telegram Desktop open the group → ⋮ → Export chat history.')}</li>
          <li>{L('Format را روی JSON بگذارید (عکس و فایل لازم نیست) ← Export.', 'Set Format to JSON (no photos or files needed) → Export.')}</li>
          <li>{L('فایل result.json هر گروه را این‌جا بیاورید؛ چند فایل با هم هم می‌شود.', 'Bring each group’s result.json here; several at once is fine.')}</li>
        </ol>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-4 py-6 text-sm text-sub transition hover:border-ink/30 hover:text-ink">
          <FileUp size={18} /> {L('انتخاب فایل‌های result.json', 'Choose result.json files')}
          <input type="file" accept=".json,application/json" multiple className="hidden" onChange={(e) => read(e.target.files)} />
        </label>
        {err && <p className="mt-2 text-xs text-bad">{err}</p>}
      </Card>

      {chats.length > 0 && (
        <div className="grid gap-4 @3xl:grid-cols-2">
          <Card eyebrow={L('گروه ← پروژه', 'Group → project')} title={L(`${fa(chats.length)} گروه`, `${chats.length} groups`)}>
            <ul className="space-y-2">
              {chats.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <MessageSquareText size={14} className="shrink-0 text-sub" />
                  <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{c.name}</span>
                  <span className="text-[0.6875rem] text-sub num">{fa(c.messages.length)}</span>
                  <select className="input h-9 w-44 text-xs" value={guessProject(c)} onChange={(e) => setSetting(PROJECTS_KEY, JSON.stringify({ ...projectMap, [c.id]: e.target.value }))}>
                    <option value="">{L('— بدون پروژه —', '— No project —')}</option>
                    {db.Projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </Card>
          <Card eyebrow={L('فرستنده ← نفر', 'Sender → person')} title={L(`${fa(senders.length)} فرستنده`, `${senders.length} senders`)}>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {senders.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{s}</span>
                  <select className="input h-9 w-44 text-xs" value={guessPerson(s)} onChange={(e) => setSetting(PEOPLE_KEY, JSON.stringify({ ...peopleMap, [s]: e.target.value }))}>
                    <option value="">{L('— کسی نیست —', '— Nobody —')}</option>
                    {db.Team.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {chats.length > 0 && (
        <Segmented value={mode} onChange={setMode} options={[
          { value: 'status', label: L('وضعیت خودکار پروژه‌ها', 'Project status, automatically') },
          { value: 'manual', label: L('انتخاب دستی پیام‌ها', 'Pick messages by hand') },
        ]} />
      )}

      {chats.length > 0 && mode === 'status' && <StatusFromChats chats={chats} projectOf={guessProject} />}

      {chats.length > 0 && mode === 'manual' && (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <select className="input h-9 w-44 text-xs" value={chat} onChange={(e) => setChat(e.target.value)}>
              <option value="">{L('همه‌ی گروه‌ها', 'All groups')}</option>
              {chats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input h-9 w-40 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{L('همه‌ی فرستنده‌ها', 'All senders')}</option>
              {senders.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input h-9 w-48 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('جستجو در متن…', 'Search text…')} />
            <select className="input h-9 w-36 text-xs" value={minLen} onChange={(e) => setMinLen(Number(e.target.value))}>
              {[0, 15, 40, 100].map((n) => <option key={n} value={n}>{n ? L(`حداقل ${fa(n)} حرف`, `${n}+ characters`) : L('همه‌ی پیام‌ها', 'Every message')}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-sub">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> {L('واردشده‌ها را نشان نده', 'Hide imported')}
            </label>
            <span className="ms-auto text-xs text-sub">{L(`${fa(list.length)} پیام`, `${list.length} messages`)}</span>
          </div>
          {picked.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 shadow-float">
              <span className="text-sm font-medium">{L(`${fa(picked.size)} پیام انتخاب شد`, `${picked.size} selected`)}</span>
              <span className="flex-1" />
              <button disabled={busy} className="btn-primary btn-sm" onClick={() => make('task')}><ListTodo size={14} /> {L('تسک', 'Tasks')}</button>
              <button disabled={busy} className="btn-outline btn-sm" onClick={() => make('followup')}><CheckSquare size={14} /> {L('پیگیری', 'Follow-ups')}</button>
              <button disabled={busy} className="btn-outline btn-sm" onClick={() => make('decision')}><Gavel size={14} /> {L('تصمیم', 'Decisions')}</button>
              <button disabled={busy} className="btn-outline btn-sm" onClick={() => make('note')} title={L('روی پروژه‌ی همان گروه', 'On the group’s project')}><StickyNote size={14} /> {L('یادداشت پروژه', 'Project notes')}</button>
              <button className="btn-ghost btn-sm" onClick={() => setPicked(new Set())}>{L('لغو', 'Clear')}</button>
            </div>
          )}
          {!list.length ? (
            <Empty text={L('پیامی با این فیلترها نیست', 'No messages match')} />
          ) : (
            <ul className="divide-y divide-line">
              {list.slice(0, limit).map((m) => {
                const isDone = doneSets[m.chatId]?.has(m.key)
                return (
                  <li key={m.key} className={cx('flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40', picked.has(m.key) && 'bg-brand-soft/20', isDone && 'opacity-50')} onClick={() => toggle(m.key)}>
                    <input type="checkbox" className="mt-1" checked={picked.has(m.key)} onChange={() => toggle(m.key)} onClick={(e) => e.stopPropagation()} aria-label={L('انتخاب', 'Select')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-sub">
                        <b className="text-ink" dir="auto">{m.from || '—'}</b>
                        {guessPerson(m.from) && guessPerson(m.from) !== m.from && <span>({guessPerson(m.from)})</span>}
                        <span dir="auto">{m.chat}</span>
                        <span className="num">{fmtDayMonth(m.date.slice(0, 10))} {m.date.slice(11, 16)}</span>
                        {m.reply && <span>{L('پاسخ', 'reply')}</span>}
                        {isDone && <span className="text-good">{L('وارد شده', 'imported')}</span>}
                      </div>
                      <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm leading-6" dir="auto">{m.text}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {list.length > limit && (
            <button className="block w-full border-t border-line py-3 text-center text-xs text-sub hover:text-ink" onClick={() => setLimit((n) => n + 200)}>
              {L(`نمایش ${fa(Math.min(200, list.length - limit))} پیام دیگر`, `Show ${Math.min(200, list.length - limit)} more`)}
            </button>
          )}
        </Card>
      )}
    </div>
  )
}

type Period = 'new' | 'week' | '14'

/** One suggested weekly update per project, read from its groups; reviewed, then saved in one click. */
function StatusFromChats({ chats, projectOf }: { chats: TgChat[]; projectOf: (c: TgChat) => string }) {
  const { db, setting } = useStore()
  const [period, setPeriod] = useState<Period>('new')
  const ws = weekStart()
  const since = (c: TgChat) => {
    const last = lastOf(setting(lastKey(c.id), ''))
    if (period === 'week') return ws
    if (period === '14') return new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
    return last || ws
  }
  const byProject = new Map<string, { chats: TgChat[]; messages: TgMessage[] }>()
  chats.forEach((c) => {
    const pid = projectOf(c)
    if (!pid) return
    const from = since(c)
    const msgs = c.messages.filter((m) => (period === 'new' && setting(lastKey(c.id), '') ? m.date > from : m.date.slice(0, 10) >= from))
    const cur = byProject.get(pid) || { chats: [], messages: [] }
    byProject.set(pid, { chats: [...cur.chats, c], messages: [...cur.messages, ...msgs] })
  })
  const unmapped = chats.filter((c) => !projectOf(c))
  return (
    <div className="space-y-4">
      <Card eyebrow={<span className="flex items-center gap-1.5"><Sparkles size={12} /> {L('خودکار', 'Automatic')}</span>} title={L('وضعیت این هفته‌ی پروژه‌ها از گفت‌وگوها', 'This week’s project status from the chats')}>
        <p className="text-xs leading-6 text-sub">
          {L('اطلس پیام‌های هر گروه را می‌خواند: کارهای تمام‌شده، مشکل‌ها و مانع‌ها، تصمیم‌ها و برنامه‌ی بعد را جدا می‌کند، سلامت پروژه را پیشنهاد می‌دهد و تسک‌هایی را که در گفت‌وگو «انجام شد» گفته شده پیدا می‌کند. پیش از ثبت، هر بخش را بازبینی و ویرایش کنید؛ با ثبت، گزارش هفتگی همان پروژه پر یا تکمیل می‌شود.',
            'Atlas reads each group: finished work, problems and blockers, decisions and what comes next. It proposes the project’s health and finds tasks the chat calls done. Review and edit before saving; saving fills in (or adds to) that project’s weekly update.')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-sub">{L('کدام پیام‌ها؟', 'Which messages?')}</span>
          <Segmented value={period} onChange={setPeriod} options={[
            { value: 'new', label: L('پیام‌های تازه (از آخرین ثبت)', 'New since last time') },
            { value: 'week', label: L('این هفته', 'This week') },
            { value: '14', label: L('۱۴ روز اخیر', 'Last 14 days') },
          ]} />
        </div>
        {unmapped.length > 0 && (
          <p className="mt-3 rounded-xl bg-warn/[0.09] px-3 py-2 text-xs text-warn">
            {L(`${fa(unmapped.length)} گروه به پروژه‌ای وصل نیست (${unmapped.map((c) => c.name).join('، ')}). در کارت «گروه ← پروژه» پروژه‌اش را انتخاب کنید.`, `${unmapped.length} group(s) have no project (${unmapped.map((c) => c.name).join(', ')}). Pick one under “Group → project”.`)}
          </p>
        )}
      </Card>
      {!byProject.size && <Card><Empty text={L('هیچ گروهی به پروژه وصل نیست.', 'No group is linked to a project yet.')} /></Card>}
      {[...byProject.entries()].map(([pid, g]) => {
        const p = db.Projects.find((x) => x.id === pid)
        if (!p) return null
        return <ProjectStatus key={`${pid}-${period}-${g.messages.length}`} p={p} chats={g.chats} messages={g.messages} ws={ws} />
      })}
    </div>
  )
}

function ProjectStatus({ p, chats, messages, ws }: { p: Project; chats: TgChat[]; messages: TgMessage[]; ws: string }) {
  const { db, me, upsert, setSetting, toast } = useStore()
  const isFa = locale.lang === 'fa'
  const open = db.Tasks.filter((t) => t.project_id === p.id && t.status !== 'done')
  const dg = useMemo(() => digest(messages, open, isFa), [messages]) // eslint-disable-line react-hooks/exhaustive-deps
  const existing = db.Updates.find((u) => u.project_id === p.id && inWeek(u.week_date, ws))
  const [health, setHealth] = useState<Health>(dg?.health || 'amber')
  const [summary, setSummary] = useState(() => {
    if (!dg) return ''
    const head = isFa
      ? `از گفت‌وگوهای تلگرام (${fa(dg.count)} پیام از ${fa(dg.people)} نفر، ${fmtDayMonth(dg.from)} تا ${fmtDayMonth(dg.to)}): ${fa(dg.done.length)} کار تمام‌شده، ${fa(dg.blockers.length)} مشکل یا مانع، ${fa(dg.decisions.length)} تصمیم.`
      : `From Telegram (${dg.count} messages from ${dg.people} people, ${dg.from} to ${dg.to}): ${dg.done.length} finished, ${dg.blockers.length} problems, ${dg.decisions.length} decisions.`
    return dg.decisions.length ? `${head}\n${isFa ? 'تصمیم‌ها:' : 'Decisions:'}\n${bullets(dg.decisions, 5)}` : head
  })
  const [done, setDone] = useState(dg ? bullets(dg.done) : '')
  const [next, setNext] = useState(dg ? bullets(dg.next) : '')
  const [blockers, setBlockers] = useState(dg ? bullets(dg.blockers) : '')
  const [finish, setFinish] = useState<Set<string>>(() => new Set(dg?.finished.map((f) => f.id)))
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!dg)
    return (
      <Card eyebrow={chats.map((c) => c.name).join('، ')} title={p.name}>
        <p className="text-xs text-sub">{L('در این بازه پیام تازه‌ای در گروه نیست؛ وضعیتی برای پیشنهاد وجود ندارد.', 'No new messages in this period, so there is nothing to suggest.')}</p>
      </Card>
    )

  const merge = (old: string, add: string) => [...new Set([...String(old || '').split('\n'), ...add.split('\n')].map((l) => l.trimEnd()).filter((l) => l.trim()))].join('\n')
  const save = async () => {
    setBusy(true)
    try {
      const row: Update = existing
        ? { ...existing, health, summary: merge(existing.summary, summary), done: merge(existing.done, done), next: merge(existing.next, next), blockers: merge(existing.blockers, blockers) }
        : { id: `U-${p.id}-${ws}`, project_id: p.id, week_date: ws, author: me, health, summary, done, next, blockers }
      await upsert('Updates', row)
      for (const t of open.filter((x) => finish.has(x.id))) await upsert('Tasks', { ...t, status: 'done', completed_at: todayISO() })
      const newest = messages.reduce((a, m) => (m.date > a ? m.date : a), '')
      for (const c of chats) await setSetting(lastKey(c.id), `at:${newest}`)
      setSaved(true)
      toast(L(`وضعیت ${p.name} برای این هفته ثبت شد${finish.size ? ` و ${fa(finish.size)} تسک انجام‌شده شد` : ''}`, `${p.name}: this week’s status saved${finish.size ? `, ${finish.size} tasks done` : ''}`))
    } finally {
      setBusy(false)
    }
  }

  const area = (label: string, v: string, set: (x: string) => void, hint: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input min-h-24 py-2 text-xs leading-6" dir="auto" value={v} onChange={(e) => set(e.target.value)} placeholder={hint} />
    </label>
  )
  return (
    <Card eyebrow={<span dir="auto">{chats.map((c) => c.name).join('، ')} · {L(`${fa(dg.count)} پیام`, `${dg.count} messages`)}</span>} title={p.name}
      action={saved ? <span className="flex items-center gap-1 text-xs font-medium text-good"><CheckCircle2 size={14} /> {L('ثبت شد', 'Saved')}</span> : undefined}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="label m-0">{L('سلامت پیشنهادی', 'Suggested health')}</span>
          <div className="flex gap-1">
            {(['green', 'amber', 'red'] as Health[]).map((h) => (
              <button key={h} type="button" onClick={() => setHealth(h)} className={cx('chip gap-1.5 border', health === h ? 'border-ink bg-surface text-ink' : 'border-transparent bg-muted text-sub')}>
                <HealthDot h={h} /> {lbl(HEALTH, h)}
              </button>
            ))}
          </div>
          <span className="text-[0.6875rem] text-sub">{L('چرا: ', 'Why: ')}{dg.why}</span>
        </div>
        {existing && <p className="rounded-xl bg-muted/60 px-3 py-2 text-[0.6875rem] text-sub">{L('گزارش این هفته از قبل هست؛ این موارد به آن اضافه می‌شود و سلامت به‌روز می‌شود.', 'This week already has an update; these lines are added to it and the health is updated.')}</p>}
        {area(L('خلاصه', 'Summary'), summary, setSummary, '')}
        <div className="grid gap-3 @2xl:grid-cols-3">
          {area(L('انجام شد', 'Done'), done, setDone, L('کار تمام‌شده‌ای پیدا نشد', 'No finished work found'))}
          {area(L('مشکل‌ها و مانع‌ها', 'Blockers'), blockers, setBlockers, L('مانعی پیدا نشد', 'No blockers found'))}
          {area(L('برنامه‌ی بعد', 'Next'), next, setNext, L('برنامه‌ای پیدا نشد', 'Nothing planned found'))}
        </div>
        {dg.finished.length > 0 && (
          <div>
            <div className="label">{L('این تسک‌ها در گفت‌وگو «انجام شد» گفته شده‌اند — انجام‌شده شوند؟', 'The chat says these tasks are done — mark them done?')}</div>
            <ul className="space-y-1">
              {dg.finished.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={finish.has(f.id)} onChange={() => setFinish((s0) => { const n = new Set(s0); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })} />
                  <span>{f.title} <span className="text-[0.6875rem] text-sub" dir="auto">— {f.by.from}: «{titleOf(f.by.text, 60)}»</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button className="btn-primary btn-sm" disabled={busy || saved} onClick={save}>
            <CheckCircle2 size={14} /> {existing ? L('افزودن به گزارش این هفته', 'Add to this week’s update') : L('ثبت وضعیت این هفته', 'Save this week’s status')}
          </button>
          <span className="text-[0.6875rem] text-sub">{L('پیشنهاد خودکار است؛ قبل از ثبت بازبینی کنید.', 'This is a suggestion; review it before saving.')}</span>
        </div>
      </div>
    </Card>
  )
}
