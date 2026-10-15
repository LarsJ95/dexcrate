import type { JSX, ReactNode } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { Route } from '../lib/routes'
import {
  IconCamera,
  IconCards,
  IconHome,
  IconLayers,
  IconLogout,
  IconMoon,
  IconSun,
  IconUpload,
  LogoMark,
} from './Icons'

const NAV: { route: Route; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { route: 'overview', label: 'Overview', Icon: IconHome },
  { route: 'collection', label: 'Collection', Icon: IconCards },
  { route: 'scan', label: 'Scan', Icon: IconCamera },
  { route: 'sets', label: 'Sets', Icon: IconLayers },
  { route: 'import', label: 'Import', Icon: IconUpload },
]

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
          {NAV.map(({ route: r, label, Icon }) => (
            <a key={r} href={`#/${r}`} aria-current={route === r ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="side-foot">
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
        <div className="side-actions">
          {themeButton}
          {logoutButton}
        </div>
      </header>

      <main className="main">{children}</main>

      <nav className="tab-bar" aria-label="Main menu">
        {NAV.map(({ route: r, label, Icon }) => (
          <a
            key={r}
            href={`#/${r}`}
            aria-current={route === r ? 'page' : undefined}
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
