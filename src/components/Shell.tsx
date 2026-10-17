import { useEffect, type JSX, type ReactNode } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { Route } from '../lib/routes'
import { IconLogout, IconMoon, IconSun, LogoMark } from './Icons'
import { Moments } from './Moments'
import { PartnerBuddy } from './PartnerBuddy'
import { Peek } from './Peek'
import { Runner } from './Runner'
import { Sky } from './Sky'
import { usePrefs } from '../lib/devicePrefs'
import { SIDE_GROUPS, TAB_NAV, isActiveTab } from './nav'
import { useOnline } from '../hooks/useOnline'
import { useOfflineDataTime } from '../lib/offlineCache'

interface Props {
  route: Route
  email: string | null
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
  children: ReactNode
}

/** "14:32" voor vandaag, anders "16 Oct, 14:32". */
function savedTimeText(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

/** App-schil: zijbalk op desktop; op mobiel een topbalk en een onderbalk met centrale scanknop. */
export function Shell({ route, email, theme, onToggleTheme, onSignOut, children }: Props): JSX.Element {
  const prefs = usePrefs()
  const online = useOnline()
  const savedAt = useOfflineDataTime()
  // Energiebehang aan/uit (Settings → Appearance); de CSS kijkt naar data-wallpaper op <html>.
  useEffect(() => {
    document.documentElement.dataset.wallpaper = prefs.wallpaper ? 'on' : 'off'
  }, [prefs.wallpaper])
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
      {prefs.sky && <Sky theme={theme} />}
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

      <main className="main">
        {(!online || savedAt !== null) && (
          <p className="notice offline-notice" role="status">
            {online ? 'No connection to the server. ' : 'You’re offline. '}
            {savedAt !== null && `Showing data saved on this device (${savedTimeText(savedAt)}). `}
            Changes need a connection; Quick scan photos are kept and recognised once you’re back online.
          </p>
        )}
        {children}
      </main>
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
