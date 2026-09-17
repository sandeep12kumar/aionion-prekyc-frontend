import { pool } from "../config/database.js";
import {
  getCdslSourceByApplicationIdQuery,
  checkCdslApplicationIdUniqueIndexQuery,
  upsertCdslDataByApplicationIdQuery,
} from "../queries/cdslExportQueries.js";

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

export const exportApplicationToCdsl = async (applicationId, options = {}) => {
  const client = await pool.connect();

  const dpid = normalizeOptionalString(options.dpid || process.env.CDSL_DPID);
  const operatorId = normalizeOptionalString(
    options.operator_id || process.env.CDSL_OPERATOR_ID,
  );
  const productNumber = normalizeOptionalString(
    options.product_number || process.env.CDSL_PRODUCT_NUMBER,
  );
  const annualIncomeCode = normalizeOptionalString(
    options.annual_income_code || process.env.CDSL_ANNUAL_INCOME_CODE,
  );
  const boCategory = normalizeOptionalString(
    options.bo_category || process.env.CDSL_BO_CATEGORY,
  );
  const boSettlementPlanningFlag = normalizeOptionalString(
    options.bo_settlement_planning_flag ||
      process.env.CDSL_BO_SETTLEMENT_PLANNING_FLAG,
  );
  const boSubStatus = normalizeOptionalString(
    options.bo_sub_status || process.env.CDSL_BO_SUB_STATUS,
  );
  const boStatementCycleCode = normalizeOptionalString(
    options.bo_statement_cycle_code || process.env.CDSL_BO_STATEMENT_CYCLE_CODE,
  );
  const dividendBankAcctType = normalizeOptionalString(
    options.dividend_bank_acct_type || process.env.CDSL_DIVIDEND_BANK_ACCT_TYPE,
  );
  const dividendBankCode = normalizeOptionalString(
    options.dividend_bank_code || process.env.CDSL_DIVIDEND_BANK_CODE,
  );
  const dividendBankCcy = normalizeOptionalString(
    options.dividend_bank_ccy || process.env.CDSL_DIVIDEND_BANK_CCY,
  );
  const panVerificationFlag = normalizeOptionalString(
    options.pan_verification_flag || process.env.CDSL_PAN_VERIFICATION_FLAG,
  );
  const signatureFileFlag = normalizeOptionalString(
    options.signature_file_flag || process.env.CDSL_SIGNATURE_FILE_FLAG,
  );
  const beneficiaryTaxDeductionStatus = normalizeOptionalString(
    options.beneficiary_tax_deduction_status ||
      process.env.CDSL_BENEFICIARY_TAX_DEDUCTION_STATUS,
  );
  const nominationOptOut = normalizeOptionalString(options.nomination_opt_out);
  const uidVerificationFlag = normalizeOptionalString(options.uid_verification_flag);
  const poaTypeFlag = normalizeOptionalString(options.poa_type_flag);
  const boFeeType = normalizeOptionalString(options.bo_fee_type);
  const nationalityCode = normalizeOptionalString(options.nationality_code);
  const bonafideFlag = normalizeOptionalString(options.bonafide_flag);
  const emailStatementFlag = normalizeOptionalString(options.email_statement_flag);
  const annualReportFlag = normalizeOptionalString(options.annual_report_flag);
  const bsdaFlag = normalizeOptionalString(options.bsda_flag);
  const communicationPreference = normalizeOptionalString(
    options.communication_preference,
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
          AND table_name = 'cdsl_data'
      ) AS table_exists;
    `);

    if (!tableResult.rows[0]?.table_exists) {
      throw createHttpError("public.cdsl_data does not exist in this database.", 500);
    }

    const uniqueIndexResult = await client.query(
      checkCdslApplicationIdUniqueIndexQuery,
    );

    if (!uniqueIndexResult.rows[0]?.has_unique_application_id) {
      throw createHttpError(
        "public.cdsl_data.unique_id is not backed by a unique constraint — cannot upsert safely.",
        500,
      );
    }

    const sourceResult = await client.query(getCdslSourceByApplicationIdQuery, [
      applicationId,
      dpid,
      operatorId,
      productNumber,
      annualIncomeCode,
      boCategory,
      boSettlementPlanningFlag,
      boSubStatus,
      boStatementCycleCode,
      dividendBankAcctType,
      dividendBankCode,
      dividendBankCcy,
      panVerificationFlag,
      signatureFileFlag,
      beneficiaryTaxDeductionStatus,
      nominationOptOut,
      uidVerificationFlag,
      poaTypeFlag,
      boFeeType,
      nationalityCode,
      bonafideFlag,
      emailStatementFlag,
      annualReportFlag,
      bsdaFlag,
      communicationPreference,
    ]);
    const sourceRow = sourceResult.rows[0];

    if (!sourceRow) {
      throw createHttpError(
        "Source KYC data could not be assembled for the requested application_id",
        404,
      );
    }

    // cdsl_data.unique_id is bigint and must equal kyc_master_details.unique_id
    // (the same link token cvlkra_data, nse_data, bse_data and mf_data all
    // key off) — not the internal row id. Older leads created before
    // unique_id became sequential still carry a non-numeric hex/UUID token
    // and can't be exported until re-issued one.
    if (!/^\d+$/.test(String(sourceRow.shared_unique_id_text || ""))) {
      throw createHttpError(
        `kyc_master_details.unique_id ("${sourceRow.shared_unique_id_text}") is not numeric — cannot store it in cdsl_data.unique_id (bigint). This application predates sequential unique_id values.`,
        422,
      );
    }

    const mandatoryFields = [
      { key: "dpid", label: "CDSL DPID" },
      { key: "operator_id", label: "CDSL operator id" },
      { key: "bo_request_receive_date", label: "BO request receive date" },
      { key: "product_number", label: "CDSL product number" },
      { key: "bo_name", label: "BO first name" },
      { key: "last_name", label: "BO last/search name" },
      { key: "cust_addr_1", label: "address line 1" },
      { key: "cust_addr_cntry_code", label: "country code" },
      { key: "cust_addr_zip", label: "pincode" },
      { key: "cust_addr_state_code", label: "state code" },
      { key: "cust_addr_city", label: "city" },
      { key: "city_sequence_number", label: "city sequence number" },
      { key: "primary_mobile_no_isd_code", label: "primary mobile ISD code" },
      { key: "primary_mobile_no", label: "primary mobile number" },
      { key: "income_tax_pan", label: "PAN number" },
      { key: "primary_email", label: "primary email" },
      { key: "pan_verification_flag", label: "PAN verification flag" },
      { key: "poa_type_flag", label: "POA type flag" },
      { key: "date_of_birth_or_origin", label: "date of birth" },
      { key: "annual_income_code", label: "annual income code" },
      { key: "nomination_opt_out", label: "nomination opt-out flag" },
      { key: "mode_of_operation", label: "mode of operation" },
      { key: "bo_category", label: "BO category" },
      { key: "bo_settlement_planning_flag", label: "BO settlement planning flag" },
      { key: "bo_sub_status", label: "BO sub status" },
      { key: "bo_statement_cycle_code", label: "BO statement cycle code" },
      { key: "dividend_bank_acct_type", label: "dividend bank account type" },
      { key: "dividend_bank_code", label: "dividend bank code" },
      { key: "dividend_acct_numb", label: "dividend bank account number" },
      { key: "dividend_bank_ccy", label: "dividend bank currency" },
    ];

    const missingFields = mandatoryFields
      .filter(({ key }) => !String(sourceRow[key] || "").trim())
      .map(({ label }) => label);

    if (missingFields.length > 0) {
      console.warn("Mandatory CDSL export data is missing", {
        application_id: applicationId,
        missing_fields: missingFields,
        hint:
          "Provide CDSL-only overrides in the POST body or environment for fields not stored in current KYC tables, such as product_number, annual_income_code, bo_category, bo_settlement_planning_flag, bo_sub_status, bo_statement_cycle_code, dividend_bank_acct_type, dividend_bank_code, dividend_bank_ccy, dpid, operator_id, and pan_verification_flag.",
      });
    }

    const upsertResult = await client.query(upsertCdslDataByApplicationIdQuery, [
      applicationId,
      dpid,
      operatorId,
      productNumber,
      annualIncomeCode,
      boCategory,
      boSettlementPlanningFlag,
      boSubStatus,
      boStatementCycleCode,
      dividendBankAcctType,
      dividendBankCode,
      dividendBankCcy,
      panVerificationFlag,
      signatureFileFlag,
      beneficiaryTaxDeductionStatus,
      nominationOptOut,
      uidVerificationFlag,
      poaTypeFlag,
      boFeeType,
      nationalityCode,
      bonafideFlag,
      emailStatementFlag,
      annualReportFlag,
      bsdaFlag,
      communicationPreference,
    ]);
    const cdslRow = upsertResult.rows[0];

    if (!cdslRow) {
      throw createHttpError("CDSL upsert did not return a row", 500);
    }

    await client.query("COMMIT");

    return {
      id: Number(cdslRow.id),
      application_id: Number(cdslRow.application_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
