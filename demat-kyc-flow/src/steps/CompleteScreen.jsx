import { CheckIcon } from '../components/icons.jsx'
import { gstBreakdown, money } from '../data/phase1.js'

function Done({ children }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-good/30 bg-good/[0.1] px-3.5 py-2.5 text-sm text-ink">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-good/20 text-good ring-1 ring-good/40">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      {children}
    </li>
  )
}

export default function CompleteScreen({ data, scheme, onRestart }) {
  const g = gstBreakdown(scheme.opening, data.placeOfSupply)
  return (
    <div className="animate-step flex flex-col items-center text-center">
      <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-brand-bright/15 text-brand-blue ring-1 ring-brand-bright/40">
        <CheckIcon className="h-9 w-9" animate />
      </div>

      <h1 className="mt-6 font-display text-[1.9rem] font-bold tracking-tight text-ink">
        Application submitted
      </h1>
      <p className="mt-2.5 max-w-sm text-[0.92rem] leading-relaxed text-ink-muted">
        Everything from your side is done. AIONION Capital will open your trading
        and demat account and email the credentials.
      </p>

      <div className="mt-5 w-full rounded-xl panel px-4 py-3 text-left">
        <div className="text-[0.64rem] uppercase tracking-wide text-ink-faint">
          Application reference
        </div>
        <div className="font-display text-lg font-bold tracking-wide text-ink">
          {data.applicationId}
        </div>
      </div>

      <ul className="mt-5 w-full space-y-2 text-left">
        <Done>Mobile &amp; email verified (2FA)</Done>
        <Done>Payment received — ₹{money(g.total)} ({scheme.label})</Done>
        <Done>Video IPV recorded with location</Done>
        <Done>All 4 documents eSigned via Setu</Done>
      </ul>

      <p className="mt-5 text-xs text-ink-muted">
        Account credentials are sent to{' '}
        <span className="font-semibold text-ink">{data.email}</span> within 24 working
        hours.
      </p>

      <button
        type="button"
        onClick={onRestart}
        className="mt-6 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
      >
        Start over (demo)
      </button>
    </div>
  )
}
