import { Router } from "express";
import { postTechexcelExportController } from "../controllers/techexcelExportController.js";

const router = Router();

router.post("/techexcel/:application_id", postTechexcelExportController);

export default router;
