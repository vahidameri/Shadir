// The organisation in the back office: job titles, teams and sides are lists the program manager edits.
import { useState } from 'react'
import { ArrowDown, ArrowUp, BookA, Building2, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, cx } from './ui'
import { L, locale, tr, type T2 } from '../lib/i18n'
import { ORG_KEYS, orgList, type OrgItem, type OrgKind } from '../lib/org'
import { teamCodes } from '../lib/labels'
import { TERMS, TERMS_KEY, termOverrides } from '../lib/terms'

const TITLE: Record<OrgKind, T2> = { plans: ['هدف‌های برنامه‌ریزی', 'Planning purposes'], links: ['نوع لینک‌های پروژه', 'Project link types'], access: ['سطح دسترسی (فقط نام)', 'Access levels (names only)'], series: ['جلسه‌ها (عنوان سری‌ها)', 'Meeting series'], titles: ['سمت‌ها', 'Job titles'], teams: ['گروه‌های سازمانی (مدیریت، PMO…)', 'Org groups (leadership, PMO…)'], sides: ['تیم‌های دپارتمان (لاین‌ها، مدیران محصول، CRM و عملیات، داده…)', 'Department teams (lines, product managers, CRM & ops, data…)'] }
const HINT: Record<OrgKind, T2> = {
  plans: ['برنامه‌ریزی برای چه؟ دمو، بستن رودمپ، اسپرینت، انتشار… هر هدف چک‌لیست آمادگی خودش را دارد.', 'What a planning session is for: a demo, the roadmap, a sprint, a release… each starts with its own checklist.'],
  links: ['لینک‌هایی که هر پروژه دارد: استیج، پروداکشن، فیگما، …', 'The links each project keeps: staging, production, Figma, …'],
  access: ['چهار سطح ثابت‌اند (مدیر برنامه: همه‌چیز + بک‌آفیس، CPTO، هد، عضو)؛ فقط اسمشان را عوض کنید.', 'The four levels are fixed (PgM: everything + back office, CPTO, head, member); only rename them.'],
  series: ['انواع جلسه؛ ویکلی‌ها هر هفته تکرار می‌شوند، بقیه (وان‌آن‌وان، موردی، بیرونی، برنامه‌ریزی، سایر) نه.', 'Meeting types; the weeklies repeat, the rest (one-on-one, ad-hoc, external, planning, other) don’t.'],
  titles: ['کد کوتاه انگلیسی (مثل CPTO) روی کارت هر نفر دیده می‌شود.', 'The short code (e.g. CPTO) shows on each person.'],
  teams: ['گروه‌بندی افراد (هر نفر می‌تواند در چند گروه باشد)؛ با «تیم‌ها»ی دپارتمان فرق دارد.', 'Groupings of people (one can be in several); not the department teams.'],
  sides: ['هر تیم پروژه‌های خودش را دارد و در صفحه‌ی «تیم‌ها» با وضعیتش دیده می‌شود. هر تسک و هر نفر هم یک تیم دارد. برای حذف یا اضافه، همین فهرست را ویرایش کنید.', 'Each team owns its projects and shows on the Teams page with its status; every task and person has a team. Edit this list to add or remove teams.'],
}

