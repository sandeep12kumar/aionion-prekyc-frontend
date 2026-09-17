import { findExistingPan } from "../services/masterPanService.js";
import { fetchKraDetails } from "../services/cvlKraService.js";
import { verifyPanWithIncomeTax } from "../services/incomeTaxPanService.js";
import {
  getLeadPanImage,
  saveIncomeTaxDetails,
  saveKraDetails,
} from "../services/leadService.js";
import axios from "axios";

const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function withoutRelationshipPrefix(value) {
  return String(value || "")
    .replace(/^\s*(?:S\s*\/\s*O|D\s*\/\s*O|W\s*\/\s*O|C\s*\/\s*O)\s*:?\s*/i, "")
    .trim();
}

function isAdult(dob) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  )
    return false;

  const today = new Date();
  if (birth > today) return false;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birth.getDate())
  )
    age -= 1;
  return age >= 18;
}
function kraView(data) {
  return {
    name: data.APP_NAME || "",
    email: data.APP_EMAIL || "",
    mobile: String(data.APP_MOB_NO || ""),
    dob: data.APP_DOB_DT || "",
    father_name: data.APP_F_NAME || "",
    gender: { M: "Male", F: "Female", T: "Transgender" }[data.APP_GEN] || "",
    address_1: withoutRelationshipPrefix(data.APP_PER_ADD1),
    address_2: data.APP_PER_ADD2 || "",
    address_3: data.APP_PER_ADD3 || "",
    city: data.APP_PER_CITY || data.APP_COR_CITY || "",
    district: data.APP_PER_DISTRICT || "",
    state: data.APP_PER_STATE || data.APP_COR_STATE || "",
    pincode: String(data.APP_PER_PINCD || data.APP_COR_PINCD || ""),
    kra_name: data.APP_KRA_INFO || "",
    kra_status: data.APP_STATUS || "",
  };
}
function isAadhaarLinked(value) {
  return ["Y", "YES", "LINKED", "TRUE"].includes(
    String(value || "")
      .trim()
      .toUpperCase(),
  );
}

const stateNames = {
  1: "Jammu and Kashmir", 2: "Himachal Pradesh", 3: "Punjab", 4: "Chandigarh", 5: "Uttarakhand", 6: "Haryana", 7: "Delhi", 8: "Rajasthan", 9: "Uttar Pradesh", 10: "Bihar", 11: "Sikkim", 12: "Arunachal Pradesh", 13: "Nagaland", 14: "Manipur", 15: "Mizoram", 16: "Tripura", 17: "Meghalaya", 18: "Assam", 19: "West Bengal", 20: "Jharkhand", 21: "Odisha", 22: "Chhattisgarh", 23: "Madhya Pradesh", 24: "Gujarat", 25: "Daman and Diu", 26: "Dadra and Nagar Haveli", 27: "Maharashtra", 28: "Andhra Pradesh", 29: "Karnataka", 30: "Goa", 31: "Lakshadweep", 32: "Kerala", 33: "Tamil Nadu", 34: "Puducherry", 35: "Andaman and Nicobar Islands", 36: "Telangana", 37: "Andhra Pradesh", 38: "Ladakh",
};

function maskedAadhaar(data) {
  // CVL KRA puts the UID in different fields per record (and APP_UID_NO is
  // sometimes a Y/N flag rather than a number) — take the first candidate
  // that actually carries at least 4 digits and show only the last 4.
  const candidates = [
    data.APP_UID_TOKEN,
    data.APP_UID_TOKEN_NO,
    data.APP_UID_NO,
    data.APP_L_ADHAR_NO,
    data.APP_CORR_AADHAR_NO,
    data.APP_ADHAR_NO,
    data.APP_AADHAR_NO,
    data.APP_AADHAAR_NO,
  ];
  for (const candidate of candidates) {
    const digits = String(candidate || "").replace(/\D/g, "");
    if (digits.length >= 4) return `XXXX XXXX ${digits.slice(-4)}`;
  }
  return "";
}

async function enrichLocation(details) {
  let postal = null;
  if (/^\d{6}$/.test(details.pincode)) {
    try {
      const result = await axios.get(`https://api.postalpincode.in/pincode/${details.pincode}`, { timeout: 5000 });
      postal = result.data?.[0]?.PostOffice?.[0] || null;
    } catch (error) {
      console.warn("Pincode lookup failed:", error.message);
    }
  }
  const stateCode = String(details.state || "").replace(/^0+/, "");
  return {
    ...details,
    district: details.district || postal?.District || details.city,
    state: postal?.State || stateNames[stateCode] || details.state,
  };
}

