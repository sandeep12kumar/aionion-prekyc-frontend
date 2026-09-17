export function notFoundHandler(request, response) {
  response.status(404).json({ message: `Route not found: ${request.method} ${request.originalUrl}` });
}

export function errorHandler(error, _request, response, _next) {
  console.error("API error:", { code: error.code, message: error.message, stack: error.stack });

  const databaseUnavailable = ["28P01", "3D000", "ECONNREFUSED", "ENOTFOUND"].includes(error.code);
  const uploadError = error.code === "LIMIT_FILE_SIZE" || error.message?.startsWith("Only JPG");
  const leadNotFound = error.code === "LEAD_NOT_FOUND";
  const status = databaseUnavailable ? 503 : uploadError ? 400 : leadNotFound ? 404 : 500;
  const message = databaseUnavailable
    ? "Database connection failed. Check the PostgreSQL settings in server/.env and restart the API."
    : leadNotFound
    ? error.message
    : uploadError
    ? error.message || "The PAN image could not be uploaded."
    : "Unable to save the lead. Please try again.";

  const body = { message };
  if (process.env.NODE_ENV !== "production") {
    body.debug = { code: error.code || "UNKNOWN", details: error.message };
  }

  response.status(status).json(body);
}
