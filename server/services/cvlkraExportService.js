import { pool } from "../config/database.js";
import { resolveDistrictAsync } from "./districtResolverService.js";
import {
  getCvlkraSourceByApplicationIdQuery,
  checkCvlkraUniqueIdConstraintQuery,
  upsertCvlkraDataByApplicationIdQuery,
} from "../queries/cvlkraExportQueries.js";

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

/**
 * Greedily word-wrap text into up to `maxLines` lines of at most `width`
 * characters — CVLKRA's address fields are 3 fixed-width lines. Any single
 * word longer than `width` is hard-truncated so a line can never overflow
 * the field it's going into; any wrapped output past maxLines is dropped
 * (there's nowhere left to put it).
 */
function wrapAddressLines(fullAddress, { width = 40, maxLines = 3 } = {}) {
  const words = String(fullAddress || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current.slice(0, width));
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current.slice(0, width));
  return lines.slice(0, maxLines);
}

export const exportApplicationToCvlkra = async (applicationId, options = {}) => {
  const client = await pool.connect();

  const overrides = {
    ...options,
    company_code:
      normalizeOptionalString(options.company_code) ||
      normalizeOptionalString(process.env.CVL_POSCODE),
    app_pos_code:
      normalizeOptionalString(options.app_pos_code) ||
      normalizeOptionalString(process.env.CVL_POSCODE),
    app_kra_code:
      normalizeOptionalString(options.app_kra_code) ||
      normalizeOptionalString(process.env.CVL_KRA_CODE) ||
      "CVLKRA",
  };

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
          AND table_name = 'cvlkra_data'
      ) AS table_exists;
    `);

    if (!tableResult.rows[0]?.table_exists) {
      throw createHttpError("public.cvlkra_data does not exist in this database.", 500);
    }

    const uniqueConstraintResult = await client.query(
      checkCvlkraUniqueIdConstraintQuery,
    );

    if (!uniqueConstraintResult.rows[0]?.has_unique_id_constraint) {
      throw createHttpError(
        "public.cvlkra_data.unique_id is not backed by a unique constraint — cannot upsert safely.",
        500,
      );
    }

    const sourceResult = await client.query(getCvlkraSourceByApplicationIdQuery, [
      applicationId,
      JSON.stringify(overrides),
    ]);
    const sourceRow = sourceResult.rows[0];

    if (!sourceRow) {
      throw createHttpError(
        "Source KYC data could not be assembled for the requested application_id",
        404,
      );
    }

    // cvlkra_data.unique_id is bigint and must equal
    // kyc_master_details.unique_id (the same link token cdsl_data, nse_data,
    // bse_data and mf_data all key off) — not the internal row id. Older
    // leads created before unique_id became sequential still carry a
    // non-numeric hex/UUID token and can't be exported until re-issued one.
    if (!/^\d+$/.test(String(sourceRow.shared_unique_id_text || ""))) {
      throw createHttpError(
        `kyc_master_details.unique_id ("${sourceRow.shared_unique_id_text}") is not numeric — cannot store it in cvlkra_data.unique_id (bigint). This application predates sequential unique_id values.`,
        422,
      );
    }

    const [resolvedCorrespondenceDistrict, resolvedPermanentDistrict] =
      await Promise.all([
        resolveDistrictAsync({
          district:
            normalizeOptionalString(overrides.app_corr_district) ||
            sourceRow.app_corr_district,
          pincode: sourceRow.app_cor_pincd,
          city: sourceRow.app_cor_city,
        }),
        resolveDistrictAsync({
          district:
            normalizeOptionalString(overrides.app_perm_district) ||
            sourceRow.app_perm_district,
          pincode: sourceRow.app_per_pincd,
          city: sourceRow.app_per_city,
        }),
      ]);

    // Word-wrap the raw address into the 3 fixed-width CVLKRA lines here in
    // JS (there's no wrap_text_line() function in this database), for both
    // the correspondence and permanent address blocks.
    const [addr1, addr2, addr3] = wrapAddressLines(sourceRow.raw_full_address);

    const enrichedOverrides = {
      ...overrides,
      app_corr_district: resolvedCorrespondenceDistrict.district,
      app_perm_district: resolvedPermanentDistrict.district,
      app_cor_add1: normalizeOptionalString(overrides.app_cor_add1) || addr1 || "",
      app_cor_add2: normalizeOptionalString(overrides.app_cor_add2) || addr2 || "",
      app_cor_add3: normalizeOptionalString(overrides.app_cor_add3) || addr3 || "",
      app_per_add1: normalizeOptionalString(overrides.app_per_add1) || addr1 || "",
      app_per_add2: normalizeOptionalString(overrides.app_per_add2) || addr2 || "",
      app_per_add3: normalizeOptionalString(overrides.app_per_add3) || addr3 || "",
    };

    const resolvedSourceResult = await client.query(getCvlkraSourceByApplicationIdQuery, [
      applicationId,
      JSON.stringify(enrichedOverrides),
    ]);
    const resolvedSourceRow = resolvedSourceResult.rows[0];

    const mandatoryFields = [
      { key: "company_code", label: "company code" },
      { key: "batch_date", label: "batch date" },
      { key: "app_pos_code", label: "POS code" },
      { key: "app_type", label: "application type" },
      { key: "app_date", label: "application date" },
      { key: "app_pan_no", label: "PAN number" },
      { key: "app_pan_copy", label: "PAN copy flag" },
      { key: "app_exmt", label: "PAN exemption flag" },
      { key: "app_ipv_flag", label: "IPV flag" },
      { key: "app_ipv_date", label: "IPV date" },
      { key: "app_gen", label: "gender" },
      { key: "app_name", label: "applicant name" },
      { key: "app_dob_incorp", label: "date of birth" },
      { key: "app_nationality", label: "nationality code" },
      { key: "app_res_status", label: "residential status" },
      { key: "app_cor_add1", label: "correspondence address line 1" },
      { key: "app_cor_city", label: "correspondence city" },
      { key: "app_cor_pincd", label: "correspondence pincode" },
      { key: "app_cor_state", label: "correspondence state code" },
      { key: "app_cor_ctry", label: "correspondence country code" },
      { key: "app_mob_no", label: "mobile number" },
      { key: "app_email", label: "email" },
      { key: "app_per_add_flag", label: "permanent-address-same flag" },
      { key: "app_per_add1", label: "permanent address line 1" },
      { key: "app_per_city", label: "permanent city" },
      { key: "app_per_pincd", label: "permanent pincode" },
      { key: "app_per_state", label: "permanent state code" },
      { key: "app_per_ctry", label: "permanent country code" },
      { key: "app_kyc_mode", label: "KYC mode" },
      { key: "app_kra_code", label: "KRA code" },
    ];

    const missingFields = mandatoryFields
      .filter(({ key }) => !String(resolvedSourceRow[key] || "").trim())
      .map(({ label }) => label);

    if (missingFields.length > 0) {
      console.warn("Mandatory CVLKRA export data is missing", {
        application_id: applicationId,
        missing_fields: missingFields,
        hint:
          "Supply CVLKRA-only overrides in the POST body for unresolved coded fields such as app_income, app_occ, app_mar_status, app_doc_proof, app_cor_add_proof, app_per_add_proof, app_updtflg, or app_ver_no when your business team confirms the exact CVLKRA mapping.",
      });
    }

    const upsertResult = await client.query(upsertCvlkraDataByApplicationIdQuery, [
      applicationId,
      JSON.stringify(enrichedOverrides),
    ]);
    const cvlkraRow = upsertResult.rows[0];

    if (!cvlkraRow) {
      throw createHttpError("CVLKRA upsert did not return a row", 500);
    }

    await client.query("COMMIT");

    return {
      id: Number(cvlkraRow.id),
      application_id: Number(cvlkraRow.application_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
