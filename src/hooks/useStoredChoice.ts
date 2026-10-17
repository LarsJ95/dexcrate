import { useCallback, useState } from 'react'

/**
 * Een keuze (bv. sortering) per apparaat onthouden. Alleen waarden uit `allowed` worden teruggelezen;
 * zonder opslag (privévenster) werkt het gewoon, alleen zonder onthouden.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return allowed.find((a) => a === raw) ?? fallback
    } catch {
      return fallback // geen opslag: standaardkeuze
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, next)
      } catch (err) {
        console.warn('Keuze onthouden mislukt', err)
      }
    },
    [key],
  )
  return [value, set]
}
