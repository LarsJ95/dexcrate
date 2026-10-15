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

export const IconMore = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

/** Logo: gestileerde vangbal, bewust geen kopie van het officiële logo. */
export function LogoMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="logo-mark">
      <circle cx="16" cy="16" r="14" fill="var(--logo-top)" />
      <path d="M2 16a14 14 0 0 0 28 0z" fill="var(--logo-bottom)" />
      <path d="M2 16h28" stroke="var(--logo-band)" strokeWidth="3" />
      <circle cx="16" cy="16" r="5" fill="var(--logo-bottom)" stroke="var(--logo-band)" strokeWidth="3" />
    </svg>
  )
}
