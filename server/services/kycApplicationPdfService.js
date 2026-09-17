/**
 * kycApplicationPdfService.js — SINGLE-FILE KYC application PDF builder.
 *
 * Ported from the production implementation. Fills the real 42-page
 * Aionion/CDSL account-opening form (server/templates/UPDATED-CLIENT FORM.pdf)
 * with data from the single kyc_master_details row, allocating a BO ID from
 * master_data.boid_master and a DDPI stamp number from
 * master_data.stamp_paper_master along the way.
 *
 * Column notes (current schema):
 *   ddpi is a BOOLEAN (default-Yes unless explicitly false)
 *   KRA gender lives in kra_gender; DigiLocker gender lives in digilocker_gender.
 *   pan_card_file_path / signature_file_path hold the uploaded images
 *   bank_micr_code holds the MICR code
 *   nominees have only name/dob/relation/allocation per slot — no per-slot
 *     proof/mobile/email/address; a single top-level guardian_* set covers
 *     whichever nominee (if any) is a minor
 *   stamp_paper_master.assigned_application_id -> used_by ; assigned_at -> used_at
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { pool } from "../config/database.js";
import { masterPool } from "../config/masterDatabase.js";
import { resolveLocationFromPincode } from "./districtResolverService.js";
import { buildInvoicePageForApplication, resolveInvoiceNumber } from "./invoiceService.js";
import { readUploadFromS3, downloadStampPaperFromS3 } from "./s3StorageService.js";

const HARDCODED = {
  application_type: "New KYC",
  kyc_mode: "Online KYC / DigiLocker",
  nationality: "Indian",
  residential_status: "Resident Individual",
  account_opened_as_per: "Name as per Income Tax Department (itr_name)",
  country: "India",
  dp_name: "AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED",
  dp_id_cdsl: "12100800",
  depository: "CDSL",
  exchange_ids: "NSE: 90405, BSE: 6878",
  standing_instruction_credit: "Yes",
  account_statement_requirement: "As per SEBI Regulation",
  ddpi_default: "Yes",
  proprietary_trading_disclosure: "Noted",
  contract_note_mode: "Electronic Contract Note (ECN)",
  ipv_employee: "NANDAKUMAR S (ACM0008), MANAGER",
};

const HERE = import.meta.dirname;
const TEMPLATE_PATH = path.join(HERE, "..", "templates", "UPDATED-CLIENT FORM.pdf");

try {
  console.log(
    fs.existsSync(TEMPLATE_PATH)
      ? `[KycPdf] template FOUND -> overlay mode: ${TEMPLATE_PATH}`
      : `[KycPdf] template NOT found -> generated mode. Drop the blank form at: ${TEMPLATE_PATH}`,
  );
} catch {
  /* ignore */
}

const UPLOAD_ROOTS = [
  path.join(HERE, "..", "uploads"),
  path.join(HERE, "..", "..", "uploads"),
  "/tmp/uploads",
];

/* ------------------------------------------------------------------ helpers */

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const orDash = (v) => (str(v) === "" ? "-" : str(v));

/** Always render an Aadhaar number as XXXXXXXX + last 4 digits. */
const maskAadhaar = (value) => {
  const digits = str(value).replace(/\D/g, "");
  if (!digits) return "";
  return `XXXXXXXX${digits.slice(-4)}`;
};

const formatDate = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return str(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};

/** DDPI is YES unless it is explicitly false (business rule: default yes). ddpi is a BOOLEAN column. */
const isDdpiSelected = (row) => row.ddpi !== false;

/* --------------------------------------------------------------- data layer */

const loadApplication = async (kycId) => {
  const { rows } = await pool.query(`SELECT * FROM public.kyc_master_details WHERE id = $1`, [kycId]);
  if (!rows.length) {
    const e = new Error(`KYC application ${kycId} not found`);
    e.code = "APPLICATION_NOT_FOUND";
    throw e;
  }
  return rows[0];
};

/**
 * Resolve the BO ID: use kyc_master_details.boid if set, else allocate the
 * next AVAILABLE row from master_data.boid_master (mark ASSIGNED) and store it.
 * Also stamps boid_master.unique_id with kyc_master_details.unique_id so a
 * BO ID can be traced back to the client it was allocated to.
 * Throws { code: "BOID_MISSING" } if none can be obtained.
 */
const resolveBoid = async (kycId, existingBoid, uniqueId) => {
  if (str(existingBoid)) {
    // Backfill unique_id on rows allocated before this column existed.
    if (str(uniqueId)) {
      await masterPool
        .query(`UPDATE public.boid_master SET unique_id = $2 WHERE boid = $1 AND unique_id IS NULL`, [
          str(existingBoid),
          str(uniqueId),
        ])
        .catch((err) => console.error("[KycPdf] boid_master unique_id backfill failed:", err.message));
    }
    return str(existingBoid);
  }

  let allocated = "";
  try {
    const { rows } = await masterPool.query(
      `UPDATE public.boid_master
          SET status = 'ASSIGNED', assigned_at = NOW(), unique_id = $1
        WHERE boid = (
          SELECT boid FROM public.boid_master
           WHERE status = 'AVAILABLE'
           ORDER BY boid
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
      RETURNING boid`,
      [str(uniqueId) || null],
    );
    allocated = str(rows[0]?.boid);
  } catch (err) {
    console.error("[KycPdf] BOID allocation query failed:", err.message);
  }

  if (!allocated) {
    const e = new Error(
      "BOID is missing - no BO ID is assigned to this application and none is " +
        "available in master_data.boid_master. The application PDF cannot be generated.",
    );
    e.code = "BOID_MISSING";
    throw e;
  }

  await pool.query(
    `UPDATE public.kyc_master_details SET boid = $2, updated_at = NOW() WHERE id = $1`,
    [kycId, allocated],
  );
  return allocated;
};

/**
 * Resolve the DDPI stamp paper.
 *  - DDPI = No  -> null (no stamp page)
 *  - DDPI = Yes -> the stamp already assigned (used_by = kyc id), else
 *                  allocate the next AVAILABLE one (RESERVED), else { pending: true }
 */
