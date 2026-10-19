// People & tiers (back office): everyone who asks, mentions or is chased — inside or outside the
// department — with the tier that sets their SLA and the weight of what they ask in Mizito.
// Tiers are a setting (mz.tiers); people can be added one by one or pasted from a spreadsheet.
import { useMemo, useState } from 'react'
import { ClipboardPaste, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useStore } from '../lib/store'
import { useEditor } from './Editor'
import { Avatar, Card, Empty, FilterSelect, SearchInput, Sheet, cx } from './ui'
import { L, locale } from '../lib/i18n'
import { fa, fmtDate } from '../lib/jalali'
import { uid } from '../lib/api'
import { MZ_KEYS, mzCfg, mzClosed, mzSignals, optLabel, tierById, type Tier } from '../lib/mizito'
import type { Contact } from '../lib/types'

function TiersCard({ admin }: { admin: boolean }) {
  const { setSetting, db } = useStore()
  const tiers = mzCfg().tiers
  const save = (next: Tier[]) => setSetting(MZ_KEYS.tiers, JSON.stringify(next))
  const edit = (i: number, p: Partial<Tier>) => save(tiers.map((t, k) => (k === i ? { ...t, ...p } : t)))
  const [name, setName] = useState('')
  const inp = 'h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-1.5 text-xs outline-none focus:border-line-strong disabled:opacity-70'
  return (
    <Card eyebrow={<span className="flex items-center gap-1.5"><Users size={12} /> {L('رده‌ها', 'Tiers')}</span>} title={L('رده‌ها، SLA و وزن اولویت', 'Tiers, SLA & priority weight')}>
      <p className="mb-3 text-xs leading-6 text-sub">
        {L('هر شخص یک رده دارد. SLA یعنی چند ساعت بعد از منشن باید پاسخ بدهیم؛ «وزن» یعنی درخواست این رده چقدر اولویت مورد میزیتو را بالا می‌برد. ترتیب از بالاترین رده به پایین‌ترین است.', 'Each person has a tier. SLA = hours to respond after a mention; weight = how much this tier lifts a Mizito item’s priority. Highest tier first.')}
      </p>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_3.25rem_2rem_1.75rem] gap-2 px-1 text-[0.625rem] text-sub">
          <span />
          <span>{L('نام رده', 'Tier')}</span>
          <span>{L('SLA (ساعت)', 'SLA (h)')}</span>
          <span>{L('وزن', 'Weight')}</span>
          <span>{L('افراد', 'People')}</span>
          <span />
        </div>
        {tiers.map((t, i) => (
          <div key={t.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_3.25rem_2rem_1.75rem] items-center gap-2 rounded-xl border border-line px-1 py-1">
            <input type="color" disabled={!admin} defaultValue={t.color} onBlur={(e) => e.target.value !== t.color && edit(i, { color: e.target.value })} className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={L('رنگ', 'Colour')} />
            <input key={L(t.fa, t.en)} disabled={!admin} defaultValue={L(t.fa, t.en)} className={inp} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== L(t.fa, t.en) && edit(i, locale.lang === 'en' ? { en: e.target.value.trim() } : { fa: e.target.value.trim() })} />
            <input key={`s${t.sla}`} type="number" min={1} disabled={!admin} defaultValue={t.sla} className={cx(inp, 'num text-center')} onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== t.sla && edit(i, { sla: Number(e.target.value) })} />
            <input key={`w${t.weight}`} type="number" min={0} disabled={!admin} defaultValue={t.weight} className={cx(inp, 'num text-center')} onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== t.weight && edit(i, { weight: Number(e.target.value) })} />
            <span className="text-center text-xs text-sub num">{fa(db.Contacts.filter((c) => c.tier === t.id).length)}</span>
            {admin && tiers.length > 1 ? (
              <button className="icon-btn h-7 w-7 hover:text-bad" onClick={() => save(tiers.filter((x) => x.id !== t.id))} aria-label={L('حذف', 'Remove')}>
                <Trash2 size={13} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      {admin && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && save([...tiers, { id: `t-${Date.now().toString(36)}`, fa: name.trim(), en: name.trim(), sla: 72, weight: 5, color: '#7a8a90' }]), setName(''))}>
          <input className="input h-9 flex-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('رده‌ی جدید، مثلاً «سازمان بیرونی»', 'New tier, e.g. “External org”')} />
          <button className="btn-outline btn-sm h-9" disabled={!name.trim()}>
            <Plus size={14} /> {L('افزودن', 'Add')}
          </button>
        </form>
      )}
    </Card>
  )
}

