import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import {
  createOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../services/razorpayService.js";
import { validatePaymentSource } from "../services/paymentSourceValidator.js";
import { ensureClientCode } from "../services/clientCodeService.js";
import { SCHEMES, gstBreakdown, getSchemeOpeningAmount } from "../config/schemes.js";

/** Load the bank account the client verified in the bank-details step, plus what's being paid for. */
const getVerifiedBankAccount = async (kycId) => {
  const { rows } = await pool.query(
    `SELECT bank_account_number, bank_ifsc_code, bank_name,
            bank_bank_verified, bank_verification_status,
            client_name, itr_name, digilocker_name, payment_firstname,
            selected_scheme,
            COALESCE(NULLIF(state, ''), NULLIF(digilocker_state, '')) AS place_of_supply
     FROM kyc_master_details WHERE id = $1`,
    [kycId],
  );
  const r = rows[0] || {};
  const verified =
    r.bank_bank_verified === true ||
    String(r.bank_verification_status || "").toLowerCase() === "success" ||
    String(r.bank_verification_status || "").toLowerCase() === "verified";

  return {
    account_number: r.bank_account_number || null,
    ifsc: r.bank_ifsc_code || null,
    name: r.client_name || r.itr_name || r.digilocker_name || r.payment_firstname || "",
    bank_name: r.bank_name || null,
    verified,
    selected_scheme: r.selected_scheme || null,
    place_of_supply: r.place_of_supply || "Tamil Nadu",
  };
};

const maskAccount = (acc) => {
  const s = String(acc || "").trim();
  return s.length < 5 ? s : `${"x".repeat(s.length - 4)}${s.slice(-4)}`;
};

/* =====================================================================
   1) CREATE ORDER
   POST /api/payment/create-order
   body: { kyc_id, firstname?, email?, phone?, description? }

   The amount is never taken from the request — it's always the price of
   the scheme the RM recorded in kyc_master_details.selected_scheme, so the
   client can't alter what they're charged.
   ===================================================================== */
export const createPaymentOrder = async (request, response) => {
  try {
    const { firstname, email, phone, description = "Trading and Demat Account Opening" } = request.body;

    const kycId = await resolveKycId(request.body.kyc_id || request.body.application_id || request.body.unique_id);
    if (!kycId) {
      return response.status(400).json({ success: false, message: "A valid kyc_id is required" });
    }

    const bankAcct = await getVerifiedBankAccount(kycId);

    if (!bankAcct.selected_scheme || !SCHEMES[bankAcct.selected_scheme]) {
      return response.status(400).json({
        success: false,
        code: "SCHEME_NOT_SELECTED",
        message: "No scheme has been selected for this application yet.",
      });
    }

    const gst = gstBreakdown(getSchemeOpeningAmount(bankAcct.selected_scheme), bankAcct.place_of_supply);
    const numericAmount = gst.total;

    if (!bankAcct.account_number || !bankAcct.ifsc) {
      return response.status(400).json({
        success: false,
        code: "BANK_NOT_VERIFIED",
        message: "Complete and verify your bank account before payment. The first payment must come from your own verified bank account.",
      });
    }

    const txnid = `TXN${Date.now()}`;
    const receipt = `kyc_${kycId}_${Date.now()}`.slice(0, 40);

    const { order, config, tpv, tpvError } = await createOrder({
      amount: numericAmount,
      currency: process.env.PAYMENT_CURRENCY || "INR",
      receipt,
      notes: { kyc_id: String(kycId), txnid, purpose: description },
      bankAccount: { account_number: bankAcct.account_number, ifsc: bankAcct.ifsc, name: bankAcct.name },
    });

    if (tpvError) {
      console.warn(`[Payment] TPV not enforced by Razorpay for kyc ${kycId}: ${tpvError}`);
    }

    await pool.query(
      `UPDATE kyc_master_details SET
        payment_txnid = $2, payment_order_id = $3, payment_amount = $4, payment_currency = $5,
        payment_status = 'created', payment_provider = 'Razorpay',
        payment_firstname = COALESCE(NULLIF($6, ''), payment_firstname),
        payment_email = COALESCE(NULLIF($7, ''), payment_email),
        payment_phone = COALESCE(NULLIF($8, ''), payment_phone),
        payment_receipt = $9, payment_description = $10, payment_created_at = NOW(),
        payment_response = $11, payment_source_verified = NULL, payment_source_note = $12,
        current_stage = 'payment', updated_at = NOW()
      WHERE id = $1`,
      [
        kycId, txnid, order.id, numericAmount, process.env.PAYMENT_CURRENCY || "INR",
        firstname || "", email || "", phone || "", receipt, description, JSON.stringify(order),
        tpv
          ? `Order bound to verified account ${maskAccount(bankAcct.account_number)} (${bankAcct.ifsc}) - Razorpay TPV active`
          : `Razorpay TPV not active${tpvError ? ` (${tpvError})` : ""} - source checked at verify time`,
      ],
    );

    return response.status(200).json({
      success: true,
      data: {
        kyc_id: kycId,
        key_id: config.keyId,
        mode: config.mode,
        order_id: order.id,
        amount: order.amount,
        amount_display: numericAmount,
        currency: order.currency,
        receipt,
        txnid,
        tpv,
        prefill: { name: firstname || bankAcct.name || "", email: email || "", contact: phone || "" },
        description,
      },
    });
  } catch (error) {
    const rzpStatus = error.response?.status;
    const rzpDesc = error.response?.data?.error?.description || error.message;

    console.error("CREATE PAYMENT ORDER ERROR:", rzpStatus || "", error.response?.data || error.message);

    if (error.code === "RAZORPAY_CONFIG_MISSING") {
      return response.status(503).json({ success: false, code: "RAZORPAY_CONFIG_MISSING", message: error.message });
    }

    if (rzpStatus === 401 || /authentication failed/i.test(rzpDesc || "")) {
      return response.status(502).json({
        success: false,
        code: "RAZORPAY_AUTH_FAILED",
        message: "Payment gateway rejected the API credentials. Check RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET in server/.env.",
      });
    }

    if (
      error.code === "RAZORPAY_TPV_BANK_NOT_ENABLED" ||
      /bank is not enabled for the merchant/i.test(rzpDesc || "") ||
      /account number is mandatory for this merchant/i.test(rzpDesc || "")
    ) {
      return response.status(502).json({
        success: false,
        code: "RAZORPAY_TPV_BANK_NOT_ENABLED",
        message:
          `Your bank (${error.bankIfsc || "this bank"}) is not enabled for verified-account payments on our payment gateway yet. ` +
          "Please ask support to enable TPV for this bank, or complete the bank step with a supported bank.",
        gateway_reason: error.tpvReason || rzpDesc,
      });
    }

    return response.status(502).json({ success: false, message: "Failed to create payment order", error: rzpDesc });
  }
};

/* =====================================================================
   2) VERIFY PAYMENT (called by the browser after Checkout success)
   POST /api/payment/verify
   body: { kyc_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
   ===================================================================== */
export const verifyPayment = async (request, response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

    const kycId = await resolveKycId(request.body.kyc_id || request.body.application_id || request.body.unique_id);
    if (!kycId) return response.status(400).json({ success: false, message: "A valid kyc_id is required" });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return response.status(400).json({ success: false, message: "Missing Razorpay payment fields" });
    }

    const isValid = verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });

    if (!isValid) {
      await pool.query(
        `UPDATE kyc_master_details SET payment_status = 'signature_failed', updated_at = NOW() WHERE id = $1 AND payment_order_id = $2`,
        [kycId, razorpay_order_id],
      );
      return response.status(400).json({ success: false, message: "Payment signature verification failed" });
    }

    let paymentDetails = null;
    try {
      paymentDetails = await fetchPayment(razorpay_payment_id);
    } catch (fetchError) {
      console.error("FETCH PAYMENT ERROR:", fetchError.response?.data || fetchError.message);
    }

    const bankAcct = await getVerifiedBankAccount(kycId);
    const sourceCheck = validatePaymentSource({
      payment: paymentDetails,
      verifiedIfsc: bankAcct.ifsc,
      verifiedAccountNumber: bankAcct.account_number,
    });
    console.log(
      `[Payment] TPV check kyc ${kycId}: method=${paymentDetails?.method} bank=${paymentDetails?.bank || paymentDetails?.vpa || "-"} -> ` +
        `${sourceCheck.blocked ? "BLOCKED" : sourceCheck.verified ? "VERIFIED" : "TOLERATED"} (${sourceCheck.note})`,
    );

    if (sourceCheck.blocked) {
      await pool.query(
        `UPDATE kyc_master_details SET
          payment_status = 'source_blocked', payment_id = $2,
          payment_method = COALESCE($3, payment_method),
          payment_source_verified = FALSE, payment_source_note = $4,
          payment_response = COALESCE($5, payment_response), updated_at = NOW()
        WHERE id = $1 AND payment_order_id = $6`,
        [kycId, razorpay_payment_id, paymentDetails?.method || null, sourceCheck.note, paymentDetails ? JSON.stringify(paymentDetails) : null, razorpay_order_id],
      );

      return response.status(422).json({
        success: false,
        code: "PAYMENT_SOURCE_REJECTED",
        message: sourceCheck.note || "This payment did not come from your verified bank account. Please pay again using that account.",
      });
    }

    const paymentStatus = paymentDetails?.status || "captured";
    const isPaid = ["captured", "authorized"].includes(paymentStatus);

    const result = await pool.query(
      `UPDATE kyc_master_details SET
        payment_id = $2, payment_signature = $3, payment_method = COALESCE($4, payment_method),
        payment_status = $5, payment_completed_at = NOW(), payment_response = COALESCE($6, payment_response),
        payment_source_verified = $9, payment_source_note = $10,
        current_stage = CASE WHEN $7 THEN 'ipv' ELSE current_stage END, updated_at = NOW()
      WHERE id = $1 AND payment_order_id = $8
      RETURNING id, payment_status`,
      [kycId, razorpay_payment_id, razorpay_signature, paymentDetails?.method || null, isPaid ? "paid" : paymentStatus, paymentDetails ? JSON.stringify(paymentDetails) : null, isPaid, razorpay_order_id, sourceCheck.verified, sourceCheck.note],
    );

    if (result.rows.length === 0) {
      return response.status(404).json({ success: false, message: "No matching payment order found for this application" });
    }

    // Payment done → generate & stamp the client code (idempotent, never throws).
    let clientCode = null;
    if (isPaid) {
      clientCode = await ensureClientCode(kycId);
      console.log(`[Payment] client code for kyc ${kycId}:`, clientCode);
    }

    return response.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: { kyc_id: kycId, payment_status: result.rows[0].payment_status, client_code: clientCode },
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error.message);
    return response.status(500).json({ success: false, message: "Failed to verify payment", error: error.message });
  }
};

