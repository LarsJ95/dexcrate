import { useEffect, useState, type JSX } from 'react'
import { searchCatalog, type CatalogHit } from '../lib/catalogSearch'
import { imageCandidates, type Lang } from '../lib/tcgdex'
import { CardFace } from './CardFace'
import { CardPicture } from './CardPicture'
import { Loading } from './Loading'

interface Props {
  query: string
  lang: Lang
  /** Catalogussleutels ("<taal>/<kaart-id>") die al op de wishlist staan. */
  wished: ReadonlySet<string>
  /** Catalogussleutels die je al hebt. */
  owned: ReadonlySet<string>
  onPick: (hit: CatalogHit, lang: Lang) => void
  /** Uitleg onder de kop, bv. dat een Europese taal de Engelse kaarten toont. */
  note?: string | null
}

const PAGE = 24
const DEBOUNCE_MS = 400

type State = { key: string; hits: CatalogHit[] | null; error: string | null }

/** Kaarten uit de kaartendatabase (TCGdex) voor de zoekterm, om aan de wishlist toe te voegen. */
export function CatalogResults({ query, lang, wished, owned, onPick, note = null }: Props): JSX.Element | null {
  const term = query.trim()
  const key = `${lang}|${term.toLowerCase()}`
  const [state, setState] = useState<State>({ key: '', hits: null, error: null })
  const [shown, setShown] = useState({ key: '', count: PAGE })

  useEffect(() => {
    if (term.length < 2) return
    let cancelled = false
    const t = window.setTimeout(() => {
      searchCatalog(term, lang)
        .then((hits) => {
          if (!cancelled) setState({ key, hits, error: null })
        })
        .catch((err: unknown) => {
          console.error('Zoeken in de kaartendatabase mislukt', err)
          if (!cancelled) setState({ key, hits: null, error: 'Searching the card database failed. Check your connection and try again.' })
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term, lang, key])

  if (term.length < 2) return null
  const current = state.key === key ? state : null
  const count = shown.key === key ? shown.count : PAGE

  return (
    <section className="catalog-results" aria-labelledby="catalog-title">
      <div className="catalog-head">
        <h2 id="catalog-title" className="section-title">
          Card database
        </h2>
        {current?.hits && (
          <span className="muted small">
            {current.hits.length === 0 ? 'No cards found' : `${current.hits.length} ${current.hits.length === 1 ? 'card' : 'cards'}, newest sets first`}
          </span>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
      {!current && <Loading text="Searching…" />}
      {current?.error && (
        <p className="error" role="alert">
          {current.error}
        </p>
      )}
      {current?.hits && current.hits.length > 0 && (
        <>
          <ul className="catalog-grid">
            {current.hits.slice(0, count).map((hit) => {
              const k = `${lang}/${hit.card.id}`
              const status = wished.has(k) ? 'On your wishlist' : owned.has(k) ? 'Owned' : null
              return (
                <li key={k}>
                  <button type="button" className="catalog-hit" onClick={() => onPick(hit, lang)}>
                    <CardPicture
                      sources={imageCandidates(lang, hit.setId, hit.card.localId, hit.card.image, 'low')}
                      alt=""
                      fallback={<CardFace name={hit.card.name} detail={`#${hit.card.localId}`} />}
                    />
                    <span className="catalog-name">{hit.card.name}</span>
                    <span className="muted small">
                      {hit.set?.name ?? hit.setId} #{hit.card.localId}
                    </span>
                    {status && <span className={`chip${status === 'Owned' ? ' status-sold' : ''}`}>{status}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {current.hits.length > count && (
            <button type="button" className="small-btn" onClick={() => setShown({ key, count: count + PAGE })}>
              Show more ({current.hits.length - count} left)
            </button>
          )}
        </>
      )}
    </section>
  )
}
