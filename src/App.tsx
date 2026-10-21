import { lazy, Suspense, useEffect, useState, type JSX } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { ROUTES } from './lib/routes'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { clearOfflineCache } from './lib/offlineCache'
import './App.css'
import { Loading } from './components/Loading'
import { ErrorBoundary } from './components/ErrorBoundary'

// Alles na het inloggen pas laden als het nodig is: het inlogscherm (eerste bezoek) blijft klein.
const Shell = lazy(() => import('./components/Shell').then((m) => ({ default: m.Shell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const BackupPage = lazy(() => import('./pages/BackupPage').then((m) => ({ default: m.BackupPage })))
const CollectionPage = lazy(() => import('./pages/CollectionPage').then((m) => ({ default: m.CollectionPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const MorePage = lazy(() => import('./pages/MorePage').then((m) => ({ default: m.MorePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })))
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })))
const CratePage = lazy(() => import('./pages/CratePage').then((m) => ({ default: m.CratePage })))
const ScanPage = lazy(() => import('./pages/ScanPage').then((m) => ({ default: m.ScanPage })))
const SetBinderPage = lazy(() => import('./pages/SetBinderPage').then((m) => ({ default: m.SetBinderPage })))
const SetsPage = lazy(() => import('./pages/SetsPage').then((m) => ({ default: m.SetsPage })))

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
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Uitloggen: offline bewaarde gegevens van deze gebruiker horen niet op het apparaat te blijven staan.
      if (event === 'SIGNED_OUT') clearOfflineCache().catch((err: unknown) => console.warn('Offline cache wissen mislukt', err))
    })
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

  if (loading) return <Loading center />
  if (!session) return <Login />

  return (
    <Suspense fallback={<Loading center />}>
      <Shell route={route} email={session.user.email ?? null} theme={theme} onToggleTheme={toggle} onSignOut={() => void signOut()}>
        <ErrorBoundary resetKey={`${route}/${param ?? ''}`}>
          <Suspense fallback={<Loading />}>
            {route === 'overview' && <DashboardPage email={session.user.email ?? null} />}
            {route === 'collection' && <CollectionPage />}
            {route === 'scan' && <ScanPage />}
            {route === 'sets' && (param ? <SetBinderPage key={param} param={param} /> : <SetsPage />)}
            {route === 'wishlist' && <WishlistPage />}
            {route === 'crate' && <CratePage />}
            {route === 'transactions' && <TransactionsPage />}
            {route === 'import' && <ImportPage />}
            {route === 'backup' && <BackupPage />}
            {route === 'settings' && <SettingsPage />}
            {route === 'admin' && <AdminPage />}
            {route === 'more' && <MorePage />}
          </Suspense>
        </ErrorBoundary>
      </Shell>
    </Suspense>
  )
}

export default App
