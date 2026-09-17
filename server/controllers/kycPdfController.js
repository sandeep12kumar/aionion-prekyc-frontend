import { resolveKycId } from "../utils/kycMaster.js";
import { generateKycApplicationPdf } from "../services/kycApplicationPdfService.js";

/**
 * GET /api/kyc/leads/:id/application-pdf
 * GET /api/kyc/client-link/:uniqueId/application-pdf
 * Builds the account-opening PDF from kyc_master_details, allocating a BO ID
 * (master_data.boid_master) and a DDPI stamp number (stamp_paper_master) if
 * not already assigned, and streams it inline for the e-sign preview.
 */
export async function getApplicationPdfController(request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id || request.params.uniqueId);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const result = await generateKycApplicationPdf(kycId);

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${result.fileName}"`);
    response.setHeader("X-Boid", result.boid || "");
    response.setHeader("X-Stamp-Number", result.stampNumber || "");
    response.setHeader("X-Page-Count", String(result.pageCount));
    return response.status(200).send(result.buffer);
  } catch (error) {
    if (error.code === "APPLICATION_NOT_FOUND") {
      return response.status(404).json({ message: "Application not found." });
    }
    if (error.code === "BOID_MISSING") {
      return response.status(409).json({
        code: "BOID_MISSING",
        message:
          "No BO ID is available in master_data.boid_master, so the application form cannot be generated. Please contact support.",
      });
    }
    return next(error);
  }
}
