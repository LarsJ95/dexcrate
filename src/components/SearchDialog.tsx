import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { listCards } from '../lib/db'
import { requestOpenCard } from '../lib/openCard'
import type { Route } from '../lib/routes'
import { looksLikeAbbr } from '../lib/setSearch'
import { findCards, findPages, findSets, ownedPerSet, setsFirst, type SpotSet } from '../lib/globalSearch'
import { LANGS, digitalSetIds, getSetList, resolveSetId, type Lang } from '../lib/tcgdex'
import { LANGUAGE_LABELS, type Card } from '../lib/types'
import { IconArchive, IconCards, IconSearch, IconUpload } from './Icons'
import { CRATE_ITEM, SCAN_ITEM, SETTINGS_ITEM, SIDE_GROUPS, type NavItem } from './nav'
import { SearchClear } from './SearchClear'
import { SetIcon } from './SetIcon'
import { Sheet } from './Sheet'

/** Pagina's in dezelfde namen als het menu, plus Import en Backup (die zitten onder Settings). */
const PAGES: NavItem[] = [
  ...SIDE_GROUPS.flatMap((g) => g.items),
  { ...SCAN_ITEM, label: 'Scan cards' },
  CRATE_ITEM,
  SETTINGS_ITEM,
  { route: 'import', label: 'Import', Icon: IconUpload },
  { route: 'backup', label: 'Backup', Icon: IconArchive },
]

type Group = 'Pages' | 'Sets' | 'Your cards'

interface Hit {
  key: string
  group: Group
  label: string
  sub: string
  icon: JSX.Element
  /** Pagina of set: adres; eigen kaart: id (opent in My cards). */
  href?: string
  cardId?: string
}

type BaseSet = Omit<SpotSet, 'owned'>

interface Props {
  onClose: () => void
}

