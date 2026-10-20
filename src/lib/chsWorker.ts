import { compactDataset, type ChsSet } from './chsData'

/**
 * Web Worker: Vereenvoudigd-Chinese catalogus downloaden (±27 MB) en omzetten, zodat de app niet hapert.
 * Meldt voortgang per ±0,5 MB.
 */

export type ChsWorkerMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'done'; sets: ChsSet[] }
  | { type: 'error'; message: string }

const PROGRESS_STEP = 512 * 1024

const post = (m: ChsWorkerMessage): void => self.postMessage(m)

async function readText(res: Response): Promise<string> {
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body?.getReader()
  if (!reader) return res.text()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let loaded = 0
  let reported = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.byteLength
    parts.push(decoder.decode(value, { stream: true }))
    if (loaded - reported >= PROGRESS_STEP) {
      reported = loaded
      post({ type: 'progress', loaded, total })
    }
  }
  parts.push(decoder.decode())
  post({ type: 'progress', loaded, total: Math.max(total, loaded) })
  return parts.join('')
}

async function run(url: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed (${res.status}).`)
    const sets = compactDataset(JSON.parse(await readText(res)))
    if (sets.length === 0) throw new Error('The catalog file has an unexpected format.')
    post({ type: 'done', sets })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Download failed.' })
  }
}

self.onmessage = (e: MessageEvent<unknown>) => {
  const url = typeof e.data === 'object' && e.data !== null ? (e.data as { url?: unknown }).url : null
  if (typeof url === 'string' && url.startsWith('https://')) void run(url)
  else post({ type: 'error', message: 'No catalog address.' })
}
