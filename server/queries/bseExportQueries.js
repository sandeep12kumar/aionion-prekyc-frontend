/**
 * BSE UCC (Unique Client Code) EXPORT - source directly from
 * kyc_master_details, same pattern as cvlkraExportQueries.js /
 * cdslExportQueries.js / nseExportQueries.js.
 *
 * No reference code was supplied for this one (unlike the other three
 * exports) — the field mapping below was derived directly from
 * bse_data's own 145 columns and kyc_master_details' live schema.
 * bse_data is a generic BSE UCC registration table that also covers
 * corporate/HUF/partnership applicants with multiple directors, multiple
 * bank/demat accounts, POA-for-trading-segments, etc. — this KYC app is
 * "Individuals Only" (see the account-opening form header), so every
 * corporate-only field (director_details, number_of_directors, cin_no,
 * partners_kartauid/coparceneruid, registration_no/authority, contact
 * _person_1/2, segment/derivative/currency flags, cust_* authorised-person
 * fields, and bank/demat slots 2-5) is left NULL — there's no KYC-app data
 * that could ever populate them for a retail individual applicant.
 *
 * A handful of fields are pure BSE/participant transport metadata with no
 * KYC-app equivalent at all (transaction_code, client_type, status,
 * type_of_service, contact_details, provide_details) — those are
 * overridable via the numbered $2.."$7 params (see bseExportService.js),
 * same COALESCE-onto-existing-row pattern as the other three exports.
 *
 * kyc_master_details has no plain "gender" column and bse_data has no
 * gender/sex column either, so that mismatch (fixed in the other three
 * exports) doesn't come up here at all.
 */

const buildBsePoliticalExposedCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('YES', 'Y', 'TRUE') THEN 'Y'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('NO', 'N', 'FALSE') THEN 'N'
    ELSE NULL
  END
`;

const buildBseDdpiFlagCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('YES', 'Y', 'TRUE') THEN 'Y'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('NO', 'N', 'FALSE') THEN 'N'
    ELSE NULL
  END
`;

