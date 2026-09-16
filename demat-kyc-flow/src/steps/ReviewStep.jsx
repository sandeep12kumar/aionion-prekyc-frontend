import { useEffect, useState } from 'react'
import { ArrowRightIcon, ShieldIcon, InfoIcon } from '../components/icons.jsx'
import { getClientReview } from '../lib/api.js'

function yesNo(v) {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return v || '—'
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b hairline py-1 text-[0.72rem] last:border-0">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="text-right font-semibold text-ink">{value || value === 0 ? value : '—'}</span>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl panel p-3">
      <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-ink-muted">{title}</p>
      {children}
    </div>
  )
}

export default function ReviewStep({ applicationId, onNext }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getClientReview(applicationId)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [applicationId])

  if (error) {
    return (
      <div className="animate-step flex flex-col items-center gap-2 py-10 text-center">
        <InfoIcon className="h-6 w-6 text-bad" />
        <p className="text-sm font-semibold text-ink">Couldn&apos;t load your details</p>
        <p className="text-xs text-ink-muted">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="animate-step flex flex-col items-center py-12">
        <span className="spinner spinner-lg h-12 w-12" />
        <p className="mt-4 text-xs text-ink-muted">Loading your application…</p>
      </div>
    )
  }

  const { lead, identity, bank, personal, nominees, scheme, signature } = data

  return (
    <div className="animate-step">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bright/12 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-brand-blue ring-1 ring-brand-blue/45">
        <ShieldIcon className="h-3 w-3" />
        Step 1 · Review
      </span>
      <h1 className="mt-2.5 font-display text-[1.4rem] font-bold leading-tight tracking-tight text-ink">
        Check your details
      </h1>
      <p className="mt-1 text-[0.8rem] leading-snug text-ink-muted">
        Your Relationship Manager filled these in. Confirm everything is correct before you continue.
      </p>

      <div className="mt-3 space-y-2">
        <Card title="Applicant">
          <Row label="Name" value={lead.clientName} />
          <Row label="Mobile" value={lead.mobile} />
          <Row label="Email" value={lead.email} />
        </Card>

        <Card title="PAN & Identity">
          <Row label="PAN" value={identity.pan} />
          <Row label="Date of Birth" value={identity.dob} />
          <Row label="Aadhaar Linked" value={identity.aadhaarLinked} />
          {identity.route === 'KRA' && (
            <>
              <Row label="KRA Name" value={identity.kraName} />
              <Row label="KRA Status" value={identity.kraStatus} />
              <Row label="Address (KRA)" value={identity.kraAddress} />
            </>
          )}
          {identity.panImageUrl && (
            <img
              src={identity.panImageUrl}
              alt="PAN"
              className="mt-2 h-24 w-auto max-w-full rounded-lg border hairline object-contain"
            />
          )}
        </Card>

        <Card title="Bank">
          <Row label="Account Number" value={bank.accountNumber} />
          <Row label="IFSC" value={bank.ifsc} />
          <Row label="Account Type" value={bank.accountType} />
          <Row label="Bank" value={bank.bankName} />
          <Row label="Branch" value={bank.branchName} />
          <Row label="Account Holder (verified)" value={bank.accountHolder} />
          <Row label="Verified" value={yesNo(bank.verified)} />
        </Card>

        <Card title="Personal">
          <Row label="Father's Name" value={personal.fatherName} />
          <Row label="Mother's Name" value={personal.motherName} />
          <Row label="Gender" value={personal.gender} />
          <Row label="Marital Status" value={personal.maritalStatus} />
          <Row label="Education" value={personal.education} />
          <Row label="Annual Income" value={personal.annualIncome} />
          <Row label="Trading Experience" value={personal.tradingExperience} />
          <Row label="Occupation" value={personal.occupation} />
          <Row label="Net Worth" value={personal.netWorth} />
          <Row label="Running A/c Authorization" value={personal.runningAccountAuthorization} />
          <Row label="Permanent Address" value={personal.aadhaarAddress} />
          <Row label="Politically Exposed" value={personal.politicallyExposed} />
          <Row label="Citizen of India" value={personal.citizenOfIndia} />
          <Row label="Country of Birth" value={personal.countryOfBirth} />
          <Row label="DDPI Opt-in" value={personal.ddpi} />
        </Card>

        <Card title={`Nominees (${nominees.length})`}>
          {nominees.length === 0 && <p className="text-[0.72rem] text-ink-faint">No nominees added.</p>}
          {nominees.map((n, i) => (
            <div key={i} className={i > 0 ? 'mt-2 border-t hairline pt-2' : ''}>
              <p className="mb-1 text-[0.68rem] font-bold text-ink">
                Nominee {i + 1}
                {n.name ? ` · ${n.name}` : ''}
              </p>
              <Row label="Relation" value={n.relation} />
              <Row label="Date of Birth" value={n.dob} />
              <Row label="Allocation %" value={n.allocation ? `${n.allocation}%` : ''} />
              {n.isMinor && n.guardian && (
                <div className="mt-1.5 border-t hairline pt-1.5">
                  <p className="mb-1 text-[0.62rem] font-bold uppercase tracking-wide text-ink-faint">
                    Guardian (minor nominee)
                  </p>
                  <Row label="Guardian Relation" value={n.guardian.relation} />
                  <Row label="Guardian Name" value={n.guardian.name} />
                  <Row label="Guardian Mobile" value={n.guardian.mobile} />
                  <Row label="Guardian DOB" value={n.guardian.dob} />
                  <Row label="Guardian Address" value={n.guardian.address} />
                </div>
              )}
            </div>
          ))}
        </Card>

        <Card title="Scheme & Signature">
          <Row label="Scheme" value={scheme ? scheme.label : '—'} />
          <Row label="Signature" value={signature.provided ? 'Provided' : 'Not provided'} />
          {signature.url && (
            <img
              src={signature.url}
              alt="Signature"
              className="mt-2 h-16 w-auto max-w-full rounded-lg border hairline bg-white object-contain p-1"
            />
          )}
        </Card>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl fill p-2.5 text-[0.74rem] leading-snug text-ink-muted">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#0023ff]"
        />
        I have reviewed all the details above and confirm they are correct.
      </label>

      <button
        type="button"
        onClick={onNext}
        disabled={!confirmed}
        className="group mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-bright py-3 font-display text-sm font-bold tracking-wide text-white shadow-[0_14px_34px_-12px_rgba(0,35,255,0.4)] transition-[transform,opacity,background] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
      >
        Confirm &amp; continue
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  )
}
