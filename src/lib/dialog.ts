import type { SyntheticEvent } from 'react'

/**
 * Sluit-handler voor een <dialog>. React laat het "close"-event van een geneste dialoog (bv. de vergrote kaart
 * in een kaartvenster) doorlopen naar de dialogen eromheen; zonder deze controle sloot dan alles tegelijk.
 */
export function onOwnClose(fn: () => void): (e: SyntheticEvent<HTMLDialogElement>) => void {
  return (e) => {
    if (e.target === e.currentTarget) fn()
  }
}
