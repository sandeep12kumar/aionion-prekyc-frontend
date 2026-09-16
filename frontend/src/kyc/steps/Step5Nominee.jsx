import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { TextField, SelectField, CheckboxField } from "../formFields";

const MAX_NOMINEES = 3;

export const MIN_NOMINEE_AGE = 18;

const RELATION_OPTIONS = [
  "Father",
  "Mother",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Friend",
  "Spouse",
  "Uncle",
  "Aunt",
  "Cousin",
];

const GUARDIAN_RELATION_OPTIONS = [
  "Father",
  "Mother",
  "Grandfather",
  "Grandmother",
  "Brother",
  "Sister",
  "Legal Guardian",
  "Other",
];

function toDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Calendar-accurate age, so a nominee turning 18 today is treated as 18.
export function calculateAge(dob) {
  const birth = toDateOnly(dob);
  if (!birth) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

export function isFutureDate(dob) {
  const birth = toDateOnly(dob);
  if (!birth) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return birth.getTime() > today.getTime();
}

// Latest date of birth that still makes a nominee 18 today — used as the
// date input's `max` so the picker itself blocks under-age selections.
export function maxNomineeDob() {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - MIN_NOMINEE_AGE,
    today.getMonth(),
    today.getDate(),
  );

  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  const day = String(cutoff.getDate()).padStart(2, "0");

  return `${cutoff.getFullYear()}-${month}-${day}`;
}

function emptyNominee() {
  return {
    nominee_name: "",
    relation: "",
    dob: "",
    allocation_percentage: "",
    guardian_relation: "",
    guardian_name: "",
    guardian_mobile: "",
    guardian_dob: "",
    guardian_address: "",
  };
}

