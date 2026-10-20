/** Kanteling en glanspositie van een holokaart (zie components/HoloCard). */
export interface HoloPose {
  rx: number
  ry: number
  mx: number
  my: number
}

/** Rustpositie op een touchscreen: recht, glans iets boven het midden (zoals de CSS-standaard). */
export const REST_POSE: Readonly<HoloPose> = { rx: 0, ry: 0, mx: 50, my: 42 }

/** Ligt de kaart (bijna) stil op het doel? Dan kan de animatie stoppen. */
export function settled(cur: HoloPose, target: HoloPose): boolean {
  return Math.abs(cur.rx - target.rx) < 0.05 && Math.abs(cur.ry - target.ry) < 0.05 && Math.abs(cur.mx - target.mx) < 0.1 && Math.abs(cur.my - target.my) < 0.1
}
