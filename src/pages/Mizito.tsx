// Mizito queue: what the CPTO and the PgM were mentioned on, one row per Mizito task, sorted by
// priority (P0 first, then SLA, then deadline). Re-mentions thread into the same row.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AtSign, Copy, Plus, Rows3, Settings2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, FilterSelect, Overlap, SearchInput, Segmented, Sheet, StatStrip, cx } from '../components/ui'
import { L } from '../lib/i18n'
import { fa, fmtDate } from '../lib/jalali'
import { MZ_VIEWS, inMzView, isMizitoLink, mzCat, mzCfg, mzSignals, optLabel, statusById, tierById, type MzView } from '../lib/mizito'
import { daysFromToday } from '../lib/jalali'
import { CaptureSheet, MizitoSettings, MizitoSheet, MzLink, MzSignals, MzStatusChip, PBadge, useReminder } from '../components/MizitoParts'
import type { MizitoItem } from '../lib/types'

const VIEW_LABEL: Record<MzView, [string, string]> = {
  queue: ['صف باز', 'Open queue'], p0: ['P0', 'P0'], exec: ['درخواست مدیران ارشد', 'Exec asks'], breached: ['عبور از SLA', 'SLA breached'],
  waiting: ['منتظر / مسدود', 'Waiting / blocked'], stale: ['راکد', 'Quiet'], mine_cpto: ['', ''], mine_pgm: ['', ''], closed: ['بسته‌شده', 'Closed'], all: ['همه', 'All'],
}
type Group = '' | 'asker' | 'category' | 'p' | 'status' | 'assigned'

export default function MizitoPage() {
  const { db, canEdit, access, me, upsert, toast } = useStore()
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
  const base = db.Mizito.filter((m) => (!who || m.mentioned.split(',').map((x) => x.trim()).includes(who)) && (!cat || m.category === cat) && (!q || [m.title, m.description, m.asked_by, m.assigned_to, m.outcome].some((v) => String(v || '').includes(q))))
  const counts = Object.fromEntries(MZ_VIEWS.map((v) => [v, base.filter((m) => inMzView(db, m, v, sig.get(m.id))).length])) as Record<MzView, number>
  const list = base
    .filter((m) => inMzView(db, m, view, sig.get(m.id)))
    .sort((a, b) => {
      const x = sig.get(a.id)!
      const y = sig.get(b.id)!
      const last = (m: MizitoItem) => m.last_mention_at || m.received_at || m.created_at || ''
      if (sort === 'recent') return last(a) < last(b) ? 1 : -1
      if (sort === 'old') return (a.received_at || a.created_at) < (b.received_at || b.created_at) ? -1 : 1
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
  const togglePick = (id: string) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  return (
    <>
      <Band
        eyebrow={<span className="inline-flex items-center gap-1.5"><AtSign size={12} /> {c.base.replace(/^https?:\/\//, '')}</span>}
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
            value={sort === 'p' ? '' : sort}
            onChange={(v) => set('s', v)}
            placeholder={L('مرتب: اولویت و SLA', 'Sort: priority & SLA')}
            options={[
              { value: 'recent', label: L('مرتب: آخرین منشن', 'Sort: latest mention') },
              { value: 'old', label: L('مرتب: قدیمی‌ترین', 'Sort: oldest first') },
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
            <button className="btn-ghost btn-sm ms-auto" onClick={() => setPicked(new Set())}>{L('لغو انتخاب', 'Clear')}</button>
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
                            {m.category && <span>· {optLabel(c.categories.find((x) => x.id === m.category))}</span>}
                            {m.action && <span>· {optLabel(c.actions.find((x) => x.id === m.action))}</span>}
                            <span>· {L('منشن', 'mentioned')} {fmtDate(m.received_at || m.created_at)}</span>
                            {s.mentions > 1 && <span>· {L(`${fa(s.mentions)} بار منشن`, `${s.mentions} mentions`)}</span>}
                            {m.assigned_to && <span>· {L('سپرده به', 'with')} {m.assigned_to}</span>}
                          </div>
                          <div className="mt-1.5"><MzSignals m={m} compact /></div>
                          {m.outcome && <div className="mt-1 truncate text-xs text-sub">↳ {m.outcome}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
