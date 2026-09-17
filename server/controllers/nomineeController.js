import { saveNomineeDetails } from "../services/leadService.js";

const MIN_NOMINEE_AGE = 18;

function toDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Calendar-accurate age — mirrors frontend/src/kyc/steps/Step5Nominee.jsx.
function calculateAge(dob) {
  const birth = toDateOnly(dob);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function isFutureDate(dob) {
  const birth = toDateOnly(dob);
  if (!birth) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return birth.getTime() > today.getTime();
}

export async function saveNomineeDetailsController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    const nominees = Array.isArray(request.body.nominees) ? request.body.nominees : [];
    if (!Number.isSafeInteger(leadId) || leadId < 1) return response.status(400).json({ message: "A valid lead ID is required." });
    if (nominees.length < 1 || nominees.length > 3) return response.status(400).json({ message: "Add between one and three nominees." });

    for (let index = 0; index < nominees.length; index += 1) {
      const nominee = nominees[index];
      const number = index + 1;
      if (!nominee.nominee_name || /\d/.test(nominee.nominee_name)) return response.status(400).json({ message: `Enter a valid name for nominee ${number}.` });
      if (!nominee.relation || /\d/.test(nominee.relation)) return response.status(400).json({ message: `Enter a valid relation for nominee ${number}.` });

      if (!nominee.dob) return response.status(400).json({ message: `Enter the date of birth for nominee ${number}.` });
      if (isFutureDate(nominee.dob)) return response.status(400).json({ message: `Date of birth for nominee ${number} cannot be in the future.` });
      const age = calculateAge(nominee.dob);
      if (age === null) return response.status(400).json({ message: `Enter a valid date of birth for nominee ${number}.` });

      // A minor nominee is allowed, but a guardian (an adult) must be on file.
      if (age < MIN_NOMINEE_AGE) {
        if (!nominee.guardian_relation || /\d/.test(nominee.guardian_relation)) {
          return response.status(400).json({ message: `Select a guardian relation for nominee ${number} (minor).` });
        }
        if (!nominee.guardian_name || /\d/.test(nominee.guardian_name)) {
          return response.status(400).json({ message: `Enter a valid guardian name for nominee ${number} (minor).` });
        }
        if (!/^\d{10}$/.test(nominee.guardian_mobile || "")) {
          return response.status(400).json({ message: `Enter a valid 10-digit guardian mobile number for nominee ${number}.` });
        }
        if (!nominee.guardian_dob) return response.status(400).json({ message: `Enter the guardian's date of birth for nominee ${number}.` });
        if (isFutureDate(nominee.guardian_dob)) return response.status(400).json({ message: `Guardian date of birth for nominee ${number} cannot be in the future.` });
        const guardianAge = calculateAge(nominee.guardian_dob);
        if (guardianAge === null) return response.status(400).json({ message: `Enter a valid guardian date of birth for nominee ${number}.` });
        if (guardianAge < MIN_NOMINEE_AGE) return response.status(400).json({ message: `The guardian for nominee ${number} must be at least ${MIN_NOMINEE_AGE} years old.` });
        if (!String(nominee.guardian_address || "").trim()) return response.status(400).json({ message: `Enter the guardian's address for nominee ${number}.` });
      }

      const allocation = Number(nominee.allocation_percentage);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100) return response.status(400).json({ message: `Enter a valid allocation for nominee ${number}.` });
    }

    const total = nominees.reduce((sum, nominee) => sum + Number(nominee.allocation_percentage), 0);
    if (Math.abs(total - 100) > 0.001) return response.status(422).json({ code: "INVALID_ALLOCATION", message: "Total nominee allocation must equal 100%." });
    if (request.body.show_nominee_names !== true || request.body.show_nominee_status !== true) return response.status(422).json({ code: "NOMINEE_CONSENT_REQUIRED", message: "Select both nominee consent checkboxes before continuing." });

    const savedLead = await saveNomineeDetails(leadId, request.body);
    return response.json({ message: "Nominee details saved successfully.", savedLead });
  } catch (error) { return next(error); }
}
