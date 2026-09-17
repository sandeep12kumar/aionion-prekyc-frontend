import { pool } from "../config/database.js";

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// GENERATE CLIENT CODE — <5th char of PAN> + "1" + a 5-digit running
// sequence, e.g. PAN "CTDPA5487H" (5th char "A") -> "A100201", "A100202", ...
// The sequence is per PAN-prefix-letter, not global. Starts at 00201 (not
// 00001) because this app shares kyc_master_details with a sibling KYC flow
// that already occupies codes 00001-00200 for the same PAN-prefix letters.
const MIN_SEQUENCE = 201;

export async function generateClientCode(panNumber) {
  const cleanPan = String(panNumber || "").trim().toUpperCase();
  const fifthChar = cleanPan[4];
  if (!PAN_PATTERN.test(cleanPan) || !/^[A-Z]$/.test(fifthChar)) {
    throw new Error("A valid PAN number is required to generate a client code.");
  }
  const codePrefix = `${fifthChar}1`;

  // Highest sequence already used for this prefix.
  const { rows } = await pool.query(
    `SELECT client_code
     FROM public.kyc_master_details
     WHERE client_code ~ $1
     ORDER BY CAST(SUBSTRING(client_code FROM 3) AS INTEGER) DESC
     LIMIT 1`,
    [`^${codePrefix}[0-9]{5}$`],
  );

  let nextSequence = MIN_SEQUENCE;
  if (rows.length > 0) {
    const lastNumber = parseInt(String(rows[0].client_code).substring(2), 10);
    if (!Number.isNaN(lastNumber)) nextSequence = Math.max(lastNumber + 1, MIN_SEQUENCE);
  }

  if (nextSequence > 99999) {
    throw new Error(`Client-code range is exhausted for PAN prefix ${codePrefix}.`);
  }
  return `${codePrefix}${String(nextSequence).padStart(5, "0")}`;
}

/**
 * Ensure a client code exists for an application (idempotent).
 * - already stamped on the row -> return it
 * - otherwise -> generate a fresh one and stamp it
 *
 * Every application gets its OWN client code — there is no cross-application
 * reuse by PAN or email. Two different PANs are two different people and
 * must never share a code; a shared email (e.g. a family member's inbox used
 * for two applications) previously caused exactly that collision, so that
 * matching was removed entirely.
 */
export async function ensureClientCode(applicationId) {
  try {
    const appResult = await pool.query(
      `SELECT pan_number, client_code
       FROM public.kyc_master_details
       WHERE id = $1`,
      [applicationId],
    );

    if (appResult.rows.length === 0) {
      console.warn(`[ClientCodeService] Application ${applicationId} not found`);
      return null;
    }

    const { pan_number: panNumber, client_code: existingClientCode } = appResult.rows[0];

    if (existingClientCode) return existingClientCode;

    if (!panNumber) {
      console.warn(`[ClientCodeService] No PAN found for application ${applicationId}`);
      return null;
    }

    const cleanPan = panNumber.trim().toUpperCase();
    const newClientCode = await generateClientCode(cleanPan);
    console.log(`[ClientCodeService] Generated new client code for application ${applicationId}:`, newClientCode);

    await pool.query(
      `UPDATE public.kyc_master_details
       SET client_code = $2, updated_at = NOW()
       WHERE id = $1 AND client_code IS NULL`,
      [applicationId, newClientCode],
    );

    return newClientCode;
  } catch (error) {
    console.error(`[ClientCodeService] Error ensuring client code for application ${applicationId}:`, error);
    return null;
  }
}
