import React, { useEffect, useState } from "react";
import { StepShell, TextField, SelectField } from "../formFields";
import { apiUrl } from "../../lib/apiBase";

export default function Step3Bank({ data, onChange }) {
  const [accountMasked, setAccountMasked] = useState(false);
  const [confirmMasked, setConfirmMasked] = useState(false);
  const [ifscMessage, setIfscMessage] = useState("");
  const [isFetchingBank, setIsFetchingBank] = useState(false);
  const set = (field) => (value) => {
    const normalized = ["account_number", "confirm_account_number"].includes(field)
      ? value.replace(/\D/g, "")
      : field === "ifsc_code" ? value.toUpperCase() : value;
    const next = { ...data, [field]: normalized, bank_verified: false };
    if (field === "ifsc_code") {
      next.bank_name = "";
      next.branch_name = "";
      next.bank_address = "";
      next.micr_code = "";
    }
    onChange(next);
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
    </StepShell>
  );
}
