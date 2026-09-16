const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function SunIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" />
    </svg>
  )
}

export function MoonIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M20 13.5A8 8 0 1 1 10.5 4 6.2 6.2 0 0 0 20 13.5z" />
    </svg>
  )
}

export function PhoneIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  )
}

export function MailIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.5 6 8.5 6 8.5-6" />
    </svg>
  )
}

export function CheckIcon({ className = 'h-5 w-5', animate = false }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base} strokeWidth="2.4">
      <path className={animate ? 'check-path' : undefined} d="M4 12.5l5 5L20 6.5" />
    </svg>
  )
}

export function ArrowLeftIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base} strokeWidth="1.8">
      <path d="M10 5l-7 7 7 7M3 12h18" />
    </svg>
  )
}

export function ArrowRightIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base} strokeWidth="1.8">
      <path d="M14 5l7 7-7 7M21 12H3" />
    </svg>
  )
}

export function LockIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 14.5v2" />
    </svg>
  )
}

export function BankIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4.5 9.5h15" />
      <path d="M6 12v6M10 12v6M14 12v6M18 12v6" />
      <path d="M3.5 20.5h17" />
    </svg>
  )
}

export function ShieldIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  )
}

export function CameraIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M4 8.5h3l1.5-2.5h7L18 8.5h2A1.5 1.5 0 0 1 21.5 10v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  )
}

export function LocationIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M12 21c4-4 7-7.5 7-11a7 7 0 1 0-14 0c0 3.5 3 7 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}

export function DocIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M6 2.5h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-18a1 1 0 0 1 1-1z" />
      <path d="M14 2.5v4h4" />
      <path d="M8.5 12.5h7M8.5 16h7M8.5 9h3" />
    </svg>
  )
}

export function PenIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <path d="M15.5 5.5l3 3M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19z" />
    </svg>
  )
}

export function InfoIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}
