import axios from "axios";
const headers = () => ({
  "x-client-id": process.env.DIGILOCKER_CLIENT_ID,
  "x-client-secret": process.env.DIGILOCKER_CLIENT_SECRET,
  "x-product-instance-id": process.env.DIGILOCKER_PRODUCT_ID,
});
const ensureSettings = () => {
  if (
    !process.env.DIGILOCKER_CLIENT_ID ||
    !process.env.DIGILOCKER_CLIENT_SECRET ||
    !process.env.DIGILOCKER_PRODUCT_ID
  )
    throw new Error(
      "DigiLocker settings are incomplete. Add DIGILOCKER_* values to server/.env.",
    );
};
export async function startDigilocker(leadId) {
  ensureSettings();
  const frontend = process.env.FRONTEND_BASE_URL || "http://localhost:5173";
  const response = await axios.post(
    "https://dg.setu.co/api/digilocker",
    { redirectUrl: `${frontend}/digilocker-success?leadId=${leadId}` },
    { headers: headers(), timeout: 15000 },
  );
  return response.data;
}
export async function fetchDigilockerAadhaar(requestId) {
  ensureSettings();
  const response = await axios.get(
    `https://dg.setu.co/api/digilocker/${encodeURIComponent(requestId)}/aadhaar`,
    { headers: headers(), timeout: 15000 },
  );
  return response.data;
}

/**
 * Setu's Aadhaar response carries a `fileUrl` (a time-bound presigned link,
 * see aadhaar.xml.fileUrl / validUntil) to the actual DigiLocker-signed
 * Aadhaar XML document, alongside the parsed JSON fields. Download that XML
 * content — best-effort; the caller decides what to do if it's missing.
 */
export async function downloadAadhaarXml(raw) {
  const fileUrl =
    raw?.aadhaar?.xml?.fileUrl ||
    raw?.data?.aadhaar?.xml?.fileUrl ||
    raw?.xml?.fileUrl ||
    raw?.data?.xml?.fileUrl ||
    "";
  if (!fileUrl) return null;

  const response = await axios.get(fileUrl, { responseType: "arraybuffer", timeout: 15000 });
  return Buffer.from(response.data);
}
