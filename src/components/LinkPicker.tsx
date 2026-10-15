import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { findCandidates, type Candidate } from '../lib/match'
import { imageCandidates, imageCandidatesForKey, lookupLang, splitKey, stripLangTag, type Lang } from '../lib/tcgdex'
import type { CardLanguage } from '../lib/types'
import { CardPicture } from './CardPicture'

interface Props {
  name: string
  language: CardLanguage | null
  setCode: string
  cardNumber: string
  value: string | null
  onSelect: (candidate: Candidate, lang: Lang) => void
  onClear: () => void
}

const LANG_LABELS: Record<Lang, string> = {
  en: 'English / European',
  ja: 'Japanese',
  'zh-cn': 'Chinese (simpl.)',
  'zh-tw': 'Chinese (trad.)',
  ko: 'Korean',
}

export function LinkPicker({ name, language, setCode, cardNumber, value, onSelect, onClear }: Props): JSX.Element {
  const linked = useCardInfo(value)
  const [open, setOpen] = useState(!value)
  const [term, setTerm] = useState(stripLangTag(name))
  const [lang, setLang] = useState<Lang>(value ? (splitKey(value)?.lang ?? 'en') : lookupLang(language))
  const [results, setResults] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(
    async (searchTerm: string, searchLang: Lang): Promise<void> => {
      if (!searchTerm.trim() && !(setCode && cardNumber)) return
      setBusy(true)
      setError(null)
      try {
        setResults(
          await findCandidates({ name: searchTerm, set_code: setCode || null, card_number: cardNumber || null }, searchLang),
        )
      } catch (err) {
        console.error(err)
        setError('Search failed. Check your connection and try again.')
      } finally {
        setBusy(false)
      }
    },
    [setCode, cardNumber],
  )

  // Niet-gekoppelde kaart: één keer automatisch suggesties tonen; daarna via de zoekknop.
  const autoSearched = useRef(false)
  useEffect(() => {
    if (value || !open || autoSearched.current) return
    autoSearched.current = true
    void search(stripLangTag(name), lookupLang(language))
  }, [value, open, name, language, search])

  return (
    <section className="link-picker" aria-label="Linked card">
      <div className="link-current">
        {value ? (
          <>
            {linked && (
              <CardPicture
                className="link-thumb"
                sources={imageCandidates(linked.lang, linked.set.id, linked.localId, linked.image, 'low')}
                alt=""
                fallback={null}
              />
            )}
            <div>
              <p className="link-title">{linked ? linked.name : 'Loading…'}</p>
              <p className="muted small">{linked ? `${linked.set.name} #${linked.localId}` : value}</p>
            </div>
          </>
        ) : (
          <p className="muted">Not linked</p>
        )}
        <div className="link-actions">
          <button type="button" className="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Close search' : value ? 'Change' : 'Find card'}
          </button>
          {value && (
            <button type="button" className="ghost" onClick={onClear}>
              Unlink
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="link-search">
          {/* Geen <form>: dit staat binnen het bewerkformulier en geneste forms zijn ongeldig. */}
          <div className="link-search-row" role="search">
            <input
              aria-label="Card name"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void search(term, lang)
                }
              }}
            />
            <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <option key={l} value={l}>{LANG_LABELS[l]}</option>
              ))}
            </select>
            <button type="button" onClick={() => void search(term, lang)} disabled={busy}>
              Search
            </button>
          </div>
          {busy && <p aria-live="polite">Searching…</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {results && !busy && results.length === 0 && (
            <p className="muted">No cards found. Try a shorter name or another language.</p>
          )}
          {results && results.length > 0 && (
            <ul className="candidates">
              {results.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    className={`candidate${c.key === value ? ' selected' : ''}`}
                    onClick={() => {
                      onSelect(c, lang)
                      setOpen(false)
                    }}
                  >
                    <CardPicture
                      sources={imageCandidatesForKey(c.key, c.image, 'low')}
                      alt=""
                      fallback={<span className="card-img placeholder"><span>No image</span></span>}
                    />
                    <span className="cand-name">{c.name}</span>
                    <span className="muted small">{c.setName} #{c.localId}</span>
                    <span className="cand-reason small">{c.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
