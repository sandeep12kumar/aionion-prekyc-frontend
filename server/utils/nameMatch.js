/**
 * Fuzzy person-name matching, shared by:
 *   - the eSign step: the name on the Aadhaar used to sign must reasonably
 *     match the account holder's KYC name (ITR / DigiLocker / KRA).
 *   - the bank step: the penny-drop account holder name must reasonably
 *     match the applicant's ITR name (the first payment must come from the
 *     client's own bank account).
 * It is deliberately lenient — an Aadhaar/bank name reads "Sandeep Kumar"
 * while the ITR name is "Muthukumar Sandeep Kumar", and that must still
 * pass — so the score is "what fraction of the shorter name's tokens appear
 * in the longer name", and the default accept threshold is 0.6.
 */

const HONORIFICS = new Set([
  "MR", "MRS", "MS", "DR", "SHRI", "SMT", "KUM", "KUMARI", "Sri", "M/S",
  "SO", "DO", "WO", "CO", // S/O D/O W/O C/O after punctuation strip
]);

export function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token && !HONORIFICS.has(token))
    .join(" ");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = temp;
    }
  }
  return row[n];
}

/** Similarity of two single name tokens: 1 exact, ~ratio for near-spellings,
 *  0.6 when one is an initial of the other, else 0. */
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.6 : 0;
  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.8 ? ratio : 0;
}

/**
 * @returns {number} 0..1 — fraction of the shorter name covered by the longer.
 */
export function nameMatchScore(nameA, nameB) {
  const ta = normalizeName(nameA).split(" ").filter(Boolean);
  const tb = normalizeName(nameB).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;

  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const usedBig = new Set();
  let sum = 0;

  for (const token of small) {
    let best = 0;
    let bestIndex = -1;
    big.forEach((other, index) => {
      if (usedBig.has(index)) return;
      const score = tokenSimilarity(token, other);
      if (score > best) {
        best = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && best > 0) usedBig.add(bestIndex);
    sum += best;
  }

  return sum / small.length;
}

/**
 * Best score of `aadhaarName` against a list of KYC names.
 * @returns {{ name: string|null, score: number }}
 */
export function bestNameMatch(aadhaarName, candidates = []) {
  let best = { name: null, score: 0 };
  for (const candidate of candidates) {
    if (!candidate) continue;
    const score = nameMatchScore(aadhaarName, candidate);
    if (score > best.score) best = { name: candidate, score };
  }
  return best;
}

export const DEFAULT_NAME_MATCH_THRESHOLD = 0.6;
