/**
 * Side effects that run once an application's eSign completes:
 *  - the reserved DDPI stamp paper is marked USED
 *  - the allocated BO ID is marked USED
 *  - the client is emailed the signed account-opening PDF
 * All are best-effort: failures are logged, not thrown (the eSign itself has
 * already succeeded by the time these run).
 */
import fs from "node:fs";
import path from "node:path";
import { pool } from "../config/database.js";
import { masterPool } from "../config/masterDatabase.js";
import { sendEmail } from "./notificationService.js";
import { readUploadFromS3 } from "./s3StorageService.js";

export async function markStampPaperUsedAfterEsign(kycId) {
  try {
    const { rowCount } = await masterPool.query(
      `UPDATE public.stamp_paper_master
          SET status = 'USED', used_at = NOW()
        WHERE used_by = $1 AND status <> 'USED'`,
      [String(kycId)],
    );
    if (rowCount) console.log(`[eSign] stamp paper marked USED for application ${kycId}`);
  } catch (error) {
    console.error(`[eSign] failed to mark stamp paper USED for ${kycId}:`, error.message);
  }
}

export async function markAllocatedBoidUsed(boid) {
  const value = String(boid || "").trim();
  if (!value) return;
  try {
    const { rowCount } = await masterPool.query(
      `UPDATE public.boid_master SET status = 'USED' WHERE boid = $1 AND status <> 'USED'`,
      [value],
    );
    if (rowCount) console.log(`[eSign] BO ID ${value} marked USED`);
  } catch (error) {
    console.error(`[eSign] failed to mark BO ID ${value} USED:`, error.message);
  }
}

const COMPLETION_SUBJECT = "Aionion Capital Account Opening Completed";
const COMPLETION_TEXT = `Dear Client,

Welcome to the Aionion Family. Your KYC has been completed successfully. You are now ready to begin your financial freedom investment journey with us.

Happy investing!!!

The signed account opening PDF is attached with this email.

Regards,
Aionion Capital Team`;

const COMPLETION_HTML = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#12142f">
    <p style="font-size:16px;font-weight:700;margin:0 0 12px">Aionion Capital Account Opening Completed</p>
    <p style="margin:0 0 12px">Dear Client,</p>
    <p style="margin:0 0 12px">
      Welcome to the Aionion Family. Your KYC has been completed successfully. You are now
      ready to begin your financial freedom investment journey with us.
    </p>
    <p style="margin:0 0 12px;font-weight:700;color:#0023ff">Happy investing!!!</p>
    <p style="margin:0 0 12px">The signed account opening PDF is attached with this email.</p>
    <p style="margin:16px 0 0">Regards,<br/>Aionion Capital Team</p>
  </div>
`;

/**
 * Email the client the signed account-opening PDF, once. Idempotent via
 * kyc_master_details.completion_email_sent.
 */
export async function sendCompletionEmail(kycId) {
  try {
    const { rows } = await pool.query(
      `SELECT email, itr_name, esign_signed_pdf_path, completion_email_sent
         FROM public.kyc_master_details WHERE id = $1`,
      [kycId],
    );
    const row = rows[0];
    if (!row) return;
    if (row.completion_email_sent) return; // already sent
    if (!row.email) {
      console.warn(`[eSign] completion email skipped for ${kycId} — no email on file`);
      return;
    }

    // The email MUST carry the signed PDF. If it isn't available yet, don't
    // send (and don't mark as sent) — the next status poll will re-download
    // the PDF and call this again.
    const storedPath = String(row.esign_signed_pdf_path || "");
    let pdfBuffer = storedPath ? await readUploadFromS3(storedPath) : null;
    if (!pdfBuffer && storedPath) {
      // Fallback for files not yet migrated to S3.
      const abs = path.join(path.resolve("uploads"), storedPath.replace(/^\/?uploads\//, ""));
      if (fs.existsSync(abs)) pdfBuffer = fs.readFileSync(abs);
    }
    if (!pdfBuffer) {
      console.warn(
        `[eSign] completion email deferred for ${kycId} — signed PDF not available yet (${storedPath || "no path"})`,
      );
      return;
    }

    await sendEmail({
      to: row.email,
      subject: COMPLETION_SUBJECT,
      text: COMPLETION_TEXT,
      html: COMPLETION_HTML,
      attachments: [
        {
          filename: "Aionion_Account_Opening_Signed.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await pool.query(
      `UPDATE public.kyc_master_details SET
          completion_email_sent = TRUE, completion_email_sent_at = NOW(), completion_email_error = NULL
        WHERE id = $1`,
      [kycId],
    );
    console.log(`[eSign] completion email sent to ${row.email} for application ${kycId}`);
  } catch (error) {
    console.error(`[eSign] completion email failed for ${kycId}:`, error.message);
    try {
      await pool.query(
        `UPDATE public.kyc_master_details SET completion_email_error = $2 WHERE id = $1`,
        [kycId, String(error.message || error).slice(0, 500)],
      );
    } catch {
      /* best-effort — don't let logging the error itself throw */
    }
  }
}
