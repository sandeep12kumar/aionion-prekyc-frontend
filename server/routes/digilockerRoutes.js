import { Router } from "express";
import { fetchDigilockerController, startDigilockerController } from "../controllers/digilockerController.js";

const router = Router();
router.post("/leads/:id/digilocker/start", startDigilockerController);
router.get("/leads/:id/digilocker/:requestId", fetchDigilockerController);

export default router;
