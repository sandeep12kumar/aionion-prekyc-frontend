import axios from "axios";
import nodemailer from "nodemailer";

/** SMS Country REST API (v0.1) — OTP_API_URL already includes the account SID. */
export async function sendSms(mobileNumber, text) {
  const { OTP_API_URL, OTP_AUTH_KEY, OTP_AUTH_TOKEN, OTP_SENDER_ID, OTP_TEMPLATE_ID } = process.env;

  if (!OTP_API_URL || !OTP_AUTH_KEY || !OTP_AUTH_TOKEN) {
    const error = new Error("SMS is not configured. Set OTP_API_URL / OTP_AUTH_KEY / OTP_AUTH_TOKEN in server/.env.");
    error.code = "SMS_CONFIG_MISSING";
    throw error;
  }

  // India-only: normalize whatever was typed/stored (with or without a
  // country code, spaces, a leading 0, a "+") down to the last 10 digits
  // and always prefix +91's dialing code.
  const digitsOnly = String(mobileNumber || "").replace(/\D/g, "");
  const nationalNumber = `91${digitsOnly.slice(-10)}`;

  try {
    await axios.post(
      OTP_API_URL,
      {
        Text: text,
        Number: nationalNumber,
        SenderId: OTP_SENDER_ID || undefined,
        Dlt_Template_Id: OTP_TEMPLATE_ID || undefined,
        Tool: "API",
      },
      {
        auth: { username: OTP_AUTH_KEY, password: OTP_AUTH_TOKEN },
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      },
    );
  } catch (error) {
    // Log the raw response so a rejection is diagnosable — SMS Country (and
    // any WAF/IP-allowlist in front of it) can reject with a 403 whose body
    // isn't shaped like {Description} or {message}, which previously made
    // every failure surface as the useless generic axios message.
    const status = error.response?.status;
    const contentType = error.response?.headers?.["content-type"] || "";
    const rawBody = error.response?.data;
    const bodyText = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    console.error(`[SMS] send failed (status ${status ?? "?"}, ${contentType}):`, bodyText?.slice(0, 1000));

    const detail =
      rawBody?.Description ||
      rawBody?.description ||
      rawBody?.ErrorMessage ||
      rawBody?.error ||
      rawBody?.message ||
      (status === 403
        ? "Request blocked (403) — this is usually an IP allowlist restriction on the SMS Country account, not a credentials problem. Check the account's API IP allowlist and re-check OTP_AUTH_KEY/OTP_AUTH_TOKEN."
        : null) ||
      (bodyText ? bodyText.slice(0, 300) : error.message);

    const wrapped = new Error(`Unable to send SMS: ${detail}`);
    wrapped.code = "SMS_SEND_FAILED";
    throw wrapped;
  }
}

let cachedTransporter = null;

function getMailTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const error = new Error("Email is not configured. Set SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env.");
    error.code = "EMAIL_CONFIG_MISSING";
    throw error;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return cachedTransporter;
}

export async function sendEmail({ to, subject, text, html, attachments }) {
  const transporter = getMailTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({ from, to, subject, text, html, attachments });
  } catch (error) {
    const wrapped = new Error(`Unable to send email: ${error.message}`);
    wrapped.code = "EMAIL_SEND_FAILED";
    throw wrapped;
  }
}
