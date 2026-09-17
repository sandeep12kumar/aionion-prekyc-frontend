import { Router } from "express";
import { createPaymentOrder, verifyPayment, razorpayWebhook, getPaymentStatus, generateClientCodeAfterPayment } from "../controllers/paymentController.js";

const router = Router();

router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPayment);
router.post("/razorpay-webhook", razorpayWebhook);
router.post("/client-code", generateClientCodeAfterPayment);
router.get("/status/:kyc_id", getPaymentStatus);

export default router;
