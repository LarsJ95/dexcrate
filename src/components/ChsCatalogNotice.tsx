import type { JSX } from 'react'
import { CHS_DOWNLOAD_MB, downloadChsCatalog, useChsCatalog } from '../lib/chsCatalog'

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toLocaleString('en-GB', { maximumFractionDigits: 0 })

/**
 * Bij Chinese kaarten zonder zekere match: de Vereenvoudigd-Chinese catalogus ophalen (één keer, op dit apparaat).
 * Op wifi gebeurt dat vanzelf (chsCatalog.wantChsCatalog); dan zie je hier alleen de voortgang.
 */
export function ChsCatalogNotice(): JSX.Element | null {
  const status = useChsCatalog()
  if (status.kind === 'loading' || status.kind === 'ready') return null
  if (status.kind === 'downloading') {
    return (
      <div className="notice chs-notice" role="status">
        <p>
          Getting the Chinese card catalog… {mb(status.loaded)} of {mb(status.total)} MB. Your scans are matched again when it is ready.
        </p>
        <progress max={status.total} value={status.loaded} aria-label="Download progress" />
      </div>
    )
  }
  const start = (): void => {
    downloadChsCatalog().catch(() => undefined) // fout staat in de status
  }
  return (
    <div className="notice chs-notice">
      <p>
        {status.kind === 'error' ? `Download failed: ${status.message}` : `Simplified Chinese cards need the Chinese card catalog. It downloads once to this device (${CHS_DOWNLOAD_MB} MB, best on Wi-Fi).`}
      </p>
      <button type="button" className="primary" onClick={start}>
        {status.kind === 'error' ? 'Try again' : 'Get Chinese catalog'}
      </button>
    </div>
  )
}
