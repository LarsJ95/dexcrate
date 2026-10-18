import type { JSX, ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

/** Eenvoudige lijn-iconen (24×24, 1,8 px), decoratief: altijd met zichtbare tekst of aria-label op de knop. */
function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Svg>
)

export const IconCards = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="7" y="3" width="13" height="17" rx="2" />
    <path d="M4 7v12a2 2 0 0 0 2 2h9" />
  </Svg>
)

export const IconCamera = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)

export const IconLayers = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
)

export const IconUpload = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 15V4M7 9l5-5 5 5" />
    <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </Svg>
)

export const IconLogout = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Svg>
)

export const IconSun = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
)

export const IconMoon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </Svg>
)

export const IconSearch = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)

export const IconPlus = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconClose = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconCheck = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const IconArrowUp = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
)

export const IconArrowDown = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
)

export const IconMinus = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const IconArrowLeft = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const IconArrowRight = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const IconImage = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m20.5 16-5-5-8 8.5" />
  </Svg>
)

export const IconReceipt = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
)

export const IconStar = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Svg>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
)

export const IconArchive = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="17" height="4.5" rx="1" />
    <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4" />
  </Svg>
)

export const IconBinder = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M9 3.5v17M12 8h4M12 11.5h4" />
  </Svg>
)

export const IconEdit = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
)

export const IconTag = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" />
    <circle cx="8.5" cy="8.5" r="1.5" />
  </Svg>
)

export const IconMore = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

/** Logo (18-10-2026): gele kaart met een D en een holo-glinster; zelfde vorm als public/favicon.svg. */
export function LogoMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="logo-mark">
      <g transform="rotate(-8 32 32)">
        <rect x="12" y="4" width="40" height="56" rx="6" fill="var(--logo-card)" stroke="var(--logo-ink)" strokeWidth="3.5" />
        <path d="M22 17h9.5c8.5 0 13.5 5.6 13.5 15s-5 15-13.5 15H22z" fill="var(--logo-ink)" />
        <path d="M28.5 23.5h2.8c4.4 0 6.7 3 6.7 8.5s-2.3 8.5-6.7 8.5h-2.8z" fill="var(--logo-card)" />
      </g>
      <path
        d="M52 3l2 5.2 5.2 2-5.2 2-2 5.2-2-5.2-5.2-2 5.2-2z"
        fill="var(--logo-spark)"
        stroke="var(--logo-ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Gestileerde vangbal op de getekende kaartvoorkant (was tot 18-10-2026 ook het logo). */
export function BallMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <circle cx="16" cy="16" r="14" fill="var(--logo-top)" />
      <path d="M2 16a14 14 0 0 0 28 0z" fill="var(--logo-bottom)" />
      <path d="M2 16h28" stroke="var(--logo-band)" strokeWidth="3" />
      <circle cx="16" cy="16" r="5" fill="var(--logo-bottom)" stroke="var(--logo-band)" strokeWidth="3" />
    </svg>
  )
}

/** Krat met munt: de Crate-game. */
export const IconCrate = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z" />
    <path d="M3.5 8.5 12 13l8.5-4.5M12 13v8" />
  </Svg>
)
