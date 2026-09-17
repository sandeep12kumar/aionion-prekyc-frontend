import { pool } from "../config/database.js";

// kyc_master_details.unique_id is a plain varchar(16) client-link token (no
// DB default — see nextSequentialUniqueId() in leadService.js), now
// sequential ("01", "02", ...) rather than a random token. Any reasonably
// short id-shaped string is a candidate; an actual lookup miss just returns
// null rather than throwing, so this doesn't need to be strict.
const uniqueIdPattern = /^[a-z0-9-]{2,36}$/i;

/**
 * Resolve a client-facing identifier — the link's unique_id, or (fallback
 * only) a plain numeric kyc_master_details.id — down to the numeric id
 * every write in this file keys off.
 *
 * unique_id is checked FIRST, even when the value is purely numeric: now
 * that unique_id itself is a small sequential number, a numeric-looking
 * value is ambiguous with the internal id (e.g. "14" could be either), and
 * every caller of this function is a client-facing Phase 2 endpoint that
 * only ever has the unique_id from the link — so that's the correct read
 * whenever it matches. Falling back to treating the value as a raw id only
 * happens on a unique_id lookup miss.
 */
export async function resolveKycId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (uniqueIdPattern.test(raw)) {
    const result = await pool.query(
      "SELECT id FROM kyc_master_details WHERE unique_id = $1 LIMIT 1",
      [raw],
    );
    if (result.rows[0]?.id) return result.rows[0].id;
  }

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }

  return null;
}
