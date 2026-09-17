import { Router } from "express";
import { uploadIpvCaptureController } from "../controllers/ipvController.js";
import { uploadIpvCapture } from "../config/upload.js";

const router = Router();

router.post("/leads/:id/ipv", uploadIpvCapture, uploadIpvCaptureController);

export default router;
