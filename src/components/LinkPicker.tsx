import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { findCandidates, type Candidate } from '../lib/match'
import { imageUrl, langFromName, splitKey, stripLangTag, type Lang } from '../lib/tcgdex'

interface Props {
  name: string
  setCode: string
  cardNumber: string
  value: string | null
  onSelect: (candidate: Candidate, lang: Lang) => void
  onClear: () => void
}

const LANG_LABELS: Record<Lang, string> = { en: 'Engels', ja: 'Japans', 'zh-cn': 'Chinees' }

export function LinkPicker({ name, setCode, cardNumber, value, onSelect, onClear }: Props): JSX.Element {
  const linked = useCardInfo(value)
  const [open, setOpen] = useState(!value)
  const [term, setTerm] = useState(stripLangTag(name))
  const [lang, setLang] = useState<Lang>(value ? (splitKey(value)?.lang ?? 'en') : langFromName(name))
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
        setError('Zoeken mislukt. Controleer je internetverbinding en probeer opnieuw.')
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
    void search(stripLangTag(name), langFromName(name))
  }, [value, open, name, search])

  return (
    <section className="link-picker" aria-label="Koppeling met kaartdatabase">
      <div className="link-current">
        {value ? (
          <>
            {linked?.image && <img src={imageUrl(linked.image, 'low') ?? ''} alt="" className="link-thumb" />}
            <div>
              <p className="link-title">{linked ? linked.name : 'Laden…'}</p>
              <p className="muted">{linked ? `${linked.set.name} ${linked.localId}` : value}</p>
            </div>
          </>
        ) : (
          <p className="muted">Nog niet gekoppeld: er is geen foto of marktprijs.</p>
        )}
        <div className="link-actions">
          <button type="button" className="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Sluiten' : value ? 'Andere kaart kiezen' : 'Kaart zoeken'}
          </button>
          {value && (
            <button type="button" className="ghost" onClick={onClear}>
              Ontkoppelen
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="link-search">
          {/* Geen <form>: dit staat binnen het bewerkformulier en geneste forms zijn ongeldig. */}
          <div className="link-search-row" role="search">
            <input
              aria-label="Kaartnaam"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void search(term, lang)
                }
              }}
            />
            <select aria-label="Taal" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <option key={l} value={l}>{LANG_LABELS[l]}</option>
              ))}
            </select>
            <button type="button" onClick={() => void search(term, lang)} disabled={busy}>
              Zoeken
            </button>
          </div>
          {lang !== 'en' && (
            <p className="muted small">Japanse en Chinese kaarten vind je alleen via set + nummer; zoeken op Engelse naam werkt niet.</p>
          )}
          {busy && <p aria-live="polite">Zoeken…</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {results && !busy && results.length === 0 && (
            <p className="muted">Geen kaarten gevonden. Probeer een kortere naam of een andere taal.</p>
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
                    {c.image ? (
                      <img src={imageUrl(c.image, 'low') ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span className="card-img placeholder"><span>Geen foto</span></span>
                    )}
                    <span className="cand-name">{c.name}</span>
                    <span className="muted small">{c.setName} {c.localId}</span>
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
