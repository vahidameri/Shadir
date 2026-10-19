import { useRef, useState } from 'react'
import { Paperclip, FileText, FileSpreadsheet, FileImage, File as FileIcon, Trash2, Loader, Camera, ExternalLink } from 'lucide-react'
import type { FileRef, Member } from '../lib/types'
import { useStore } from '../lib/store'
import { L } from '../lib/i18n'
import { fa, fmtDayMonth } from '../lib/jalali'
import { Avatar, cx } from './ui'

const iconFor = (mime: string) => (mime.startsWith('image/') ? FileImage : /sheet|excel|csv/.test(mime) ? FileSpreadsheet : /pdf|word|document|text/.test(mime) ? FileText : FileIcon)
const size = (n: number) => (n >= 1024 * 1024 ? `${fa((n / 1024 / 1024).toFixed(1))} MB` : `${fa(Math.max(1, Math.round(n / 1024)))} KB`)

/** File list + upload for any entity (meeting, project, task…). Files go to the shared Drive folder. */
export function Attachments({ entity, id, compact }: { entity: FileRef['entity']; id: string; compact?: boolean }) {
  const { db, canEdit, upload, remove, toast } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const files = db.Files.filter((f) => f.entity === entity && f.entity_id === id)
  const [drag, setDrag] = useState(false)

  const send = async (list: FileList | null) => {
    if (!list?.length) return
    const arr = Array.from(list)
    setBusy(arr.length)
    for (const f of arr) {
      try {
        await upload(entity, id, f)
      } catch {}
      setBusy((n) => n - 1)
    }
    toast(L(`${fa(arr.length)} فایل آپلود شد`, `${arr.length} file(s) uploaded`))
  }

  return (
    <div
      onDragOver={(e) => (e.preventDefault(), canEdit && setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        canEdit && send(e.dataTransfer.files)
      }}
      className={cx('rounded-2xl transition', drag && 'bg-brand/5 ring-2 ring-brand/30')}
    >
      {files.length > 0 && (
        <ul className={cx('space-y-1', compact ? 'mb-2' : 'mb-3')}>
          {files.map((f) => {
            const I = iconFor(f.mime)
            return (
              <li key={f.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-muted">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-sub">
                  <I size={15} />
                </span>
                <a href={f.url || undefined} target="_blank" rel="noreferrer" className={cx('min-w-0 flex-1', f.url && 'hover:underline')} onClick={(e) => !f.url && (e.preventDefault(), toast(L('پیش‌نمایش این فایل نمونه در دسترس نیست', 'Preview not available for this sample file')))}>
                  <span className="block truncate text-[0.8125rem]" dir="auto">
                    {f.name}
                  </span>
                  <span className="block text-[0.6875rem] text-sub">
                    {size(Number(f.size) || 0)} · {f.uploaded_by} · {fmtDayMonth(f.created_at)}
                  </span>
                </a>
                {f.url && <ExternalLink size={13} className="text-sub opacity-0 group-hover:opacity-100" />}
                {canEdit && (
                  <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100" title={L('حذف', 'Remove')} onClick={() => remove('Files', f.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => (send(e.target.files), (e.target.value = ''))} />
          <button onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-xs text-sub transition hover:border-ink/30 hover:text-ink">
            {busy ? <Loader size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {busy ? L('در حال آپلود…', 'Uploading…') : L('افزودن فایل', 'Attach files')}
          </button>
        </>
      )}
      {!canEdit && !files.length && <p className="text-xs text-sub">{L('فایلی پیوست نشده', 'No files')}</p>}
    </div>
  )
}

/** Downscale a photo before upload so avatars stay light (and fit in the demo's storage). */
async function resizeImage(file: File, max = 320): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const s = Math.min(1, max / Math.max(img.width, img.height))
    const side = Math.min(img.width, img.height)
    const c = document.createElement('canvas')
    c.width = c.height = Math.round(side * s)
    // centre-crop to a square
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.86))
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Big avatar with a camera button to upload a profile photo. */
export function PhotoUpload({ member, editable }: { member: Member; editable: boolean }) {
  const { upload, upsert, toast } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast(L('یک فایل تصویر انتخاب کنید', 'Choose an image file'), 'err')
    setBusy(true)
    try {
      const small = await resizeImage(f)
      const row = await upload('Team', member.id, small)
      await upsert('Team', { ...member, photo: row.url })
      toast(L('عکس پروفایل به‌روز شد', 'Profile photo updated'))
    } catch {
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="relative inline-block">
      <Avatar name={member.name} size="xl" ring />
      {editable && (
        <>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
          <button onClick={() => input.current?.click()} className="absolute -bottom-1 end-0 grid h-9 w-9 place-items-center rounded-full bg-white text-band shadow-pop transition hover:scale-105" title={L('تغییر عکس', 'Change photo')}>
            {busy ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
          </button>
        </>
      )}
    </div>
  )
}
