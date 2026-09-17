import { resolveKycId } from "../utils/kycMaster.js";
import { exportApplicationToCvlkra } from "../services/cvlkraExportService.js";

/** POST /api/cvlkra/:application_id — manual/on-demand CVLKRA export trigger. */
export async function postCvlkraExportController(request, response, next) {
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

    const exportedRow = await exportApplicationToCvlkra(applicationId, request.body || {});

    return response.status(200).json({
      success: true,
      message: "CVLKRA export upsert completed successfully",
      application_id: exportedRow.application_id,
      cvlkra_row_id: exportedRow.id,
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        success: false,
        message: error.message || "Unable to export CVLKRA data right now.",
        ...(error.details ? { details: error.details } : {}),
      });
    }
    return next(error);
  }
}
