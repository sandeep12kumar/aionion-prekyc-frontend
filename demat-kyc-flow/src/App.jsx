import { useCallback, useEffect, useRef, useState } from 'react'
import AuroraBackground from './components/AuroraBackground.jsx'
import Logo from './components/Logo.jsx'
import Stepper from './components/Stepper.jsx'
import ReviewStep from './steps/ReviewStep.jsx'
import VerifyStep from './steps/VerifyStep.jsx'
import PaymentStep from './steps/PaymentStep.jsx'
import IpvStep from './steps/IpvStep.jsx'
import EsignStep from './steps/EsignStep.jsx'
import HappyInvestingScreen from './steps/HappyInvestingScreen.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { ShieldIcon } from './components/icons.jsx'
import { getClientLink } from './lib/api.js'

const META = {
  review: { active: 0, done: 0 },
  verify: { active: 1, done: 1 },
  payment: { active: 2, done: 2 },
  ipv: { active: 3, done: 3 },
  esign: { active: 4, done: 4 },
  done: { active: 4, done: 5 },
}

function getApplicationId() {
  const params = new URLSearchParams(window.location.search)
  // Setu's eSign redirect appends its OWN "id" (its signature requestId) to
  // whatever redirect URL we hand it, overwriting an "id" param of ours with
  // the same name — so the eSign return trip uses "appId" instead, which
  // Setu never touches. The plain emailed client link still uses "id".
  return params.get('appId') || params.get('id')
}

function isEsignReturn() {
  return new URLSearchParams(window.location.search).get('esign_return') === '1'
}

// The step name lives in the URL path (e.g. /payment, /ipv) so each step is
// a real, bookmarkable/refreshable/shareable link — appId (and any other
// query params) stay untouched, only the pathname changes.
const STEP_KEYS = ['review', 'verify', 'payment', 'ipv', 'esign', 'done']

function stepFromPathname(pathname) {
  const key = pathname.replace(/^\/+/, '')
  return STEP_KEYS.includes(key) ? key : null
}

