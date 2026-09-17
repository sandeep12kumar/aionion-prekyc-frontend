import { Router } from "express";
import { saveNomineeDetailsController } from "../controllers/nomineeController.js";

const router = Router();
router.post("/leads/:id/nominees", saveNomineeDetailsController);
export default router;
