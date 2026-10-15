import { useCallback, useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import { CardImage } from '../components/CardImage'
import { CardPicker } from '../components/CardPicker'
import { IconArrowLeft, IconPlus, IconSearch } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { useDbFeature } from '../hooks/useDbFeature'
import { useSchemaV2 } from '../hooks/useSchemaV2'
import { LOCATION_KIND_LABELS, binderPages, looseCards, nextFreePocket, placeConflicts, type BinderPocket, type Location, type PlannedSlot } from '../lib/binder'
import { listCards, updateCard } from '../lib/db'
import { deleteLocation, deletePlanned, hasBinderPlanning, listLocations, listPlanned, saveLocation, savePlanned } from '../lib/locations'
import { matchesSearch } from '../lib/search'
import { thumbPath, type Card } from '../lib/types'
import { Loading } from '../components/Loading'

interface Props {
  /** Locatie-id uit de URL (#/locations/<id>), of leeg voor het overzicht. */
  param: string
}

/** Nieuwe of bestaande locatie bewerken. */
function LocationForm({ location, onSaved, onCancel }: { location: Location | null; onSaved: (l: Location) => void; onCancel: () => void }): JSX.Element {
  const [name, setName] = useState(location?.name ?? '')
  const [kind, setKind] = useState<Location['kind']>(location?.kind ?? 'binder')
  const [size, setSize] = useState(String(location?.page_size ?? 9))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busy) return
    const n = name.trim()
    const s = Number(size)
    if (!n || n.length > 80) return setError('Enter a name (max. 80 characters).')
    if (kind === 'binder' && (!Number.isInteger(s) || s < 1 || s > 24)) return setError('Pockets per page must be 1 to 24.')
    setBusy(true)
    try {
      onSaved(await saveLocation(location?.id ?? null, { name: n, kind, page_size: kind === 'binder' ? s : null }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
      setBusy(false)
    }
  }

  return (
    <form className="card-form" onSubmit={onSubmit} noValidate>
      <div className="form-grid">
        <label>
          Name
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Red binder" autoFocus />
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as Location['kind'])}>
            {(Object.keys(LOCATION_KIND_LABELS) as Location['kind'][]).map((k) => (
              <option key={k} value={k}>
                {LOCATION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {kind === 'binder' && (
          <label>
            Pockets per page
            <input type="number" min={1} max={24} value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-foot">
        <span className="spacer" />
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

/** Fysieke locaties (mappen, dozen) en per map de indeling: werkelijke plek naast de planning. */
export function LocationsPage({ param }: Props): JSX.Element {
  const v2 = useSchemaV2()
  const planning = useDbFeature(hasBinderPlanning) === true
  const [locations, setLocations] = useState<Location[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [planned, setPlanned] = useState<PlannedSlot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Location | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [query, setQuery] = useState('')
  const [moveFrom, setMoveFrom] = useState<Card | null>(null)
  const [moving, setMoving] = useState(false)
  const [pocket, setPocket] = useState<BinderPocket | null>(null)
  const [reserveLabel, setReserveLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const current = locations?.find((l) => l.id === param) ?? null

  const load = useCallback(() => {
    Promise.all([listLocations(), listCards()])
      .then(([l, c]) => {
        setLocations(l)
        setCards(c)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Loading failed.'))
  }, [])

  useEffect(() => {
    if (v2 === true) load()
  }, [v2, load])

  useEffect(() => {
    if (!planning || !param) return
    let cancelled = false
    listPlanned(param)
      .then((p) => {
        if (!cancelled) setPlanned(p)
      })
      .catch((err: unknown) => console.warn('Planning laden mislukt', err))
    return () => {
      cancelled = true
    }
  }, [planning, param])

  const conflicts = useMemo(() => placeConflicts(cards), [cards])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cards) if (c.location_id && c.ownership === 'owned') m.set(c.location_id, (m.get(c.location_id) ?? 0) + c.quantity)
    return m
  }, [cards])

  async function act(action: () => Promise<void>): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.')
    } finally {
      setBusy(false)
    }
  }

  const replaceCard = (row: Card): void => setCards((list) => list.map((c) => (c.id === row.id ? row : c)))

  /** Kaart naar een vakje; ligt daar al een kaart, dan wisselen ze van plek. */
  const moveTo = (card: Card, target: BinderPocket): Promise<void> =>
    act(async () => {
      if (!current) return
      const other = target.actual[0]
      const from = { location_id: card.location_id, location_page: card.location_page, location_slot: card.location_slot }
      replaceCard(await updateCard(card.id, { location_id: current.id, location_page: target.page, location_slot: target.slot }))
      if (other && other.id !== card.id) replaceCard(await updateCard(other.id, from))
      setMoveFrom(null)
    })

  if (v2 === false) {
    return (
      <section className="page">
        <h1>Locations</h1>
        <p className="notice">Locations are not set up yet (run STAP4 in Supabase).</p>
      </section>
    )
  }
  if (error && !locations) return <p className="page error" role="alert">{error}</p>
  if (!locations) return <Loading center />

  // --- Overzicht ---
  if (!param) {
    return (
      <section className="page">
        <div className="page-head">
          <div>
            <h1>Locations</h1>
            <p className="muted">Binders, boxes and decks: where your cards physically are.</p>
          </div>
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            <IconPlus size={18} />
            Add location
          </button>
        </div>
        {conflicts.size > 0 && <p className="notice">{conflicts.size} cards share a pocket with another card. Open the binder to fix it.</p>}
        {locations.length === 0 && <p className="empty">No locations yet. Add a binder or box to record where your cards are.</p>}
        <ul className="tx-list">
          {locations.map((l) => (
            <li key={l.id}>
              <a className="tx-row location-row" href={`#/locations/${l.id}`}>
                <span className="tx-main">
                  <span className="tx-title">{l.name}</span>
                  <span className="muted small">
                    {LOCATION_KIND_LABELS[l.kind]}
                    {l.page_size ? `, ${l.page_size} pockets per page` : ''}
                  </span>
                </span>
                <span className="tx-amount">{counts.get(l.id) ?? 0} cards</span>
              </a>
            </li>
          ))}
        </ul>
        {editing && (
          <Sheet title={editing === 'new' ? 'Add location' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
            <LocationForm
              location={editing === 'new' ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={(l) => {
                setLocations((list) => [...(list ?? []).filter((x) => x.id !== l.id), l])
                setEditing(null)
              }}
            />
          </Sheet>
        )}
      </section>
    )
  }

  if (!current) return <p className="page error">Location not found. <a href="#/locations">All locations</a></p>

  const pages = current.page_size ? binderPages(current, cards, planned) : []
  const loose = looseCards(current, cards)
  const hit = (c: Card): boolean => !query.trim() || matchesSearch(c, query)
  const unplaced = cards.filter((c) => c.ownership === 'owned' && !c.location_id)

  return (
    <section className="page">
      <a href="#/locations" className="back">
        <IconArrowLeft size={18} />
        All locations
      </a>
      <div className="page-head">
        <div>
          <h1>{current.name}</h1>
          <p className="muted">
            {LOCATION_KIND_LABELS[current.kind]}, {counts.get(current.id) ?? 0} cards
          </p>
        </div>
        <div className="head-actions">
          {current.page_size && (
            <button type="button" aria-pressed={moving} onClick={() => (setMoving((m) => !m), setMoveFrom(null))}>
              {moving ? 'Done moving' : 'Move cards'}
            </button>
          )}
          <button type="button" onClick={() => setEditing(current)}>
            Edit
          </button>
        </div>
      </div>

      {moving && <p className="notice">{moveFrom ? `Tap the pocket for ${moveFrom.name}. A card already there swaps places.` : 'Tap the card you want to move.'}</p>}

      <div className="filters">
        <div className="search">
          <IconSearch size={18} />
          <input type="search" placeholder="Find a card in this location" aria-label="Find" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {current.page_size && (
        <div className="binder-pages">
          {pages.map((page, i) => (
            <section key={i} className="binder-page" aria-label={`Page ${i + 1}`}>
              <p className="binder-page-label">Page {i + 1}</p>
              <ul className="binder set-binder" style={{ ['--binder-cols' as string]: current.page_size && current.page_size > 9 ? 4 : 3 }}>
                {page.map((p) => {
                  const c = p.actual[0] as Card | undefined
                  const warn = p.actual.length > 1 || (c && conflicts.has(c.id)) || p.mismatch
                  const dim = c ? !hit(c) : Boolean(query.trim())
                  return (
                    <li key={p.slot} className={`slot${c ? ' have' : ' empty-pocket'}${dim ? ' outside' : ''}${moveFrom && c?.id === moveFrom.id ? ' moving' : ''}`}>
                      <button
                        type="button"
                        className="slot-open"
                        aria-label={`Page ${p.page}, pocket ${p.slot}: ${c ? c.name : p.planned ? `reserved for ${p.planned.label}` : 'empty'}`}
                        onClick={() => {
                          if (moving) {
                            if (moveFrom) void moveTo(moveFrom, p)
                            else if (c) setMoveFrom(c)
                            return
                          }
                          setReserveLabel(p.planned?.label ?? '')
                          setPocket(p)
                        }}
                      >
                        {c ? (
                          <CardImage tcgdexId={c.tcgdex_id} kind={c.kind} name={c.name} photoPath={thumbPath(c)} detail={c.card_number ? `#${c.card_number}` : null} />
                        ) : (
                          <span className="pocket-empty">{p.planned ? p.planned.label : '+'}</span>
                        )}
                        <span className="slot-num">{p.slot}</span>
                        {warn && <span className="slot-warning">{p.mismatch ? 'Not as planned' : 'Check'}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {loose.length > 0 && (
        <>
          <h2 className="section-title">{current.page_size ? 'In this binder, no pocket set' : 'Cards here'}</h2>
          <ul className="tx-list">
            {loose.map((c) => (
              <li key={c.id} className={hit(c as Card) ? undefined : 'outside'}>
                <span className="tx-row">
                  <span className="tx-main">
                    <span className="tx-title">{c.name}</span>
                  </span>
                  <span className="tx-amount">{c.quantity}×</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!current.page_size && (
        <button type="button" onClick={() => setPocket({ page: 0, slot: 0, actual: [], planned: null, mismatch: false })}>
          Add a card to {current.name}
        </button>
      )}

      {pocket && (
        <Sheet title={pocket.page ? `Page ${pocket.page}, pocket ${pocket.slot}` : `Add to ${current.name}`} onClose={() => setPocket(null)}>
          {pocket.actual.length > 0 ? (
            <>
              {pocket.actual.map((c) => (
                <div key={c.id} className="sheet-foot">
                  <span>
                    {c.name} {conflicts.get(c.id) && <span className="notice-inline">{conflicts.get(c.id)}</span>}
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="ghost danger-text"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        replaceCard(await updateCard(c.id, { location_id: null, location_page: null, location_slot: null }))
                        setPocket(null)
                      })
                    }
                  >
                    Take out
                  </button>
                </div>
              ))}
              {pocket.mismatch && pocket.planned && <p className="muted small">Planned here: {pocket.planned.label}.</p>}
            </>
          ) : (
            <>
              <p className="muted small">Place a card from your collection that has no location yet{unplaced.length === 0 ? ' (none left)' : ''}.</p>
              <CardPicker
                cards={unplaced}
                onCancel={() => setPocket(null)}
                onPick={(c) =>
                  void act(async () => {
                    const spot = pocket.page ? { location_page: pocket.page, location_slot: pocket.slot } : { location_page: null, location_slot: null }
                    replaceCard(await updateCard(c.id, { location_id: current.id, ...spot }))
                    setPocket(null)
                  })
                }
              />
            </>
          )}
          {planning && pocket.page > 0 && (
            <form
              className="card-form"
              onSubmit={(e) => {
                e.preventDefault()
                const label = reserveLabel.trim()
                if (!label) return
                void act(async () => {
                  const saved = await savePlanned({ location_id: current.id, page: pocket.page, slot: pocket.slot, label: label.slice(0, 200), tcgdex_id: pocket.planned?.tcgdex_id ?? null, variant: pocket.planned?.variant ?? null })
                  setPlanned((list) => [...list.filter((x) => x.id !== saved.id && !(x.page === saved.page && x.slot === saved.slot)), saved])
                  setPocket(null)
                })
              }}
            >
              <fieldset className="form-group">
                <legend>Plan for this pocket</legend>
                <p className="muted small">Reserve the pocket for a card you want here, even if you don’t have it yet.</p>
                <label>
                  Reserved for
                  <input value={reserveLabel} maxLength={200} placeholder="e.g. Mew ex 151" onChange={(e) => setReserveLabel(e.target.value)} />
                </label>
                <div className="sheet-foot">
                  {pocket.planned && (
                    <button
                      type="button"
                      className="ghost danger-text"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          if (!pocket.planned) return
                          await deletePlanned(pocket.planned.id)
                          setPlanned((list) => list.filter((x) => x.id !== pocket.planned?.id))
                          setPocket(null)
                        })
                      }
                    >
                      Remove reservation
                    </button>
                  )}
                  <span className="spacer" />
                  <button type="submit" disabled={busy || !reserveLabel.trim()}>
                    Save reservation
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {pocket.page > 0 && pocket.actual.length === 0 && (
            <p className="muted small">
              Next free pocket in this binder: page {nextFreePocket(current, cards, planned).page}, pocket {nextFreePocket(current, cards, planned).slot}.
            </p>
          )}
        </Sheet>
      )}

      {editing && editing !== 'new' && (
        <Sheet title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <LocationForm
            location={editing}
            onCancel={() => setEditing(null)}
            onSaved={(l) => {
              setLocations((list) => (list ?? []).map((x) => (x.id === l.id ? l : x)))
              setEditing(null)
            }}
          />
          <div className="sheet-foot">
            <button
              type="button"
              className={confirmDelete ? 'danger' : 'ghost danger-text'}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                void act(async () => {
                  await deleteLocation(editing.id)
                  window.location.hash = '#/locations'
                  setLocations((list) => (list ?? []).filter((x) => x.id !== editing.id))
                  setEditing(null)
                  load()
                })
              }}
            >
              {confirmDelete ? 'Confirm: delete location (cards stay, without location)' : 'Delete location'}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
