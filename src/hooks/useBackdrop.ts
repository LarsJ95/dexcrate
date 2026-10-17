import { useEffect, useState } from 'react'
import { backdropForDay, energyMixTile, type Backdrop } from '../lib/backdrop'

/**
 * Achtergrond van vandaag: zet data-backdrop op <html> (de CSS doet de rest) en wisselt na middernacht.
 * Zet ook de tegel voor de energie-mix, in de kleuren van de tokens --energy-*.
 */
export function useBackdrop(): Backdrop {
  const [backdrop, setBackdrop] = useState<Backdrop>(() => backdropForDay(new Date()))

  useEffect(() => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    root.style.setProperty('--energy-mix', energyMixTile((type) => style.getPropertyValue(`--energy-${type.toLowerCase()}`)))
    // Elke minuut kijken of het een nieuwe dag is (ook na het wakker worden van de telefoon).
    const timer = window.setInterval(() => setBackdrop(backdropForDay(new Date())), 60_000)
    return () => {
      window.clearInterval(timer)
      root.style.removeProperty('--energy-mix')
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.backdrop = backdrop
  }, [backdrop])

  return backdrop
}