/** "name<TAB>title<TAB>org<TAB>tier<TAB>email<TAB>phone" per line — straight from a spreadsheet. */
function parsePeople(text: string, existing: Contact[]): { add: Contact[]; skip: string[] } {
  const tiers = mzCfg().tiers
  const tierFor = (v: string) => {
    const x = String(v || '').trim().toLowerCase()
    return tiers.find((t) => [t.id, t.fa, t.en].some((n) => n.toLowerCase() === x))?.id || ''
  }
  const names = new Set(existing.map((c) => c.name))
  const add: Contact[] = []
  const skip: string[] = []
  const batch = `B-${Date.now().toString(36)}`
  text
    .split(/\r?\n/)
    .map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, '').trim()))
    .filter((c) => c[0])
    .forEach(([name, title = '', org = '', tier = '', email = '', phone = '']) => {
      if (/^(name|نام)$/i.test(name)) return
      if (names.has(name)) return skip.push(name)
      names.add(name)
      const latin = /^[\x20-\x7e]+$/.test(name)
      add.push({ id: uid('CT'), name, name_en: latin ? name : '', title, org, tier: tierFor(tier), email, phone, notes: '', active: 'true', batch })
    })
  return { add, skip }
}

function PasteSheet({ onClose }: { onClose: () => void }) {
  const { db, bulk, toast } = useStore()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parsePeople(text, db.Contacts), [text, db.Contacts])
  const go = async () => {
    await bulk('Contacts', parsed.add)
    toast(L(`${fa(parsed.add.length)} نفر اضافه شد`, `${parsed.add.length} people added`))
    onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      header={<h2 className="font-semibold">{L('افزودن گروهی اشخاص', 'Add people in bulk')}</h2>}
      footer={
        <>
          <button className="btn-primary" disabled={!parsed.add.length} onClick={go}>
            {L(`افزودن ${fa(parsed.add.length)} نفر`, `Add ${parsed.add.length}`)}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            {L('انصراف', 'Cancel')}
          </button>
        </>
      }
    >
      <div className="space-y-3 p-5">
        <p className="text-sm leading-7 text-sub">
          {L('ستون‌ها را از اکسل یا گوگل‌شیت کپی کنید و اینجا بچسبانید. ترتیب ستون‌ها: نام، سمت، واحد یا سازمان، رده، ایمیل، تلفن. فقط نام اجباری است. رده را با نام فارسی یا انگلیسی‌اش بنویسید (مثلاً Executive یا معاون).', 'Copy the columns from Excel or Google Sheets and paste here: name, title, unit/org, tier, email, phone. Only the name is required. Write the tier by its name (e.g. Executive).')}
        </p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} dir="auto" className="input min-h-[14rem] w-full py-2 font-mono text-xs" placeholder={'Aliakbar Hekmatikia\tمدیرعامل\tنویان\tExecutive\nEhsan Ebrahimi\tمعاون\tنویان\tDeputy'} />
        <div className="text-xs text-sub">
          {L(`${fa(parsed.add.length)} نفر جدید`, `${parsed.add.length} new`)}
          {parsed.skip.length > 0 && L(` · ${fa(parsed.skip.length)} نفر از قبل هستند و رد می‌شوند`, ` · ${parsed.skip.length} already listed, skipped`)}
          {parsed.add.filter((c) => !c.tier).length > 0 && L(` · ${fa(parsed.add.filter((c) => !c.tier).length)} نفر بدون رده‌ی شناخته‌شده (پایین‌ترین رده حساب می‌شوند)`, ` · ${parsed.add.filter((c) => !c.tier).length} without a known tier (lowest tier)`)}
        </div>
      </div>
    </Sheet>
  )
}

