import { useEffect, useState, type JSX } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { Shell } from './components/Shell'
import { ROUTES } from './lib/routes'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme } from './hooks/useTheme'
import { BackupPage } from './pages/BackupPage'
import { CollectionPage } from './pages/CollectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { ImportPage } from './pages/ImportPage'
import { MorePage } from './pages/MorePage'
import { PhotosPage } from './pages/PhotosPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { WishlistPage } from './pages/WishlistPage'
import { ScanPage } from './pages/ScanPage'
import { SetBinderPage } from './pages/SetBinderPage'
import { SetsPage } from './pages/SetsPage'
import { supabase } from './lib/supabase'
import './App.css'

function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const { route, param } = useHashRoute(ROUTES, 'overview')
  const { theme, toggle } = useTheme()

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

  // Nieuwe pagina: bovenaan beginnen.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route, param])

  async function signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Uitloggen mislukt', error)
  }

  if (loading) return <p className="center">Loading…</p>
  if (!session) return <Login />

  return (
    <Shell route={route} email={session.user.email ?? null} theme={theme} onToggleTheme={toggle} onSignOut={() => void signOut()}>
      {route === 'overview' && <DashboardPage />}
      {route === 'collection' && <CollectionPage />}
      {route === 'scan' && <ScanPage />}
      {route === 'sets' && (param ? <SetBinderPage key={param} param={param} /> : <SetsPage />)}
      {route === 'wishlist' && <WishlistPage />}
      {route === 'transactions' && <TransactionsPage />}
      {route === 'photos' && <PhotosPage />}
      {route === 'import' && <ImportPage />}
      {route === 'backup' && <BackupPage />}
      {route === 'settings' && <SettingsPage />}
      {route === 'more' && <MorePage />}
    </Shell>
  )
}

export default App
