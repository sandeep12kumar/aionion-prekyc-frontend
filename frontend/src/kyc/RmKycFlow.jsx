import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, Save } from "lucide-react";

import Step1LeadEntry from "./steps/Step1LeadEntry";
import Step2PanIdentity from "./steps/Step2PanIdentity";
import Step3Bank from "./steps/Step3Bank";
import Step4Personal from "./steps/Step4Personal";
import Step5Nominee, {
  MIN_NOMINEE_AGE,
  calculateAge,
  isFutureDate,
} from "./steps/Step5Nominee";
import Step6Scheme from "./steps/Step6Scheme";
import Step7Signature from "./steps/Step7Signature";
import Step8Review from "./steps/Step8Review";

const STORAGE_KEY = "rmKycDraft";

const STEPS = [
  {
    key: "lead",
    label: "Lead",
    Component: Step1LeadEntry,
  },
  {
    key: "panIdentity",
    label: "PAN & Identity",
    Component: Step2PanIdentity,
  },
  {
    key: "bank",
    label: "Bank",
    Component: Step3Bank,
  },
  {
    key: "personal",
    label: "Personal",
    Component: Step4Personal,
  },
  {
    key: "nominee",
    label: "Nominee",
    Component: Step5Nominee,
  },
  {
    key: "scheme",
    label: "Scheme",
    Component: Step6Scheme,
  },
  {
    key: "signature",
    label: "Signature",
    Component: Step7Signature,
  },
  {
    key: "review",
    label: "Review & Send",
    Component: Step8Review,
  },
];

function emptyData() {
  let verifiedIdentity = null;

  try {
    verifiedIdentity = JSON.parse(
      sessionStorage.getItem("kycVerificationResult") || "null",
    );
  } catch {
    verifiedIdentity = null;
  }

  const identityDetails = verifiedIdentity?.details || {};

  const verifiedAddress =
    verifiedIdentity?.route === "KRA"
      ? [
          identityDetails.address_1,
          identityDetails.address_2,
          identityDetails.address_3,
          identityDetails.city,
          identityDetails.district,
          identityDetails.state,
          identityDetails.pincode,
        ]
          .filter(Boolean)
          .join(", ")
      : identityDetails.address || "";

  return {
    leadId: `LEAD-${Date.now()}`,

    lead: {
      kyc_type: "RM_KYC",
    },

    panIdentity: {},

    bank: {},

    personal: {
      father_name: "",
      mother_name: "",
      gender: "",
      marital_status: "",
      education: "",
      annual_income: "",
      trading_experience: "",
      occupation: "",
      net_worth: "",
      running_account_authorization: "",

      aadhaar_address: verifiedAddress,

      politically_exposed: "No",

      citizen_of_india: "Yes",

      country_of_birth: "IN",

      ddpi: "Yes",

      income_declaration_accepted: false,

      rights_accepted: false,

      standing_instructions: {
        depository_credit_instruction: "Yes",

        pledge_instruction: "Yes",

        account_statement_requirement: "Monthly",

        electronic_transaction_statement: "Yes",

        share_email_with_rta: "Yes",

        annual_report_preference: "Electronic",

        dividend_interest_ecs: "Yes",

        contract_note_preference: "Electronic",

        trust_facility_instruction: "No",

        dis_at_account_opening: "No",
      },
    },

    nominee: {
      nominees: [],
    },

    scheme: {},

    signature: {},
  };
}

