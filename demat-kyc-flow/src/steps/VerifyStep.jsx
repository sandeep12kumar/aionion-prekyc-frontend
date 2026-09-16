import { useState } from 'react'
import CredentialVerifier from '../components/CredentialVerifier.jsx'
import { ArrowRightIcon, ShieldIcon } from '../components/icons.jsx'

export default function VerifyStep({ applicationId, mobile, email, mobileVerified, emailVerified, onNext }) {
  const [mobileOk, setMobileOk] = useState(Boolean(mobileVerified))
  const [emailOk, setEmailOk] = useState(Boolean(emailVerified))
  const count = (mobileOk ? 1 : 0) + (emailOk ? 1 : 0)
  const bothOk = count === 2

  return (
    <div className="animate-step">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bright/12 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-brand-blue ring-1 ring-brand-blue/45">
          <ShieldIcon className="h-3 w-3" />
          Step 1 · Two-factor
        </span>
        <span className="text-[0.68rem] font-semibold text-ink-muted">
          <span className={bothOk ? 'text-good' : 'text-brand-blue'}>{count}</span>/2 verified
        </span>
      </div>

      <h1 className="mt-2.5 font-display text-[1.4rem] font-bold leading-tight tracking-tight text-ink">
        Confirm it&apos;s you
      </h1>
      <p className="mt-1 text-[0.8rem] leading-snug text-ink-muted">
        Your RM registered these — just verify each with a one-time password.
      </p>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
        <div
          className="h-full rounded-full bg-brand-blue transition-all duration-500"
          style={{ width: `${count * 50}%` }}
        />
      </div>

      <div className="mt-3 space-y-2">
        <CredentialVerifier
          applicationId={applicationId}
          channel="mobile"
          value={mobile}
          alreadyVerified={mobileVerified}
          onVerified={() => setMobileOk(true)}
        />
        <CredentialVerifier
          applicationId={applicationId}
          channel="email"
          value={email}
          alreadyVerified={emailVerified}
          onVerified={() => setEmailOk(true)}
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!bothOk}
        className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,opacity,background] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
      >
        {bothOk ? 'Continue to payment' : 'Verify both to continue'}
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}
