import { Router } from "express";
import {
  sendMobileOtpController,
  verifyMobileOtpController,
  sendEmailOtpController,
  verifyEmailOtpController,
} from "../controllers/otpController.js";

const router = Router();

// :id accepts either the sequential lead id or the secure link's unique_id
// (see utils/kycMaster.js#resolveKycId) — demat-kyc-flow always has the
// latter from the client-link fetch.
router.post("/leads/:id/otp/mobile/send", sendMobileOtpController);
router.post("/leads/:id/otp/mobile/verify", verifyMobileOtpController);
router.post("/leads/:id/otp/email/send", sendEmailOtpController);
router.post("/leads/:id/otp/email/verify", verifyEmailOtpController);

export default router;