/** Zoeken overal (Ctrl+K of de zoekknop, 21-10-2026): pagina's, sets in elke taal en je eigen kaarten. */
export function SearchDialog({ onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [sets, setSets] = useState<BaseSet[]>([])
  /** Set gevonden via de officiële afkorting (MEW → 151); alleen Engels. */
  const [abbr, setAbbr] = useState<{ q: string; setId: string | null } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  // Na het openen van de popup (die zet de focus op de titel) meteen in het zoekveld.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    listCards()
      .then((list) => {
        if (!cancelled) setCards(list)
      })
      .catch((err: unknown) => console.warn('Kaarten laden voor zoeken mislukt', err))
    // Setlijsten per taal (gecachet); elke taal verschijnt zodra hij binnen is.
    for (const lang of LANGS) {
      Promise.all([getSetList(lang), digitalSetIds(lang)])
        .then(([list, digital]) => {
          if (cancelled) return
          const add: BaseSet[] = []
          let order = 0
          for (const [setId, s] of list) {
            order += 1
            if (!digital.has(setId)) add.push({ lang, setId, name: s.name, logo: s.logo, order })
          }
          setSets((cur) => [...cur.filter((s) => s.lang !== lang), ...add])
        })
        .catch((err: unknown) => console.warn(`Setlijst (${lang}) laden voor zoeken mislukt`, err))
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Afkorting opzoeken (kort wachten tot je stopt met typen).
  useEffect(() => {
    const q = query.trim()
    if (!looksLikeAbbr(q)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      resolveSetId('en', q)
        .then((setId) => {
          if (!cancelled) setAbbr({ q, setId })
        })
        .catch((err: unknown) => console.warn('Afkorting opzoeken mislukt', err))
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const owned = useMemo(() => ownedPerSet(cards ?? []), [cards])

  const { hits, groups } = useMemo((): { hits: Hit[]; groups: Group[] } => {
    const candidates = sets.map((s) => ({ ...s, owned: owned.get(`${s.lang}/${s.setId}`) ?? 0 }))
    const exactSet: { lang: Lang; setId: string } | null = abbr?.setId && abbr.q === query.trim() ? { lang: 'en', setId: abbr.setId } : null
    const foundSets = findSets(candidates, query, exactSet)
    const pageHits = findPages(PAGES, query).map(
      (p): Hit => ({ key: `p:${p.route}`, group: 'Pages', label: p.label, sub: p.hint ?? '', icon: <p.Icon size={18} />, href: `#/${p.route as Route}` }),
    )
    const setHits = foundSets.map(
      (s): Hit => ({
        key: `s:${s.lang}/${s.setId}`,
        group: 'Sets',
        label: s.name,
        sub: [LANGUAGE_LABELS[s.lang], s.owned > 0 ? `${s.owned} owned` : null].filter(Boolean).join(' · '),
        icon: <SetIcon kind="symbol" lang={s.lang} setId={s.setId} name={s.name} logo={s.logo} />,
        href: `#/sets/${s.lang}/${encodeURIComponent(s.setId)}`,
      }),
    )
    const cardHits = findCards(cards ?? [], query).map(
      (c): Hit => ({
        key: `c:${c.id}`,
        group: 'Your cards',
        label: c.name,
        sub: [c.set_code, c.card_number && `#${c.card_number}`, c.quantity > 1 ? `${c.quantity}×` : null, c.status === 'sold' ? 'sold' : null].filter(Boolean).join(' · '),
        icon: <IconCards size={18} />,
        cardId: c.id,
      }),
    )
    // Pokémon-naam: eerst je eigen kaarten; setnaam of afkorting: eerst de sets.
    const order: Group[] = setsFirst(foundSets, query, exactSet) ? ['Pages', 'Sets', 'Your cards'] : ['Pages', 'Your cards', 'Sets']
    const byGroup: Record<Group, Hit[]> = { Pages: pageHits, Sets: setHits, 'Your cards': cardHits }
    return { hits: order.flatMap((g) => byGroup[g]), groups: order }
  }, [sets, owned, cards, query, abbr])

  const current = Math.min(active, hits.length - 1)
  const optionId = (i: number): string => `${listId}-${i}`

  // Gekozen regel in beeld houden bij bladeren met de pijltjes.
  useEffect(() => {
    if (current >= 0) document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, listId])

  function go(hit: Hit): void {
    // Eerst navigeren, dan sluiten: de popup ziet dat je wegging en laat de geschiedenis dan staan.
    if (hit.cardId) requestOpenCard(hit.cardId)
    else if (hit.href) window.location.hash = hit.href
    onClose()
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (hits.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((Math.max(current, 0) + step + hits.length) % hits.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const hit = hits[current]
      if (hit) go(hit)
    }
  }

  const typed = query.trim() !== ''
  return (
    <Sheet title="Search" onClose={onClose}>
      <div className="search gsearch-field">
        <IconSearch size={18} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Pages, sets or your cards"
          aria-label="Search pages, sets and your cards"
          enterKeyHint="go"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        <SearchClear value={query} onClear={() => setQuery('')} />
      </div>
      <div id={listId} className="gsearch-results" role="listbox" aria-label="Results">
        {groups.map((group) => {
          const items = hits.filter((h) => h.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} className="gsearch-group" role="group" aria-label={group}>
              <p className="gsearch-group-title" aria-hidden="true">
                {group}
              </p>
              {items.map((h) => {
                const i = hits.indexOf(h)
                return (
                  <div
                    key={h.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    className={`gsearch-hit${i === current ? ' is-active' : ''}`}
                    // Niet eerst het zoekveld laten blurren.
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => go(h)}
                  >
                    <span className="gsearch-hit-icon" aria-hidden="true">
                      {h.icon}
                    </span>
                    <span className="gsearch-hit-text">
                      <span className="gsearch-hit-label">{h.label}</span>
                      {h.sub && <span className="muted small">{h.sub}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
        {typed && hits.length === 0 && <p className="muted">Nothing found for “{query.trim()}”.</p>}
      </div>
      {!typed && <p className="muted small">Type to search sets in every language and your own cards. Arrow keys and Enter work too.</p>}
    </Sheet>
  )
}
