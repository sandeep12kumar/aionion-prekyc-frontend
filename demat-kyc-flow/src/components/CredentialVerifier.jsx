import { useState } from 'react'
import OtpInput from './OtpInput.jsx'
import { CheckIcon, LockIcon, PhoneIcon, MailIcon } from './icons.jsx'
import { sendOtp, verifyOtp } from '../lib/api.js'

/**
 * Verifies ownership of ONE locked credential (mobile or email) that the RM
 * captured — real OTP send/verify against the backend.
 * idle → sending → sent → verified
 */
export default function CredentialVerifier({ applicationId, channel, value, alreadyVerified, onVerified }) {
  const [state, setState] = useState(alreadyVerified ? 'verified' : 'idle')
  const [sendError, setSendError] = useState('')
  const isEmail = channel === 'email'
  const Icon = isEmail ? MailIcon : PhoneIcon
  const label = isEmail ? 'Email address' : 'Mobile number'
  const verified = state === 'verified'

  async function send() {
    setSendError('')
    setState('sending')
    try {
      await sendOtp(applicationId, isEmail ? 'email' : 'mobile')
      setState('sent')
    } catch (err) {
      setSendError(err.message)
      setState('idle')
    }
  }

  async function handleVerify(code) {
    await verifyOtp(applicationId, isEmail ? 'email' : 'mobile', code)
    setState('verified')
    onVerified?.()
  }

  return (
    <div
      className={[
        'rounded-xl border p-3 transition-colors',
        verified
          ? 'border-good/40 bg-good/[0.08]'
          : state === 'idle'
            ? 'border-[color:var(--panel-border)] fill'
            : 'border-brand-bright/35 bg-brand-bright/[0.06]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-ink-muted">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        {verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-good px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-white shadow-[0_3px_12px_-3px_var(--color-good)]">
            <CheckIcon className="h-3 w-3" />
            Verified
          </span>
        ) : (
          <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">
            {state === 'idle' ? 'Pending' : state === 'sending' ? 'Sending…' : 'Enter OTP'}
          </span>
        )}
      </div>

      {/* value + action on one row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl panel px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-display text-[0.85rem] font-semibold tracking-wide text-ink sm:text-[0.9rem]">
            {value}
          </span>
          <LockIcon className="h-3 w-3 shrink-0 text-ink-faint" />
        </span>

        {(state === 'idle' || state === 'sending') && (
          <button
            type="button"
            onClick={send}
            disabled={state === 'sending'}
            className="shrink-0 rounded-lg bg-brand-bright px-3.5 py-2 font-display text-[0.78rem] font-bold tracking-wide text-white shadow-[0_8px_20px_-8px_rgba(47,61,255,0.8)] transition-[transform,filter] hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === 'sending' ? <span className="spinner h-4 w-4" /> : 'Send OTP'}
          </button>
        )}
      </div>

      {sendError && <p className="mt-1.5 text-[0.68rem] text-bad">{sendError}</p>}

      {state === 'sent' && (
        <div className="mt-2.5">
          <OtpInput
            channel={isEmail ? 'email' : 'sms'}
            target={value}
            compact
            buttonLabel="Verify"
            onVerify={handleVerify}
            onResend={send}
          />
        </div>
      )}
    </div>
  )
}
