import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import { upsertTechexcel } from "../queries/techexcelQueries.js";

/* ------------------------------------------------------------------ helpers */
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const first = (...vals) => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
};
const yn = (v) =>
  v === true ||
  ["y", "yes", "true", "1"].includes(str(v).toLowerCase())
    ? "Y"
    : "N";

const ddmmyyyy = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    // already a string like "22-11-1999" or "1999-11-22"
    const m = str(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return str(value).replace(/-/g, "/");
  }
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const splitName = (full) => {
  const parts = str(full).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  return {
    first: parts[0],
    last: parts[parts.length - 1],
    middle: parts.slice(1, -1).join(" "),
  };
};

const sexCode = (g) => {
  const s = str(g).toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  if (s.startsWith("t")) return "T";
  return "";
};
const titleFor = (g) => {
  const s = str(g).toLowerCase();
  if (s.startsWith("m")) return "Mr.";
  if (s.startsWith("f")) return "Ms.";
  return "";
};

/**
 * Hardcoded / business-config values. Every one is overridable with an
 * environment variable of the same name prefixed with TECHEXCEL_
 * (e.g. TECHEXCEL_BRANCH_CODE). Change these here, or set the env var, when
 * TechExcel's spec / your broker setup differs.
 */
const D = (key, fallback) => {
  const v = process.env[`TECHEXCEL_${key}`];
  return v === undefined || v === "" ? fallback : v;
};

