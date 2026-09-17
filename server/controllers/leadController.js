import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLead, getLeadContact, getLeadSummary, markClientLinkSent, saveScheme, savePanImage, saveSignatureImage } from "../services/leadService.js";
import { SCHEMES } from "../config/schemes.js";
import { sendSms, sendEmail } from "../services/notificationService.js";
import { S3_FOLDERS, uploadBufferToS3 } from "../services/s3StorageService.js";

function clientAppBaseUrl() {
  return process.env.CLIENT_APP_BASE_URL || "http://localhost:5199";
}

const mobilePattern = /^\d{10}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createLeadController(request, response, next) {
  try {
    const client_name = String(request.body.client_name || "").trim();
    const mobile_number = String(request.body.mobile_number || "").trim();
    const email = String(request.body.email || "").trim().toLowerCase();

    if (!client_name) return response.status(400).json({ message: "Client name is required." });
    if (/\d/.test(client_name)) return response.status(400).json({ code: "INVALID_CLIENT_NAME", message: "Client name must not contain numbers." });
    if (!mobilePattern.test(mobile_number) || !emailPattern.test(email)) {
      return response.status(400).json({
        message: "Enter a 10-digit mobile number and a valid email address.",
      });
    }

    const lead = await createLead({ client_name, mobile_number, email });
    return response.status(201).json({ lead });
  } catch (error) {
    return next(error);
  }
}

export async function getLeadSummaryController(request, response, next) {
  const leadId = Number(request.params.id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return response.status(400).json({ message: "A valid lead ID is required." });
  }

  try {
    const lead = await getLeadSummary(leadId);
    if (!lead) return response.status(404).json({ message: "Lead not found." });
    return response.status(200).json({ lead });
  } catch (error) {
    return next(error);
  }
}

export async function saveSchemeController(request, response, next) {
  const leadId = Number(request.params.id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return response.status(400).json({ message: "A valid lead ID is required." });
  }

  const selectedScheme = String(request.body.selected_scheme || "");
  if (!SCHEMES[selectedScheme]) {
    return response.status(400).json({ message: "Select a valid scheme before continuing." });
  }

  try {
    const lead = await saveScheme(leadId, selectedScheme);
    return response.status(200).json({ lead });
  } catch (error) {
    if (error.code === "LEAD_NOT_FOUND") return response.status(404).json({ message: error.message });
    return next(error);
  }
}

/**
 * POST /api/kyc/leads/:id/send-client-link
 * Emails and texts the client their secure Phase 2 link (verify → payment →
 * IPV → e-sign), built from the lead's unique_id — never the sequential id.
 * SMS and email are sent independently; one failing doesn't block the other.
 */
export async function sendClientLinkController(request, response, next) {
  const leadId = Number(request.params.id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return response.status(400).json({ message: "A valid lead ID is required." });
  }

  try {
    const lead = await getLeadContact(leadId);
    if (!lead) return response.status(404).json({ message: "Lead not found." });

    const link = `${clientAppBaseUrl()}/?id=${lead.unique_id}`;
    const results = { sms: null, email: null };

    if (lead.mobile_number) {
      try {
        await sendSms(
          lead.mobile_number,
          `Hi ${lead.client_name || ""}, complete your AIONION Capital KYC here: ${link}`,
        );
        results.sms = "sent";
      } catch (error) {
        results.sms = error.message;
      }
    } else {
      results.sms = "No mobile number on file.";
    }

    if (lead.email) {
      try {
        await sendEmail({
          to: lead.email,
          subject: "Complete your AIONION Capital KYC",
          text: `Hi ${lead.client_name || ""},\n\nComplete your KYC (verification, payment, video IPV, and e-sign) using the secure link below:\n${link}\n\nThis link is personal to you — please don't share it.`,
          html: `<p>Hi ${lead.client_name || ""},</p><p>Complete your KYC (verification, payment, video IPV, and e-sign) using the secure link below:</p><p><a href="${link}">${link}</a></p><p>This link is personal to you — please don't share it.</p>`,
        });
        results.email = "sent";
      } catch (error) {
        results.email = error.message;
      }
    } else {
      results.email = "No email address on file.";
    }

    const anySent = results.sms === "sent" || results.email === "sent";
    if (anySent) await markClientLinkSent(leadId);

    return response.status(anySent ? 200 : 502).json({ sent: anySent, link, results });
  } catch (error) {
    return next(error);
  }
}

export async function uploadPanImageController(request, response, next) {
  const leadId = Number(request.params.id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return response.status(400).json({ message: "A valid lead ID is required." });
  }
  if (!request.file) {
    return response.status(400).json({ message: "Choose a PAN image before submitting." });
  }

  const fileName = `${randomUUID()}${path.extname(request.file.originalname).toLowerCase()}`;
  const panImagePath = `/uploads/pan/${fileName}`;
  try {
    await uploadBufferToS3(S3_FOLDERS.pan, fileName, request.file.buffer, request.file.mimetype);
    const lead = await savePanImage(leadId, panImagePath, request.file.originalname, request.file.mimetype);
    if (!lead) {
      return response.status(404).json({ message: "Lead not found." });
    }
    return response.status(200).json({
      panImage: { path: panImagePath, fileName: request.file.originalname, uploadedAt: lead.updated_at },
    });
  } catch (error) {
    return next(error);
  }
}

export async function uploadSignatureImageController(request, response, next) {
  const leadId = Number(request.params.id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return response.status(400).json({ message: "A valid lead ID is required." });
  }
  if (!request.file) {
    return response.status(400).json({ message: "Choose a signature image before submitting." });
  }

  const fileName = `${randomUUID()}${path.extname(request.file.originalname).toLowerCase()}`;
  const signatureImagePath = `/uploads/signature/${fileName}`;
  try {
    await uploadBufferToS3(S3_FOLDERS.signatureUpload, fileName, request.file.buffer, request.file.mimetype);
    const lead = await saveSignatureImage(leadId, signatureImagePath, request.file.originalname, request.file.mimetype);
    if (!lead) {
      return response.status(404).json({ message: "Lead not found." });
    }
    return response.status(200).json({
      signatureImage: { path: signatureImagePath, fileName: request.file.originalname, uploadedAt: lead.updated_at },
    });
  } catch (error) {
    return next(error);
  }
}
