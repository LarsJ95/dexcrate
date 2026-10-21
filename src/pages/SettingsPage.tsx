import type { JSX } from 'react'
import { AccountSummary, DataSection, PasswordSection, ResetSection } from '../components/SettingsAccount'
import { AppearanceSection, PartnerSection, ScanningSection } from '../components/SettingsDevice'
import { AccountSettings } from '../components/SettingsValues'

/** Snelknoppen naar de secties (in dezelfde volgorde als op de pagina). */
const JUMPS: [string, string][] = [
  ['settings-appearance', 'Appearance'],
  ['settings-partner', 'Partner'],
  ['settings-scanning', 'Scanning'],
  ['settings-cards', 'Cards and values'],
  ['settings-data', 'Data'],
  ['settings-password', 'Password'],
  ['settings-reset', 'Reset'],
]

/**
 * Settings (21-10-2026, op verzoek opnieuw ingedeeld): bovenaan wie er is ingelogd, de versie en "Check for updates";
 * dan snelknoppen; daarna van uiterlijk naar account: Appearance, Partner, Scanning, kaarten en waarde, Data, Password,
 * en onderaan Reset.
 */
export function SettingsPage(): JSX.Element {
  function jump(id: string): void {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }

  return (
    <section className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Changes are saved straight away: some on this device, some in your account.</p>
        </div>
      </div>
      <AccountSummary />
      <nav className="settings-jump" aria-label="Settings sections">
        {JUMPS.map(([id, label]) => (
          <button key={id} type="button" className="chip settings-jump-chip" onClick={() => jump(id)}>
            {label}
          </button>
        ))}
      </nav>
      <AppearanceSection />
      <PartnerSection />
      <ScanningSection />
      <AccountSettings />
      <DataSection />
      <PasswordSection />
      <ResetSection />
    </section>
  )
}
