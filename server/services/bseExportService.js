import { pool } from "../config/database.js";
import {
  getBseSourceByApplicationIdQuery,
  checkBseApplicationIdUniqueIndexQuery,
  upsertBseDataByApplicationIdQuery,
} from "../queries/bseExportQueries.js";

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

export const exportApplicationToBse = async (applicationId, options = {}) => {
  const client = await pool.connect();

  const transactionCode = normalizeOptionalString(
    options.transaction_code || process.env.BSE_TRANSACTION_CODE,
  );
  const clientType = normalizeOptionalString(
    options.client_type || process.env.BSE_CLIENT_TYPE,
  );
  const status = normalizeOptionalString(options.status || process.env.BSE_STATUS);
  const typeOfService = normalizeOptionalString(
    options.type_of_service || process.env.BSE_TYPE_OF_SERVICE,
  );
  const contactDetails = normalizeOptionalString(
    options.contact_details || process.env.BSE_CONTACT_DETAILS,
  );
  const provideDetails = normalizeOptionalString(
    options.provide_details || process.env.BSE_PROVIDE_DETAILS,
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
          AND table_name = 'bse_data'
      ) AS table_exists;
    `);

    if (!tableResult.rows[0]?.table_exists) {
      throw createHttpError("public.bse_data does not exist in this database.", 500);
    }

    const uniqueIndexResult = await client.query(
      checkBseApplicationIdUniqueIndexQuery,
    );

    if (!uniqueIndexResult.rows[0]?.has_unique_application_id) {
      throw createHttpError(
        "public.bse_data.unique_id is not backed by a unique constraint — cannot upsert safely.",
        500,
      );
    }

    const sourceResult = await client.query(getBseSourceByApplicationIdQuery, [
      applicationId,
      transactionCode,
      clientType,
      status,
      typeOfService,
      contactDetails,
      provideDetails,
    ]);
    const sourceRow = sourceResult.rows[0];

    if (!sourceRow) {
      throw createHttpError(
        "Source KYC data could not be assembled for the requested application_id",
        404,
      );
    }

    // bse_data.unique_id is bigint and must equal kyc_master_details.unique_id
    // (the same link token cvlkra_data, cdsl_data, nse_data and mf_data all
    // key off) — not the internal row id. Older leads created before
    // unique_id became sequential still carry a non-numeric hex/UUID token
    // and can't be exported until re-issued one.
    if (!/^\d+$/.test(String(sourceRow.shared_unique_id_text || ""))) {
      throw createHttpError(
        `kyc_master_details.unique_id ("${sourceRow.shared_unique_id_text}") is not numeric — cannot store it in bse_data.unique_id (bigint). This application predates sequential unique_id values.`,
        422,
      );
    }

    const mandatoryFields = [
      { key: "pan_no", label: "PAN number" },
      { key: "client_name", label: "client name" },
      { key: "date_of_birth", label: "date of birth" },
      { key: "address1", label: "address line 1" },
      { key: "city", label: "city" },
      { key: "pincode", label: "pincode" },
      { key: "mobile_number", label: "mobile number" },
      { key: "email", label: "email" },
    ];

    const missingFields = mandatoryFields
      .filter(({ key }) => !String(sourceRow[key] || "").trim())
      .map(({ label }) => label);

    if (missingFields.length > 0) {
      console.warn("Mandatory BSE export data is missing", {
        application_id: applicationId,
        missing_fields: missingFields,
      });
    }

    const upsertResult = await client.query(upsertBseDataByApplicationIdQuery, [
      applicationId,
      transactionCode,
      clientType,
      status,
      typeOfService,
      contactDetails,
      provideDetails,
    ]);
    const bseRow = upsertResult.rows[0];

    if (!bseRow) {
      throw createHttpError("BSE upsert did not return a row", 500);
    }

    await client.query("COMMIT");

    return {
      id: Number(bseRow.id),
      application_id: Number(bseRow.application_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