const resolveStampPaper = async (kycId, ddpiSelected) => {
  if (!ddpiSelected) return null;

  const assigned = await masterPool.query(
    `SELECT id, stamp_number, image_name, image_path, image_data, status
       FROM public.stamp_paper_master
      WHERE used_by = $1
      ORDER BY id
      LIMIT 1`,
    [String(kycId)],
  );
  let stamp = assigned.rows[0];

  if (!stamp) {
    const alloc = await masterPool.query(
      `UPDATE public.stamp_paper_master
          SET status = 'RESERVED', used_by = $1, used_at = NOW()
        WHERE id = (
          SELECT id FROM public.stamp_paper_master
           WHERE status = 'AVAILABLE'
           ORDER BY id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
      RETURNING id, stamp_number, image_name, image_path, image_data, status`,
      [String(kycId)],
    );
    stamp = alloc.rows[0];
  }

  if (!stamp) return { pending: true };

  // kyc_master_details.stamp_paper_id already existed but nothing wrote to
  // it — mirror the allocated master_data.stamp_paper_master.id onto it.
  try {
    await pool.query(
      `UPDATE public.kyc_master_details SET stamp_paper_id = $2, updated_at = NOW()
        WHERE id = $1 AND stamp_paper_id IS DISTINCT FROM $2`,
      [kycId, stamp.id],
    );
  } catch (err) {
    console.error("[KycPdf] failed to store stamp_paper_id:", err.message);
  }

  return stamp;
};

const nomineeAge = (dobValue) => {
  if (!dobValue) return null;
  const birth = dobValue instanceof Date ? dobValue : new Date(dobValue);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
};

/**
 * Reshape the 3 nominee slots into an array (skips empty slots). Each slot
 * only has name/dob/relation/allocation — no per-slot proof/mobile/email/
 * address (dropped from the schema). Guardian details live in ONE top-level
 * set of columns (guardian_relation/name/mobile/address/dob); they're
 * attached to whichever nominee is actually a minor so the PDF's per-slot
 * Address/Mobile fields still get something meaningful for that nominee.
 */
const buildNominees = (row) => {
  const list = [];
  for (const n of [1, 2, 3]) {
    const name = str(row[`nominee_name_${n}`]);
    if (!name) continue;
    const isMinor = nomineeAge(row[`nominee_dob_${n}`]) !== null && nomineeAge(row[`nominee_dob_${n}`]) < 18;
    list.push({
      slot: n,
      name,
      relation: str(row[`nominee_relation_${n}`]),
      share: str(row[`nominee_allocation_percentage_${n}`]),
      proof_type: "",
      pan: "",
      aadhaar: "",
      dob: formatDate(row[`nominee_dob_${n}`]),
      address: isMinor ? str(row.guardian_address) : "",
      mobile: isMinor ? str(row.guardian_mobile) : "",
      email: "",
      city: str(row.city || row.digilocker_city),
      state: str(row.state || row.digilocker_state),
      pin: str(row.pincode || row.digilocker_pincode),
    });
  }
  return list;
};

const firstNonEmpty = (...values) =>
  values.find((value) => String(value || "").trim() !== "") || "";

const resolveMicrCode = (row) => str(row.bank_micr_code);

/**
 * Ordered { section, label, value, source } rows — the field map materialised.
 * Used by the clean generated fallback PDF.
 */
const buildFieldRows = (row, boid) => {
  const micr = resolveMicrCode(row);
  const fatherName =
    str(row.personal_father_name) || str(row.father_name) || str(row.digilocker_father_name);

  return [
    ["Application", "Application Type", HARDCODED.application_type, "hardcoded"],
    ["Application", "KYC Mode", HARDCODED.kyc_mode, "hardcoded"],
    ["Application", "Application Number", str(row.unique_id) || String(row.id), "kyc_master_details.unique_id"],
    ["Application", "Client Code / UCC", orDash(row.client_code), "kyc_master_details.client_code"],

    ["Identity", "Applicant Name", orDash(row.itr_name), "kyc_master_details.itr_name"],
    ["Identity", "Father / Spouse Name", orDash(fatherName), "personal_father_name | father_name | digilocker_father_name"],
    ["Identity", "Mother Name", orDash(row.mother_name), "kyc_master_details.mother_name"],
    ["Identity", "Date of Birth", orDash(formatDate(row.dob)), "kyc_master_details.dob"],
    ["Identity", "Gender", orDash(row.kra_gender || row.gender || row.digilocker_gender), "kra_gender | gender"],
    ["Identity", "Marital Status", orDash(row.marital_status), "kyc_master_details.marital_status"],
    ["Identity", "Nationality", HARDCODED.nationality, "hardcoded"],
    ["Identity", "Residential Status", HARDCODED.residential_status, "hardcoded"],
    ["Identity", "PAN", orDash(row.pan_number), "kyc_master_details.pan_number"],
    ["Identity", "Aadhaar (masked)", orDash(maskAadhaar(row.aadhaar_number || row.digilocker_aadhaar_number_masked)), "aadhaar_number | digilocker_aadhaar_number_masked"],
    ["Identity", "Account opened as per", HARDCODED.account_opened_as_per, "hardcoded"],

    ["Address", "Address Line 1", orDash(row.address_1 || row.digilocker_address), "address_1 | digilocker_address"],
    ["Address", "Address Line 2", orDash(row.address_2), "kyc_master_details.address_2"],
    ["Address", "Address Line 3", orDash(row.address_3), "kyc_master_details.address_3"],
    ["Address", "City / Town / Village", orDash(row.city || row.digilocker_city), "city | digilocker_city"],
    ["Address", "District", orDash(row.district || row.digilocker_district), "district | digilocker_district"],
    ["Address", "State", orDash(row.state || row.digilocker_state), "state | digilocker_state"],
    ["Address", "Pin Code", orDash(row.pincode || row.digilocker_pincode), "pincode | digilocker_pincode"],
    ["Address", "Country", HARDCODED.country, "hardcoded"],

    ["Contact", "Email ID", orDash(row.email), "kyc_master_details.email"],
    ["Contact", "Mobile No.", orDash(row.mobile_number), "kyc_master_details.mobile_number"],

    ["Bank", "Account No.", orDash(row.bank_account_number), "kyc_master_details.bank_account_number"],
    ["Bank", "Bank Name", orDash(row.bank_name), "kyc_master_details.bank_name"],
    ["Bank", "IFSC Code", orDash(row.bank_ifsc_code), "kyc_master_details.bank_ifsc_code"],
    ["Bank", "MICR Code", orDash(micr), "micr_code | bank_response->>micr_code"],
    ["Bank", "Branch", orDash(row.bank_branch_name || row.bank_address), "bank_branch_name | bank_address"],
    ["Bank", "Account Type", orDash(row.bank_account_type), "kyc_master_details.bank_account_type"],

    ["Profile", "Occupation", orDash(row.occupation), "kyc_master_details.occupation"],
    ["Profile", "Gross Annual Income", orDash(row.annual_income), "kyc_master_details.annual_income"],
    ["Profile", "Trading Experience", orDash(row.trading_experience), "kyc_master_details.trading_experience"],
    ["Profile", "Politically Exposed", row.politically_exposed === true ? "Yes" : row.politically_exposed === false ? "No" : "-", "kyc_master_details.politically_exposed"],
    ["Profile", "Net Worth", orDash(row.net_worth), "kyc_master_details.net_worth"],

    ["Depository", "DP Name", HARDCODED.dp_name, "hardcoded"],
    ["Depository", "DP ID (CDSL)", HARDCODED.dp_id_cdsl, "hardcoded"],
    ["Depository", "Depository", HARDCODED.depository, "hardcoded"],
    ["Depository", "Exchange & IDs", HARDCODED.exchange_ids, "hardcoded"],
    ["Depository", "BO ID", boid, "master_data.boid_master.boid"],
    ["Depository", "Standing Instruction (credit)", HARDCODED.standing_instruction_credit, "hardcoded"],
    ["Depository", "Account Statement Requirement", HARDCODED.account_statement_requirement, "hardcoded"],
  ];
};

