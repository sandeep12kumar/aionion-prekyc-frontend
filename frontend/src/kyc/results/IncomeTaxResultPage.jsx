import React, { useState } from "react";
import {
  EmptyResult,
  readVerificationResult,
  ResultGrid,
  ResultLayout,
} from "./ResultLayout";
import { apiUrl } from "../../lib/apiBase";

export default function IncomeTaxResultPage() {
  const [result, setResult] = useState(readVerificationResult);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [recheckNote, setRecheckNote] = useState("");

  const itr = result?.itr || result?.details;
  if (!itr)
    return (
      <ResultLayout title='Income Tax Details'>
        <EmptyResult />
      </ResultLayout>
    );

  const launchDigilocker = async () => {
    setError("");
    setStarting(true);
    try {
      const response = await fetch(
        apiUrl(`/api/kyc/leads/${result.leadId}/digilocker/start`),
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.message || "Unable to start DigiLocker.");
      const requestId =
        body.id || body.request_id || body.requestId || body.data?.id;
      const url =
        body.url || body.redirect_url || body.redirectUrl || body.data?.url;
      if (!requestId || !url)
        throw new Error(
          "DigiLocker did not return a request ID and redirect URL.",
        );
      sessionStorage.setItem("digilockerRequestId", String(requestId));
      window.location.assign(url);
    } catch (e) {
      setError(e.message);
      setStarting(false);
    }
  };

  // For clients who linked PAN and Aadhaar after the first check: asks the
  // backend to re-run the Income Tax check on the PAN saved for this lead.
  const recheckLink = async () => {
    setError("");
    setRecheckNote("");
    setRechecking(true);
    try {
      const response = await fetch(
        apiUrl(`/api/kyc/leads/${result.leadId}/pan/recheck`),
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.message || "Unable to recheck PAN and Aadhaar link.");
      const updated = { ...result, ...body, leadId: result.leadId };
      sessionStorage.setItem("kycVerificationResult", JSON.stringify(updated));
      setResult(updated);
      if (!body.aadhaarLinked) {
        const checkedAt = new Date(body.checkedAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        setRecheckNote(`Still not linked (checked at ${checkedAt}). A newly linked PAN can take some time to update at Income Tax.`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRechecking(false);
    }
  };

  return (
    <ResultLayout title='Income Tax Details'>
      <ResultGrid
        fields={[
          { label: "ITR Name", value: itr.full_name },
          { label: "Last Name", value: itr.last_name },
          { label: "Category", value: itr.category },
          { label: "Aadhaar Seeding Status", value: itr.aadhaar_seeding_status },
        ]}
      />

      {!result.aadhaarLinked && (
        <div className='mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4'>
          <p className='text-sm font-semibold text-rose-700'>
            PAN and Aadhaar are not linked. Link Aadhaar with PAN before
            proceeding. You cannot continue to the next step.
          </p>
          <div className='mt-4 flex flex-wrap items-center gap-3'>
            <button
              type='button'
              onClick={recheckLink}
              disabled={rechecking}
              className='rounded-lg border border-rose-600 bg-white px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {rechecking ? "Rechecking..." : "Recheck PAN–Aadhaar link"}
            </button>
            <span className='text-xs text-rose-700'>
              Already linked? Recheck to update the status.
            </span>
          </div>
          {recheckNote && (
            <p className='mt-3 text-xs font-semibold text-rose-700'>{recheckNote}</p>
          )}
        </div>
      )}
      {result.aadhaarLinked && (
        <div className='mt-8 text-center'>
          <button
            onClick={launchDigilocker}
            disabled={starting}
            className='rounded-xl bg-blue-700 px-10 py-3 text-sm font-bold text-white disabled:opacity-60'
          >
            {starting ? "Opening DigiLocker..." : "Continue to DigiLocker"}
          </button>
        </div>
      )}

      {error && (
        <p className='mt-4 text-center text-sm text-rose-600'>{error}</p>
      )}
    </ResultLayout>
  );
}
