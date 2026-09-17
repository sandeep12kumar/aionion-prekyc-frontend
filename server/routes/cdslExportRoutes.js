import { Router } from "express";
import { postCdslExportController } from "../controllers/cdslExportController.js";

const router = Router();

router.post("/cdsl/:application_id", postCdslExportController);

export default router;
