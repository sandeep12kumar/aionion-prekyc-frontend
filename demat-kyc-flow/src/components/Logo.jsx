import { useState } from 'react'

/**
 * AIONION Capital logo. Uses the brand asset at /public/aionion-logo.png.
 * The artwork is navy-on-transparent, so on the dark UI it sits on a frosted
 * light plate for contrast. Replace the PNG to update it everywhere.
 */
export default function Logo({ className = '' }) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={`logo-breathe inline-flex items-center justify-center rounded-2xl border border-white/60 bg-white px-6 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_0_0_0_1px_rgba(255,255,255,0.5),0_24px_52px_-18px_rgba(4,4,20,0.6)] ${className}`}
    >
      {!failed ? (
        <img
          src="/aionion-logo.png"
          alt="AIONION Capital — Research | Trust | Forever"
          className="h-[68px] w-auto max-w-[320px] object-contain"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 140 70" className="h-10 w-auto" role="img" aria-label="AIONION Capital">
            <g fill="none" strokeWidth="13" strokeLinecap="round">
              <circle cx="42" cy="38" r="24" stroke="#1f27e6" />
              <circle cx="92" cy="38" r="24" stroke="#fb6d7d" />
            </g>
            <path d="M55 38 h24" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
          </svg>
          <div className="leading-none">
            <div className="font-display text-base font-extrabold tracking-tight text-[#1b2352]">
              AIONION
            </div>
            <div className="mt-0.5 text-[0.58rem] font-semibold tracking-[0.4em] text-[#f2586b]">
              CAPITAL
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
