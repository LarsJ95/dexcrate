import { useEffect, useState } from 'react'

export interface HashRoute<R extends string> {
  route: R
  /** Rest van het pad na de route, bv. "en/sv03.5" bij #/sets/en/sv03.5. */
  param: string
}

function readHash<R extends string>(routes: readonly R[], fallback: R): HashRoute<R> {
  const path = window.location.hash.replace(/^#\/?/, '')
  const slash = path.indexOf('/')
  const head = slash < 0 ? path : path.slice(0, slash)
  const param = slash < 0 ? '' : path.slice(slash + 1)
  return (routes as readonly string[]).includes(head) ? { route: head as R, param } : { route: fallback, param: '' }
}

/** Eenvoudige hash-routing (#/sets/en/sv03.5), zodat terug-knop en bladwijzers werken zonder router-dependency. */
export function useHashRoute<R extends string>(routes: readonly R[], fallback: R): HashRoute<R> {
  const [state, setState] = useState<HashRoute<R>>(() => readHash(routes, fallback))

  useEffect(() => {
    const onChange = (): void => setState(readHash(routes, fallback))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [routes, fallback])

  return state
}
