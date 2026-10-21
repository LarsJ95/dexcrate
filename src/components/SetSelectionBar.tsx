import { useEffect, useMemo, useState, type JSX } from 'react'
import { useCardPrices } from '../hooks/useCardPrices'
import { useManualLists } from '../hooks/useManualLists'
import { errorText } from '../lib/errors'
import { MANY_TABS, cardmarketUrlFor, openTabs, wishForSetCard, wishSummary } from '../lib/setSelection'
import type { Lang, SetCard } from '../lib/tcgdex'
import { LANGUAGE_LABELS } from '../lib/types'
import { addWishlistItems, listWishlist } from '../lib/wishlist'
import { setListItems } from '../lib/wishlistLists'
import { IconClose, IconStar } from './Icons'
import { ListChoice } from './ListChoice'
import { Loading } from './Loading'
import { Sheet } from './Sheet'

interface Props {
  lang: Lang
  /** Setcode voor de wens (afkorting, anders set-id), zoals bij "Add to wishlist" in het kaartvenster. */
  setCode: string
  /** Geselecteerde kaarten, in setvolgorde. */
  selected: readonly SetCard[]
  /** Aantal kaarten dat nu te zien is (filter en zoeken), voor "Select all". */
  shownCount: number
  allShownSelected: boolean
  onSelectAll: () => void
  onClear: () => void
  onDone: () => void
  /** Wishlist ingesteld (STAP6); anders geen wishlistknop. */
  wishlist: boolean
}

/** Balk onderaan bij kaarten selecteren in een set (21-10-2026, op verzoek): op de wishlist zetten of op Cardmarket openen. */
export function SetSelectionBar({ lang, setCode, selected, shownCount, allShownSelected, onSelectAll, onClear, onDone, wishlist }: Props): JSX.Element {
  const keys = useMemo(() => selected.map((c) => `${lang}/${c.id}`), [selected, lang])
  // Product-id's alvast ophalen (gecachet), zodat de links bij de klik klaarstaan; nog onbekend = zoeklink.
  const prices = useCardPrices(keys, true)
  const [wishOpen, setWishOpen] = useState(false)
  const [tabs, setTabs] = useState<string[] | null>(null)
  const [status, setStatus] = useState('')
  const n = selected.length

  function openCardmarket(): void {
    const urls = selected.map((c) => cardmarketUrlFor(c, lang, prices.get(`${lang}/${c.id}`)?.idProduct ?? null))
    if (urls.length === 0) return
    setStatus('')
    // Eén kaart: meteen. Meer: eerst kiezen (allemaal tegelijk of één voor één), anders lijkt het alsof alleen de
    // eerste opent terwijl de browser de rest blokkeert (21-10-2026, feedback gebruiker).
    if (urls.length === 1 && openTabs(urls) === 1) return
    setTabs(urls)
  }

  return (
    <div className="select-bar set-select-bar" role="region" aria-label="Selection">
      <span className="select-count">{n === 0 ? 'Tap cards' : `${n} selected`}</span>
      {!allShownSelected && shownCount > 0 && (
        <button type="button" className="small-btn" onClick={onSelectAll}>
          Select all ({shownCount})
        </button>
      )}
      {n > 0 && (
        <button type="button" className="small-btn" onClick={onClear}>
          Clear
        </button>
      )}
      <span className="spacer" />
      {wishlist && (
        <button
          type="button"
          className="small-btn"
          disabled={n === 0}
          onClick={() => {
            setStatus('')
            setWishOpen(true)
          }}
        >
          <IconStar size={16} />
          Wishlist
        </button>
      )}
      <button type="button" className="small-btn" disabled={n === 0} onClick={openCardmarket} aria-label={`Open ${n} on Cardmarket in new tabs`}>
        Cardmarket
      </button>
      <button type="button" className="ghost icon-btn" onClick={onDone} aria-label="Stop selecting">
        <IconClose size={18} />
      </button>
      <p className="select-status" role="status">
        {status}
      </p>

      {wishOpen && (
        <SetWishSheet
          lang={lang}
          setCode={setCode}
          cards={selected}
          onClose={() => setWishOpen(false)}
          onSaved={(message) => {
            setWishOpen(false)
            setStatus(message)
          }}
        />
      )}
      {tabs && <CardmarketTabsSheet urls={tabs} onClose={() => setTabs(null)} />}
    </div>
  )
}

interface WishProps {
  lang: Lang
  setCode: string
  cards: readonly SetCard[]
  onClose: () => void
  onSaved: (message: string) => void
}

