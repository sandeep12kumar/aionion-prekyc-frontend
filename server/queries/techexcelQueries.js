import { pool } from "../config/database.js";

/**
 * Every writable column on public.techexcel (housekeeping id/created_at/
 * updated_at excluded). `upsertTechexcel` only writes keys that appear in
 * this list, so an unknown key in the record is ignored rather than crashing
 * the query. Verified 1:1 against the live table's actual columns.
 */
export const TECHEXCEL_COLUMNS = [
  "unique_id",
  "raw_payload",
  "rejection_reason",
  "techexcel_push_status",
  "ANNUAL_INCOME", "AcOpeLocation", "Address_Proof1", "Agreement_Date",
  "BFile_Other1", "BFile_Other2", "BFile_Other3", "BFile_Other4", "BFile_Pan",
  "BFile_Photo", "BIRTH_DATE", "BO_CATEGORY_CODE", "BO_SUB_STATUS_CODE",
  "BRANCH_CODE", "BoStatusCode", "Bo_Acc_Open_src", "CATEGORY", "CKYCFLAG",
  "CLFundTrf", "CL_OP_CHGS_DEBITED", "CONSIDER_SOH_MARGIN", "CUSI_CLIENT",
  "Category", "City", "Client_Name", "Client_Nature", "Client_WebXID",
  "Client_id", "Con_not", "Correspondance_Address_Proof", "Country", "Csc_flg",
  "DELIVERY_TYPE", "DR_INTEREST", "EMAIL_ID", "ExchangeList", "FIRST_NAME",
  "FIXEDMAKERCHECKER", "Fatca_Country", "Fatca_Declaration",
  "Father_Husband_Name", "Father_Husband_Name1", "Father_Husband_Name2",
  "Father_Husband_Name3", "GRP1ACTIVE", "GRP2ACTIVE", "GUARDIAN_ADDR",
  "GUARDIAN_DOB2", "GUARDIAN_DOB3", "GUARDIAN_NAME", "GUARDIAN_PAN",
  "GUARDIAN_PAN2", "GUARDIAN_PAN3", "GUARDIAN_TITLE2", "GUARDIAN_TITLE3",
  "GUARDIAN_mobile_no", "GUARDIAN_relation", "GrossAnnualIncomeDate",
  "Guar1_address2", "Guar1_address3", "Guar1_city", "Guar1_country",
  "Guar1_email", "Guar1_pin_code", "Guar1_proof_details", "Guar1_proof_id",
  "Guar2_address", "Guar2_address2", "Guar2_address3", "Guar2_city",
  "Guar2_country", "Guar2_email", "Guar2_mobile_no", "Guar2_pin_code",
  "Guar2_proof_id", "Guar2_relation", "Guar2_state", "Guar3_address",
  "Guar3_address2", "Guar3_address3", "Guar3_city", "Guar3_country",
  "Guar3_email", "Guar3_mobile_no", "Guar3_pin_code", "Guar3_proof_id",
  "Guar3_relation", "Guar3_state", "Guardian_Name2", "Guardian_Name3",
  "IBT_CHGSDROption", "IBT_FLAG", "IBT_MODULE", "INPERSON_DATE", "INSTBOID",
  "INTER_SETTLEMENT_CHARGE", "INTRODUCER_ACC_CODE", "INTRODUCER_ADDRESS",
  "INTRODUCER_NAME", "INTR_FIRST_NAME", "INTR_LAST_NAME", "INTR_MIDDLE_NAME",
  "IPV_EMP_ORG", "InterestDebiting", "Ipv_emp_code", "Ipv_emp_org",
  "Ipv_emp_place", "IsInternetTrading", "KYC_MODE_TYPE", "KraRec", "KraRecUP",
  "LAST_NAME", "MARITAL_STATUS", "MIDDLE_NAME", "MIN_OP_CHARGES", "MOBILE_NO",
  "MTFCl", "MTFClAuto", "MTF_Close", "Master_Pan_Purpose", "Mode_of_operation",
  "ModuleCode", "Mother_Name", "NACHFLAG", "NATIONALITY", "NOMINATION_TITLE",
  "NOMINATION_TITLE2", "NOMINATION_TITLE3", "NOMINEEOPTOUT", "NOMINEE_PIN_CODE",
  "NOM_EMAIL", "NOT_BANK_NAME", "NOT_BOID", "NOT_DDPI", "NOT_DIET_CHARGES",
  "NOT_DPID", "NOT_EFT", "NOT_IFSC", "NOT_M1_BSE_CASH", "NOT_M1_NSE_CASH",
  "NOT_M2_BSE_CASH", "NOT_M2_NSE_CASH", "NOT_PIS", "NOT_POA", "NOT_PROOF_REC",
  "NRIPIS", "No_Of_Holder", "No_Of_Nominee", "Nom2_address", "Nom2_address2",
  "Nom2_address3", "Nom3_address", "Nom3_address2", "Nom3_address3", "Nom_City",
  "Nom_City2", "Nom_City3", "Nom_DOB", "Nom_DOB2", "Nom_DOB3", "Nom_Email2",
  "Nom_Email3", "Nom_Phone", "Nom_Phone2", "Nom_Phone3", "Nom_Relation",
  "Nom_Relation2", "Nom_Relation3", "Nom_State", "Nom_State2", "Nom_State3",
  "Nom_address", "Nom_address2", "Nom_address3", "Nom_country2", "Nom_country3",
  "Nom_pan", "Nom_pan2", "Nom_pan3", "Nomination_Name", "Nomination_Name2",
  "Nomination_Name3", "Nominee_Pin_Code2", "Nominee_Pin_Code3",
  "Not_BANKCCOUNTNNO", "Not_BankAcType", "Not_MicrNo", "Not_PROOF_REC",
  "OCCUPATION", "Occupation_Others", "Off_State", "PAN_NO",
  "PERSON_VERIFY_DESIGNATION", "POA_SECURITY_PAYINDATE", "POOL_HOLD_CHARGE",
  "Pan_Flag1", "Pan_Name", "Pan_Proof", "Payment_Request",
  "Person_Verify_Designation", "Person_verify", "Person_verify_Name",
  "Pin_Code", "Political_Affilication", "PrintBill", "QUALIFICATION",
  "REG_ADDR1", "REG_ADDR2", "REG_ADDR3", "RESI_ADDRESS1", "RESI_ADDRESS2",
  "RESI_ADDRESS3", "RESI_TEL_NO", "RETANTION_AUTHO_LETTER", "R_CITY",
  "R_COUNTRY", "R_PIN_CODE", "R_STATE", "RelationManager_CODE",
  "Residential_Status", "Risk_catg", "SERIAL_NO", "SEX", "SMS_SEND",
  "STATMENT_OPTION", "STD_CODE", "SameAddress", "SameRegAddFor_Nom2",
  "Settlement_Type", "Share_Percentage", "Share_Percentage2",
  "Share_Percentage3", "State", "Stetement_Communication_Mode", "TITLE",
  "TRUSTBASEPAYIN", "TypeOfFacility", "UpdationFlag", "WebAC",
];

