import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const hasConnectionUrl = Boolean(process.env.DATABASE_URL);
const hasDatabaseSettings = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"].every(
  (name) => Boolean(process.env[name]),
);

if (!hasConnectionUrl && !hasDatabaseSettings) {
  throw new Error("Set DATABASE_URL or all DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD values in .env.");
}

export const pool = new Pool({
  ...(hasConnectionUrl
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }),
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export async function checkDatabaseConnection() {
  const result = await pool.query("SELECT current_database() AS database_name");
  return result.rows[0];
}

/**
 * The kyc_master_details table is now a fixed, externally-managed schema.
 * This function is intentionally inert — the app must NOT add columns,
 * sequences, or any other DDL to it. It only verifies the table is reachable
 * so a misconfigured DATABASE/DB_* fails loudly at boot.
 */
export async function ensureKycSchema() {
  const { rows } = await pool.query(
    "SELECT to_regclass('public.kyc_master_details') IS NOT NULL AS present",
  );
  if (!rows[0]?.present) {
    throw new Error(
      "Table public.kyc_master_details was not found in the configured database. " +
        "Create it before starting the server (the app no longer creates or alters it).",
    );
  }
}
