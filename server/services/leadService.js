import { pool } from "../config/database.js";
import { GET_LEAD_CONTACT, GET_LEAD_SUMMARY, INSERT_LEAD, MARK_CLIENT_LINK_SENT, SAVE_DIGILOCKER_DETAILS, SAVE_INCOME_TAX_DETAILS, SAVE_ITR_NAME, SAVE_KRA_DETAILS, SAVE_PERSONAL_DETAILS, SAVE_SCHEME, SAVE_VERIFIED_BANK_DETAILS, UPDATE_PAN_IMAGE, UPDATE_SIGNATURE_IMAGE } from "../queries/leadQueries.js";

// kyc_master_details.unique_id is a plain varchar(16) NOT NULL UNIQUE column
// with no DB default. Per explicit instruction, values are sequential
// ("01", "02", ... "99", "100", ...) rather than a random token — the app
// must compute the next one itself. NOTE: this is also the token used in the
// client's emailed link (…/?id=<unique_id>), so sequential values make those
// links guessable/enumerable; this tradeoff was explicitly accepted.
async function nextSequentialUniqueId() {
  const { rows } = await pool.query(
    `SELECT unique_id FROM kyc_master_details
      WHERE unique_id ~ '^[0-9]+$'
      ORDER BY LENGTH(unique_id) DESC, unique_id DESC
      LIMIT 1`,
  );
  let next = 1;
  if (rows.length > 0) {
    const parsed = parseInt(rows[0].unique_id, 10);
    if (!Number.isNaN(parsed)) next = parsed + 1;
  }
  return String(next).padStart(2, "0");
}

export async function createLead({ client_name, mobile_number, email }) {
  // A collision here means two inserts computed the same next number
  // concurrently — recompute (it'll be one higher) and retry rather than
  // ever 500 on it.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const uniqueId = await nextSequentialUniqueId();
      const result = await pool.query(INSERT_LEAD, [client_name, mobile_number, email, uniqueId]);
      return result.rows[0];
    } catch (error) {
      const isUniqueIdCollision = error.code === "23505" && String(error.constraint || "").includes("unique_id");
      if (!isUniqueIdCollision || attempt === 4) throw error;
    }
  }
}

export async function getLeadSummary(leadId) {
  const result = await pool.query(GET_LEAD_SUMMARY, [leadId]);
  return result.rows[0] || null;
}

export async function getLeadContact(leadId) {
  const result = await pool.query(GET_LEAD_CONTACT, [leadId]);
  return result.rows[0] || null;
}

export async function markClientLinkSent(leadId) {
  const result = await pool.query(MARK_CLIENT_LINK_SENT, [leadId]);
  return result.rows[0] || null;
}

export async function savePanImage(leadId, panImagePath, fileName, fileType) {
  const result = await pool.query(UPDATE_PAN_IMAGE, [leadId, panImagePath, fileName || null, fileType || null]);
  return result.rows[0];
}

export async function getLeadPanImage(leadId) {
  const result = await pool.query("SELECT id, pan_card_file_path FROM kyc_master_details WHERE id=$1 LIMIT 1", [leadId]);
  return result.rows[0] || null;
}

export async function saveSignatureImage(leadId, signatureImagePath, fileName, fileType) {
  const result = await pool.query(UPDATE_SIGNATURE_IMAGE, [leadId, signatureImagePath, fileName || null, fileType || null]);
  return result.rows[0];
}

export async function saveKraDetails(leadId, details) { const result = await pool.query(SAVE_KRA_DETAILS, [leadId, ...details]); return result.rows[0]; }
export async function saveIncomeTaxDetails(leadId, details) { const result = await pool.query(SAVE_INCOME_TAX_DETAILS, [leadId, ...details]); return result.rows[0]; }
export async function saveItrName(leadId, name) { const result = await pool.query(SAVE_ITR_NAME, [leadId, name]); return result.rows[0]; }
export async function saveDigilockerDetails(leadId, details, raw) {
  const values = [details.name, details.father_name, details.gender, details.dob, details.aadhaar_number_masked, details.address, details.city, details.district, details.state, details.pincode, details.photo_base64, details.provider, JSON.stringify(raw)];
  const result = await pool.query(SAVE_DIGILOCKER_DETAILS, [leadId, ...values]);
  return result.rows[0];
}
export async function saveVerifiedBankDetails(leadId, { accountNumber, ifsc, accountType, bank, verification }) {
  const values = [accountNumber, ifsc, accountType, bank.bank_name, bank.branch_name, bank.bank_address, bank.micr_code || "", verification.account_holder_name, verification.amount || null, JSON.stringify(verification.raw)];
  const result = await pool.query(SAVE_VERIFIED_BANK_DETAILS, [leadId, ...values]);
  if (result.rowCount === 0) {
    const error = new Error("The lead record was not found. Start a new KYC and save Step 1 again.");
    error.code = "LEAD_NOT_FOUND";
    throw error;
  }
  return result.rows[0];
}
export async function saveScheme(leadId, selectedScheme) {
  const result = await pool.query(SAVE_SCHEME, [leadId, selectedScheme]);
  if (result.rowCount === 0) {
    const error = new Error("The lead record was not found. Start a new KYC and save Step 1 again.");
    error.code = "LEAD_NOT_FOUND";
    throw error;
  }
  return result.rows[0];
}

