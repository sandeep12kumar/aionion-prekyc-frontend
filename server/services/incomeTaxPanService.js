import axios from "axios";
export async function verifyPanWithIncomeTax(pan) {
  if (!process.env.INCOME_TAX_CLIENT_ID || !process.env.INCOME_TAX_CLIENT_SECRET || !process.env.INCOME_TAX_PRODUCT_ID) throw new Error("Income Tax settings are incomplete. Add INCOME_TAX_* values to server/.env.");
  const response = await axios.post("https://dg.setu.co/api/verify/pan", { pan, consent: "Y", reason: "PAN verification for account opening" }, { headers: { "Content-Type": "application/json", "x-client-id": process.env.INCOME_TAX_CLIENT_ID, "x-client-secret": process.env.INCOME_TAX_CLIENT_SECRET, "x-product-instance-id": process.env.INCOME_TAX_PRODUCT_ID }, timeout: 15000 });
  const raw = response.data;
  return { valid: raw?.verification === "SUCCESS", raw, data: raw?.data || {} };
}