/* ------------------------------------------------------- images (photo/sign) */

const readPublicUpload = async (publicPath) => {
  if (!str(publicPath)) return null;

  // Client uploads live in S3 now — try that first.
  const s3Bytes = await readUploadFromS3(publicPath);
  if (s3Bytes) return s3Bytes;

  // Fallback: local disk, for files never migrated (e.g. the seeded DDPI
  // stamp-paper scans, which stay local, or pre-migration leftovers).
  const rel = str(publicPath).replace(/^\/+/, "").replace(/^uploads\//, "");
  if (!rel) return null;
  for (const root of UPLOAD_ROOTS) {
    const abs = path.join(root, rel);
    try {
      if (fs.existsSync(abs)) return fs.readFileSync(abs);
    } catch {
      /* ignore */
    }
  }
  return null;
};

const base64ToBuffer = (value) => {
  const s = str(value);
  if (!s) return null;
  const b64 = s.includes(",") ? s.split(",").pop() : s;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
};

const loadApplicantImages = async (row) => {
  const sniff = (buf) => {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    return "jpg";
  };
  const wrap = (buf) => (buf ? { bytes: buf, kind: sniff(buf) } : null);

  const photoBuf =
    (await readPublicUpload(row.ipv_photo_path)) ||
    (await readPublicUpload(row.live_photo_url)) ||
    base64ToBuffer(row.digilocker_photo_base64);

  const digilockerPhotoBuf = base64ToBuffer(row.digilocker_photo_base64);
  const sigBuf = await readPublicUpload(row.signature_file_path);
  const panBuf = await readPublicUpload(row.pan_card_file_path);

  return {
    photo: wrap(photoBuf),
    digilockerPhoto: wrap(digilockerPhotoBuf),
    signature: wrap(sigBuf),
    panCard: wrap(panBuf),
  };
};

const drawImageBox = async (doc, page, image, box) => {
  if (!image || !image.bytes) return false;
  try {
    const embedded =
      image.kind === "png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
    const scale = Math.min(box.w / embedded.width, box.h / embedded.height);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    page.drawImage(embedded, {
      x: box.x + (box.w - w) / 2,
      y: box.y + (box.h - h) / 2,
      width: w,
      height: h,
    });
    return true;
  } catch (err) {
    console.warn("[KycPdf] image embed failed:", err.message);
    return false;
  }
};

/* ===================== OFFICIAL FORM FIELD MAP (overlay onto TEMPLATE_PATH) ===================== */

const splitValueAcrossFields = (value, fieldNames = [], options = {}) => {
  const normalized = str(value).replace(/\s+/g, " ");
  const preferredFieldIndex = Number(options.preferredFieldIndex);
  if (!normalized || fieldNames.length === 0) return {};
  if (
    fieldNames.length > 1 &&
    !Number.isNaN(preferredFieldIndex) &&
    preferredFieldIndex >= 0 &&
    preferredFieldIndex < fieldNames.length
  ) {
    return Object.fromEntries(
      fieldNames.map((fieldName, index) => [fieldName, index === preferredFieldIndex ? normalized : ""]),
    );
  }
  return {};
};

const buildAcroTextValues = (row, nominees, boid) => {
  const name = str(row.itr_name);
  const father = firstNonEmpty(row.personal_father_name, row.father_name, row.digilocker_father_name);
  const aadhaarMasked = maskAadhaar(row.aadhaar_number || row.digilocker_aadhaar_number_masked);
  const addr1 = firstNonEmpty(row.address_1, row.digilocker_address);
  const addr2 = str(row.address_2);
  const addr3 = str(row.address_3);
  const city = firstNonEmpty(row.city, row.digilocker_city);
  const district = firstNonEmpty(row.district, row.digilocker_district);
  const state = firstNonEmpty(row.state, row.digilocker_state);
  const pincode = firstNonEmpty(row.pincode, row.digilocker_pincode);
  const dob = formatDate(row.dob || row.provider_dob || row.digilocker_dob);
  const pan = str(row.pan_number).toUpperCase();
  const dpId = str(boid).replace(/\D/g, "").slice(0, 8);
  const clientId = str(boid).replace(/\D/g, "").slice(-8);
  const today = formatDate(new Date());
  const place = city || district || "";

  const values = {
    "Name same as ID proof": pan,
    Name: name,
    "FathersSpouses Name 1": father,
    "Date of birth": dob,
    "1_5": aadhaarMasked,
    "Line 1": addr1,
    "Line 2": addr2,
    Line3: addr3,
    "CityTownVillage 1": city,
    District: district,
    "Pin Code": pincode,
    Country: "India",
    "CityTownVillage 2": state,

    "Line 1 1": addr1,
    "Line 1 2": addr2,
    "TownVillage 1": city,
    District_2: district,
    "Pin Code_2": pincode,
    Country_2: "India",
    "TownVillage 2": state,
    "EMAIL ID": row.email,
    DATE: today,
    PLACE: place,
    "IPV Date": today,

    BOID: str(boid),
    "Client UCC": row.client_code,
    "Client Name": name,

    "NAME OF THE APPLICANT": name,
    "FATHERS/SPOUSE NAME": father,
    "2 B MOTHERS NAME": row.mother_name,
    "3 C DATE OF BIRTH": dob,
    "5 A PAN": pan,
    "5 B AADHAAR NO": aadhaarMasked,
    "1 ADDRESS FOR CORRESPONDENCRESIDENCERow1": addr1,
    "1 ADDRESS FOR CORRESPONDENCRESIDENCERow2": addr2,
    LANDMARK: addr3,
    CITY: city,
    DISTRICT: district,
    PINCODE: pincode,
    STATE: state,
    COUNTRY: "India",
    "4 PERMANENT ADDRESS OF RESIDENT APPLICANT IF DIFFERENT FROM ABOVE B1 OR OVERSEAS ADDRESS MANDATORY FOR NONRESIDENT APPLICANTRow1": addr1,
    "4 PERMANENT ADDRESS OF RESIDENT APPLICANT IF DIFFERENT FROM ABOVE B1 OR OVERSEAS ADDRESS MANDATORY FOR NONRESIDENT APPLICANTRow2": addr2,
    LANDMARK1: addr3,
    CITY1: city,
    DISTRICT1: district,
    PINCODE1: pincode,
    STATE1: state,
    COUNTRY1: "India",
    EMAIL: row.email,
    "MOBILE NUMBER": row.mobile_number,
    Place: place,

    "DP INTERVAL REFERENCE NUMBER": row.client_code,
    "SOLEFIRST HOLDERS NAME": name,

    "ACCOUNT NO": row.bank_account_number,
    "BANK NAME": row.bank_name,
    "BRANCH ADDRESS": row.bank_address,
    "BENEFICIARY ACCOUNT NOCDSL": str(boid),
    "BENEFICIARY NAMECDSL": name,
    "IF ECN SPECIFY YOUR EMAIL ID": row.email,

    "Networth n Rs": row.net_worth,
    "AS ON DATE": today,
    "TRADING EXPERIENCE": row.trading_experience,
    DATE_3: today,

    "NAME OF THE SOLEFIRST HOLDER": name,
    "Mobile Number": row.mobile_number,
    "DP ID": dpId,
    "DP ID CLIENT ID": clientId,

    UCC: row.client_code,
    "and have executed the Trad": row.client_code,
    "Sole  First Holders Name": name,
    "INe the cliens mentioned herein below holding BO ID 12100800": clientId,
    "SOLEFIRST HOLDER NAME": name,
  };

  nominees.slice(0, 3).forEach((nm, i) => {
    const n = i + 1;
    values[`NAME OF THE NOMINEES MRMS${n}`] = nm.name;
    values[`SHARE OF EQUALLY IF NOT EQUALLY PLEASE${n}`] = nm.share ? `${nm.share}%` : "";
    values[`RELATIONSHIP WITH THE APPLICANT IF ANY${n}`] = nm.relation;
    values[`Aadhaar  Mask first 8 digit number${n}`] = nm.aadhaar;
    values[`Address${n}`] = nm.address;
    values[`City${n}`] = nm.city;
    values[`State${n}`] = nm.state;
    values[`Pin${n}`] = nm.pin;
    values[`Mobile noTelephone No${n}`] = nm.mobile;
    values[`Email ID${n}`] = nm.email;
  });

  Object.assign(values, buildAcroSummaryPageValues(row, name, father));
  return values;
};

const buildAcroSummaryPageValues = (row, name, father) => {
  const isDigilockerFlow = Boolean(row.digilocker_name || row.digilocker_aadhaar_number_masked);
  const aadhaarMasked = maskAadhaar(row.aadhaar_number || row.digilocker_aadhaar_number_masked);
  const today = formatDate(new Date());
  const addr1 = firstNonEmpty(row.address_1, row.digilocker_address);
  const city = firstNonEmpty(row.city, row.digilocker_city);
  const district = firstNonEmpty(row.district, row.digilocker_district);
  const state = firstNonEmpty(row.state, row.digilocker_state);
  const pincode = firstNonEmpty(row.pincode, row.digilocker_pincode);

  if (isDigilockerFlow) {
    return {
      "Generation date": today,
      "Download Date": today,
      "Masked Aadhaar": aadhaarMasked,
      Name: name,
      "Date of Birth": formatDate(row.dob),
      Gender: str(row.kra_gender || row.gender || row.digilocker_gender),
      "C/O, S/O, D/O": father,
      Address: addr1,
      Landmark: str(row.address_3),
      "City/District": `${city} / ${district}`,
      Pincode: pincode,
      State: state,
    };
  }

  return {
    NAME: name,
    "DATE OF BIRTH": formatDate(row.dob),
    GENDER: str(row.kra_gender),
    ADDRESS: [addr1, row.address_2, city, state, pincode].map(str).filter(Boolean).join(", "),
    "PROOF OF ADDRESS POA": "KRA",
    "PROOF OF IDENTITY POI": "PAN",
    "GENERATED ON": today,
  };
};

const buildAcroCheckboxNames = (row) => {
  const genderLc = str(row.kra_gender || row.gender || row.digilocker_gender).toLowerCase();
  const marriedLc = str(row.marital_status).toLowerCase();
  const isDigilockerFlow = Boolean(row.digilocker_name || row.digilocker_aadhaar_number_masked);
  const income = str(row.annual_income).toLowerCase();
  const occupation = str(row.occupation).toLowerCase();
  const statementFrequency = str(row.account_statement_requirement).toLowerCase();

  const names = [
    "NEW KYC", "Indian", "Resident Individual", "Residential/Business", "Residential/Business1",
    "Aadhaar Card", "A",
    "INDIAN", "RI", "UID",
    "INDIVIDUAL-STATUS", "INDIVIDUAL RES-SUB STATUS",
    "YES", "YES1", "YES2", "ASR-PER SEBI", "YES-RTA", "ANNUAL REPORT ELECTRONIC", "YES-ECS",
    "YES-INT TRADING", "NO-PAST ACTION", "ELECTRONIC-ADD",
    "INVESTEMENT-POOTA",
    "OPTION2-OFI",
    "I/WE WISH",
    "NAME-AMC/DP",
    "I/WE QUARTERLY",
  ];

  if (genderLc.startsWith("male")) names.push("Male", "MALE");
  else if (genderLc.startsWith("female")) names.push("Female", "FEMALE");
  else if (genderLc) names.push("Transgender");

  if (marriedLc.startsWith("marr")) names.push("Married", "MARRIED");
  else names.push("Single", "SINGLE");

  if (isDigilockerFlow) names.push("Digilocker");

  if (str(row.bank_account_type).toLowerCase().startsWith("curr")) names.push("CURRENT");
  else names.push("SAVINGS");

  if (/below\s*1|<\s*1/.test(income)) names.push("BELOW 1 LAC-GAID");
  else if (/1[\s-]*5/.test(income)) names.push("1-5 LAC-GAID");
  else if (/5[\s-]*10/.test(income)) names.push("5-10 LAC-GAID");
  else if (/10[\s-]*25/.test(income)) names.push("10-25 LAC-GAID");
  else if (/>\s*25|above\s*25/.test(income)) names.push(">25 LAC-GAID");

  if (row.politically_exposed === true) names.push("PEP-PEP");

  if (str(row.selected_scheme) === "annualCare") names.push("SCHEME 2-ACC CHARGES");
  else if (str(row.selected_scheme) === "lifeTime") names.push("SCHEME 1-ACC CHARGES");

  const OCCUPATION_CHECKBOX = {
    "private sector": "PVT-OCC",
    "public sector": "PUB-OCC",
    "government service": "GOV SER-OCC",
    professional: "PROFESSIONAL-OCC",
    agriculturist: "AGRI-OCC",
    retired: "RET-OCC",
    housewife: "HOUSEWIFE-OCC",
    business: "BUSINESS-OCC",
    student: "STUDENT-OCC",
  };
  names.push(OCCUPATION_CHECKBOX[occupation] || (occupation ? "OTHERS-OCC" : null));

  const STATEMENT_FREQUENCY_CHECKBOX = {
    daily: "DAILY ASR-PER SEBI",
    weekly: "WEEKLY",
    fortnightly: "FORTNIGHTYLY",
    monthly: "MONTHLY",
  };
  names.push(STATEMENT_FREQUENCY_CHECKBOX[statementFrequency] || null);

  return names.filter(Boolean);
};

const buildAcroTextOverlays = (row) => {
  const name = str(row.itr_name);
  const overlays = [{ pageIndex: 24, x: 125, y: 746, size: 10, text: name }];
  return overlays.filter((o) => str(o.text));
};

const fillOfficialAcroForm = async (doc, rowInput, nominees, boid, images) => {
  let row = rowInput;
  const form = doc.getForm();
  const measureFont = await doc.embedFont(StandardFonts.Helvetica);
  const TEXT_BOX_PADDING = 4;
  const MIN_AUTO_FIT_FONT_SIZE = 5;

  const estimateWrappedLineCount = (text, fontSize, maxWidth) => {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return 1;
    const spaceWidth = measureFont.widthOfTextAtSize(" ", fontSize);
    let lines = 1;
    let lineWidth = 0;
    words.forEach((word) => {
      const wordWidth = measureFont.widthOfTextAtSize(word, fontSize);
      if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > maxWidth) {
        lines += 1;
        lineWidth = wordWidth;
      } else {
        lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth;
      }
    });
    return lines;
  };

  const setText = (fieldName, textValue, size = 9, options = {}) => {
    try {
      const field = form.getTextField(fieldName);
      if (options.forceMultiline && !field.isMultiline()) field.enableMultiline();
      let fontSize = size;
      try {
        const widgets = field.acroField.getWidgets();
        const rect = widgets[0]?.getRectangle();
        if (rect && textValue) {
          const maxWidth = rect.width - TEXT_BOX_PADDING;
          if (field.isMultiline()) {
            const maxHeight = rect.height - TEXT_BOX_PADDING;
            let lines = estimateWrappedLineCount(textValue, fontSize, maxWidth);
            while (lines * fontSize * 1.15 > maxHeight && fontSize > MIN_AUTO_FIT_FONT_SIZE) {
              fontSize -= 0.5;
              lines = estimateWrappedLineCount(textValue, fontSize, maxWidth);
            }
          } else {
            const textWidth = measureFont.widthOfTextAtSize(textValue, fontSize);
            if (textWidth > maxWidth) {
              fontSize = Math.max(MIN_AUTO_FIT_FONT_SIZE, fontSize * (maxWidth / textWidth));
            }
          }
        }
      } catch {
        /* couldn't measure */
      }
      try {
        field.setFontSize(fontSize);
      } catch {
        /* no /DA */
      }
      const maxLen = field.getMaxLength();
      field.setText(maxLen && textValue.length > maxLen ? textValue.slice(0, maxLen) : textValue);
    } catch (err) {
      console.warn(`[KycPdf] text field "${fieldName}" not set:`, err.message);
    }
  };

  const districtMissing = !firstNonEmpty(row.district, row.digilocker_district);
  const stateMissing = !firstNonEmpty(row.state, row.digilocker_state);
  if (districtMissing || stateMissing) {
    const pincode = firstNonEmpty(row.pincode, row.digilocker_pincode);
    const resolved = await resolveLocationFromPincode(pincode);
    const patch = {};
    if (districtMissing && resolved.district) patch.district = resolved.district;
    if (stateMissing && resolved.state) patch.state = resolved.state;
    if (Object.keys(patch).length > 0) row = { ...row, ...patch };
  }

  const FORCE_MULTILINE_FIELDS = { Address: 8, "BRANCH ADDRESS": 7 };

  const textValues = buildAcroTextValues(row, nominees, boid);
  Object.entries(textValues).forEach(([fieldName, value]) => {
    const text = str(value);
    if (!text) return;
    if (FORCE_MULTILINE_FIELDS[fieldName] !== undefined) {
      setText(fieldName, text, FORCE_MULTILINE_FIELDS[fieldName], { forceMultiline: true });
    } else {
      setText(fieldName, text);
    }
  });

  if (str(row.mobile_number)) setText("1_9", str(row.mobile_number), 10);

  buildAcroCheckboxNames(row).forEach((fieldName) => {
    try {
      form.getCheckBox(fieldName).check();
    } catch (err) {
      console.warn(`[KycPdf] checkbox "${fieldName}" not set:`, err.message);
    }
  });

  const embedForButton = async (image) => {
    if (!image || !image.bytes) return null;
    return image.kind === "png" ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes);
  };
  const setButtonImage = async (fieldName, image) => {
    try {
      const embedded = await embedForButton(image);
      if (embedded) form.getButton(fieldName).setImage(embedded);
    } catch (err) {
      console.warn(`[KycPdf] image field "${fieldName}" not set:`, err.message);
    }
  };
  await setButtonImage("Client Photo_af_image", images.photo);
  await setButtonImage("Client Signature_af_image", images.signature);
  await setButtonImage("Client PAN_af_image", images.panCard);
  await setButtonImage("Photo_af_image", images.digilockerPhoto);

  try {
    form.updateFieldAppearances();
  } catch (err) {
    console.warn("[KycPdf] updateFieldAppearances failed:", err.message);
  }

  const pages = doc.getPages();
  buildAcroTextOverlays(row).forEach(({ pageIndex, x, y, size, text }) => {
    const page = pages[pageIndex];
    if (!page) return;
    page.drawText(text, { x, y, size, font: measureFont, color: rgb(0.05, 0.05, 0.1) });
  });

  if (pages[8] && images.signature) {
    await drawImageBox(doc, pages[8], images.signature, { x: 446.07, y: 665.34, w: 95.56, h: 28.07 });
  }
};

