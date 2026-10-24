import { useState, type JSX } from 'react'
import { checkCameras, reportText, type CameraReport } from '../lib/cameraCheck'
import { CHS_DOWNLOAD_MB, downloadChsCatalog, removeChsCatalog, useChsCatalog } from '../lib/chsCatalog'
import { AUTO_GAPS, setPref, usePrefs, type AutoGap, type ScanModePref, type ThemeChoice } from '../lib/devicePrefs'
import { errorText } from '../lib/errors'
import { setMotionPreference, useMotion, useMotionPreference } from '../lib/motion'
import { STARTERS, setPartnerChoice, usePartner, usePartnerChoice } from '../lib/partner'
import { spriteUrls } from '../lib/runner'
import { Choice, Group, More, Toggle } from './SettingsControls'

const THEMES: readonly [ThemeChoice, string][] = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['system', 'Automatic'],
]
const SCAN_MODES: readonly [ScanModePref, string][] = [
  ['queue', 'Quick scan'],
  ['single', 'Single card'],
  ['multi', 'Binder page'],
]

/* Settings → Appearance en Scanning (24-10-2026, op verzoek beknopter): korte labels, uitleg alleen waar nodig. */

export function AppearanceGroup(): JSX.Element {
  const prefs = usePrefs()
  const motionPref = useMotionPreference()
  const motion = useMotion()
  return (
    <Group title="Appearance">
      <Choice label="Theme" value={prefs.theme} options={THEMES} onChange={(v) => setPref('theme', v)} />
      <Toggle checked={motionPref} onChange={setMotionPreference} hint={motionPref && !motion ? 'Off: your device reduces motion' : undefined}>
        Animations
      </Toggle>
      <Toggle checked={prefs.sky} onChange={(v) => setPref('sky', v)} hint="Stars and flying Pokémon">
        Living background
      </Toggle>
      <Toggle checked={prefs.wallpaper} onChange={(v) => setPref('wallpaper', v)} hint="Dark theme, new every day">
        Background pattern
      </Toggle>
      <PartnerRow />
    </Group>
  )
}