export default function Step5Nominee({ data, onChange }) {
  const nominees = data.nominees?.length ? data.nominees : [emptyNominee()];

  const maxDob = maxNomineeDob();

  const updateNominee = (index, field, value) => {
    let normalized = value;
    if (field === "allocation_percentage") normalized = value.replace(/\D/g, "");
    if (field === "guardian_mobile") normalized = value.replace(/\D/g, "").slice(0, 10);
    const next = nominees.map((n, i) => (i === index ? { ...n, [field]: normalized } : n));
    onChange({ ...data, nominees: next });
  };

  const addNominee = () => {
    if (nominees.length >= MAX_NOMINEES) return;
    onChange({ ...data, nominees: [...nominees, emptyNominee()] });
  };

  const removeNominee = (index) => {
    onChange({ ...data, nominees: nominees.filter((_, i) => i !== index) });
  };

  const autoSplit = () => {
    const count = nominees.length;
    if (!count) return;
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    const next = nominees.map((n, i) => ({
      ...n,
      allocation_percentage: String(base + (i < remainder ? 1 : 0)),
    }));
    onChange({ ...data, nominees: next });
  };

  const totalAllocation = nominees.reduce((sum, nominee) => sum + Number(nominee.allocation_percentage || 0), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nominee Details</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Up to {MAX_NOMINEES} nominees. A nominee under {MIN_NOMINEE_AGE} years old is allowed, but
            their guardian's details must be collected.
          </p>
        </div>
        <button
          type="button"
          onClick={autoSplit}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
        >
          Auto Split %
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {nominees.map((nominee, index) => {
          const age = calculateAge(nominee.dob);
          const futureDob = isFutureDate(nominee.dob);
          const underAge = age !== null && !futureDob && age < MIN_NOMINEE_AGE;

          const guardianAge = calculateAge(nominee.guardian_dob);
          const guardianFutureDob = isFutureDate(nominee.guardian_dob);
          const guardianUnderAge = guardianAge !== null && !guardianFutureDob && guardianAge < MIN_NOMINEE_AGE;

          return (
            <div key={index} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Nominee {index + 1}
                </p>
                {nominees.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNominee(index)}
                    className="text-rose-500 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField label="Relation" required value={nominee.relation} onChange={(v) => updateNominee(index, "relation", v)} options={RELATION_OPTIONS} />
                <div><TextField label="Nominee Name" required value={nominee.nominee_name} onChange={(v) => updateNominee(index, "nominee_name", v)} />{nominee.nominee_name && /\d/.test(nominee.nominee_name) && <p className="mt-1 text-xs text-rose-600">Nominee name must not contain numbers.</p>}</div>
                <div>
                  <TextField label="Date of Birth" required type="date" value={nominee.dob} onChange={(v) => updateNominee(index, "dob", v)} />
                  {futureDob && <p className="mt-1 text-xs text-rose-600">Date of birth cannot be in the future.</p>}
                  {!futureDob && age !== null && (
                    <p className={`mt-1 text-xs ${underAge ? "font-bold text-amber-600" : "text-slate-500 dark:text-slate-400"}`}>
                      Age: {age} {age === 1 ? "year" : "years"}{underAge ? " — minor, guardian details required below" : ""}
                    </p>
                  )}
                </div>
                <TextField label="Allocation %" required value={nominee.allocation_percentage} onChange={(v) => updateNominee(index, "allocation_percentage", v)} />
              </div>

              {underAge && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Guardian Details (nominee is a minor)
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <SelectField
                      label="Guardian Relation"
                      required
                      value={nominee.guardian_relation}
                      onChange={(v) => updateNominee(index, "guardian_relation", v)}
                      options={GUARDIAN_RELATION_OPTIONS}
                    />
                    <div>
                      <TextField label="Guardian Name" required value={nominee.guardian_name} onChange={(v) => updateNominee(index, "guardian_name", v)} />
                      {nominee.guardian_name && /\d/.test(nominee.guardian_name) && <p className="mt-1 text-xs text-rose-600">Guardian name must not contain numbers.</p>}
                    </div>
                    <div>
                      <TextField label="Guardian Mobile" required value={nominee.guardian_mobile} onChange={(v) => updateNominee(index, "guardian_mobile", v)} inputMode="numeric" maxLength={10} />
                      {nominee.guardian_mobile && !/^\d{10}$/.test(nominee.guardian_mobile) && <p className="mt-1 text-xs text-rose-600">Mobile number must contain exactly 10 digits.</p>}
                    </div>
                    <div>
                      <TextField label="Guardian Date of Birth" required type="date" max={maxDob} value={nominee.guardian_dob} onChange={(v) => updateNominee(index, "guardian_dob", v)} />
                      {guardianFutureDob && <p className="mt-1 text-xs text-rose-600">Date of birth cannot be in the future.</p>}
                      {guardianUnderAge && (
                        <p className="mt-1 text-xs text-rose-600">
                          Guardian must be at least {MIN_NOMINEE_AGE} years old — currently {guardianAge} {guardianAge === 1 ? "year" : "years"} old.
                        </p>
                      )}
                      {!guardianFutureDob && !guardianUnderAge && guardianAge !== null && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Age: {guardianAge} years</p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <TextField label="Guardian Address" full required value={nominee.guardian_address} onChange={(v) => updateNominee(index, "guardian_address", v)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {nominees.length < MAX_NOMINEES && (
        <button
          type="button"
          onClick={addNominee}
          className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700"
        >
          <Plus size={14} /> Add Nominee
        </button>
      )}

      <p className={`mt-4 text-sm font-bold ${totalAllocation === 100 ? "text-emerald-600" : "text-rose-600"}`}>Total allocation: {totalAllocation}% {totalAllocation !== 100 && "— total must equal 100%."}</p>

      <div className="mt-6 space-y-2">
        <CheckboxField
          label="Client consents to show nominee name(s) on statements."
          checked={data.show_nominee_names}
          onChange={(v) => onChange({ ...data, show_nominee_names: v })}
        />
        <CheckboxField
          label="Client consents to show nominee registration status on statements."
          checked={data.show_nominee_status}
          onChange={(v) => onChange({ ...data, show_nominee_status: v })}
        />
      </div>
    </div>
  );
}
