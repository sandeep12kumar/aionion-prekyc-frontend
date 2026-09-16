/**
 * Payload handed over from Phase 1 (Relationship Manager captures basic details
 * and the client picks a scheme). In production this is fetched by the client's
 * secure Phase 2 link. Mobile / email / scheme / bank are read-only here.
 */
export const PHASE1 = {
  applicationId: 'AIO-2026-004821',
  applicant: {
    name: 'Ashwin Kumar',
    pan: 'ABCDE1234F',
  },
  mobile: '+91 98765 43210',
  email: 'ashwin123@gmail.com',
  schemeId: 1, // chosen with the RM in Phase 1
  placeOfSupply: 'Tamil Nadu', // drives GST split
  bank: {
    name: 'HDFC Bank',
    holder: 'ASHWIN KUMAR',
    accountLast4: '4821',
    ifsc: 'HDFC0001234',
    type: 'Savings',
  },
  rm: { name: 'Karthik R', code: 'RM-0421' },
}

export const SCHEMES = {
  1: {
    id: 1,
    label: 'Scheme 1',
    opening: 2499,
    amc: 0,
    amcText: 'No AMC — lifetime',
    highlight: 'One-time fee, zero annual maintenance',
  },
  2: {
    id: 2,
    label: 'Scheme 2',
    opening: 1249,
    amc: 499,
    amcText: '₹499 + GST / year, from the 2nd year onwards',
    highlight: 'Lower joining fee',
  },
}

const TN_ALIASES = ['tamil nadu', 'tamilnadu', 'tn']

export function isTamilNadu(state) {
  return TN_ALIASES.includes(String(state ?? '').trim().toLowerCase())
}

const round2 = (n) => Math.round(n * 100) / 100

export function money(n) {
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * GST @ 18%. Within Tamil Nadu → CGST 9% + SGST 9% (intra-state).
 * Outside Tamil Nadu → IGST 18% (inter-state).
 */
export function gstBreakdown(base, state) {
  if (isTamilNadu(state)) {
    const half = round2(base * 0.09)
    return {
      mode: 'intra',
      cgst: half,
      sgst: half,
      igst: 0,
      gstTotal: round2(half * 2),
      total: round2(base + half * 2),
    }
  }
  const igst = round2(base * 0.18)
  return {
    mode: 'inter',
    cgst: 0,
    sgst: 0,
    igst,
    gstTotal: igst,
    total: round2(base + igst),
  }
}
