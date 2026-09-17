/**
 * invoiceService.js — Account-opening invoice, appended as one extra page to
 * every generated KYC application PDF (see kycApplicationPdfService.js, which
 * calls buildInvoicePageForApplication() and appends the result after the
 * DDPI stamp-paper page, for every client regardless of whether DDPI was
 * selected).
 *
 * Filled onto the real template at server/templates/INVOICE_TEMPLATE.pdf —
 * company header, GSTIN, company PAN, "Description Of Service", and the
 * CGST 9% / SGST 9% / IGST 18% rate labels are static artwork already
 * printed on it. Only 13 fields need filling.
 *
 * FIELD MAP
 *   Client Name ............ kyc_master_details.itr_name
 *   Client Code ............ kyc_master_details.client_code
 *   Mobile Number .......... kyc_master_details.mobile_number
 *   PAN No ................. kyc_master_details.pan_number
 *   Address ............... address_1 | digilocker_address (+ city/state/pincode)
 *   Description ........... scheme-based line-item text (see SCHEME_DESCRIPTIONS)
 *   Scheme Amount ......... by kyc_master_details.selected_scheme:
 *                            "lifeTime"    -> Rs. 2499
 *                            "annualCare"  -> Rs. 1249
 *   Invoice No ............ kyc_master_details.invoice_number — assigned once per
 *                          application from public.kyc_master_invoice_seq,
 *                          formatted ACM000001, ACM000002, ...
 *   Invoice Date .......... generation date (today)
 *   cgst/sgst/igst Amount . 18% total on Scheme Amount. Tamil Nadu -> CGST 9% +
 *                          SGST 9% ; any other state -> IGST 18%.
 *   Total Amount .......... Scheme Amount + applicable GST
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pool } from "../config/database.js";
import { resolveLocationFromPincode } from "./districtResolverService.js";

const HERE = import.meta.dirname;
const INVOICE_TEMPLATE_PATH = path.join(HERE, "..", "templates", "INVOICE_TEMPLATE.pdf");

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const firstNonEmpty = (...values) => values.map(str).find(Boolean) || "";

const formatDate = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return str(value);
  // node-postgres builds DATE/TIMESTAMP columns using the server's local
  // timezone, so UTC getters can shift the date back a day (e.g. in IST).
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};

const formatAmount = (n) => n.toFixed(2);

/**
 * DigiLocker's address_1 is already a full combined string (street + city +
 * state + pincode all in one) — appending city/state/pincode again would
 * duplicate them. Skip any part already present in the base address.
 */
const buildAddressLine = (row, state) => {
  const base = firstNonEmpty(row.address_1, row.digilocker_address);
  const baseLower = base.toLowerCase();
  const extras = [row.city || row.digilocker_city, state, row.pincode || row.digilocker_pincode]
    .map(str)
    .filter((v) => v && !baseLower.includes(v.toLowerCase()));
  return [base, ...extras].filter(Boolean).join(", ");
};

const ACCOUNT_OPENING_CHARGES = {
  lifeTime: 2499,
  annualCare: 1249,
};
const DEFAULT_ACCOUNT_OPENING_CHARGE = ACCOUNT_OPENING_CHARGES.lifeTime;

const GST_RATE = 0.18;
const CGST_RATE = 0.09;
const SGST_RATE = 0.09;

const TAMIL_NADU_ALIASES = new Set(["tamil nadu", "tamilnadu", "tn"]);
const isTamilNadu = (state) => TAMIL_NADU_ALIASES.has(str(state).toLowerCase());

/** Account opening charge (before GST) for this client's chosen scheme. */
const resolveAccountOpeningCharge = (row) =>
  ACCOUNT_OPENING_CHARGES[row.selected_scheme] ?? DEFAULT_ACCOUNT_OPENING_CHARGE;

const SCHEME_DESCRIPTIONS = {
  lifeTime: "Trading Account Opening Charges - Scheme 1 (Lifetime, No AMC)",
  annualCare: "Trading Account Opening Charges - Scheme 2 (Annual Care)",
};
const resolveSchemeDescription = (row) =>
  SCHEME_DESCRIPTIONS[row.selected_scheme] || "Trading Account Opening Charges";

/**
 * State resolution mirroring the main PDF: state column, else DigiLocker's
 * state, else a pincode lookup.
 */
const resolveInvoiceState = async (row) => {
  const direct = firstNonEmpty(row.state, row.digilocker_state);
  if (direct) return direct;

  const pincode = firstNonEmpty(row.pincode, row.digilocker_pincode);
  if (!pincode) return "";

  const resolved = await resolveLocationFromPincode(pincode);
  return resolved.state || "";
};

/**
 * Assign this application's invoice number once (ACM000001, ACM000002, ...)
 * and return it. Idempotent — if the column is already set, that stored value
 * is returned unchanged; the sequence is only consumed the first time.
 */
export const resolveInvoiceNumber = async (kycId) => {
  const existing = await pool.query(
    `SELECT invoice_number FROM public.kyc_master_details WHERE id = $1`,
    [kycId],
  );
  if (existing.rows[0]?.invoice_number) {
    return existing.rows[0].invoice_number;
  }

  const generated = await pool.query(
    `SELECT 'ACM' || LPAD(nextval('public.kyc_master_invoice_seq')::text, 6, '0') AS invoice_number`,
  );
  const candidate = generated.rows[0].invoice_number;

  // Only wins the race if nobody else has set it since the SELECT above.
  await pool.query(
    `UPDATE public.kyc_master_details
        SET invoice_number = $2, updated_at = NOW()
      WHERE id = $1 AND invoice_number IS NULL`,
    [kycId, candidate],
  );

  const final = await pool.query(
    `SELECT invoice_number FROM public.kyc_master_details WHERE id = $1`,
    [kycId],
  );
  return final.rows[0].invoice_number;
};

