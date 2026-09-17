import { pool } from "../config/database.js";
import {
  getNseSourceByApplicationIdQuery,
  checkNseApplicationIdUniqueIndexQuery,
  upsertNseDataByApplicationIdQuery,
} from "../queries/nseExportQueries.js";

const createHttpError = (message, statusCode, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

export const exportApplicationToNse = async (applicationId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const applicationResult = await client.query(
      "SELECT id FROM public.kyc_master_details WHERE id = $1 LIMIT 1",
      [applicationId],
    );

    if (applicationResult.rows.length === 0) {
      throw createHttpError("Application not found in public.kyc_master_details", 404);
    }

    const uniqueIndexResult = await client.query(
      checkNseApplicationIdUniqueIndexQuery,
    );

    if (!uniqueIndexResult.rows[0]?.has_unique_application_id) {
      throw createHttpError(
        "public.nse_data.unique_id is not backed by a unique constraint — cannot upsert safely.",
        500,
      );
    }

    const sourceResult = await client.query(getNseSourceByApplicationIdQuery, [
      applicationId,
    ]);
    const sourceRow = sourceResult.rows[0];

    if (!sourceRow) {
      throw createHttpError(
        "Source KYC data could not be assembled for the requested application_id",
        404,
      );
    }

    // nse_data.unique_id is bigint and must equal kyc_master_details.unique_id
    // (the same link token cvlkra_data, cdsl_data, bse_data and mf_data all
    // key off) — not the internal row id. Older leads created before
    // unique_id became sequential still carry a non-numeric hex/UUID token
    // and can't be exported until re-issued one.
    if (!/^\d+$/.test(String(sourceRow.source_unique_id_text || ""))) {
      throw createHttpError(
        `kyc_master_details.unique_id ("${sourceRow.source_unique_id_text}") is not numeric — cannot store it in nse_data.unique_id (bigint). This application predates sequential unique_id values.`,
        422,
      );
    }

    const upsertResult = await client.query(upsertNseDataByApplicationIdQuery, [
      applicationId,
    ]);
    const nseRow = upsertResult.rows[0];

    if (!nseRow) {
      throw createHttpError("NSE upsert did not return a row", 500);
    }

    await client.query("COMMIT");

    return {
      id: Number(nseRow.id),
      application_id: Number(nseRow.application_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