export function OrgList({ kind, admin: canEdit, bare }: { kind: OrgKind; admin: boolean; bare?: boolean }) {
  const admin = canEdit
  const fixed = kind === 'access'
  const { db, setSetting, toast } = useStore()
  const list = orgList(kind)
  const [draft, setDraft] = useState<OrgItem>({ id: '', fa: '', en: '' })
  const save = (next: OrgItem[]) => setSetting(ORG_KEYS[kind], JSON.stringify(next))
  const used = (id: string) =>
    kind === 'links' ? db.Projects.filter((p) => String(p.links || '').includes(`"${id}"`)).length : kind === 'access' ? db.Team.filter((m) => m.access === id).length : kind === 'series' ? db.Meetings.filter((m) => m.series === id).length : kind === 'plans' ? db.Meetings.filter((m) => m.purpose === id).length : kind === 'titles' ? db.Team.filter((m) => m.role === id).length : kind === 'teams' ? db.Team.filter((m) => teamCodes(m.team, m.role, m.track).includes(id)).length : db.Team.filter((m) => m.track === id).length + db.Tasks.filter((t) => t.track === id).length
  const edit = (i: number, k: keyof OrgItem, v: string) => {
    if ((list[i][k] || '') === v) return
    save(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  }
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const remove = (i: number) => {
    const n = used(list[i].id)
    if (list.length <= 1) return
    save(list.filter((_, j) => j !== i))
    if (n) toast(L(`${n} مورد هنوز «${list[i].fa}» را دارند؛ آن‌ها را ویرایش کنید.`, `${n} item(s) still use “${list[i].en}”; edit them.`), 'err')
  }
  const add = () => {
    const id = (draft.id || draft.en || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!id || !draft.fa.trim() || list.some((x) => x.id === id)) return
    save([...list, { id, fa: draft.fa.trim(), en: (draft.en || draft.fa).trim(), ...(kind === 'sides' ? { color: draft.color || '#6b7180' } : {}) }])
    setDraft({ id: '', fa: '', en: '' })
  }
  const cell = 'h-8 min-w-0 rounded-lg bg-transparent px-2 text-sm outline-none focus:bg-muted disabled:opacity-80'
  return (
    <div>
      {!bare && <div className="mb-1 text-sm font-semibold">{tr(TITLE[kind])}</div>}
      <p className="mb-2 text-[0.6875rem] text-sub">{tr(HINT[kind])}</p>
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[0.625rem] text-sub">
        {kind === 'sides' && <span className="w-6">{L('رنگ', 'Colour')}</span>}
        <span className="w-14">{L('کد', 'Code')}</span>
        <span className="flex-1 px-2">{L('نام فارسی', 'Persian name')}</span>
        <span className="w-44 px-2">{L('نام انگلیسی', 'English name')}</span>
        <span className="w-6 text-center" title={L('در حال استفاده', 'In use')}>#</span>
        {admin && !fixed && <span className="w-[5.75rem]" />}
      </div>
      <ul className="space-y-1.5">
        {list.map((x, i) => (
          <li key={x.id} className="flex items-center gap-1.5 rounded-2xl border border-line px-2 py-1">
            {kind === 'sides' && <input type="color" disabled={!admin} className="h-6 w-6 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" defaultValue={x.color || '#6b7180'} onBlur={(e) => edit(i, 'color', e.target.value)} aria-label={L('رنگ', 'Colour')} />}
            <span dir="ltr" className="w-14 shrink-0 truncate font-mono text-[0.6875rem] uppercase text-sub">{x.id}</span>
            <input key={'fa' + x.fa} className={cx(cell, 'flex-1')} disabled={!admin} defaultValue={x.fa} onBlur={(e) => e.target.value.trim() && edit(i, 'fa', e.target.value.trim())} />
            <input key={'en' + x.en} dir="ltr" className={cx(cell, 'w-44')} disabled={!admin} defaultValue={x.en} onBlur={(e) => e.target.value.trim() && edit(i, 'en', e.target.value.trim())} />
            <span className="w-6 text-center text-[0.625rem] text-sub num" title={L('در حال استفاده', 'In use')}>{used(x.id) || ''}</span>
            {admin && !fixed && (
              <>
                <button className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={L('بالا', 'Up')}><ArrowUp size={13} /></button>
                <button className="icon-btn h-7 w-7" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={L('پایین', 'Down')}><ArrowDown size={13} /></button>
                <button className="icon-btn h-7 w-7 hover:text-bad" onClick={() => remove(i)} aria-label={L('حذف', 'Remove')}><Trash2 size={13} /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      {admin && !fixed && (
        <form className="mt-2 flex flex-wrap gap-1.5" onSubmit={(e) => (e.preventDefault(), add())}>
          <input dir="ltr" className="input h-9 w-20 text-xs" placeholder={kind === 'titles' ? 'APM' : L('کد', 'Code')} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
          <input className="input h-9 min-w-0 flex-1 text-xs" placeholder={kind === 'titles' ? L('نام فارسی، مثلاً دستیار مدیر محصول', 'Persian name') : L('نام فارسی', 'Persian name')} value={draft.fa} onChange={(e) => setDraft({ ...draft, fa: e.target.value })} />
          <input dir="ltr" className="input h-9 w-44 text-xs" placeholder={kind === 'titles' ? 'Assistant PM' : L('نام انگلیسی', 'English name')} value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} />
          {kind === 'sides' && <input type="color" className="h-9 w-9 rounded-xl border border-line" value={draft.color || '#6b7180'} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />}
          <button className="btn-outline btn-sm h-9" disabled={!draft.fa.trim() || !(draft.id || draft.en).trim()}>
            <Plus size={14} /> {kind === 'titles' ? L('افزودن سمت', 'Add title') : L('افزودن', 'Add')}
          </button>
        </form>
      )}
    </div>
  )
}

/** Back office → Organisation: titles first (the most edited), then teams, units and the rest. */
export function OrgPage({ admin }: { admin: boolean }) {
  return (
    <div className="grid items-start gap-4 @3xl:grid-cols-2">
      <Card eyebrow={<span className="flex items-center gap-1.5"><Building2 size={12} /> {L('سازمان', 'Organisation')}</span>} title={L('سمت‌ها', 'Job titles')} className="@3xl:col-span-2">
        <OrgList kind="titles" admin={admin} bare />
      </Card>
      <Card eyebrow={L('سازمان', 'Organisation')} title={L('تیم‌های دپارتمان', 'Department teams')}>
        <div className="space-y-6">
          <OrgList kind="sides" admin={admin} />
          <OrgList kind="teams" admin={admin} />
        </div>
      </Card>
      <Card eyebrow={L('دسترسی', 'Access')} title={L('نام سطح‌های دسترسی', 'Access level names')}>
        <OrgList kind="access" admin={admin} bare />
      </Card>
      <Card eyebrow={L('پروژه و جلسه', 'Projects & meetings')} title={L('نوع لینک‌ها و جلسه‌ها', 'Link types & meetings')}>
        <div className="space-y-6">
          <OrgList kind="links" admin={admin} />
          <OrgList kind="series" admin={admin} />
          <OrgList kind="plans" admin={admin} />
        </div>
      </Card>
      <div className="@3xl:col-span-2">
        <TermsCard admin={admin} />
      </div>
    </div>
  )
}

/** The glossary: rename Madar's main words; every label follows. */
export function TermsCard({ admin }: { admin: boolean }) {
  const { setSetting } = useStore()
  const o = termOverrides()
  const save = (id: string, k: 'fa' | 'en', v: string) => {
    const cur = { ...(o[id] || {}) }
    if ((cur[k] || '') === v.trim()) return
    cur[k] = v.trim()
    const next = { ...o, [id]: cur }
    if (!cur.fa && !cur.en) delete next[id]
    setSetting(TERMS_KEY, JSON.stringify(next))
  }
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><BookA size={12} /> {L('فرهنگ اصطلاحات', 'Glossary')}</span>} title={L('اسم مفاهیم اصلی', 'The names of the main ideas')}>
      <p className="mb-3 text-xs leading-6 text-sub">{L('هر کلمه را این‌جا عوض کنید، در کل مدار (منوها، عنوان‌ها، دکمه‌ها) عوض می‌شود. خالی بگذارید تا پیش‌فرض بماند.', 'Rename a word here and it changes across Madar (menus, titles, buttons). Leave blank to keep the default.')}</p>
      <ul className="divide-y divide-line">
        {TERMS.map((t) => (
          <li key={t.id} className="grid items-center gap-2 py-2 sm:grid-cols-[9rem_1fr_1fr]">
            <div className="min-w-0">
              {/* the default word, shown as is (not through the glossary) */}
              <div className="text-sm font-medium">{locale.lang === 'fa' ? <>{t.word[0]} <span className="text-sub">· {t.word[1]}</span></> : t.word[1]}</div>
              <div className="truncate text-[0.625rem] text-sub" title={tr(t.hint)}>{tr(t.hint)}</div>
            </div>
            <input key={'fa' + (o[t.id]?.fa || '')} className="input h-9 text-xs" disabled={!admin} defaultValue={o[t.id]?.fa || ''} placeholder={t.word[0]} onBlur={(e) => save(t.id, 'fa', e.target.value)} />
            <input key={'en' + (o[t.id]?.en || '')} dir="ltr" className="input h-9 text-xs" disabled={!admin} defaultValue={o[t.id]?.en || ''} placeholder={t.word[1]} onBlur={(e) => save(t.id, 'en', e.target.value)} />
          </li>
        ))}
      </ul>
    </Card>
  )
}
