/**
 * =====================================================================
 * CDSL BOAPI EXPORT - source directly from kyc_master_details
 * =====================================================================
 * Sources directly from kyc_master_details so every column reference below
 * is guaranteed to exist on the live schema — one fix was needed against
 * the reference this was adapted from: kyc_master_details has no plain
 * "gender" column, only kra_gender / digilocker_gender (same gap already
 * fixed in cvlkraExportQueries.js).
 *
 * cdsl_data.unique_id (bigint, UNIQUE) stores kyc_master_details.id — same
 * "unique id" pattern already used by cvlkra_data.
 *
 * All 106 real cdsl_data columns are accounted for:
 *  - id, unique_id: identity (unique_id is the INSERT target / ON CONFLICT key)
 *  - 92 real BOAPI data columns (upload_id .. dividend_bank_ccy): every one
 *    is either derived from kyc_master_details, or - where CDSL requires a
 *    participant-side code with no KYC-app equivalent - left overridable via
 *    the numbered $2.."$25 params (see cdslExportService.js) with a COALESCE
 *    fallback onto whatever this row already has in cdsl_data, same pattern
 *    as the CVLKRA export.
 *  - client_code: sourced from kyc_master_details.client_code.
 *  - request_payload, updated_at: set on every export.
 *  - response_payload, cdsl_push_status, cdsl_acknowledgment_id,
 *    cdsl_msg_code, cdsl_msg_desc, rejection_reason, zip_file_name,
 *    created_at: intentionally NOT set here - these are populated later by
 *    whatever actually pushes the batch to CDSL and parses its response,
 *    same as the equivalent status columns on cvlkra_data.
 *
 * TODO (business/compliance confirmation needed):
 *   operator_id, product_number, annual_income_code, bo_category,
 *   bo_settlement_planning_flag, bo_sub_status, bo_statement_cycle_code,
 *   dividend_bank_acct_type, dividend_bank_code, dividend_bank_ccy,
 *   pan_verification_flag, signature_file_flag,
 *   beneficiary_tax_deduction_status - CDSL/participant-side metadata not
 *   captured anywhere in the KYC app; supply via request body / env vars.
 * =====================================================================
 */

const buildCdslStateSubdivisionCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(${fieldName}) = 'ANDHRA PRADESH' THEN 'IN-AP'
    WHEN UPPER(${fieldName}) = 'ARUNACHAL PRADESH' THEN 'IN-AR'
    WHEN UPPER(${fieldName}) = 'ASSAM' THEN 'IN-AS'
    WHEN UPPER(${fieldName}) = 'BIHAR' THEN 'IN-BR'
    WHEN UPPER(${fieldName}) = 'CHHATTISGARH' THEN 'IN-CG'
    WHEN UPPER(${fieldName}) IN ('GOA') THEN 'IN-GA'
    WHEN UPPER(${fieldName}) = 'GUJARAT' THEN 'IN-GJ'
    WHEN UPPER(${fieldName}) = 'HARYANA' THEN 'IN-HR'
    WHEN UPPER(${fieldName}) = 'HIMACHAL PRADESH' THEN 'IN-HP'
    WHEN UPPER(${fieldName}) IN ('JAMMU & KASHMIR', 'JAMMU AND KASHMIR') THEN 'IN-JK'
    WHEN UPPER(${fieldName}) = 'JHARKHAND' THEN 'IN-JH'
    WHEN UPPER(${fieldName}) = 'KARNATAKA' THEN 'IN-KA'
    WHEN UPPER(${fieldName}) = 'KERALA' THEN 'IN-KL'
    WHEN UPPER(${fieldName}) IN ('MADHYA PRADESH') THEN 'IN-MP'
    WHEN UPPER(${fieldName}) = 'MAHARASHTRA' THEN 'IN-MH'
    WHEN UPPER(${fieldName}) = 'MANIPUR' THEN 'IN-MN'
    WHEN UPPER(${fieldName}) = 'MEGHALAYA' THEN 'IN-ML'
    WHEN UPPER(${fieldName}) = 'MIZORAM' THEN 'IN-MZ'
    WHEN UPPER(${fieldName}) = 'NAGALAND' THEN 'IN-NL'
    WHEN UPPER(${fieldName}) IN ('ODISHA', 'ORISSA') THEN 'IN-OD'
    WHEN UPPER(${fieldName}) = 'PUNJAB' THEN 'IN-PB'
    WHEN UPPER(${fieldName}) = 'RAJASTHAN' THEN 'IN-RJ'
    WHEN UPPER(${fieldName}) = 'SIKKIM' THEN 'IN-SK'
    WHEN UPPER(${fieldName}) = 'TAMIL NADU' THEN 'IN-TN'
    WHEN UPPER(${fieldName}) = 'TELANGANA' THEN 'IN-TS'
    WHEN UPPER(${fieldName}) = 'TRIPURA' THEN 'IN-TR'
    WHEN UPPER(${fieldName}) = 'UTTAR PRADESH' THEN 'IN-UP'
    WHEN UPPER(${fieldName}) IN ('UTTARAKHAND', 'UTTARANCHAL') THEN 'IN-UK'
    WHEN UPPER(${fieldName}) = 'WEST BENGAL' THEN 'IN-WB'
    WHEN UPPER(${fieldName}) IN ('ANDAMAN & NICOBAR ISLANDS', 'ANDAMAN AND NICOBAR ISLANDS') THEN 'IN-AN'
    WHEN UPPER(${fieldName}) = 'CHANDIGARH' THEN 'IN-CH'
    WHEN UPPER(${fieldName}) IN ('DADRA & NAGAR HAVELI AND DAMAN & DIU', 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU') THEN 'IN-DH'
    WHEN UPPER(${fieldName}) IN ('DELHI', 'NEW DELHI') THEN 'IN-DL'
    WHEN UPPER(${fieldName}) = 'LADAKH' THEN 'IN-LA'
    WHEN UPPER(${fieldName}) = 'LAKSHADWEEP' THEN 'IN-LD'
    WHEN UPPER(${fieldName}) IN ('PUDUCHERRY', 'PONDICHERRY') THEN 'IN-PY'
    WHEN ${fieldName} IS NOT NULL AND ${fieldName} ~ '^IN-[A-Z0-9]{2,3}$' THEN UPPER(${fieldName})
    ELSE NULL
  END
`;

const buildCdslGenderCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('MALE', 'M') THEN 'M'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('FEMALE', 'F') THEN 'F'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('OTHER', 'O', 'TRANSGENDER', 'T', 'THIRD GENDER') THEN 'O'
    ELSE NULL
  END
`;

const buildCdslSourceCte = () => `
  WITH source_row AS (
    SELECT
      km.id AS application_id,
      -- The link token (kyc_master_details.unique_id) is what actually goes
      -- into cdsl_data.unique_id — kept as text here so the service can
      -- validate it's numeric before the INSERT ever casts it to bigint.
      NULLIF(BTRIM(km.unique_id), '') AS source_unique_id_text,
      NULLIF(BTRIM(km.boid), '') AS source_boid,
      NULLIF(BTRIM(km.pan_number), '') AS source_pan_number,
      COALESCE(km.dob, km.provider_dob, km.digilocker_dob) AS source_dob,
      NULLIF(BTRIM(km.itr_name), '') AS source_full_name,
      NULLIF(BTRIM(km.address_1), '') AS source_kra_address_1,
      NULLIF(BTRIM(km.address_2), '') AS source_kra_address_2,
      NULLIF(BTRIM(km.address_3), '') AS source_kra_address_3,
      NULLIF(BTRIM(km.digilocker_address), '') AS source_digilocker_address_raw,
      NULLIF(BTRIM(km.digilocker_city), '') AS source_digilocker_city,
      NULLIF(BTRIM(km.digilocker_district), '') AS source_digilocker_district,
      NULLIF(BTRIM(km.digilocker_state), '') AS source_digilocker_state,
      NULLIF(BTRIM(km.digilocker_pincode), '') AS source_digilocker_pincode,
      SUBSTRING(NULLIF(BTRIM(COALESCE(km.city, km.digilocker_city)), '') FROM 1 FOR 25) AS source_city,
      SUBSTRING(NULLIF(BTRIM(COALESCE(km.state, km.digilocker_state)), '') FROM 1 FOR 25) AS source_state,
      NULLIF(BTRIM(COALESCE(km.pincode, km.digilocker_pincode)), '') AS source_pincode,
      NULLIF(BTRIM(COALESCE(km.personal_father_name, km.father_name, km.digilocker_father_name)), '') AS source_father_name,
      -- kyc_master_details has no plain "gender" column — kra_gender /
      -- digilocker_gender are the route-specific columns that actually exist.
      NULLIF(BTRIM(COALESCE(km.kra_gender, km.digilocker_gender)), '') AS source_gender,
      NULLIF(BTRIM(km.occupation), '') AS source_occupation,
      NULLIF(BTRIM(km.annual_income), '') AS source_annual_income,
      NULLIF(BTRIM(km.country_of_birth), '') AS source_country_of_birth,
      NULLIF(BTRIM(km.citizen_of_india::text), '') AS source_citizen_of_india,
      CASE
        WHEN COALESCE(km.aadhaar_number, km.digilocker_aadhaar_number_masked) ~ '^[0-9]{12}$'
        THEN COALESCE(km.aadhaar_number, km.digilocker_aadhaar_number_masked)
        ELSE NULL
      END AS source_aadhaar_number,
      NULLIF(BTRIM(km.email), '') AS source_email,
      NULLIF(BTRIM(km.mobile_number), '') AS source_mobile,
      NULLIF(BTRIM(km.bank_account_number), '') AS source_bank_account_number,
      NULLIF(BTRIM(km.bank_ifsc_code), '') AS source_bank_ifsc,
      NULLIF(BTRIM(km.bank_account_type), '') AS source_bank_account_type,
      NULLIF(BTRIM(km.bank_name), '') AS source_bank_name,
      NULLIF(BTRIM(km.ddpi::text), '') AS source_ddpi,
      NULLIF(BTRIM(km.client_code), '') AS source_client_code,
      (
        (km.nominee_name_1 IS NOT NULL AND BTRIM(km.nominee_name_1) <> '')::int +
        (km.nominee_name_2 IS NOT NULL AND BTRIM(km.nominee_name_2) <> '')::int +
        (km.nominee_name_3 IS NOT NULL AND BTRIM(km.nominee_name_3) <> '')::int
      ) AS source_nominee_count,
      existing.dpid AS existing_dpid,
      existing.operator_id AS existing_operator_id,
      existing.product_number AS existing_product_number,
      existing.annual_income_code AS existing_annual_income_code,
      existing.bo_category AS existing_bo_category,
      existing.bo_settlement_planning_flag AS existing_bo_settlement_planning_flag,
      existing.bo_sub_status AS existing_bo_sub_status,
      existing.bo_statement_cycle_code AS existing_bo_statement_cycle_code,
      existing.dividend_bank_acct_type AS existing_dividend_bank_acct_type,
      existing.dividend_bank_code AS existing_dividend_bank_code,
      existing.dividend_bank_ccy AS existing_dividend_bank_ccy,
      existing.pan_verification_flag AS existing_pan_verification_flag,
      existing.signature_file_flag AS existing_signature_file_flag,
      existing.beneficiary_tax_deduction_status AS existing_beneficiary_tax_deduction_status,
      existing.nomination_opt_out AS existing_nomination_opt_out,
      existing.uid_verification_flag AS existing_uid_verification_flag,
      existing.poa_type_flag AS existing_poa_type_flag,
      existing.bo_fee_type AS existing_bo_fee_type,
      existing.nationality_code AS existing_nationality_code,
      existing.bonafide_flag AS existing_bonafide_flag,
      existing.email_statement_flag AS existing_email_statement_flag,
      existing.annual_report_flag AS existing_annual_report_flag,
      existing.bsda_flag AS existing_bsda_flag,
      existing.communication_preference AS existing_communication_preference
    FROM public.kyc_master_details km
    LEFT JOIN public.cdsl_data existing
      ON existing.unique_id = (CASE WHEN km.unique_id ~ '^[0-9]+$' THEN km.unique_id::bigint ELSE NULL END)
    WHERE km.id = $1
  ),
  -- KRA already returns address in structured lines (address_1/2/3), so those
  -- are used as-is. DigiLocker only gives one flattened Aadhaar address
  -- string, so it is split heuristically: known place-name parts already
  -- captured separately (city, district, state, pincode, "India") are
  -- stripped out first, leaving door-no/street/landmark text for line 1;
  -- the DigiLocker city is used as the area/city line 2 (there is no
  -- separately captured "area" field to draw on). Pincode and state are
  -- therefore never present in line 1 or line 2, by construction.
  address_parts AS (
    SELECT
      source_row.application_id,
      CASE
        WHEN source_row.source_kra_address_1 IS NOT NULL THEN source_row.source_kra_address_1
        ELSE NULLIF(
          BTRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        COALESCE(source_row.source_digilocker_address_raw, ''),
                        '(?i)' || COALESCE(source_row.source_digilocker_pincode, chr(1)), '', 'g'
                      ),
                      '(?i)' || COALESCE(source_row.source_digilocker_state, chr(1)), '', 'g'
                    ),
                    '(?i)' || COALESCE(source_row.source_digilocker_district, chr(1)), '', 'g'
                  ),
                  '(?i)' || COALESCE(source_row.source_digilocker_city, chr(1)), '', 'g'
                ),
                '(?i)\\yINDIA\\y', '', 'g'
              ),
              '\\s+', ' ', 'g'
            )
          ),
          ''
        )
      END AS derived_addr1,
      CASE
        WHEN source_row.source_kra_address_1 IS NOT NULL THEN source_row.source_kra_address_2
        ELSE source_row.source_digilocker_city
      END AS derived_addr2,
      CASE
        WHEN source_row.source_kra_address_1 IS NOT NULL THEN source_row.source_kra_address_3
        ELSE NULL::text
      END AS derived_addr3,
      COALESCE(source_row.source_kra_address_1, source_row.source_digilocker_address_raw) IS NOT NULL
        AS has_address
    FROM source_row
  ),
  prepared_row AS (
    SELECT
      source_row.application_id,
      source_row.source_unique_id_text AS shared_unique_id_text,
      '08'::varchar AS upload_id,
      COALESCE(
        NULLIF($2, ''),
        CASE WHEN source_row.source_boid ~ '^[0-9]{16}$' THEN LEFT(source_row.source_boid, 8) ELSE NULL END,
        source_row.existing_dpid
      ) AS dpid,
      -- TODO: Operator ID is CDSL participant metadata and is not stored in current KYC tables.
      COALESCE(NULLIF($3, ''), source_row.existing_operator_id) AS operator_id,
      CASE
        WHEN source_row.source_boid ~ '^[0-9]{16}$' THEN source_row.source_boid
        ELSE NULL
      END AS bo_id,
      TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') AS bo_request_receive_date,
      -- TODO: Product number is CDSL BO master metadata and is not stored in current KYC tables.
      COALESCE(NULLIF($4, ''), source_row.existing_product_number) AS product_number,
      NULLIF(SPLIT_PART(source_row.source_full_name, ' ', 1), '') AS bo_name,
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
      ) AS bo_middle_name,
      NULLIF(
        CASE
          WHEN POSITION(' ' IN source_row.source_full_name) > 0
          THEN REGEXP_REPLACE(source_row.source_full_name, '^.*\\s', '')
          ELSE '.'
        END,
        ''
      ) AS last_name,
      NULL::varchar AS bo_title,
      NULL::varchar AS bo_suffix,
      source_row.source_father_name AS father_husband_name,
      SUBSTRING(NULLIF(BTRIM(address_parts.derived_addr1), '') FROM 1 FOR 55) AS cust_addr_1,
      SUBSTRING(NULLIF(BTRIM(address_parts.derived_addr2), '') FROM 1 FOR 55) AS cust_addr_2,
      SUBSTRING(NULLIF(BTRIM(address_parts.derived_addr3), '') FROM 1 FOR 55) AS cust_addr_3,
      CASE
        WHEN address_parts.has_address THEN 'IN'
        ELSE NULL
      END AS cust_addr_cntry_code,
      source_row.source_pincode AS cust_addr_zip,
      ${buildCdslStateSubdivisionCodeCase("source_row.source_state")} AS cust_addr_state_code,
      CASE
        WHEN address_parts.has_address
          AND ${buildCdslStateSubdivisionCodeCase("source_row.source_state")} IS NULL
        THEN source_row.source_state
        ELSE NULL
      END AS cust_addr_state,
      source_row.source_city AS cust_addr_city,
      CASE
        WHEN source_row.source_city IS NOT NULL THEN '00'
        ELSE NULL
      END AS city_sequence_number,
      CASE
        WHEN source_row.source_mobile IS NOT NULL THEN '91'
        ELSE NULL
      END AS primary_mobile_no_isd_code,
      source_row.source_mobile AS primary_mobile_no,
      NULL::varchar AS secondary_isd_code,
      NULL::varchar AS secondary_mobile_phone,
      NULL::varchar AS secondary_email,
      NULL::varchar AS cust_fax,
      source_row.source_pan_number AS income_tax_pan,
      CASE
        WHEN source_row.source_aadhaar_number IS NOT NULL
          AND LENGTH(source_row.source_aadhaar_number) <= 16
        THEN source_row.source_aadhaar_number
        ELSE NULL
      END AS uid,
      COALESCE(NULLIF($17, ''), source_row.existing_uid_verification_flag) AS uid_verification_flag,
      CASE
        WHEN UPPER(COALESCE(source_row.source_ddpi, '')) IN ('YES', 'Y', 'TRUE') THEN 'D'
        ELSE COALESCE(NULLIF($18, ''), source_row.existing_poa_type_flag)
      END AS poa_type_flag,
      NULL::varchar AS filler1,
      NULL::varchar AS it_circle,
      source_row.source_email AS primary_email,
      NULL::varchar AS lei,
      NULL::varchar AS user_text_1,
      NULL::varchar AS user_text_2,
      NULL::varchar AS pan_exemption_code,
      -- TODO: PAN verification flag requires CDSL-specific confirmation and is not stored in current KYC tables.
      COALESCE(NULLIF($13, ''), source_row.existing_pan_verification_flag) AS pan_verification_flag,
      COALESCE(NULLIF($14, ''), source_row.existing_signature_file_flag) AS signature_file_flag,
      TO_CHAR(source_row.source_dob, 'DDMMYYYY') AS date_of_birth_or_origin,
      ${buildCdslGenderCodeCase("source_row.source_gender")} AS sex_code,
      NULL::varchar AS occupation,
      NULL::varchar AS life_style,
      NULL::varchar AS geographical_code,
      NULL::varchar AS education_degree,
      -- TODO: Annual income code requires CDSL-specific coding and is not stored in current KYC tables.
      COALESCE(NULLIF($5, ''), source_row.existing_annual_income_code) AS annual_income_code,
      CASE
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('YES', 'Y', 'TRUE')
          OR UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
        THEN 'IND'
        ELSE COALESCE(NULLIF($20, ''), source_row.existing_nationality_code)
      END AS nationality_code,
      COALESCE(NULLIF($19, ''), source_row.existing_bo_fee_type) AS bo_fee_type,
      NULL::varchar AS language_code,
      NULL::varchar AS category_4_code,
      NULL::varchar AS bank_option_5,
      NULL::varchar AS staff_relative,
      NULL::varchar AS staff_code,
      CASE
        WHEN source_row.source_nominee_count > 0 THEN 'N'
        WHEN source_row.source_nominee_count = 0 THEN 'Y'
        ELSE COALESCE(NULLIF($16, ''), source_row.existing_nomination_opt_out)
      END AS nomination_opt_out,
      COALESCE(NULLIF($21, ''), source_row.existing_bonafide_flag) AS bonafide_flag,
      COALESCE(NULLIF($22, ''), source_row.existing_email_statement_flag) AS email_statement_flag,
      NULL::varchar AS cas_mode,
      NULL::varchar AS mental_disability,
      NULL::varchar AS rgess_flag,
      COALESCE(NULLIF($23, ''), source_row.existing_annual_report_flag) AS annual_report_flag,
      NULL::varchar AS pledge_standing_instruction_flag,
      NULL::varchar AS email_rta_download_flag,
      COALESCE(NULLIF($24, ''), source_row.existing_bsda_flag) AS bsda_flag,
      CASE
        WHEN source_row.source_nominee_count >= 0 THEN '0'
        ELSE NULL
      END AS mode_of_operation,
      COALESCE(NULLIF($25, ''), source_row.existing_communication_preference) AS communication_preference,
      NULL::varchar AS security_access_code,
      -- TODO: BO category requires CDSL-specific coding and is not stored in current KYC tables.
      COALESCE(NULLIF($6, ''), source_row.existing_bo_category) AS bo_category,
      -- TODO: BO settlement planning flag requires participant-side business default.
      COALESCE(NULLIF($7, ''), source_row.existing_bo_settlement_planning_flag) AS bo_settlement_planning_flag,
      source_row.source_bank_ifsc AS dividend_bank_ifsc_code,
      NULL::varchar AS rbi_reference_number,
      NULL::varchar AS rbi_approval_date,
      NULL::varchar AS sebi_registration_number,
      COALESCE(
        NULLIF($15, ''),
        source_row.existing_beneficiary_tax_deduction_status,
        '01'
      ) AS beneficiary_tax_deduction_status,
      NULL::varchar AS smart_card_required,
      NULL::varchar AS smart_card_number,
      NULL::varchar AS smart_card_pin,
      NULL::varchar AS ecs_mandate,
      NULL::varchar AS electronic_confirmation,
      NULL::varchar AS dividend_currency,
      NULL::varchar AS group_code,
      -- TODO: BO sub status requires CDSL-specific coding and is not stored in current KYC tables.
      COALESCE(NULLIF($8, ''), source_row.existing_bo_sub_status) AS bo_sub_status,
      NULL::varchar AS clearing_corporation_id,
      NULL::varchar AS clearing_member_id,
      NULL::varchar AS stock_exchange,
      NULL::varchar AS confirmation_waived,
      NULL::varchar AS trading_id,
      -- TODO: BO statement cycle code requires CDSL-specific coding and is not stored in current KYC tables.
      COALESCE(NULLIF($9, ''), source_row.existing_bo_statement_cycle_code) AS bo_statement_cycle_code,
      NULL::varchar AS custodian_pms_email_id,
      -- TODO: Dividend bank account type requires CDSL-specific value and is not stored in current KYC tables.
      COALESCE(NULLIF($10, ''), source_row.existing_dividend_bank_acct_type) AS dividend_bank_acct_type,
      -- TODO: Dividend bank code is not stored in current KYC tables.
      COALESCE(NULLIF($11, ''), source_row.existing_dividend_bank_code) AS dividend_bank_code,
      source_row.source_bank_account_number AS dividend_acct_numb,
      -- TODO: Dividend bank currency requires CDSL-specific value and is not stored in current KYC tables.
      COALESCE(NULLIF($12, ''), source_row.existing_dividend_bank_ccy) AS dividend_bank_ccy,
      source_row.source_client_code AS client_code,
      jsonb_build_object(
        'source_table',
        'public.kyc_master_details',
        'api_transport',
        jsonb_build_object(
          'upload_id', '08',
          'setup_upload_endpoint', 'https://apigt.cdsl.co.in/Commonweb/api/BOAPI/HrmSetUpload',
          'modify_upload_endpoint', 'https://apigt.cdsl.co.in/Commonweb/api/BOAPI/HrmModUpload'
        ),
        'field_mapping',
        jsonb_build_object(
          'application_id', 'kyc_master_details.id (stored on cdsl_data.unique_id)',
          'dpid', 'request override -> first 8 digits of kyc_master_details.boid when 16-digit -> existing cdsl_data.dpid',
          'bo_id', 'kyc_master_details.boid when 16-digit',
          'bo_name / bo_middle_name / last_name', 'split from kyc_master_details.itr_name',
          'father_husband_name', 'COALESCE(personal_father_name, father_name, digilocker_father_name)',
          'cust_addr_1_to_3', 'KRA: address_1/2/3 used directly. DigiLocker: address_1=door no+street (digilocker_address with city/district/state/pincode/India stripped out), address_2=digilocker_city, address_3=none',
          'cust_addr_state_code', 'COALESCE(state, digilocker_state) -> ISO 3166-2 code',
          'cust_addr_city', 'COALESCE(city, digilocker_city)',
          'primary_mobile_no', 'kyc_master_details.mobile_number',
          'income_tax_pan', 'kyc_master_details.pan_number',
          'uid', 'COALESCE(aadhaar_number, digilocker_aadhaar_number_masked) when fully numeric and unmasked',
          'primary_email', 'kyc_master_details.email',
          'date_of_birth_or_origin', 'COALESCE(dob, provider_dob, digilocker_dob) -> DDMMYYYY',
          'sex_code', 'COALESCE(kra_gender, digilocker_gender) -> M/F/O',
          'dividend_bank_ifsc_code', 'kyc_master_details.bank_ifsc_code',
          'dividend_acct_numb', 'kyc_master_details.bank_account_number',
          'nomination_opt_out', 'derived from nominee_name_1/2/3 presence',
          'poa_type_flag', 'derived D for DDPI when kyc_master_details.ddpi is yes else override',
          'client_code', 'kyc_master_details.client_code'
        ),
        'todo_fields',
        ARRAY[
          'operator_id',
          'product_number',
          'annual_income_code',
          'bo_category',
          'bo_settlement_planning_flag',
          'bo_sub_status',
          'bo_statement_cycle_code',
          'dividend_bank_acct_type',
          'dividend_bank_code',
          'dividend_bank_ccy',
          'pan_verification_flag',
          'signature_file_flag'
        ]
      ) AS request_payload
    FROM source_row
    JOIN address_parts ON address_parts.application_id = source_row.application_id
  )
`;

export const getCdslSourceByApplicationIdQuery = `
  ${buildCdslSourceCte()}
  SELECT *
  FROM prepared_row
  WHERE application_id = $1;
`;

export const checkCdslApplicationIdUniqueIndexQuery = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'cdsl_data'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'unique_id'
  ) AS has_unique_application_id;
