import React from "react";
import {
  EmptyResult,
  readVerificationResult,
  ResultGrid,
  ResultLayout,
} from "./ResultLayout";

export default function KraResultPage() {
  const result = readVerificationResult();
  if (!result?.details)
    return (
      <ResultLayout title='KRA Details'>
        <EmptyResult />
      </ResultLayout>
    );
  const d = result.details;
  const fields = [
    { label: "KRA Email", value: d.email },
    { label: "KRA Mobile", value: d.mobile },
    { label: "Gender", value: d.gender },
    { label: "Date of Birth", value: d.dob },
    { label: "Aadhaar Number", value: d.aadhaar_number },
    { label: "KRA Name", value: d.name },
    { label: "Father Name", value: d.father_name },
    { label: "Address 1", value: d.address_1 },
    { label: "Address 2", value: d.address_2 },
    { label: "Address 3", value: d.address_3 },
    { label: "City", value: d.city },
    { label: "District", value: d.district },
    { label: "State", value: d.state },
    { label: "Pincode", value: d.pincode },
  ];
  return (
    <ResultLayout title='KRA Details'>
      <ResultGrid fields={fields} />
      <div className='mt-8 text-center'>
        <button
          onClick={() => window.location.assign(`/?step=bank&leadId=${encodeURIComponent(result.leadId)}`)}
          className='rounded-xl bg-blue-700 px-16 py-3 text-sm font-bold text-white'
        >
          Next
        </button>
      </div>
    </ResultLayout>
  );
}
