import React from "react";

const SCHEMES = [
  {
    value: "lifeTime",
    name: "Life Time Advantage",
    price: "₹2,499 + GST",
    note: "One-time fee, no AMC.",
  },
  {
    value: "annualCare",
    name: "Annual Care",
    price: "₹1,249 + GST",
    note: "₹499 + GST AMC from year 2 onward.",
  },
];

export default function Step6Scheme({ data, onChange }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Scheme Selection</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        This is the account-opening pricing plan, not an investment/risk-profile choice.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SCHEMES.map((scheme) => (
          <button
            key={scheme.value}
            type="button"
            onClick={() => onChange({ ...data, selected_scheme: scheme.value })}
            className={`rounded-2xl border p-5 text-left transition ${
              data.selected_scheme === scheme.value
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                : "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <p className="text-sm font-bold text-slate-900 dark:text-white">{scheme.name}</p>
            <p className="mt-2 text-2xl font-extrabold text-blue-600">{scheme.price}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{scheme.note}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
