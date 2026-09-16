import React from "react";

export function readVerificationResult() {
  try { return JSON.parse(sessionStorage.getItem("kycVerificationResult") || "null"); }
  catch { return null; }
}

export function ResultLayout({ title, children }) {
  return (
    <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <h1 className="bg-blue-700 px-6 py-6 text-center text-2xl font-bold text-white">{title}</h1>
      <div className="p-6 sm:p-8">{children}</div>
    </section>
  );
}

export function ResultGrid({ fields }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {fields.map(({ label, value, full }) => (
        <div key={label} className={full ? "sm:col-span-2" : ""}>
          <p className="mb-1.5 text-xs font-bold text-slate-700">{label}</p>
          <div className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">{value || "-"}</div>
        </div>
      ))}
    </div>
  );
}

export function EmptyResult() {
  return <p className="text-center text-sm text-rose-600">Verification data is unavailable. Please return to PAN verification and try again.</p>;
}
