import { useEffect, useState, type JSX } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { useHashRoute } from './hooks/useHashRoute'
import { DashboardPage } from './pages/DashboardPage'
import { CollectionPage } from './pages/CollectionPage'
import { ImportPage } from './pages/ImportPage'
import { ScanPage } from './pages/ScanPage'
import { SetBinderPage } from './pages/SetBinderPage'
import { SetsPage } from './pages/SetsPage'
import { supabase } from './lib/supabase'
import './App.css'

const ROUTES = ['overzicht', 'collectie', 'scan', 'sets', 'import'] as const
type Route = (typeof ROUTES)[number]

const NAV: { route: Route; label: string }[] = [
  { route: 'overzicht', label: 'Overzicht' },
  { route: 'collectie', label: 'Collectie' },
  { route: 'scan', label: 'Scannen' },
  { route: 'sets', label: 'Sets' },
  { route: 'import', label: 'Import' },
]

function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const { route, param } = useHashRoute(ROUTES, 'overzicht')

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.error('Sessie ophalen mislukt', error)
        setSession(data.session)
      })
      .finally(() => setLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Uitloggen mislukt', error)
  }

  if (loading) return <p className="center">Laden…</p>
  if (!session) return <Login />

  return (
    <>
      <header className="topbar">
        <span className="brand">Kaartenmap</span>
        <nav className="tabs" aria-label="Hoofdmenu">
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} aria-current={route === n.route ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <button type="button" className="ghost" onClick={signOut}>
          Uitloggen
        </button>
      </header>
      <main>
        {route === 'overzicht' && <DashboardPage />}
        {route === 'collectie' && <CollectionPage />}
        {route === 'scan' && <ScanPage />}
        {route === 'sets' && (param ? <SetBinderPage key={param} param={param} /> : <SetsPage />)}
        {route === 'import' && <ImportPage />}
      </main>
    </>
  )
}

export default App
