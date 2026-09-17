import { Router } from "express";
import { getBankByIfscController, verifyAndSaveBankController } from "../controllers/bankController.js";

const router = Router();
router.get("/banks/ifsc/:ifsc", getBankByIfscController);
router.post("/leads/:id/bank/verify-and-save", verifyAndSaveBankController);
export default router;
