import { resolveKycId } from "../utils/kycMaster.js";
import { exportApplicationToCdsl } from "../services/cdslExportService.js";

/** POST /api/cdsl/:application_id — manual/on-demand CDSL export trigger. */
export async function postCdslExportController(request, response, next) {
  try {
    const applicationId = await resolveKycId(
      request.params.application_id || request.params.kyc_id,
    );

    if (!applicationId) {
      return response.status(400).json({
        success: false,
        message: "Valid application_id is required",
      });
    }

    const exportedRow = await exportApplicationToCdsl(applicationId, request.body || {});

    return response.status(200).json({
      success: true,
      message: "CDSL export upsert completed successfully",
      application_id: exportedRow.application_id,
      cdsl_row_id: exportedRow.id,
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        success: false,
        message: error.message || "Unable to export CDSL data right now.",
        ...(error.details ? { details: error.details } : {}),
      });
    }
    return next(error);
  }
}
