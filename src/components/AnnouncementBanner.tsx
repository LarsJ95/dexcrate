import { useEffect, useState, type JSX } from 'react'
import { dismiss, getAnnouncement, isDismissed, type Announcement } from '../lib/announcements'
import { IconClose } from './Icons'

const REFRESH_MS = 10 * 60 * 1000

/** Mededeling van de beheerder bovenaan de pagina (STAP22); wegklikken onthoudt deze ene mededeling. */
export function AnnouncementBanner(): JSX.Element | null {
  const [item, setItem] = useState<Announcement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      getAnnouncement()
        .then((a) => {
          if (!cancelled) setItem(a && !isDismissed(a.id) ? a : null)
        })
        .catch((err: unknown) => console.warn('Mededeling ophalen mislukt', err))
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!item) return null
  return (
    <div className={`notice-dismissable announcement is-${item.level}`}>
      <p className="notice" role="status">
        {item.message}
      </p>
      <button
        type="button"
        className="ghost icon-btn notice-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => {
          dismiss(item.id)
          setItem(null)
        }}
      >
        <IconClose />
      </button>
    </div>
  )
}
