import { useEffect, useState, type JSX } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { useHashRoute } from './hooks/useHashRoute'
import { ImportPage } from './pages/ImportPage'
import { ItemsPage } from './pages/ItemsPage'
import { supabase } from './lib/supabase'
import './App.css'

const ROUTES = ['verkoop', 'aankopen', 'import'] as const
type Route = (typeof ROUTES)[number]

const NAV: { route: Route; label: string }[] = [
  { route: 'verkoop', label: 'Verkoop' },
  { route: 'aankopen', label: 'Aankopen' },
  { route: 'import', label: 'Import' },
]

function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const route = useHashRoute(ROUTES, 'verkoop')

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
        {route === 'verkoop' && <ItemsPage key="sales" table="sales" />}
        {route === 'aankopen' && <ItemsPage key="purchases" table="purchases" />}
        {route === 'import' && <ImportPage />}
      </main>
    </>
  )
}

export default App
