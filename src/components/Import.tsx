// Back office → Import: bring tasks, follow-ups, Mizito mentions, people or an old log in from the
// sheets used before Madar. Source: a Google Sheet link, pasted cells or a CSV file. Columns and values
// are guessed and can be corrected; duplicates are skipped; Mizito rows of the same task become one
// item with a thread. Every import is a batch that can be taken back.
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardPaste, FileUp, Link2, RotateCcw, Sheet as SheetIcon, Upload } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, Empty, Segmented, cx } from './ui'
import { L, tr } from '../lib/i18n'
import { fa } from '../lib/jalali'
import { TARGETS, build, cellText, detectHeader, distinctValues, enumOptions, guessColumns, guessValue, parseText, type Plan, type Target } from '../lib/importer'

type Source = 'sheet' | 'paste' | 'file'
const MAP_KEY = (t: Target) => `import.map.${t}`

export function ImportPage() {
  const { db, mode, me, action, bulk, undoBatch, setting, setSetting, toast, access } = useStore()
  const [target, setTarget] = useState<Target>('Tasks')
  const [source, setSource] = useState<Source>(mode === 'live' ? 'sheet' : 'paste')
  const [url, setUrl] = useState('')
  const [tabs, setTabs] = useState<string[]>([])
  const [tab, setTab] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [header, setHeader] = useState(0)
  const [cols, setCols] = useState<Record<string, number>>({})
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [addPeople, setAddPeople] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const headers = rows[header] || []
  const fields = TARGETS[target].fields
  // apply a saved mapping (by header names) or guess
  useEffect(() => {
    if (!rows.length) return
    const h = detectHeader(rows, target)
    setHeader(h)
  }, [rows, target])
  useEffect(() => {
    if (!headers.length) return
    let saved: { cols?: Record<string, string>; values?: Record<string, Record<string, string>>; addPeople?: boolean } = {}
    try {
      saved = JSON.parse(setting(MAP_KEY(target)) || '{}')
    } catch {}
    const guess = guessColumns(headers, target)
    const fromSaved: Record<string, number> = {}
    for (const [k, name] of Object.entries(saved.cols || {})) {
      const i = headers.findIndex((x) => cellText(x) === name)
      if (i >= 0) fromSaved[k] = i
    }
    setCols({ ...guess, ...fromSaved })
    setValues(saved.values || {})
    if (saved.addPeople !== undefined) setAddPeople(saved.addPeople)
  }, [header, rows, target]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan: Plan = { target, rows, header, cols, values, addPeople, me }
  const built = useMemo(() => (rows.length && cols[fields.find((f) => f.required)!.key] !== undefined ? build(db, plan) : null), [db, rows, header, cols, values, addPeople, target, me]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSheet = async (t = tab) => {
    if (!url.trim()) return
    setBusy(true)
    try {
      const res = (await action('readSheet', { url: url.trim(), tab: t })) as { tabs: string[]; title: string; rows: string[][] } | undefined
      if (!res) {
        toast(L('خواندن از گوگل‌شیت فقط در نسخه‌ی نصب‌شده کار می‌کند؛ در نسخه‌ی نمایشی از «چسباندن» استفاده کنید.', 'Reading a Google Sheet works in the installed app only; use paste in the demo.'), 'err')
        return
      }
      setTabs(res.tabs)
      setTitle(res.title)
      if (t) setRows(res.rows)
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const readFile = (f?: File) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => setRows(parseText(String(r.result || '')))
    r.readAsText(f, 'utf-8')
  }

  const run = async () => {
    if (!built) return
    setBusy(true)
    try {
      // people first, so the rows that name them find them
      await bulk('Contacts', built.Contacts)
      await bulk('Team', built.Team)
      if (built.Tasks.length) await bulk('Tasks', built.Tasks)
      if (built.FollowUps.length) await bulk('FollowUps', built.FollowUps)
      if (built.Mizito.length) await bulk('Mizito', built.Mizito)
      if (built.MizitoMentions.length) await bulk('MizitoMentions', built.MizitoMentions)
      if (built.History.length) await bulk('History', built.History)
      if (built.Comments.length) await bulk('Comments', built.Comments)
      // remember the mapping by header names for the next import of the same sheet
      const byName = Object.fromEntries(Object.entries(cols).filter(([, i]) => i >= 0).map(([k, i]) => [k, cellText(headers[i])]))
      await setSetting(MAP_KEY(target), JSON.stringify({ cols: byName, values, addPeople }))
      const n = built.Tasks.length + built.FollowUps.length + built.Mizito.length + built.Contacts.length + built.History.length + built.Comments.length
      setDone(L(`${fa(n)} ردیف ایمپورت شد${built.MizitoMentions.length ? ` و ${fa(built.MizitoMentions.length)} منشن به ترد موردها اضافه شد` : ''}.`, `${n} rows imported${built.MizitoMentions.length ? `, ${built.MizitoMentions.length} mentions threaded` : ''}.`))
      setRows([])
      setText('')
      toast(L('ایمپورت انجام شد', 'Import done'))
    } catch {
      /* the store shows the error */
    } finally {
      setBusy(false)
    }
  }

  // earlier imports, from the batch column
  const batches = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    const add = (k: string, b?: string) => b && m.set(b, { ...(m.get(b) || {}), [k]: (m.get(b)?.[k] || 0) + 1 })
    db.Tasks.forEach((x) => add('Tasks', x.batch))
    db.FollowUps.forEach((x) => add('FollowUps', x.batch))
    db.Mizito.forEach((x) => add('Mizito', x.batch))
    db.MizitoMentions.forEach((x) => add('MizitoMentions', x.batch))
    db.Contacts.forEach((x) => add('Contacts', x.batch))
    db.Team.forEach((x) => add('Team', x.batch))
    db.History.forEach((x) => add('History', x.batch))
    db.Comments.forEach((x) => add('Comments', x.batch))
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [db])
  const NAMES: Record<string, [string, string]> = { Tasks: ['تسک', 'tasks'], FollowUps: ['پیگیری', 'follow-ups'], Mizito: ['میزیتو', 'Mizito'], MizitoMentions: ['منشن', 'mentions'], Contacts: ['شخص', 'people'], Team: ['عضو دپارتمان', 'members'], History: ['لاگ', 'log lines'], Comments: ['یادداشت', 'notes'] }

  if (access !== 'super') return <Empty text={L('ایمپورت فقط برای مدیر برنامه است', 'Import is for the program manager')} />
  const enumFields = fields.filter((f) => f.kind === 'enum' && cols[f.key] !== undefined && cols[f.key] >= 0)

  return (
    <div className="space-y-4">
      <Card eyebrow={<span className="flex items-center gap-1.5"><Upload size={12} /> {L('ایمپورت', 'Import')}</span>} title={L('۱. چه چیزی را ایمپورت می‌کنید؟', '1. What are you importing?')}>
        <div className="grid gap-2 @md:grid-cols-3 @xl:grid-cols-5">
          {(Object.keys(TARGETS) as Target[]).map((t) => (
            <button key={t} onClick={() => (setTarget(t), setDone(''))} className={cx('rounded-2xl border p-3 text-start text-sm transition', target === t ? 'border-ink bg-ink text-surface' : 'border-line hover:border-line-strong')}>
              <div className="font-medium">{L(TARGETS[t].fa, TARGETS[t].en)}</div>
              <div className={cx('mt-1 text-[0.6875rem]', target === t ? 'opacity-70' : 'text-sub')}>
                {t === 'Mizito' ? L('ردیف‌های یک تسک یکی می‌شوند و بقیه منشن می‌شوند', 'Rows of one task merge into a thread') : t === 'Log' ? L('بعد از تسک‌ها و پیگیری‌ها؛ با شناسه‌ی قدیمی وصل می‌شود', 'After tasks & follow-ups; joined by old ID') : t === 'Contacts' ? L('نام، رده، سمت، ایمیل', 'Name, tier, title, email') : L('تکراری‌ها رد می‌شوند', 'Duplicates are skipped')}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card title={L('۲. از کجا؟', '2. From where?')}>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: 'sheet', label: L('لینک گوگل‌شیت', 'Google Sheet link') },
            { value: 'paste', label: L('چسباندن سلول‌ها', 'Paste cells') },
            { value: 'file', label: L('فایل CSV', 'CSV file') },
          ]}
        />
        <div className="mt-4">
          {source === 'sheet' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-line px-3">
                  <Link2 size={14} className="text-sub" />
                  <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="h-10 w-full bg-transparent text-xs outline-none" />
                </label>
                <button className="btn-outline btn-sm h-10" disabled={!url.trim() || busy} onClick={() => loadSheet('')}>
                  <SheetIcon size={14} /> {L('خواندن تب‌ها', 'Read tabs')}
                </button>
              </div>
              {tabs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-sub">{title} ·</span>
                  {tabs.map((t) => (
                    <button key={t} onClick={() => (setTab(t), loadSheet(t))} className={cx('h-8 rounded-full border px-3 text-xs', tab === t ? 'border-ink bg-ink text-surface' : 'border-line')}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[0.6875rem] leading-5 text-sub">{L('حساب گوگلی که مدار را نصب کرده باید به این شیت دسترسی داشته باشد. لینک‌های داخل سلول‌ها (مثل «Link» به میزیتو) هم خوانده می‌شوند.', 'The Google account that installed Madar must have access to the sheet. Links inside cells (like “Link” to Mizito) are read too.')}</p>
            </div>
          )}
          {source === 'paste' && (
            <div className="space-y-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="auto" className="input w-full py-2 font-mono text-xs" placeholder={L('در شیت قدیمی، محدوده را (با ردیف عنوان ستون‌ها) انتخاب کنید، Ctrl+C و اینجا Ctrl+V', 'Select the range in the old sheet (with the header row), copy and paste here')} />
              <button className="btn-outline btn-sm" disabled={!text.trim()} onClick={() => setRows(parseText(text))}>
                <ClipboardPaste size={14} /> {L('خواندن', 'Read')}
              </button>
              <p className="text-[0.6875rem] text-sub">{L('توجه: با چسباندن، لینک‌های پشت متن (مثل «Link») منتقل نمی‌شوند؛ برای لینک‌ها از «لینک گوگل‌شیت» استفاده کنید.', 'Note: pasting drops links hidden behind text; use the Google Sheet link for those.')}</p>
            </div>
          )}
          {source === 'file' && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-6 text-sm text-sub hover:text-ink">
              <FileUp size={16} /> {L('انتخاب فایل CSV (از گوگل‌شیت: File ← Download ← CSV)', 'Choose a CSV (Google Sheets: File → Download → CSV)')}
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card
          title={L('۳. ستون‌ها', '3. Columns')}
          action={
            <label className="flex items-center gap-2 text-xs text-sub">
              {L('ردیف عنوان ستون‌ها', 'Header row')}
              <input type="number" min={1} max={rows.length} value={header + 1} onChange={(e) => setHeader(Math.max(0, Math.min(rows.length - 1, Number(e.target.value) - 1)))} className="input h-8 w-16 text-center text-xs" />
            </label>
          }
        >
          <p className="mb-3 text-xs text-sub">{L(`${fa(rows.length - header - 1)} ردیف داده پیدا شد. هر فیلد مدار را به ستون درست وصل کنید؛ حدس اولیه زده شده.`, `${rows.length - header - 1} data rows. Point each Madar field at the right column; a first guess is filled in.`)}</p>
          <div className="grid gap-2 @lg:grid-cols-2">
            {fields.map((f) => {
              const i = cols[f.key]
              const sample = i !== undefined && i >= 0 ? rows.slice(header + 1).map((r) => cellText(r[i] || '')).find(Boolean) : ''
              return (
                <div key={f.key} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="w-40 shrink-0 text-sm">
                    {L(f.fa, f.en)}
                    {f.required && <span className="text-bad"> *</span>}
                  </span>
                  <select value={i ?? -1} onChange={(e) => setCols((c) => ({ ...c, [f.key]: Number(e.target.value) }))} className="input h-8 min-w-0 flex-1 text-xs">
                    <option value={-1}>{L('— وارد نشود —', '— skip —')}</option>
                    {headers.map((h, k) => (
                      <option key={k} value={k}>
                        {cellText(h) || L(`ستون ${fa(k + 1)}`, `Column ${k + 1}`)}
                      </option>
                    ))}
                  </select>
                  {sample && <span className="hidden max-w-[9rem] truncate text-[0.6875rem] text-sub lg:inline" title={sample}>{sample}</span>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {rows.length > 0 && enumFields.length > 0 && (
        <Card title={L('۴. مقدارها', '4. Values')}>
          <p className="mb-3 text-xs text-sub">{L('هر مقدار شیت قدیمی معادل کدام مقدار مدار است؟', 'What does each old value mean in Madar?')}</p>
          <div className="grid gap-4 @lg:grid-cols-2">
            {enumFields.map((f) => {
              const opts = enumOptions(target, f.key)
              return (
                <div key={f.key}>
                  <div className="mb-1.5 text-sm font-medium">{L(f.fa, f.en)}</div>
                  <div className="space-y-1">
                    {distinctValues(plan, f.key).map((v) => {
                      const cur = values[f.key]?.[v] ?? guessValue(target, f.key, v)
                      return (
                        <div key={v} className="flex items-center gap-2 text-xs">
                          <span className="w-36 shrink-0 truncate rounded-lg bg-muted px-2 py-1.5" title={v}>{v}</span>
                          <span className="text-sub">←</span>
                          <select value={cur} onChange={(e) => setValues((x) => ({ ...x, [f.key]: { ...(x[f.key] || {}), [v]: e.target.value } }))} className={cx('input h-8 flex-1 text-xs', !cur && 'text-sub')}>
                            <option value="">{L('— خالی —', '— empty —')}</option>
                            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {built && (
        <Card title={L('۵. پیش‌نمایش و ایمپورت', '5. Preview & import')}>
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
            {[
              [L('ردیف جدید', 'New rows'), built.Tasks.length + built.FollowUps.length + built.Mizito.length + (target === 'Contacts' ? built.Contacts.length : 0) + built.History.length + built.Comments.length],
              ...(target === 'Mizito' ? [[L('منشن در ترد', 'Threaded mentions'), built.MizitoMentions.length]] : []),
              [L('تکراری (رد می‌شود)', 'Duplicates (skipped)'), built.dupes],
              [target === 'Log' ? L('بدون تسک متناظر', 'No matching task') : L('بدون عنوان (رد می‌شود)', 'No title (skipped)'), built.empty],
            ].map(([l, v]) => (
              <div key={String(l)} className="rounded-2xl border border-line p-3">
                <div className="text-[0.6875rem] text-sub">{l}</div>
                <div className="mt-1 text-xl font-semibold num">{fa(Number(v))}</div>
              </div>
            ))}
          </div>
          {built.unknownPeople.length > 0 && (
            <div className="mt-4 rounded-2xl bg-muted/60 p-3 text-xs leading-6">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={addPeople} onChange={(e) => setAddPeople(e.target.checked)} />
                {L(`${fa(built.unknownPeople.length)} نفر هنوز تعریف نشده‌اند؛ اضافه شوند (مسئول‌ها به دپارتمان، بقیه به «اشخاص»)`, `${built.unknownPeople.length} people aren’t defined yet; add them (assignees to the department, others to People)`)}
              </label>
              <div className="mt-1 text-sub">{built.unknownPeople.join('، ')}</div>
              <div className="mt-1 text-sub">{L('رده‌ی اشخاص جدید را بعداً از «اشخاص و رده‌ها» تعیین کنید.', 'Set their tiers later in People & tiers.')}</div>
            </div>
          )}
          {target === 'Mizito' && built.Mizito.length > 0 && (
            <div className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-line text-xs">
              {built.Mizito.slice(0, 40).map((m) => {
                const n = built.MizitoMentions.filter((x) => x.item_id === m.id).length
                return (
                  <div key={m.id} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-0">
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="text-sub">{m.asked_by}</span>
                    {n > 0 && <span className="rounded-full bg-brand/10 px-2 text-brand">+{fa(n)} {L('منشن', 'mentions')}</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" disabled={busy} onClick={run}>
              <Upload size={15} /> {busy ? L('در حال ایمپورت…', 'Importing…') : L('ایمپورت', 'Import')}
            </button>
            <span className="text-xs text-sub">{L('هر ایمپورت را می‌شود پایین همین صفحه برگرداند.', 'Every import can be undone below.')}</span>
          </div>
        </Card>
      )}
      {done && (
        <div className="flex items-center gap-2 rounded-2xl bg-good/10 px-4 py-3 text-sm text-good">
          <CheckCircle2 size={16} /> {done}
        </div>
      )}

      <Card title={L('ایمپورت‌های قبلی', 'Earlier imports')}>
        {batches.length === 0 ? (
          <Empty text={L('هنوز ایمپورتی انجام نشده', 'No imports yet')} />
        ) : (
          <ul className="divide-y divide-line">
            {batches.map(([b, counts]) => (
              <li key={b} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-sub">{new Date(parseInt(b.slice(2), 36)).toLocaleString(L('fa-IR', 'en-GB'))}</span>
                <span className="flex-1 text-xs">{Object.entries(counts).map(([k, n]) => L(`${fa(n)} ${NAMES[k][0]}`, `${n} ${NAMES[k][1]}`)).join(' · ')}</span>
                <button
                  className="btn-ghost btn-sm text-bad"
                  onClick={async () => {
                    if (!window.confirm(L('همه‌ی ردیف‌های این ایمپورت حذف شوند؟', 'Remove every row of this import?'))) return
                    const n = await undoBatch(b)
                    toast(L(`${fa(n)} ردیف برگردانده شد`, `${n} rows removed`))
                  }}
                >
                  <RotateCcw size={14} /> {L('برگرداندن', 'Undo')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="px-1 text-[0.6875rem] text-sub">{tr(['ترتیب پیشنهادی: اشخاص ← تسک‌ها ← پیگیری‌ها ← میزیتو ← لاگ قدیمی.', 'Suggested order: people → tasks → follow-ups → Mizito → old log.'])}</p>
    </div>
  )
}