// Greedy word-wrap simulation — estimate how many lines `text` takes at
// `fontSize` inside `maxWidth`, to decide whether a multiline field shrinks.
const estimateWrappedLineCount = (measureFont, text, fontSize, maxWidth) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const spaceWidth = measureFont.widthOfTextAtSize(" ", fontSize);
  let lines = 1;
  let lineWidth = 0;
  words.forEach((word) => {
    const wordWidth = measureFont.widthOfTextAtSize(word, fontSize);
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > maxWidth) {
      lines += 1;
      lineWidth = wordWidth;
    } else {
      lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth;
    }
  });
  return lines;
};

/**
 * Fill one AcroForm text field, shrinking the font if the value overflows.
 * "Address" is flagged single-line in the template despite a 112pt-tall box —
 * forceMultiline enables real wrapping for it.
 */
const setText = (form, measureFont, fieldName, value, { forceMultiline = false } = {}) => {
  const text = str(value);
  if (!text) return;
  try {
    const field = form.getTextField(fieldName);
    if (forceMultiline && !field.isMultiline()) {
      field.enableMultiline();
    }
    let fontSize = 10;
    try {
      const rect = field.acroField.getWidgets()[0]?.getRectangle();
      if (rect) {
        const maxWidth = rect.width - 4;
        if (field.isMultiline()) {
          const maxHeight = rect.height - 4;
          let lines = estimateWrappedLineCount(measureFont, text, fontSize, maxWidth);
          while (lines * fontSize * 1.15 > maxHeight && fontSize > 6) {
            fontSize -= 0.5;
            lines = estimateWrappedLineCount(measureFont, text, fontSize, maxWidth);
          }
        } else {
          const textWidth = measureFont.widthOfTextAtSize(text, fontSize);
          if (textWidth > maxWidth) {
            fontSize = Math.max(6, fontSize * (maxWidth / textWidth));
          }
        }
      }
    } catch {
      /* couldn't measure — fall back to the default size */
    }
    try {
      field.setFontSize(fontSize);
    } catch {
      /* no default appearance to resize */
    }
    field.setText(text);
  } catch (err) {
    console.warn(`[Invoice] field "${fieldName}" not set:`, err.message);
  }
};

/**
 * Fill server/templates/INVOICE_TEMPLATE.pdf with this application's invoice
 * data and return the flattened, single-page PDF bytes.
 */
export const buildInvoicePage = async ({ row, invoiceNumber }) => {
  const templateBytes = fs.readFileSync(INVOICE_TEMPLATE_PATH);
  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();
  const measureFont = await doc.embedFont(StandardFonts.Helvetica);

  const amount = row.__accountOpeningCharge;
  const gstSplit = row.__gstSplit; // { type: "CGST_SGST" | "IGST", cgst, sgst, igst }
  const total = amount + (gstSplit.type === "CGST_SGST" ? gstSplit.cgst + gstSplit.sgst : gstSplit.igst);

  const values = {
    "Client Name": row.itr_name,
    "Client Code": row.client_code,
    "Mobile Number": row.mobile_number,
    "PAN No": str(row.pan_number).toUpperCase(),
    Address: buildAddressLine(row, row.state_display),
    "Invoice No": invoiceNumber,
    "Invoice Date": formatDate(new Date()),
    Description: resolveSchemeDescription(row),
    "Scheme Amount": formatAmount(amount),
    "cgst Amount": gstSplit.type === "CGST_SGST" ? formatAmount(gstSplit.cgst) : "-",
    "sgst Amount": gstSplit.type === "CGST_SGST" ? formatAmount(gstSplit.sgst) : "-",
    "igst Amount": gstSplit.type === "IGST" ? formatAmount(gstSplit.igst) : "-",
    "Total Amount": formatAmount(total),
  };

  Object.entries(values).forEach(([fieldName, value]) =>
    setText(form, measureFont, fieldName, value, { forceMultiline: fieldName === "Address" }),
  );

  form.flatten();
  return Buffer.from(await doc.save());
};

/**
 * Resolve the tax split (CGST+SGST for Tamil Nadu, else IGST) and the account
 * opening charge for this row, and build the invoice page bytes. Single entry
 * point kycApplicationPdfService.js calls.
 */
export const buildInvoicePageForApplication = async (row) => {
  const invoiceNumber = await resolveInvoiceNumber(row.id);
  const amount = resolveAccountOpeningCharge(row);
  const state = await resolveInvoiceState(row);

  const gstSplit = isTamilNadu(state)
    ? { type: "CGST_SGST", cgst: amount * CGST_RATE, sgst: amount * SGST_RATE }
    : { type: "IGST", igst: amount * GST_RATE };

  const enrichedRow = { ...row, state_display: state, __accountOpeningCharge: amount, __gstSplit: gstSplit };

  return buildInvoicePage({ row: enrichedRow, invoiceNumber });
};

export { resolveAccountOpeningCharge, resolveInvoiceState, isTamilNadu };
