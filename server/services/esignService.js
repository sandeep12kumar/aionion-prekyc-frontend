/**
 * esignService.js — Setu Aadhaar eSign (production dg.setu.co).
 *
 * Flow:
 *   1. build the filled account-opening PDF (generateKycApplicationPdf)
 *   2. POST /api/documents            — upload the PDF, get documentId
 *   3. POST /api/signature/config     — flexi config: one signature rectangle
 *                                       per page (signature on EVERY page)
 *   4. POST /api/signature            — signature request; returns a hosted
 *                                       signingUrl where the client enters
 *                                       their Aadhaar number + OTP
 *   5. client is redirected to signingUrl, signs, Setu redirects back to
 *      ${CLIENT_APP_BASE_URL}/?appId=<uniqueId>&esign_return=1 — Setu appends
 *      its OWN "id" (=its signature requestId), "success", "signerIdentifier"
 *      and "esp" query params to whatever redirectUrl we hand it, and
 *      OVERWRITES an "id" param of ours if we used that name, so this uses
 *      "appId" instead to survive the round trip intact.
 *   6. GET /api/signature/{id}        — poll until sign_complete
 *   7. GET /api/signature/{id}/download/ — fetch the signed PDF, store it
 *
 * All request URLs are derived from SETU_BASE_URL — the *_URL_TEMPLATE env
 * vars are ignored (one of them ships malformed).
 */
import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import { ensureClientCode } from "./clientCodeService.js";
import { generateKycApplicationPdf } from "./kycApplicationPdfService.js";
import { getFlexiEsignPositions } from "../config/esignPositions.js";
import { S3_FOLDERS, uploadBufferToS3 } from "./s3StorageService.js";

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

const err = (code, message, status) => {
  const e = new Error(message);
  e.code = code;
  if (status) e.status = status;
  return e;
};

/* -------------------------------------------------------------- config */

export function getEsignConfig() {
  const clientId = str(process.env.SETU_CLIENT_ID);
  const clientSecret = str(process.env.SETU_CLIENT_SECRET);
  const productInstanceId = str(process.env.SETU_PRODUCT_INSTANCE_ID);
  const baseUrl = (str(process.env.SETU_BASE_URL) || "https://dg.setu.co").replace(/\/+$/, "");

  if (!clientId || !clientSecret || !productInstanceId) {
    throw err(
      "ESIGN_CONFIG_MISSING",
      "Setu eSign is not configured (SETU_CLIENT_ID / SETU_CLIENT_SECRET / SETU_PRODUCT_INSTANCE_ID).",
      503,
    );
  }

  return {
    clientId,
    clientSecret,
    productInstanceId,
    baseUrl,
    reason: str(process.env.SETU_ESIGN_REASON) || "Account opening — KYC application signing",
    signerNo: Number(process.env.SETU_ESIGN_SIGNER_NO || 1),
    signatureWidth: Number(process.env.SETU_ESIGN_SIGNATURE_WIDTH || 220),
    signatureHeight: Number(process.env.SETU_ESIGN_SIGNATURE_HEIGHT || 70),
    urls: {
      documents: `${baseUrl}/api/documents`,
      signature: `${baseUrl}/api/signature`,
      signatureConfig: `${baseUrl}/api/signature/config`,
      status: (id) => `${baseUrl}/api/signature/${encodeURIComponent(id)}`,
      download: (id) => `${baseUrl}/api/signature/${encodeURIComponent(id)}/download/`,
    },
  };
}

const esignHeaders = (config) => ({
  "x-client-id": config.clientId,
  "x-client-secret": config.clientSecret,
  "x-product-instance-id": config.productInstanceId,
});

/* -------------------------------------------------------------- helpers */

/** 10-digit Indian mobile -> "91XXXXXXXXXX" (Setu signer identifier format). */
const normalizeIndianMobileIdentifier = (mobile) => {
  const digits = str(mobile).replace(/\D/g, "");
  if (digits.length < 10) return "";
  return `91${digits.slice(-10)}`;
};

const birthYearFromDob = (dob) => {
  if (!dob) return "";
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) {
    const m = str(dob).match(/(19|20)\d{2}/);
    return m ? m[0] : "";
  }
  return String(d.getFullYear());
};

