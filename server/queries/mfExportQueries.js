/**
 * MF (BSE STAR MF UCC) EXPORT - source directly from kyc_master_details.
 *
 * One fix was needed against the reference this was adapted from:
 * kyc_master_details has no plain "gender" column, only kra_gender /
 * digilocker_gender (same gap already fixed in the other four exports).
 *
 * mf_data.unique_id is bigint (like cvlkra_data/cdsl_data/nse_data/bse_data)
 * and stores kyc_master_details.unique_id (cast to bigint) — the same link
 * token shared across all five export tables — not kyc_master_details.id.
 */

const buildMfStateCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(${fieldName}) IN ('ANDAMAN & NICOBAR', 'ANDAMAN & NICOBAR ISLANDS', 'ANDAMAN AND NICOBAR ISLANDS') THEN 'AN'
    WHEN UPPER(${fieldName}) = 'ARUNACHAL PRADESH' THEN 'AR'
    WHEN UPPER(${fieldName}) = 'ANDHRA PRADESH' THEN 'AP'
    WHEN UPPER(${fieldName}) = 'ASSAM' THEN 'AS'
    WHEN UPPER(${fieldName}) = 'BIHAR' THEN 'BH'
    WHEN UPPER(${fieldName}) = 'CHANDIGARH' THEN 'CH'
    WHEN UPPER(${fieldName}) = 'CHHATTISGARH' THEN 'CG'
    WHEN UPPER(${fieldName}) = 'GOA' THEN 'GO'
    WHEN UPPER(${fieldName}) = 'GUJARAT' THEN 'GU'
    WHEN UPPER(${fieldName}) = 'HARYANA' THEN 'HA'
    WHEN UPPER(${fieldName}) = 'HIMACHAL PRADESH' THEN 'HP'
    WHEN UPPER(${fieldName}) IN ('JAMMU & KASHMIR', 'JAMMU AND KASHMIR') THEN 'JM'
    WHEN UPPER(${fieldName}) = 'JHARKHAND' THEN 'JK'
    WHEN UPPER(${fieldName}) = 'KARNATAKA' THEN 'KA'
    WHEN UPPER(${fieldName}) = 'KERALA' THEN 'KE'
    WHEN UPPER(${fieldName}) = 'MADHYA PRADESH' THEN 'MP'
    WHEN UPPER(${fieldName}) = 'MAHARASHTRA' THEN 'MA'
    WHEN UPPER(${fieldName}) = 'MANIPUR' THEN 'MN'
    WHEN UPPER(${fieldName}) = 'MEGHALAYA' THEN 'ME'
    WHEN UPPER(${fieldName}) = 'MIZORAM' THEN 'MI'
    WHEN UPPER(${fieldName}) = 'NAGALAND' THEN 'NA'
    WHEN UPPER(${fieldName}) IN ('NEW DELHI', 'DELHI') THEN 'ND'
    WHEN UPPER(${fieldName}) IN ('ODISHA', 'ORISSA') THEN 'OR'
    WHEN UPPER(${fieldName}) IN ('PONDICHERRY', 'PUDUCHERRY') THEN 'PO'
    WHEN UPPER(${fieldName}) = 'PUNJAB' THEN 'PU'
    WHEN UPPER(${fieldName}) = 'RAJASTHAN' THEN 'RA'
    WHEN UPPER(${fieldName}) = 'SIKKIM' THEN 'SK'
    WHEN UPPER(${fieldName}) = 'TAMIL NADU' THEN 'TN'
    WHEN UPPER(${fieldName}) = 'TELANGANA' THEN 'TL'
    WHEN UPPER(${fieldName}) = 'TRIPURA' THEN 'TR'
    WHEN UPPER(${fieldName}) = 'UTTAR PRADESH' THEN 'UP'
    WHEN UPPER(${fieldName}) IN ('UTTARAKHAND', 'UTTARANCHAL') THEN 'UT'
    WHEN UPPER(${fieldName}) = 'WEST BENGAL' THEN 'WB'
    WHEN ${fieldName} IS NOT NULL AND LENGTH(${fieldName}) <= 2 THEN UPPER(${fieldName})
    ELSE NULL
  END
