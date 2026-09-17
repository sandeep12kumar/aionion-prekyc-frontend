import "dotenv/config";
import pg from "pg";
const { Pool } = pg;
export const masterPool = new Pool({
  host: process.env.MASTER_DB_HOST || process.env.DB_HOST || "localhost",
  port: Number(process.env.MASTER_DB_PORT || process.env.DB_PORT || 5432),
  database: process.env.MASTER_DB_NAME || "master_data",
  user: process.env.MASTER_DB_USER || process.env.DB_USER,
  password: process.env.MASTER_DB_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.MASTER_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
