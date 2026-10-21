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
  const [tabs, setTabs] = useState<{ urls: string[]; opened: number } | null>(null)
  const [status, setStatus] = useState('')
  const n = selected.length

  function openCardmarket(): void {
    const urls = selected.map((c) => cardmarketUrlFor(c, lang, prices.get(`${lang}/${c.id}`)?.idProduct ?? null))
    if (urls.length === 0) return
    setStatus('')
    // Veel tabbladen: eerst vragen. Anders meteen openen; blokkeert de browser er een, dan verder in het venster.
    if (urls.length >= MANY_TABS) {
      setTabs({ urls, opened: 0 })
      return
    }
    const opened = openTabs(urls)
    if (opened < urls.length) setTabs({ urls, opened })
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
      {tabs && <CardmarketTabsSheet urls={tabs.urls} opened={tabs.opened} onClose={() => setTabs(null)} />}
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
  const toggle = (id: string, on: boolean): void =>
    setChosen((cur) => {
      const next = new Set(cur)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

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
          {lists.length > 0 && (
            <fieldset className="form-group">
              <legend>Also put them in a list</legend>
              <div className="filter-checks">
                {lists.map((l) => (
                  <label key={l.id} className="check">
                    <input type="checkbox" checked={chosen.has(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} />
                    {l.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
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
  /** Al geopend (0 = nog vragen). */
  opened: number
  onClose: () => void
}

/** Veel Cardmarket-tabbladen: eerst vragen; blokkeert de browser ze, dan pop-ups toestaan of één voor één. */
function CardmarketTabsSheet({ urls, opened: start, onClose }: TabsProps): JSX.Element {
  const [opened, setOpened] = useState(start)
  const [stuck, setStuck] = useState(false)
  const total = urls.length

  function open(count: number): void {
    const n = openTabs(urls.slice(opened, opened + count))
    if (opened + n >= total) {
      onClose()
      return
    }
    setOpened(opened + n)
    setStuck(n === 0)
  }

  return (
    <Sheet title="Open on Cardmarket" onClose={onClose}>
      {opened === 0 && !stuck ? (
        <>
          <p>Open {total} Cardmarket pages, each in its own tab?</p>
          <p className="muted small">That is a lot of tabs at once. If your browser blocks them, you can allow pop-ups for this site or open them one at a time.</p>
        </>
      ) : (
        <>
          <p>
            {opened} of {total} tabs opened.
          </p>
          <p className="muted small">
            Your browser opens only one tab per tap. To open them all at once, allow pop-ups for {window.location.hostname} (icon in the address bar,
            or your browser’s site settings) and tap “Try again”. Or open them one at a time.
          </p>
        </>
      )}
      {stuck && (
        <p className="error" role="alert">
          The browser blocked this tab too. Allow pop-ups for {window.location.hostname} and try again.
        </p>
      )}
      <footer className="sheet-foot">
        {opened === 0 && !stuck ? (
          <button type="button" className="primary" onClick={() => open(total)}>
            Open {total} tabs
          </button>
        ) : (
          <>
            <button type="button" className="primary" onClick={() => open(1)}>
              Open next ({opened + 1} of {total})
            </button>
            <button type="button" onClick={() => open(total - opened)}>
              Try again
            </button>
          </>
        )}
        <button type="button" onClick={onClose}>
          {opened === 0 ? 'Cancel' : 'Close'}
        </button>
      </footer>
    </Sheet>
  )
}
