import { pool } from "../config/database.js";
import { GET_CLIENT_LINK_SUMMARY, GET_CLIENT_REVIEW } from "../queries/leadQueries.js";

/** Look up a lead by its public unique_id (the secure-link token), not the sequential id. */
export async function getClientLinkSummary(uniqueId) {
  const result = await pool.query(GET_CLIENT_LINK_SUMMARY, [uniqueId]);
  return result.rows[0] || null;
}

/** Full lead row for the client-facing review screen, by unique_id. */
export async function getClientReviewRow(uniqueId) {
  const result = await pool.query(GET_CLIENT_REVIEW, [uniqueId]);
  return result.rows[0] || null;
}
