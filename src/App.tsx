import { useEffect, useState, type JSX } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { ImportPage } from './pages/ImportPage'
import { supabase } from './lib/supabase'
import './App.css'

function App(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

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
        <strong>Pokémon kaarten</strong>
        <button type="button" className="link" onClick={signOut}>
          Uitloggen
        </button>
      </header>
      <main>
        <ImportPage />
      </main>
    </>
  )
}

export default App
