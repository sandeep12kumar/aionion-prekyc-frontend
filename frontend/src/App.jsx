import RmKycFlow from "./kyc/RmKycFlow";
import IncomeTaxResultPage from "./kyc/results/IncomeTaxResultPage";
import DigilockerResultPage from "./kyc/results/DigilockerResultPage";

// Standalone shell — just the RM KYC step screens, no CRM app, no login.
// Extracted from the CRM Dashboard repo (CRM/frontend/src/components/rm/RmKyc)
// for review outside that codebase. See RM_KYC_FLOW_DESIGN.md there for the
// full design context this prototype is based on.
export default function App() {
  const pages = {
    "/income-tax-result": IncomeTaxResultPage,
    "/digilocker-success": DigilockerResultPage,
  };
  const Page = pages[window.location.pathname] || RmKycFlow;
  return (
    <main className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-8">
      <Page />
    </main>
  );
}
