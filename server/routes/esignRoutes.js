import { Router } from "express";
import {
  startEsignController,
  getEsignStatusController,
  getSignedPdfController,
  markEsignedController,
} from "../controllers/esignController.js";

const router = Router();

router.post("/esign/applications/:id/start", startEsignController);
router.get("/esign/applications/:id/status", getEsignStatusController);
router.get("/esign/applications/:id/signed-pdf", getSignedPdfController);
router.post("/esign/applications/:id/mark-esigned", markEsignedController);

export default router;
