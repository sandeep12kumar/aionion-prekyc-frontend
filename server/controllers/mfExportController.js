import { resolveKycId } from "../utils/kycMaster.js";
import { exportApplicationToMf } from "../services/mfExportService.js";

/** POST /api/mf/:application_id — manual/on-demand MF (BSE STAR MF UCC) export trigger. */
export async function postMfExportController(request, response, next) {
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

    const exportedRow = await exportApplicationToMf(applicationId, {
      div_pay_mode: request.body?.div_pay_mode,
      communication_mode: request.body?.communication_mode,
      paperless_flag: request.body?.paperless_flag,
      mobile_declaration_flag: request.body?.mobile_declaration_flag,
      email_declaration_flag: request.body?.email_declaration_flag,
    });

    return response.status(200).json({
      success: true,
      message: "MF export upsert completed successfully",
      application_id: exportedRow.application_id,
      mf_row_id: exportedRow.id,
    });
  } catch (error) {
    if (error.statusCode) {
      return response.status(error.statusCode).json({
        success: false,
        message: error.message || "Unable to export MF data right now.",
        ...(error.details ? { details: error.details } : {}),
      });
    }
    return next(error);
  }
}