// Fallback geo-coordinate when the client's browser won't give one (blocked,
// no GPS, insecure origin). Setu wants the field populated; default to
// Aionion's registered office in Chennai. Override with SETU_ESIGN_DEFAULT_GEO
// ("lat,lng") / SETU_ESIGN_DEFAULT_LOCATION.
const DEFAULT_GEO = str(process.env.SETU_ESIGN_DEFAULT_GEO) || "13.0827,80.2707";
const DEFAULT_LOCATION = str(process.env.SETU_ESIGN_DEFAULT_LOCATION) || "Chennai, Tamil Nadu, India";

/**
 * Best-effort: use the client's location when supplied, else fall back to the
 * configured default so eSign is never blocked by a missing browser fix.
 */
export function normalizeClientEsignLocation(options = {}) {
  const lat = Number(options.latitude ?? options.lat);
  const lng = Number(options.longitude ?? options.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      geoCoordinate: `${lat},${lng}`,
      location: str(options.location) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      fromClient: true,
    };
  }

  const [dLat, dLng] = DEFAULT_GEO.split(",").map((n) => Number(n.trim()));
  return {
    lat: dLat,
    lng: dLng,
    geoCoordinate: DEFAULT_GEO,
    location: DEFAULT_LOCATION,
    fromClient: false,
  };
}

const asJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
};

const resolveId = (payload, ...keys) => {
  for (const key of keys) {
    if (payload && str(payload[key])) return str(payload[key]);
  }
  if (payload?.data) return resolveId(payload.data, ...keys);
  return "";
};

/* -------------------------------------------------------------- Setu calls */

async function uploadDocument({ config, buffer, fileName }) {
  const form = new FormData();
  form.append("document", new Blob([buffer], { type: "application/pdf" }), fileName || "application.pdf");
  form.append("name", fileName || "application.pdf");

  const response = await fetch(config.urls.documents, {
    method: "POST",
    headers: esignHeaders(config),
    body: form,
  });
  const payload = await asJson(response);
  if (!response.ok) {
    throw err("ESIGN_UPLOAD_FAILED", `Setu document upload failed (${response.status}): ${JSON.stringify(payload)}`, 502);
  }
  const documentId = resolveId(payload, "id", "documentId", "docId");
  if (!documentId) throw err("ESIGN_UPLOAD_FAILED", "Setu did not return a document id.", 502);
  return documentId;
}

