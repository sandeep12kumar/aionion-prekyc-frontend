import axios from "axios";
import { pool } from "../config/database.js";
import { masterPool } from "../config/masterDatabase.js";
import { saveVerifiedBankDetails } from "../services/leadService.js";
import { bestNameMatch, DEFAULT_NAME_MATCH_THRESHOLD } from "../utils/nameMatch.js";

const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;

async function findBankByIfsc(ifsc) {
  const result = await masterPool.query(
    `SELECT bank_name, branch_name, address AS bank_address, micr_code
     FROM bank_master
     WHERE UPPER(TRIM(ifsc_code)) = $1
     LIMIT 1`,
    [ifsc],
  );
  return result.rows[0] || null;
}

export async function getBankByIfscController(request, response, next) {
  try {
    const ifsc = String(request.params.ifsc || "").trim().toUpperCase();
    if (!ifscPattern.test(ifsc)) return response.status(400).json({ message: "Enter a valid IFSC code." });
    const bank = await findBankByIfsc(ifsc);
    if (!bank) return response.status(404).json({ message: "IFSC code was not found in bank master." });
    return response.json({ bank });
  } catch (error) { return next(error); }
}

export async function verifyAndSaveBankController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    const accountNumber = String(request.body.account_number || "").trim();
    const confirmAccountNumber = String(request.body.confirm_account_number || "").trim();
    const ifsc = String(request.body.ifsc_code || "").trim().toUpperCase();
    const accountType = String(request.body.account_type || "").trim();

    if (!Number.isSafeInteger(leadId) || leadId < 1) return response.status(400).json({ message: "A valid lead ID is required." });
    if (!/^\d{9,18}$/.test(accountNumber)) return response.status(400).json({ message: "Enter a valid bank account number." });
    if (accountNumber !== confirmAccountNumber) return response.status(400).json({ code: "ACCOUNT_MISMATCH", message: "Account number does not match." });
    if (!ifscPattern.test(ifsc)) return response.status(400).json({ message: "Enter a valid IFSC code." });
    if (!accountType) return response.status(400).json({ message: "Select an account type." });

    const bank = await findBankByIfsc(ifsc);
    if (!bank) return response.status(404).json({ message: "IFSC code was not found in bank master." });
    if (!process.env.PENNY_DROP_CLIENT_ID || !process.env.PENNY_DROP_CLIENT_SECRET || !process.env.PENNY_DROP_PRODUCT_INSTANCE_ID) {
      return response.status(503).json({ message: "Penny-drop settings are incomplete in server/.env." });
    }

    const pennyResponse = await axios.post(
      `${process.env.SETU_BASE_URL || "https://dg.setu.co"}/api/verify/ban`,
      { accountNumber, ifsc, consent: "Y", reason: "Bank account verification for KYC" },
      { headers: { "Content-Type": "application/json", "x-client-id": process.env.PENNY_DROP_CLIENT_ID, "x-client-secret": process.env.PENNY_DROP_CLIENT_SECRET, "x-product-instance-id": process.env.PENNY_DROP_PRODUCT_INSTANCE_ID }, timeout: 15000 },
    );
    const penny = pennyResponse.data || {};
    const verified = String(penny.verification || penny.status || "").toUpperCase() === "SUCCESS";
    if (!verified) return response.status(422).json({ code: "BANK_NOT_ACTIVE", message: penny.message || "The bank account is not active or could not be verified." });

    const verification = {
      verification_id: penny.id || "",
      account_holder_name: penny.data?.name || "",
      verified_at: penny.data?.verifiedAt || "",
      transaction_reference: penny.data?.transactionReference || "",
      amount: penny.data?.amount || penny.amount || null,
      raw: penny,
    };

    // The bank account must belong to the applicant — the penny-drop account
    // holder name is matched against the KYC name (ITR, falling back to
    // DigiLocker/KRA/client name) the same lenient way the eSign step
    // matches the Aadhaar signer. Blocks before saving on a clear mismatch.
    const { rows: leadRows } = await pool.query(
      `SELECT itr_name, digilocker_name, kra_name, client_name FROM kyc_master_details WHERE id = $1`,
      [leadId],
    );
    const leadRow = leadRows[0] || {};
    const nameCandidates = [leadRow.itr_name, leadRow.digilocker_name, leadRow.kra_name, leadRow.client_name];

    if (verification.account_holder_name && nameCandidates.some(Boolean)) {
      const threshold = Number(process.env.BANK_NAME_MATCH_THRESHOLD || DEFAULT_NAME_MATCH_THRESHOLD);
      const match = bestNameMatch(verification.account_holder_name, nameCandidates);
      if (match.score < threshold) {
        console.warn(
          `[Bank] name mismatch for lead ${leadId}: account holder "${verification.account_holder_name}" ` +
            `vs "${match.name || leadRow.itr_name}" — score ${match.score.toFixed(2)} < ${threshold}`,
        );
        return response.status(422).json({
          code: "BANK_NAME_MISMATCH",
          message:
            `The bank account holder name ("${verification.account_holder_name}") does not match the ` +
            `applicant's name ("${leadRow.itr_name || match.name}"). The first payment must come from ` +
            `the client's own bank account — please verify the correct account.`,
        });
      }
    }

    const savedLead = await saveVerifiedBankDetails(leadId, { accountNumber, ifsc, accountType, bank, verification });
    return response.json({ verified: true, message: "Bank account verified and saved successfully.", bank, verification, savedLead });
  } catch (error) {
    if (error.response) {
      return response.status(error.response.status >= 500 ? 502 : 422).json({ message: error.response.data?.message || "Bank account verification failed." });
    }
    return next(error);
  }
}