`;

const buildMfOccupationCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) = 'BUSINESS' THEN '01'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('PRIVATE SECTOR', 'PUBLIC SECTOR', 'GOVERNMENT SERVICE', 'GOVT SERVICE', 'GOVERNMENT', 'SERVICE') THEN '02'
    WHEN UPPER(COALESCE(${fieldName}, '')) = 'PROFESSIONAL' THEN '03'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('AGRICULTURIST', 'AGRICULTURE', 'FARMER') THEN '04'
    WHEN UPPER(COALESCE(${fieldName}, '')) = 'RETIRED' THEN '05'
    WHEN UPPER(COALESCE(${fieldName}, '')) = 'HOUSEWIFE' THEN '06'
    WHEN UPPER(COALESCE(${fieldName}, '')) = 'STUDENT' THEN '07'
    WHEN ${fieldName} IS NOT NULL THEN '08'
    ELSE NULL
  END
`;

const buildMfAccountTypeCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('SAVINGS', 'SAVING', 'SB') THEN 'SB'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('CURRENT', 'CB') THEN 'CB'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('NRE', 'NE') THEN 'NE'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('NRO', 'NO') THEN 'NO'
    ELSE NULL
  END
`;

const buildMfSourceCte = () => `
  WITH latest_client_code AS (
    SELECT
      cc.client_code
    FROM public.kyc_master_details cc
    CROSS JOIN (SELECT id, email, pan_number FROM public.kyc_master_details WHERE id = $1) me
    WHERE cc.client_code IS NOT NULL
      AND cc.id <> $1::bigint
      AND cc.email = me.email
      AND cc.pan_number = me.pan_number
    ORDER BY cc.updated_at DESC NULLS LAST, cc.id DESC
    LIMIT 1
  ),
  source_row AS (
    SELECT
      km.id AS application_id,
      -- The link token (kyc_master_details.unique_id) is what actually goes
      -- into mf_data.unique_id — kept as text here so the service can
      -- validate it's numeric before the INSERT ever casts it to bigint.
      NULLIF(BTRIM(km.unique_id), '') AS source_unique_id_text,
      COALESCE(NULLIF(BTRIM(km.client_code), ''), lcc.client_code) AS source_client_code,
      NULLIF(BTRIM(COALESCE(km.itr_name, km.digilocker_name)), '') AS source_full_name,
      NULLIF(BTRIM(km.category), '') AS source_category,
      -- kyc_master_details has no plain "gender" column — kra_gender /
      -- digilocker_gender are the route-specific columns that actually exist.
      NULLIF(BTRIM(COALESCE(km.kra_gender, km.digilocker_gender)), '') AS source_gender,
      COALESCE(km.dob, km.provider_dob, km.digilocker_dob) AS source_dob,
      NULLIF(BTRIM(km.occupation), '') AS source_occupation,
      NULLIF(BTRIM(km.pan_number), '') AS source_pan_number,
      NULLIF(BTRIM(km.bank_account_number), '') AS source_account_number,
      NULLIF(BTRIM(km.bank_ifsc_code), '') AS source_ifsc_code,
      NULLIF(BTRIM(km.bank_account_type), '') AS source_account_type,
      NULLIF(BTRIM(km.bank_name), '') AS source_bank_name,
      NULLIF(BTRIM(COALESCE(km.address_1, km.aadhaar_address, km.digilocker_address)), '') AS source_address_text,
      NULLIF(BTRIM(COALESCE(km.city, km.digilocker_city)), '') AS source_city,
      NULLIF(BTRIM(COALESCE(km.state, km.digilocker_state)), '') AS source_state,
      NULLIF(BTRIM(COALESCE(km.pincode, km.digilocker_pincode)), '') AS source_pincode,
      NULLIF(BTRIM(km.email), '') AS source_email,
      NULLIF(BTRIM(km.mobile_number), '') AS source_mobile_number,
      NULLIF(BTRIM(COALESCE(km.provider, km.digilocker_provider)), '') AS source_identity_provider,
      NULLIF(BTRIM(km.country_of_birth), '') AS source_country_of_birth,
      NULLIF(BTRIM(km.citizen_of_india::text), '') AS source_citizen_of_india,
      (
        (km.nominee_name_1 IS NOT NULL AND BTRIM(km.nominee_name_1) <> '')::int +
        (km.nominee_name_2 IS NOT NULL AND BTRIM(km.nominee_name_2) <> '')::int +
        (km.nominee_name_3 IS NOT NULL AND BTRIM(km.nominee_name_3) <> '')::int
      ) AS source_nominee_count,
      NULLIF(BTRIM(km.nominee_name_1), '') AS nominee_1_name,
      NULLIF(BTRIM(km.nominee_relation_1), '') AS nominee_1_relation,
      km.nominee_dob_1 AS nominee_1_dob,
      km.nominee_allocation_percentage_1 AS nominee_1_allocation_percentage,
      NULLIF(BTRIM(km.nominee_name_2), '') AS nominee_2_name,
      NULLIF(BTRIM(km.nominee_relation_2), '') AS nominee_2_relation,
      km.nominee_dob_2 AS nominee_2_dob,
      km.nominee_allocation_percentage_2 AS nominee_2_allocation_percentage,
      NULLIF(BTRIM(km.nominee_name_3), '') AS nominee_3_name,
      NULLIF(BTRIM(km.nominee_relation_3), '') AS nominee_3_relation,
      km.nominee_dob_3 AS nominee_3_dob,
      km.nominee_allocation_percentage_3 AS nominee_3_allocation_percentage,
      NULLIF(BTRIM(km.guardian_name), '')     AS guardian_name,
      NULLIF(BTRIM(km.guardian_relation), '') AS guardian_relation,
      NULLIF(BTRIM(km.guardian_mobile), '')   AS guardian_mobile,
      NULLIF(BTRIM(km.guardian_address), '')  AS guardian_address
    FROM public.kyc_master_details km
    LEFT JOIN latest_client_code lcc
      ON TRUE
    WHERE km.id = $1
  ),
  prepared_row AS (
    SELECT
      source_row.application_id,
      source_row.source_unique_id_text AS shared_unique_id_text,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.mf_data existing_mf
          WHERE existing_mf.unique_id = (CASE WHEN source_row.source_unique_id_text ~ '^[0-9]+$' THEN source_row.source_unique_id_text::bigint ELSE NULL END)
        )
        THEN 'MOD'
        ELSE 'NEW'
      END AS regn_type,
      source_row.source_client_code AS client_code,
      NULLIF(SPLIT_PART(source_row.source_full_name, ' ', 1), '') AS primary_holder_first_name,
      NULLIF(
        BTRIM(
          REGEXP_REPLACE(
            source_row.source_full_name,
            '^[^ ]+\\s*|\\s*[^ ]+$',
            '',
            'g'
          )
        ),
        ''
      ) AS primary_holder_middle_name,
      NULLIF(
        CASE
          WHEN POSITION(' ' IN source_row.source_full_name) > 0
          THEN REGEXP_REPLACE(source_row.source_full_name, '^.*\\s', '')
          ELSE NULL
        END,
        ''
      ) AS primary_holder_last_name,
      -- kyc_master_details.category is never actually populated anywhere in
      -- this individual-only onboarding flow (the KYC form itself is
      -- literally titled "For Individuals Only") - treat NULL the same as
      -- an explicit individual/person category instead of silently
      -- dropping tax_status, matching the same always-individual default
      -- bseExportQueries.js already uses for its category field.
      CASE
        WHEN source_row.source_category IS NULL
          OR UPPER(source_row.source_category) LIKE '%INDIVIDUAL%'
          OR UPPER(source_row.source_category) LIKE '%PERSON%'
        THEN '01'
        ELSE NULL
      END AS tax_status,
      CASE
        WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('MALE', 'M') THEN 'M'
        WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('FEMALE', 'F') THEN 'F'
        WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('OTHER', 'O', 'TRANSGENDER', 'T', 'THIRD GENDER') THEN 'O'
        ELSE NULL
      END AS gender,
      TO_CHAR(source_row.source_dob, 'DD/MM/YYYY') AS primary_holder_dob,
      ${buildMfOccupationCodeCase("source_row.source_occupation")} AS occupation_code,
      'SI' AS holding_nature,
      CASE
        WHEN source_row.source_pan_number IS NOT NULL THEN 'N'
        ELSE NULL
      END AS primary_holder_pan_exempt,
      source_row.source_pan_number AS primary_holder_pan,
      -- TODO: Phase 1 MF export is limited to physical UCC creation until business confirms demat-specific MF flow.
      'P' AS client_type,
      ${buildMfAccountTypeCase("source_row.source_account_type")} AS account_type_1,
      source_row.source_account_number AS account_no_1,
      source_row.source_ifsc_code AS ifsc_code_1,
      'Y' AS default_bank_flag_1,
      NULLIF($2, '') AS div_pay_mode,
      NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 1 FOR 40)), '') AS address_1,
      NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 41 FOR 40)), '') AS address_2,
      NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 81 FOR 40)), '') AS address_3,
      source_row.source_city AS city,
      ${buildMfStateCodeCase("source_row.source_state")} AS state,
      source_row.source_pincode AS pincode,
      CASE
        WHEN source_row.source_address_text IS NOT NULL THEN 'INDIA'
        ELSE NULL
      END AS country,
      source_row.source_email AS email,
      NULLIF($3, '') AS communication_mode,
      source_row.source_mobile_number AS indian_mobile_no,
      source_row.nominee_1_name,
      source_row.nominee_1_relation,
      source_row.nominee_1_allocation_percentage,
      source_row.nominee_2_name,
      source_row.nominee_2_relation,
      source_row.nominee_2_allocation_percentage,
      source_row.nominee_3_name,
      source_row.nominee_3_relation,
      source_row.nominee_3_allocation_percentage,
      CASE
        WHEN source_row.source_identity_provider IS NOT NULL THEN 'K'
        ELSE NULL
      END AS primary_holder_kyc_type,
      NULLIF($4, '') AS paperless_flag,
      NULLIF($5, '') AS mobile_declaration_flag,
      NULLIF($6, '') AS email_declaration_flag,
      source_row.source_nominee_count,
      CASE
        WHEN source_row.nominee_1_dob IS NOT NULL
          AND AGE(CURRENT_DATE, source_row.nominee_1_dob) < INTERVAL '18 years'
        THEN 'Y'
        WHEN source_row.nominee_1_dob IS NOT NULL
        THEN 'N'
        ELSE NULL
      END AS nominee_1_minor_flag,
      CASE
        WHEN source_row.nominee_2_dob IS NOT NULL
          AND AGE(CURRENT_DATE, source_row.nominee_2_dob) < INTERVAL '18 years'
        THEN 'Y'
        WHEN source_row.nominee_2_dob IS NOT NULL
        THEN 'N'
        ELSE NULL
      END AS nominee_2_minor_flag,
      CASE
        WHEN source_row.nominee_3_dob IS NOT NULL
          AND AGE(CURRENT_DATE, source_row.nominee_3_dob) < INTERVAL '18 years'
        THEN 'Y'
        WHEN source_row.nominee_3_dob IS NOT NULL
        THEN 'N'
        ELSE NULL
      END AS nominee_3_minor_flag,
      CASE
        WHEN (
          (source_row.nominee_1_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_1_dob) < INTERVAL '18 years')
          OR (source_row.nominee_2_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_2_dob) < INTERVAL '18 years')
          OR (source_row.nominee_3_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_3_dob) < INTERVAL '18 years')
        )
        -- guardian is captured on the KYC app; a "gap" only remains if it's still missing
        AND (source_row.guardian_name IS NULL OR source_row.guardian_relation IS NULL)
        THEN 'Y'
        ELSE 'N'
      END AS source_has_minor_nominee_guardian_gap,
      'N' AS source_has_joint_holder_data_gap,
      CASE
        WHEN (
          (source_row.source_category IS NULL
            OR UPPER(source_row.source_category) LIKE '%INDIVIDUAL%'
            OR UPPER(source_row.source_category) LIKE '%PERSON%')
          AND source_row.source_dob IS NOT NULL
          AND source_row.source_pan_number IS NOT NULL
          AND source_row.source_account_number IS NOT NULL
          AND source_row.source_ifsc_code IS NOT NULL
          AND source_row.source_email IS NOT NULL
          AND source_row.source_mobile_number IS NOT NULL
          AND source_row.source_address_text IS NOT NULL
          AND source_row.source_city IS NOT NULL
          AND source_row.source_state IS NOT NULL
          AND source_row.source_pincode IS NOT NULL
        )
        THEN TRUE
        ELSE FALSE
      END AS source_supports_phase_1,
      array_to_string(
        ARRAY[
          COALESCE(source_row.source_client_code, ''),
          COALESCE(NULLIF(SPLIT_PART(source_row.source_full_name, ' ', 1), ''), ''),
          COALESCE(
            NULLIF(
              BTRIM(
                REGEXP_REPLACE(
                  source_row.source_full_name,
                  '^[^ ]+\\s*|\\s*[^ ]+$',
                  '',
                  'g'
                )
              ),
              ''
            ),
            ''
          ),
          COALESCE(
            NULLIF(
              CASE
                WHEN POSITION(' ' IN source_row.source_full_name) > 0
                THEN REGEXP_REPLACE(source_row.source_full_name, '^.*\\s', '')
                ELSE NULL
              END,
              ''
            ),
            ''
          ),
          COALESCE(
            CASE
              WHEN source_row.source_category IS NULL
                OR UPPER(source_row.source_category) LIKE '%INDIVIDUAL%'
                OR UPPER(source_row.source_category) LIKE '%PERSON%'
              THEN '01'
              ELSE NULL
            END,
            ''
          ),
          COALESCE(
            CASE
              WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('MALE', 'M') THEN 'M'
              WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('FEMALE', 'F') THEN 'F'
              WHEN UPPER(COALESCE(source_row.source_gender, '')) IN ('OTHER', 'O', 'TRANSGENDER', 'T', 'THIRD GENDER') THEN 'O'
              ELSE NULL
            END,
            ''
          ),
          COALESCE(TO_CHAR(source_row.source_dob, 'DD/MM/YYYY'), ''),
          COALESCE(${buildMfOccupationCodeCase("source_row.source_occupation")}, ''),
          'SI',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          COALESCE(CASE WHEN source_row.source_pan_number IS NOT NULL THEN 'N' ELSE NULL END, ''),
          '',
          '',
          '',
          COALESCE(source_row.source_pan_number, ''),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'P',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          COALESCE(${buildMfAccountTypeCase("source_row.source_account_type")}, ''),
          COALESCE(source_row.source_account_number, ''),
          '',
          COALESCE(source_row.source_ifsc_code, ''),
          'Y',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          NULLIF(BTRIM(source_row.source_bank_name), ''),
          COALESCE(NULLIF($2, ''), ''),
          COALESCE(NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 1 FOR 40)), ''), ''),
          COALESCE(NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 41 FOR 40)), ''), ''),
          COALESCE(NULLIF(BTRIM(SUBSTRING(COALESCE(source_row.source_address_text, '') FROM 81 FOR 40)), ''), ''),
          COALESCE(source_row.source_city, ''),
          COALESCE(${buildMfStateCodeCase("source_row.source_state")}, ''),
          COALESCE(source_row.source_pincode, ''),
          COALESCE(CASE WHEN source_row.source_address_text IS NOT NULL THEN 'INDIA' ELSE NULL END, ''),
          '',
          '',
          '',
          '',
          COALESCE(source_row.source_email, ''),
          COALESCE(NULLIF($3, ''), ''),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          COALESCE(source_row.source_mobile_number, ''),
          COALESCE(source_row.nominee_1_name, ''),
          COALESCE(source_row.nominee_1_relation, ''),
          COALESCE(source_row.nominee_1_allocation_percentage::text, ''),
          COALESCE(
            CASE
              WHEN source_row.nominee_1_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_1_dob) < INTERVAL '18 years' THEN 'Y'
              WHEN source_row.nominee_1_dob IS NOT NULL THEN 'N'
              ELSE NULL
            END,
            ''
          ),
          COALESCE(TO_CHAR(source_row.nominee_1_dob, 'DD/MM/YYYY'), ''),
          '',
          COALESCE(source_row.nominee_2_name, ''),
          COALESCE(source_row.nominee_2_relation, ''),
          COALESCE(source_row.nominee_2_allocation_percentage::text, ''),
          COALESCE(TO_CHAR(source_row.nominee_2_dob, 'DD/MM/YYYY'), ''),
          COALESCE(
            CASE
              WHEN source_row.nominee_2_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_2_dob) < INTERVAL '18 years' THEN 'Y'
              WHEN source_row.nominee_2_dob IS NOT NULL THEN 'N'
              ELSE NULL
            END,
            ''
          ),
          '',
          COALESCE(source_row.nominee_3_name, ''),
          COALESCE(source_row.nominee_3_relation, ''),
          COALESCE(source_row.nominee_3_allocation_percentage::text, ''),
          COALESCE(TO_CHAR(source_row.nominee_3_dob, 'DD/MM/YYYY'), ''),
          COALESCE(
            CASE
              WHEN source_row.nominee_3_dob IS NOT NULL AND AGE(CURRENT_DATE, source_row.nominee_3_dob) < INTERVAL '18 years' THEN 'Y'
              WHEN source_row.nominee_3_dob IS NOT NULL THEN 'N'
              ELSE NULL
            END,
            ''
          ),
          '',
          COALESCE(CASE WHEN source_row.source_identity_provider IS NOT NULL THEN 'K' ELSE NULL END, ''),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          COALESCE(NULLIF($4, ''), ''),
          '',
          '',
          COALESCE(NULLIF($5, ''), ''),
          COALESCE(NULLIF($6, ''), ''),
          ''
        ],
        '|',
        ''
      ) AS param_payload,
      jsonb_build_object(
        'source_table',
        'public.kyc_master_details',
        'phase', 'phase_1_single_holder_resident_only',
        'field_mapping',
        jsonb_build_object(
          'application_id', 'kyc_master_details.id (stored on mf_data.unique_id)',
          'client_code', 'kyc_master_details.client_code',
          'primary_holder_first_name', 'split from kyc_master_details.itr_name',
          'primary_holder_middle_name', 'split from kyc_master_details.itr_name',
          'primary_holder_last_name', 'split from kyc_master_details.itr_name',
          'tax_status', 'kyc_master_details.category -> 01 for individual/person only',
          'gender', 'COALESCE(kra_gender, digilocker_gender) -> M/F/O',
          'primary_holder_dob', 'COALESCE(dob, provider_dob, digilocker_dob) -> DD/MM/YYYY',
          'occupation_code', 'kyc_master_details.occupation -> MF occupation code',
          'holding_nature', 'fixed SI for Phase 1',
          'primary_holder_pan', 'kyc_master_details.pan_number',
          'client_type', 'fixed P for Phase 1 physical UCC export',
          'account_type_1', 'kyc_master_details.bank_account_type -> SB/CB/NE/NO',
          'account_no_1', 'kyc_master_details.bank_account_number',
          'ifsc_code_1', 'kyc_master_details.bank_ifsc_code',
          'div_pay_mode', 'request.body.div_pay_mode',
          'address_1_to_3', 'COALESCE(address_1, aadhaar_address, digilocker_address) split into 40-char chunks',
          'city', 'COALESCE(city, digilocker_city)',
          'state', 'COALESCE(state, digilocker_state) -> MF state code',
          'pincode', 'COALESCE(pincode, digilocker_pincode)',
          'country', 'fixed INDIA for resident Phase 1',
          'email', 'kyc_master_details.email',
          'communication_mode', 'request.body.communication_mode',
          'indian_mobile_no', 'kyc_master_details.mobile_number',
          'nominees', 'kyc_master_details.nominee_name_1/2/3 slots',
          'primary_holder_kyc_type', 'fixed K when identity provider is known',
          'paperless_flag', 'request.body.paperless_flag',
          'mobile_declaration_flag', 'request.body.mobile_declaration_flag',
          'email_declaration_flag', 'request.body.email_declaration_flag'
        ),
        'todo_fields',
        ARRAY[
          'joint_holder_fields',
          'pan_exempt_flows',
          'demat_client_type_flow',
          'foreign_address_fields',
          'multi_bank_account_fields_2_to_5',
          'ckyc_numbers',
          'kra_exempt_reference_numbers',
          'aadhaar_updated',
          'mapin_id',
          'lei_fields'
        ]
      ) AS request_payload
    FROM source_row
  )
