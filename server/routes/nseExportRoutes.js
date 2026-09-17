import { Router } from "express";
import { postNseExportController } from "../controllers/nseExportController.js";

const router = Router();

router.post("/nse/:application_id", postNseExportController);

export default router;
