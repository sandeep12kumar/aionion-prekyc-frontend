import React, { useState } from "react";
import { StepShell, TextField } from "../formFields";
import { apiUrl } from "../../lib/apiBase";

export default function Step2PanIdentity({ data, onChange, allData }) {
  const set = (field) => (value) => {
    setVerificationError("");
    onChange({
      ...data,
      [field]: field === "pan_number" ? value.toUpperCase() : value,
      verification: null,
      identity_route: "",
    });
  };
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const adultCutoff = new Date();
  adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
  const maximumDob = [
    adultCutoff.getFullYear(),
    String(adultCutoff.getMonth() + 1).padStart(2, "0"),
    String(adultCutoff.getDate()).padStart(2, "0"),
  ].join("-");

  const verifyPan = async () => {
    const leadId = allData?.lead?.databaseId;
    setVerificationError("");
    if (!leadId) return setVerificationError("Save Step 1 successfully before verifying PAN.");
    setIsVerifying(true);
    try {
      const response = await fetch(apiUrl(`/api/kyc/leads/${leadId}/pan/verify`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pan_number: data.pan_number, dob: data.dob }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result.message || "PAN verification failed.";
        setVerificationError(message);
        if (result.code === "ACCOUNT_EXISTS") window.alert("Account already exists for this PAN.");
        return;
      }
      const verifiedData = { ...data, pan_number: String(data.pan_number || "").toUpperCase(), verification: result, identity_route: result.route };
      onChange(verifiedData);
      sessionStorage.setItem("kycVerificationResult", JSON.stringify({ ...result, leadId }));
      // ITR details are shown first for every client, then on to DigiLocker.
      window.location.assign("/income-tax-result");
    } catch (error) {
      setVerificationError(error.message || "PAN verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  const choosePanImage = async (event) => {
    const file = event.target.files?.[0] || null;
    setUploadError("");
    setUploadMessage("");
    if (!file) return setSelectedFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setSelectedFile(null);
      return setUploadError("Choose a JPG, PNG, or WEBP image.");
    }
    if (file.size > 5 * 1024 * 1024) {
      setSelectedFile(null);
      return setUploadError("The PAN image must be 5 MB or smaller.");
    }
    setSelectedFile(file);
    await uploadPanImage(file);
  };

  const uploadPanImage = async (file) => {
    setUploadError("");
    setUploadMessage("");
    const leadId = allData?.lead?.databaseId;
    if (!leadId) return setUploadError("Save Step 1 successfully before uploading the PAN image.");
    if (!file) return setUploadError("Choose a PAN image before uploading.");

    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("panImage", file);
      // pan_number isn't saved to the row yet at this point (that only
      // happens on Verify) — send it along so the backend can name the S3
      // object after the PAN, matching the eSigned PDF/Aadhaar XML.
      body.append("pan_number", data.pan_number || "");
      const response = await fetch(apiUrl(`/api/kyc/leads/${leadId}/pan-image`), { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result.debug ? ` (${result.debug.code}: ${result.debug.details})` : "";
        throw new Error(`${result.message || "PAN image upload failed."}${detail}`);
      }
      onChange({ ...data, pan_image: result.panImage, verification: null, identity_route: "" });
      setUploadMessage("PAN image uploaded successfully.");
      setSelectedFile(null);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <StepShell
      title="PAN & Identity Verification"
      subtitle="PAN is checked against the existing client list and for Aadhaar-linkage before continuing."
    >
      <TextField label="PAN Number" required value={data.pan_number} onChange={set("pan_number")} placeholder="ABCDE1234F" maxLength={10} pattern="[A-Z]{5}[0-9]{4}[A-Z]" />
      <TextField label="Date of Birth" required type="date" value={data.dob} onChange={set("dob")} max={maximumDob} />

      {false && (
        <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            DigiLocker (Setu-hosted)
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aadhaar number and OTP are entered on Setu's own hosted consent page, not through this
            app. The RM opens the link below (works on desktop or mobile) with the client present or
            on a call, and enters the Aadhaar number and OTP the client reads out.
          </p>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"
          >
            Launch DigiLocker (Setu) →
          </button>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
            <TextField label="Name (from Aadhaar XML)" value={data.digilocker_name} onChange={set("digilocker_name")} disabled />
            <TextField label="DOB (from Aadhaar XML)" value={data.digilocker_dob} onChange={set("digilocker_dob")} disabled />
            <TextField label="Gender (from Aadhaar XML)" value={data.digilocker_gender} onChange={set("digilocker_gender")} disabled />
            <TextField label="Address (from Aadhaar XML)" full value={data.digilocker_address} onChange={set("digilocker_address")} disabled />
          </div>
        </div>
      )}

      <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-200">
          Upload PAN Image <span className="text-rose-500">*</span>
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={choosePanImage}
          disabled={isUploading}
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-700 dark:text-slate-300"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">JPG, PNG, or WEBP only. Maximum file size: 5 MB.</p>
        {isUploading && selectedFile && <p className="mt-2 text-xs font-medium text-blue-600">Uploading: {selectedFile.name}...</p>}
        {data.pan_image?.fileName && <p className="mt-2 text-xs font-medium text-emerald-600">Uploaded: {data.pan_image.fileName}</p>}
        {uploadError && <p className="mt-2 text-xs font-medium text-rose-600">{uploadError}</p>}
        {uploadMessage && <p className="mt-2 text-xs font-medium text-emerald-600">{uploadMessage}</p>}
      </div>

      <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">PAN Verification</p>
        <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">Verify the PAN against the existing client list and confirm that the applicant is at least 18 years old.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={verifyPan} disabled={isVerifying || isUploading || !data.pan_image?.fileName} className="rounded-lg border border-blue-600 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
            {isVerifying ? "Verifying..." : "Verify"}
          </button>
        </div>
        {verificationError && <p className="mt-2 text-xs font-medium text-rose-600">{verificationError}</p>}
      </div>
    </StepShell>
  );
}
