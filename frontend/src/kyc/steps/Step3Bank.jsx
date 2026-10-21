import React, { useEffect, useState } from "react";
import { StepShell, TextField, SelectField } from "../formFields";
import { apiUrl } from "../../lib/apiBase";

const BANK_PROOF_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const BANK_PROOF_MAX_BYTES = 5 * 1024 * 1024;

export default function Step3Bank({ data, onChange }) {
  const [accountMasked, setAccountMasked] = useState(false);
  const [confirmMasked, setConfirmMasked] = useState(false);
  const [ifscMessage, setIfscMessage] = useState("");
  const [isFetchingBank, setIsFetchingBank] = useState(false);
  const set = (field) => (value) => {
    const normalized = ["account_number", "confirm_account_number"].includes(field)
      ? value.replace(/\D/g, "")
      : field === "ifsc_code" ? value.toUpperCase() : value;
    // A different account/IFSC needs a fresh penny drop, so any earlier
    // name-mismatch result and its proof no longer apply.
    const next = { ...data, [field]: normalized, bank_verified: false, name_mismatch: null, bank_proof_file: null, bank_proof_type: "" };
    if (field === "ifsc_code") {
      next.bank_name = "";
      next.branch_name = "";
      next.bank_address = "";
      next.micr_code = "";
    }
    onChange(next);
  };
  const [proofError, setProofError] = useState("");
  const proofFile = data.bank_proof_file instanceof File ? data.bank_proof_file : null;
  const chooseProofFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setProofError("");
    if (!file) return;
    if (!BANK_PROOF_MIME_TYPES.includes(file.type)) {
      return setProofError("Only PDF, JPG, or PNG files can be uploaded.");
    }
    if (file.size > BANK_PROOF_MAX_BYTES) {
      return setProofError("The bank proof must be 5 MB or smaller.");
    }
    onChange({ ...data, bank_proof_file: file });
  };
  const accountMismatch = Boolean(
    data.account_number
    && data.confirm_account_number
    && data.account_number !== data.confirm_account_number,
  );

  useEffect(() => {
    const ifsc = String(data.ifsc_code || "").trim().toUpperCase();
    setIfscMessage("");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsFetchingBank(true);
      try {
        const response = await fetch(apiUrl(`/api/kyc/banks/ifsc/${encodeURIComponent(ifsc)}`), { signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Unable to fetch bank details.");
        onChange({ ...data, ifsc_code: ifsc, ...result.bank, bank_verified: false });
        setIfscMessage("Bank details fetched successfully.");
      } catch (error) {
        if (error.name !== "AbortError") setIfscMessage(error.message);
      } finally {
        if (!controller.signal.aborted) setIsFetchingBank(false);
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data.ifsc_code]);

  return (
    <StepShell
      title="Bank Details"
      subtitle="Bank name, branch, and address are auto-fetched from the IFSC code."
    >
      <TextField
        label="Account Number"
        required
        type={accountMasked ? "password" : "text"}
        value={data.account_number}
        onChange={set("account_number")}
        onFocus={() => setAccountMasked(false)}
        inputMode="numeric"
        maxLength={18}
        autoComplete="off"
      />
      <div>
        <TextField
          label="Confirm Account Number"
          required
          type={confirmMasked ? "password" : "text"}
          value={data.confirm_account_number}
          onChange={set("confirm_account_number")}
          onFocus={() => { setAccountMasked(true); setConfirmMasked(false); }}
          onBlur={() => setConfirmMasked(true)}
          inputMode="numeric"
          maxLength={18}
          autoComplete="off"
        />
        {accountMismatch && <p className="mt-1.5 text-xs font-medium text-rose-600">Account number does not match.</p>}
      </div>
      <TextField label="IFSC Code" required value={data.ifsc_code} onChange={set("ifsc_code")} onFocus={() => { setAccountMasked(true); setConfirmMasked(true); }} />
      <div className="sm:col-span-2 -mt-3">
        {isFetchingBank && <p className="text-xs font-medium text-blue-600">Fetching bank details...</p>}
        {ifscMessage && <p className={`text-xs font-medium ${data.bank_name ? "text-emerald-600" : "text-rose-600"}`}>{ifscMessage}</p>}
      </div>
      <SelectField
        label="Account Type"
        required
        value={data.account_type}
        onChange={set("account_type")}
        options={["Savings", "Current"]}
      />
      <TextField label="Bank Name" value={data.bank_name} onChange={set("bank_name")} disabled placeholder="Auto-fetched from IFSC" />
      <TextField label="Branch Name" value={data.branch_name} onChange={set("branch_name")} disabled placeholder="Auto-fetched from IFSC" />
      <TextField label="Bank Address" full value={data.bank_address} onChange={set("bank_address")} disabled placeholder="Auto-fetched from IFSC" />
      {data.name_mismatch && (
        <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Account holder name does not match</p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            Bank records show "{data.name_mismatch.accountHolderName}" but the applicant is "{data.name_mismatch.applicantName}".
            Upload a bank statement or cancelled cheque showing the client's name, then click Save &amp; Continue.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Proof Type"
              required
              value={data.bank_proof_type}
              onChange={(value) => onChange({ ...data, bank_proof_type: value })}
              options={[{ value: "BANK_STATEMENT", label: "Bank Statement" }, { value: "CANCELLED_CHEQUE", label: "Cancelled Cheque" }]}
            />
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Upload Proof <span className="text-rose-500">*</span>
              </label>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={chooseProofFile}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-700 dark:text-slate-300"
              />
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">PDF, JPG, or PNG, up to 5 MB.</p>
              {proofFile && <p className="mt-1 text-xs font-medium text-emerald-600">Selected: {proofFile.name}</p>}
              {proofError && <p className="mt-1 text-xs font-medium text-rose-600">{proofError}</p>}
            </div>
          </div>
        </div>
      )}
    </StepShell>
  );
}
