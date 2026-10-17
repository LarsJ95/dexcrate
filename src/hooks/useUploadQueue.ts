import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../lib/errors'

export interface QueueItem {
  key: string
  file: Blob
  /** Bestandsnaam; null bij een camerafoto. */
  name: string | null
  state: 'uploading' | 'error'
  error?: string
}

export interface UploadQueue {
  queue: QueueItem[]
  /** Bestanden na elkaar uploaden. */
  add: (files: readonly Blob[], names: readonly (string | null)[]) => Promise<void>
  retry: (item: QueueItem) => Promise<void>
  dismiss: (key: string) => void
}

/** Uploadwachtrij met status per bestand; mislukte uploads blijven staan met "opnieuw proberen". */
export function useUploadQueue(upload: (file: Blob, name: string | null) => Promise<void>): UploadQueue {
  const [queue, setQueue] = useState<QueueItem[]>([])
  // Steeds de nieuwste uploadfunctie gebruiken (die kan per render veranderen).
  const uploadRef = useRef(upload)
  useEffect(() => {
    uploadRef.current = upload
  }, [upload])

  const run = useCallback(async (item: QueueItem): Promise<void> => {
    setQueue((q) => [...q.filter((i) => i.key !== item.key), { ...item, state: 'uploading', error: undefined }])
    try {
      await uploadRef.current(item.file, item.name)
      setQueue((q) => q.filter((i) => i.key !== item.key))
    } catch (err) {
      const message = errorText(err, 'Uploading the photo failed.')
      setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, state: 'error', error: message } : i)))
    }
  }, [])

  const add = useCallback(
    async (files: readonly Blob[], names: readonly (string | null)[]): Promise<void> => {
      const items: QueueItem[] = files.map((file, i) => ({ key: crypto.randomUUID(), file, name: names[i] ?? null, state: 'uploading' }))
      setQueue((q) => [...q, ...items])
      for (const item of items) await run(item)
    },
    [run],
  )

  const dismiss = useCallback((key: string): void => setQueue((q) => q.filter((i) => i.key !== key)), [])

  return { queue, add, retry: run, dismiss }
}
