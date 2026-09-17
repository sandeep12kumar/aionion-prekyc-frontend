import { exportApplicationToTechexcel } from "../services/techexcelExportService.js";

/** POST /api/techexcel/:application_id — manual/on-demand TechExcel export trigger. */
export async function postTechexcelExportController(request, response, next) {
  try {
    const identifier = request.params.application_id || request.params.kyc_id;
    const result = await exportApplicationToTechexcel(identifier);

    return response.status(200).json({
      success: true,
      message: "TechExcel export upsert completed successfully",
      application_id: result.application_id,
      techexcel_row_id: result.id,
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        success: false,
        message: error.message || "Unable to export TechExcel data right now.",
      });
    }
    return next(error);
  }
}