/**
 * Setu's eSign / ESP signing engine re-serialises the PDF when it affixes the
 * Aadhaar signature, and bails out with "Signature generation failure" if the
 * document still carries:
 *   - orphaned /Widget refs left by pdf-lib's form.flatten() (the field
 *     objects are deleted but their refs stay in each page's /Annots and
 *     now dangle), or
 *   - markup/comment annotations baked into the template (/FreeText,
 *     /Square, /Line, /Popup, /Highlight, /StrikeOut … — review cruft on
 *     UPDATED-CLIENT FORM.pdf).
 *
 * Strip every annotation except /Link so the PDF handed to Setu is truly flat.
 */
const stripNonLinkAnnotations = (pdfDoc) => {
  let removed = 0;
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots?.();
    if (!annots || typeof annots.size !== "function") continue;
    const keep = [];
    for (let i = 0; i < annots.size(); i += 1) {
      const ref = annots.get(i);
      let dict;
      try {
        dict = pdfDoc.context.lookup(ref);
      } catch {
        dict = null;
      }
      const subtype = dict?.get?.(PDFName.of("Subtype"))?.toString();
      if (subtype === "/Link") {
        keep.push(ref);
      } else {
        removed += 1;
      }
    }
    if (keep.length !== annots.size()) {
      if (keep.length === 0) {
        page.node.delete(PDFName.of("Annots"));
      } else {
        page.node.set(PDFName.of("Annots"), pdfDoc.context.obj(keep));
      }
    }
  }
  if (removed) console.log(`[KycPdf] stripped ${removed} annotation(s) before eSign`);
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const buildStampPaperPage = async ({ row, boid, stamp }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Real scanned stamp paper: bytea from stamp_paper_master, or its scan in
  // the stamp-papers S3 bucket.
  const stampImageBytes =
    (stamp && Buffer.isBuffer(stamp.image_data) && stamp.image_data.length ? stamp.image_data : null) ||
    (stamp && stamp.image_path ? await downloadStampPaperFromS3(stamp.image_path) : null);

  if (stampImageBytes) {
    try {
      let embedded;
      try {
        embedded = await doc.embedJpg(stampImageBytes);
      } catch {
        embedded = await doc.embedPng(stampImageBytes);
      }
      page.drawImage(embedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

      // No BOID overlay — the scanned stamp paper is shown as-is; only the
      // Aadhaar eSign signature is affixed on top of it (elsewhere).

      return Buffer.from(await doc.save());
    } catch (err) {
      console.warn("[KycPdf] stamp image embed failed, using text page:", err.message);
    }
  }

  // Fallback: plain text page (no image available for the allocated stamp).
  const accent = rgb(0.15, 0.25, 0.58);
  const muted = rgb(0.45, 0.47, 0.55);
  const M = 40;
  let y = PAGE_H - M;

  page.drawText("DDPI - Assigned Stamp Paper", { x: M, y, size: 13, font: bold, color: accent });
  y -= 20;
  page.drawText(
    `In favour of AIONION CAPITAL MARKET SERVICES PVT LTD, BO ID ${boid}, for ${orDash(row.itr_name)}.`,
    { x: M, y, size: 9, font, maxWidth: PAGE_W - 2 * M },
  );
  y -= 30;
  if (stamp && !stamp.pending) {
    page.drawText("Stamp Paper No.:", { x: M, y, size: 9, font, color: muted });
    page.drawText(orDash(stamp.stamp_number), { x: M + 120, y, size: 11, font: bold });
  } else {
    page.drawText("Stamp Paper No.: PENDING - none available in stamp_paper_master. Contact admin.", {
      x: M, y, size: 9, font, color: rgb(0.7, 0.2, 0.2),
    });
  }
  return Buffer.from(await doc.save());
};

const renderOntoTemplate = async ({ row, nominees, ddpiSelected, stamp, boid, images }) => {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const officialDoc = await PDFDocument.load(templateBytes);
  await fillOfficialAcroForm(officialDoc, row, nominees, boid, images);
  officialDoc.getForm().flatten();

  const overlayFont = await officialDoc.embedFont(StandardFonts.Helvetica);
  const overlayBold = await officialDoc.embedFont(StandardFonts.HelveticaBold);
  const overlayPages = officialDoc.getPages();
  const pan = str(row.pan_number).toUpperCase();
  const aadhaarMasked = maskAadhaar(row.aadhaar_number || row.digilocker_aadhaar_number_masked);
  const dpId = str(boid).replace(/\D/g, "").slice(0, 8);
  const clientId = str(boid).replace(/\D/g, "").slice(-8);

  const paintBox = (page, rect, text) => {
    page.drawRectangle({
      x: rect.x + 0.75,
      y: rect.y + 0.75,
      width: rect.width - 1.5,
      height: rect.height - 1.5,
      color: rgb(1, 1, 1),
    });
    if (text) {
      page.drawText(str(text), {
        x: rect.x + 3,
        y: rect.y + 4,
        size: 8,
        font: overlayFont,
        color: rgb(0.05, 0.05, 0.1),
      });
    }
  };

  const paintComb = (page, rect, text, cellCount, options = {}) => {
    const chars = str(text).slice(0, cellCount).split("");
    const cellWidth = rect.width / cellCount;
    const size = options.size || 9;
    chars.forEach((ch, i) => {
      const charWidth = overlayFont.widthOfTextAtSize(ch, size);
      const cellX = rect.x + i * cellWidth;
      page.drawText(ch, {
        x: cellX + (cellWidth - charWidth) / 2,
        y: rect.y + (options.yOffset ?? 4),
        size,
        font: overlayFont,
        color: rgb(0.05, 0.05, 0.1),
      });
    });
  };

  const bankPage = overlayPages[10];
  if (bankPage) {
    const micr = resolveMicrCode(row);
    const ifsc = row.bank_ifsc_code || "";
    paintBox(bankPage, { x: 162.951, y: 687.762, width: 135.57, height: 15.72 }, micr);
    paintBox(bankPage, { x: 385.839, y: 687.48, width: 153.921, height: 15.72 }, ifsc);
    paintBox(bankPage, { x: 163.491, y: 671.57, width: 135.569, height: 15.72 }, "");
  }

  const demtAccPage = overlayPages[9];
  if (demtAccPage) {
    paintBox(demtAccPage, { x: 120.087, y: 463.705, width: 123.753, height: 13.68 }, pan);
    paintBox(demtAccPage, { x: 342.491, y: 464.4, width: 191.389, height: 13.68 }, aadhaarMasked);
    paintBox(demtAccPage, { x: 119.869, y: 449.742, width: 123.753, height: 13.68 }, "");
  }

  const nominationPage = overlayPages[14];
  if (nominationPage) {
    paintBox(nominationPage, { x: 362.285, y: 723.772, width: 73.538, height: 17.618 }, dpId);
    paintBox(nominationPage, { x: 486.648, y: 724.208, width: 58.265, height: 17.619 }, clientId);
  }

  const optOutPage = overlayPages[17];
  if (optOutPage) {
    paintBox(optOutPage, { x: 222.14, y: 624.823, width: 118.122, height: 15.84 }, "");
  }

  const smsAlertPage = overlayPages[37];
  if (smsAlertPage) {
    const boidDigits = str(boid).replace(/\D/g, "");
    paintBox(smsAlertPage, { x: 125.324, y: 281.651, width: 391.56, height: 22.385 }, "");
    paintComb(smsAlertPage, { x: 125.324, y: 281.651, width: 391.56 }, boidDigits, 16, { size: 11, yOffset: 6 });
    // "Mobile Number on which messages are to be sent" row. Box edges read
    // straight off the template's content stream: "+91" occupies the wide
    // cell up to x 192.3, then 10 digit boxes of ~30.75pt each up to x 499.8;
    // the row's boxes span y 207.9 -> 240.0 (32.1pt tall).
    const mobileDigits = str(row.mobile_number).replace(/\D/g, "").slice(-10);
    paintComb(
      smsAlertPage,
      { x: 192.3, y: 207.9, width: 499.8 - 192.3 },
      mobileDigits,
      10,
      { size: 11, yOffset: 11 },
    );
  }

  // DigiLocker "Verified Aadhaar" summary page (index 3). pdf-lib's
  // form.flatten() drops the field-border styling and a couple of the static
  // label widgets on this page, so the table comes out borderless with no
  // heading. Redraw the frame + heading + "CONFIDENTIAL" tag on top of the
  // (already-flattened) values. Only relevant for the DigiLocker route.
  const isDigilockerFlow = Boolean(row.digilocker_name || row.digilocker_aadhaar_number_masked);
  const digilockerPage = overlayPages[3];
  if (isDigilockerFlow && digilockerPage) {
    const LEFT = 50;
    const RIGHT = 513;
    const LABEL_R = 189;
    const SUB_L = 306; // right-hand label column start on split rows
    const SUB_V = 393; // right-hand value column start on split rows
    const PHOTO_L = 396;
    const line = (x1, y, x2) =>
      digilockerPage.drawLine({
        start: { x: x1, y },
        end: { x: x2, y },
        thickness: 0.8,
        color: rgb(0.1, 0.1, 0.1),
      });
    const vline = (x, y1, y2) =>
      digilockerPage.drawLine({
        start: { x, y: y1 },
        end: { x, y: y2 },
        thickness: 0.8,
        color: rgb(0.1, 0.1, 0.1),
      });

    // heading + consent subtitle
    const title = "Digilocker Verified Aadhaar";
    digilockerPage.drawText(title, {
      x: 297.66 - overlayBold.widthOfTextAtSize(title, 12) / 2,
      y: 795,
      size: 12,
      font: overlayBold,
      color: rgb(0, 0, 0),
    });
    [
      "This document is generated from verified Aadhaar XML obtained From Digilocker with",
      "due user consent and authentication",
    ].forEach((textLine, i) => {
      digilockerPage.drawText(textLine, {
        x: 297.66 - overlayFont.widthOfTextAtSize(textLine, 10) / 2,
        y: 774 - i * 13,
        size: 10,
        font: overlayFont,
        color: rgb(0, 0, 0),
      });
    });

    // full-width horizontal separators (top, and the rows without a photo cell)
    [750, 728, 707, 687, 517, 498, 478, 457].forEach((y) => line(LEFT, y, RIGHT));
    // Name / DOB / Gender / C-O rows: stop at the photo column so the "Photo"
    // cell (which spans Name -> Address on the right) isn't crossed
    [667, 647, 627, 607].forEach((y) => line(LEFT, y, PHOTO_L));

    vline(LEFT, 457, 750);
    vline(RIGHT, 457, 750);
    vline(LABEL_R, 457, 750);
    // split rows: Generation/Download, Landmark/Locality, Pincode/State
    [[707, 728], [498, 517], [457, 478]].forEach(([y1, y2]) => {
      vline(SUB_L, y1, y2);
      vline(SUB_V, y1, y2);
    });
    // photo column divider (Name row top down to end of Address row)
    vline(PHOTO_L, 517, 687);

    // "CONFIDENTIAL" tag (red) — the black "For Limited Circulation" prefix
    // still renders from the template.
    digilockerPage.drawText("CONFIDENTIAL", {
      x: 348,
      y: 431,
      size: 10.5,
      font: overlayBold,
      color: rgb(0.85, 0.1, 0.1),
    });
  }

  const finalDoc = await PDFDocument.create();
  const sources = [officialDoc];

  if (ddpiSelected) {
    const stampBytes = await buildStampPaperPage({ row, boid, stamp });
    sources.push(await PDFDocument.load(stampBytes));
  }

  // Account-opening invoice — the last page for every client, after the DDPI
  // stamp-paper page when one is present.
  try {
    const invoiceBytes = await buildInvoicePageForApplication(row);
    sources.push(await PDFDocument.load(invoiceBytes));
  } catch (err) {
    console.warn("[KycPdf] invoice page skipped:", err.message);
  }

  for (const src of sources) {
    const copied = await finalDoc.copyPages(src, src.getPageIndices());
    copied.forEach((p) => finalDoc.addPage(p));
  }

  // Make the merged document truly flat before it goes to Setu eSign.
  stripNonLinkAnnotations(finalDoc);

  return Buffer.from(await finalDoc.save());
};

/* --------------------------------------------------------------- clean fallback PDF */

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 48;

const drawPdf = async ({ fieldRows, nominees, ddpiSelected, stamp, boid, appId, images, row }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.09, 0.11, 0.2);
  const muted = rgb(0.42, 0.45, 0.55);
  const accent = rgb(0.15, 0.25, 0.58);
  const line = rgb(0.82, 0.85, 0.95);

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - MARGIN;
  };
  const need = (space) => {
    if (y - space < MARGIN) newPage();
  };
  const text = (s, x, yy, opts = {}) =>
    page.drawText(str(s) || "", {
      x,
      y: yy,
      size: opts.size || 9.5,
      font: opts.bold ? bold : font,
      color: opts.color || ink,
      maxWidth: opts.maxWidth,
      lineHeight: (opts.size || 9.5) + 2,
    });

  text("AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED", MARGIN, y, { bold: true, size: 12, color: accent });
  y -= 16;
  text("Individual Account Opening Form (Trading & DP)  -  KYC Application", MARGIN, y, { size: 9, color: muted });
  y -= 12;
  text(`Application ID: ${appId}    BO ID: ${boid}    Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, MARGIN, y, { size: 8, color: muted });
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 1, color: line });
  y -= 22;

  let currentSection = "";
  const labelX = MARGIN;
  const valueX = MARGIN + 190;
  const srcX = MARGIN + 190;

  for (const [section, label, value, source] of fieldRows) {
    if (section !== currentSection) {
      need(46);
      y -= 6;
      text(section.toUpperCase(), MARGIN, y, { bold: true, size: 10, color: accent });
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 0.75, color: line });
      y -= 16;
      currentSection = section;
    }
    need(26);
    text(label, labelX, y, { size: 9, color: muted });
    text(value, valueX, y, { size: 9.5, bold: true, maxWidth: PAGE.w - MARGIN - valueX });
    y -= 11;
    text(`from: ${source}`, srcX, y, { size: 6.5, color: muted });
    y -= 15;
  }

  need(40);
  y -= 6;
  text("NOMINEES", MARGIN, y, { bold: true, size: 10, color: accent });
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 0.75, color: line });
  y -= 16;
  if (!nominees.length) {
    text("No nominee added.", MARGIN, y, { size: 9, color: muted });
    y -= 16;
  } else {
    for (const nm of nominees) {
      need(60);
      text(`Nominee ${nm.slot}`, MARGIN, y, { bold: true, size: 9.5 });
      y -= 13;
      const cells = [
        ["Name", nm.name],
        ["Relationship", orDash(nm.relation)],
        ["Share %", orDash(nm.share)],
        ["ID Proof", orDash(nm.proof_type)],
        ["PAN", orDash(nm.pan)],
        ["Aadhaar (masked)", orDash(nm.aadhaar)],
        ["DOB", orDash(nm.dob)],
      ];
      for (const [l, v] of cells) {
        need(20);
        text(l, MARGIN + 12, y, { size: 8.5, color: muted });
        text(v, MARGIN + 130, y, { size: 9 });
        y -= 12;
      }
      y -= 6;
    }
  }

  if (ddpiSelected) {
    newPage();
    text("DEMAT DEBIT AND PLEDGE INSTRUCTION (DDPI)", MARGIN, y, { bold: true, size: 12, color: accent });
    y -= 18;
    text("DDPI selected: Yes", MARGIN, y, { size: 10, bold: true });
    y -= 24;
    text("In favour of AIONION CAPITAL MARKET SERVICES PVT LTD, BO ID 12100800.", MARGIN, y, { size: 9, maxWidth: PAGE.w - 2 * MARGIN });
    y -= 26;
    text("ASSIGNED STAMP PAPER", MARGIN, y, { bold: true, size: 10, color: accent });
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 0.75, color: line });
    y -= 18;
    if (stamp && stamp.pending) {
      text("Stamp Paper No.:  PENDING - none available in stamp_paper_master. Contact admin.", MARGIN, y, { size: 9, color: rgb(0.7, 0.2, 0.2) });
      y -= 14;
    } else if (stamp) {
      text("Stamp Paper No.:", MARGIN, y, { size: 9, color: muted });
      text(orDash(stamp.stamp_number), MARGIN + 130, y, { size: 10, bold: true });
      y -= 14;
    }
  }

  newPage();
  text("APPLICANT PHOTO & SIGNATURE", MARGIN, y, { bold: true, size: 12, color: accent });
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 0.75, color: line });
  y -= 24;

  text("Live Photo", MARGIN, y, { size: 9, color: muted });
  const photoBox = { x: MARGIN, y: y - 150, w: 150, h: 140 };
  page.drawRectangle({ ...photoBox, borderColor: line, borderWidth: 1 });
  if (!(await drawImageBox(doc, page, images && images.photo, photoBox))) {
    text("(no photo on file)", MARGIN + 20, y - 80, { size: 8, color: muted });
  }

  text("Signature", MARGIN + 300, y, { size: 9, color: muted });
  const sigBox = { x: MARGIN + 300, y: y - 90, w: 190, h: 70 };
  page.drawRectangle({ ...sigBox, borderColor: line, borderWidth: 1 });
  if (!(await drawImageBox(doc, page, images && images.signature, sigBox))) {
    text("(no signature on file)", MARGIN + 320, y - 55, { size: 8, color: muted });
  }

  y -= 175;
  text("PAN Card", MARGIN, y, { size: 9, color: muted });
  const panBox = { x: MARGIN, y: y - 160, w: 300, h: 150 };
  page.drawRectangle({ ...panBox, borderColor: line, borderWidth: 1 });
  if (!(await drawImageBox(doc, page, images && images.panCard, panBox))) {
    text("(no PAN card image on file)", MARGIN + 20, y - 85, { size: 8, color: muted });
  }

  if (row) {
    try {
      const invoiceBytes = await buildInvoicePageForApplication(row);
      const invDoc = await PDFDocument.load(invoiceBytes);
      const copied = await doc.copyPages(invDoc, invDoc.getPageIndices());
      copied.forEach((p) => doc.addPage(p));
    } catch (err) {
      console.warn("[KycPdf] invoice page skipped:", err.message);
    }
  }

  const total = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${total}  -  Aionion Capital  -  For eSign`, {
      x: MARGIN, y: 24, size: 7, font, color: muted,
    });
  });

  return Buffer.from(await doc.save());
};

