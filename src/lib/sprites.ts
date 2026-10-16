/** Gedeeld door de langsrenner en Pikachu die om een hoekje kijkt (DESIGN.md §9). */

/** Iets anders aan de gang (popup, formulier, verborgen tab, al een Pokémon in beeld): dan niet storen. */
export function busy(): boolean {
  if (document.hidden) return true
  if (document.querySelector('dialog[open], .sheet[open], .runner, .peek')) return true
  const a = document.activeElement
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement
}

export interface LoadedSprite {
  src: string
  width: number
  height: number
  animated: boolean
}

/** Eerste sprite die laadt (bewegend eerst), of null als geen enkele werkt. */
export function loadSprite(urls: readonly string[]): Promise<LoadedSprite | null> {
  return new Promise((resolve) => {
    const tryAt = (i: number): void => {
      if (i >= urls.length) return resolve(null)
      const img = new Image()
      img.onload = () => resolve({ src: urls[i], width: img.naturalWidth, height: img.naturalHeight, animated: urls[i].endsWith('.gif') })
      img.onerror = () => tryAt(i + 1)
      img.src = urls[i]
    }
    tryAt(0)
  })
}

let peekPreviewDelay: number | null = null

/** Alleen voor de ontwerppreview: Pikachu kijkt na zoveel ms om een hoekje. */
export function seedPeekForPreview(ms: number): void {
  peekPreviewDelay = ms
}

export function previewPeekDelay(): number | null {
  return peekPreviewDelay
}
