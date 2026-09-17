import { sendSms, sendEmail } from "./notificationService.js";

const OTP_LENGTH = 6;
const EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
export const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS || 3);

export function generateOtp() {
  return String(Math.floor(Math.random() * 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function otpExpiresAt() {
  return new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
}

export async function sendMobileOtp(mobileNumber, otp) {
  // Must match the DLT-registered template EXACTLY (id OTP_TEMPLATE_ID,
  // sender AIOCAP) or SMS Country rejects it with "Template not registered":
  //   "Dear customer, the one time password for Your KYC is: *. Please use
  //    this code to complete your KYC process. - AIONION."
  const text = `Dear customer, the one time password for Your KYC is: ${otp}. Please use this code to complete your KYC process. - AIONION.`;
  try {
    await sendSms(mobileNumber, text);
  } catch (error) {
    error.message = error.message.replace("Unable to send SMS", "Unable to send the mobile OTP");
    error.code = error.code === "SMS_CONFIG_MISSING" ? "OTP_CONFIG_MISSING" : "OTP_SEND_FAILED";
    throw error;
  }
}

export async function sendEmailOtp(email, otp) {
  try {
    await sendEmail({
      to: email,
      subject: "Your AIONION Capital KYC verification code",
      text: `${otp} is your OTP to verify your email address for AIONION Capital KYC. Valid for ${EXPIRY_MINUTES} minutes. Do not share this code.`,
      html: `<p>Your one-time code is <strong style="font-size:20px;letter-spacing:2px">${otp}</strong>.</p><p>It is valid for ${EXPIRY_MINUTES} minutes. Do not share this code with anyone.</p>`,
    });
  } catch (error) {
    error.message = error.message.replace("Unable to send email", "Unable to send the email OTP");
    error.code = error.code === "EMAIL_CONFIG_MISSING" ? "OTP_CONFIG_MISSING" : "OTP_SEND_FAILED";
    throw error;
  }
}
