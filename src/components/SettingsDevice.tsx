import { useState, type JSX } from 'react'
import { CHS_DOWNLOAD_MB, downloadChsCatalog, removeChsCatalog, useChsCatalog } from '../lib/chsCatalog'
import { AUTO_GAPS, setPref, usePrefs, type AutoGap, type ScanModePref, type ThemeChoice } from '../lib/devicePrefs'
import { errorText } from '../lib/errors'
import { setMotionPreference, useMotion, useMotionPreference } from '../lib/motion'
import { STARTERS, setPartnerChoice, usePartner, usePartnerChoice } from '../lib/partner'
import { spriteUrls } from '../lib/runner'
import { Choice, Section, Toggle } from './SettingsControls'

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

export function AppearanceSection(): JSX.Element {
  const prefs = usePrefs()
  const motionPref = useMotionPreference()
  const motion = useMotion()
  return (
    <Section title="Appearance" scope="device">
      <Choice label="Theme" value={prefs.theme} options={THEMES} onChange={(v) => setPref('theme', v)} />
      <Toggle
        checked={motionPref}
        onChange={setMotionPreference}
        hint={motionPref && !motion ? 'Your device is set to reduce motion, so animations stay off.' : undefined}
      >
        Animations: holo effects, celebrations and visiting Pokémon
      </Toggle>
      <Toggle checked={prefs.sky} onChange={(v) => setPref('sky', v)} hint={prefs.sky && !motion ? 'With animations off you see a still starry sky.' : undefined}>
        Living background: stars, falling stars, flying Pokémon and more
      </Toggle>
      <Toggle checked={prefs.wallpaper} onChange={(v) => setPref('wallpaper', v)}>
        Background pattern: a different one each day in the dark theme (Poké Balls, holo, energy mix, night sky)
      </Toggle>
    </Section>
  )
}

export function PartnerSection(): JSX.Element {
  const choice = usePartnerChoice()
  const partner = usePartner()
  const [open, setOpen] = useState(false)
  return (
    <Section title="Partner Pokémon" scope="device" intro="Your partner walks with you through the app and cheers when you add cards.">
      <div className="partner-current">
        <img src={spriteUrls(partner.dex, false)[1]} alt="" width={64} height={64} />
        <div>
          <strong>{partner.name}</strong>
          <p className="muted small">{choice === null ? 'Automatic: the Pokémon you have the most cards of.' : 'Chosen by you.'}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
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
      )}
    </Section>
  )
}

export function ScanningSection(): JSX.Element {
  const prefs = usePrefs()
  return (
    <Section title="Scanning" scope="device">
      <Choice label="Open the scanner in" value={prefs.scanMode} options={SCAN_MODES} onChange={(v) => setPref('scanMode', v)} />
      <Toggle checked={prefs.autoCapture} onChange={(v) => setPref('autoCapture', v)} hint="Quick scan takes the photo itself when a new card lies still in the frame. You can also switch it in the camera.">
        Auto capture
      </Toggle>
      <Choice
        label="Time between auto photos"
        value={String(prefs.autoGapMs)}
        options={AUTO_GAPS.map((g) => [String(g), `${(g / 1000).toLocaleString('en-GB')} s`] as [string, string])}
        onChange={(v) => setPref('autoGapMs', Number(v) as AutoGap)}
      />
      <Toggle checked={prefs.blurCheck} onChange={(v) => setPref('blurCheck', v)} hint="Clearly blurry camera photos are not sent; you can still choose to use them.">
        Hold back blurry photos
      </Toggle>
      <ChsCatalogRow />
    </Section>
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
  return (
    <div className="settings-row chs-row">
      <span className="settings-label">Chinese (simplified) cards</span>
      <p className="muted small">
        {status.kind === 'ready'
          ? `${status.cards.toLocaleString('en-GB')} cards, downloaded ${dateText(status.fetchedAt)}.${status.updateAvailable ? ' A newer version is available.' : ''} Checked every 2 weeks; on Wi-Fi it updates by itself.`
          : status.kind === 'downloading'
            ? `Downloading… ${Math.round((status.loaded / Math.max(1, status.total)) * 100)}%`
            : `Needed to recognise Simplified Chinese cards. Downloads once to this device (${CHS_DOWNLOAD_MB} MB); on Wi-Fi it starts by itself when you scan one.`}{' '}
        Card data: Pokémon / Pokémon Shanghai, via PTCG-CHS-Datasets (non-commercial use).
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
    </div>
  )
}
