import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { useBackToClose } from '../hooks/useBackToClose'
import { EMPTY_CARD, type Card, type CardInput, type CardStatus } from '../lib/types'
import { CardDetail } from './CardDetail'
import { CardForm } from './CardForm'
import { IconClose } from './Icons'

interface Props {
  card: Card | null
  /** Vooraf ingevulde velden voor een nieuwe kaart (bv. uit een scan). */
  initial?: Partial<CardInput>
  defaultStatus: CardStatus
  nextSortOrder: number
  onClose: () => void
  /** Gewijzigde en/of nieuwe regels (meer dan één bij splitsen). */
  onSaved: (rows: Card[]) => void
  onDeleted: (id: string) => void
  /** Kaart bijgewerkt terwijl de popup open blijft (bv. foto toegevoegd). */
  onChanged?: (row: Card) => void
  /** Verkoop vastgelegd (regels kunnen gesplitst zijn): collectie opnieuw laden. Zonder: popup sluit. */
  onSold?: () => void
  /** Bestaande kaart meteen in het formulier openen (bv. "Edit" bij een exemplaar op de setpagina); Cancel sluit dan. */
  startInEdit?: boolean
}

type Mode = { kind: 'view' } | { kind: 'edit'; status: CardStatus }

/**
 * Popup voor één kaart: bestaande kaarten openen in de weergave, nieuwe direct in het formulier.
 * Sluiten via ✕, Escape, terugknop of tikken naast de popup.
 */
export function CardDialog({
  card,
  initial,
  defaultStatus,
  nextSortOrder,
  onClose,
  onSaved,
  onDeleted,
  onChanged,
  onSold,
  startInEdit = false,
}: Props): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<Mode>(() =>
    card && !startInEdit ? { kind: 'view' } : { kind: 'edit', status: card?.status ?? initial?.status ?? defaultStatus },
  )

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = (): void => ref.current?.close()
  useBackToClose(close)

  // Klik op de achtergrond: het event-doel is dan het <dialog>-element zelf (de inhoud vult de popup).
  function onBackdrop(e: MouseEvent<HTMLDialogElement>): void {
    if (e.target === e.currentTarget) close()
  }

  const source: CardInput | null = card ?? (initial ? { ...EMPTY_CARD, status: defaultStatus, ...initial } : null)
  const title = card?.name ?? (initial?.name || 'Add card')

  return (
    <dialog ref={ref} className="card-sheet" onClose={onClose} onClick={onBackdrop} aria-labelledby="card-sheet-title">
      <div className="sheet-body">
        <header className="sheet-head">
          {/* Focus bij openen op de titel, niet op de sluitknop. */}
          <h2 id="card-sheet-title" tabIndex={-1} autoFocus>
            {mode.kind === 'edit' && card ? `Edit ${card.name}` : title}
          </h2>
          <button type="button" className="ghost icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>

        {mode.kind === 'view' && card ? (
          <CardDetail
            card={card}
            onEdit={(status) => setMode({ kind: 'edit', status: status ?? card.status })}
            onSaved={onSaved}
            onChanged={(row) => (onChanged ? onChanged(row) : onSaved([row]))}
            onSold={onSold ?? close}
          />
        ) : (
          <CardForm
            card={card}
            source={source}
            startStatus={mode.kind === 'edit' ? mode.status : defaultStatus}
            nextSortOrder={nextSortOrder}
            onCancel={() => (card && !startInEdit ? setMode({ kind: 'view' }) : close())}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        )}
      </div>
    </dialog>
  )
}
