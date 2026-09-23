import React, { useEffect, useRef } from "react";
import {
  StepShell,
  TextField,
  SelectField,
  YesNoField,
  CheckboxField,
} from "../formFields";
import { apiUrl } from "../../lib/apiBase";

const STANDING_INSTRUCTIONS = [
  [
    "depository_credit_instruction",
    "I/We instruct the DP to receive each and every Depository credit in my/our account.",
    ["Yes", "No"],
    "Yes",
  ],
  [
    "pledge_instruction",
    "I/We would like to instruct the DP to accept all pledge instructions in my/our account without any further instruction from my/our end.",
    ["Yes", "No"],
    "Yes",
  ],
  [
    "account_statement_requirement",
    "Account Statement Requirement (as per SEBI Regulation)",
    ["Daily", "Weekly", "Fortnightly", "Monthly"],
    "Monthly",
  ],
  [
    "electronic_transaction_statement",
    "I/We request you to send Electronic Transaction-cum-Holding Statement to the email ID.",
    ["Yes", "No"],
    "Yes",
  ],
  [
    "share_email_with_rta",
    "I/We would like to share the email ID with RTA.",
    ["Yes", "No"],
    "Yes",
  ],
  [
    "annual_report_preference",
    "I/We would like to receive the Annual Report.",
    ["Physical", "Electronic", "Both Physical and Electronic"],
    "Electronic",
  ],
  [
    "dividend_interest_ecs",
    "I/We wish to receive dividend/interest directly into my/our account as given below through ECS.",
    ["Yes", "No"],
    "Yes",
  ],
  [
    "contract_note_preference",
    "Whether you wish to receive contract note through.",
    ["Physical", "Electronic"],
    "Electronic",
  ],
  [
    "trust_facility_instruction",
    "I/We wish to avail the TRUST facility using the Mobile number registered for SMS Alert Facility.",
    ["Yes", "No"],
    "No",
  ],
  [
    "dis_at_account_opening",
    "Whether you wish to receive DIS at the time of account opening.",
    ["Yes", "No"],
    "No",
  ],
];

