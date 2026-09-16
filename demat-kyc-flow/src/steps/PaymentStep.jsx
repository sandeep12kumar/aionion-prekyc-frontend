import { useState } from 'react'
import { gstBreakdown, isTamilNadu, money } from '../data/phase1.js'
import { ArrowRightIcon, BankIcon, CheckIcon, InfoIcon } from '../components/icons.jsx'
import { createPaymentOrder, loadRazorpayCheckout, verifyPayment } from '../lib/api.js'

function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className={strong ? 'text-sm font-bold text-ink' : 'text-[0.8rem] text-ink-muted'}>
        {label}
      </span>
      <span
        className={[
          'font-display tabular-nums',
          strong ? 'text-base font-bold text-ink' : 'text-[0.82rem] font-semibold text-ink',
        ].join(' ')}
      >
        ₹{value}
      </span>
    </div>
  )
}

export default function PaymentStep({ applicationId, scheme, placeOfSupply, bank, applicant, email, mobile, alreadyPaid, onNext }) {
  const [state, setState] = useState(alreadyPaid ? 'paid' : 'review') // review | processing | verifying | paid | failed
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [payRef, setPayRef] = useState('')
  const g = gstBreakdown(scheme.opening, placeOfSupply)
  const tn = isTamilNadu(placeOfSupply)

  async function pay() {
    setError('')
    setState('processing')
    try {
      await loadRazorpayCheckout()
      const { data: order } = await createPaymentOrder(applicationId, {
        firstname: applicant?.name,
        email,
        phone: mobile,
      })

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'AIONION Capital',
        description: order.description,
        prefill: order.prefill,
        theme: { color: '#2f3dff' },
        handler: async (razorpayResponse) => {
          setState('verifying')
          try {
            await verifyPayment(applicationId, {
              orderId: razorpayResponse.razorpay_order_id,
              paymentId: razorpayResponse.razorpay_payment_id,
              signature: razorpayResponse.razorpay_signature,
            })
            setPayRef(razorpayResponse.razorpay_payment_id)
            setState('paid')
          } catch (err) {
            setError(err.message)
            setState('review')
          }
        },
        modal: {
          ondismiss: () => setState((s) => (s === 'processing' ? 'review' : s)),
        },
      })

      checkout.on('payment.failed', (resp) => {
        setError(resp.error?.description || 'Payment failed. Please try again.')
        setState('review')
      })

      checkout.open()
    } catch (err) {
      setError(err.message)
      setState('review')
    }
  }

  if (state === 'processing' || state === 'verifying') {
    return (
      <div className="animate-step flex flex-col items-center py-12 text-center">
        <span className="spinner spinner-lg h-14 w-14" />
        <p className="mt-6 font-display text-base font-semibold text-ink">
          {state === 'verifying' ? 'Confirming payment' : 'Opening secure checkout'}
        </p>
        <p className="mt-1 max-w-xs text-xs text-ink-muted">
          {state === 'verifying' && bank
            ? `Verifying funds are coming from ${bank.name} account ending ${bank.accountLast4}.`
            : 'Please complete the payment in the window that opened.'}
        </p>
      </div>
    )
  }

  if (state === 'paid') {
    return (
      <div className="animate-step flex flex-col items-center text-center">
        <div className="animate-pop flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-good ring-1 ring-good/40">
          <CheckIcon className="h-8 w-8" animate />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">
          Payment received
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          ₹{money(g.total)}{bank ? ` paid from ${bank.name} ••${bank.accountLast4}` : ' paid'}
        </p>
        {payRef && (
          <div className="mt-4 rounded-xl fill px-3 py-2 text-xs text-ink-muted">
            Payment reference{' '}
            <span className="font-display font-semibold tracking-wide text-ink">{payRef}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onNext}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-bright py-4 font-display text-sm font-bold tracking-wide text-white shadow-[0_16px_40px_-12px_rgba(0,35,255,0.32)] transition-[transform,background] hover:brightness-110 active:scale-[0.99]"
        >
          Continue to Video IPV
          <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="animate-step">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bright/12 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-brand-blue ring-1 ring-brand-blue/45">
          Step 2 · Payment
        </span>
        <span className="text-[0.64rem] text-ink-faint">Choosen with your RM</span>
      </div>
      <h1 className="mt-2.5 font-display text-[1.35rem] font-bold leading-tight tracking-tight text-ink">
        Account opening charges
      </h1>

      {/* scheme + breakdown in one card */}
      <div className="mt-2.5 rounded-xl panel p-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-[0.95rem] font-bold text-ink">
            {scheme.label}
            <span className="ml-2 text-[0.7rem] font-medium text-ink-faint">
              {scheme.highlight}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-brand-bright px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-wide text-white shadow-[0_4px_12px_-4px_rgba(47,61,255,0.9)]">
            Selected
          </span>
        </div>
        <div className="my-1.5 border-t hairline" />
        <Row label="Account opening charge" value={money(scheme.opening)} />
        {g.mode === 'intra' ? (
          <>
            <Row label="CGST @ 9%" value={money(g.cgst)} />
            <Row label="SGST @ 9%" value={money(g.sgst)} />
          </>
        ) : (
          <Row label="IGST @ 18%" value={money(g.igst)} />
        )}
        <div className="my-1.5 border-t hairline" />
        <Row label="Total payable now" value={money(g.total)} strong />
        <p className="mt-1.5 text-[0.66rem] leading-snug text-ink-faint">
          Place of supply <span className="font-semibold text-ink-muted">{placeOfSupply}</span> —{' '}
          {tn ? 'CGST 9% + SGST 9%' : 'IGST 18%'}.
        </p>
      </div>

      {/* bank restriction */}
      {bank && (
        <div className="mt-2.5 rounded-xl panel p-3">
          <div className="flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-ink-muted">
            <BankIcon className="h-3.5 w-3.5" />
            Pay only from this account
          </div>
          <p className="mt-2 font-display text-[0.85rem] font-semibold tracking-wide text-ink">
            {bank.name} · A/C ••••••{bank.accountLast4}
          </p>
          <p className="font-display text-[0.78rem] font-semibold tracking-wide text-ink-muted">
            {bank.ifsc} · {bank.holder}
          </p>
          <div className="mt-2 flex gap-1.5 rounded-lg bg-bad/[0.12] p-2 text-[0.68rem] leading-snug text-bad">
            <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" />
            Funds from any other account are not accepted.
          </div>
        </div>
      )}

      <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[0.72rem] leading-snug text-ink-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0023ff]"
        />
        {bank
          ? `I confirm the payment will be made from my ${bank.name} account ending ${bank.accountLast4}.`
          : 'I confirm I will pay from my own bank account.'}
      </label>

      {error && <p className="mt-2 text-[0.7rem] text-bad">{error}</p>}

      <button
        type="button"
        onClick={pay}
        disabled={!consent}
        className="mt-3 w-full rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,opacity,filter] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
      >
        Pay ₹{money(g.total)}
      </button>
    </div>
  )
}