/* =====================================================================
   3) WEBHOOK (server-to-server, source of truth for async status)
   POST /api/payment/razorpay-webhook
   Needs the raw request body — app.js captures it as req.rawBody for this path.
   ===================================================================== */
export const razorpayWebhook = async (request, response) => {
  try {
    const signature = request.get("x-razorpay-signature");
    const rawBody = request.rawBody || JSON.stringify(request.body || {});

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("Razorpay webhook signature mismatch");
      return response.status(400).send("invalid signature");
    }

    const event = request.body?.event;
    const entity = request.body?.payload?.payment?.entity || request.body?.payload?.order?.entity || {};

    const orderId = entity.order_id || entity.id;
    if (!orderId) return response.status(200).send("ignored");

    let status = null;
    let stageBump = false;

    if (event === "payment.captured" || event === "order.paid") {
      status = "paid";
      stageBump = true;
    } else if (event === "payment.authorized") {
      status = "authorized";
    } else if (event === "payment.failed") {
      status = "failed";
    }

    let sourceCheck = { verified: null, note: null, blocked: false };
    if (status === "paid" || status === "authorized") {
      const { rows } = await pool.query(
        `SELECT bank_ifsc_code, bank_account_number FROM kyc_master_details WHERE payment_order_id = $1`,
        [orderId],
      );
      if (rows[0]) {
        sourceCheck = validatePaymentSource({ payment: entity, verifiedIfsc: rows[0].bank_ifsc_code, verifiedAccountNumber: rows[0].bank_account_number });
        if (sourceCheck.blocked) {
          console.warn(`[Payment webhook] TPV BLOCKED order ${orderId}: ${sourceCheck.note}`);
          status = "source_blocked";
          stageBump = false;
        }
      }
    }

    if (status) {
      const updated = await pool.query(
        `UPDATE kyc_master_details SET
          payment_status = $2, payment_id = COALESCE($3, payment_id), payment_method = COALESCE($4, payment_method),
          payment_error_code = $5, payment_error_description = $6,
          payment_completed_at = CASE WHEN $7 THEN NOW() ELSE payment_completed_at END,
          payment_response = $8, payment_source_verified = COALESCE($10, payment_source_verified),
          payment_source_note = COALESCE($11, payment_source_note),
          current_stage = CASE WHEN $9 AND current_stage = 'payment' THEN 'ipv' ELSE current_stage END,
          updated_at = NOW()
        WHERE payment_order_id = $1
        RETURNING id`,
        [orderId, status, entity.id || null, entity.method || null, entity.error_code || null, entity.error_description || null, status === "paid", JSON.stringify(request.body), stageBump, sourceCheck.blocked ? false : sourceCheck.verified, sourceCheck.note],
      );

      // Payment captured via webhook → make sure the client code is generated.
      if (status === "paid" && updated.rows[0]) {
        const clientCode = await ensureClientCode(updated.rows[0].id);
        console.log(`[Payment webhook] client code for kyc ${updated.rows[0].id}:`, clientCode);
      }
    }

    return response.status(200).send("ok");
  } catch (error) {
    console.error("RAZORPAY WEBHOOK ERROR:", error.message);
    return response.status(500).send("error");
  }
};

