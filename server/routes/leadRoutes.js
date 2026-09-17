import { Router } from "express";
import { createLeadController, getLeadSummaryController, saveSchemeController, sendClientLinkController, uploadPanImageController, uploadSignatureImageController } from "../controllers/leadController.js";
import { uploadPanImage, uploadSignatureImage } from "../config/upload.js";

const router = Router();

router.post("/leads", createLeadController);
router.get("/leads/:id", getLeadSummaryController);
router.post("/leads/:id/scheme", saveSchemeController);
router.post("/leads/:id/send-client-link", sendClientLinkController);
router.post("/leads/:id/pan-image", uploadPanImage, uploadPanImageController);
router.post("/leads/:id/signature-image", uploadSignatureImage, uploadSignatureImageController);

export default router;