const buildBsePreparedCte = () => `
  WITH source_row AS (
    SELECT
      km.id AS application_id,
      -- The link token (kyc_master_details.unique_id) is what actually goes
      -- into bse_data.unique_id — kept as text here so the service can
      -- validate it's numeric before the INSERT ever casts it to bigint.
      NULLIF(BTRIM(km.unique_id), '') AS source_unique_id_text,
      NULLIF(BTRIM(km.pan_number), '') AS source_pan_number,
      NULLIF(BTRIM(COALESCE(km.itr_name, km.digilocker_name)), '') AS source_full_name,
      COALESCE(km.dob, km.provider_dob, km.digilocker_dob) AS source_dob,
      NULLIF(BTRIM(
        CASE
          WHEN km.address_1 IS NOT NULL THEN km.address_1
          ELSE COALESCE(km.aadhaar_address, km.digilocker_address)
        END
      ), '') AS source_address_line1,
      NULLIF(BTRIM(km.address_2), '') AS source_address_line2,
      NULLIF(BTRIM(COALESCE(km.city, km.digilocker_city)), '') AS source_city,
      NULLIF(BTRIM(COALESCE(km.state, km.digilocker_state)), '') AS source_state,
      NULLIF(BTRIM(COALESCE(km.pincode, km.digilocker_pincode)), '') AS source_pincode,
      NULLIF(BTRIM(km.email), '') AS source_email,
      NULLIF(BTRIM(km.mobile_number), '') AS source_mobile,
      CASE
        WHEN REGEXP_REPLACE(COALESCE(km.aadhaar_number, ''), '[[:space:]-]', '', 'g') ~ '^[0-9]{12}$'
          THEN REGEXP_REPLACE(km.aadhaar_number, '[[:space:]-]', '', 'g')
        ELSE NULLIF(BTRIM(km.digilocker_aadhaar_number_masked), '')
      END AS source_aadhaar_number,
      NULLIF(BTRIM(km.category), '') AS source_category,
      NULLIF(BTRIM(km.client_code), '') AS source_client_code,
      NULLIF(BTRIM(km.politically_exposed::text), '') AS source_politically_exposed,
      NULLIF(BTRIM(km.annual_income), '') AS source_annual_income,
      NULLIF(BTRIM(km.net_worth), '') AS source_net_worth,
      NULLIF(BTRIM(km.ddpi::text), '') AS source_ddpi,
      NULLIF(BTRIM(km.bank_name), '') AS source_bank_name,
      NULLIF(BTRIM(km.bank_account_number), '') AS source_bank_account_number,
      NULLIF(BTRIM(km.bank_ifsc_code), '') AS source_bank_ifsc,
      NULLIF(BTRIM(km.boid), '') AS source_boid,
      (
        (km.nominee_name_1 IS NOT NULL AND BTRIM(km.nominee_name_1) <> '')::int +
        (km.nominee_name_2 IS NOT NULL AND BTRIM(km.nominee_name_2) <> '')::int +
        (km.nominee_name_3 IS NOT NULL AND BTRIM(km.nominee_name_3) <> '')::int
      ) AS source_nominee_count,
      existing.transaction_code AS existing_transaction_code,
      existing.client_type AS existing_client_type,
      existing.status AS existing_status,
      existing.type_of_service AS existing_type_of_service,
      existing.contact_details AS existing_contact_details,
      existing.provide_details AS existing_provide_details
    FROM public.kyc_master_details km
    LEFT JOIN public.bse_data existing
      ON existing.unique_id = (CASE WHEN km.unique_id ~ '^[0-9]+$' THEN km.unique_id::bigint ELSE NULL END)
    WHERE km.id = $1
  ),
  prepared_row AS (
    SELECT
      source_row.application_id,
      source_row.source_unique_id_text AS shared_unique_id_text,
      COALESCE(NULLIF($2, ''), source_row.existing_transaction_code, 'N') AS transaction_code,
      COALESCE(NULLIF($3, ''), source_row.existing_client_type, 'I') AS client_type,
      COALESCE(NULLIF($4, ''), source_row.existing_status) AS status,
      -- category is varchar(10) on bse_data, but kyc_master_details.category
      -- is free text (e.g. "Individual or Person") — truncate rather than
      -- error; there's no confirmed BSE category code to map to instead.
      SUBSTRING(source_row.source_category FROM 1 FOR 10) AS category,
      source_row.source_client_code AS client_code,
      source_row.source_pan_number AS pan_no,
      ${buildBsePoliticalExposedCase("source_row.source_politically_exposed")} AS political_ex_person,
      source_row.source_address_line1 AS address1,
      'Y'::varchar AS permn_equal_corp,
      source_row.source_address_line2 AS address2,
      CASE WHEN source_row.source_address_line1 IS NOT NULL THEN 'India' ELSE NULL END AS country,
      source_row.source_state AS state,
      source_row.source_city AS city,
      source_row.source_pincode AS pincode,
      COALESCE(NULLIF($5, ''), source_row.existing_type_of_service) AS type_of_service,
      COALESCE(NULLIF($6, ''), source_row.existing_contact_details) AS contact_details,
      source_row.source_email AS email,
      source_row.source_mobile AS mobile_number,
      CASE WHEN source_row.source_boid IS NOT NULL THEN 'CDSL' ELSE NULL END AS depository_name1,
      source_row.source_boid AS demat_id1,
      CASE
        WHEN source_row.source_boid IS NOT NULL
        THEN 'AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED'
        ELSE NULL
      END AS depository_participant1,
      source_row.source_bank_name AS bank_name1,
      source_row.source_bank_account_number AS account_no1,
      COALESCE(NULLIF($7, ''), source_row.existing_provide_details) AS provide_details,
      source_row.source_annual_income AS income,
      source_row.source_net_worth AS net_worth,
      'Y'::varchar AS is_active,
      NULLIF(SPLIT_PART(source_row.source_full_name, ' ', 1), '') AS first_name,
      NULLIF(
        BTRIM(REGEXP_REPLACE(source_row.source_full_name, '^[^ ]+\\s*|\\s*[^ ]+$', '', 'g')),
        ''
      ) AS middle_name,
      NULLIF(
        CASE
          WHEN POSITION(' ' IN source_row.source_full_name) > 0
          THEN REGEXP_REPLACE(source_row.source_full_name, '^.*\\s', '')
          ELSE NULL
        END,
        ''
      ) AS last_name,
      source_row.source_aadhaar_number AS aadhaar_card_no,
      TO_CHAR(source_row.source_dob, 'DD/MM/YYYY') AS date_of_birth,
      source_row.source_full_name AS client_name,
      'N'::varchar AS whether_corporate,
      ${buildBseDdpiFlagCase("source_row.source_ddpi")} AS is_poa,
      ${buildBseDdpiFlagCase("source_row.source_ddpi")} AS poa_for_fund,
      ${buildBseDdpiFlagCase("source_row.source_ddpi")} AS poa_for_security,
      CASE WHEN source_row.source_address_line1 IS NOT NULL THEN 'India' ELSE NULL END AS per_country,
      source_row.source_state AS per_state,
      source_row.source_city AS per_city,
      source_row.source_pincode AS per_pincode,
      CASE
        WHEN source_row.source_nominee_count > 0 THEN 'Y'
        WHEN source_row.source_nominee_count = 0 THEN 'N'
        ELSE NULL
      END AS opted_for_nomination,
      source_row.source_boid AS beneficial_own_acnt_no1,
      source_row.source_bank_ifsc AS bank_branch_ifsc_code1,
      CASE WHEN source_row.source_bank_account_number IS NOT NULL THEN 'P' ELSE NULL END AS primary_or_secondary_bank1,
      CASE WHEN source_row.source_boid IS NOT NULL THEN 'P' ELSE NULL END AS primary_or_secondary_dp1,
      jsonb_build_object(
        'source_table',
        'public.kyc_master_details',
        'field_mapping',
        jsonb_build_object(
          'application_id', 'kyc_master_details.id (stored on bse_data.unique_id)',
          'pan_no', 'kyc_master_details.pan_number',
          'client_name / first_name / middle_name / last_name', 'split from COALESCE(itr_name, digilocker_name)',
          'date_of_birth', 'COALESCE(dob, provider_dob, digilocker_dob) -> DD/MM/YYYY (assumed format, not confirmed against a BSE spec)',
          'address1', 'COALESCE(address_1, aadhaar_address, digilocker_address)',
          'address2', 'kyc_master_details.address_2',
          'city / state / pincode', 'COALESCE(city, digilocker_city) / COALESCE(state, digilocker_state) / COALESCE(pincode, digilocker_pincode)',
          'per_country / per_state / per_city / per_pincode', 'mirrors the correspondence address (permn_equal_corp = Y) — the KYC app only captures one address',
          'aadhaar_card_no', 'kyc_master_details.aadhaar_number when fully numeric, else digilocker_aadhaar_number_masked',
          'email', 'kyc_master_details.email',
          'mobile_number', 'kyc_master_details.mobile_number',
          'political_ex_person', 'kyc_master_details.politically_exposed -> Y/N',
          'is_poa / poa_for_fund / poa_for_security', 'kyc_master_details.ddpi -> Y/N (DDPI is treated as covering both funds and securities)',
          'opted_for_nomination', 'derived from nominee_name_1/2/3 presence',
          'depository_name1', 'CDSL when kyc_master_details.boid is present',
          'demat_id1 / beneficial_own_acnt_no1', 'kyc_master_details.boid',
          'depository_participant1', 'fixed: AIONION CAPITAL MARKET SERVICES PRIVATE LIMITED, when boid is present',
          'bank_name1 / account_no1 / bank_branch_ifsc_code1', 'kyc_master_details.bank_name / bank_account_number / bank_ifsc_code',
          'income', 'kyc_master_details.annual_income (raw text — exact BSE income-band code needs business confirmation)',
          'net_worth', 'kyc_master_details.net_worth',
          'client_code', 'kyc_master_details.client_code',
          'category', 'kyc_master_details.category (raw text — exact BSE category code needs business confirmation)',
          'is_active', 'hardcoded Y (a completed/eSigned application)',
          'whether_corporate', 'hardcoded N (this KYC app is Individuals Only)'
        ),
        'not_applicable_fields',
        ARRAY[
          'number_of_directors, director_details, cin_no, partners_kartauid, partners_coparceneruid, registration_no, registering_authority, date_of_registration, place_of_registration — corporate/HUF/partnership only, this app is Individuals Only',
          'contact_person_name1/2 and related fields, cust_* fields — authorised-person/corporate-contact only',
          'depository_name2..5, demat_id2..5, depository_participant2..3, beneficial_own_acnt_no2..5, bank_name2..5, account_no2..5, bank_branch_ifsc_code2..5, primary_or_secondary_bank2..5, primary_or_secondary_dp2..5 — the KYC app only ever captures one bank account and one demat account',
          'eq_cpcode, eqcmid, fnocpcode, fnocmid, currency_cpcode, currency_cmid, cash, equity_derivative, slb, currency, debt, commderivatives, enrollment_number — trading-segment participant codes with no KYC-app source',
          'client_aggrement_date, update_reason, server_ip, batuser, egr, client_name_description, opted_for_upi, std_code, phone_no, date_of_poa_for_fund, date_of_poa_for_security, income_date, net_worth_date — not captured anywhere in current KYC tables'
        ],
        'todo_fields',
        ARRAY[
          'transaction_code_default_assumed_N_for_new_registration_needs_business_confirmation',
          'client_type_default_assumed_I_for_individual_needs_business_confirmation',
          'status_has_no_default_and_no_kyc_app_source_supply_via_override',
          'type_of_service_has_no_default_and_no_kyc_app_source_supply_via_override',
          'contact_details_has_no_default_and_no_kyc_app_source_supply_via_override',
          'provide_details_has_no_default_and_no_kyc_app_source_supply_via_override',
          'category_and_income_are_raw_kyc_app_text_not_mapped_to_confirmed_bse_codes'
        ]
      ) AS request_payload
    FROM source_row
  )
`;

