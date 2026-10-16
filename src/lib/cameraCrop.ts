export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Ruimte rond het kader die mee gaat, zodat een kaart die net buiten de lijn ligt niet wordt afgesneden. */
export const FRAME_MARGIN = 0.12

/**
 * Het camerakader op het scherm → het stuk van het camerabeeld (in videopixels).
 * De video vult het scherm met `object-fit: cover`: geschaald en in het midden bijgesneden.
 * `view` = waar de video op het scherm staat, `frame` = het kader op het scherm, `source` = videoresolutie.
 */
export function frameToSource(view: Box, frame: Box, source: { width: number; height: number }, margin = FRAME_MARGIN): Box {
  const scale = Math.max(view.width / source.width, view.height / source.height)
  const offsetX = (view.width - source.width * scale) / 2
  const offsetY = (view.height - source.height * scale) / 2
  const mx = frame.width * margin
  const my = frame.height * margin
  const left = (frame.x - view.x - mx - offsetX) / scale
  const top = (frame.y - view.y - my - offsetY) / scale
  const right = (frame.x - view.x + frame.width + mx - offsetX) / scale
  const bottom = (frame.y - view.y + frame.height + my - offsetY) / scale
  const x = Math.max(0, Math.round(left))
  const y = Math.max(0, Math.round(top))
  return {
    x,
    y,
    width: Math.min(source.width, Math.round(right)) - x,
    height: Math.min(source.height, Math.round(bottom)) - y,
  }
}
