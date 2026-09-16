import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftIcon } from './icons.jsx'

const LENGTH = 6
const RESEND_SECONDS = 30

export default function OtpInput({
  channel = 'sms',
  target,
  compact = false,
  buttonLabel = 'Verify & continue',
  showDemoHint = false,
  onVerify,
  onResend,
  onBack,
}) {
  const [digits, setDigits] = useState(Array(LENGTH).fill(''))
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(RESEND_SECONDS)
  const [submitting, setSubmitting] = useState(false)
  const inputsRef = useRef([])

  const code = digits.join('')
  const complete = code.length === LENGTH

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const title = channel === 'email' ? 'Verify your email' : 'Verify your mobile number'
  const blurb = useMemo(
    () =>
      channel === 'email'
        ? 'Enter the 6-digit code we emailed to'
        : 'Enter the 6-digit code we sent by SMS to',
    [channel],
  )

  function setDigitAt(index, value) {
    setDigits((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleChange(index, raw) {
    const value = raw.replace(/\D/g, '')
    if (!value) {
      setDigitAt(index, '')
      return
    }
    setError('')
    setDigits((prev) => {
      const next = [...prev]
      if (value.length === 1) {
        next[index] = value
      } else {
        for (let i = 0; i < value.length && index + i < LENGTH; i += 1) {
          next[index + i] = value[i]
        }
      }
      return next
    })
    const landed = Math.min(index + value.length, LENGTH - 1)
    requestAnimationFrame(() => inputsRef.current[landed]?.focus())
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        setDigitAt(index, '')
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus()
        setDigitAt(index - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    } else if (e.key === 'Enter' && complete) {
      submit()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH)
    if (!text) return
    const next = Array(LENGTH).fill('')
    for (let i = 0; i < text.length; i += 1) next[i] = text[i]
    setDigits(next)
    setError('')
    const focusIndex = Math.min(text.length, LENGTH - 1)
    inputsRef.current[focusIndex]?.focus()
  }

  async function submit() {
    if (!complete || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onVerify?.(code)
    } catch (err) {
      setError(err?.message || 'That code is incorrect. Check the digits and try again.')
      setDigits(Array(LENGTH).fill(''))
      inputsRef.current[0]?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  async function resend() {
    if (seconds > 0) return
    setDigits(Array(LENGTH).fill(''))
    setError('')
    inputsRef.current[0]?.focus()
    try {
      await onResend?.()
      setSeconds(RESEND_SECONDS)
    } catch (err) {
      setError(err?.message || 'Unable to resend the code. Please try again.')
    }
  }

  return (
    <div className={compact ? '' : 'animate-step'}>
      {!compact && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Change {channel === 'email' ? 'email' : 'number'}
        </button>
      )}

      {!compact && (
        <>
          <h1 className="font-display text-[1.65rem] font-bold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {blurb} <span className="font-semibold text-ink">{target}</span>
          </p>
        </>
      )}

      <div
        className={[
          compact ? 'flex justify-between gap-1.5' : 'mt-7 flex justify-between gap-2',
          error ? 'animate-shake' : '',
        ].join(' ')}
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (inputsRef.current[i] = el)}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={error ? true : undefined}
            className={[
              'glass-field rounded-lg text-center font-display font-semibold text-ink outline-none',
              compact ? 'h-9 w-full text-base' : 'h-14 w-full text-xl',
              error ? 'border-bad/70' : '',
            ].join(' ')}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
        ))}
      </div>

      <div className={[compact ? 'mt-1.5' : 'mt-2.5', 'min-h-[1rem] text-[0.7rem]'].join(' ')}>
        {error ? (
          <span className="text-bad">{error}</span>
        ) : (
          <span className="text-ink-faint">
            {seconds > 0 ? (
              <>
                Resend in <span className="tabular-nums text-ink-muted">{seconds}s</span>
              </>
            ) : (
              <button
                type="button"
                onClick={resend}
                className="font-semibold text-brand-blue hover:underline"
              >
                Resend code
              </button>
            )}
            {showDemoHint && <span className="text-ink-faint"> · demo code 123456</span>}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!complete || submitting}
        className={[
          'w-full rounded-lg bg-brand-bright font-display font-semibold tracking-wide text-white shadow-lg shadow-brand-blue/30 transition-[transform,opacity,background] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40',
          compact ? 'mt-2 py-2 text-[0.8rem]' : 'mt-6 py-3.5 text-sm',
        ].join(' ')}
      >
        {submitting ? 'Verifying…' : buttonLabel}
      </button>
    </div>
  )
}
