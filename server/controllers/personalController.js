import { savePersonalDetails } from "../services/leadService.js";

export async function savePersonalDetailsController(request, response, next) {
  try {
    const leadId = Number(request.params.id);
    if (!Number.isSafeInteger(leadId) || leadId < 1) return response.status(400).json({ message: "A valid lead ID is required." });
    if (/\d/.test(String(request.body.father_name || ""))) return response.status(400).json({ code: "INVALID_FATHER_NAME", message: "Father's name must not contain numbers." });
    if (/\d/.test(String(request.body.mother_name || ""))) return response.status(400).json({ code: "INVALID_MOTHER_NAME", message: "Mother's name must not contain numbers." });
    if (request.body.income_declaration_accepted !== true || request.body.rights_accepted !== true) {
      return response.status(422).json({ code: "CONSENT_REQUIRED", message: "Accept the income declaration and rights & obligations before continuing." });
    }
    const savedLead = await savePersonalDetails(leadId, { ...request.body, citizen_of_india: "Yes", country_of_birth: "IN" });
    return response.json({ message: "Personal details saved successfully.", savedLead });
  } catch (error) { return next(error); }
}
