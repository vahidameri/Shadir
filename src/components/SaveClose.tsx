import { Check } from 'lucide-react'
import { useStore } from '../lib/store'
import { L } from '../lib/i18n'

/** Panels save each field as it changes; this commits the field still being typed in, confirms, and closes. */
export function SaveClose({ onClose }: { onClose: () => void }) {
  const { toast } = useStore()
  return (
    <button
      className="btn-primary btn-sm order-last"
      onClick={() => {
        ;(document.activeElement as HTMLElement | null)?.blur()
        setTimeout(() => {
          toast(L('ذخیره شد', 'Saved'))
          onClose()
        }, 80)
      }}
    >
      <Check size={14} /> {L('ذخیره', 'Save')}
    </button>
  )
}
