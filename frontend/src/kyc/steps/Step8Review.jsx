import React, { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { calculateAge, isFutureDate, MIN_NOMINEE_AGE } from "./Step5Nominee";

const SCHEME_LABELS = {
  lifeTime: "Life Time Advantage",
  annualCare: "Annual Care",
};

function ReviewRow({ label, value }) {
  const display = value || value === 0 ? value : "-";
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right font-semibold text-slate-700 dark:text-slate-200">{display}</span>
    </div>
  );
}

function ReviewCard({ title, children, full }) {
  return (
    <div className={`rounded-2xl border border-slate-200 p-4 dark:border-slate-800 ${full ? "sm:col-span-2" : ""}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

export default function Step8Review({ allData: data }) {
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [savedLead, setSavedLead] = useState(null);

  const leadId = data.lead?.databaseId;

  const sendClientLink = async () => {
    if (!leadId) {
      setSendError("Lead ID is missing. Save Step 1 before sending the client link.");
      return;
    }

    setSendError("");
    setIsSending(true);

    try {
      const response = await fetch(`/api/kyc/leads/${leadId}/send-client-link`, { method: "POST" });
      const result = await response.json().catch(() => ({}));

      if (!result.sent) {
        const detail = [result.results?.sms, result.results?.email].filter(Boolean).join(" · ");
        throw new Error(detail || result.message || "Unable to send the client link.");
      }

      setSent(true);
    } catch (error) {
      setSendError(error.message);
    } finally {
      setIsSending(false);
    }
  };

  // Lead and PAN & Identity can go missing from in-memory/local-draft state
  // (PAN verification hard-navigates to the KRA/Income Tax result page right
  // after updating state, which can outrun the save). Both are already
  // durably saved to the lead record in the database by that point, so pull
  // them from there instead of trusting client-side state for this page.
  useEffect(() => {
    if (!leadId) return;

    let cancelled = false;

    fetch(`/api/kyc/leads/${leadId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!cancelled && result?.lead) setSavedLead(result.lead);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const personal = data.personal || {};
  const bank = data.bank || {};
  const nominees = data.nominee?.nominees || [];
  const scheme = data.scheme || {};

  const mobileNumber = savedLead?.mobile_number || data.lead?.mobile_number;
  const email = savedLead?.email || data.lead?.email;
  const clientName = savedLead?.client_name || data.lead?.client_name;
  const panNumber = savedLead?.pan_number || data.panIdentity?.pan_number;
  const dob = savedLead?.dob ? savedLead.dob.slice(0, 10) : data.panIdentity?.dob;
  // `provider` on the saved lead reflects whichever identity source ran
  // last — CVL_KRA for the KRA route, or INCOME_TAX which becomes
  // SETU_DIGILOCKER once DigiLocker completes on that route.
  const route =
    savedLead?.provider === "CVL_KRA"
      ? "KRA"
      : savedLead?.provider === "INCOME_TAX" || savedLead?.provider === "SETU_DIGILOCKER"
      ? "INCOME_TAX"
      : data.panIdentity?.identity_route;
  const aadhaarLinked = savedLead?.aadhaar_seeding_status
    ? savedLead.aadhaar_seeding_status
    : route === "KRA"
    ? "Yes"
    : route === "INCOME_TAX"
    ? "No"
    : "";

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Review & Send</h2>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReviewCard title="Lead">
          <ReviewRow label="Client Name" value={clientName} />
          <ReviewRow label="Mobile" value={mobileNumber} />
          <ReviewRow label="Email" value={email} />
          <ReviewRow label="KYC Type" value={data.lead?.kyc_type === "RM_KYC" ? "PRE KYC" : data.lead?.kyc_type} />
        </ReviewCard>

        <ReviewCard title="PAN & Identity">
          <ReviewRow label="PAN" value={panNumber} />
          <ReviewRow label="DOB" value={dob} />
          <ReviewRow label="Aadhaar Linked" value={aadhaarLinked} />
          {route === "KRA" && (
            <>
              <ReviewRow label="KRA Name" value={savedLead?.kra_name} />
              <ReviewRow label="Gender (KRA)" value={savedLead?.gender} />
              <ReviewRow label="Address (KRA)" value={savedLead?.kra_address} />
            </>
          )}
        </ReviewCard>

        <ReviewCard title="Bank">
          <ReviewRow label="Account Number" value={bank.account_number} />
          <ReviewRow label="IFSC" value={bank.ifsc_code} />
          <ReviewRow label="Account Type" value={bank.account_type} />
          <ReviewRow label="Bank Name" value={bank.bank_name} />
          <ReviewRow label="Branch Name" value={bank.branch_name} />
          <ReviewRow label="Bank Address" value={bank.bank_address} />
          <ReviewRow label="MICR Code" value={bank.micr_code} />
          <ReviewRow label="Account Holder (Verified)" value={bank.verification?.account_holder_name} />
        </ReviewCard>

        <ReviewCard title="Personal">
          <ReviewRow label="Father's Name" value={personal.father_name} />
          <ReviewRow label="Mother's Name" value={personal.mother_name} />
          <ReviewRow label="Gender" value={personal.gender} />
          <ReviewRow label="Marital Status" value={personal.marital_status} />
          <ReviewRow label="Education" value={personal.education} />
          <ReviewRow label="Annual Income" value={personal.annual_income} />
          <ReviewRow label="Trading Experience" value={personal.trading_experience} />
          <ReviewRow label="Occupation" value={personal.occupation} />
          <ReviewRow label="Net Worth" value={personal.net_worth} />
          <ReviewRow label="Running A/c Authorization" value={personal.running_account_authorization} />
          <ReviewRow label="Aadhaar / Permanent Address" value={personal.aadhaar_address} />
          <ReviewRow label="Politically Exposed" value={personal.politically_exposed} />
          <ReviewRow label="Citizen of India" value={personal.citizen_of_india} />
          <ReviewRow label="Country of Birth" value={personal.country_of_birth} />
          <ReviewRow label="DDPI Opt-in" value={personal.ddpi} />
        </ReviewCard>

        <ReviewCard title="Scheme">
          <ReviewRow label="Selected Plan" value={SCHEME_LABELS[scheme.selected_scheme] || scheme.selected_scheme} />
        </ReviewCard>

        <ReviewCard title="Signature">
          <ReviewRow label="Signature" value={data.signature?.signature_image?.fileName} />
        </ReviewCard>

        <ReviewCard title={`Nominees (${nominees.length})`} full>
          {nominees.length === 0 && <p className="text-xs text-slate-400">No nominees added.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {nominees.map((n, i) => {
              const age = calculateAge(n.dob);
              const isMinor = age !== null && !isFutureDate(n.dob) && age < MIN_NOMINEE_AGE;
              return (
                <div key={i} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800/70">
                  <p className="mb-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                    Nominee {i + 1}
                    {n.nominee_name ? `: ${n.nominee_name}` : ""}
                  </p>
                  <ReviewRow label="Relation" value={n.relation} />
                  <ReviewRow label="Date of Birth" value={n.dob} />
                  <ReviewRow label="Allocation %" value={n.allocation_percentage ? `${n.allocation_percentage}%` : ""} />
                  {isMinor && (
                    <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Guardian (minor nominee)
                      </p>
                      <ReviewRow label="Guardian Relation" value={n.guardian_relation} />
                      <ReviewRow label="Guardian Name" value={n.guardian_name} />
                      <ReviewRow label="Guardian Mobile" value={n.guardian_mobile} />
                      <ReviewRow label="Guardian DOB" value={n.guardian_dob} />
                      <ReviewRow label="Guardian Address" value={n.guardian_address} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ReviewCard>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        {sent ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 size={18} /> Link sent to the client's mobile and email
          </div>
        ) : (
          <button
            type="button"
            onClick={sendClientLink}
            disabled={isSending}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={16} /> {isSending ? "Sending..." : "Send link to client"}
          </button>
        )}
        {sendError && <p className="text-xs font-medium text-rose-600">{sendError}</p>}
      </div>
    </div>
  );
}
