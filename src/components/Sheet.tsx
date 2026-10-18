import { useEffect, useId, useRef, type JSX, type MouseEvent, type ReactNode } from 'react'
import { useBackToClose } from '../hooks/useBackToClose'
import { IconClose } from './Icons'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Popup in dezelfde vorm als de kaart-popup (desktop gecentreerd, mobiel van onderaf). Sluiten via ✕, Escape, terugknop of naast tikken. */
export function Sheet({ title, onClose, children }: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = (): void => ref.current?.close()
  useBackToClose(close)
  function onBackdrop(e: MouseEvent<HTMLDialogElement>): void {
    if (e.target === e.currentTarget) close()
  }

  return (
    <dialog ref={ref} className="card-sheet" onClose={onClose} onClick={onBackdrop} aria-labelledby={titleId}>
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id={titleId} tabIndex={-1} autoFocus>
            {title}
          </h2>
          <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
