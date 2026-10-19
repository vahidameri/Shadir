// A project's links — staging, production, Figma, repository… (types are set in the back office).
import { useState } from 'react'
import { ExternalLink, PenTool, FileText, FlaskConical, GitBranch, Globe, Link2, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import type { Project } from '../lib/types'
import { useStore } from '../lib/store'
import { can } from '../lib/access'
import { orgList } from '../lib/org'
import { L, tr } from '../lib/i18n'
import { Popover, cx } from './ui'

export interface ProjectLink {
  type: string
  url: string
  label?: string
}
export function linksOf(p: Project): ProjectLink[] {
  try {
    const v = JSON.parse(p.links || '[]')
    return Array.isArray(v) ? v.filter((x) => x && x.url) : []
  } catch {
    return []
  }
}
const ICON: Record<string, typeof Link2> = { stage: FlaskConical, prod: Globe, figma: PenTool, repo: GitBranch, docs: FileText, prd: FileText, chat: Send }
const typeName = (t: string) => {
  const o = orgList('links').find((x) => x.id === t)
  return o ? tr([o.fa, o.en]) : t || L('لینک', 'Link')
}
const withScheme = (u: string) => (/^[a-z]+:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`)

function LinkForm({ init, onSave, onDelete }: { init?: ProjectLink; onSave: (l: ProjectLink) => void; onDelete?: () => void }) {
  const types = orgList('links')
  const [l, setL] = useState<ProjectLink>(init || { type: types[0]?.id || '', url: '', label: '' })
  return (
    <form className="space-y-2 p-2.5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => (e.preventDefault(), l.url.trim() && onSave({ ...l, url: withScheme(l.url) }))}>
      <select className="input h-9 text-xs" value={l.type} onChange={(e) => setL({ ...l, type: e.target.value })}>
        {types.map((t) => (
          <option key={t.id} value={t.id}>{tr([t.fa, t.en])}</option>
        ))}
        <option value="">{L('سایر', 'Other')}</option>
      </select>
      <input autoFocus dir="ltr" className="input h-9 text-xs" placeholder="https://…" value={l.url} onChange={(e) => setL({ ...l, url: e.target.value })} />
      <input className="input h-9 text-xs" placeholder={L('عنوان (اختیاری)، مثلاً «اپ موبایل»', 'Label (optional), e.g. “Mobile app”')} value={l.label || ''} onChange={(e) => setL({ ...l, label: e.target.value })} />
      <div className="flex gap-2">
        <button className="btn-primary btn-sm flex-1" disabled={!l.url.trim()}>{L('ذخیره', 'Save')}</button>
        {onDelete && (
          <button type="button" className="btn-danger btn-sm" onClick={onDelete} aria-label={L('حذف', 'Remove')}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </form>
  )
}

export function ProjectLinks({ p, dark }: { p: Project; dark?: boolean }) {
  const { canEdit, access, me, upsert } = useStore()
  const links = linksOf(p)
  const editable = canEdit && (can.manage(access) || p.owner === me)
  if (!links.length && !editable) return null
  const save = (next: ProjectLink[]) => upsert('Projects', { ...p, links: JSON.stringify(next) })
  const chip = dark ? 'border-white/15 text-white hover:bg-white/10' : 'border-line text-ink hover:bg-muted'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.map((l, i) => {
        const Icon = ICON[l.type] || Link2
        return (
          <span key={i} className={cx('group inline-flex h-8 items-center rounded-full border text-xs transition', chip)}>
            <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex h-full items-center gap-1.5 ps-3 pe-2" title={l.url}>
              <Icon size={13} /> {l.label || typeName(l.type)} <ExternalLink size={11} className="opacity-60" />
            </a>
            {editable && (
              <Popover
                width={280}
                trigger={({ toggle }) => (
                  <button className="grid h-full w-7 place-items-center rounded-e-full opacity-60 hover:opacity-100" onClick={toggle} aria-label={L('ویرایش لینک', 'Edit link')}>
                    <Pencil size={11} />
                  </button>
                )}
              >
                {(close) => (
                  <LinkForm
                    init={l}
                    onSave={(n) => (save(links.map((x, j) => (j === i ? n : x))), close())}
                    onDelete={() => (save(links.filter((_, j) => j !== i)), close())}
                  />
                )}
              </Popover>
            )}
          </span>
        )
      })}
      {editable && (
        <Popover
          width={280}
          trigger={({ toggle }) => (
            <button onClick={toggle} className={cx('inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-xs transition', dark ? 'border-white/25 text-white/70 hover:text-white' : 'border-line-strong text-sub hover:text-ink')}>
              <Plus size={13} /> {L('لینک', 'Link')}
            </button>
          )}
        >
          {(close) => <LinkForm onSave={(n) => (save([...links, n]), close())} />}
        </Popover>
      )}
    </div>
  )
}
