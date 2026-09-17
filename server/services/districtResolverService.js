import axios from "axios";

/**
 * Resolve district + state from an Indian PIN code via the free India Post API.
 * Best-effort — returns {} on any failure so callers can fall back gracefully.
 */
export async function resolveLocationFromPincode(pincode) {
  const pin = String(pincode || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pin)) return {};

  try {
    const { data } = await axios.get(`https://api.postalpincode.in/pincode/${pin}`, { timeout: 5000 });
    const office = data?.[0]?.PostOffice?.[0];
    if (!office) return {};
    return {
      district: office.District || "",
      state: office.State || "",
    };
  } catch (error) {
    console.warn("[districtResolver] pincode lookup failed:", error.message);
    return {};
  }
}

/**
 * Resolve a district for an export that already has an address on file:
 * use the stored district if present, else look it up from the pincode
 * (reusing resolveLocationFromPincode), else fall back to the city name.
 * Best-effort — never throws, always returns { district }.
 */
export async function resolveDistrictAsync({ district, pincode, city } = {}) {
  const existing = String(district || "").trim();
  if (existing) return { district: existing };

  const looked = await resolveLocationFromPincode(pincode);
  if (looked.district) return { district: looked.district };

  return { district: String(city || "").trim() };
}