export async function verifyPanController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    const pan = String(request.body.pan_number || "")
      .trim()
      .toUpperCase();
    const dob = String(request.body.dob || "");
    if (!Number.isSafeInteger(leadId) || leadId < 1)
      return response
        .status(400)
        .json({ message: "A valid lead ID is required." });
    if (!panPattern.test(pan))
      return response
        .status(400)
        .json({ message: "Enter a valid PAN number." });
    if (!isAdult(dob))
      return response
        .status(422)
        .json({
          code: "AGE_RESTRICTION",
          message: "You must be 18 years or older to proceed.",
        });
    const lead = await getLeadPanImage(leadId);
    if (!lead) return response.status(404).json({ message: "Lead not found. Save Step 1 again." });
    if (!lead.pan_card_file_path) return response.status(422).json({ code: "PAN_IMAGE_REQUIRED", message: "Upload the PAN image before verification." });
    if (await findExistingPan(pan))
      return response
        .status(409)
        .json({
          code: "ACCOUNT_EXISTS",
          message: "An account is already registered for this PAN.",
        });

    // KRA / DigiLocker routing is decided by the PAN alone — the DOB is only
    // an age check plus the mandatory key CVL KRA needs to return the record.
    // Look KRA up first: if this PAN IS with a KRA but the DOB doesn't match
    // (WEBERR-012), stop and make the RM fix the DOB — never let a KRA PAN
    // silently fall through to DigiLocker.
    const kra = await fetchKraDetails(pan, dob);
    if (kra.dobMismatch) {
      return response.status(422).json({
        code: "KRA_DOB_MISMATCH",
        message:
          "This PAN is registered with a KRA, but the date of birth entered doesn't match the KRA record. Correct the date of birth and verify again.",
      });
    }

    // Income Tax verification now runs for EVERY client. KRA clients see
    // their ITR details first, then their KRA record; non-KRA clients see
    // ITR first, then continue to DigiLocker.
    //   1 - itr, kra
    //   2 - itr, digilocker
    const incomeTax = await verifyPanWithIncomeTax(pan);
    const itrName = String(incomeTax.data.full_name || "").trim();
    if (!incomeTax.valid || !itrName)
      return response
        .status(400)
        .json({
          message: "PAN could not be verified by the Income Tax service.",
        });

    const itr = {
      full_name: itrName,
      last_name: String(incomeTax.data.last_name || ""),
      category: String(incomeTax.data.category || ""),
      aadhaar_seeding_status: String(
        incomeTax.data.aadhaar_seeding_status || "",
      ),
    };
    const aadhaarLinked = isAadhaarLinked(itr.aadhaar_seeding_status);

    const itrSaved = await saveIncomeTaxDetails(leadId, [
      pan,
      dob,
      itr.full_name,
      itr.last_name,
      itr.category,
      itr.aadhaar_seeding_status,
    ]);

    if (kra.found) {
      const details = await enrichLocation({
        ...kraView(kra.data),
        aadhaar_number: maskedAadhaar(kra.data),
      });
      // saveKraDetails runs after saveIncomeTaxDetails, so it wins on the
      // shared columns (provider, current_stage) — the lead ends on the KRA route.
      const kraSaved = await saveKraDetails(leadId, [
        pan,
        dob,
        details.name,
        details.email,
        details.mobile,
        details.father_name,
        details.gender,
        details.address_1,
        details.address_2,
        details.address_3,
        details.city,
        details.district,
        details.state,
        details.pincode,
        details.kra_name,
        // details.kra_status is intentionally not persisted — the
        // kra_status column was dropped from kyc_master_details.
        details.aadhaar_number,
        dob,
        JSON.stringify(kra.raw),
      ]);
      return response.json({
        route: "KRA",
        message: "KRA details fetched successfully.",
        details,
        itr,
        aadhaarLinked,
        savedLead: kraSaved,
      });
    }

    return response.json({
      route: "INCOME_TAX",
      aadhaarLinked,
      message: aadhaarLinked
        ? "PAN verified. Continue to DigiLocker."
        : "PAN and Aadhaar are not linked. Link Aadhaar before proceeding.",
      itr_name: itrName,
      itr,
      details: itr,
      savedLead: itrSaved,
    });
  } catch (error) {
    return next(error);
  }
}

export async function checkExistingPanController(request, response, next) {
  try {
    const pan = String(request.body.pan_number || "")
      .trim()
      .toUpperCase();
    if (!panPattern.test(pan))
      return response
        .status(400)
        .json({ message: "Enter a valid PAN number." });
    if (await findExistingPan(pan))
      return response
        .status(409)
        .json({
          code: "ACCOUNT_EXISTS",
          message:
            "This PAN already exists in master data. An account is already registered.",
        });
    return response.json({
      ok: true,
      message: "PAN is not registered in master data.",
    });
  } catch (error) {
    return next(error);
  }
}

export function checkDobController(request, response) {
  const dob = String(request.body.dob || "");
  if (!dob)
    return response.status(400).json({ message: "Date of birth is required." });
  if (!isAdult(dob))
    return response
      .status(422)
      .json({
        code: "AGE_RESTRICTION",
        message: "You must be 18 years or older to proceed.",
      });
  return response.json({ ok: true, message: "Age eligibility verified." });
}
