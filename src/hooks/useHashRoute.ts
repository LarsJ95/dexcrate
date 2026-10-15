import { useEffect, useState } from 'react'

function readHash<R extends string>(routes: readonly R[], fallback: R): R {
  const h = window.location.hash.replace(/^#\/?/, '')
  return (routes as readonly string[]).includes(h) ? (h as R) : fallback
}

/** Eenvoudige hash-routing (#/verkoop), zodat terug-knop en bladwijzers werken zonder router-dependency. */
export function useHashRoute<R extends string>(routes: readonly R[], fallback: R): R {
  const [route, setRoute] = useState<R>(() => readHash(routes, fallback))

  useEffect(() => {
    const onChange = (): void => setRoute(readHash(routes, fallback))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [routes, fallback])

  return route
}
