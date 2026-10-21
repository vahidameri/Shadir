// Mizito queue: what the CPTO and the PgM were mentioned on, one row per Mizito task, sorted by
// priority (P0 first, then SLA, then deadline). Re-mentions thread into the same row.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AtSign, Bot, Check, Copy, Plus, Rows3, Settings2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, FilterSelect, Overlap, SearchInput, Segmented, Sheet, StatStrip, cx } from '../components/ui'
import { L } from '../lib/i18n'
import { fa, fmtDate, timeAgo } from '../lib/jalali'
import { MZ_KEYS, MZ_VIEWS, agentRun, changeUnseen, firstFor, firstMzStatus, isExecTier, mzFlags as flagsOf, recentlyChanged, inMzView, isMizitoLink, mzCat, mzCfg, mzFlags, mzSignals, optLabel, statusById, tierById, type MzView } from '../lib/mizito'
import { daysFromToday } from '../lib/jalali'
import { CaptureSheet, MzBadges, MizitoSettings, MizitoSheet, MzLink, MzSignals, MzStatusChip, PBadge, useReminder } from '../components/MizitoParts'
import type { MizitoItem } from '../lib/types'

const VIEW_LABEL: Record<MzView, [string, string]> = {
  queue: ['صف باز', 'Open queue'], inbox: ['تازه از میزیتو', 'New from Mizito'], changed: ['تغییر در میزیتو', 'Changed in Mizito'], p0: ['P0', 'P0'], exec: ['درخواست مدیران ارشد', 'Exec asks'], breached: ['عبور از SLA', 'SLA breached'],
  waiting: ['منتظر / مسدود', 'Waiting / blocked'], stale: ['راکد', 'Quiet'], mine_cpto: ['', ''], mine_pgm: ['', ''], closed: ['بسته‌شده', 'Closed'], all: ['همه', 'All'],
}
type Group = '' | 'asker' | 'category' | 'p' | 'status' | 'assigned'