/* ---------------------------------------------------------------- main build */
export const buildTechexcelRecord = (row, nominees) => {
  const clientCode = str(row.client_code);
  const kycId = row.id;
  const boid = str(row.boid).replace(/\D/g, "");
  const dpId = boid.slice(0, 8);

  const name = first(row.itr_name, row.client_name, row.digilocker_name);
  const nm = splitName(name);
  const father = first(
    row.personal_father_name,
    row.father_name,
    row.digilocker_father_name,
  );
  // kyc_master_details has no plain "gender" column — kra_gender /
  // digilocker_gender are the route-specific columns that actually exist.
  const gender = first(row.kra_gender, row.digilocker_gender);
  const dob = first(row.dob, row.provider_dob, row.digilocker_dob);

  const addr1 = first(row.address_1, row.digilocker_address, row.aadhaar_address);
  const addr2 = str(row.address_2);
  const addr3 = str(row.address_3);
  const city = first(row.city, row.digilocker_city);
  const state = first(row.state, row.digilocker_state);
  const pincode = first(row.pincode, row.digilocker_pincode);

  const isKra = str(row.provider).toLowerCase().includes("kra") ||
    str(row.provider).toLowerCase().includes("cvl");
  const isDigilocker = Boolean(
    row.digilocker_name || row.digilocker_aadhaar_number_masked,
  );
  const ddpi = row.ddpi_selected === true || yn(row.ddpi) === "Y";
  const today = ddmmyyyy(new Date());
  const agreementDate = ddmmyyyy(row.esign_signed_at) || today;
  const nomineeCount = nominees.length;

  const record = {
    /* identity / keys - unique_id is kyc_master_details.unique_id, the same
       link token cvlkra_data/cdsl_data/nse_data/bse_data/mf_data all key
       off (not the internal row id). */
    unique_id: str(row.unique_id),
    Client_id: clientCode || String(kycId),
    Client_WebXID: clientCode || String(kycId),
    SERIAL_NO: str(row.unique_id) || String(kycId),
    Client_Name: name,
    Pan_Name: name,
    FIRST_NAME: nm.first,
    MIDDLE_NAME: nm.middle,
    LAST_NAME: nm.last,
    TITLE: titleFor(gender),
    PAN_NO: str(row.pan_number).toUpperCase(),
    BIRTH_DATE: ddmmyyyy(dob),
    SEX: sexCode(gender),
    MARITAL_STATUS: str(row.marital_status) || "Single",
    Father_Husband_Name: father,
    Father_Husband_Name1: father,
    Mother_Name: str(row.mother_name),
    NATIONALITY: yn(row.citizen_of_india) === "N" ? "Others" : "Indian",
    Residential_Status: D("RESIDENTIAL_STATUS", "Resident Individual"),
    QUALIFICATION: str(row.education),
    OCCUPATION: str(row.occupation),
    ANNUAL_INCOME: str(row.annual_income),
    GrossAnnualIncomeDate: today,
    Political_Affilication: yn(row.politically_exposed),

    /* contact */
    EMAIL_ID: str(row.email),
    MOBILE_NO: str(row.mobile_number),
    RESI_TEL_NO: "",
    STD_CODE: "",

    /* correspondence address */
    RESI_ADDRESS1: addr1,
    RESI_ADDRESS2: addr2,
    RESI_ADDRESS3: addr3,
    City: city,
    State: state,
    Pin_Code: pincode,
    Country: "India",
    Off_State: state,

    /* registered / permanent address (same as correspondence) */
    REG_ADDR1: addr1,
    REG_ADDR2: addr2,
    REG_ADDR3: addr3,
    R_CITY: city,
    R_STATE: state,
    R_PIN_CODE: pincode,
    R_COUNTRY: "India",
    SameAddress: "Y",

    /* bank */
    NOT_BANK_NAME: str(row.bank_name),
    Not_BANKCCOUNTNNO: str(row.bank_account_number),
    NOT_IFSC: str(row.bank_ifsc_code),
    Not_MicrNo: str(row.bank_micr_code),
    Not_BankAcType: str(row.bank_account_type) || "Savings",
    NOT_EFT: "Y",

    /* depository */
    INSTBOID: boid,
    NOT_BOID: boid,
    NOT_DPID: dpId || D("DPID", "12100800"),
    NOT_DDPI: ddpi ? "Y" : "N",
    NOT_POA: "N",
    Bo_Acc_Open_src: D("BO_ACC_OPEN_SRC", "Online"),
    AcOpeLocation: D("AC_OPE_LOCATION", "HO"),
    BO_CATEGORY_CODE: D("BO_CATEGORY_CODE", "01"),
    BO_SUB_STATUS_CODE: D("BO_SUB_STATUS_CODE", "01"),
    BoStatusCode: D("BO_STATUS_CODE", "01"),
    No_Of_Holder: "1",
    Mode_of_operation: D("MODE_OF_OPERATION", "Single"),

    /* KYC / proofs */
    KYC_MODE_TYPE: isDigilocker
      ? D("KYC_MODE_DIGILOCKER", "Digilocker")
      : D("KYC_MODE_KRA", "KRA"),
    KraRec: isKra ? "Y" : "N",
    KraRecUP: isKra ? "Y" : "N",
    CKYCFLAG: "N",
    Csc_flg: "N",
    CUSI_CLIENT: "N",
    Master_Pan_Purpose: D("MASTER_PAN_PURPOSE", "Trading and Demat"),
    Pan_Flag1: "Y",
    Pan_Proof: "PAN",
    Address_Proof1: D("ADDRESS_PROOF", "Aadhaar"),
    Correspondance_Address_Proof: D("ADDRESS_PROOF", "Aadhaar"),
    NOT_PROOF_REC: "Y",
    Not_PROOF_REC: "Y",
    Fatca_Declaration: "Y",
    Fatca_Country: "India",

    /* category / nature */
    CATEGORY: "I",
    Category: "I",
    Client_Nature: "Individual",
    Risk_catg: D("RISK_CATG", "Low"),

    /* communication / statement */
    Con_not: str(row.contract_note_preference) || "Electronic",
    DELIVERY_TYPE: "Electronic",
    Stetement_Communication_Mode: "Electronic",
    STATMENT_OPTION: str(row.account_statement_requirement) || "Monthly",
    SMS_SEND: "Y",
    PrintBill: "N",

    /* trading prefs / charges (broker config) */
    ExchangeList: D("EXCHANGE_LIST", "NSE,BSE"),
    ModuleCode: D("MODULE_CODE", ""),
    IBT_MODULE: D("IBT_MODULE", ""),
    IBT_FLAG: "Y",
    IsInternetTrading: "Y",
    IBT_CHGSDROption: "N",
    TypeOfFacility: D("TYPE_OF_FACILITY", ""),
    Settlement_Type:
      str(row.running_account_authorization) || D("SETTLEMENT_TYPE", "Quarterly"),
    INTER_SETTLEMENT_CHARGE: "N",
    CLFundTrf: "N",
    CL_OP_CHGS_DEBITED: "N",
    MIN_OP_CHARGES: D("MIN_OP_CHARGES", "0"),
    POOL_HOLD_CHARGE: "N",
    NOT_DIET_CHARGES: "N",
    DR_INTEREST: "N",
    InterestDebiting: "N",
    CONSIDER_SOH_MARGIN: "N",
    TRUSTBASEPAYIN: "N",
    Payment_Request: "N",
    RETANTION_AUTHO_LETTER: "N",
    NACHFLAG: "N",
    GRP1ACTIVE: "N",
    GRP2ACTIVE: "N",
    MTFCl: "N",
    MTFClAuto: "N",
    MTF_Close: "N",
    NOT_PIS: "N",
    NRIPIS: "N",
    NOT_M1_BSE_CASH: "N",
    NOT_M1_NSE_CASH: "N",
    NOT_M2_BSE_CASH: "N",
    NOT_M2_NSE_CASH: "N",

    /* workflow flags */
    FIXEDMAKERCHECKER: "N",
    UpdationFlag: "N",
    WebAC: "Y",
    BRANCH_CODE: D("BRANCH_CODE", ""),
    RelationManager_CODE: D("RM_CODE", ""),

    /* IPV / in-person */
    Person_verify: "Y",
    Person_verify_Name: D("IPV_EMP_NAME", ""),
    PERSON_VERIFY_DESIGNATION: D("IPV_EMP_DESIGNATION", ""),
    Person_Verify_Designation: D("IPV_EMP_DESIGNATION", ""),
    Ipv_emp_code: D("IPV_EMP_CODE", ""),
    Ipv_emp_org: D("IPV_EMP_ORG", "AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED"),
    IPV_EMP_ORG: D("IPV_EMP_ORG", "AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED"),
    Ipv_emp_place: D("IPV_EMP_PLACE", "HO"),
    INPERSON_DATE: agreementDate,
    Agreement_Date: agreementDate,
    POA_SECURITY_PAYINDATE: agreementDate,

    /* documents (paths left blank - filled by the doc-push job) */
    BFile_Pan: "",
    BFile_Photo: "",
    BFile_Other1: "",
    BFile_Other2: "",
    BFile_Other3: "",
    BFile_Other4: "",

    /* nominees */
    NOMINEEOPTOUT: nomineeCount > 0 ? "N" : "Y",
    No_Of_Nominee: String(nomineeCount),

    /* introducer (optional) */
    INTRODUCER_NAME: D("INTRODUCER_NAME", ""),
    INTRODUCER_ADDRESS: D("INTRODUCER_ADDRESS", ""),
    INTRODUCER_ACC_CODE: D("INTRODUCER_ACC_CODE", ""),
    INTR_FIRST_NAME: "",
    INTR_MIDDLE_NAME: "",
    INTR_LAST_NAME: "",

    /* housekeeping */
    techexcel_push_status: "Success",
    rejection_reason: "",
  };

  /* --- nominee slots 1..3 (name / relation / DOB / PAN / share only) --- */
  nominees.slice(0, 3).forEach((n, i) => {
    const suffix = i === 0 ? "" : String(i + 1);
    const pct = n.allocation_percentage != null ? String(n.allocation_percentage) : "";
    if (i === 0) {
      record.Nomination_Name = str(n.nominee_name);
      record.NOMINATION_TITLE = "Mr.";
      record.Nom_Relation = str(n.relation);
      record.Nom_DOB = ddmmyyyy(n.dob);
      record.Share_Percentage = pct;
    } else {
      record[`Nomination_Name${suffix}`] = str(n.nominee_name);
      record[`NOMINATION_TITLE${suffix}`] = "Mr.";
      record[`Nom_Relation${suffix}`] = str(n.relation);
      record[`Nom_DOB${suffix}`] = ddmmyyyy(n.dob);
      record[`Share_Percentage${suffix}`] = pct;
    }
  });

  /* --- guardian (application-level; used when a nominee is a minor) --- */
  record.GUARDIAN_NAME = str(row.guardian_name);
  record.GUARDIAN_relation = str(row.guardian_relation);
  record.GUARDIAN_mobile_no = str(row.guardian_mobile);
  record.GUARDIAN_ADDR = str(row.guardian_address);

  record.raw_payload = { ...record };
  return record;
};

