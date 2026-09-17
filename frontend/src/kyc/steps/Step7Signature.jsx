import React, { useEffect, useState } from "react";
import { apiUrl } from "../../lib/apiBase";

const MAX_SIGNATURE_SIZE = 5 * 1024 * 1024;

export default function Step7Signature({ data, onChange, allData }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Revoke the local object URL once it's no longer the one being shown, so
  // it doesn't leak — this fires on every change and on unmount.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const chooseSignatureImage = async (event) => {
    const file = event.target.files?.[0] || null;
    setUploadError("");
    setUploadMessage("");
    if (!file) return setSelectedFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setSelectedFile(null);
      return setUploadError("Choose a JPG, PNG, or WEBP image.");
    }
    if (file.size > MAX_SIGNATURE_SIZE) {
      setSelectedFile(null);
      return setUploadError("The signature image must be 5 MB or smaller.");
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    await uploadSignatureImage(file);
  };

  const uploadSignatureImage = async (file) => {
    setUploadError("");
    setUploadMessage("");
    const leadId = allData?.lead?.databaseId;
    if (!leadId) return setUploadError("Save Step 1 successfully before uploading the signature image.");
    if (!file) return setUploadError("Choose a signature image before uploading.");

    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("signatureImage", file);
      const response = await fetch(apiUrl(`/api/kyc/leads/${leadId}/signature-image`), { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result.debug ? ` (${result.debug.code}: ${result.debug.details})` : "";
        throw new Error(`${result.message || "Signature image upload failed."}${detail}`);
      }
      onChange({ ...data, signature_image: result.signatureImage });
      setUploadMessage("Signature image uploaded successfully.");
      setSelectedFile(null);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Signature</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Upload the client's signature.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-200">
          Upload Signature <span className="text-rose-500">*</span>
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={chooseSignatureImage}
          disabled={isUploading}
          className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-700 dark:text-slate-300"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">JPG, PNG, or WEBP only. Maximum file size: 5 MB.</p>
        {isUploading && selectedFile && <p className="mt-2 text-xs font-medium text-blue-600">Uploading: {selectedFile.name}...</p>}
        {data.signature_image?.fileName && <p className="mt-2 text-xs font-medium text-emerald-600">Uploaded: {data.signature_image.fileName}</p>}
        {uploadError && <p className="mt-2 text-xs font-medium text-rose-600">{uploadError}</p>}
        {uploadMessage && <p className="mt-2 text-xs font-medium text-emerald-600">{uploadMessage}</p>}

        {(previewUrl || data.signature_image?.path) && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">Preview</p>
            <img
              src={previewUrl || data.signature_image.path}
              alt="Uploaded signature"
              className="h-28 w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain p-2 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        )}
      </div>
    </div>
  );
}
