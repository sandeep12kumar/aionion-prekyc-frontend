import { Router } from "express";
import { savePersonalDetailsController } from "../controllers/personalController.js";

const router = Router();
router.post("/leads/:id/personal", savePersonalDetailsController);
export default router;