/* =====================================================================
   4) CLIENT CODE (explicit ensure — resilience fallback)
   POST /api/payment/client-code   body: { kyc_id }
   Only generates once payment_status = 'paid'. Idempotent.
   ===================================================================== */
export const generateClientCodeAfterPayment = async (request, response) => {
  try {
    const kycId = await resolveKycId(request.body.kyc_id || request.body.application_id || request.body.unique_id);
    if (!kycId) {
      return response.status(400).json({ success: false, message: "A valid kyc_id is required" });
    }

    const { rows } = await pool.query(
      `SELECT payment_status, client_code FROM kyc_master_details WHERE id = $1`,
      [kycId],
    );
    if (rows.length === 0) {
      return response.status(404).json({ success: false, message: "Application not found" });
    }

    if (rows[0].client_code) {
      return response.status(200).json({ success: true, clientCode: rows[0].client_code });
    }

    if (String(rows[0].payment_status || "").toLowerCase() !== "paid") {
      return response.status(409).json({
        success: false,
        code: "PAYMENT_NOT_COMPLETED",
        message: "The client code is generated only after the payment is completed.",
      });
    }

    const clientCode = await ensureClientCode(kycId);
    if (!clientCode) {
      return response.status(500).json({ success: false, message: "Failed to generate client code." });
    }

    return response.status(200).json({ success: true, clientCode });
  } catch (error) {
    console.error("ENSURE CLIENT CODE ERROR:", error.message);
    return response.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

/* =====================================================================
   5) STATUS (polling fallback for the frontend)
   GET /api/payment/status/:kyc_id
   ===================================================================== */
export const getPaymentStatus = async (request, response) => {
  try {
    const kycId = await resolveKycId(request.params.kyc_id);
    if (!kycId) return response.status(400).json({ success: false, message: "A valid kyc_id is required" });

    const result = await pool.query(
      `SELECT payment_order_id, payment_id, payment_status, payment_amount, payment_currency, payment_method, payment_completed_at
       FROM kyc_master_details WHERE id = $1`,
      [kycId],
    );

    return response.status(200).json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error("GET PAYMENT STATUS ERROR:", error.message);
    return response.status(500).json({ success: false, message: "Failed to fetch payment status" });
  }
};
