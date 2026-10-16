import { useState, type JSX } from 'react'
import { useKeyed } from '../hooks/useKeyed'
import { englishSpeciesName } from '../lib/names'
import type { WeekReport } from '../lib/progress'
import { spriteUrls } from '../lib/runner'
import { formatEur } from '../lib/stats'
import { regionOf } from '../lib/trainer'

const loadName = (key: string): Promise<string | null> => englishSpeciesName(Number(key))

/** Pokémon van de dag: heb je hem, dan in kleur met je kaarten; anders "Who's that Pokémon?" om te raden. */
export function DailyPokemon({ dexId, ownedCount }: { dexId: number; ownedCount: number }): JSX.Element {
  const name = useKeyed(String(dexId), loadName)
  const [revealed, setRevealed] = useState(false)
  const owned = ownedCount > 0
  const shown = owned || revealed
  const region = regionOf(dexId)
  return (
    <section className="panel daily" aria-labelledby="daily-title">
      <h2 id="daily-title" className="panel-title">
        Pokémon of the day
      </h2>
      <div className="daily-body">
        <button
          type="button"
          className={`daily-sprite${shown ? ' is-shown' : ''}`}
          onClick={() => setRevealed(true)}
          disabled={shown}
          aria-label={shown ? `${name ?? 'Pokémon'} #${dexId}` : "Who's that Pokémon? Tap to reveal"}
        >
          <img src={spriteUrls(dexId, false)[1]} alt="" width={96} height={96} />
        </button>
        <div className="daily-info">
          {shown ? (
            <>
              <strong>{name ?? `#${dexId}`}</strong>
              <span className="muted small">
                #{String(dexId).padStart(4, '0')}
                {region ? `, ${region.region}` : ''}
              </span>
              <span className="small">{owned ? `You own ${ownedCount} ${ownedCount === 1 ? 'card' : 'cards'} of it.` : 'Not in your collection yet.'}</span>
            </>
          ) : (
            <>
              <strong>Who's that Pokémon?</strong>
              <span className="muted small">You don't have this one yet. Tap to reveal.</span>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** Trainer-rapport van de afgelopen week, te delen als afbeelding. */
export function WeekReportPanel({ report, trainer, partnerDex }: { report: WeekReport; trainer: string; partnerDex: number | null }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function share(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const blob = await drawReport(report, trainer, partnerDex)
      const file = new File([blob], 'dexcrate-week.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My week in Dexcrate' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'dexcrate-week.png'
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (err) {
      // Delen geannuleerd is geen fout.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Could not create the image.')
      console.warn('Weekrapport delen mislukt', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel week-report" aria-labelledby="week-title">
      <h2 id="week-title" className="panel-title">
        Trainer report
      </h2>
      <p className="flavor">Your last 7 days</p>
      {report.added === 0 ? (
        <p className="muted small">No new cards this week. Your next catch shows up here.</p>
      ) : (
        <dl className="week-stats">
          <div>
            <dt>Cards added</dt>
            <dd>{report.added}</dd>
          </div>
          <div>
            <dt>New Pokémon</dt>
            <dd>{report.newSpecies}</dd>
          </div>
          <div>
            <dt>Value added</dt>
            <dd>{formatEur(report.addedValue)}</dd>
          </div>
          {report.best && (
            <div>
              <dt>Best pull</dt>
              <dd>{report.best.name}</dd>
            </div>
          )}
        </dl>
      )}
      <button type="button" className="small-btn" onClick={() => void share()} disabled={busy}>
        {busy ? 'Making image…' : 'Share as image'}
      </button>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

/** Weekrapport als afbeelding (1080×1080) in Pokédex-stijl. */
async function drawReport(report: WeekReport, trainer: string, partnerDex: number | null): Promise<Blob> {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  const red = ctx.createLinearGradient(0, 0, size, size)
  red.addColorStop(0, '#e3350d')
  red.addColorStop(1, '#b3200a')
  ctx.fillStyle = red
  ctx.fillRect(0, 0, size, size)
  // Lens en lampjes
  ctx.fillStyle = '#f3f1ec'
  ctx.beginPath()
  ctx.arc(110, 110, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a8be8'
  ctx.beginPath()
  ctx.arc(110, 110, 48, 0, Math.PI * 2)
  ctx.fill()
  ;['#ff4b4b', '#ffd23f', '#4fd16f'].forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(210 + i * 44, 80, 14, 0, Math.PI * 2)
    ctx.fill()
  })
  // Scherm
  ctx.fillStyle = '#17161d'
  ctx.fillRect(80, 220, size - 160, size - 300)
  ctx.fillStyle = '#ffcb05'
  ctx.font = '800 64px Archivo, sans-serif'
  ctx.fillText(`${trainer}'s week`, 130, 320)
  ctx.fillStyle = '#f6f3ee'
  ctx.font = '700 52px Archivo, sans-serif'
  const lines = [
    `+${report.added} ${report.added === 1 ? 'card' : 'cards'}`,
    `${report.newSpecies} new Pokémon`,
    `${formatEur(report.addedValue)} added`,
    report.best ? `Best pull: ${report.best.name}` : 'Keep collecting!',
  ]
  lines.forEach((l, i) => ctx.fillText(l.slice(0, 32), 130, 430 + i * 90))
  ctx.fillStyle = '#a19ba9'
  ctx.font = '600 36px Archivo, sans-serif'
  ctx.fillText('Dexcrate', 130, size - 120)
  if (partnerDex) {
    const img = await loadImage(spriteUrls(partnerDex, false)[1]).catch(() => null)
    if (img) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, size - 420, size - 460, 320, 320)
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
