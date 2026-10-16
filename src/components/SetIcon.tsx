import { useEffect, useRef, useState, type JSX } from 'react'
import { useCardInfo } from '../hooks/useCardInfo'
import { useKeyed } from '../hooks/useKeyed'
import { getPtcgSets, limitlessSymbol, setLogoSources, setSymbolSources, type PtcgSets, type SetRef } from '../lib/setIcons'
import { getSetAbbr, setOfKey } from '../lib/tcgdex'
import { CardPicture } from './CardPicture'

interface Props extends SetRef {
  /** 'logo' = groot op de Sets-pagina (valt terug op de afkorting); 'symbol' = klein naast de setnaam. */
  kind: 'logo' | 'symbol'
}

const loadPtcg = (): Promise<PtcgSets> => getPtcgSets()

/**
 * Set-logo of -symbool uit de eerste bron die het heeft. De officiële afkorting (voor Limitless en als
 * tekst) wordt alleen opgehaald als er niets anders is, en pas als het icoon in beeld komt.
 */
export function SetIcon({ kind, ...set }: Props): JSX.Element | null {
  const ptcg = useKeyed('all', loadPtcg)
  const ref = useRef<HTMLSpanElement>(null)
  const [abbr, setAbbr] = useState<string | null | undefined>(undefined)
  // Tijdens het laden van pokemontcg.io al wel het TCGdex-logo tonen.
  const base = kind === 'logo' ? setLogoSources(set, ptcg) : setSymbolSources(set, ptcg)
  // Engels zonder logo/symbool: afkorting nodig voor Limitless; Japans: Limitless werkt op set-id.
  const needAbbr = ptcg !== undefined && base.length === 0 && (set.lang === 'en' || kind === 'logo')
  const { lang, setId } = set

  useEffect(() => {
    const el = ref.current
    if (!needAbbr || !el) return
    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        getSetAbbr(lang, setId)
          .then((a) => {
            if (!cancelled) setAbbr(a)
          })
          .catch((err: unknown) => console.warn('Setafkorting ophalen mislukt', err))
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [needAbbr, lang, setId])

  const limitless = limitlessSymbol(lang, setId, abbr)
  const sources = limitless ? [...base, limitless] : base
  const fallback =
    kind === 'logo' ? (
      <span className="set-code" title={setId}>
        {abbr ?? setId}
      </span>
    ) : null

  return (
    <span ref={ref} className={kind === 'logo' ? 'set-logo' : 'set-symbol'}>
      {sources.length > 0 ? <CardPicture sources={sources} alt="" className="set-icon-img" fallback={fallback} /> : fallback}
    </span>
  )
}

/** Setsymbool van een gekoppelde kaart ("<taal>/<kaart-id>"); niets zolang de kaartinfo laadt of zonder koppeling. */
export function CardSetSymbol({ tcgdexId }: { tcgdexId: string | null }): JSX.Element | null {
  const info = useCardInfo(tcgdexId)
  const ref = tcgdexId ? setOfKey(tcgdexId) : null
  if (!ref || !info) return null
  return <SetIcon key={`${ref.lang}/${ref.setId}`} kind="symbol" lang={ref.lang} setId={ref.setId} name={info.set.name} logo={info.set.logo} />
}
