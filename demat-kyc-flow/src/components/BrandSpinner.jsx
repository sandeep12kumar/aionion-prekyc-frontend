/**
 * AIONION mark as a loader — the two hands stay clasped and "shake" (a live
 * handshake) while the whole mark gently breathes with a blue glow. Reads as
 * "connecting…", and settles into a clasped handshake = verified.
 * Static (clasped, no motion) under prefers-reduced-motion.
 */
export default function BrandSpinner({ size = 40, className = '' }) {
  return (
    <svg
      viewBox="0 0 240 140"
      width={(size * 240) / 140}
      height={size}
      className={`brand-spinner ${className}`}
      role="status"
      aria-label="Verifying"
    >
      {/* infinity loops */}
      <path
        d="M120 70C120 40 100 24 64 24 26 24 6 46 6 70 6 94 26 116 64 116 100 116 120 100 120 70Z"
        fill="#0023FF"
      />
      <path
        d="M120 70C120 40 140 24 176 24 214 24 234 46 234 70 234 94 214 116 176 116 140 116 120 100 120 70Z"
        fill="#FE667C"
      />
      {/* white eyes */}
      <ellipse cx="55" cy="70" rx="23" ry="20" fill="#ffffff" />
      <ellipse cx="185" cy="70" rx="23" ry="20" fill="#ffffff" />

      <g transform="translate(119,71)" strokeLinecap="round" strokeLinejoin="round">
        {/* static white gap between the loops */}
        <ellipse cx="0" cy="2" rx="23" ry="18" fill="#ffffff" />

        {/* clasped handshake — shakes as a unit */}
        <g className="bs-hands">
          <path d="M-48 34 L-4 6" stroke="#0023FF" strokeWidth="19" fill="none" />
          <path d="M-48 34 L-5 7" stroke="#ffffff" strokeWidth="11" fill="none" />
          <path d="M-52 38 L-34 26" stroke="#FE667C" strokeWidth="19" fill="none" />
          <path d="M48 -32 L4 2" stroke="#FE667C" strokeWidth="19" fill="none" />
          <path d="M48 -32 L5 1" stroke="#ffffff" strokeWidth="11" fill="none" />
          <circle cx="0" cy="2" r="12" fill="#0023FF" />
        </g>
      </g>
    </svg>
  )
}
