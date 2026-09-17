import { resolveKycId } from "../utils/kycMaster.js";
import { exportApplicationToNse } from "../services/nseExportService.js";

/** POST /api/nse/:application_id — manual/on-demand NSE export trigger. */
export async function postNseExportController(request, response, next) {
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

    const exportedRow = await exportApplicationToNse(applicationId);

    return response.status(200).json({
      success: true,
      message: "NSE export upsert completed successfully",
      application_id: exportedRow.application_id,
      nse_row_id: exportedRow.id,
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        success: false,
        message: error.message || "Unable to export NSE data right now.",
        ...(error.details ? { details: error.details } : {}),
      });
    }
    return next(error);
  }
}
