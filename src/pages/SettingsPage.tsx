import type { JSX } from 'react'
import { AccountSection, ResetSection } from '../components/SettingsAccount'
import { AppearanceSection, PartnerSection, ScanningSection } from '../components/SettingsDevice'
import { AccountSettings } from '../components/SettingsValues'

export function SettingsPage(): JSX.Element {
  return (
    <section className="page settings">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Changes are saved straight away: some on this device, some in your account.</p>
        </div>
      </div>
      <AppearanceSection />
      <PartnerSection />
      <ScanningSection />
      <AccountSettings />
      <AccountSection />
      <ResetSection />
    </section>
  )
}
