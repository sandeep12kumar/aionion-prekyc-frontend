/**
 * Shared "is this eSign done yet, and if so finalise it" logic.
 *
 * Used by:
 *   - GET /api/esign/applications/:id/status   (client poll)
 *   - the background reconciler                 (so completion + the client
 *     email happen even if the client never polls / closes the tab)
 */
import { pool } from "../config/database.js";
import {
  getEsignConfig,
  fetchEsignStatus,
  downloadSignedEsignDocument,
  extractAadhaarNameFromSetu,
} from "./esignService.js";
import { bestNameMatch, DEFAULT_NAME_MATCH_THRESHOLD } from "../utils/nameMatch.js";
import {
  markStampPaperUsedAfterEsign,
  markAllocatedBoidUsed,
  sendCompletionEmail,
} from "./completionSideEffects.js";
import { exportApplicationToCvlkra } from "./cvlkraExportService.js";
import { exportApplicationToCdsl } from "./cdslExportService.js";
import { exportApplicationToNse } from "./nseExportService.js";
import { exportApplicationToBse } from "./bseExportService.js";
import { exportApplicationToMf } from "./mfExportService.js";
import { exportApplicationToTechexcel } from "./techexcelExportService.js";

/**
 * @returns {{ status: "completed"|"pending"|"failed"|"name_mismatch"|"not_started"|"error",
 *             signedPdfUrl?: string, message?: string, rawStatus?: string }}
 */
