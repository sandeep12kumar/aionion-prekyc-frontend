/**
 * Third-Party Validation (TPV): the first payment into a demat account must
 * come from the client's own verified bank account. Razorpay enforces this
 * itself when an order is created with `bank_account` bound to it (see
 * razorpayService.createOrder) — a mismatched account simply can't complete
 * checkout. This is the belt-and-braces check on our side for the case TPV
 * wasn't enforced at order time (`tpv: false`, e.g. the bank isn't on the
 * merchant's TPV allow-list and the order fell back to a plain one).
 *
 * Razorpay's fetched payment object doesn't expose the full account number
 * for netbanking/UPI, so exact matching isn't possible after the fact —
 * this does the best comparison available and otherwise tolerates the
 * payment rather than blocking a legitimate one on a false negative.
 */
export function validatePaymentSource({ payment, verifiedIfsc, verifiedAccountNumber }) {
  if (!payment) {
    return { verified: false, blocked: false, note: "Payment details unavailable — source not checked." };
  }

  const method = payment.method || "";

  if (method === "netbanking" && payment.bank && verifiedIfsc) {
    const paymentBank = String(payment.bank).toUpperCase();
    const verifiedBank = String(verifiedIfsc).slice(0, 4).toUpperCase();
    if (paymentBank !== verifiedBank) {
      return {
        verified: false,
        blocked: true,
        note: `Payment came from bank code ${paymentBank}, which does not match the verified account's bank (${verifiedBank}).`,
      };
    }
    return { verified: true, blocked: false, note: "Netbanking bank code matches the verified account's IFSC prefix." };
  }

  if (method === "upi" || method === "card" || method === "wallet") {
    return {
      verified: false,
      blocked: false,
      note: `Payment method ${method} does not expose the payer's bank account for a direct match — tolerated, not independently verified.`,
    };
  }

  return { verified: false, blocked: false, note: `Payment method ${method || "unknown"} — source not independently verified.` };
}
