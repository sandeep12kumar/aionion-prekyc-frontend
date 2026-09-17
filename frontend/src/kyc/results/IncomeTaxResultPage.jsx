import React, { useState } from "react";
import {
  EmptyResult,
  readVerificationResult,
  ResultGrid,
  ResultLayout,
} from "./ResultLayout";
import { apiUrl } from "../../lib/apiBase";

export default function IncomeTaxResultPage() {
  const result = readVerificationResult();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  // ITR details live in `result.itr` (always) — fall back to `result.details`
  // for older cached results on the INCOME_TAX route.
  const itr = result?.itr || (result?.route === "INCOME_TAX" ? result?.details : null);
  if (!itr)
    return (
      <ResultLayout title='Income Tax Details'>
        <EmptyResult />
      </ResultLayout>
    );

  const isKraRoute = result.route === "KRA";

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

      {isKraRoute ? (
        <div className='mt-8 text-center'>
          <p className='mb-4 text-sm text-slate-600'>
            This PAN is registered with a KRA. Continue to review the KRA record.
          </p>
          <button
            onClick={() => window.location.assign("/kra-result")}
            className='rounded-xl bg-blue-700 px-10 py-3 text-sm font-bold text-white'
          >
            Continue to KRA details
          </button>
        </div>
      ) : (
        <>
          {!result.aadhaarLinked && (
            <p className='mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700'>
              PAN and Aadhaar are not linked. Link Aadhaar with PAN before
              proceeding. You cannot continue to the next step.
            </p>
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
        </>
      )}

      {error && (
        <p className='mt-4 text-center text-sm text-rose-600'>{error}</p>
      )}
    </ResultLayout>
  );
}
