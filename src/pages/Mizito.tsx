// Mizito queue: what the CPTO and the PgM were mentioned on, one row per Mizito task, sorted by
// priority (P0 first, then SLA, then deadline). Re-mentions thread into the same row.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AtSign, Copy, Plus, Rows3, Settings2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Band, Card, Empty, FilterSelect, Overlap, SearchInput, Segmented, Sheet, cx } from '../components/ui'
import { L } from '../lib/i18n'
import { fa, fmtDate } from '../lib/jalali'
import { MZ_VIEWS, inMzView, mzCfg, mzSignals, optLabel, statusById, tierById, type MzView } from '../lib/mizito'
import { CaptureSheet, MizitoSettings, MizitoSheet, MzLink, MzSignals, MzStatusChip, PBadge, useReminder } from '../components/MizitoParts'
import type { MizitoItem } from '../lib/types'

const VIEW_LABEL: Record<MzView, [string, string]> = {
  queue: ['صف باز', 'Open queue'], p0: ['P0', 'P0'], exec: ['درخواست مدیران ارشد', 'Exec asks'], breached: ['عبور از SLA', 'SLA breached'],
  waiting: ['منتظر / مسدود', 'Waiting / blocked'], stale: ['راکد', 'Quiet'], mine_cpto: ['', ''], mine_pgm: ['', ''], closed: ['بسته‌شده', 'Closed'], all: ['همه', 'All'],
}
type Group = '' | 'asker' | 'category' | 'p' | 'status' | 'assigned'

export default function MizitoPage() {
  const { db, canEdit, access, me } = useStore()
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
  const [capture, setCapture] = useState(false)
  const [settings, setSettings] = useState(false)
  const openId = get('id')
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
      return x.p - y.p || (x.slaLeft ?? 1e9) - (y.slaLeft ?? 1e9) || (x.toDue ?? 1e9) - (y.toDue ?? 1e9) || y.score - x.score || (a.last_mention_at < b.last_mention_at ? 1 : -1)
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
  return (
    <>
      <Band
        eyebrow={<span className="inline-flex items-center gap-1.5"><AtSign size={12} /> {c.base.replace(/^https?:\/\//, '')}</span>}
        title={L('میزیتو', 'Mizito')}
        sub={L(`${fa(open.length)} مورد باز · ${fa(counts.p0)} P0 · ${fa(counts.breached)} عبور از SLA · ${fa(counts.exec)} درخواست مدیران ارشد`, `${open.length} open · ${counts.p0} P0 · ${counts.breached} SLA breached · ${counts.exec} exec asks`)}
        actions={
          <>
            {access === 'super' && (
              <button className="btn h-10 w-10 bg-white/10 px-0 text-white hover:bg-white/20" onClick={() => setSettings(true)} title={L('تنظیمات میزیتو', 'Mizito settings')} aria-label={L('تنظیمات میزیتو', 'Mizito settings')}>
                <Settings2 size={17} />
              </button>
            )}
            {canEdit && (
              <button className="btn h-10 bg-white text-band" onClick={() => setCapture(true)}>
                <Plus size={16} /> {L('ثبت منشن', 'Log a mention')}
              </button>
            )}
          </>
        }
      />
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
                      <div key={m.id} onClick={() => set('id', m.id)} className={cx('group flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-muted/40', s.p === 0 && 'bg-bad/[0.03]')}>
                        <PBadge p={s.p} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{m.title}</span>
                            <MzStatusChip id={m.status} />
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
                            <span>· {fmtDate(m.received_at || m.created_at)}</span>
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
      {capture && <CaptureSheet onClose={() => setCapture(false)} onOpen={(id) => set('id', id)} />}
      {openId && <MizitoSheet id={openId} onClose={() => set('id', '')} />}
      {settings && (
        <Sheet open wide onClose={() => setSettings(false)} header={<h2 className="font-semibold">{L('تنظیمات میزیتو', 'Mizito settings')}</h2>}>
          <div className="p-4"><MizitoSettings admin={access === 'super'} /></div>
        </Sheet>
      )}
    </>
  )
}
