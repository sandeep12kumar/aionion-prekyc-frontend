import axios from "axios";
import { XMLParser } from "fast-xml-parser";
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const config = {
  url: process.env.CVL_KRA_URL || "https://www.cvlkra.com/PanInquiry.asmx",
  username: process.env.CVL_USERNAME,
  password: process.env.CVL_PASSWORD,
  passKey: process.env.CVL_PASSKEY,
  posCode: process.env.CVL_POSCODE,
  appPosCode: process.env.CVL_APP_POS_CODE,
  rtaCode: process.env.CVL_RTA_CODE,
  kraCode: process.env.CVL_KRA_CODE || "CVLKRA",
  fetchType: process.env.CVL_FETCH_TYPE || "E",
};
const escapeXml = (value) =>
  String(value).replace(
    /[<>&'\"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character],
  );
function soapResult(xml, method) {
  const parsed = parser.parse(xml);
  return (
    parsed?.["soap:Envelope"]?.["soap:Body"]?.[`${method}Response`]?.[
      `${method}Result`
    ] || parsed?.Envelope?.Body?.[`${method}Response`]?.[`${method}Result`]
  );
}
async function call(method, body) {
  const response = await axios.post(config.url, body, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `https://www.cvlkra.com/${method}`,
    },
    timeout: 60000,
  });
  return response.data;
}
async function encryptedPassword() {
  const xml = await call(
    "GetPassword",
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetPassword xmlns="https://www.cvlkra.com/"><username>${escapeXml(config.username || "")}</username><password>${escapeXml(config.password || "")}</password><PassKey>${escapeXml(config.passKey || "")}</PassKey></GetPassword></soap:Body></soap:Envelope>`,
  );
  const password = soapResult(xml, "GetPassword");
  if (!password)
    throw new Error("CVL KRA did not return an encrypted password.");
  return password;
}
export async function fetchKraDetails(pan, dob) {
  if (
    !config.username ||
    !config.password ||
    !config.passKey ||
    !config.posCode ||
    !config.appPosCode ||
    !config.rtaCode
  )
    throw new Error(
      "CVL KRA settings are incomplete. Add CVL_* values to server/.env.",
    );
  const [year, month, day] = String(dob).split("-");
  if (!year || !month || !day)
    throw new Error("Date of birth must use YYYY-MM-DD format.");
  const kraDob = `${day}/${month}/${year}`;
  const input = `<APP_REQ_ROOT><APP_PAN_INQ><APP_PAN_NO>${escapeXml(pan)}</APP_PAN_NO><APP_DOB>${kraDob}</APP_DOB><APP_DOB_INCORP>${kraDob}</APP_DOB_INCORP><APP_POS_CODE>${escapeXml(config.appPosCode)}</APP_POS_CODE><APP_RTA_CODE>${escapeXml(config.rtaCode)}</APP_RTA_CODE><APP_KRA_CODE>${escapeXml(config.kraCode)}</APP_KRA_CODE><FETCH_TYPE>${escapeXml(config.fetchType)}</FETCH_TYPE></APP_PAN_INQ></APP_REQ_ROOT>`;
  const password = await encryptedPassword();
  const xml = await call(
    "SolicitPANDetailsFetchALLKRA",
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SolicitPANDetailsFetchALLKRA xmlns="https://www.cvlkra.com/"><inputXML><![CDATA[${input}]]></inputXML><userName>${escapeXml(config.username)}</userName><PosCode>${escapeXml(config.posCode)}</PosCode><password>${escapeXml(password)}</password><PassKey>${escapeXml(config.passKey)}</PassKey></SolicitPANDetailsFetchALLKRA></soap:Body></soap:Envelope>`,
  );
  const raw = soapResult(xml, "SolicitPANDetailsFetchALLKRA");
  const parsed = typeof raw === "string" ? parser.parse(raw) : raw;
  const data = parsed?.ROOT?.KYC_DATA;

  if (data?.APP_PAN_NO && data?.APP_NAME) {
    return { found: true, dobMismatch: false, raw: parsed, data };
  }

  // No usable record. Distinguish "this PAN isn't with a KRA at all" (→
  // DigiLocker) from "this PAN IS with a KRA but the DOB doesn't match"
  // (WEBERR-012 → the RM must correct the DOB, not fall through).
  const errorCode = String(data?.APP_ERROR_CODE || "");
  const errorDesc = String(data?.APP_ERROR_DESC || "");
  const dobMismatch =
    errorCode === "WEBERR-012" || /invalid dob|dob mismatch|date of birth/i.test(errorDesc);

  return { found: false, dobMismatch, errorCode, errorDesc, raw: parsed };
}
