import { Router } from "express";
import { postCvlkraExportController } from "../controllers/cvlkraExportController.js";

const router = Router();

router.post("/cvlkra/:application_id", postCvlkraExportController);

export default router;