export async function finalizeEsign(kycId, options = {}) {
  const { rows } = await pool.query(
    `SELECT id, pan_number, boid, esign_request_id, esign_status, esign_signed_pdf_path,
            itr_name, digilocker_name, kra_name
       FROM public.kyc_master_details WHERE id = $1`,
    [kycId],
  );
  if (!rows.length) return { status: "error", message: "Application not found." };
  const row = rows[0];

  if (row.esign_status === "completed" && row.esign_signed_pdf_path) {
    await sendCompletionEmail(row.id); // idempotent
    return { status: "completed", signedPdfUrl: row.esign_signed_pdf_path };
  }
  if (!row.esign_request_id) return { status: "not_started" };

  const config = options.config || getEsignConfig();
  const { rawStatus, normalizedStatus, providerMessage, providerPayload } = await fetchEsignStatus(
    row.esign_request_id,
    config,
  );

  if (normalizedStatus === "completed") {
    // The Aadhaar that actually signed must belong to the account holder.
    const aadhaarName = extractAadhaarNameFromSetu(providerPayload);
    const threshold = Number(process.env.ESIGN_NAME_MATCH_THRESHOLD || DEFAULT_NAME_MATCH_THRESHOLD);
    if (aadhaarName) {
      const match = bestNameMatch(aadhaarName, [row.itr_name, row.digilocker_name, row.kra_name]);
      if (match.score < threshold) {
        const detail =
          `Aadhaar name "${aadhaarName}" does not match the account holder ` +
          `("${row.itr_name || row.digilocker_name || row.kra_name || "?"}") — ` +
          `best score ${match.score.toFixed(2)} < ${threshold}`;
        console.error(`[eSign] application ${row.id} NAME MISMATCH: ${detail}`);
        await pool.query(
          `UPDATE public.kyc_master_details SET
              esign_status = 'name_mismatch', esign_last_provider_message = $2,
              is_completed = FALSE, updated_at = NOW()
            WHERE id = $1`,
          [row.id, detail.slice(0, 500)],
        );
        return {
          status: "name_mismatch",
          message:
            `The Aadhaar used for eSign ("${aadhaarName}") does not match the ` +
            `account holder's name ("${row.itr_name || row.digilocker_name || row.kra_name}"). ` +
            `Please complete the eSign using the account holder's own Aadhaar.`,
        };
      }
      console.log(
        `[eSign] application ${row.id} name match OK: "${aadhaarName}" ~ "${match.name}" (${match.score.toFixed(2)})`,
      );
    } else {
      // Setu sometimes reports the overall status as complete a beat before
      // it populates signers[].signatureDetails (the certificate name) — do
      // NOT fail open and finalise without having verified who actually
      // signed. Keep polling (bounded by the client's own poll timeout)
      // until a name shows up to check, rather than ever risk accepting an
      // unverified Aadhaar as "completed".
      console.warn(
        `[eSign] application ${row.id}: Setu reports complete but signatureDetails has no name yet — waiting for it before finalising. Payload: ${JSON.stringify(providerPayload)}`,
      );
      return { status: "pending", rawStatus: rawStatus || "" };
    }

    let signedPdfUrl = row.esign_signed_pdf_path;
    try {
      const saved = await downloadSignedEsignDocument({
        requestId: row.esign_request_id,
        kycId: row.id,
        pan: row.pan_number,
        config,
      });
      signedPdfUrl = saved.publicPath;
    } catch (downloadError) {
      console.error("[eSign] signed PDF download failed:", downloadError.message);
    }

    await pool.query(
      `UPDATE public.kyc_master_details SET
          esign_status = 'completed',
          esign_signed_pdf_path = COALESCE($2, esign_signed_pdf_path),
          esign_signed_at = NOW(),
          esign_last_provider_message = $3,
          current_stage = 'esigned',
          kyc_status = 'completed',
          is_completed = TRUE,
          account_opening_status = 'Yes',
          updated_at = NOW()
        WHERE id = $1`,
      [row.id, signedPdfUrl || null, rawStatus || "sign_complete"],
    );

    await markStampPaperUsedAfterEsign(row.id);
    await markAllocatedBoidUsed(row.boid);
    await sendCompletionEmail(row.id);

    // Best-effort: push the completed application's data into cvlkra_data,
    // cdsl_data, nse_data, bse_data, mf_data and techexcel. Never lets an
    // export problem fail the eSign completion response.
    try {
      await exportApplicationToCvlkra(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} CVLKRA export failed:`, exportError.message);
    }
    try {
      await exportApplicationToCdsl(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} CDSL export failed:`, exportError.message);
    }
    try {
      await exportApplicationToNse(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} NSE export failed:`, exportError.message);
    }
    try {
      await exportApplicationToBse(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} BSE export failed:`, exportError.message);
    }
    try {
      await exportApplicationToMf(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} MF export failed:`, exportError.message);
    }
    try {
      await exportApplicationToTechexcel(row.id);
    } catch (exportError) {
      console.error(`[eSign] application ${row.id} TechExcel export failed:`, exportError.message);
    }

    return { status: "completed", signedPdfUrl };
  }

  if (normalizedStatus === "failed") {
    const detail = providerMessage || rawStatus || "failed";
    console.error(`[eSign] application ${row.id} failed:`, detail);
    await pool.query(
      `UPDATE public.kyc_master_details SET
          esign_status = 'failed', esign_last_provider_message = $2, updated_at = NOW()
        WHERE id = $1`,
      [row.id, detail.slice(0, 500)],
    );
    return {
      status: "failed",
      message: providerMessage
        ? `Setu could not complete the eSign: ${providerMessage}`
        : "The eSign was not completed. You can start it again.",
    };
  }

  return { status: "pending", rawStatus: rawStatus || "" };
}

/**
 * Background sweep: finalise every application whose eSign is still 'pending'
 * on our side but 'sign_complete' at Setu. Runs on a timer from server.js so
 * the completion email goes out even when the client never polls.
 */
export async function reconcilePendingEsigns() {
  let candidates;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM public.kyc_master_details
        WHERE esign_request_id IS NOT NULL
          AND COALESCE(esign_status, '') NOT IN ('completed', 'failed', 'name_mismatch')
        ORDER BY updated_at DESC
        LIMIT 25`,
    );
    candidates = rows;
  } catch (error) {
    console.error("[eSign reconciler] query failed:", error.message);
    return;
  }
  if (!candidates.length) return;

  const config = getEsignConfig();
  for (const { id } of candidates) {
    try {
      const result = await finalizeEsign(id, { config });
      if (result.status === "completed") {
        console.log(`[eSign reconciler] application ${id} finalised`);
      }
    } catch (error) {
      console.error(`[eSign reconciler] application ${id} failed:`, error.message);
    }
  }
}