export const getBseSourceByApplicationIdQuery = `
  ${buildBsePreparedCte()}
  SELECT *
  FROM prepared_row
  WHERE application_id = $1;
`;

export const checkBseApplicationIdUniqueIndexQuery = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'bse_data'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'unique_id'
  ) AS has_unique_application_id;
`;

export const upsertBseDataByApplicationIdQuery = `
  ${buildBsePreparedCte()}
  INSERT INTO public.bse_data (
    unique_id,
    transaction_code,
    client_type,
    status,
    category,
    client_code,
    pan_no,
    political_ex_person,
    address1,
    permn_equal_corp,
    address2,
    country,
    state,
    city,
    pincode,
    type_of_service,
    contact_details,
    email,
    mobile_number,
    depository_name1,
    demat_id1,
    depository_participant1,
    bank_name1,
    account_no1,
    provide_details,
    income,
    net_worth,
    is_active,
    first_name,
    middle_name,
    last_name,
    aadhaar_card_no,
    date_of_birth,
    client_name,
    whether_corporate,
    is_poa,
    poa_for_fund,
    poa_for_security,
    per_country,
    per_state,
    per_city,
    per_pincode,
    opted_for_nomination,
    beneficial_own_acnt_no1,
    bank_branch_ifsc_code1,
    primary_or_secondary_bank1,
    primary_or_secondary_dp1,
    request_payload,
    updated_at
  )
  SELECT
    shared_unique_id_text::bigint,
    transaction_code,
    client_type,
    status,
    category,
    client_code,
    pan_no,
    political_ex_person,
    address1,
    permn_equal_corp,
    address2,
    country,
    state,
    city,
    pincode,
    type_of_service,
    contact_details,
    email,
    mobile_number,
    depository_name1,
    demat_id1,
    depository_participant1,
    bank_name1,
    account_no1,
    provide_details,
    income,
    net_worth,
    is_active,
    first_name,
    middle_name,
    last_name,
    aadhaar_card_no,
    date_of_birth,
    client_name,
    whether_corporate,
    is_poa,
    poa_for_fund,
    poa_for_security,
    per_country,
    per_state,
    per_city,
    per_pincode,
    opted_for_nomination,
    beneficial_own_acnt_no1,
    bank_branch_ifsc_code1,
    primary_or_secondary_bank1,
    primary_or_secondary_dp1,
    request_payload,
    NOW()
  FROM prepared_row
  WHERE application_id = $1
  ON CONFLICT (unique_id) DO UPDATE SET
    transaction_code = EXCLUDED.transaction_code,
    client_type = EXCLUDED.client_type,
    status = EXCLUDED.status,
    category = EXCLUDED.category,
    client_code = EXCLUDED.client_code,
    pan_no = EXCLUDED.pan_no,
    political_ex_person = EXCLUDED.political_ex_person,
    address1 = EXCLUDED.address1,
    permn_equal_corp = EXCLUDED.permn_equal_corp,
    address2 = EXCLUDED.address2,
    country = EXCLUDED.country,
    state = EXCLUDED.state,
    city = EXCLUDED.city,
    pincode = EXCLUDED.pincode,
    type_of_service = EXCLUDED.type_of_service,
    contact_details = EXCLUDED.contact_details,
    email = EXCLUDED.email,
    mobile_number = EXCLUDED.mobile_number,
    depository_name1 = EXCLUDED.depository_name1,
    demat_id1 = EXCLUDED.demat_id1,
    depository_participant1 = EXCLUDED.depository_participant1,
    bank_name1 = EXCLUDED.bank_name1,
    account_no1 = EXCLUDED.account_no1,
    provide_details = EXCLUDED.provide_details,
    income = EXCLUDED.income,
    net_worth = EXCLUDED.net_worth,
    is_active = EXCLUDED.is_active,
    first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name,
    last_name = EXCLUDED.last_name,
    aadhaar_card_no = EXCLUDED.aadhaar_card_no,
    date_of_birth = EXCLUDED.date_of_birth,
    client_name = EXCLUDED.client_name,
    whether_corporate = EXCLUDED.whether_corporate,
    is_poa = EXCLUDED.is_poa,
    poa_for_fund = EXCLUDED.poa_for_fund,
    poa_for_security = EXCLUDED.poa_for_security,
    per_country = EXCLUDED.per_country,
    per_state = EXCLUDED.per_state,
    per_city = EXCLUDED.per_city,
    per_pincode = EXCLUDED.per_pincode,
    opted_for_nomination = EXCLUDED.opted_for_nomination,
    beneficial_own_acnt_no1 = EXCLUDED.beneficial_own_acnt_no1,
    bank_branch_ifsc_code1 = EXCLUDED.bank_branch_ifsc_code1,
    primary_or_secondary_bank1 = EXCLUDED.primary_or_secondary_bank1,
    primary_or_secondary_dp1 = EXCLUDED.primary_or_secondary_dp1,
    request_payload = EXCLUDED.request_payload,
    updated_at = NOW()
  RETURNING id, unique_id AS application_id;
`;
