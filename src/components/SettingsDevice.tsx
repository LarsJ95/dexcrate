import { useState, type JSX } from 'react'
import { AUTO_GAPS, setPref, usePrefs, type AutoGap, type ScanModePref, type ThemeChoice } from '../lib/devicePrefs'
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
        Living background: stars, falling stars, Team Rocket and more
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
    </Section>
  )
}
