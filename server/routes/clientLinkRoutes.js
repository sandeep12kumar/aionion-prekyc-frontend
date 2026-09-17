import { Router } from "express";
import { getClientLinkController, getClientReviewController } from "../controllers/clientLinkController.js";
import { getApplicationPdfController } from "../controllers/kycPdfController.js";

const router = Router();

router.get("/client-link/:uniqueId", getClientLinkController);
router.get("/client-link/:uniqueId/review", getClientReviewController);
router.get("/client-link/:uniqueId/application-pdf", getApplicationPdfController);
router.get("/leads/:id/application-pdf", getApplicationPdfController);

export default router;
