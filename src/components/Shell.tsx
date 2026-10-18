import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { Route } from '../lib/routes'
import { IconLogout, IconMoon, IconSettings, IconSidebar, IconSun, LogoMark } from './Icons'
import { Moments } from './Moments'
import { PartnerBuddy } from './PartnerBuddy'
import { Peek } from './Peek'
import { Sky } from './Sky'
import { usePrefs } from '../lib/devicePrefs'
import { SETTINGS_ROUTES, TAB_NAV, isActiveTab, moreHasBadge } from './nav'
import { NavBadge, SideNav } from './SideNav'
import { useNavCounts } from '../hooks/useNavCounts'
import { useBackdrop } from '../hooks/useBackdrop'
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

const COLLAPSE_KEY = 'dexcrate:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
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
  // Achtergrond van de dag (donker thema); bij de sterrennacht tekent de hemel extra sterren.
  const backdrop = useBackdrop()
  const counts = useNavCounts(route)
  // Zijbalk inklappen tot alleen iconen (per apparaat onthouden).
  const [collapsed, setCollapsed] = useState(readCollapsed)
  function toggleCollapsed(): void {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch (err) {
        console.warn('Zijbalkstand onthouden mislukt', err)
      }
      return !c
    })
  }
  const collapseLabel = collapsed ? 'Expand menu' : 'Collapse menu'
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
    <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      {prefs.sky && <Sky theme={theme} night={theme === 'dark' && backdrop === 'night'} />}
      <aside className="sidebar">
        <a className="brand" href="#/overview">
          <LogoMark />
          <span>Dexcrate</span>
        </a>
        <SideNav route={route} counts={counts} collapsed={collapsed} />
        <div className="side-foot">
          {!collapsed && <PartnerBuddy />}
          {email && !collapsed && (
            <p className="side-user" title={email}>
              {email}
            </p>
          )}
          <div className="side-actions">
            <a
              className="icon-link"
              href="#/settings"
              aria-current={SETTINGS_ROUTES.includes(route) ? 'page' : undefined}
              aria-label="Settings, backup and import"
              title="Settings, backup and import"
            >
              <IconSettings />
            </a>
            {themeButton}
            {logoutButton}
            <button type="button" className="ghost icon-btn side-collapse" onClick={toggleCollapsed} aria-label={collapseLabel} title={collapseLabel} aria-pressed={collapsed}>
              <IconSidebar />
            </button>
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
              {r === 'collection' && <NavBadge kind="collection" counts={counts} />}
              {r === 'more' && moreHasBadge(counts) && (
                <span className="nav-dot">
                  <span className="visually-hidden">: something to do</span>
                </span>
              )}
            </span>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