/** Partner-Pokémon: naam in de regel, kiezen na uitklappen. */
function PartnerRow(): JSX.Element {
  const choice = usePartnerChoice()
  const partner = usePartner()
  return (
    <More
      label={
        <>
          <img className="settings-partner-sprite" src={spriteUrls(partner.dex, false)[1]} alt="" width={32} height={32} />
          Partner Pokémon
        </>
      }
      detail={`${partner.name}${choice === null ? ' · automatic' : ''}`}
    >
      <p className="muted small">Automatic = the Pokémon you have the most cards of.</p>
      <div className="partner-picker" role="group" aria-label="Choose your partner">
        <button type="button" aria-pressed={choice === null} onClick={() => setPartnerChoice(null)} className="partner-option">
          <span className="partner-auto" aria-hidden="true">
            ★
          </span>
          <span>Automatic</span>
        </button>
        {STARTERS.map((s) => (
          <button key={s.dex} type="button" aria-pressed={choice?.dex === s.dex} onClick={() => setPartnerChoice({ dex: s.dex, name: s.name })} className="partner-option">
            <img src={spriteUrls(s.dex, false)[1]} alt="" width={56} height={56} loading="lazy" />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    </More>
  )
}

export function ScanningGroup(): JSX.Element {
  const prefs = usePrefs()
  return (
    <Group title="Scanning">
      <Choice label="Open scanner in" value={prefs.scanMode} options={SCAN_MODES} onChange={(v) => setPref('scanMode', v)} />
      <Toggle checked={prefs.autoCapture} onChange={(v) => setPref('autoCapture', v)} hint="Quick scan photographs a card that lies still">
        Auto capture
      </Toggle>
      {prefs.autoCapture && (
        <Choice
          label="Time between photos"
          value={String(prefs.autoGapMs)}
          options={AUTO_GAPS.map((g) => [String(g), `${(g / 1000).toLocaleString('en-GB')} s`] as [string, string])}
          onChange={(v) => setPref('autoGapMs', Number(v) as AutoGap)}
        />
      )}
      <Toggle checked={prefs.blurCheck} onChange={(v) => setPref('blurCheck', v)} hint="You can still use them">
        Hold back blurry photos
      </Toggle>
      <ChsCatalogRow />
      <CameraCheckRow />
    </Group>
  )
}

/** Wat meldt dit toestel per lens (zaklamp, resolutie)? Om de zaklamp aan de praat te krijgen; resultaat kopieerbaar. */
function CameraCheckRow(): JSX.Element {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; report: CameraReport } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  const run = (): void => {
    setState({ kind: 'busy' })
    setCopied(false)
    checkCameras()
      .then((report) => setState({ kind: 'done', report }))
      .catch((err: unknown) => setState({ kind: 'error', message: errorText(err, 'The camera could not be opened.') }))
  }
  const copy = (text: string): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch((err: unknown) => console.warn('Kopiëren mislukt', err))
  }
  return (
    <More label="Camera check" detail="Flashlight not working?">
      <p className="muted small">Opens each lens briefly and shows what the browser sees.</p>
      <div className="settings-actions">
        <button type="button" onClick={run} disabled={state.kind === 'busy'}>
          {state.kind === 'busy' ? 'Checking lenses…' : 'Check camera'}
        </button>
        {state.kind === 'done' && (
          <button type="button" className="ghost" onClick={() => copy(reportText(state.report))}>
            {copied ? 'Copied' : 'Copy result'}
          </button>
        )}
      </div>
      {state.kind === 'done' && <pre className="camera-report small">{reportText(state.report)}</pre>}
      {state.kind === 'error' && (
        <p className="error small" role="alert">
          {state.message}
        </p>
      )}
    </More>
  )
}

const dateText = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Vereenvoudigd-Chinese catalogus op dit apparaat: status, downloaden, bijwerken, weghalen. */
function ChsCatalogRow(): JSX.Element {
  const status = useChsCatalog()
  const [error, setError] = useState<string | null>(null)
  const run = (work: () => Promise<void>): void => {
    setError(null)
    work().catch((err: unknown) => setError(errorText(err, 'That did not work.')))
  }
  const busy = status.kind === 'downloading' || status.kind === 'loading'
  const detail =
    status.kind === 'ready'
      ? status.updateAvailable
        ? 'Update available'
        : 'Downloaded'
      : status.kind === 'downloading'
        ? `${Math.round((status.loaded / Math.max(1, status.total)) * 100)}%`
        : status.kind === 'loading'
          ? 'Checking…'
          : status.kind === 'error'
            ? 'Problem'
            : 'Not downloaded'
  return (
    <More label="Chinese cards" detail={detail}>
      <p className="muted small">
        {status.kind === 'ready'
          ? `${status.cards.toLocaleString('en-GB')} cards, ${dateText(status.fetchedAt)}. Updates by itself on Wi-Fi.`
          : `Needed to recognise these cards (${CHS_DOWNLOAD_MB} MB, once). On Wi-Fi it downloads by itself when you scan one.`}{' '}
        Data: Pokémon Shanghai via PTCG-CHS-Datasets (non-commercial).
      </p>
      <div className="settings-actions">
        <button type="button" onClick={() => run(downloadChsCatalog)} disabled={busy}>
          {status.kind === 'ready' ? 'Update now' : 'Download'}
        </button>
        {status.kind === 'ready' && (
          <button type="button" className="ghost" onClick={() => run(removeChsCatalog)}>
            Remove
          </button>
        )}
      </div>
      {(error ?? (status.kind === 'error' ? status.message : null)) && (
        <p className="error small" role="alert">
          {error ?? (status.kind === 'error' ? status.message : '')}
        </p>
      )}
    </More>
  )
}