/* --------------------------------------------------------------------- api  */
export const exportApplicationToTechexcel = async (identifier) => {
  const kycId = await resolveKycId(identifier);
  if (!kycId) {
    const e = new Error("Application not found for techexcel export");
    e.statusCode = 404;
    throw e;
  }

  const { rows } = await pool.query(
    `SELECT * FROM public.kyc_master_details WHERE id = $1 LIMIT 1`,
    [kycId],
  );
  const row = rows[0];
  if (!row) {
    const e = new Error("Application not found for techexcel export");
    e.statusCode = 404;
    throw e;
  }

  // techexcel.unique_id is bigint and must equal kyc_master_details.unique_id
  // (the same link token cvlkra_data, cdsl_data, nse_data, bse_data and
  // mf_data all key off) — not the internal row id. Older leads created
  // before unique_id became sequential still carry a non-numeric hex/UUID
  // token and can't be exported until re-issued one.
  if (!/^\d+$/.test(str(row.unique_id))) {
    const e = new Error(
      `kyc_master_details.unique_id ("${row.unique_id}") is not numeric — cannot store it in techexcel.unique_id (bigint). This application predates sequential unique_id values.`,
    );
    e.statusCode = 422;
    throw e;
  }

  const nominees = [1, 2, 3]
    .filter((s) => str(row[`nominee_name_${s}`]))
    .map((s) => ({
      nominee_name: row[`nominee_name_${s}`],
      relation: row[`nominee_relation_${s}`],
      dob: row[`nominee_dob_${s}`],
      allocation_percentage: row[`nominee_allocation_percentage_${s}`],
    }));

  const record = buildTechexcelRecord(row, nominees);
  const result = await upsertTechexcel(record);

  return {
    application_id: kycId,
    id: result.rows[0]?.id ?? null,
    unique_id: result.rows[0]?.unique_id ?? null,
    success: true,
  };
};
