import { Router } from "express";
import { postBseExportController } from "../controllers/bseExportController.js";

const router = Router();

router.post("/bse/:application_id", postBseExportController);

export default router;
