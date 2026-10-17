import type { KeyboardEvent } from 'react'

/** Enter of de zoekknop op het telefoontoetsenbord: zoeken loopt al live, dus alleen het toetsenbord sluiten. */
export function closeKeyboardOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  e.preventDefault()
  e.currentTarget.blur()
}
