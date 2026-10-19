import { Send } from 'lucide-react'
import { Band, Overlap } from '../components/ui'
import { TelegramImport } from '../components/TelegramImport'
import { L } from '../lib/i18n'

/** Telegram → project status: upload the groups' export and Atlas proposes each project's week. */
export default function TelegramPage() {
  return (
    <>
      <Band
        eyebrow={<span className="flex items-center gap-1.5"><Send size={12} className="rtl:-scale-x-100" /> Telegram</span>}
        title={L('به‌روزرسانی از تلگرام', 'Update from Telegram')}
        sub={L('خروجی گروه‌های تلگرام را بیاورید؛ اطلس وضعیت هفته‌ی هر پروژه را از گفت‌وگوها پیشنهاد می‌دهد و با یک کلیک ثبت می‌کند.', 'Bring the groups’ Telegram export; Atlas proposes each project’s week from the chat and saves it in one click.')}
      />
      <Overlap>
        <TelegramImport />
      </Overlap>
    </>
  )
}
