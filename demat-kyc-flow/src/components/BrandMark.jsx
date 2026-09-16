/**
 * AIONION Capital mark — two-tone lemniscate (blue + coral) with two hands
 * clasped in a handshake bridging the loops. Floating background shape.
 *
 * For a pixel-exact mark, drop the logo mark art at /public/aionion-mark.png
 * and swap this component's <svg> for <img src="/aionion-mark.png" />.
 */
export default function BrandMark({ className = '', style }) {
  return (
    <svg
      viewBox="0 0 240 140"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {/* infinity loops (lemniscate halves, pinched at centre) */}
      <path
        d="M120 70 C120 40 100 24 64 24 C26 24 6 46 6 70 C6 94 26 116 64 116 C100 116 120 100 120 70 Z"
        fill="#0023FF"
      />
      <path
        d="M120 70 C120 40 140 24 176 24 C214 24 234 46 234 70 C234 94 214 116 176 116 C140 116 120 100 120 70 Z"
        fill="#FE667C"
      />
      {/* white eyes, teardrop toward centre */}
      <path
        d="M96 70 C88 85 73 92 55 92 C39 92 28 82 28 70 C28 58 39 48 55 48 C73 48 88 55 96 70 Z"
        fill="#ffffff"
      />
      <path
        d="M144 70 C152 85 167 92 185 92 C201 92 212 82 212 70 C212 58 201 48 185 48 C167 48 152 55 144 70 Z"
        fill="#ffffff"
      />

      {/* clasped handshake over the crossover */}
      <g transform="translate(119,71)" strokeLinecap="round" strokeLinejoin="round">
        {/* white halo */}
        <path
          d="M-48 35 C-30 20 -14 10 0 3 C14 -5 30 -18 49 -33"
          stroke="#ffffff"
          strokeWidth="34"
          fill="none"
        />
        {/* lower-left forearm */}
        <path d="M-48 35 L-8 8" stroke="#0023FF" strokeWidth="22" />
        <path d="M-48 35 L-9 9" stroke="#ffffff" strokeWidth="13" />
        {/* coral cuff */}
        <path d="M-51 39 L-33 26" stroke="#FE667C" strokeWidth="22" />
        {/* upper-right forearm */}
        <path d="M49 -33 L9 -4" stroke="#0023FF" strokeWidth="22" />
        <path d="M49 -33 L9 -3" stroke="#ffffff" strokeWidth="13" />
        {/* clasp */}
        <ellipse
          cx="0"
          cy="2"
          rx="18"
          ry="15"
          transform="rotate(-32)"
          fill="#ffffff"
          stroke="#0023FF"
          strokeWidth="3.5"
        />
        {/* fingers curling over the grip */}
        <path
          d="M-11 -9 q5 -7 11 -3 M-5 -12 q5 -7 11 -3 M1 -14 q5 -6 11 -2"
          stroke="#0023FF"
          strokeWidth="3"
          fill="none"
        />
        {/* thumb */}
        <path d="M-13 1 q-6 6 -2 13" stroke="#0023FF" strokeWidth="3.5" fill="none" />
      </g>
    </svg>
  )
}