function InstructionField({ label, options, value, onChange }) {
  return (
    <div className='grid gap-3 border-b border-slate-200 pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[1fr_280px] sm:items-center dark:border-slate-700'>
      <p className='text-sm leading-5 text-slate-800 dark:text-slate-200'>
        {label}
      </p>
      <div className='flex flex-wrap gap-x-6 gap-y-3'>
        {options.map((option) => (
          <label
            key={option}
            className='flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300'
          >
            <input
              type='radio'
              name={label}
              checked={value === option}
              onChange={() => onChange(option)}
              className='h-4 w-4 accent-blue-600'
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function Step4Personal({ data, onChange, allData }) {
  const set = (field) => (value) => onChange({ ...data, [field]: value });
  const setSI = (field) => (value) =>
    onChange({
      ...data,
      standing_instructions: { ...data.standing_instructions, [field]: value },
    });

  // Default Father's Name and Aadhaar/Permanent Address from the DigiLocker
  // record already saved on this lead — the RM can still edit either field
  // afterward. Fetched fresh (not read out of the client-side draft) since
  // the draft can be resumed from before DigiLocker ever completed. Runs
  // once per lead, and only fills fields that are still empty so it never
  // overwrites something the RM already typed.
  const prefilledLeadId = useRef(null);
  useEffect(() => {
    const leadId = allData?.lead?.databaseId;
    if (!leadId || prefilledLeadId.current === leadId) return;
    prefilledLeadId.current = leadId;
    fetch(apiUrl(`/api/kyc/leads/${leadId}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const lead = result?.lead;
        if (!lead) return;
        const updates = {};
        if (!data.father_name && lead.digilocker_father_name) {
          updates.father_name = lead.digilocker_father_name;
        }
        if (!data.aadhaar_address && lead.digilocker_address) {
          updates.aadhaar_address = lead.digilocker_address;
        }
        if (Object.keys(updates).length) onChange({ ...data, ...updates });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData?.lead?.databaseId]);

  return (
    <StepShell title='Personal Details'>
      <div>
        <TextField
          label="Father's Name"
          required
          value={data.father_name}
          onChange={set("father_name")}
          placeholder='Pre-filled from DigiLocker when available'
        />
        {data.father_name && /\d/.test(data.father_name) && (
          <p className='mt-1 text-xs text-rose-600'>
            Father's name must not contain numbers.
          </p>
        )}
      </div>
      <div>
        <TextField
          label="Mother's Name"
          required
          value={data.mother_name}
          onChange={set("mother_name")}
        />
        {data.mother_name && /\d/.test(data.mother_name) && (
          <p className='mt-1 text-xs text-rose-600'>
            Mother's name must not contain numbers.
          </p>
        )}
      </div>
      <SelectField
        label='Gender'
        value={data.gender}
        onChange={set("gender")}
        options={["Male", "Female", "Other"]}
      />
      <SelectField
        label='Marital Status'
        value={data.marital_status}
        onChange={set("marital_status")}
        options={["Single", "Married", "Other"]}
      />
      <SelectField
        label='Education'
        value={data.education}
        onChange={set("education")}
        options={[
          "Under Graduate",
          "Graduate",
          "Post Graduate",
          "Doctorate",
          "Other",
        ]}
      />
      <SelectField
        label='Annual Income'
        value={data.annual_income}
        onChange={set("annual_income")}
        options={[
          "Less Than One Lakhs",
          "One To Five Lakhs",
          "Five To Ten Lakhs",
          "Ten To Twenty Five Lakhs",
          "Above Twenty Five Lakhs",
        ]}
      />
      <SelectField
        label='Trading Experience'
        value={data.trading_experience}
        onChange={set("trading_experience")}
        options={["None", "0-1 Years", "1-5 Years", "5+ Years"]}
      />
      <SelectField
        label='Occupation'
        value={data.occupation}
        onChange={set("occupation")}
        options={[
          "Salaried",
          "Self Employed",
          "Business",
          "Professional",
          "Retired",
          "Homemaker",
          "Student",
          "Other",
        ]}
      />
      <SelectField
        label='Net Worth'
        value={data.net_worth}
        onChange={set("net_worth")}
        options={[
          "Less Than One Lakhs",
          "One To Five Lakhs",
          "Five To Twenty Five Lakhs",
          "Twenty Five Lakhs To One Crore",
          "Above One Crore",
        ]}
      />
      <SelectField
        label='Running Account Authorization'
        value={data.running_account_authorization}
        onChange={set("running_account_authorization")}
        options={["Monthly", "Quarterly"]}
      />
      <TextField
        label='Country of Birth'
        value='IN'
        onChange={() => {}}
        disabled
      />
      <TextField
        label='Aadhaar / Permanent Address'
        full
        value={data.aadhaar_address}
        onChange={set("aadhaar_address")}
        placeholder='Pre-filled from DigiLocker when available'
      />

      <YesNoField
        label='Politically Exposed Person?'
        value={data.politically_exposed}
        onChange={set("politically_exposed")}
      />
      <TextField
        label='Citizen of India?'
        value='Yes'
        onChange={() => {}}
        disabled
      />
      <YesNoField
        label='DDPI opt-in?'
        value={data.ddpi}
        onChange={set("ddpi")}
      />

      <div className='sm:col-span-2'>
        <div className='overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700'>
          <div className='bg-gradient-to-r from-blue-700 via-violet-600 to-rose-500 px-5 py-4'>
            <p className='text-lg font-bold text-white'>
              Standing Instructions
            </p>
          </div>
          <div className='space-y-4 bg-white p-5 dark:bg-slate-900'>
            {STANDING_INSTRUCTIONS.map(
              ([field, label, options, defaultValue]) => (
                <InstructionField
                  key={field}
                  label={label}
                  options={options}
                  value={data.standing_instructions?.[field] || defaultValue}
                  onChange={setSI(field)}
                />
              ),
            )}
          </div>
        </div>
      </div>

      <CheckboxField
        label='Client has accepted the income declaration.'
        checked={data.income_declaration_accepted}
        onChange={set("income_declaration_accepted")}
      />
      <CheckboxField
        label='Client has accepted rights & obligations.'
        checked={data.rights_accepted}
        onChange={set("rights_accepted")}
      />
    </StepShell>
  );
}
