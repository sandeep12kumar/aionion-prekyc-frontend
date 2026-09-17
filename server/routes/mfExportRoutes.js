import { Router } from "express";
import { postMfExportController } from "../controllers/mfExportController.js";

const router = Router();

router.post("/mf/:application_id", postMfExportController);

export default router;
