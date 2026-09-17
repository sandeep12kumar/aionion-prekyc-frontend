import { Router } from "express";
import { healthCheckController } from "../controllers/healthController.js";

const router = Router();

router.get("/health", healthCheckController);

export default router;
