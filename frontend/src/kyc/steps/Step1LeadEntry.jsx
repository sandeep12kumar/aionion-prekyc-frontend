import React from "react";
import { StepShell, TextField } from "../formFields";

const KYC_TYPES = [
  { value: "KYC", label: "KYC", enabled: true, hint: "Sends a self-serve link to the client, same as today." },
  { value: "RM_KYC", label: "PRE KYC", enabled: true, hint: "RM collects the client's details directly, in person or on a call." },
  { value: "NRO", label: "NRO", enabled: false, hint: "Not available yet." },
  { value: "NRE", label: "NRE", enabled: false, hint: "Not available yet." },
];

export default function Step1LeadEntry({ data, onChange }) {
  const set = (field) => (value) => onChange({ ...data, [field]: value });
  const mobileNumber = data.mobile_number || "";
  const email = data.email || "";
  const clientName = data.client_name || "";
  const mobileIsValid = /^\d{10}$/.test(mobileNumber);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const clientNameIsValid = clientName.trim() !== "" && !/\d/.test(clientName);

  return (
    <StepShell
      title="New Lead"
      subtitle="Mobile, email, and name are checked against existing clients and applications before anything else can proceed."
    >
      <div>
        <TextField
          label="Mobile Number"
          required
          value={mobileNumber}
          onChange={(value) => set("mobile_number")(value.replace(/\D/g, "").slice(0, 10))}
          placeholder="10-digit mobile"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
        />
        {mobileNumber && !mobileIsValid && <p className="mt-1 text-xs text-rose-600">Mobile number must contain exactly 10 digits.</p>}
      </div>
      <div>
        <TextField label="Email" required type="email" value={email} onChange={set("email")} placeholder="name@example.com" />
        {email && !emailIsValid && <p className="mt-1 text-xs text-rose-600">Enter a valid email address.</p>}
      </div>
      <div className="sm:col-span-2">
        <TextField label="Client Name" required value={clientName} onChange={set("client_name")} placeholder="Full name as on PAN" />
        {clientName && !clientNameIsValid && <p className="mt-1 text-xs text-rose-600">Client name must not contain numbers.</p>}
      </div>

      <div className="sm:col-span-2">
        <label className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">
          Type of KYC <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KYC_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              disabled={!type.enabled}
              onClick={() => set("kyc_type")(type.value)}
              title={type.hint}
              className={`rounded-xl border p-3 text-left text-sm font-bold transition ${
                !type.enabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                  : data.kyc_type === type.value
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              {type.label}
              <p className="mt-1 text-[10px] font-normal leading-snug opacity-80">{type.hint}</p>
            </button>
          ))}
        </div>
      </div>
    </StepShell>
  );
}