/* ---------------------------------------------------------------- entrypoint */

/**
 * Generate the KYC application PDF for one application.
 * @param {number|string} kycId  kyc_master_details.id
 * @throws Error .code === "BOID_MISSING" | "APPLICATION_NOT_FOUND"
 */
export async function generateKycApplicationPdf(kycId) {
  const row = await loadApplication(kycId);

  const boid = await resolveBoid(row.id, row.boid, row.unique_id);
  const ddpiSelected = isDdpiSelected(row);
  const stamp = await resolveStampPaper(row.id, ddpiSelected);
  const images = await loadApplicantImages(row);

  const fieldRows = buildFieldRows(row, boid);
  const nominees = buildNominees(row);

  const useTemplate = fs.existsSync(TEMPLATE_PATH);
  const buffer = useTemplate
    ? await renderOntoTemplate({ row, boid, nominees, ddpiSelected, stamp, images })
    : await drawPdf({ fieldRows, nominees, ddpiSelected, stamp, boid, appId: row.id, images, row });

  const pdfDoc = await PDFDocument.load(buffer);

  let invoiceNumber = null;
  try {
    invoiceNumber = await resolveInvoiceNumber(row.id);
  } catch (err) {
    console.warn("[KycPdf] invoice number lookup failed:", err.message);
  }

  return {
    buffer,
    fileName: `account_opening_${row.id}.pdf`,
    boid,
    invoiceNumber,
    mode: useTemplate ? "template-overlay" : "generated",
    images_embedded: {
      photo: Boolean(images.photo),
      signature: Boolean(images.signature),
      pan_card: Boolean(images.panCard),
    },
    pageCount: pdfDoc.getPageCount(),
    ddpiSelected,
    stampNumber: stamp && !stamp.pending ? stamp.stamp_number : null,
    fields: fieldRows.map(([section, label, value, source]) => ({ section, label, value, source })),
  };
}

export { maskAadhaar, HARDCODED };
