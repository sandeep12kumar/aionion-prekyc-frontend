import { useCallback, useEffect, useRef, useState } from 'react'
import { startEsign, getEsignStatus } from '../lib/api.js'

/* ------------------------------------------------------------------ step */

const POLL_MS = 3000
const MAX_POLLS = 60 // ~3 minutes

export default function EsignStep({ applicationId, onNext, esignReturn = false }) {
  // No review/PDF-preview screen — that was only ever for internal QA to
  // check the PDF field values, not part of the live client flow. Arriving
  // here (from IPV) goes straight into starting the eSign; esignReturn
  // (coming back from Setu) goes straight into polling.
  const [state, setState] = useState(esignReturn ? 'polling' : 'starting') // starting|polling|failed
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const pollCount = useRef(0)
  const startedRef = useRef(false)

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }

  const poll = useCallback(async () => {
    try {
      const res = await getEsignStatus(applicationId)
      if (res.status === 'completed') {
        // No celebration screen — the eSign was Aadhaar-name-verified server
        // side, so go straight to the Happy Investing screen.
        stopPolling()
        onNext?.()
      } else if (res.status === 'failed' || res.status === 'name_mismatch') {
        stopPolling()
        setError(
          res.message ||
            (res.status === 'name_mismatch'
              ? 'The Aadhaar used for eSign does not match the account holder.'
              : 'The eSign was not completed.'),
        )
        setState('failed')
      } else {
        pollCount.current += 1
        if (pollCount.current >= MAX_POLLS) {
          stopPolling()
          setError('Still waiting for Setu to confirm your signature. Please retry in a moment.')
          setState('failed')
        }
      }
    } catch (e) {
      pollCount.current += 1
      if (pollCount.current >= MAX_POLLS) {
        stopPolling()
        setError(e.message || 'Could not confirm the eSign status.')
        setState('failed')
      }
    }
  }, [applicationId, onNext])

  useEffect(() => {
    if (state !== 'polling') return undefined
    pollCount.current = 0
    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return stopPolling
  }, [state, poll])

  /**
   * Resolve the browser's location. Best-effort: resolves to null instead of
   * rejecting so eSign is never blocked by it — the server falls back to a
   * default office location when none is supplied.
   */
  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }
      let settled = false
      const done = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => done({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => done(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      )
      // Hard cap in case the callback never fires (seen on some desktops).
      setTimeout(() => done(null), 11000)
    })

  const startFlow = useCallback(async () => {
    setError('')
    const locPromise = getLocation()
    setState('starting')
    try {
      const loc = await locPromise
      const res = await startEsign(applicationId, loc || {})
      if (res.status === 'completed') {
        // Already signed and verified on an earlier visit — no celebration,
        // straight to the Happy Investing screen.
        onNext?.()
        return
      }
      if (!res.signingUrl) throw new Error('Setu did not return a signing link. Please try again.')
      // Hand over to the Setu hosted page — Aadhaar number + OTP are entered there.
      window.location.assign(res.signingUrl)
    } catch (e) {
      setError(e.message || 'Could not start the eSign. Please try again.')
      setState('failed')
    }
  }, [applicationId, onNext])

  useEffect(() => {
    if (esignReturn || startedRef.current) return
    startedRef.current = true
    startFlow()
  }, [esignReturn, startFlow])

  /* ---------- starting / polling spinners ---------- */
  if (state === 'starting' || state === 'polling') {
    return (
      <div className="animate-step flex flex-col items-center py-12 text-center">
        <span className="spinner spinner-lg h-14 w-14" />
        <p className="mt-6 font-display text-base font-semibold text-ink">
          {state === 'starting' ? 'Preparing your documents…' : 'Confirming your signature…'}
        </p>
        <p className="mt-1 max-w-xs text-xs text-ink-muted">
          {state === 'starting'
            ? 'Securely handing you over to Setu Aadhaar eSign.'
            : 'Setu is finalising your Aadhaar signature on every page. This can take a few seconds.'}
        </p>
      </div>
    )
  }

  /* ---------- failed ---------- */
  return (
    <div className="animate-step flex flex-col items-center py-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bad/15 text-bad ring-1 ring-bad/40">
        <span className="font-display text-2xl font-bold">!</span>
      </div>
      <h1 className="mt-4 font-display text-lg font-bold text-ink">eSign not completed</h1>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{error}</p>
      <button
        type="button"
        onClick={startFlow}
        className="mt-5 w-full rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99]"
      >
        Try again
      </button>
    </div>
  )
}
