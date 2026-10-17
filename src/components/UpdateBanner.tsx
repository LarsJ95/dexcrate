import type { JSX } from 'react'
import { useUpdateNotice } from '../lib/appUpdate'

/** Korte melding bij een app-update: vlak vóór het verversen en kort erna. */
export function UpdateBanner(): JSX.Element | null {
  const notice = useUpdateNotice()
  if (!notice) return null
  return (
    <p className="update-banner" role="status">
      {notice === 'updating' ? 'Updating to the latest version…' : 'Updated to the latest version'}
    </p>
  )
}