// The RM form sends "Yes"/"No" (and the controller sends "Yes"/"IN") for
// fields that are BOOLEAN columns in kyc_master_details. Coerce them here so
// Postgres doesn't reject `politically_exposed = 'No'` etc. — no schema change.
const toBool = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (["yes", "true", "y", "1", "on"].includes(s)) return true;
  if (["no", "false", "n", "0", "off", ""].includes(s)) return false;
  return null;
};

// The "Running Account Authorization" field is a BOOLEAN column, but the RM
// form collects a settlement frequency ("Monthly"/"Quarterly"). Treat any
// chosen frequency as authorised (true), an explicit no as false, blank as
// null — so the column stays boolean and the value still persists.
const toAuthBool = (value) => {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "") return null;
  return !["no", "false", "none", "n", "0"].includes(s);
};

export async function savePersonalDetails(leadId, details) {
  const instructions = details.standing_instructions || {};
  const values = [
    details.father_name,
    details.mother_name,
    details.marital_status,
    details.education,
    details.annual_income,
    details.trading_experience,
    details.occupation,
    details.net_worth,
    toAuthBool(details.running_account_authorization),
    details.country_of_birth,
    details.aadhaar_address,
    toBool(details.politically_exposed),
    toBool(details.citizen_of_india),
    toBool(details.ddpi),
    toBool(details.income_declaration_accepted),
    toBool(details.rights_accepted),
    toBool(instructions.depository_credit_instruction),
    toBool(instructions.pledge_instruction),
    instructions.account_statement_requirement,
    toBool(instructions.electronic_transaction_statement),
    toBool(instructions.share_email_with_rta),
    instructions.annual_report_preference,
    toBool(instructions.dividend_interest_ecs),
    instructions.contract_note_preference,
    toBool(instructions.trust_facility_instruction),
    toBool(instructions.dis_at_account_opening),
  ];
  const result = await pool.query(SAVE_PERSONAL_DETAILS, [leadId, ...values]);
  if (result.rowCount === 0) {
    const error = new Error("The lead record was not found. Start a new KYC and save Step 1 again.");
    error.code = "LEAD_NOT_FOUND";
    throw error;
  }
  return result.rows[0];
}

export async function saveNomineeDetails(leadId, details) {
  const values = [];
  const assignments = [];
  for (let index = 1; index <= 3; index += 1) {
    const nominee = details.nominees?.[index - 1] || {};
    const fields = [
      [`nominee_name_${index}`, nominee.nominee_name || null, ""],
      [`nominee_dob_${index}`, nominee.dob || "", "date"],
      [`nominee_relation_${index}`, nominee.relation || null, ""],
      [`nominee_allocation_percentage_${index}`, nominee.allocation_percentage || "", "numeric"],
    ];
    for (const [column, value, cast] of fields) {
      values.push(value);
      const parameter = `$${values.length + 1}`;
      assignments.push(`${column}=${cast ? `NULLIF(${parameter}, '')::${cast}` : parameter}`);
    }
  }

  // Guardian details live in ONE top-level set of columns, not per nominee
  // slot — the schema has no guardian_relation_1/2/3 etc. If more than one
  // nominee is a minor, only the first minor's guardian is persisted (a real
  // limitation of this schema, not something the app can work around without
  // adding columns).
  const minorNominee = (details.nominees || []).find((nominee) => {
    if (!nominee?.dob) return false;
    const birth = new Date(`${nominee.dob}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
    return age < 18;
  });
  const guardianFields = [
    ["guardian_relation", minorNominee?.guardian_relation || null, ""],
    ["guardian_name", minorNominee?.guardian_name || null, ""],
    ["guardian_mobile", minorNominee?.guardian_mobile || null, ""],
    ["guardian_address", minorNominee?.guardian_address || null, ""],
    ["guardian_dob", minorNominee?.guardian_dob || "", "date"],
  ];
  for (const [column, value, cast] of guardianFields) {
    values.push(value);
    const parameter = `$${values.length + 1}`;
    assignments.push(`${column}=${cast ? `NULLIF(${parameter}, '')::${cast}` : parameter}`);
  }

  const nomineeCount = (details.nominees || []).filter((nominee) => String(nominee?.nominee_name || "").trim()).length;
  values.push(nomineeCount);
  assignments.push(`nominee_count=$${values.length + 1}`);

  const query = `UPDATE kyc_master_details SET ${assignments.join(", ")}, current_stage='scheme', updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`;
  const result = await pool.query(query, [leadId, ...values]);
  if (result.rowCount === 0) {
    const error = new Error("The lead record was not found. Start a new KYC and save Step 1 again.");
    error.code = "LEAD_NOT_FOUND";
    throw error;
  }
  return result.rows[0];
}
