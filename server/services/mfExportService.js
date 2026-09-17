import { pool } from "../config/database.js";
import {
  getMfSourceByApplicationIdQuery,
  checkMfApplicationIdUniqueIndexQuery,
  upsertMfDataByApplicationIdQuery,
} from "../queries/mfExportQueries.js";

const createHttpError = (message, statusCode, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

const normalizeOptionalString = (value) => {
  const normalized = String(value || "").trim();
  return normalized || "";
};

const isOneOf = (value, allowedValues) => allowedValues.includes(String(value || ""));

export const exportApplicationToMf = async (applicationId, options = {}) => {
  const client = await pool.connect();

  const divPayMode = normalizeOptionalString(
    options.div_pay_mode || process.env.MF_DIV_PAY_MODE,
  );
  const communicationMode = normalizeOptionalString(
    options.communication_mode || process.env.MF_COMMUNICATION_MODE,
  );
  const paperlessFlag = normalizeOptionalString(
    options.paperless_flag || process.env.MF_PAPERLESS_FLAG,
  );
  const mobileDeclarationFlag = normalizeOptionalString(
    options.mobile_declaration_flag || process.env.MF_MOBILE_DECLARATION_FLAG,
  );
  const emailDeclarationFlag = normalizeOptionalString(
    options.email_declaration_flag || process.env.MF_EMAIL_DECLARATION_FLAG,
  );

  try {
    await client.query("BEGIN");

    const applicationResult = await client.query(
      "SELECT id FROM public.kyc_master_details WHERE id = $1 LIMIT 1",
      [applicationId],
    );

    if (applicationResult.rows.length === 0) {
      throw createHttpError("Application not found in public.kyc_master_details", 404);
    }

    const tableResult = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'mf_data'
      ) AS table_exists;
    `);

    if (!tableResult.rows[0]?.table_exists) {
      throw createHttpError("public.mf_data does not exist in this database.", 500);
    }

    const uniqueIndexResult = await client.query(
      checkMfApplicationIdUniqueIndexQuery,
    );

    if (!uniqueIndexResult.rows[0]?.has_unique_application_id) {
      throw createHttpError(
        "public.mf_data.unique_id is not backed by a unique constraint — cannot upsert safely.",
        500,
      );
    }

    const sourceResult = await client.query(getMfSourceByApplicationIdQuery, [
      applicationId,
      divPayMode,
      communicationMode,
      paperlessFlag,
      mobileDeclarationFlag,
      emailDeclarationFlag,
    ]);
    const sourceRow = sourceResult.rows[0];

    if (!sourceRow) {
      throw createHttpError(
        "Source KYC data could not be assembled for the requested application_id",
        404,
      );
    }

    // mf_data.unique_id is bigint and must equal kyc_master_details.unique_id
    // (the same link token cvlkra_data, cdsl_data, nse_data and bse_data all
    // key off) — not the internal row id. Older leads created before
    // unique_id became sequential still carry a non-numeric hex/UUID token
    // and can't be exported until re-issued one.
    if (!/^\d+$/.test(String(sourceRow.shared_unique_id_text || ""))) {
      throw createHttpError(
        `kyc_master_details.unique_id ("${sourceRow.shared_unique_id_text}") is not numeric — cannot store it in mf_data.unique_id (bigint). This application predates sequential unique_id values.`,
        422,
      );
    }

    const unsupportedReasons = [];

    if (!sourceRow.source_supports_phase_1) {
      unsupportedReasons.push(
        "Phase 1 MF export currently supports only resident single-holder individual accounts.",
      );
    }

    if (Number(sourceRow.source_nominee_count || 0) > 3) {
      unsupportedReasons.push("MF export supports at most 3 nominees.");
    }

    if (String(sourceRow.source_has_minor_nominee_guardian_gap || "") === "Y") {
      unsupportedReasons.push(
        "Minor nominee guardian details are not stored in the current KYC schema.",
      );
    }

    if (String(sourceRow.source_has_joint_holder_data_gap || "") === "Y") {
      unsupportedReasons.push(
        "Joint / anyone-survivor MF holdings are not stored in the current KYC schema.",
      );
    }

    if (unsupportedReasons.length > 0) {
      throw createHttpError("Unsupported MF export scenario for Phase 1", 400, {
        application_id: applicationId,
        unsupported_reasons: unsupportedReasons,
      });
    }

    const invalidFields = [];

    if (divPayMode && !isOneOf(divPayMode, ["01", "02", "03", "04", "05"])) {
      invalidFields.push("div_pay_mode");
    }

    if (communicationMode && !isOneOf(communicationMode, ["P", "E", "M"])) {
      invalidFields.push("communication_mode");
    }

    if (paperlessFlag && !isOneOf(paperlessFlag, ["P", "Z"])) {
      invalidFields.push("paperless_flag");
    }

    if (
      mobileDeclarationFlag &&
      !isOneOf(mobileDeclarationFlag, ["SE", "SP", "DC", "DS", "DP", "GD", "PM", "CD", "PO"])
    ) {
      invalidFields.push("mobile_declaration_flag");
    }

    if (
      emailDeclarationFlag &&
      !isOneOf(emailDeclarationFlag, ["SE", "SP", "DC", "DS", "DP", "GD", "PM", "CD", "PO"])
    ) {
      invalidFields.push("email_declaration_flag");
    }

    if (invalidFields.length > 0) {
      throw createHttpError("Invalid MF override values supplied", 400, {
        application_id: applicationId,
        invalid_fields: invalidFields,
      });
    }

    const mandatoryFields = [
      { key: "client_code", label: "client code" },
      { key: "primary_holder_first_name", label: "primary holder first name" },
      { key: "tax_status", label: "tax status" },
      { key: "gender", label: "gender" },
      { key: "primary_holder_dob", label: "primary holder date of birth" },
      { key: "occupation_code", label: "occupation code" },
      { key: "holding_nature", label: "holding nature" },
      { key: "primary_holder_pan_exempt", label: "primary holder PAN exempt flag" },
      { key: "primary_holder_pan", label: "primary holder PAN" },
      { key: "client_type", label: "client type" },
      { key: "account_type_1", label: "account type 1" },
      { key: "account_no_1", label: "account number 1" },
      { key: "ifsc_code_1", label: "IFSC code 1" },
      { key: "default_bank_flag_1", label: "default bank flag 1" },
      { key: "div_pay_mode", label: "dividend pay mode" },
      { key: "address_1", label: "address line 1" },
      { key: "city", label: "city" },
      { key: "state", label: "state" },
      { key: "pincode", label: "pincode" },
      { key: "country", label: "country" },
      { key: "email", label: "email" },
      { key: "communication_mode", label: "communication mode" },
      { key: "indian_mobile_no", label: "Indian mobile number" },
      { key: "primary_holder_kyc_type", label: "primary holder KYC type" },
      { key: "paperless_flag", label: "paperless flag" },
      { key: "mobile_declaration_flag", label: "mobile declaration flag" },
      { key: "email_declaration_flag", label: "email declaration flag" },
      { key: "param_payload", label: "MF param payload" },
    ];

    const nomineeFieldIssues = [];

    if (Number(sourceRow.source_nominee_count || 0) >= 1) {
      if (!String(sourceRow.nominee_1_relation || "").trim()) {
        nomineeFieldIssues.push("nominee 1 relationship");
      }
      if (!String(sourceRow.nominee_1_allocation_percentage || "").trim()) {
        nomineeFieldIssues.push("nominee 1 allocation percentage");
      }
    }

    if (Number(sourceRow.source_nominee_count || 0) >= 2) {
      if (!String(sourceRow.nominee_2_relation || "").trim()) {
        nomineeFieldIssues.push("nominee 2 relationship");
      }
      if (!String(sourceRow.nominee_2_allocation_percentage || "").trim()) {
        nomineeFieldIssues.push("nominee 2 allocation percentage");
      }
    }

    if (Number(sourceRow.source_nominee_count || 0) >= 3) {
      if (!String(sourceRow.nominee_3_relation || "").trim()) {
        nomineeFieldIssues.push("nominee 3 relationship");
      }
      if (!String(sourceRow.nominee_3_allocation_percentage || "").trim()) {
        nomineeFieldIssues.push("nominee 3 allocation percentage");
      }
    }

    const nomineeAllocationTotal =
      Number(sourceRow.nominee_1_allocation_percentage || 0) +
      Number(sourceRow.nominee_2_allocation_percentage || 0) +
      Number(sourceRow.nominee_3_allocation_percentage || 0);

    if (
      Number(sourceRow.source_nominee_count || 0) > 0 &&
      nomineeAllocationTotal !== 100
    ) {
      nomineeFieldIssues.push("nominee allocation percentages must total 100");
    }

    if (nomineeFieldIssues.length > 0) {
      console.warn("Mandatory MF nominee data is missing or invalid", {
        application_id: applicationId,
        nominee_issues: nomineeFieldIssues,
      });
    }

    const missingFields = mandatoryFields
      .filter(({ key }) => !String(sourceRow[key] || "").trim())
      .map(({ label }) => label);

    if (missingFields.length > 0) {
      console.warn("Mandatory MF export data is missing", {
        application_id: applicationId,
        missing_fields: missingFields,
        hint:
          "Provide MF-specific overrides in the POST body for div_pay_mode, communication_mode, paperless_flag, mobile_declaration_flag, and email_declaration_flag when they are not stored in current KYC tables.",
      });
    }

    const upsertResult = await client.query(upsertMfDataByApplicationIdQuery, [
      applicationId,
      divPayMode,
      communicationMode,
      paperlessFlag,
      mobileDeclarationFlag,
      emailDeclarationFlag,
    ]);
    const mfRow = upsertResult.rows[0];

    if (!mfRow) {
      throw createHttpError("MF upsert did not return a row", 500);
    }

    await client.query("COMMIT");

    return {
      id: Number(mfRow.id),
      application_id: Number(mfRow.application_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
