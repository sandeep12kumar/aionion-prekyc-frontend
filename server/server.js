import app from "./app.js";
import { ensureKycSchema } from "./config/database.js";
import { reconcilePendingEsigns } from "./services/esignCompletion.js";

const port = Number(process.env.PORT || 3001);

await ensureKycSchema();

app.listen(port, () => {
  console.log(`KYC API listening on http://localhost:${port}`);
  console.log("Health check: GET /api/health");
  console.log("Create lead: POST /api/kyc/leads");
});

// Background sweep: finalise any eSign that Setu has marked sign_complete but
// our side still shows as pending (client closed the tab / never polled), so
// the completion email + signed PDF always go out. First pass shortly after
// boot, then every 60s.
const runReconciler = () => {
  reconcilePendingEsigns().catch((error) =>
    console.error("[eSign reconciler] unexpected error:", error.message),
  );
};
setTimeout(runReconciler, 15_000);
setInterval(runReconciler, 60_000);
