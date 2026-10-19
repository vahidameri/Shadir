import { useEffect, useMemo, useRef, useState } from 'react'
import { JOB_TITLE } from '../lib/labels'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Briefcase, ListChecks, BellRing, ShieldAlert, User, CornerDownLeft, ArrowRight, Plus, Languages, Search, AtSign } from 'lucide-react'
import { useStore } from '../lib/store'
import { useI18n, L, lbl } from '../lib/i18n'
import { useEditor } from './Editor'
import { useComposer } from './UpdateComposer'
import { can } from '../lib/access'

const LEADER_ONLY: string[] = ['/risks', '/mizito']
import { cx, HealthDot, StatusIcon } from './ui'
import { projectMetrics } from '../lib/metrics'

interface Item {
  key: string
  group: string
  label: string
  sub?: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, me, canEdit, access } = useStore()
  const { lang, setLang } = useI18n()
  const editor = useEditor()
  const composer = useComposer()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const pname = (id: string) => db.Projects.find((p) => p.id === id)?.name || ''
    const G = { act: L('فرمان‌ها', 'Commands'), nav: L('رفتن به', 'Go to'), proj: L('پروژه‌ها', 'Projects'), task: L('تسک‌ها', 'Tasks'), fu: L('پیگیری‌ها', 'Follow-ups'), risk: L('ریسک‌ها', 'Risks'), ppl: L('افراد', 'People') }
    const ico = (I: typeof Briefcase) => <I size={16} />
    const actions: Item[] = [
      ...(canEdit
        ? [
            { key: 'new-task', group: G.act, label: L('تسک جدید', 'New task'), icon: ico(Plus), run: () => editor.open('Tasks', { assignee: me }) },
            { key: 'new-fu', group: G.act, label: L('پیگیری جدید', 'New follow-up'), icon: ico(Plus), run: () => editor.open('FollowUps') },
            { key: 'new-upd', group: G.act, label: L('گزارش هفتگی جدید', 'New weekly update'), icon: ico(Plus), run: () => composer.openComposer() },
            { key: 'new-mt', group: G.act, label: L('جلسه‌ی جدید', 'New meeting'), icon: ico(Plus), run: () => editor.open('Meetings') },
          ]
        : []),
      { key: 'lang', group: G.act, label: lang === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی', icon: ico(Languages), run: () => setLang(lang === 'fa' ? 'en' : 'fa') },
    ]
    const navs: Item[] = (
      [
        ['/my', L('میز کار', 'My desk')],
        ['/tasks', L('تسک‌ها و بورد', 'Tasks & board')],
        ['/followups', L('پیگیری‌ها', 'Follow-ups')],
        ['/mizito', L('میزیتو', 'Mizito')],
        ['/meetings', L('جلسات و اکشن‌ها', 'Meetings & actions')],
        ['/calendar', L('تقویم', 'Calendar')],
        ['/teams', L('تیم‌ها و پروژه‌ها', 'Teams & projects')],
        ['/projects', L('همه‌ی پروژه‌ها', 'All projects')],
        ['/risks', L('ریسک‌ها و تصمیم‌ها', 'Risks & decisions')],
        ['/me', L('پروفایل من', 'My profile')],
        ['/admin', L('بک‌آفیس و تنظیمات', 'Back office & settings')],
      ] as const
    )
      .filter(([to]) => (LEADER_ONLY.includes(to) ? can.portfolio(access) : to === '/admin' ? can.backoffice(access) : true))
      .map(([to, label]) => ({ key: `nav-${to}`, group: G.nav, label, icon: <ArrowRight size={16} className="rtl:-scale-x-100" />, run: () => navigate(to) }))
    const data: Item[] = [
      ...db.Projects.map((p) => ({ key: p.id, group: G.proj, label: p.name, sub: p.code, icon: <HealthDot h={projectMetrics(p, db).health} />, run: () => navigate(`/projects/${p.id}`) })),
      ...db.Tasks.map((t) => ({ key: t.id, group: G.task, label: t.title, sub: [pname(t.project_id), t.assignee].filter(Boolean).join(' · '), icon: <StatusIcon s={t.status} size={15} />, run: () => editor.open('Tasks', t as never) })),
      ...db.Mizito.map((m) => ({ key: m.id, group: G.fu, label: m.title, sub: `${L('میزیتو', 'Mizito')} · ${m.asked_by}`, icon: ico(AtSign), run: () => navigate(`/mizito?id=${m.id}`) })),
      ...db.FollowUps.map((f) => ({ key: f.id, group: G.fu, label: f.subject, sub: f.person, icon: ico(BellRing), run: () => editor.open('FollowUps', f as never) })),
      ...db.Risks.map((r) => ({ key: r.id, group: G.risk, label: r.title, sub: pname(r.project_id), icon: ico(ShieldAlert), run: () => editor.open('Risks', r as never) })),
      ...db.Team.map((m) => ({ key: m.id, group: G.ppl, label: m.name, sub: lbl(JOB_TITLE, m.role), icon: ico(User), run: () => navigate(`/people/${m.id}`) })),
    ]
    const s = q.trim().toLowerCase()
    if (!s) return [...actions, ...navs.slice(0, 6), ...data.filter((d) => d.group === G.proj).slice(0, 5)]
    const match = (i: Item) => i.label.toLowerCase().includes(s) || (i.sub || '').toLowerCase().includes(s)
    return [...actions.filter(match), ...navs.filter(match), ...data.filter(match)].slice(0, 40)
  }, [db, q, navigate, editor, me, canEdit, lang, setLang])

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  if (!open) return null

  const run = (i: Item) => {
    onClose()
    i.run()
  }

  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh] no-print">
      <div className="absolute inset-0 bg-[#0a0d12]/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop pop-in">
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search size={18} className="text-sub" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((i) => Math.min(items.length - 1, i + 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((i) => Math.max(0, i - 1))
              }
              if (e.key === 'Enter' && items[idx]) run(items[idx])
            }}
            placeholder={L('جستجو در پروژه‌ها، تسک‌ها، افراد یا فرمان‌ها…', 'Search projects, tasks, people or commands…')}
            className="h-16 w-full bg-transparent text-base outline-none"
          />
          <span className="kbd">ESC</span>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <div className="py-10 text-center text-sm text-sub">{L('نتیجه‌ای پیدا نشد', 'No results')}</div>}
          {items.map((i, n) => {
            const head = i.group !== lastGroup
            lastGroup = i.group
            return (
              <div key={i.key}>
                {head && <div className="eyebrow px-3 pb-1 pt-3">{i.group}</div>}
                <button data-i={n} onMouseMove={() => setIdx(n)} onClick={() => run(i)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start', n === idx && 'bg-muted')}>
                  <span className="grid w-5 shrink-0 place-items-center text-sub">{i.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
                  {i.sub && <span className="max-w-[40%] truncate text-xs text-sub">{i.sub}</span>}
                  {n === idx && <CornerDownLeft size={14} className="text-sub" />}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[0.6875rem] text-sub">
          <span className="flex items-center gap-1.5">
            <span className="kbd">↑↓</span> {L('حرکت', 'Navigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">↵</span> {L('انتخاب', 'Open')}
          </span>
          <span className="ms-auto flex items-center gap-1.5">
            <ListChecks size={12} /> <span className="kbd">N</span> {L('تسک', 'Task')} <span className="kbd">F</span> {L('پیگیری', 'Follow-up')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
