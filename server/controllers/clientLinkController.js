import { getClientLinkSummary, getClientReviewRow } from "../services/clientLinkService.js";
import { SCHEMES, gstBreakdown, getSchemeOpeningAmount } from "../config/schemes.js";

// kyc_master_details.unique_id is a plain varchar(16) token — now a
// sequential number ("01", "02", ...), previously random hex — see
// server/utils/kycMaster.js.
const uniqueIdPattern = /^[a-z0-9-]{2,36}$/i;

const maskAccount = (account) => {
  const value = String(account || "").trim();
  return value.length < 4 ? "" : value.slice(-4);
};

const firstNonEmpty = (...values) => values.find((v) => v !== null && v !== undefined && String(v).trim() !== "") ?? "";
const asBool = (v) => v === true;

// Several personal / standing-instruction columns are BOOLEAN in the schema
// but the review UI expects a "Yes"/"No" string. Map both booleans and any
// legacy "Yes"/"No" text to a display string ("" when unset).
const yesNo = (v) => {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === null || v === undefined || v === "") return "";
  const s = String(v).trim().toLowerCase();
  if (["yes", "true", "y", "1"].includes(s)) return "Yes";
  if (["no", "false", "n", "0"].includes(s)) return "No";
  return String(v);
};

// pg returns DATE columns as Date objects at local midnight — read the
// calendar parts directly so the date doesn't shift a day across timezones.
function ymd(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Calendar-accurate age from a "YYYY-MM-DD" string (as returned by ymd()) —
// used to flag a minor nominee so the review UI shows their guardian card.
function ageFromYmd(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  return age;
}

function shapeReview(lead) {
  const route =
    lead.provider === "CVL_KRA"
      ? "KRA"
      : lead.provider === "INCOME_TAX" || lead.provider === "SETU_DIGILOCKER"
      ? "INCOME_TAX"
      : "";

  const kraAddress = [lead.address_1, lead.address_2, lead.address_3, lead.city, lead.district, lead.state, lead.pincode]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(", ");

  // Guardian details live in ONE top-level set of columns (guardian_relation
  // / guardian_name / guardian_mobile / guardian_address / guardian_dob) —
  // there's no per-nominee-slot guardian storage. Attach them to whichever
  // nominee is actually a minor (in practice there's at most one).
  const nominees = [1, 2, 3]
    .map((i) => {
      const dob = ymd(lead[`nominee_dob_${i}`]);
      const isMinor = ageFromYmd(dob) !== null && ageFromYmd(dob) < 18;
      return {
        name: lead[`nominee_name_${i}`] || "",
        relation: lead[`nominee_relation_${i}`] || "",
        dob,
        allocation: lead[`nominee_allocation_percentage_${i}`] ?? "",
        isMinor,
        guardian: isMinor
          ? {
              relation: lead.guardian_relation || "",
              name: lead.guardian_name || "",
              mobile: lead.guardian_mobile || "",
              dob: ymd(lead.guardian_dob),
              address: lead.guardian_address || "",
            }
          : null,
      };
    })
    .filter((n) => n.name || n.relation);

  return {
    applicationId: lead.unique_id,
    lead: {
      clientName: lead.client_name || "",
      mobile: lead.mobile_number || "",
      email: lead.email || "",
    },
    identity: {
      pan: lead.pan_number || "",
      dob: ymd(lead.dob),
      route,
      aadhaarLinked: lead.aadhaar_seeding_status || (route === "KRA" ? "Yes" : route === "INCOME_TAX" ? "No" : ""),
      panImageUrl: lead.pan_card_file_path || "",
      kraName: lead.kra_name || "",
      kraGender: lead.kra_gender || "",
      kraAddress,
    },
    bank: {
      accountNumber: lead.bank_account_number || "",
      ifsc: lead.bank_ifsc_code || "",
      accountType: lead.bank_account_type || "",
      bankName: lead.bank_name || "",
      branchName: lead.bank_branch_name || "",
      bankAddress: lead.bank_address || "",
      micrCode: lead.bank_micr_code || "",
      accountHolder: lead.bank_account_holder_name || "",
      verified: asBool(lead.bank_bank_verified),
    },
    personal: {
      fatherName: firstNonEmpty(lead.personal_father_name, lead.father_name),
      motherName: lead.mother_name || "",
      gender: firstNonEmpty(lead.kra_gender, lead.digilocker_gender),
      maritalStatus: lead.marital_status || "",
      education: lead.education || "",
      annualIncome: lead.annual_income || "",
      tradingExperience: lead.trading_experience || "",
      occupation: lead.occupation || "",
      netWorth: lead.net_worth || "",
      runningAccountAuthorization: yesNo(lead.running_account_authorization),
      countryOfBirth: lead.country_of_birth || "",
      aadhaarAddress: lead.aadhaar_address || "",
      politicallyExposed: yesNo(lead.politically_exposed),
      citizenOfIndia: yesNo(lead.citizen_of_india),
      ddpi: yesNo(lead.ddpi),
      incomeDeclarationAccepted: asBool(lead.income_declaration_accepted),
      rightsAccepted: asBool(lead.rights_accepted),
    },
    standingInstructions: {
      depositoryCreditInstruction: yesNo(lead.depository_credit_instruction),
      pledgeInstruction: yesNo(lead.pledge_instruction),
      accountStatementRequirement: lead.account_statement_requirement || "",
      electronicTransactionStatement: yesNo(lead.electronic_transaction_statement),
      shareEmailWithRta: yesNo(lead.share_email_with_rta),
      annualReportPreference: lead.annual_report_preference || "",
      dividendInterestEcs: yesNo(lead.dividend_interest_ecs),
      contractNotePreference: lead.contract_note_preference || "",
      trustFacilityInstruction: yesNo(lead.trust_facility_instruction),
      disAtAccountOpening: yesNo(lead.dis_at_account_opening),
    },
    nominees,
    scheme: SCHEMES[lead.selected_scheme] || null,
    signature: { provided: Boolean(lead.signature_file_path), url: lead.signature_file_path || "" },
  };
}

/**
 * GET /api/kyc/client-link/:uniqueId/review
 * The full set of details the RM entered, for the client's confirmation
 * screen before verification/payment/IPV/e-sign.
 */
export async function getClientReviewController(request, response, next) {
  try {
    const uniqueId = String(request.params.uniqueId || "").trim();
    if (!uniqueIdPattern.test(uniqueId)) {
      return response.status(400).json({ message: "Invalid application link." });
    }

    const lead = await getClientReviewRow(uniqueId);
    if (!lead) return response.status(404).json({ message: "Application not found." });

    return response.status(200).json(shapeReview(lead));
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/kyc/client-link/:uniqueId
 * Everything demat-kyc-flow needs to render Phase 2 (verify / payment / IPV)
 * for one application, resolved from what the RM already entered — nothing
 * here is re-typed by the client.
 */
export async function getClientLinkController(request, response, next) {
  try {
    const uniqueId = String(request.params.uniqueId || "").trim();
    if (!uniqueIdPattern.test(uniqueId)) {
      return response.status(400).json({ message: "Invalid application link." });
    }

    const lead = await getClientLinkSummary(uniqueId);
    if (!lead) return response.status(404).json({ message: "Application not found." });

    // scheme.opening is overridden here (not just in the GST math below) so
    // PaymentStep.jsx's own client-side gstBreakdown(scheme.opening, ...)
    // recomputation lands on the exact same amount Razorpay will actually
    // charge — see getSchemeOpeningAmount()'s doc comment.
    const rawScheme = SCHEMES[lead.selected_scheme] || null;
    const scheme = rawScheme
      ? { ...rawScheme, opening: getSchemeOpeningAmount(lead.selected_scheme) }
      : null;
    const placeOfSupply = lead.place_of_supply || "Tamil Nadu";
    const gst = scheme ? gstBreakdown(scheme.opening, placeOfSupply) : null;

    return response.status(200).json({
      applicationId: lead.unique_id,
      id: lead.id,
      applicant: { name: lead.client_name || "", pan: lead.pan_number || "" },
      mobile: lead.mobile_number || "",
      email: lead.email || "",
      mobileVerified: lead.mobile_verified === true,
      emailVerified: lead.email_verified === true,
      scheme,
      placeOfSupply,
      amountDue: gst?.total ?? null,
      bank: lead.bank_account_number
        ? {
            name: lead.bank_name || "",
            holder: lead.bank_holder_name || "",
            accountLast4: maskAccount(lead.bank_account_number),
            ifsc: lead.bank_ifsc_code || "",
            type: lead.bank_account_type || "",
            verified: lead.bank_bank_verified === true,
          }
        : null,
      currentStage: lead.current_stage || "",
      paymentStatus: lead.payment_status || "",
      esignStatus: lead.esign_status || "",
      esignStarted: Boolean(lead.esign_request_id),
      isCompleted: lead.is_completed === true,
    });
  } catch (error) {
    return next(error);
  }
}
