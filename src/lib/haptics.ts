import { motionAllowed } from './motion'

/**
 * Korte tril bij momenten (vangen, badge, level-up). Alleen waar de browser het kan (Android Chrome;
 * Safari op iPhone ondersteunt het niet) en alleen als animaties aan staan.
 */
export function buzz(pattern: number | number[]): void {
  if (!motionAllowed() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Sommige browsers weigeren trillen zonder eerdere tik; dan gewoon niet.
  }
}
