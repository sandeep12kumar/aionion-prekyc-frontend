/**
 * Flexi eSign signature rectangles for the Setu Aadhaar eSign "config" call.
 *
 * The client wants the Aadhaar signature affixed on EVERY page of the
 * account-opening PDF. Most pages get a small bottom-right stamp; several
 * pages carry a specific pre-printed signature cell/marker, so those get a
 * per-page override that lands the stamp inside that exact cell instead.
 * A page can have more than one override (e.g. two separate signature spots
 * on the same page) — PAGE_OVERRIDES then holds an array for that index.
 *
 * IMPORTANT: Setu's `pages` array is 0-INDEXED (docs example: `"pages": [0, 1]`
 * signs the first two pages). A 44-page document uses indices 0..43.
 *
 * Coordinates are PDF points from the bottom-left of the page, read off
 * UPDATED-CLIENT FORM.pdf's own text layout (pdfjs-dist text-position dump)
 * so each stamp lands inside the labelled box/cell it's named after, not
 * just visually nearby.
 */

const MARGIN = 24;
const MIN_PAGE_W = 594; // a couple of template pages are a hair under A4

/**
 * Per-page signature-rectangle overrides, keyed by 0-indexed page number.
 * Each entry is either one {lowerLeftX, lowerLeftY, upperRightX, upperRightY}
 * rectangle, or an array of them for a page that needs more than one stamp.
 *
 *   - page  1 (index  0): "Digital e-sign stamp" AcroForm field box, the
 *     template's own designated applicant e-sign box on the first page.
 *   - page  2 (index  1): "4. Applicant Declaration" table — the
 *     "Applicant e-SIGN" column (immediately left of "Applicant Wet
 *     Signature", which is the separate "Client Signature_af_image" field).
 *   - page 10 (index  9): bottom signature row, "SOLE/FIRST HOLDER" column
 *     (marker 3/38).
 *   - page 11 (index 10): "C. TRADING PREFERENCES" — the "All Segments" box
 *     (marker 4/38).
 *   - page 13 (index 12): DIS-booklet "SOLE/FIRST HOLDER" signature cell
 *     (marker 10/38).
 *   - page 14 (index 13): two stamps —
 *       (a) "AUTHORISATION TO DEBIT TRADING ACCOUNT..." section, next to the
 *           hand-sign marker (12/38);
 *       (b) the DECLARATION section's signature row, "SOLE/FIRST HOLDER"
 *           (first) column (marker 13/38).
 */
const PAGE_OVERRIDES = {
  0: { lowerLeftX: 390, lowerLeftY: 36, upperRightX: 520, upperRightY: 81 },
  1: { lowerLeftX: 289, lowerLeftY: 310, upperRightX: 409, upperRightY: 355 },
  9: { lowerLeftX: 65, lowerLeftY: 40, upperRightX: 195, upperRightY: 66 },
  10: { lowerLeftX: 60, lowerLeftY: 320, upperRightX: 158, upperRightY: 345 },
  12: { lowerLeftX: 170, lowerLeftY: 478, upperRightX: 290, upperRightY: 512 },
  13: [
    { lowerLeftX: 115, lowerLeftY: 563, upperRightX: 245, upperRightY: 592 },
    { lowerLeftX: 65, lowerLeftY: 42, upperRightX: 195, upperRightY: 72 },
  ],
};

export function getFlexiEsignPositions(pageCount, opts = {}) {
  const rawWidth = Number(opts.width || process.env.SETU_ESIGN_SIGNATURE_WIDTH || 130);
  const rawHeight = Number(opts.height || process.env.SETU_ESIGN_SIGNATURE_HEIGHT || 40);

  const width = Math.min(Math.max(rawWidth, 90), MIN_PAGE_W - 2 * MARGIN);
  const height = Math.min(Math.max(rawHeight, 26), 100);

  const lowerLeftX = Math.round(MIN_PAGE_W - MARGIN - width);
  const lowerLeftY = MARGIN;
  const defaultCoordinate = {
    lowerLeftX,
    lowerLeftY,
    upperRightX: Math.round(lowerLeftX + width),
    upperRightY: lowerLeftY + height,
  };

  const total = Math.max(1, Number(pageCount) || 1);
  const defaultPages = [];
  const overrideRects = [];
  for (let index = 0; index < total; index += 1) {
    const override = PAGE_OVERRIDES[index];
    if (override) {
      const rects = Array.isArray(override) ? override : [override];
      for (const rect of rects) {
        overrideRects.push({ coordinate: { ...rect }, pages: [index] });
      }
    } else {
      defaultPages.push(index);
    }
  }

  const rectangles = [];
  if (defaultPages.length) rectangles.push({ coordinate: defaultCoordinate, pages: defaultPages });
  rectangles.push(...overrideRects);
  return rectangles;
}
