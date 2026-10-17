import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Heeft het toestel internet? (volgens de browser; true als dat onbekend is) */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine !== false)
}