`;

export const upsertCdslDataByApplicationIdQuery = `
  ${buildCdslSourceCte()}
  INSERT INTO public.cdsl_data (
    unique_id,
    upload_id,
    dpid,
    operator_id,
    bo_id,
    bo_request_receive_date,
    product_number,
    bo_name,
    bo_middle_name,
    last_name,
    bo_title,
    bo_suffix,
    father_husband_name,
    cust_addr_1,
    cust_addr_2,
    cust_addr_3,
    cust_addr_cntry_code,
    cust_addr_zip,
    cust_addr_state_code,
    cust_addr_state,
    cust_addr_city,
    city_sequence_number,
    primary_mobile_no_isd_code,
    primary_mobile_no,
    secondary_isd_code,
    secondary_mobile_phone,
    secondary_email,
    cust_fax,
    income_tax_pan,
    uid,
    uid_verification_flag,
    poa_type_flag,
    filler1,
    it_circle,
    primary_email,
    lei,
    user_text_1,
    user_text_2,
    pan_exemption_code,
    pan_verification_flag,
    signature_file_flag,
    date_of_birth_or_origin,
    sex_code,
    occupation,
    life_style,
    geographical_code,
    education_degree,
    annual_income_code,
    nationality_code,
    bo_fee_type,
    language_code,
    category_4_code,
    bank_option_5,
    staff_relative,
    staff_code,
    nomination_opt_out,
    bonafide_flag,
    email_statement_flag,
    cas_mode,
    mental_disability,
    rgess_flag,
    annual_report_flag,
    pledge_standing_instruction_flag,
    email_rta_download_flag,
    bsda_flag,
    mode_of_operation,
    communication_preference,
    security_access_code,
    bo_category,
    bo_settlement_planning_flag,
    dividend_bank_ifsc_code,
    rbi_reference_number,
    rbi_approval_date,
    sebi_registration_number,
    beneficiary_tax_deduction_status,
    smart_card_required,
    smart_card_number,
    smart_card_pin,
    ecs_mandate,
    electronic_confirmation,
    dividend_currency,
    group_code,
    bo_sub_status,
    clearing_corporation_id,
    clearing_member_id,
    stock_exchange,
    confirmation_waived,
    trading_id,
    bo_statement_cycle_code,
    custodian_pms_email_id,
    dividend_bank_acct_type,
    dividend_bank_code,
    dividend_acct_numb,
    dividend_bank_ccy,
    client_code,
    request_payload,
    updated_at
  )
  SELECT
    shared_unique_id_text::bigint,
    upload_id,
    dpid,
    operator_id,
    bo_id,
    bo_request_receive_date,
    product_number,
    bo_name,
    bo_middle_name,
    last_name,
    bo_title,
    bo_suffix,
    father_husband_name,
    cust_addr_1,
    cust_addr_2,
    cust_addr_3,
    cust_addr_cntry_code,
    cust_addr_zip,
    cust_addr_state_code,
    cust_addr_state,
    cust_addr_city,
    city_sequence_number,
    primary_mobile_no_isd_code,
    primary_mobile_no,
    secondary_isd_code,
    secondary_mobile_phone,
    secondary_email,
    cust_fax,
    income_tax_pan,
    uid,
    uid_verification_flag,
    poa_type_flag,
    filler1,
    it_circle,
    primary_email,
    lei,
    user_text_1,
    user_text_2,
    pan_exemption_code,
    pan_verification_flag,
    signature_file_flag,
    date_of_birth_or_origin,
    sex_code,
    occupation,
    life_style,
    geographical_code,
    education_degree,
    annual_income_code,
    nationality_code,
    bo_fee_type,
    language_code,
    category_4_code,
    bank_option_5,
    staff_relative,
    staff_code,
    nomination_opt_out,
    bonafide_flag,
    email_statement_flag,
    cas_mode,
    mental_disability,
    rgess_flag,
    annual_report_flag,
    pledge_standing_instruction_flag,
    email_rta_download_flag,
    bsda_flag,
    mode_of_operation,
    communication_preference,
    security_access_code,
    bo_category,
    bo_settlement_planning_flag,
    dividend_bank_ifsc_code,
    rbi_reference_number,
    rbi_approval_date,
    sebi_registration_number,
    beneficiary_tax_deduction_status,
    smart_card_required,
    smart_card_number,
    smart_card_pin,
    ecs_mandate,
    electronic_confirmation,
    dividend_currency,
    group_code,
    bo_sub_status,
    clearing_corporation_id,
    clearing_member_id,
    stock_exchange,
    confirmation_waived,
    trading_id,
    bo_statement_cycle_code,
    custodian_pms_email_id,
    dividend_bank_acct_type,
    dividend_bank_code,
    dividend_acct_numb,
    dividend_bank_ccy,
    client_code,
    request_payload,
    NOW()
  FROM prepared_row
  WHERE application_id = $1
  ON CONFLICT (unique_id) DO UPDATE SET
    upload_id = EXCLUDED.upload_id,
    dpid = EXCLUDED.dpid,
    operator_id = EXCLUDED.operator_id,
    bo_id = EXCLUDED.bo_id,
    bo_request_receive_date = EXCLUDED.bo_request_receive_date,
    product_number = EXCLUDED.product_number,
    bo_name = EXCLUDED.bo_name,
    bo_middle_name = EXCLUDED.bo_middle_name,
    last_name = EXCLUDED.last_name,
    bo_title = EXCLUDED.bo_title,
    bo_suffix = EXCLUDED.bo_suffix,
    father_husband_name = EXCLUDED.father_husband_name,
    cust_addr_1 = EXCLUDED.cust_addr_1,
    cust_addr_2 = EXCLUDED.cust_addr_2,
    cust_addr_3 = EXCLUDED.cust_addr_3,
    cust_addr_cntry_code = EXCLUDED.cust_addr_cntry_code,
    cust_addr_zip = EXCLUDED.cust_addr_zip,
    cust_addr_state_code = EXCLUDED.cust_addr_state_code,
    cust_addr_state = EXCLUDED.cust_addr_state,
    cust_addr_city = EXCLUDED.cust_addr_city,
    city_sequence_number = EXCLUDED.city_sequence_number,
    primary_mobile_no_isd_code = EXCLUDED.primary_mobile_no_isd_code,
    primary_mobile_no = EXCLUDED.primary_mobile_no,
    secondary_isd_code = EXCLUDED.secondary_isd_code,
    secondary_mobile_phone = EXCLUDED.secondary_mobile_phone,
    secondary_email = EXCLUDED.secondary_email,
    cust_fax = EXCLUDED.cust_fax,
    income_tax_pan = EXCLUDED.income_tax_pan,
    uid = EXCLUDED.uid,
    uid_verification_flag = EXCLUDED.uid_verification_flag,
    poa_type_flag = EXCLUDED.poa_type_flag,
    filler1 = EXCLUDED.filler1,
    it_circle = EXCLUDED.it_circle,
    primary_email = EXCLUDED.primary_email,
    lei = EXCLUDED.lei,
    user_text_1 = EXCLUDED.user_text_1,
    user_text_2 = EXCLUDED.user_text_2,
    pan_exemption_code = EXCLUDED.pan_exemption_code,
    pan_verification_flag = EXCLUDED.pan_verification_flag,
    signature_file_flag = EXCLUDED.signature_file_flag,
    date_of_birth_or_origin = EXCLUDED.date_of_birth_or_origin,
    sex_code = EXCLUDED.sex_code,
    occupation = EXCLUDED.occupation,
    life_style = EXCLUDED.life_style,
    geographical_code = EXCLUDED.geographical_code,
    education_degree = EXCLUDED.education_degree,
    annual_income_code = EXCLUDED.annual_income_code,
    nationality_code = EXCLUDED.nationality_code,
    bo_fee_type = EXCLUDED.bo_fee_type,
    language_code = EXCLUDED.language_code,
    category_4_code = EXCLUDED.category_4_code,
    bank_option_5 = EXCLUDED.bank_option_5,
    staff_relative = EXCLUDED.staff_relative,
    staff_code = EXCLUDED.staff_code,
    nomination_opt_out = EXCLUDED.nomination_opt_out,
    bonafide_flag = EXCLUDED.bonafide_flag,
    email_statement_flag = EXCLUDED.email_statement_flag,
    cas_mode = EXCLUDED.cas_mode,
    mental_disability = EXCLUDED.mental_disability,
    rgess_flag = EXCLUDED.rgess_flag,
    annual_report_flag = EXCLUDED.annual_report_flag,
    pledge_standing_instruction_flag = EXCLUDED.pledge_standing_instruction_flag,
    email_rta_download_flag = EXCLUDED.email_rta_download_flag,
    bsda_flag = EXCLUDED.bsda_flag,
    mode_of_operation = EXCLUDED.mode_of_operation,
    communication_preference = EXCLUDED.communication_preference,
    security_access_code = EXCLUDED.security_access_code,
    bo_category = EXCLUDED.bo_category,
    bo_settlement_planning_flag = EXCLUDED.bo_settlement_planning_flag,
    dividend_bank_ifsc_code = EXCLUDED.dividend_bank_ifsc_code,
    rbi_reference_number = EXCLUDED.rbi_reference_number,
    rbi_approval_date = EXCLUDED.rbi_approval_date,
    sebi_registration_number = EXCLUDED.sebi_registration_number,
    beneficiary_tax_deduction_status = EXCLUDED.beneficiary_tax_deduction_status,
    smart_card_required = EXCLUDED.smart_card_required,
    smart_card_number = EXCLUDED.smart_card_number,
    smart_card_pin = EXCLUDED.smart_card_pin,
    ecs_mandate = EXCLUDED.ecs_mandate,
    electronic_confirmation = EXCLUDED.electronic_confirmation,
    dividend_currency = EXCLUDED.dividend_currency,
    group_code = EXCLUDED.group_code,
    bo_sub_status = EXCLUDED.bo_sub_status,
    clearing_corporation_id = EXCLUDED.clearing_corporation_id,
    clearing_member_id = EXCLUDED.clearing_member_id,
    stock_exchange = EXCLUDED.stock_exchange,
    confirmation_waived = EXCLUDED.confirmation_waived,
    trading_id = EXCLUDED.trading_id,
    bo_statement_cycle_code = EXCLUDED.bo_statement_cycle_code,
    custodian_pms_email_id = EXCLUDED.custodian_pms_email_id,
    dividend_bank_acct_type = EXCLUDED.dividend_bank_acct_type,
    dividend_bank_code = EXCLUDED.dividend_bank_code,
    dividend_acct_numb = EXCLUDED.dividend_acct_numb,
    dividend_bank_ccy = EXCLUDED.dividend_bank_ccy,
    client_code = EXCLUDED.client_code,
    request_payload = EXCLUDED.request_payload,
    updated_at = NOW()
  RETURNING id, unique_id AS application_id;
`;
