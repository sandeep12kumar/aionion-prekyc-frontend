import { checkDatabaseConnection } from "../config/database.js";

export async function healthCheckController(_request, response, next) {
  try {
    const database = await checkDatabaseConnection();
    return response.json({ ok: true, database: database.database_name });
  } catch (error) {
    return next(error);
  }
}
