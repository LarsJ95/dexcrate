import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Candidate } from './match'
import { supabase } from './supabase'
import { getSet, lookupLang, splitKey, type Lang } from './tcgdex'
import { plainNumber, toScanResult, type Recognition, type ScanMode, type ScanResult } from './scanResult'
import { statusFields, type CardInput } from './types'
import { fitVariant, variantFacts } from './variantChoice'

export { correctRecognition, plainNumber, scanQuery, type ReadFix, type Recognition, type ScanMode, type ScanResult } from './scanResult'

export interface PreparedImage {
  /** De (verkleinde) foto zelf, om eventueel als eigen kaartfoto te bewaren. */
  blob: Blob
  data: string
  mediaType: 'image/jpeg'
  previewUrl: string
}

/**
 * Groot genoeg om kleine tekst te lezen, klein genoeg voor lage kosten:
 * één kaart ±1.100 beeldtokens; een binderpagina (9 kaarten) heeft meer pixels nodig, ±3.900 tokens.
 */
const MAX_EDGE: Record<ScanMode, number> = { single: 1200, multi: 2000 }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'))
    reader.readAsDataURL(blob)
  })
}

/** Verkleint en comprimeert de foto in de browser (respecteert EXIF-rotatie). */
export async function prepareImage(file: File, mode: ScanMode): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE[mode] / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process photos.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not compress the photo.'))), 'image/jpeg', 0.85),
  )
  return { blob, data: await blobToBase64(blob), mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) }
}

/** Een eerder verkleinde foto (bv. uit de lokale opslag) weer klaarmaken voor herkenning. */
export async function preparedFromBlob(blob: Blob): Promise<PreparedImage> {
  return { blob, data: await blobToBase64(blob), mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) }
}

/**
 * Formuliervelden voor een gescande kaart; met gekozen kandidaat incl. koppeling en officiële setcode.
 * Komt de kandidaat uit een andere catalogustaal (bv. Traditioneel i.p.v. Vereenvoudigd Chinees), dan volgt de taal die.
 */
export async function draftFromScan(r: Recognition, c: Candidate | null, scanLang: Lang): Promise<Partial<CardInput>> {
  const base: Partial<CardInput> = {
    name: r.nameEnglish || r.namePrinted,
    language: r.language,
    variant: r.variant,
    ...statusFields('collection'),
    set_code: r.setCode || null,
    card_number: r.cardNumber ? plainNumber(r.cardNumber) : null,
    tcgdex_id: null,
  }
  if (!c) return base
  const lang = splitKey(c.key)?.lang ?? scanLang
  let setCode = c.setId
  try {
    setCode = (await getSet(lang, c.setId))?.summary.abbr ?? c.setId
  } catch (err) {
    console.error('Setinfo ophalen mislukt', err)
  }
  const language = lookupLang(r.language) === lang ? r.language : lang
  // Gelezen uitvoering alleen als die bij deze kaart bestaat (bv. ex-kaarten: alleen holo).
  const variant = fitVariant(r.variant, (await variantFacts(c.key)).variants)
  return { ...base, language, variant, tcgdex_id: c.key, set_code: setCode, card_number: plainNumber(c.localId) }
}

/** `strong`: "Look again", meteen met het sterkere (duurdere) model. */
export async function recognizeCards(img: PreparedImage, mode: ScanMode, { strong = false }: { strong?: boolean } = {}): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('recognize-card', {
    body: { data: img.data, media_type: img.mediaType, mode, ...(strong ? { strong: true } : {}) },
  })
  if (error) {
    // Foutmelding van de functie zelf tonen als die er is.
    const ctx: unknown = error instanceof FunctionsHttpError ? error.context : null
    if (ctx instanceof Response) {
      // 404 van Supabase zelf: de functie is (nog) niet gedeployd.
      if (ctx.status === 404) throw new Error('Scanning is not set up yet: the recognize-card function is missing in Supabase (see TODO.md, "Camera aanzetten").')
      const body: unknown = await ctx.json().catch(() => null)
      const msg = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null
      if (typeof msg === 'string') throw new Error(msg)
    }
    throw new Error('Recognition is unavailable. Is the recognize-card function installed?')
  }
  // Oude functie negeert `strong` en geeft gewoon het goedkope resultaat: dat niet als tweede blik tonen.
  if (strong && !confirmsStrong(data)) throw new Error(LOOK_AGAIN_OUTDATED)
  return toScanResult(data)
}

export const LOOK_AGAIN_OUTDATED = '“Look again” needs the latest recognize-card function. Redeploy it in Supabase (see TODO.md).'

/** Antwoord van een functie die "Look again" kent (meldt `strong: true` terug). */
export const confirmsStrong = (body: unknown): boolean => typeof body === 'object' && body !== null && (body as { strong?: unknown }).strong === true
