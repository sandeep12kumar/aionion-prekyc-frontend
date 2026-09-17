/**
 * Talks to the shared KYC backend (../server). Every call here is keyed by
 * the application's secure-link id (its unique_id, from the URL the client
 * received by email/SMS) — never the sequential lead id.
 *
 * The backend lives on a separate domain (API Gateway -> Lambda), not this
 * app's own origin, so every request needs API_BASE prefixed on — a
 * relative "/api/..." call would otherwise hit this app's own Amplify
 * domain, which has nothing listening there. Set at build time via
 * VITE_API_BASE_URL (see .env); empty string falls back to same-origin
 * relative requests (e.g. local dev behind the Vite proxy in vite.config.js).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Something went wrong. Please try again.");
    error.code = body.code;
    error.body = body;
    throw error;
  }
  return body;
}

export function getClientLink(applicationId) {
  return request(`/kyc/client-link/${encodeURIComponent(applicationId)}`);
}

export function getClientReview(applicationId) {
  return request(`/kyc/client-link/${encodeURIComponent(applicationId)}/review`);
}

export function sendOtp(applicationId, channel) {
  return request(`/kyc/leads/${encodeURIComponent(applicationId)}/otp/${channel}/send`, { method: "POST" });
}

export function verifyOtp(applicationId, channel, otp) {
  return request(`/kyc/leads/${encodeURIComponent(applicationId)}/otp/${channel}/verify`, {
    method: "POST",
    body: JSON.stringify({ otp }),
  });
}

export function createPaymentOrder(applicationId, { firstname, email, phone } = {}) {
  return request("/payment/create-order", {
    method: "POST",
    body: JSON.stringify({ kyc_id: applicationId, firstname, email, phone }),
  });
}

export function verifyPayment(applicationId, { orderId, paymentId, signature }) {
  return request("/payment/verify", {
    method: "POST",
    body: JSON.stringify({
      kyc_id: applicationId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    }),
  });
}

export async function uploadIpvCapture(applicationId, { videoBlob, photoBlob, latitude, longitude, accuracy, capturedAt }) {
  const body = new FormData();
  if (photoBlob) body.append("ipvPhoto", photoBlob, "ipv-face.jpg");
  if (videoBlob) {
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    body.append("ipvCapture", videoBlob, `ipv.${ext}`);
  }
  body.append("latitude", String(latitude));
  body.append("longitude", String(longitude));
  if (accuracy != null) body.append("accuracy", String(accuracy));
  if (capturedAt) body.append("capturedAt", capturedAt.toISOString());

  const response = await fetch(`${API_BASE}/api/kyc/leads/${encodeURIComponent(applicationId)}/ipv`, {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "Unable to upload the IPV capture.");
    throw error;
  }
  return result;
}

/**
 * Kick off Setu Aadhaar eSign. Returns { status, signingUrl, requestId } —
 * the client is then redirected to signingUrl to enter their Aadhaar + OTP.
 */
export function startEsign(applicationId, { latitude, longitude, location } = {}) {
  return request(`/esign/applications/${encodeURIComponent(applicationId)}/start`, {
    method: "POST",
    body: JSON.stringify({ latitude, longitude, location }),
  });
}

/** Poll after the client returns from Setu. -> { status: 'pending'|'completed'|'failed', signedPdfUrl? } */
export function getEsignStatus(applicationId) {
  return request(`/esign/applications/${encodeURIComponent(applicationId)}/status`);
}

/** Loads the Razorpay Checkout script once and reuses it on subsequent calls. */
let checkoutScriptPromise = null;
export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the payment gateway. Check your connection and retry."));
    document.body.appendChild(script);
  });

  return checkoutScriptPromise;
}