export default function App() {
  const applicationId = getApplicationId()
  const esignReturn = isEsignReturn()
  const [link, setLink] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState(() => stepFromPathname(window.location.pathname) || 'review')
  const hasSyncedInitialUrl = useRef(false)

  const load = useCallback(() => {
    if (!applicationId) {
      setLoadError('This link is missing its application id.')
      return
    }
    setLoadError('')
    getClientLink(applicationId)
      .then((data) => {
        setLink(data)
        // Resume wherever the applicant last left off, so a reopened link
        // doesn't ask them to re-verify or re-pay. Gate strictly on what's
        // actually done (verified/paid) — current_stage alone isn't enough,
        // since it can advance to 'payment' from a since-abandoned order
        // attempt even if OTP verification never completed.
        const bothVerified = data.mobileVerified && data.emailVerified
        if (bothVerified) setStep((s) => (s === 'review' || s === 'verify' ? 'payment' : s))
        if (bothVerified && data.paymentStatus === 'paid')
          setStep((s) => (s === 'review' || s === 'verify' || s === 'payment' ? 'ipv' : s))

        // eSign already finished on an earlier visit — go straight to the
        // final screen.
        if (data.esignStatus === 'completed' || data.isCompleted) {
          setStep('done')
          return
        }
        // eSign was started (client came back from Setu, maybe closed the
        // tab) but isn't confirmed yet — land on the eSign step in polling
        // mode so it finalises and the completion email goes out.
        const resumeEsign = esignReturn || data.esignStarted
        if (resumeEsign) {
          setStep('esign')
          if (esignReturn) {
            const url = new URL(window.location.href)
            // Drop esign_return plus everything Setu tacked onto the redirect
            // (its own "id"/success/signerIdentifier/esp) — appId is all this
            // app needs going forward.
            ;['esign_return', 'id', 'success', 'signerIdentifier', 'esp'].forEach((key) =>
              url.searchParams.delete(key),
            )
            window.history.replaceState(null, '', url)
          }
        }
      })
      .catch((error) => setLoadError(error.message))
  }, [applicationId, esignReturn])

  useEffect(() => {
    load()
  }, [load])

  // Keep the URL's pathname in sync with the current step. The very first
  // sync (on mount, e.g. "/" -> "/review") replaces so it doesn't add an
  // extra back-button hop; every step change after that pushes a real
  // history entry so browser back/forward moves between steps.
  useEffect(() => {
    const target = `/${step}`
    if (window.location.pathname === target) {
      hasSyncedInitialUrl.current = true
      return
    }
    const url = new URL(window.location.href)
    url.pathname = target
    if (hasSyncedInitialUrl.current) {
      window.history.pushState(null, '', url)
    } else {
      window.history.replaceState(null, '', url)
      hasSyncedInitialUrl.current = true
    }
  }, [step])

  // Browser back/forward between steps.
  useEffect(() => {
    const onPopState = () => {
      const next = stepFromPathname(window.location.pathname)
      if (next) setStep(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const go = useCallback((next) => {
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (loadError) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <AuroraBackground />
        <div className="glass max-w-sm rounded-2xl p-6">
          <p className="font-display text-base font-bold text-ink">Can&apos;t open this application</p>
          <p className="mt-2 text-sm text-ink-muted">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!link) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center">
        <AuroraBackground />
        <span className="spinner spinner-lg h-10 w-10" />
      </div>
    )
  }

  const initials = (link.applicant.name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const meta = META[step]

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AuroraBackground />
      <ThemeToggle />

      <main className="flex flex-1 flex-col items-center justify-center px-3 py-4 sm:px-4 sm:py-5">
        <div className="w-full max-w-[440px] sm:max-w-[500px]">
          <div className="mb-2.5 flex justify-center">
            <Logo />
          </div>

          {/* applicant strip */}
          <div className="frost mb-2.5 flex items-center gap-2.5 rounded-xl px-3 py-2 sm:px-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-bright text-[0.68rem] font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[0.8rem] font-semibold text-ink sm:text-[0.82rem]">
                {link.applicant.name}
              </div>
              <div className="truncate text-[0.62rem] text-ink-muted">
                PAN {link.applicant.pan}
              </div>
            </div>
          </div>

          <section className="glass rounded-2xl p-4 sm:rounded-3xl">
            {step !== 'done' && (
              <div className="mb-4 border-b hairline pb-3.5">
                <Stepper activeIndex={meta.active} completedCount={meta.done} />
              </div>
            )}

            {step === 'review' && (
              <ReviewStep applicationId={applicationId} onNext={() => go('verify')} />
            )}

            {step === 'verify' && (
              <VerifyStep
                applicationId={applicationId}
                mobile={link.mobile}
                email={link.email}
                mobileVerified={link.mobileVerified}
                emailVerified={link.emailVerified}
                onNext={() => go('payment')}
              />
            )}

            {step === 'payment' && link.scheme && (
              <PaymentStep
                applicationId={applicationId}
                scheme={link.scheme}
                placeOfSupply={link.placeOfSupply}
                bank={link.bank}
                applicant={link.applicant}
                email={link.email}
                mobile={link.mobile}
                alreadyPaid={link.paymentStatus === 'paid'}
                onNext={() => go('ipv')}
              />
            )}

            {step === 'payment' && !link.scheme && (
              <div className="animate-step text-center text-sm text-ink-muted">
                Your RM hasn&apos;t selected a scheme for this application yet. Please check back
                once they have.
              </div>
            )}

            {step === 'ipv' && <IpvStep applicationId={applicationId} onNext={() => go('esign')} />}

            {step === 'esign' && (
              <EsignStep
                applicationId={applicationId}
                esignReturn={esignReturn || (link.esignStarted && link.esignStatus !== 'completed')}
                onNext={() => go('done')}
              />
            )}

            {step === 'done' && <HappyInvestingScreen />}
          </section>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.66rem] font-medium text-white/75 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            <ShieldIcon className="h-3 w-3" />
            AIONION Capital · All Rights Reserved
          </p>
        </div>
      </main>
    </div>
  )
}
