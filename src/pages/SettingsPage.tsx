import type { JSX } from 'react'
import { AccountGroup, AccountSummary, DataGroup } from '../components/SettingsAccount'
import { AppearanceGroup, ScanningGroup } from '../components/SettingsDevice'
import { AccountSettings } from '../components/SettingsValues'

/**
 * Settings (24-10-2026, op verzoek: "veel te uitgebreid, lange teksten"): één lijst zoals de instellingen op je
 * telefoon. Bovenaan wie er is ingelogd, de versie en uitloggen; dan Appearance, Scanning, New cards, Data en Account.
 * Zelden nodig (catalogus, cameracheck, waarden, wachtwoord, reset) zit achter een uitklapregel.
 */
export function SettingsPage(): JSX.Element {
  return (
    <section className="page settings">
      <h1>Settings</h1>
      <AccountSummary />
      <AppearanceGroup />
      <ScanningGroup />
      <AccountSettings />
      <DataGroup />
      <AccountGroup />
      <p className="muted small settings-foot">Appearance and scanning are saved on this device, the rest in your account. Changes save straight away.</p>
    </section>
  )
}
