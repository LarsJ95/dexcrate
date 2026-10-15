import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { LANGUAGE_LABELS, type CardLanguage, type Variant } from './types'

/** Resultaat van de Edge Function recognize-card (zie supabase/functions/recognize-card). */
export interface Recognition {
  isCard: boolean
  namePrinted: string
  nameEnglish: string
  language: CardLanguage | null
  setCode: string
  cardNumber: string
  setTotal: string
  variant: Variant | null
  confidence: 'high' | 'medium' | 'low'
  notes: string
  model: string
}

export interface PreparedImage {
  data: string
  mediaType: 'image/jpeg'
  previewUrl: string
}

/** Groot genoeg om kleine tekst te lezen, klein genoeg voor lage kosten (±1.100 beeldtokens). */
const MAX_EDGE = 1200

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Foto lezen mislukt.'))
    reader.readAsDataURL(blob)
  })
}

/** Verkleint en comprimeert de foto in de browser (respecteert EXIF-rotatie). */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Kies een foto.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Foto verwerken wordt niet ondersteund in deze browser.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto comprimeren mislukt.'))), 'image/jpeg', 0.85),
  )
  return { data: await blobToBase64(blob), mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function toRecognition(body: unknown): Recognition {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const r = typeof b.result === 'object' && b.result !== null ? (b.result as Record<string, unknown>) : null
  if (!r || typeof r.is_card !== 'boolean') throw new Error('Onverwacht antwoord van de herkenning.')
  const lang = str(r.language)
  const variant = str(r.variant)
  const confidence = str(r.confidence)
  return {
    isCard: r.is_card,
    namePrinted: str(r.name_printed),
    nameEnglish: str(r.name_english),
    language: lang in LANGUAGE_LABELS ? (lang as CardLanguage) : null,
    setCode: str(r.set_code),
    cardNumber: str(r.card_number),
    setTotal: str(r.set_total),
    variant: variant === 'normal' || variant === 'holo' || variant === 'reverse' ? variant : null,
    confidence: confidence === 'high' || confidence === 'medium' ? confidence : 'low',
    notes: str(r.notes),
    model: str(b.model),
  }
}

export async function recognizeCard(img: PreparedImage): Promise<Recognition> {
  const { data, error } = await supabase.functions.invoke('recognize-card', {
    body: { data: img.data, media_type: img.mediaType },
  })
  if (error) {
    // Foutmelding van de functie zelf tonen als die er is.
    const ctx: unknown = error instanceof FunctionsHttpError ? error.context : null
    if (ctx instanceof Response) {
      const body: unknown = await ctx.json().catch(() => null)
      const msg = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null
      if (typeof msg === 'string') throw new Error(msg)
    }
    throw new Error('Herkenning niet bereikbaar. Is de functie recognize-card geïnstalleerd?')
  }
  return toRecognition(data)
}
