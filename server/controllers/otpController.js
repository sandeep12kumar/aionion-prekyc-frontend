import { pool } from "../config/database.js";
import { resolveKycId } from "../utils/kycMaster.js";
import { generateOtp, otpExpiresAt, sendMobileOtp, sendEmailOtp, MAX_OTP_ATTEMPTS } from "../services/otpService.js";

async function getLead(kycId) {
  const result = await pool.query(
    "SELECT id, mobile_number, email, mobile_verified, email_verified, mobile_otp, mobile_otp_expires_at, mobile_otp_attempts, email_otp, email_otp_expires_at, email_otp_attempts FROM kyc_master_details WHERE id = $1",
    [kycId],
  );
  return result.rows[0] || null;
}

function buildSender(channel) {
  return channel === "email"
    ? { column: "email", otpColumn: "email_otp", sentAtColumn: "email_otp_sent_at", expiresColumn: "email_otp_expires_at", attemptsColumn: "email_otp_attempts", verifiedColumn: "email_verified", send: sendEmailOtp }
    : { column: "mobile_number", otpColumn: "mobile_otp", sentAtColumn: "mobile_otp_sent_at", expiresColumn: "mobile_otp_expires_at", attemptsColumn: "mobile_otp_attempts", verifiedColumn: "mobile_verified", send: sendMobileOtp };
}

async function sendOtpController(channel, request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const lead = await getLead(kycId);
    if (!lead) return response.status(404).json({ message: "Application not found." });

    const { column, otpColumn, sentAtColumn, expiresColumn, attemptsColumn, send } = buildSender(channel);
    const target = lead[column];
    if (!target) {
      return response.status(400).json({ message: `No ${channel === "email" ? "email address" : "mobile number"} is on file for this application.` });
    }

    const otp = generateOtp();
    await send(target, otp);

    await pool.query(
      `UPDATE kyc_master_details SET ${otpColumn} = $2, ${sentAtColumn} = CURRENT_TIMESTAMP, ${expiresColumn} = $3, ${attemptsColumn} = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [kycId, otp, otpExpiresAt()],
    );

    const masked = channel === "email"
      ? target.replace(/^(.).*(@.*)$/, "$1***$2")
      : target.replace(/\D/g, "").replace(/^(\d{2})\d+(\d{2})$/, "$1******$2");

    return response.status(200).json({ sent: true, target: masked });
  } catch (error) {
    if (error.code === "OTP_CONFIG_MISSING") return response.status(503).json({ message: error.message });
    if (error.code === "OTP_SEND_FAILED") return response.status(502).json({ message: error.message });
    return next(error);
  }
}

async function verifyOtpController(channel, request, response, next) {
  try {
    const kycId = await resolveKycId(request.params.id);
    if (!kycId) return response.status(400).json({ message: "A valid application is required." });

    const submittedOtp = String(request.body.otp || "").trim();
    if (!submittedOtp) return response.status(400).json({ message: "Enter the OTP." });

    const lead = await getLead(kycId);
    if (!lead) return response.status(404).json({ message: "Application not found." });

    const { otpColumn, expiresColumn, attemptsColumn, verifiedColumn } = buildSender(channel);
    const storedOtp = lead[`${channel === "email" ? "email" : "mobile"}_otp`];
    const expiresAt = lead[`${channel === "email" ? "email" : "mobile"}_otp_expires_at`];
    const attempts = lead[`${channel === "email" ? "email" : "mobile"}_otp_attempts`] || 0;

    if (!storedOtp) {
      return response.status(400).json({ message: "Send an OTP before verifying." });
    }

    if (attempts >= MAX_OTP_ATTEMPTS) {
      return response.status(429).json({ message: "Too many incorrect attempts. Request a new OTP." });
    }

    if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
      return response.status(400).json({ message: "This OTP has expired. Request a new one." });
    }

    if (submittedOtp !== storedOtp) {
      await pool.query(
        `UPDATE kyc_master_details SET ${attemptsColumn} = ${attemptsColumn} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [kycId],
      );
      return response.status(400).json({ message: "Incorrect OTP. Please try again." });
    }

    // Keep the OTP code / expiry / sent-at / attempts exactly as they were
    // at the moment of verification — the ops team wants that as a visible
    // record in the table, not cleared out.
    await pool.query(
      `UPDATE kyc_master_details SET ${verifiedColumn} = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [kycId],
    );

    return response.status(200).json({ verified: true });
  } catch (error) {
    return next(error);
  }
}

export const sendMobileOtpController = (request, response, next) => sendOtpController("mobile", request, response, next);
export const verifyMobileOtpController = (request, response, next) => verifyOtpController("mobile", request, response, next);
export const sendEmailOtpController = (request, response, next) => sendOtpController("email", request, response, next);
export const verifyEmailOtpController = (request, response, next) => verifyOtpController("email", request, response, next);