export default function MizitoPage() {
  const { db, canEdit, access, me, upsert, toast, setting } = useStore()
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) || ''
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v)
    else n.delete(k)
    setParams(n, { replace: true })
  }
  const view = (get('v') || 'queue') as MzView
  const group = get('g') as Group
  const who = get('who')
  const cat = get('cat')
  const [q, setQ] = useState('')
  const [capture, setCapture] = useState<false | string>(false)
  const openId = get('id')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const sort = get('s') || 'p'
  // paste a Mizito link anywhere on the page (outside a field) to log it
  useEffect(() => {
    // not while an item or the capture sheet is open: the paste belongs to that sheet
    if (!canEdit || openId || capture !== false) return
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, [contenteditable="true"]') || t.closest('[role="dialog"]'))) return
      const text = e.clipboardData?.getData('text') || ''
      if (isMizitoLink(text)) {
        e.preventDefault()
        setCapture(text.trim())
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canEdit, openId, capture])
  const [settings, setSettings] = useState(false)
  const remind = useReminder()
  const c = mzCfg()
  const leaders = db.Team.filter((m) => m.access === 'super' || m.access === 'exec').map((m) => m.name)

  const sig = useMemo(() => new Map(db.Mizito.map((m) => [m.id, mzSignals(db, m)])), [db])
  const badge = get('b')
  const hasBadge = (m: MizitoItem) => {
    const key = flagsOf(m).keyProject
    const exec = isExecTier(mzSignals(db, m).tier)
    return badge === 'key' ? key : badge === 'exec' ? exec : badge === 'any' ? key || exec : true
  }
  const base = db.Mizito.filter((m) => (!who || m.mentioned.split(',').map((x) => x.trim()).includes(who)) && (!cat || m.category === cat) && hasBadge(m) && (!q || [m.title, m.description, m.asked_by, m.assigned_to, m.outcome].some((v) => String(v || '').includes(q))))
  const counts = Object.fromEntries(MZ_VIEWS.map((v) => [v, base.filter((m) => inMzView(db, m, v, sig.get(m.id))).length])) as Record<MzView, number>
  const list = base
    .filter((m) => inMzView(db, m, view, sig.get(m.id)))
    .sort((a, b) => {
      const x = sig.get(a.id)!
      const y = sig.get(b.id)!
      const last = (m: MizitoItem) => m.last_mention_at || m.received_at || m.created_at || ''
      // with a person picked, "oldest" is when the assistant first wrote to that person
      const first = (m: MizitoItem) => firstFor(m, who)
      // what changed in Mizito: newest change first
      if (view === 'changed') return String(a.mz_changed_at || '') < String(b.mz_changed_at || '') ? 1 : -1
      if (sort === 'recent') return last(a) < last(b) ? 1 : -1
      if (sort === 'old') return first(a) < first(b) ? -1 : 1
      if (sort === 'new') return first(a) < first(b) ? 1 : -1
      if (sort === 'due') return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : a.due_date === b.due_date ? x.p - y.p : 1
      return x.p - y.p || (x.slaLeft ?? 1e9) - (y.slaLeft ?? 1e9) || (x.toDue ?? 1e9) - (y.toDue ?? 1e9) || y.score - x.score || (last(a) < last(b) ? 1 : -1)
    })
  const groups = useMemo(() => {
    if (!group) return [{ key: '', label: '', rows: list }]
    const keyOf = (m: MizitoItem) => (group === 'asker' ? m.asked_by : group === 'category' ? m.category : group === 'p' ? `P${sig.get(m.id)!.p}` : group === 'status' ? m.status : m.assigned_to) || ''
    const label = (k: string) => (group === 'category' ? optLabel(c.categories.find((x) => x.id === k)) : group === 'status' ? optLabel(statusById(k)) : k) || L('نامشخص', 'Unset')
    const map = new Map<string, MizitoItem[]>()
    for (const m of list) map.set(keyOf(m), [...(map.get(keyOf(m)) || []), m])
    return [...map.entries()].sort((a, b) => (group === 'p' ? a[0].localeCompare(b[0]) : b[1].length - a[1].length)).map(([k, rows]) => ({ key: k, label: label(k), rows }))
  }, [list, group, sig, c])

  if (!(access === 'super' || access === 'exec')) return <Empty text={L('این بخش فقط برای CPTO و مدیر برنامه است', 'For the CPTO and the PgM only')} />
  const open = base.filter((m) => inMzView(db, m, 'queue', sig.get(m.id)))
  const closedWeek = db.Mizito.filter((m) => m.closed_at && daysFromToday(m.closed_at.slice(0, 10)) >= -7).length
  const setStatus = async (ids: string[], status: string) => {
    for (const id of ids) {
      const m = db.Mizito.find((x) => x.id === id)
      if (m && m.status !== status) await upsert('Mizito', { ...m, status })
    }
    if (ids.length > 1) toast(L(`وضعیت ${fa(ids.length)} مورد به‌روز شد`, `${ids.length} items updated`))
    setPicked(new Set())
  }
  // the agent's new items: keep (it joins the queue as is) or set aside (cancelled, never reopened by the agent)
  const review = async (ids: string[], keep: boolean) => {
    for (const id of ids) {
      const m = db.Mizito.find((x) => x.id === id)
      if (m) await upsert('Mizito', keep ? { ...m, review: '' } : { ...m, review: 'ignored', status: firstMzStatus('cancelled') })
    }
    toast(keep ? L(`${fa(ids.length)} مورد به صف اضافه شد`, `${ids.length} added to the queue`) : L(`${fa(ids.length)} مورد کنار گذاشته شد`, `${ids.length} set aside`))
    setPicked(new Set())
  }
  const runs = leaders.map((n) => ({ name: n, run: agentRun(setting(MZ_KEYS.agent + n)) })).filter((x) => x.run.key_at && !x.run.revoked)
  const togglePick = (id: string) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  return (
    <>
      <Band
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><AtSign size={12} /> {c.base.replace(/^https?:\/\//, '')}</span>
            {runs.map((x) => (
              <span key={x.name} className={cx('inline-flex items-center gap-1', x.run.error && 'text-red-200')} title={x.run.error || ''}>
                <Bot size={12} /> {x.name}: {x.run.at ? L(`همگام ${timeAgo(new Date(x.run.at.replace(' ', 'T')))}`, `synced ${timeAgo(new Date(x.run.at.replace(' ', 'T')))}`) : L('هنوز همگام نشده', 'not synced yet')}
                {x.run.error && ' ⚠'}
              </span>
            ))}
          </span>
        }
        title={L('میزیتو', 'Mizito')}
        actions={
          <>
            {access === 'super' && (
              <button className="btn h-10 w-10 bg-white/10 px-0 text-white hover:bg-white/20" onClick={() => setSettings(true)} title={L('تنظیمات میزیتو', 'Mizito settings')} aria-label={L('تنظیمات میزیتو', 'Mizito settings')}>
                <Settings2 size={17} />
              </button>
            )}
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => setCapture('')} title={L('یا لینک میزیتو را هر جای صفحه پیست کنید', 'Or paste a Mizito link anywhere on the page')}>
                <Plus size={16} /> {L('ثبت منشن', 'Log a mention')}
              </button>
            )}
          </>
        }
      >
        <StatStrip
          items={[
            { label: L('باز', 'Open'), value: fa(open.length) },
            { label: 'P0', value: fa(counts.p0), tone: counts.p0 ? 'red' : 'green' },
            { label: L('عبور از SLA', 'SLA breached'), value: fa(counts.breached), tone: counts.breached ? 'red' : 'green' },
            { label: L('درخواست مدیران ارشد', 'Exec asks'), value: fa(counts.exec), tone: counts.exec ? 'amber' : 'muted' },
            { label: L('منتظر / مسدود', 'Waiting / blocked'), value: fa(counts.waiting), tone: counts.waiting ? 'amber' : 'muted' },
            { label: L('بسته‌شده در ۷ روز', 'Closed in 7 days'), value: fa(closedWeek), tone: 'green' },
          ]}
        />
      </Band>
      <Overlap>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {MZ_VIEWS.map((v) => (
            <button key={v} onClick={() => set('v', v === 'queue' ? '' : v)} className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition', view === v ? 'border-ink bg-ink text-surface' : 'border-line bg-surface hover:border-line-strong')}>
              {L(...VIEW_LABEL[v])}
              <span className={cx('num', view !== v && (v === 'p0' || v === 'breached') && counts[v] ? 'text-bad' : 'opacity-60', !counts[v] && 'opacity-40')}>{fa(counts[v])}</span>
            </button>
          ))}
        </div>
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
          <SearchInput value={q} onChange={setQ} />
          <Segmented value={(who || '') as string} onChange={(v) => set('who', v)} options={[{ value: '', label: L('همه', 'Everyone') }, ...leaders.map((n) => ({ value: n, label: n === me ? L(`${n} (من)`, `${n} (me)`) : n }))]} />
          <FilterSelect value={cat} onChange={(v) => set('cat', v)} placeholder={L('همه‌ی دسته‌ها', 'All categories')} options={c.categories.map((x) => ({ value: x.id, label: optLabel(x) }))} />
          <FilterSelect
            value={badge}
            onChange={(v) => set('b', v)}
            placeholder={L('همه‌ی موارد', 'All items')}
            options={[
              { value: 'key', label: c.keyProjects.join('، ') || L('پروژه‌های کلیدی', 'Key projects') },
              { value: 'exec', label: L('مدیران ارشد', 'Senior managers') },
              { value: 'any', label: L(`${c.keyProjects[0] || 'پروژه‌های کلیدی'} یا مدیران ارشد`, `${c.keyProjects[0] || 'Key projects'} or senior managers`) },
            ]}
          />
          <FilterSelect
            value={sort === 'p' ? '' : sort}
            onChange={(v) => set('s', v)}
            placeholder={L('مرتب: اولویت و SLA', 'Sort: priority & SLA')}
            options={[
              { value: 'recent', label: L('مرتب: آخرین منشن', 'Sort: latest mention') },
              { value: 'old', label: L('مرتب: قدیمی‌ترین پیام دستیار', 'Sort: oldest assistant message') },
              { value: 'new', label: L('مرتب: جدیدترین پیام دستیار', 'Sort: newest assistant message') },
              { value: 'due', label: L('مرتب: ددلاین', 'Sort: deadline') },
            ]}
          />
          <span className="inline-flex items-center gap-1.5">
            <Rows3 size={14} className="text-sub" />
            <FilterSelect
              value={group}
              onChange={(v) => set('g', v)}
              placeholder={L('بدون گروه‌بندی', 'No grouping')}
              options={[
                { value: 'asker', label: L('گروه: مطرح‌کننده', 'Group: asked by') },
                { value: 'p', label: L('گروه: اولویت', 'Group: priority') },
                { value: 'category', label: L('گروه: دسته', 'Group: category') },
                { value: 'status', label: L('گروه: وضعیت', 'Group: status') },
                { value: 'assigned', label: L('گروه: سپرده به', 'Group: handed to') },
              ]}
            />
          </span>
        </div>

        {picked.size > 0 && (
          <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-float">
            <span className="text-sm font-medium">{L(`${fa(picked.size)} مورد انتخاب شد`, `${picked.size} selected`)}</span>
            <span className="text-xs text-sub">{L('وضعیت:', 'Status:')}</span>
            {c.statuses.map((x) => (
              <button key={x.id} className={cx('btn-sm', x.cat === 'done' ? 'btn-primary' : 'btn-outline')} onClick={() => setStatus([...picked], x.id)}>{optLabel(x)}</button>
            ))}
            {[...picked].some((id) => db.Mizito.find((x) => x.id === id)?.review === 'new') && (
              <>
                <span className="mx-1 h-5 w-px bg-line" />
                <button className="btn-outline btn-sm" onClick={() => review([...picked], true)}><Check size={14} /> {L('به صف', 'To the queue')}</button>
                <button className="btn-outline btn-sm" onClick={() => review([...picked], false)}><X size={14} /> {L('کنار گذاشتن', 'Set aside')}</button>
              </>
            )}
            <button className="btn-ghost btn-sm ms-auto" onClick={() => setPicked(new Set())}>{L('لغو انتخاب', 'Clear')}</button>
          </div>
        )}
        {view === 'inbox' && list.length > 0 && canEdit && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/20 bg-brand-soft/30 px-4 py-3 text-sm">
            <Bot size={18} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 leading-6">
              {L('این‌ها را ایجنت از میزیتو آورده و هنوز نگاهشان نکرده‌اید. در صف هستند؛ دسته و نوع اقدام را بدهید و «به صف» بزنید، یا اگر به ما مربوط نیست کنار بگذارید.', 'The agent brought these from Mizito and nobody has looked at them yet. They are already in the queue; give them a category and action and keep them, or set them aside.')}
            </span>
            <button className="btn-primary btn-sm" onClick={() => review(list.map((m) => m.id), true)}><Check size={14} /> {L(`همه به صف (${fa(list.length)})`, `Keep all (${list.length})`)}</button>
          </div>
        )}
        <Card pad={false}>
          {list.length === 0 ? (
            <Empty text={db.Mizito.length ? L('موردی در این نما نیست', 'Nothing in this view') : L('هنوز موردی ثبت نشده. لینک تسک میزیتو را با «ثبت منشن» اضافه کنید یا از بک‌آفیس ایمپورت کنید.', 'Nothing yet. Add a Mizito link with “Log a mention” or import from the back office.')} />
          ) : (
            <div className="divide-y divide-line">
              {groups.map((g) => (
                <div key={g.key || '-'}>
                  {group && (
                    <div className="flex items-center gap-2 bg-muted/50 px-4 py-2 text-xs font-semibold">
                      {group === 'asker' && g.key && tierById(db.Contacts.find((x) => x.name === g.key)?.tier) && <span className="h-2 w-2 rounded-full" style={{ background: tierById(db.Contacts.find((x) => x.name === g.key)?.tier)!.color }} />}
                      {g.label} <span className="font-normal text-sub num">{fa(g.rows.length)}</span>
                    </div>
                  )}
                  {g.rows.map((m) => {
                    const s = sig.get(m.id)!
                    return (
                      <div key={m.id} onClick={() => set('id', m.id)} className={cx('group flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-muted/40', s.p === 0 && 'bg-bad/[0.03]', picked.has(m.id) && 'bg-brand-soft/30')}>
                        {canEdit && <input type="checkbox" className="mt-1.5" checked={picked.has(m.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(m.id)} aria-label={L('انتخاب', 'Select')} />}
                        <PBadge p={s.p} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <MzBadges m={m} />
                            {mzFlags(m).fresh && <span className="rounded-full bg-brand px-1.5 text-[0.625rem] font-medium leading-5 text-white">{L('تازه', 'New')}</span>}
                            <span className="font-medium">{m.title}</span>
                            {canEdit ? (
                              <select
                                value={m.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setStatus([m.id], e.target.value)}
                                aria-label={L('وضعیت', 'Status')}
                                className={cx('h-6 rounded-full border-0 px-2 text-[0.6875rem] font-medium', mzCat(m.status) === 'done' ? 'bg-good/15 text-good' : mzCat(m.status) === 'blocked' ? 'bg-bad/10 text-bad' : mzCat(m.status) === 'waiting' ? 'bg-warn/15 text-warn' : 'bg-muted text-ink')}
                              >
                                {c.statuses.map((x) => <option key={x.id} value={x.id}>{optLabel(x)}</option>)}
                              </select>
                            ) : (
                              <MzStatusChip id={m.status} />
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.6875rem] text-sub">
                            {m.asked_by && (
                              <span className="inline-flex items-center gap-1">
                                {s.tier && <span className="h-2 w-2 rounded-full" style={{ background: s.tier.color }} title={optLabel(s.tier)} />}
                                <b className="font-medium text-ink">{m.asked_by}</b>
                                {s.tier && <span>({optLabel(s.tier)})</span>}
                              </span>
                            )}
                            {m.mz_project && <span>· {m.mz_project}</span>}
                            {m.category && <span>· {optLabel(c.categories.find((x) => x.id === m.category))}</span>}
                            {m.action && <span>· {optLabel(c.actions.find((x) => x.id === m.action))}</span>}
                            <span>· {L('منشن', 'mentioned')} {fmtDate(firstFor(m, who))}</span>
                            {s.mentions > 1 && <span>· {L(`${fa(s.mentions)} بار منشن`, `${s.mentions} mentions`)}</span>}
                            {m.assigned_to && <span>· {L('سپرده به', 'with')} {m.assigned_to}</span>}
                          </div>
                          <div className="mt-1.5"><MzSignals m={m} compact /></div>
                          {m.mz_change && recentlyChanged(m) && (
                            <div className={cx('mt-1.5 flex items-center gap-1.5 text-xs', changeUnseen(m) ? 'font-medium text-ink' : 'text-sub')}>
                              {changeUnseen(m) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" title={L('تغییر تازه‌ای که هنوز ندیده‌اید', 'A change you have not seen')} />}
                              <Bot size={12} className="shrink-0 text-sub" />
                              <span className="min-w-0 truncate">{m.mz_change}</span>
                              <span className="shrink-0 text-sub">· {timeAgo(new Date(String(m.mz_changed_at).replace(' ', 'T')))}</span>
                            </div>
                          )}
                          {m.outcome && <div className="mt-1 truncate text-xs text-sub">↳ {m.outcome}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {canEdit && mzFlags(m).fresh && (
                            <>
                              <button className="icon-btn h-8 w-8 hover:text-good" onClick={() => review([m.id], true)} title={L('به صف', 'To the queue')} aria-label={L('به صف', 'To the queue')}><Check size={15} /></button>
                              <button className="icon-btn h-8 w-8 hover:text-bad" onClick={() => review([m.id], false)} title={L('کنار گذاشتن', 'Set aside')} aria-label={L('کنار گذاشتن', 'Set aside')}><X size={15} /></button>
                            </>
                          )}
                          <button className="icon-btn h-8 w-8 opacity-0 transition group-hover:opacity-100" onClick={() => remind(m)} title={L('کپی متن یادآوری', 'Copy reminder')} aria-label={L('کپی متن یادآوری', 'Copy reminder')}>
                            <Copy size={14} />
                          </button>
                          <MzLink m={m} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Overlap>
      {capture !== false && <CaptureSheet initialLink={capture} onClose={() => setCapture(false)} onOpen={(id) => set('id', id)} />}
      {openId && <MizitoSheet id={openId} onClose={() => set('id', '')} />}
      {settings && (
        <Sheet open wide onClose={() => setSettings(false)} header={<h2 className="font-semibold">{L('تنظیمات میزیتو', 'Mizito settings')}</h2>}>
          <div className="p-4"><MizitoSettings admin={access === 'super'} /></div>
        </Sheet>
      )}
    </>
  )
}
