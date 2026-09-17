import crypto from "node:crypto";
import axios from "axios";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/**
 * Resolve the active Razorpay credentials.
 * RAZORPAY_ENV = "live" uses the LIVE key pair, anything else (default) uses test.
 */
export const getRazorpayConfig = () => {
  const mode =
    String(process.env.RAZORPAY_ENV || "test").trim().toLowerCase() === "live"
      ? "live"
      : "test";

  const keyId = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_ID : process.env.RAZORPAY_TEST_KEY_ID;
  const keySecret = mode === "live" ? process.env.RAZORPAY_LIVE_KEY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET;
  const webhookSecret = mode === "live" ? process.env.RAZORPAY_LIVE_WEBHOOK_SECRET : process.env.RAZORPAY_TEST_WEBHOOK_SECRET;

  if (!keyId || !keySecret) {
    const error = new Error(
      `Razorpay ${mode} credentials are not configured. Set RAZORPAY_${mode.toUpperCase()}_KEY_ID / RAZORPAY_${mode.toUpperCase()}_KEY_SECRET in server/.env.`,
    );
    error.code = "RAZORPAY_CONFIG_MISSING";
    throw error;
  }

  return { mode, keyId, keySecret, webhookSecret };
};

const authHeader = ({ keyId, keySecret }) => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

/**
 * Create a Razorpay order.
 * @param {number} amount   amount in the major unit (rupees) — converted to paise here.
 * @param {object} [bankAccount]  when supplied AND RAZORPAY_TPV_ENABLED !== "false", the
 *        order is created in Third-Party Validation mode — Razorpay checkout then only
 *        accepts a payment from this exact account: { account_number, ifsc, name }
 */
export const createOrder = async ({ amount, currency = "INR", receipt, notes = {}, bankAccount = null }) => {
  const config = getRazorpayConfig();

  const amountInPaise = Math.round(Number(amount) * 100);
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw new Error("Invalid payment amount");
  }

  const baseBody = { amount: amountInPaise, currency, receipt, notes, payment_capture: 1 };

  const tpvEnabled = String(process.env.RAZORPAY_TPV_ENABLED || "true").toLowerCase() !== "false";

  const tpvAccount =
    tpvEnabled && bankAccount && bankAccount.account_number && bankAccount.ifsc
      ? {
          account_number: String(bankAccount.account_number).trim(),
          ifsc: String(bankAccount.ifsc).trim().toUpperCase(),
          name: String(bankAccount.name || "").trim() || undefined,
        }
      : null;

  const post = (body) =>
    axios.post(`${RAZORPAY_API_BASE}/orders`, body, {
      headers: { "Content-Type": "application/json", Authorization: authHeader(config) },
      timeout: 20000,
    });

  // Try a TPV order (bound to the verified bank account) first.
  // NOTE: do NOT force `method: "netbanking"` — that requires each bank to be
  // individually enabled for netbanking-TPV on the merchant account. Passing
  // only `bank_account` lets Razorpay validate the payer's account across
  // every method (UPI / netbanking / IMPS) and works for every bank.
  if (tpvAccount) {
    try {
      const response = await post({ ...baseBody, bank_account: tpvAccount });
      return { order: response.data, config, tpv: true };
    } catch (err) {
      const tpvDesc = err.response?.data?.error?.description || err.message || "";
      console.warn("[Razorpay] TPV order rejected:", tpvDesc);

      // Fall back to a plain order — only succeeds if TPV is OPTIONAL on the merchant account.
      try {
        const response = await post(baseBody);
        return { order: response.data, config, tpv: false, tpvError: tpvDesc };
      } catch (fallbackErr) {
        const fbDesc = fallbackErr.response?.data?.error?.description || "";
        // TPV is MANDATORY here — a plain order can never be created, and the
        // requested bank isn't on the merchant's TPV allow-list.
        const e = new Error(tpvDesc || fbDesc || "Unable to create the payment order for the verified bank account.");
        e.code = "RAZORPAY_TPV_BANK_NOT_ENABLED";
        e.tpvReason = tpvDesc || fbDesc;
        e.bankIfsc = tpvAccount.ifsc;
        e.httpStatus = err.response?.status || 400;
        throw e;
      }
    }
  }

  const response = await post(baseBody);
  return { order: response.data, config, tpv: false };
};

export const fetchPayment = async (paymentId) => {
  const config = getRazorpayConfig();
  const response = await axios.get(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader(config) },
    timeout: 20000,
  });
  return response.data;
};

/** Verify the checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
export const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return false;

  const { keySecret } = getRazorpayConfig();
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
};

/** Verify a Razorpay webhook payload: HMAC_SHA256(rawBody, webhook_secret) === X-Razorpay-Signature */
export const verifyWebhookSignature = (rawBody, signature) => {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret || !signature || !rawBody) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
};