/** Geselecteerde kaarten op de wishlist; wat er al op staat wordt overgeslagen (maar wel in de gekozen lijst gezet). */
function SetWishSheet({ lang, setCode, cards, onClose, onSaved }: WishProps): JSX.Element {
  const lists = useManualLists(true)
  // Catalogussleutel → id van de wens die er al is; null zolang de wishlist laadt.
  const [existing, setExisting] = useState<ReadonlyMap<string, string> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listWishlist()
      .then((items) => {
        if (!cancelled) setExisting(new Map(items.flatMap((i) => (i.tcgdex_id ? [[i.tcgdex_id, i.id] as const] : []))))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorText(err, 'Loading your wishlist failed.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const keyOf = (c: SetCard): string => `${lang}/${c.id}`
  const fresh = existing ? cards.filter((c) => !existing.has(keyOf(c))) : []
  const already = existing ? cards.length - fresh.length : 0
  const chosenLists = lists.filter((l) => chosen.has(l.id))

  async function save(): Promise<void> {
    if (busy || !existing) return
    setBusy(true)
    setError(null)
    let addedIds: string[]
    try {
      addedIds = (await addWishlistItems(fresh.map((c) => wishForSetCard(c, lang, setCode)))).map((i) => i.id)
    } catch (err) {
      setError(errorText(err, 'Adding to the wishlist failed.'))
      setBusy(false)
      return
    }
    const names = chosenLists.map((l) => l.name)
    if (chosenLists.length > 0) {
      const ids = [...addedIds, ...cards.flatMap((c) => existing.get(keyOf(c)) ?? [])]
      try {
        for (const l of chosenLists) await setListItems(l.id, { add: ids, remove: [] })
      } catch (err) {
        // De wensen staan er al; niet nog eens opslaan, alleen melden.
        console.warn('Wensen in lijst zetten mislukt', err)
        onSaved(`${wishSummary(addedIds.length, already, [])} Putting them in your list failed; you can do that on the Wishlist page.`)
        return
      }
    }
    onSaved(wishSummary(addedIds.length, already, names))
  }

  const label = fresh.length > 0 ? `Add ${fresh.length} to wishlist` : chosenLists.length > 0 ? 'Put in list' : 'Already on your wishlist'
  return (
    <Sheet title="Add to wishlist" onClose={onClose}>
      {loadError ? (
        <p className="error" role="alert">
          {loadError}
        </p>
      ) : existing === null ? (
        <Loading />
      ) : (
        <>
          <p>
            {cards.length} selected: {fresh.length} new{already > 0 ? `, ${already} already on your wishlist` : ''}.
          </p>
          <p className="muted small">
            Each wish: 1 copy, normal priority, any condition, {LANGUAGE_LABELS[lang]}. You can change wishes on the Wishlist page.
          </p>
          {lists.length > 0 && <ListChoice legend="Also put them in a list" lists={lists} chosen={chosen} onChange={setChosen} />}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer className="sheet-foot">
        <button type="button" className="primary" onClick={() => void save()} disabled={busy || existing === null || (fresh.length === 0 && chosenLists.length === 0)}>
          {busy ? 'Adding…' : label}
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </footer>
    </Sheet>
  )
}

interface TabsProps {
  urls: readonly string[]
  onClose: () => void
}

/**
 * Meerdere Cardmarket-tabbladen: eerst kiezen tussen allemaal tegelijk (werkt alleen met pop-ups toegestaan) en
 * één voor één. Blokkeert de browser bij "allemaal", dan meteen zeggen hoeveel er opengingen en verder één voor één.
 */
function CardmarketTabsSheet({ urls, onClose }: TabsProps): JSX.Element {
  const [mode, setMode] = useState<'choose' | 'all' | 'one'>('choose')
  const [opened, setOpened] = useState(0)
  const [stuck, setStuck] = useState(false)
  const total = urls.length
  const host = window.location.hostname

  function open(count: number, next: 'all' | 'one'): void {
    const n = openTabs(urls.slice(opened, opened + count))
    if (opened + n >= total) {
      onClose()
      return
    }
    setMode(next)
    setOpened(opened + n)
    setStuck(n === 0)
  }

  return (
    <Sheet title="Open on Cardmarket" onClose={onClose}>
      {mode === 'choose' ? (
        <>
          <p>Open {total} Cardmarket pages, each in its own tab.</p>
          <p className="muted small">
            Most browsers open only one tab per tap. To open them all at once, first allow pop-ups for {host} (icon in the address bar, or your
            browser’s site settings).{total >= MANY_TABS ? ' That is a lot of tabs at once.' : ''}
          </p>
        </>
      ) : (
        <>
          <p>
            {opened} of {total} tabs opened.{mode === 'all' ? ' Your browser blocked the others.' : ''}
          </p>
          {mode === 'all' && (
            <p className="muted small">
              Allow pop-ups for {host} (icon in the address bar, or your browser’s site settings) and tap “Try again”, or open them one at a time.
            </p>
          )}
        </>
      )}
      {stuck && (
        <p className="error" role="alert">
          The browser blocked this tab. Allow pop-ups for {host} and try again.
        </p>
      )}
      <footer className="sheet-foot">
        {mode === 'choose' ? (
          <>
            <button type="button" className="primary" onClick={() => open(total, 'all')}>
              Open all {total} at once
            </button>
            <button type="button" onClick={() => open(1, 'one')}>
              One at a time
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary" onClick={() => open(1, mode)}>
              Open next ({opened + 1} of {total})
            </button>
            {mode === 'all' && (
              <button type="button" onClick={() => open(total - opened, 'all')}>
                Try again
              </button>
            )}
          </>
        )}
        <button type="button" onClick={onClose}>
          {opened === 0 ? 'Cancel' : 'Close'}
        </button>
      </footer>
    </Sheet>
  )
}
