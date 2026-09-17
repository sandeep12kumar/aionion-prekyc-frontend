import { Router } from "express";
import { checkDobController, checkExistingPanController, verifyPanController } from "../controllers/panController.js";
const router = Router();
router.post("/leads/:id/pan/verify", verifyPanController);
router.post("/pan/check-existing", checkExistingPanController);
router.post("/dob/check", checkDobController);
export default router;
