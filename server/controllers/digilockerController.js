import { fetchDigilockerAadhaar, startDigilocker, downloadAadhaarXml } from "../services/digilockerService.js";
import { saveDigilockerDetails } from "../services/leadService.js";
import { S3_FOLDERS, uploadBufferToS3 } from "../services/s3StorageService.js";

// DigiLocker route only; the KRA route has no Aadhaar XML (kra_raw_xml is a
// different provider's response, not an Aadhaar document).

function firstValue(source, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], source);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  const dayFirst = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(date);
  return dayFirst ? `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}` : date;
}

function maskAadhaar(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `********${digits.slice(-4)}`;
}

function withoutRelationshipPrefix(value) {
  return String(value || "")
    .replace(/^\s*(?:S\s*\/\s*O|D\s*\/\s*O|W\s*\/\s*O|C\s*\/\s*O)\s*:?\s*/i, "")
    .trim();
}

function normalizeAadhaar(payload) {
  const container = payload?.data || payload || {};
  const source = container?.aadhaar || container?.aadhaar_data || payload?.aadhaar || container;
  const addressObject = source.address || source.splitAddress || source.split_address || {};
  const addressParts = [
    addressObject.house,
    addressObject.street,
    addressObject.landmark,
    addressObject.locality,
    addressObject.postOffice || addressObject.post_office,
    addressObject.vtc || addressObject.city,
    addressObject.district || addressObject.dist,
    addressObject.state,
    addressObject.pincode || addressObject.pinCode || addressObject.postalCode,
  ].filter((value) => String(value || "").trim());
  return {
    name: firstValue(source, ["name", "full_name", "fullName"]),
    father_name: withoutRelationshipPrefix(firstValue(source, ["father_name", "fatherName", "care_of", "careOf", "address.careOf", "address.care_of", "address.co"])),
    gender: firstValue(source, ["gender"]),
    dob: normalizeDate(firstValue(source, ["dob", "date_of_birth", "dateOfBirth"])),
    aadhaar_number_masked: maskAadhaar(firstValue(source, [
      "maskedNumber",
      "aadhaar_number_masked",
      "maskedAadhaarNumber",
      "masked_aadhaar",
      "masked_aadhaar_number",
      "aadhaarNumber",
      "aadhaar_number",
      "aadhaar",
      "uid",
      "last_four_digits",
      "lastFourDigits",
      "aadhaar_last_four_digits",
      "aadhaarLastFourDigits",
    ])),
    address: typeof source.address === "string" ? source.address : firstValue(source, ["full_address", "fullAddress", "address.full", "address.formatted"]) || addressParts.join(", "),
    city: firstValue(addressObject, ["city", "vtc", "postOffice"]),
    district: firstValue(addressObject, ["district", "dist"]),
    state: firstValue(addressObject, ["state"]),
    pincode: String(firstValue(addressObject, ["pincode", "pinCode", "postalCode", "pin"])),
    photo_base64: firstValue(source, ["photo_base64", "photoBase64", "photo.base64", "photo.data", "photo", "profile_image", "profileImage"]),
    provider: "SETU_DIGILOCKER",
  };
}

export async function startDigilockerController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    if (!Number.isSafeInteger(leadId) || leadId < 1) return response.status(400).json({ message: "A valid lead ID is required." });
    const result = await startDigilocker(leadId);
    return response.json(result);
  } catch (error) { return next(error); }
}

export async function fetchDigilockerController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    const requestId = String(request.params.requestId || "").trim();
    if (!Number.isSafeInteger(leadId) || leadId < 1 || !requestId) return response.status(400).json({ message: "Lead ID and DigiLocker request ID are required." });
    const raw = await fetchDigilockerAadhaar(requestId);
    const details = normalizeAadhaar(raw);
    const savedLead = await saveDigilockerDetails(leadId, details, raw);

    // Best-effort copy of the signed Aadhaar XML DigiLocker returns, to S3 —
    // never blocks the DigiLocker step if the download/upload fails.
    try {
      const xmlBuffer = await downloadAadhaarXml(raw);
      if (xmlBuffer) {
        const safePan = String(savedLead?.pan_number || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || `lead_${leadId}`;
        await uploadBufferToS3(S3_FOLDERS.aadhaarXml, `${safePan}.xml`, xmlBuffer, "application/xml");
      }
    } catch (xmlError) {
      console.warn(`[DigiLocker] Aadhaar XML download failed for lead ${leadId}:`, xmlError.message);
    }

    return response.json({ route: "DIGILOCKER", message: "DigiLocker details fetched successfully.", details, savedLead });
  } catch (error) { return next(error); }
}
