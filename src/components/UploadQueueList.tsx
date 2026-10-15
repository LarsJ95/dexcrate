import type { JSX } from 'react'
import type { UploadQueue } from '../hooks/useUploadQueue'
import { IconClose } from './Icons'

/** Lopende en mislukte uploads, met "opnieuw proberen" per bestand. */
export function UploadQueueList({ queue, retry, dismiss }: Pick<UploadQueue, 'queue' | 'retry' | 'dismiss'>): JSX.Element | null {
  if (queue.length === 0) return null
  return (
    <ul className="upload-queue" aria-live="polite">
      {queue.map((q) => (
        <li key={q.key} className={q.state === 'error' ? 'error' : undefined}>
          <span className="upload-name">{q.name ?? 'Camera photo'}</span>
          {q.state === 'uploading' ? (
            <span className="muted">Uploading…</span>
          ) : (
            <>
              <span>{q.error}</span>
              <button type="button" className="ghost small-btn" onClick={() => void retry(q)}>
                Try again
              </button>
              <button type="button" className="ghost icon-btn" aria-label="Dismiss" onClick={() => dismiss(q.key)}>
                <IconClose size={16} />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
