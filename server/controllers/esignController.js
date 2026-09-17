import fs from "node:fs";
import path from "node:path";
import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import { startEsignForApplication } from "../services/esignService.js";
import { finalizeEsign } from "../services/esignCompletion.js";
import {
  markStampPaperUsedAfterEsign,
  markAllocatedBoidUsed,
  sendCompletionEmail,
} from "../services/completionSideEffects.js";
import { readUploadFromS3 } from "../services/s3StorageService.js";

const sendError = (response, error, next) => {
  if (error.status && error.code) {
    return response.status(error.status).json({ code: error.code, message: error.message });
  }
  if (error.code === "APPLICATION_NOT_FOUND") {
    return response.status(404).json({ message: "Application not found." });
  }
  if (error.code === "BOID_MISSING") {
    return response.status(409).json({
      code: "BOID_MISSING",
      message: "No BO ID is available, so the application form cannot be prepared for eSign.",
    });
  }
  return next(error);
};

/** POST /api/esign/applications/:id/start  { latitude, longitude, location } */
export async function startEsignController(request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const { latitude, longitude, location } = request.body || {};
    const result = await startEsignForApplication(kycId, { latitude, longitude, location });

    if (result.alreadyCompleted) {
      return response.status(200).json({ status: "completed", signedPdfUrl: result.signedPdfUrl });
    }
    return response.status(200).json({
      status: "pending",
      signingUrl: result.signingUrl,
      requestId: result.requestId,
      pageCount: result.pageCount,
    });
  } catch (error) {
    return sendError(response, error, next);
  }
}

/** GET /api/esign/applications/:id/status */
export async function getEsignStatusController(request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const result = await finalizeEsign(kycId);
    if (result.status === "error") return response.status(404).json({ message: result.message });
    return response.status(200).json(result);
  } catch (error) {
    return sendError(response, error, next);
  }
}

/** GET /api/esign/applications/:id/signed-pdf — streams the stored signed PDF. */
export async function getSignedPdfController(request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const { rows } = await pool.query(
      `SELECT esign_signed_pdf_path FROM public.kyc_master_details WHERE id = $1`,
      [kycId],
    );
    const rel = rows[0]?.esign_signed_pdf_path;
    if (!rel) return response.status(404).json({ message: "No signed document yet." });

    let pdfBytes = await readUploadFromS3(rel);
    if (!pdfBytes) {
      // Fallback for files not yet migrated to S3.
      const abs = path.join(path.resolve("uploads"), rel.replace(/^\/?uploads\//, ""));
      if (fs.existsSync(abs)) pdfBytes = fs.readFileSync(abs);
    }
    if (!pdfBytes) return response.status(404).json({ message: "Signed document file is missing." });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${path.basename(rel)}"`);
    return response.status(200).send(pdfBytes);
  } catch (error) {
    return next(error);
  }
}

/** POST /api/esign/applications/:id/mark-esigned — manual completion fallback. */
export async function markEsignedController(request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const { rows } = await pool.query(
      `UPDATE public.kyc_master_details SET
          current_stage = 'esigned', kyc_status = 'completed', is_completed = TRUE,
          account_opening_status = 'Yes', updated_at = NOW()
        WHERE id = $1
        RETURNING id, boid`,
      [kycId],
    );
    if (!rows.length) return response.status(404).json({ message: "Application not found." });

    await markStampPaperUsedAfterEsign(rows[0].id);
    await markAllocatedBoidUsed(rows[0].boid);
    await sendCompletionEmail(rows[0].id);

    return response.status(200).json({ status: "completed" });
  } catch (error) {
    return next(error);
  }
}