export default function RmKycFlow() {
  const [data, setData] = useState(() => {
    const leadId = Number(
      new URLSearchParams(window.location.search).get("leadId"),
    );

    const hasRequestedLeadId =
      Number.isSafeInteger(leadId) && leadId > 0;

    // Only pick the draft back up out of localStorage when the URL names
    // the lead it belongs to — that's the case right after PAN & Identity's
    // verify step, which hard-navigates to the KRA/Income Tax result page
    // and back via `?step=...&leadId=...`, tearing this component down and
    // remounting it in between. A plain page refresh/reopen with no leadId
    // in the URL is a fresh start, not a resume, so it must NOT pull in
    // whatever draft happens to be sitting in localStorage.
    if (hasRequestedLeadId) {
      try {
        const stored = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || "null",
        );

        if (stored && stored.lead?.databaseId === leadId) {
          return stored;
        }
      } catch {
        // Corrupt/unreadable draft — fall through to a fresh one.
      }
    }

    const freshData = emptyData();

    if (hasRequestedLeadId) {
      freshData.lead.databaseId = leadId;
    }

    return freshData;
  });

  const [stepIndex, setStepIndex] = useState(() => {
    // The step name lives in the URL path (e.g. /personal, /bank) so each
    // step is a bookmarkable/refreshable link. `?step=...` is a separate,
    // older mechanism used only for the one-time handoff back from the
    // KRA/Income Tax result pages (see the sync effect below) — checked
    // second, so a path already naming a step always wins.
    const pathKey = window.location.pathname.replace(/^\/+/, "");
    const pathIndex = STEPS.findIndex((item) => item.key === pathKey);
    if (pathIndex >= 0) return pathIndex;

    const requestedStep = new URLSearchParams(
      window.location.search,
    ).get("step");

    const index = STEPS.findIndex(
      (item) => item.key === requestedStep,
    );

    return index >= 0 ? index : 0;
  });

  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasSyncedInitialUrl = useRef(false);

  // Keep the URL's pathname in sync with the current step (and drop the
  // one-time `?step=...&leadId=...` handoff query string once it's been
  // read into state above — a later refresh has nothing left to resume
  // from that way, and genuinely starts fresh instead of restoring the
  // same draft every time). The very first sync replaces so it doesn't add
  // an extra back-button hop; every step change after that pushes a real
  // history entry so browser back/forward moves between steps.
  useEffect(() => {
    const target = `/${STEPS[stepIndex].key}`;
    if (window.location.pathname === target && !window.location.search) {
      hasSyncedInitialUrl.current = true;
      return;
    }
    if (hasSyncedInitialUrl.current) {
      window.history.pushState(null, "", target);
    } else {
      window.history.replaceState(null, "", target);
      hasSyncedInitialUrl.current = true;
    }
  }, [stepIndex]);

  // Browser back/forward between steps.
  useEffect(() => {
    const onPopState = () => {
      const pathKey = window.location.pathname.replace(/^\/+/, "");
      const index = STEPS.findIndex((item) => item.key === pathKey);
      if (index >= 0) setStepIndex(index);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!saveMessage) return;

    const timer = setTimeout(() => {
      setSaveMessage("");
    }, 2000);

    return () => clearTimeout(timer);
  }, [saveMessage]);

  // Keep the draft in localStorage in sync with every in-memory change, not
  // just the explicit "Save & Continue" checkpoints. PAN & Identity (and the
  // DigiLocker route) hard-navigate away via window.location.assign to show
  // the KRA/Income Tax result pages, which tears down this component and
  // its React state entirely — anything not already in localStorage at that
  // point was lost, which is why Lead and PAN & Identity details went
  // missing by the time the flow came back on Bank/Review.
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...data,
        savedAt: new Date().toISOString(),
      }),
    );
  }, [data]);

  const step = STEPS[stepIndex];

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const panIdentityComplete =
    /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
      data.panIdentity.pan_number || "",
    ) &&
    Boolean(data.panIdentity.dob) &&
    Boolean(data.panIdentity.pan_image?.fileName) &&
    Boolean(data.panIdentity.verification?.route);

  const updateStepData = (stepKey) => (value) => {
    setData((previous) => ({
      ...previous,
      [stepKey]: value,
    }));
  };

  const persist = (message) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...data,
        savedAt: new Date().toISOString(),
      }),
    );

    setSaveMessage(message);
  };

  const handleNext = () => {
    if (!isLast) {
      setStepIndex((currentIndex) => currentIndex + 1);
    }
  };

  const saveLead = async () => {
    const response = await fetch("/api/kyc/leads", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(data.lead),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const debugMessage = result.debug
        ? ` [${result.debug.code}: ${result.debug.details}]`
        : "";

      throw new Error(
        `${result.message || "Unable to save the lead."}${debugMessage}`,
      );
    }

    return result.lead;
  };

  const handleSaveAndContinue = async () => {
    setSaveError("");

    /* =========================================
       PAN & IDENTITY VALIDATION
    ========================================= */

    if (step.key === "panIdentity" && !panIdentityComplete) {
      setSaveError(
        "Enter PAN and DOB, upload the PAN image, and complete PAN verification before continuing.",
      );

      return;
    }

    /* =========================================
       BANK VALIDATION
    ========================================= */

    if (step.key === "bank") {
      if (
        !data.bank.account_number ||
        !data.bank.confirm_account_number
      ) {
        setSaveError(
          "Enter and confirm the bank account number.",
        );
        return;
      }

      if (
        data.bank.account_number !==
        data.bank.confirm_account_number
      ) {
        setSaveError("Account number does not match.");
        return;
      }

      if (!data.lead.databaseId) {
        setSaveError(
          "Lead ID is missing. Save Step 1 before verifying bank details.",
        );
        return;
      }

      setIsSaving(true);

      try {
        const response = await fetch(
          `/api/kyc/leads/${data.lead.databaseId}/bank/verify-and-save`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(data.bank),
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.verified) {
          throw new Error(
            result.message ||
              "Bank account verification failed.",
          );
        }

        const updatedData = {
          ...data,

          bank: {
            ...data.bank,
            ...result.bank,
            bank_verified: true,
            verification: result.verification,
          },
        };

        setData(updatedData);

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...updatedData,
            savedAt: new Date().toISOString(),
          }),
        );

        setSaveMessage(
          "Bank account verified and saved",
        );

        handleNext();
      } catch (error) {
        setSaveError(error.message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    /* =========================================
       PERSONAL DETAILS VALIDATION
    ========================================= */

    if (step.key === "personal") {
      const personal = data.personal || {};

      // Father Name validation
      if (!personal.father_name?.trim()) {
        setSaveError("Please enter Father's Name.");
        return;
      }

      // Mother Name validation
      if (!personal.mother_name?.trim()) {
        setSaveError("Please enter Mother's Name.");
        return;
      }

      // Names should not contain numbers
      if (
        /\d/.test(personal.father_name || "") ||
        /\d/.test(personal.mother_name || "")
      ) {
        setSaveError(
          "Father's and mother's names must not contain numbers.",
        );
        return;
      }

      /* =========================================
         REQUIRED PERSONAL DETAILS
      ========================================= */

      const requiredFields = [
        ["gender", "Gender"],
        ["marital_status", "Marital Status"],
        ["education", "Education"],
        ["annual_income", "Annual Income"],
        ["trading_experience", "Trading Experience"],
        ["occupation", "Occupation"],
        ["net_worth", "Net Worth"],
        [
          "running_account_authorization",
          "Running Account Authorization",
        ],
        [
          "aadhaar_address",
          "Aadhaar / Permanent Address",
        ],
        [
          "politically_exposed",
          "Politically Exposed Person",
        ],
        ["ddpi", "DDPI opt-in"],
      ];

      // Check all required fields
      for (const [field, label] of requiredFields) {
        if (!personal[field]?.toString().trim()) {
          setSaveError(
            `Please complete the ${label} field.`,
          );
          return;
        }
      }

      /* =========================================
         POLITICALLY EXPOSED PERSON VALIDATION

         If Yes, do not allow the user
         to continue to the next page.
      ========================================= */

      if (personal.politically_exposed === "Yes") {
        setSaveError(
          "Politically Exposed Persons cannot proceed through this PRE KYC flow.",
        );
        return;
      }

      /* =========================================
         STANDING INSTRUCTIONS VALIDATION
      ========================================= */

      const standingInstructions =
        personal.standing_instructions || {};

      const requiredStandingInstructions = [
        [
          "depository_credit_instruction",
          "Depository Credit Instruction",
        ],
        [
          "pledge_instruction",
          "Pledge Instruction",
        ],
        [
          "account_statement_requirement",
          "Account Statement Requirement",
        ],
        [
          "electronic_transaction_statement",
          "Electronic Transaction Statement",
        ],
        [
          "share_email_with_rta",
          "Share Email with RTA",
        ],
        [
          "annual_report_preference",
          "Annual Report Preference",
        ],
        [
          "dividend_interest_ecs",
          "Dividend / Interest ECS",
        ],
        [
          "contract_note_preference",
          "Contract Note Preference",
        ],
        [
          "trust_facility_instruction",
          "TRUST Facility Instruction",
        ],
        [
          "dis_at_account_opening",
          "DIS at Account Opening",
        ],
      ];

      for (const [field, label] of requiredStandingInstructions) {
        if (!standingInstructions[field]) {
          setSaveError(
            `Please select an option for ${label}.`,
          );
          return;
        }
      }

      /* =========================================
         DECLARATION VALIDATION
      ========================================= */

      if (!personal.income_declaration_accepted) {
        setSaveError(
          "Please accept the income declaration before continuing.",
        );
        return;
      }

      if (!personal.rights_accepted) {
        setSaveError(
          "Please accept the rights & obligations before continuing.",
        );
        return;
      }

      /* =========================================
         LEAD VALIDATION
      ========================================= */

      if (!data.lead.databaseId) {
        setSaveError(
          "Lead ID is missing. Save Step 1 before saving Personal Details.",
        );
        return;
      }

      /* =========================================
         SAVE PERSONAL DETAILS
      ========================================= */

      setIsSaving(true);

      try {
        const response = await fetch(
          `/api/kyc/leads/${data.lead.databaseId}/personal`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(personal),
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to save Personal Details.",
          );
        }

        persist("Personal details saved");

        handleNext();
      } catch (error) {
        setSaveError(error.message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    /* =========================================
       NOMINEE VALIDATION
    ========================================= */

    if (step.key === "nominee") {
      const nominees = data.nominee.nominees || [];

      if (
        nominees.length < 1 ||
        nominees.length > 3
      ) {
        setSaveError(
          "Add between one and three nominees.",
        );
        return;
      }

      for (
        let index = 0;
        index < nominees.length;
        index += 1
      ) {
        const nominee = nominees[index];
        const number = index + 1;

        if (
          !nominee.nominee_name ||
          /\d/.test(nominee.nominee_name)
        ) {
          setSaveError(
            `Enter a valid name for nominee ${number}.`,
          );
          return;
        }

        if (
          !nominee.relation ||
          /\d/.test(nominee.relation)
        ) {
          setSaveError(
            `Enter a valid relation for nominee ${number}.`,
          );
          return;
        }

        /* -----------------------------------------
           DATE OF BIRTH / MINIMUM AGE
        ----------------------------------------- */

        if (!nominee.dob) {
          setSaveError(
            `Enter the date of birth for nominee ${number}.`,
          );
          return;
        }

        if (isFutureDate(nominee.dob)) {
          setSaveError(
            `Date of birth for nominee ${number} cannot be in the future.`,
          );
          return;
        }

        const age = calculateAge(nominee.dob);

        if (age === null) {
          setSaveError(
            `Enter a valid date of birth for nominee ${number}.`,
          );
          return;
        }

        /* -----------------------------------------
           GUARDIAN DETAILS — required when the
           nominee is a minor. The guardian
           themselves must be an adult.
        ----------------------------------------- */

        if (age < MIN_NOMINEE_AGE) {
          if (
            !nominee.guardian_relation ||
            /\d/.test(nominee.guardian_relation)
          ) {
            setSaveError(
              `Select a guardian relation for nominee ${number} (minor).`,
            );
            return;
          }

          if (
            !nominee.guardian_name ||
            /\d/.test(nominee.guardian_name)
          ) {
            setSaveError(
              `Enter a valid guardian name for nominee ${number} (minor).`,
            );
            return;
          }

          if (
            !/^\d{10}$/.test(
              nominee.guardian_mobile || "",
            )
          ) {
            setSaveError(
              `Enter a valid 10-digit guardian mobile number for nominee ${number}.`,
            );
            return;
          }

          if (!nominee.guardian_dob) {
            setSaveError(
              `Enter the guardian's date of birth for nominee ${number}.`,
            );
            return;
          }

          if (isFutureDate(nominee.guardian_dob)) {
            setSaveError(
              `Guardian date of birth for nominee ${number} cannot be in the future.`,
            );
            return;
          }

          const guardianAge = calculateAge(nominee.guardian_dob);

          if (guardianAge === null) {
            setSaveError(
              `Enter a valid guardian date of birth for nominee ${number}.`,
            );
            return;
          }

          if (guardianAge < MIN_NOMINEE_AGE) {
            setSaveError(
              `The guardian for nominee ${number} must be at least ${MIN_NOMINEE_AGE} years old.`,
            );
            return;
          }

          if (!nominee.guardian_address?.trim()) {
            setSaveError(
              `Enter the guardian's address for nominee ${number}.`,
            );
            return;
          }
        }
      }

      const allocation = nominees.reduce(
        (sum, nominee) =>
          sum +
          Number(
            nominee.allocation_percentage || 0,
          ),
        0,
      );

      if (
        Math.abs(allocation - 100) >
        0.001
      ) {
        setSaveError(
          "Total nominee allocation must equal 100%.",
        );
        return;
      }

      if (
        !data.nominee.show_nominee_names ||
        !data.nominee.show_nominee_status
      ) {
        setSaveError(
          "Select both nominee consent checkboxes before continuing.",
        );
        return;
      }

      if (!data.lead.databaseId) {
        setSaveError(
          "Lead ID is missing. Save Step 1 before saving nominees.",
        );
        return;
      }

      setIsSaving(true);

      try {
        const response = await fetch(
          `/api/kyc/leads/${data.lead.databaseId}/nominees`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify(
              data.nominee,
            ),
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to save nominee details.",
          );
        }

        persist("Nominee details saved");

        handleNext();
      } catch (error) {
        setSaveError(error.message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    /* =========================================
       SCHEME VALIDATION
    ========================================= */

    if (step.key === "scheme") {
      const scheme = data.scheme || {};

      if (!scheme.selected_scheme) {
        setSaveError("Select a scheme before continuing.");
        return;
      }

      if (!data.lead.databaseId) {
        setSaveError("Lead ID is missing. Save Step 1 before saving the scheme.");
        return;
      }

      setIsSaving(true);

      try {
        const response = await fetch(
          `/api/kyc/leads/${data.lead.databaseId}/scheme`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selected_scheme: scheme.selected_scheme }),
          },
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.message || "Unable to save the scheme.");
        }

        persist("Scheme details saved");

        handleNext();
      } catch (error) {
        setSaveError(error.message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    /* =========================================
       SIGNATURE VALIDATION
    ========================================= */

    if (step.key === "signature") {
      const signature = data.signature || {};

      if (!signature.signature_image?.fileName) {
        setSaveError("Upload the signature image before continuing.");
        return;
      }

      persist("Signature saved");

      handleNext();

      return;
    }

    /* =========================================
       LEAD SAVE
    ========================================= */

    if (isFirst) {
      setIsSaving(true);

      try {
        const savedLead =
          await saveLead();

        const updatedData = {
          ...data,

          lead: {
            ...data.lead,

            databaseId: savedLead.id,

            uniqueId: savedLead.unique_id,
          },
        };

        setData(updatedData);

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...updatedData,
            savedAt: new Date().toISOString(),
          }),
        );

        setSaveMessage("Lead saved");

        handleNext();
      } catch (error) {
        setSaveError(error.message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    /* =========================================
       OTHER STEPS
    ========================================= */

    persist("Saved");

    handleNext();
  };

  const StepComponent = step.Component;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <img
          src="/aionion-logo.png"
          alt="AIONION Capital — Research | Trust | Forever"
          className="h-16 w-auto object-contain sm:h-20"
        />

        <div className="text-right">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            PRE KYC
          </h1>

          {saveMessage && (
            <p className="text-xs font-bold text-emerald-600">
              {saveMessage}
            </p>
          )}
        </div>
      </div>

      {/* Steps */}

      <div className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((stepItem, index) => (
          <React.Fragment key={stepItem.key}>
            <button
              type="button"
              onClick={() =>
                setStepIndex(index)
              }
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                index === stepIndex
                  ? "bg-blue-600 text-white"
                  : index < stepIndex
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600"
              }`}
            >
              {index + 1}. {stepItem.label}
            </button>

            {index <
              STEPS.length - 1 && (
              <div className="h-px w-4 shrink-0 bg-slate-200 dark:bg-slate-800" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Current Step */}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <StepComponent
          data={data[step.key]}
          onChange={updateStepData(
            step.key,
          )}
          allData={data}
        />
      </div>

      {/* Navigation */}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {!isLast && (
            <button
              type="button"
              onClick={handleSaveAndContinue}
              disabled={
                isSaving ||
                (step.key === "panIdentity" &&
                  !panIdentityComplete) ||
                (step.key === "scheme" &&
                  !data.scheme?.selected_scheme) ||
                (step.key === "signature" &&
                  !data.signature?.signature_image?.fileName)
              }
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={14} />

              {isSaving
                ? step.key === "bank"
                  ? "Verifying..."
                  : "Saving..."
                : "Save & Continue"}

              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}

      {saveError && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {saveError}
        </div>
      )}
    </div>
  );
}