async function createSignatureConfig({ config, pageCount }) {
  const signRectangles = getFlexiEsignPositions(pageCount, {
    width: config.signatureWidth,
    height: config.signatureHeight,
  });
  const body = { signers: [{ optional: false, signRectangles }] };

  const response = await fetch(config.urls.signatureConfig, {
    method: "POST",
    headers: { ...esignHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await asJson(response);
  if (!response.ok) {
    throw err("ESIGN_CONFIG_FAILED", `Setu signature config failed (${response.status}): ${JSON.stringify(payload)}`, 502);
  }
  const configId = resolveId(payload, "id", "configId");
  if (!configId) throw err("ESIGN_CONFIG_FAILED", "Setu did not return a config id.", 502);
  return configId;
}

function buildSignerPayload({ config, applicant, geo }) {
  const identifier = normalizeIndianMobileIdentifier(applicant.mobile);
  const displayName = str(applicant.name);
  const birthYear = birthYearFromDob(applicant.dob);

  if (!identifier || !displayName) {
    throw err(
      "ESIGN_REQUIRED_FIELDS_MISSING",
      "The applicant's mobile number and name are required to eSign.",
      400,
    );
  }

  const signer = {
    identifier,
    displayName,
    geoCoordinate: geo.geoCoordinate,
    location: geo.location,
    signerNo: config.signerNo,
  };
  if (birthYear) signer.birthYear = birthYear;
  return signer;
}

async function createSignatureRequest({ config, documentId, configId, signer, redirectUrl }) {
  const body = {
    documentId,
    redirectUrl,
    reason: config.reason,
    signers: [signer],
    configId,
  };

  const response = await fetch(config.urls.signature, {
    method: "POST",
    headers: { ...esignHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await asJson(response);
  if (!response.ok) {
    throw err("ESIGN_REQUEST_FAILED", `Setu signature request failed (${response.status}): ${JSON.stringify(payload)}`, 502);
  }

  const requestId = resolveId(payload, "id", "requestId", "signatureId");
  const signingUrl =
    str(payload?.signers?.[0]?.url) ||
    str(payload?.data?.signers?.[0]?.url) ||
    str(payload?.signingUrl) ||
    str(payload?.url) ||
    str(payload?.data?.url);

  if (!requestId || !signingUrl) {
    throw err("ESIGN_REQUEST_FAILED", `Setu response missing request id / signing url: ${JSON.stringify(payload)}`, 502);
  }
  return { requestId, signingUrl, raw: payload };
}

const COMPLETED = new Set(["completed", "signed", "success", "approved", "done", "sign_complete", "esigned"]);
const FAILED = new Set(["failed", "declined", "rejected", "expired", "cancelled", "canceled", "error"]);

export function normalizeEsignStatus(raw) {
  const value = str(raw).toLowerCase();
  if (COMPLETED.has(value)) return "completed";
  if (FAILED.has(value)) return "failed";
  return "pending";
}

/**
 * Pull the signer's real name out of a completed Setu status payload. After
 * Aadhaar auth, Setu populates signers[].signatureDetails with data lifted
 * from the eSign certificate — per Setu's own docs (docs.setu.co/data/esign/
 * notifications) the signers array actually sits at `data.esign.signers`,
 * not `data.signers`; probe every nesting Setu is known to use so the name
 * check never silently no-ops because of a missed wrapper level.
 */
export function extractAadhaarNameFromSetu(providerPayload) {
  const signer =
    providerPayload?.signers?.[0] ||
    providerPayload?.data?.signers?.[0] ||
    providerPayload?.esign?.signers?.[0] ||
    providerPayload?.data?.esign?.signers?.[0] ||
    {};
  const sd = signer.signatureDetails || signer.signature_details || {};

  // Names that come straight from the eSign certificate. Setu's completed
  // payload puts it at signers[0].signatureDetails.aadhaarName.
  const fromCert =
    str(sd.aadhaarName) ||
    str(sd.name) ||
    str(sd.signerName) ||
    str(sd.signedName) ||
    str(sd.commonName) ||
    str(sd.cn) ||
    str(sd.subjectName) ||
    str(sd.certificateName) ||
    str(signer.aadhaarName) ||
    str(signer.signerName) ||
    str(signer.certificateName);
  if (fromCert) return fromCert;

  // Last resort: a top-level signer.name — but only trust it if it differs
  // from the displayName WE supplied (otherwise it's just our echoed input,
  // not proof of who actually authenticated with Aadhaar).
  const generic = str(signer.name);
  const supplied = str(signer.displayName);
  if (generic && generic.toUpperCase() !== supplied.toUpperCase()) return generic;

  return "";
}

export async function fetchEsignStatus(requestId, config = getEsignConfig()) {
  const response = await fetch(config.urls.status(requestId), { headers: esignHeaders(config) });
  const payload = await asJson(response);
  if (!response.ok) {
    throw err("ESIGN_STATUS_FAILED", `Setu status check failed (${response.status}): ${JSON.stringify(payload)}`, 502);
  }
  const rawStatus =
    str(payload?.status) || str(payload?.data?.status) || str(payload?.signers?.[0]?.status);
  const providerMessage =
    str(payload?.error?.detail) ||
    str(payload?.error?.message) ||
    str(payload?.errorMessage) ||
    str(payload?.message) ||
    str(payload?.signers?.[0]?.errorMessage) ||
    str(payload?.signers?.[0]?.reason) ||
    "";
  return {
    rawStatus,
    providerMessage,
    normalizedStatus: normalizeEsignStatus(rawStatus),
    providerPayload: payload,
  };
}

export async function downloadSignedEsignDocument({ requestId, kycId, pan, config = getEsignConfig() }) {
  const response = await fetch(config.urls.download(requestId), { headers: esignHeaders(config) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw err("ESIGN_DOWNLOAD_FAILED", `Setu download failed (${response.status}): ${detail}`, 502);
  }

  const contentType = str(response.headers.get("content-type")).toLowerCase();
  let pdfBytes;

  if (contentType.includes("application/json")) {
    const payload = await asJson(response);
    const downloadUrl =
      str(payload?.downloadUrl) || str(payload?.url) || str(payload?.data?.downloadUrl) || str(payload?.data?.url);
    if (!downloadUrl) throw err("ESIGN_DOWNLOAD_FAILED", "Setu did not return a downloadUrl.", 502);
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) {
      throw err("ESIGN_DOWNLOAD_FAILED", `Signed PDF fetch failed (${fileResponse.status}).`, 502);
    }
    pdfBytes = Buffer.from(await fileResponse.arrayBuffer());
  } else {
    pdfBytes = Buffer.from(await response.arrayBuffer());
  }

  const safePan = str(pan).toUpperCase().replace(/[^A-Z0-9]/g, "") || `app_${kycId}`;
  const fileName = `${safePan}.pdf`;
  await uploadBufferToS3(S3_FOLDERS.esignedPdf, fileName, pdfBytes, "application/pdf");

  return { publicPath: `/uploads/esign-signed/${fileName}`, fileName };
}

/* -------------------------------------------------------------- orchestration */

const loadRow = async (kycId) => {
  const { rows } = await pool.query(
    `SELECT id, unique_id, itr_name, mobile_number, dob, pan_number, boid,
            esign_request_id, esign_document_id, esign_status, esign_signed_pdf_path
       FROM public.kyc_master_details
      WHERE id = $1`,
    [kycId],
  );
  if (!rows.length) throw err("APPLICATION_NOT_FOUND", "Application not found.", 404);
  return rows[0];
};

// NOT "?id=" — Setu overwrites an "id" query param with its own signature
// requestId when it appends its status params to this URL on redirect, which
// left the client app trying (and failing) to look up a lead by requestId
// instead of by its actual unique_id. "appId" doesn't collide with anything
// Setu adds, so it survives the round trip.
const clientRedirectUrl = (uniqueId) => {
  const base = (str(process.env.CLIENT_APP_BASE_URL) || "http://localhost:5199").replace(/\/+$/, "");
  return `${base}/?appId=${encodeURIComponent(uniqueId)}&esign_return=1`;
};

/**
 * Start (or resume) the eSign flow for one application.
 * @returns {{ signingUrl, requestId, documentId, pageCount, reused: boolean }}
 */
export async function startEsignForApplication(kycId, locationOptions = {}) {
  const row = await loadRow(kycId);

  // Already signed — nothing to start.
  if (normalizeEsignStatus(row.esign_status) === "completed" && row.esign_signed_pdf_path) {
    return { alreadyCompleted: true, signedPdfUrl: row.esign_signed_pdf_path };
  }

  const config = getEsignConfig();
  const geo = normalizeClientEsignLocation(locationOptions);

  await ensureClientCode(row.id);

  const pdf = await generateKycApplicationPdf(row.id);

  // Best-effort audit snapshot of exactly what's about to be sent for
  // signing — never blocks starting the eSign if the upload fails.
  try {
    const safePan = str(row.pan_number).toUpperCase().replace(/[^A-Z0-9]/g, "") || `app_${row.id}`;
    await uploadBufferToS3(S3_FOLDERS.unsignedPdf, `${safePan}.pdf`, pdf.buffer, "application/pdf");
  } catch (snapshotError) {
    console.error(`[eSign] unsigned PDF snapshot upload failed for application ${row.id}:`, snapshotError.message);
  }

  const documentId = await uploadDocument({ config, buffer: pdf.buffer, fileName: pdf.fileName });
  const configId = await createSignatureConfig({ config, pageCount: pdf.pageCount });

  const signer = buildSignerPayload({
    config,
    applicant: { name: row.itr_name, mobile: row.mobile_number, dob: row.dob },
    geo,
  });

  const redirectUrl = clientRedirectUrl(row.unique_id || row.id);
  const { requestId, signingUrl } = await createSignatureRequest({
    config,
    documentId,
    configId,
    signer,
    redirectUrl,
  });

  await pool.query(
    `UPDATE public.kyc_master_details SET
        esign_document_id = $2,
        esign_request_id = $3,
        esign_status = 'pending',
        esign_redirect_url = $4,
        esign_last_provider_message = NULL,
        current_stage = 'yet to esign',
        updated_at = NOW()
      WHERE id = $1`,
    [row.id, documentId, requestId, signingUrl],
  );

  return { signingUrl, requestId, documentId, pageCount: pdf.pageCount, reused: false };
}

export { resolveKycId };
