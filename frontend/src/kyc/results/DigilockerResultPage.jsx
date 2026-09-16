import React, { useEffect, useState } from "react";
import { ResultGrid, ResultLayout } from "./ResultLayout";

export default function DigilockerResultPage() {
  const query = new URLSearchParams(window.location.search);
  const leadId =
    query.get("leadId") ||
    JSON.parse(sessionStorage.getItem("kycVerificationResult") || "{}")?.leadId;
  const requestId =
    query.get("requestId") ||
    query.get("id") ||
    sessionStorage.getItem("digilockerRequestId");
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!leadId || !requestId) {
      setError("DigiLocker request information is missing.");
      return;
    }
    fetch(
      `/api/kyc/leads/${leadId}/digilocker/${encodeURIComponent(requestId)}`,
    )
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            body.message || "Unable to fetch DigiLocker details.",
          );
        return body;
      })
      .then((body) => {
        setDetails(body.details);
        const previous = JSON.parse(sessionStorage.getItem("kycVerificationResult") || "{}");
        sessionStorage.setItem("kycVerificationResult", JSON.stringify({ ...previous, route: "DIGILOCKER", details: body.details, leadId }));
      })
      .catch((e) => setError(e.message));
  }, [leadId, requestId]);

  const fields = details
    ? [
        { label: "Name", value: details.name },
        { label: "Father Name", value: details.father_name },
        { label: "Gender", value: details.gender },
        { label: "Date of Birth", value: details.dob },
        {
          label: "Masked Aadhaar Number",
          value: details.aadhaar_number_masked,
        },
        { label: "Provider", value: details.provider },
        { label: "Address", value: details.address, full: true },
        { label: "City", value: details.city },
        { label: "District", value: details.district },
        { label: "State", value: details.state },
        { label: "Pincode", value: details.pincode },
      ]
    : [];

  const photoSource = details?.photo_base64
    ? /^(data:|https?:|blob:)/.test(String(details.photo_base64))
      ? String(details.photo_base64)
      : `data:image/jpeg;base64,${details.photo_base64}`
    : "";

  return (
    <ResultLayout title='DigiLocker Details'>
      {error && <p className='text-center text-sm text-rose-600'>{error}</p>}
      {!error && !details && (
        <p className='text-center text-sm text-slate-500'>
          Fetching DigiLocker details...
        </p>
      )}
      {details && (
        <>
          {photoSource && (
            <div className='mb-6 flex justify-center'>
              <div>
                <p className='mb-2 text-center text-xs font-bold text-slate-700'>
                  Aadhaar Photo
                </p>
                <img
                  src={photoSource}
                  alt='Aadhaar holder'
                  className='h-36 w-28 rounded-xl border border-slate-300 object-cover shadow-sm'
                />
              </div>
            </div>
          )}
          <ResultGrid fields={fields} />
          <div className='mt-8 text-center'>
            <button
              onClick={() => window.location.assign(`/?step=bank&leadId=${encodeURIComponent(leadId)}`)}
              className='rounded-xl bg-blue-700 px-16 py-3 text-sm font-bold text-white'
            >
              Next
            </button>
          </div>
        </>
      )}
    </ResultLayout>
  );
}
