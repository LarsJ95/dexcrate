import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { IconClose } from './Icons'

interface Props {
  /** Toegankelijke naam, bv. de kaartnaam. */
  label: string
  /** De vergrote afbeelding (meestal <CardImage quality="high" />). */
  children: ReactNode
  onClose: () => void
}

/** Schermvullende weergave van één kaart om hem goed te bekijken. Tik, ✕ of Escape sluit. */
export function CardZoom({ label, children, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={ref} className="card-zoom" aria-label={label} onClose={onClose} onClick={() => ref.current?.close()}>
      <div className="card-zoom-image">{children}</div>
      <button type="button" className="card-zoom-close icon-btn" aria-label="Close" autoFocus>
        <IconClose />
      </button>
    </dialog>
  )
}