/** A person's record: what they asked in Mizito, follow-ups with them, tasks they requested, how fast we answer. */
function ContactSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { db } = useStore()
  const { open } = useEditor()
  const c = db.Contacts.find((x) => x.name === name)
  const items = db.Mizito.filter((m) => m.asked_by === name || db.MizitoMentions.some((x) => x.item_id === m.id && x.by === name))
  const openItems = items.filter((m) => !mzClosed(m))
  const closedItems = items.filter((m) => mzClosed(m) && m.closed_at && m.received_at)
  const avg = closedItems.length ? closedItems.reduce((a, m) => a + Math.max(0, (new Date(m.closed_at.replace(' ', 'T')).getTime() - new Date(m.received_at.replace(' ', 'T')).getTime()) / 86400000), 0) / closedItems.length : null
  const fus = db.FollowUps.filter((f) => f.person === name && f.status !== 'done')
  const asked = db.Tasks.filter((t) => t.requested_by === name)
  const tier = tierById(c?.tier)
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <Avatar name={name} size="md" />
          <div>
            <h2 className="font-semibold">{name}</h2>
            <div className="text-xs text-sub">{[c?.title, c?.org].filter(Boolean).join(' · ')}</div>
          </div>
          {tier && <span className="ms-2 rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium text-white" style={{ background: tier.color }}>{optLabel(tier)} · SLA {fa(tier.sla)}{L('س', 'h')}</span>}
        </div>
      }
      footer={c ? <button className="btn-outline btn-sm" onClick={() => open('Contacts', c as never)}><Pencil size={14} /> {L('ویرایش', 'Edit')}</button> : undefined}
    >
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [L('موارد باز میزیتو', 'Open Mizito items'), fa(openItems.length)],
            [L('کل موارد', 'All items'), fa(items.length)],
            [L('پیگیری باز با او', 'Open follow-ups'), fa(fus.length)],
            [L('میانگین زمان بستن', 'Avg. time to close'), avg === null ? '—' : L(`${fa(avg.toFixed(1))} روز`, `${avg.toFixed(1)} d`)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-line p-3">
              <div className="text-[0.6875rem] text-sub">{l}</div>
              <div className="mt-1 text-xl font-semibold num">{v}</div>
            </div>
          ))}
        </div>
        <section>
          <div className="eyebrow mb-2">{L('موارد میزیتو', 'Mizito items')}</div>
          {items.length === 0 ? (
            <Empty text={L('موردی از این شخص ثبت نشده', 'Nothing from this person')} />
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {items.map((m) => {
                const s = mzSignals(db, m)
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="rounded-md px-1.5 font-mono text-[0.6875rem] font-semibold text-white" style={{ background: ['#c4314b', '#e8650a', '#2f6f9f', '#7a8a90'][s.p] }}>P{s.p}</span>
                    <span className={cx('min-w-0 flex-1 truncate', mzClosed(m) && 'text-sub line-through')}>{m.title}</span>
                    <span className="text-[0.6875rem] text-sub">{fmtDate(m.received_at || m.created_at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        {(fus.length > 0 || asked.length > 0) && (
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="eyebrow mb-2">{L('پیگیری‌های باز', 'Open follow-ups')}</div>
              <ul className="space-y-1 text-sm">{fus.map((f) => <li key={f.id} className="truncate">• {f.subject}</li>)}</ul>
            </div>
            <div>
              <div className="eyebrow mb-2">{L('تسک‌هایی که درخواست داده', 'Tasks they requested')}</div>
              <ul className="space-y-1 text-sm">{asked.map((t) => <li key={t.id} className="truncate">• {t.title}</li>)}</ul>
            </div>
          </section>
        )}
        {c?.notes && <p className="whitespace-pre-wrap rounded-2xl bg-muted p-3 text-sm leading-7">{c.notes}</p>}
      </div>
    </Sheet>
  )
}

export function PeopleRegistry({ admin }: { admin: boolean }) {
  const { db, upsert } = useStore()
  const { open } = useEditor()
  const [q, setQ] = useState('')
  const [tier, setTier] = useState('')
  const [paste, setPaste] = useState(false)
  const [show, setShow] = useState('')
  const tiers = mzCfg().tiers
  const list = db.Contacts.filter((c) => (!q || [c.name, c.name_en, c.title, c.org, c.email].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))) && (!tier || (tier === '-' ? !tierById(c.tier) : c.tier === tier))).sort((a, b) => {
    const wa = tierById(a.tier)?.weight ?? -1
    const wb = tierById(b.tier)?.weight ?? -1
    return wb - wa || a.name.localeCompare(b.name, 'fa')
  })
  const openBy = (name: string) => db.Mizito.filter((m) => !mzClosed(m) && m.asked_by === name).length
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <Card
        pad={false}
        eyebrow={<span className="flex items-center gap-1.5"><Users size={12} /> {L('اشخاص', 'People')}</span>}
        title={L(`${fa(db.Contacts.length)} نفر`, `${db.Contacts.length} people`)}
        action={
          admin && (
            <div className="flex gap-2">
              <button className="btn-outline btn-sm" onClick={() => setPaste(true)}>
                <ClipboardPaste size={14} /> {L('چسباندن از اکسل', 'Paste from a sheet')}
              </button>
              <button className="btn-primary btn-sm" onClick={() => open('Contacts')}>
                <Plus size={14} /> {L('شخص جدید', 'New person')}
              </button>
            </div>
          )
        }
      >
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          <SearchInput value={q} onChange={setQ} placeholder={L('جستجوی نام، سمت، سازمان…', 'Search name, title, org…')} />
          <FilterSelect value={tier} onChange={setTier} placeholder={L('همه‌ی رده‌ها', 'All tiers')} options={[...tiers.map((t) => ({ value: t.id, label: optLabel(t) })), { value: '-', label: L('بدون رده', 'No tier') }]} />
        </div>
        {list.length === 0 ? (
          <Empty text={db.Contacts.length ? L('کسی پیدا نشد', 'No match') : L('هنوز کسی تعریف نشده. یکی‌یکی اضافه کنید یا از اکسل بچسبانید.', 'No one yet. Add people or paste them from a sheet.')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">{L('نام', 'Name')}</th>
                  <th className="th">{L('سمت / سازمان', 'Title / org')}</th>
                  <th className="th">{L('رده', 'Tier')}</th>
                  <th className="th">{L('ایمیل', 'Email')}</th>
                  <th className="th">{L('موارد باز', 'Open')}</th>
                  <th className="th w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => (
                  <tr key={c.id} className={cx('cursor-pointer hover:bg-muted/40', String(c.active) === 'false' && 'opacity-50')} onClick={() => setShow(c.name)}>
                    <td className="td">
                      <span className="flex items-center gap-2">
                        <Avatar name={c.name} size="sm" />
                        <span>
                          <span className="font-medium">{c.name}</span>
                          {c.name_en && c.name_en !== c.name && <span className="block text-[0.6875rem] text-sub" dir="ltr">{c.name_en}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="td text-xs text-sub">{[c.title, c.org].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <select disabled={!admin} value={c.tier} onChange={(e) => upsert('Contacts', { ...c, tier: e.target.value })} className="h-8 rounded-full border border-line bg-surface px-2 text-xs" style={{ color: tierById(c.tier)?.color }}>
                        <option value="">{L('بدون رده', 'No tier')}</option>
                        {tiers.map((t) => <option key={t.id} value={t.id}>{optLabel(t)}</option>)}
                      </select>
                    </td>
                    <td className="td text-xs text-sub" dir="ltr">{c.email || '—'}</td>
                    <td className="td num">{openBy(c.name) ? <b>{fa(openBy(c.name))}</b> : <span className="text-sub">۰</span>}</td>
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      {admin && (
                        <button className="icon-btn h-8 w-8" onClick={() => open('Contacts', c as never)} aria-label={L('ویرایش', 'Edit')}>
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <TiersCard admin={admin} />
      {paste && <PasteSheet onClose={() => setPaste(false)} />}
      {show && <ContactSheet name={show} onClose={() => setShow('')} />}
    </div>
  )
}
