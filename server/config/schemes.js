// Single source of truth for account-opening scheme pricing. Keys match the
// `selected_scheme` value the RM picks in Step 6 of the RM KYC flow
// (frontend/src/kyc/steps/Step6Scheme.jsx) and are looked up again here when
// the client pays in demat-kyc-flow — so the amount charged always comes
// from the server, never from a client-supplied number.
export const SCHEMES = {
  lifeTime: {
    id: "lifeTime",
    label: "Life Time Advantage",
    opening: 2499,
    amc: 0,
    amcText: "No AMC — lifetime",
    highlight: "One-time fee, zero annual maintenance",
  },
  annualCare: {
    id: "annualCare",
    label: "Annual Care",
    opening: 1249,
    amc: 499,
    amcText: "₹499 + GST / year, from the 2nd year onwards",
    highlight: "Lower joining fee",
  },
};

/**
 * TEMPORARY live-mode smoke-test override: set PAYMENT_TEST_AMOUNT_OVERRIDE
 * (server/.env, a rupee amount e.g. "1") to charge that flat amount instead
 * of the real scheme price everywhere a payment amount is computed — both
 * the actual Razorpay order and what the client sees on the payment page,
 * so the two always stay consistent. Unset it (or remove it) to go back to
 * real scheme pricing; nothing else needs to change.
 */
export function getSchemeOpeningAmount(schemeKey) {
  const scheme = SCHEMES[schemeKey];
  if (!scheme) return null;
  const override = Number(process.env.PAYMENT_TEST_AMOUNT_OVERRIDE);
  return Number.isFinite(override) && override > 0 ? override : scheme.opening;
}

const TN_ALIASES = new Set(["tamil nadu", "tamilnadu", "tn"]);

export function isTamilNadu(state) {
  return TN_ALIASES.has(String(state || "").trim().toLowerCase());
}

const round2 = (n) => Math.round(n * 100) / 100;

/** GST @ 18% on the scheme's opening charge — CGST+SGST within Tamil Nadu, else IGST. */
export function gstBreakdown(openingAmount, state) {
  if (isTamilNadu(state)) {
    const half = round2(openingAmount * 0.09);
    return { mode: "intra", cgst: half, sgst: half, igst: 0, total: round2(openingAmount + half * 2) };
  }
  const igst = round2(openingAmount * 0.18);
  return { mode: "inter", cgst: 0, sgst: 0, igst, total: round2(openingAmount + igst) };
}
