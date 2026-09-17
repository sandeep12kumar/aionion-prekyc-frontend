import { masterPool } from "../config/masterDatabase.js";
export async function findExistingPan(panNumber) {
  const normalizedPan = String(panNumber || "").trim().toUpperCase();
  const result = await masterPool.query(
    `SELECT existed_pan_number
     FROM existing_pan_details
     WHERE UPPER(TRIM(existed_pan_number)) = $1
     LIMIT 1`,
    [normalizedPan],
  );
  return result.rows[0] || null;
}