`;

export const getMfSourceByApplicationIdQuery = `
  ${buildMfSourceCte()}
  SELECT *
  FROM prepared_row
  WHERE application_id = $1;
`;

export const checkMfApplicationIdUniqueIndexQuery = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'mf_data'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'unique_id'
  ) AS has_unique_application_id;
`;

export const upsertMfDataByApplicationIdQuery = `
  ${buildMfSourceCte()}
  INSERT INTO public.mf_data (
    unique_id,
    regn_type,
    client_code,
    primary_holder_first_name,
    primary_holder_middle_name,
    primary_holder_last_name,
    tax_status,
    gender,
    primary_holder_dob,
    occupation_code,
    holding_nature,
    primary_holder_pan_exempt,
    primary_holder_pan,
    client_type,
    account_type_1,
    account_no_1,
    ifsc_code_1,
    default_bank_flag_1,
    div_pay_mode,
    address_1,
    address_2,
    address_3,
    city,
    state,
    pincode,
    country,
    email,
    communication_mode,
    indian_mobile_no,
    nominee_1_name,
    nominee_1_relation,
    nominee_1_allocation_percentage,
    nominee_2_name,
    nominee_2_relation,
    nominee_2_allocation_percentage,
    nominee_3_name,
    nominee_3_relation,
    nominee_3_allocation_percentage,
    primary_holder_kyc_type,
    paperless_flag,
    mobile_declaration_flag,
    email_declaration_flag,
    param_payload,
    request_payload,
    updated_at
  )
  SELECT
    shared_unique_id_text::bigint,
    regn_type,
    client_code,
    primary_holder_first_name,
    primary_holder_middle_name,
    primary_holder_last_name,
    tax_status,
    gender,
    primary_holder_dob,
    occupation_code,
    holding_nature,
    primary_holder_pan_exempt,
    primary_holder_pan,
    client_type,
    account_type_1,
    account_no_1,
    ifsc_code_1,
    default_bank_flag_1,
    div_pay_mode,
    address_1,
    address_2,
    address_3,
    city,
    state,
    pincode,
    country,
    email,
    communication_mode,
    indian_mobile_no,
    nominee_1_name,
    nominee_1_relation,
    nominee_1_allocation_percentage,
    nominee_2_name,
    nominee_2_relation,
    nominee_2_allocation_percentage,
    nominee_3_name,
    nominee_3_relation,
    nominee_3_allocation_percentage,
    primary_holder_kyc_type,
    paperless_flag,
    mobile_declaration_flag,
    email_declaration_flag,
    param_payload,
    request_payload,
    NOW()
  FROM prepared_row
  WHERE application_id = $1
  ON CONFLICT (unique_id) DO UPDATE SET
    regn_type = EXCLUDED.regn_type,
    client_code = EXCLUDED.client_code,
    primary_holder_first_name = EXCLUDED.primary_holder_first_name,
    primary_holder_middle_name = EXCLUDED.primary_holder_middle_name,
    primary_holder_last_name = EXCLUDED.primary_holder_last_name,
    tax_status = EXCLUDED.tax_status,
    gender = EXCLUDED.gender,
    primary_holder_dob = EXCLUDED.primary_holder_dob,
    occupation_code = EXCLUDED.occupation_code,
    holding_nature = EXCLUDED.holding_nature,
    primary_holder_pan_exempt = EXCLUDED.primary_holder_pan_exempt,
    primary_holder_pan = EXCLUDED.primary_holder_pan,
    client_type = EXCLUDED.client_type,
    account_type_1 = EXCLUDED.account_type_1,
    account_no_1 = EXCLUDED.account_no_1,
    ifsc_code_1 = EXCLUDED.ifsc_code_1,
    default_bank_flag_1 = EXCLUDED.default_bank_flag_1,
    div_pay_mode = EXCLUDED.div_pay_mode,
    address_1 = EXCLUDED.address_1,
    address_2 = EXCLUDED.address_2,
    address_3 = EXCLUDED.address_3,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    pincode = EXCLUDED.pincode,
    country = EXCLUDED.country,
    email = EXCLUDED.email,
    communication_mode = EXCLUDED.communication_mode,
    indian_mobile_no = EXCLUDED.indian_mobile_no,
    nominee_1_name = EXCLUDED.nominee_1_name,
    nominee_1_relation = EXCLUDED.nominee_1_relation,
    nominee_1_allocation_percentage = EXCLUDED.nominee_1_allocation_percentage,
    nominee_2_name = EXCLUDED.nominee_2_name,
    nominee_2_relation = EXCLUDED.nominee_2_relation,
    nominee_2_allocation_percentage = EXCLUDED.nominee_2_allocation_percentage,
    nominee_3_name = EXCLUDED.nominee_3_name,
    nominee_3_relation = EXCLUDED.nominee_3_relation,
    nominee_3_allocation_percentage = EXCLUDED.nominee_3_allocation_percentage,
    primary_holder_kyc_type = EXCLUDED.primary_holder_kyc_type,
    paperless_flag = EXCLUDED.paperless_flag,
    mobile_declaration_flag = EXCLUDED.mobile_declaration_flag,
    email_declaration_flag = EXCLUDED.email_declaration_flag,
    param_payload = EXCLUDED.param_payload,
    request_payload = EXCLUDED.request_payload,
    updated_at = NOW()
  RETURNING id, unique_id AS application_id;
`;
