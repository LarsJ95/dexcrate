import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initAppUpdates } from './lib/appUpdate'
import { initMotion } from './lib/motion'

initMotion()
initAppUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Vangnet als ook de schil (menu, achtergrond) crasht. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