const COLUMN_SET = new Set(TECHEXCEL_COLUMNS);

/**
 * Upsert one row into public.techexcel, keyed on unique_id.
 * `record` is keyed by the real column names; unknown keys are ignored.
 * `raw_payload` is passed through as jsonb, everything else as text.
 */
export const upsertTechexcel = async (record, client = pool) => {
  if (record.unique_id === undefined || record.unique_id === null) {
    throw new Error("upsertTechexcel: record.unique_id is required");
  }

  const cols = Object.keys(record).filter((k) => COLUMN_SET.has(k));
  const values = cols.map((c) =>
    c === "raw_payload"
      ? JSON.stringify(record[c] ?? {})
      : record[c] === undefined || record[c] === null
        ? ""
        : String(record[c]),
  );

  const quoted = cols.map((c) => `"${c}"`);
  const placeholders = cols.map((_, i) => {
    const p = `$${i + 1}`;
    return cols[i] === "raw_payload" ? `${p}::jsonb` : p;
  });

  const updates = cols
    .filter((c) => c !== "unique_id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`);
  updates.push("updated_at = NOW()");

  const sql = `
    INSERT INTO public.techexcel (${quoted.join(", ")})
    VALUES (${placeholders.join(", ")})
    ON CONFLICT (unique_id) DO UPDATE SET
      ${updates.join(",\n      ")}
    RETURNING id, unique_id;
  `;

  return client.query(sql, values);
};
