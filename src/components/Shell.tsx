import type { JSX, ReactNode } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { Route } from '../lib/routes'
import { IconLogout, IconMoon, IconSun, LogoMark } from './Icons'
import { Moments } from './Moments'
import { PartnerBuddy } from './PartnerBuddy'
import { Peek } from './Peek'
import { Runner } from './Runner'
import { SIDE_GROUPS, TAB_NAV, isActiveTab } from './nav'

interface Props {
  route: Route
  email: string | null
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
  children: ReactNode
}

/** App-schil: zijbalk op desktop; op mobiel een topbalk en een onderbalk met centrale scanknop. */
export function Shell({ route, email, theme, onToggleTheme, onSignOut, children }: Props): JSX.Element {
  const themeLabel = theme === 'dark' ? 'Light theme' : 'Dark theme'
  const themeButton = (
    <button type="button" className="ghost icon-btn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
  const logoutButton = (
    <button type="button" className="ghost icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
      <IconLogout />
    </button>
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/overview">
          <LogoMark />
          <span>Dexcrate</span>
        </a>
        <nav className="side-nav" aria-label="Main menu">
          {SIDE_GROUPS.map((group, i) => (
            <div key={i} className="side-group">
              {group.map(({ route: r, label, Icon }) => (
                <a key={r} href={`#/${r}`} aria-current={route === r ? 'page' : undefined}>
                  <Icon />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <PartnerBuddy />
          {email && (
            <p className="side-user" title={email}>
              {email}
            </p>
          )}
          <div className="side-actions">
            {themeButton}
            {logoutButton}
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <a className="brand" href="#/overview">
          <LogoMark size={24} />
          <span>Dexcrate</span>
        </a>
        <PartnerBuddy compact />
        <div className="side-actions">
          {themeButton}
          {logoutButton}
        </div>
      </header>

      <main className="main">{children}</main>
      <Moments />
      <Runner paused={route === 'scan'} />
      <Peek paused={route === 'scan'} />

      <nav className="tab-bar" aria-label="Main menu">
        {TAB_NAV.map(({ route: r, label, Icon }) => (
          <a
            key={r}
            href={`#/${r}`}
            aria-current={isActiveTab(r, route) ? 'page' : undefined}
            className={r === 'scan' ? 'tab-scan' : undefined}
          >
            <span className="tab-icon">
              <Icon size={r === 'scan' ? 24 : 20} />
            </span>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
