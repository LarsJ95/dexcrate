// Eerst: het adres lezen voordat de Supabase-client het opruimt (mail-links, zie lib/authLink.ts).
import './lib/authLink'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateBanner } from './components/UpdateBanner'
import { initAppUpdates } from './lib/appUpdate'
import { initErrorLog } from './lib/errorLog'
import { initMotion } from './lib/motion'

initMotion()
initAppUpdates()
initErrorLog()

// Testomgeving (npm run dev:staging / build:staging): altijd zichtbaar, zodat je nooit twijfelt welke data je ziet.
const staging = import.meta.env.MODE === 'staging'
if (staging) document.title = `[TEST] ${document.title}`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Vangnet als ook de schil (menu, achtergrond) crasht. */}
    <ErrorBoundary>
      <App />
      <UpdateBanner />
      {staging && (
        <p className="env-badge" role="status">
          Test environment
        </p>
      )}
    </ErrorBoundary>
  </StrictMode>,
)
