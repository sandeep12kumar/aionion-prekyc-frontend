import React from "react";

// Shared, plain form-field building blocks for the RM KYC step pages.
// Field names throughout this flow deliberately mirror the KYC staging
// API's own column names (see RM_KYC_FLOW_DESIGN.md) so the shape here maps
// directly onto what the eventual database needs — this UI exists to make
// that shape concrete for the DB team, not as a finished production flow.

export function StepShell({ title, subtitle, children }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function FieldGroup({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800";

// Every detail on the RM KYC pages must be typed in, never pasted — block
// copy / cut / paste and drag-drop on the text fields.
const blockClipboard = (event) => event.preventDefault();

export function TextField({
  label,
  value,
  onChange,
  required,
  full,
  placeholder,
  disabled,
  type = "text",
  maxLength,
  max,
  pattern,
  inputMode,
  onFocus,
  onBlur,
  autoComplete,
}) {
  return (
    <FieldGroup label={label} required={required} full={full}>
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        max={max}
        pattern={pattern}
        inputMode={inputMode}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onCopy={blockClipboard}
        onCut={blockClipboard}
        onPaste={blockClipboard}
        onDrop={blockClipboard}
        className={inputClass}
      />
    </FieldGroup>
  );
}

export function SelectField({ label, value, onChange, options, required, full, disabled }) {
  return (
    <FieldGroup label={label} required={required} full={full}>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value || opt} value={opt.value || opt}>
            {opt.label || opt}
          </option>
        ))}
      </select>
    </FieldGroup>
  );
}

export function YesNoField({ label, value, onChange, full, required }) {
  return (

    <FieldGroup label={label} full={full} required={required}>
      <div className="flex h-10 items-center gap-4">
        {["Yes", "No"].map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="radio"
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="h-3.5 w-3.5"
            />
            {opt}
          </label>
        ))}
      </div>
    </FieldGroup>
  );
}

export function CheckboxField({ label, checked, onChange, required }) {
  return (
    <label className="flex items-start gap-2 sm:col-span-2 text-xs text-slate-600 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked || false}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>{label}{required && <span className="text-rose-500"> *</span>}</span>
    </label>
  );
}
