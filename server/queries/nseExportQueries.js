/**
 * NSE CCD (Client Constituent Details) EXPORT - source directly from
 * kyc_master_details.
 *
 * One fix was needed against the reference this was adapted from:
 * kyc_master_details has no plain "gender" column, only kra_gender /
 * digilocker_gender (same gap already fixed in cvlkraExportQueries.js and
 * cdslExportQueries.js).
 */
const buildNseSourceCte = () => `
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
      -- into nse_data.unique_id — kept as text here so the service can
      -- validate it's numeric before the INSERT ever casts it to bigint.
      NULLIF(BTRIM(km.unique_id), '') AS source_unique_id_text,
      NULLIF(BTRIM(km.email), '') AS source_email,
      NULLIF(BTRIM(km.mobile_number), '') AS source_mobile,
      NULLIF(BTRIM(km.pan_number), '') AS source_pan_number,
      COALESCE(km.dob, km.provider_dob, km.digilocker_dob) AS source_dob,
      NULLIF(BTRIM(COALESCE(km.itr_name, km.digilocker_name)), '') AS source_client_name,
      NULLIF(BTRIM(km.category), '') AS source_category,
      NULLIF(BTRIM(km.provider), '') AS source_identity_provider,
      NULLIF(BTRIM(km.address_1), '') AS source_address_line1,
      NULLIF(BTRIM(km.address_2), '') AS source_address_line2,
      NULLIF(BTRIM(COALESCE(km.city, km.digilocker_city)), '') AS source_city,
      NULLIF(BTRIM(COALESCE(km.state, km.digilocker_state)), '') AS source_state,
      NULLIF(BTRIM(COALESCE(km.pincode, km.digilocker_pincode)), '') AS source_pincode,
      NULLIF(BTRIM(COALESCE(km.personal_father_name, km.father_name, km.digilocker_father_name)), '') AS source_father_name,
      -- kyc_master_details has no plain "gender" column — kra_gender /
      -- digilocker_gender are the route-specific columns that actually exist.
      NULLIF(BTRIM(COALESCE(km.kra_gender, km.digilocker_gender)), '') AS source_gender,
      NULLIF(BTRIM(km.marital_status), '') AS source_marital_status,
      NULLIF(BTRIM(km.annual_income), '') AS source_annual_income,
      NULLIF(BTRIM(km.politically_exposed::text), '') AS source_politically_exposed,
      NULLIF(BTRIM(km.occupation), '') AS source_occupation,
      NULLIF(BTRIM(km.country_of_birth), '') AS source_country_of_birth,
      NULLIF(BTRIM(km.ddpi::text), '') AS source_ddpi,
      NULLIF(BTRIM(COALESCE(km.aadhaar_address, km.address_1)), '') AS source_aadhaar_address,
      NULLIF(BTRIM(km.digilocker_provider), '') AS source_digilocker_provider,
      NULLIF(BTRIM(km.digilocker_address), '') AS source_digilocker_address,
      NULLIF(BTRIM(km.bank_account_number), '') AS source_bank_account_number,
      NULLIF(BTRIM(km.bank_ifsc_code), '') AS source_bank_ifsc,
      NULLIF(BTRIM(km.bank_account_type), '') AS source_bank_account_type,
      NULLIF(BTRIM(km.bank_name), '') AS source_bank_name,
      NULLIF(BTRIM(km.bank_branch_name), '') AS source_bank_branch_name,
      NULLIF(BTRIM(km.bank_address), '') AS source_bank_address,
      COALESCE(NULLIF(BTRIM(km.client_code), ''), lcc.client_code) AS source_client_code,
      NULLIF(BTRIM(km.boid), '') AS source_boid
    FROM public.kyc_master_details km
    LEFT JOIN latest_client_code lcc
      ON TRUE
    WHERE km.id = $1
  )
`;

const buildNseStateCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(${fieldName}) IN ('ANDAMAN & NICOBAR ISLANDS', 'ANDAMAN AND NICOBAR ISLANDS') THEN '1'
    WHEN UPPER(${fieldName}) IN ('ANDHRA PRADESH') THEN '2'
    WHEN UPPER(${fieldName}) IN ('ARUNACHAL PRADESH') THEN '3'
    WHEN UPPER(${fieldName}) IN ('ASSAM') THEN '4'
    WHEN UPPER(${fieldName}) IN ('BIHAR') THEN '5'
    WHEN UPPER(${fieldName}) IN ('CHANDIGARH') THEN '6'
    WHEN UPPER(${fieldName}) IN ('DADRA & NAGAR HAVELI', 'DADRA AND NAGAR HAVELI') THEN '7'
    WHEN UPPER(${fieldName}) IN ('DAMAN & DIU', 'DAMAN AND DIU') THEN '8'
    WHEN UPPER(${fieldName}) IN ('DELHI') THEN '9'
    WHEN UPPER(${fieldName}) IN ('GOA') THEN '10'
    WHEN UPPER(${fieldName}) IN ('GUJARAT') THEN '11'
    WHEN UPPER(${fieldName}) IN ('HARYANA') THEN '12'
    WHEN UPPER(${fieldName}) IN ('HIMACHAL PRADESH') THEN '13'
    WHEN UPPER(${fieldName}) IN ('JAMMU & KASHMIR', 'JAMMU AND KASHMIR') THEN '14'
    WHEN UPPER(${fieldName}) IN ('KARNATAKA') THEN '15'
    WHEN UPPER(${fieldName}) IN ('KERALA') THEN '16'
    WHEN UPPER(${fieldName}) IN ('LAKHSWADEEP', 'LAKSHADWEEP') THEN '17'
    WHEN UPPER(${fieldName}) IN ('MADHYA PRADESH') THEN '18'
    WHEN UPPER(${fieldName}) IN ('MAHARASHTRA') THEN '19'
    WHEN UPPER(${fieldName}) IN ('MANIPUR') THEN '20'
    WHEN UPPER(${fieldName}) IN ('MEGHALAYA') THEN '21'
    WHEN UPPER(${fieldName}) IN ('MIZORAM') THEN '22'
    WHEN UPPER(${fieldName}) IN ('NAGALAND') THEN '23'
    WHEN UPPER(${fieldName}) IN ('ORISSA', 'ODISHA') THEN '24'
    WHEN UPPER(${fieldName}) IN ('PONDICHERRY', 'PUDUCHERRY') THEN '25'
    WHEN UPPER(${fieldName}) IN ('PUNJAB') THEN '26'
    WHEN UPPER(${fieldName}) IN ('RAJASTHAN') THEN '27'
    WHEN UPPER(${fieldName}) IN ('SIKKIM') THEN '28'
    WHEN UPPER(${fieldName}) IN ('TAMIL NADU') THEN '29'
    WHEN UPPER(${fieldName}) IN ('TRIPURA') THEN '30'
    WHEN UPPER(${fieldName}) IN ('UTTAR PRADESH') THEN '31'
    WHEN UPPER(${fieldName}) IN ('WEST BENGAL') THEN '32'
    WHEN UPPER(${fieldName}) IN ('CHHATTISGARH') THEN '33'
    WHEN UPPER(${fieldName}) IN ('UTTARANCHAL', 'UTTARAKHAND') THEN '34'
    WHEN UPPER(${fieldName}) IN ('JHARKHAND') THEN '35'
    WHEN UPPER(${fieldName}) IN ('TELANGANA') THEN '37'
    WHEN UPPER(${fieldName}) IN ('LADAKH') THEN '38'
    WHEN UPPER(${fieldName}) IN ('APO') THEN '98'
    WHEN ${fieldName} IS NOT NULL AND LENGTH(${fieldName}) <= 2 THEN ${fieldName}
    ELSE NULL
  END
`;

const buildNseGenderCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('MALE', 'M') THEN 'M'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('FEMALE', 'F') THEN 'F'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('OTHER', 'O', 'TRANSGENDER', 'T', 'THIRD GENDER') THEN 'T'
    ELSE NULL
  END
`;

const buildNseOccupationCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(${fieldName}) = 'PUBLIC SECTOR' THEN 1
    WHEN UPPER(${fieldName}) = 'PRIVATE SECTOR' THEN 2
    WHEN UPPER(${fieldName}) IN ('GOVERNMENT SERVICE', 'GOVT SERVICE', 'GOVERNMENT') THEN 3
    WHEN UPPER(${fieldName}) = 'BUSINESS' THEN 4
    WHEN UPPER(${fieldName}) = 'PROFESSIONAL' THEN 5
    WHEN UPPER(${fieldName}) = 'AGRICULTURIST' THEN 6
    WHEN UPPER(${fieldName}) = 'RETIRED' THEN 7
    WHEN UPPER(${fieldName}) = 'HOUSEWIFE' THEN 8
    WHEN UPPER(${fieldName}) = 'STUDENT' THEN 9
    WHEN ${fieldName} IS NOT NULL THEN 99
    ELSE NULL
  END
`;

export const getNseSourceByApplicationIdQuery = `
  ${buildNseSourceCte()}
  SELECT *
  FROM source_row
  WHERE application_id = $1;
`;

export const checkNseApplicationIdUniqueIndexQuery = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'nse_data'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'unique_id'
  ) AS has_unique_application_id;
`;

export const upsertNseDataByApplicationIdQuery = `
  ${buildNseSourceCte()}
  INSERT INTO public.nse_data (
    unique_id,
    ccd_mem_cd,
    ccd_acct_type,
    ccd_opt_for_upi,
    ccd_cd,
    ccd_name,
    ccd_category,
    ccd_pan_no,
    ccd_seg_ind,
    ccd_dob,
    ccd_add_line1,
    ccd_add_city,
    ccd_add_state,
    ccd_add_country,
    ccd_email,
    ccd_clt_status,
    ccd_permant_add_flg,
    ccd_pin_code,
    ccd_mobile,
    ccd_bank_name,
    ccd_bank_ifsc,
    ccd_bank_acct_no,
    ccd_pri_sec_bnk,
    ccd_depos_name,
    ccd_depos_id,
    ccd_ben_acct_no,
    ccd_pri_sec_dp,
    ccd_ipv,
    ccd_gender,
    ccd_guardian_name,
    ccd_maritl_status,
    ccd_nationality,
    ccd_gros_annl_rnge,
    ccd_gros_annl_asdate,
    ccd_pep,
    ccd_occupation,
    ccd_perm_add_line1,
    ccd_perm_add_line2,
    ccd_perm_add_line3,
    ccd_perm_add_city,
    ccd_perm_add_state,
    ccd_perm_add_country,
    ccd_perm_pin,
    ccd_poa_funds,
    ccd_poa_securities,
    request_payload,
    updated_at
  )
  SELECT
    source_row.source_unique_id_text::bigint,
    -- TODO: No source table/column currently stores the NSE member code.
    NULL::varchar AS ccd_mem_cd,
    -- TODO: No authoritative source column currently stores the NSE account type.
    NULL::varchar AS ccd_acct_type,
    -- TODO: No authoritative source column currently stores the NSE UPI option.
    NULL::varchar AS ccd_opt_for_upi,
    CASE
      WHEN source_row.source_client_code IS NOT NULL
        AND LENGTH(source_row.source_client_code) <= 10
      THEN source_row.source_client_code
      ELSE NULL
    END AS ccd_cd,
    CASE
      WHEN source_row.source_client_name IS NOT NULL
        AND LENGTH(source_row.source_client_name) <= 85
      THEN source_row.source_client_name
      ELSE NULL
    END AS ccd_name,
    CASE
      WHEN source_row.source_category IS NOT NULL
        AND LENGTH(source_row.source_category) <= 2
      THEN source_row.source_category
      ELSE NULL
    END AS ccd_category,
    CASE
      WHEN source_row.source_pan_number IS NOT NULL
        AND LENGTH(source_row.source_pan_number) <= 10
      THEN source_row.source_pan_number
      ELSE NULL
    END AS ccd_pan_no,
    -- TODO: No authoritative source column currently stores the NSE segment indicator.
    NULL::char AS ccd_seg_ind,
    TO_CHAR(source_row.source_dob, 'YYYY-MM-DD') AS ccd_dob,
    COALESCE(
      source_row.source_address_line1,
      source_row.source_aadhaar_address,
      source_row.source_digilocker_address
    ) AS ccd_add_line1,
    CASE
      WHEN source_row.source_city IS NOT NULL
        AND LENGTH(source_row.source_city) <= 50
      THEN source_row.source_city
      ELSE NULL
    END AS ccd_add_city,
    ${buildNseStateCodeCase("source_row.source_state")} AS ccd_add_state,
    CASE
      WHEN source_row.source_digilocker_provider IS NOT NULL
        OR source_row.source_identity_provider IS NOT NULL
        OR source_row.source_digilocker_address IS NOT NULL
        OR source_row.source_address_line1 IS NOT NULL
      THEN '85'
      ELSE NULL
    END AS ccd_add_country,
    CASE
      WHEN source_row.source_email IS NOT NULL
        AND LENGTH(source_row.source_email) <= 60
      THEN source_row.source_email
      ELSE NULL
    END AS ccd_email,
    -- TODO: No authoritative source column currently stores the NSE client status.
    NULL::char AS ccd_clt_status,
    -- TODO: No authoritative source column currently determines permanent-address flag.
    NULL::char AS ccd_permant_add_flg,
    CASE
      WHEN source_row.source_pincode IS NOT NULL
        AND LENGTH(source_row.source_pincode) <= 10
      THEN source_row.source_pincode
      ELSE NULL
    END AS ccd_pin_code,
    CASE
      WHEN source_row.source_mobile IS NOT NULL
        AND LENGTH(source_row.source_mobile) <= 10
      THEN source_row.source_mobile
      ELSE NULL
    END AS ccd_mobile,
    CASE
      WHEN source_row.source_bank_name IS NOT NULL
        AND LENGTH(source_row.source_bank_name) <= 60
      THEN source_row.source_bank_name
      ELSE NULL
    END AS ccd_bank_name,
    CASE
      WHEN source_row.source_bank_ifsc IS NOT NULL
        AND LENGTH(source_row.source_bank_ifsc) <= 11
      THEN source_row.source_bank_ifsc
      ELSE NULL
    END AS ccd_bank_ifsc,
    CASE
      WHEN source_row.source_bank_account_number IS NOT NULL
        AND LENGTH(source_row.source_bank_account_number) <= 30
      THEN source_row.source_bank_account_number
      ELSE NULL
    END AS ccd_bank_acct_no,
    NULL::char AS ccd_pri_sec_bnk,
    NULL::varchar AS ccd_depos_name,
    NULL::varchar AS ccd_depos_id,
    CASE
      WHEN source_row.source_boid IS NOT NULL
        AND LENGTH(source_row.source_boid) <= 16
      THEN source_row.source_boid
      ELSE NULL
    END AS ccd_ben_acct_no,
    NULL::char AS ccd_pri_sec_dp,
    NULL::char AS ccd_ipv,
    ${buildNseGenderCodeCase("source_row.source_gender")} AS ccd_gender,
    NULL::varchar AS ccd_guardian_name,
    CASE
      WHEN UPPER(source_row.source_marital_status) = 'SINGLE'
      THEN 'S'
      WHEN UPPER(source_row.source_marital_status) = 'MARRIED'
      THEN 'M'
      WHEN UPPER(source_row.source_marital_status) IN ('WIDOW', 'WIDOWER', 'WIDOW/WIDOWER')
      THEN 'W'
      WHEN UPPER(source_row.source_marital_status) IN ('DIVORCE', 'DIVORCED')
      THEN 'D'
      WHEN source_row.source_marital_status IS NOT NULL
        AND UPPER(source_row.source_marital_status) IN ('NA', 'N/A', 'NOT APPLICABLE')
      THEN 'NA'
      ELSE NULL
    END AS ccd_maritl_status,
    CASE
      WHEN source_row.source_digilocker_provider IS NOT NULL
        OR source_row.source_identity_provider IS NOT NULL
        OR UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
      THEN 1
      ELSE 2
    END AS ccd_nationality,
    NULL::smallint AS ccd_gros_annl_rnge,
    NULL::varchar AS ccd_gros_annl_asdate,
    NULL::smallint AS ccd_pep,
    ${buildNseOccupationCodeCase("source_row.source_occupation")} AS ccd_occupation,
    NULL::varchar AS ccd_perm_add_line1,
    NULL::varchar AS ccd_perm_add_line2,
    NULL::varchar AS ccd_perm_add_line3,
    NULL::varchar AS ccd_perm_add_city,
    NULL::varchar AS ccd_perm_add_state,
    NULL::varchar AS ccd_perm_add_country,
    NULL::varchar AS ccd_perm_pin,
    NULL::char AS ccd_poa_funds,
    NULL::char AS ccd_poa_securities,
    jsonb_build_object(
      'source_table',
      'public.kyc_master_details',
      'field_mapping',
      jsonb_build_object(
        'application_id', 'kyc_master_details.id (stored on nse_data.unique_id)',
        'ccd_cd', 'kyc_master_details.client_code',
        'ccd_name', 'COALESCE(itr_name, digilocker_name)',
        'ccd_category', 'kyc_master_details.category',
        'ccd_pan_no', 'kyc_master_details.pan_number',
        'ccd_dob', 'COALESCE(dob, provider_dob, digilocker_dob)',
        'ccd_add_line1', 'COALESCE(address_1, aadhaar_address, digilocker_address)',
        'ccd_add_city', 'COALESCE(city, digilocker_city)',
        'ccd_add_state', 'COALESCE(state, digilocker_state) -> NSE Annexure 2 state code',
        'ccd_add_country', 'NSE Annexure 3 country code 85 for India',
        'ccd_pin_code', 'COALESCE(pincode, digilocker_pincode)',
        'ccd_email', 'kyc_master_details.email',
        'ccd_mobile', 'kyc_master_details.mobile_number',
        'ccd_bank_name', 'kyc_master_details.bank_name',
        'ccd_bank_ifsc', 'kyc_master_details.bank_ifsc_code',
        'ccd_bank_acct_no', 'kyc_master_details.bank_account_number',
        'ccd_ben_acct_no', 'kyc_master_details.boid',
        'ccd_gender', 'COALESCE(kra_gender, digilocker_gender)',
        'ccd_maritl_status', 'kyc_master_details.marital_status -> NSE code (S/M/W/D/NA)',
        'ccd_nationality', '1 for Indian, 2 for Other as per NSE PDF',
        'ccd_occupation', 'kyc_master_details.occupation -> NSE code (1/2/3/4/5/6/7/8/9/99)'
      ),
      'address_source',
      CASE
        WHEN LOWER(COALESCE(source_row.source_digilocker_provider, source_row.source_identity_provider, '')) = 'digilocker'
        THEN 'DIGILOCKER'
        WHEN source_row.source_address_line1 IS NOT NULL
        THEN 'KRA'
        ELSE ''
      END,
      'todo_fields',
      ARRAY[
        'ccd_mem_cd',
        'ccd_acct_type',
        'ccd_opt_for_upi',
        'ccd_seg_ind',
        'ccd_clt_status',
        'ccd_permant_add_flg',
        'ccd_pri_sec_bnk',
        'ccd_depos_name',
        'ccd_depos_id',
        'ccd_pri_sec_dp',
        'ccd_ipv',
        'ccd_gros_annl_rnge',
        'ccd_gros_annl_asdate',
        'ccd_pep',
        'ccd_perm_add_line1',
        'ccd_perm_add_line2',
        'ccd_perm_add_line3',
        'ccd_perm_add_city',
        'ccd_perm_add_state',
        'ccd_perm_add_country',
        'ccd_perm_pin',
        'ccd_poa_funds',
        'ccd_poa_securities'
      ]
    ) AS request_payload,
    NOW() AS updated_at
  FROM source_row
  WHERE application_id = $1
  ON CONFLICT (unique_id) DO UPDATE SET
    ccd_mem_cd = EXCLUDED.ccd_mem_cd,
    ccd_acct_type = EXCLUDED.ccd_acct_type,
    ccd_opt_for_upi = EXCLUDED.ccd_opt_for_upi,
    ccd_cd = EXCLUDED.ccd_cd,
    ccd_name = EXCLUDED.ccd_name,
    ccd_category = EXCLUDED.ccd_category,
    ccd_pan_no = EXCLUDED.ccd_pan_no,
    ccd_seg_ind = EXCLUDED.ccd_seg_ind,
    ccd_dob = EXCLUDED.ccd_dob,
    ccd_add_line1 = EXCLUDED.ccd_add_line1,
    ccd_add_city = EXCLUDED.ccd_add_city,
    ccd_add_state = EXCLUDED.ccd_add_state,
    ccd_add_country = EXCLUDED.ccd_add_country,
    ccd_email = EXCLUDED.ccd_email,
    ccd_clt_status = EXCLUDED.ccd_clt_status,
    ccd_permant_add_flg = EXCLUDED.ccd_permant_add_flg,
    ccd_pin_code = EXCLUDED.ccd_pin_code,
    ccd_mobile = EXCLUDED.ccd_mobile,
    ccd_bank_name = EXCLUDED.ccd_bank_name,
    ccd_bank_ifsc = EXCLUDED.ccd_bank_ifsc,
    ccd_bank_acct_no = EXCLUDED.ccd_bank_acct_no,
    ccd_pri_sec_bnk = EXCLUDED.ccd_pri_sec_bnk,
    ccd_depos_name = EXCLUDED.ccd_depos_name,
    ccd_depos_id = EXCLUDED.ccd_depos_id,
    ccd_ben_acct_no = EXCLUDED.ccd_ben_acct_no,
    ccd_pri_sec_dp = EXCLUDED.ccd_pri_sec_dp,
    ccd_ipv = EXCLUDED.ccd_ipv,
    ccd_gender = EXCLUDED.ccd_gender,
    ccd_guardian_name = EXCLUDED.ccd_guardian_name,
    ccd_maritl_status = EXCLUDED.ccd_maritl_status,
    ccd_nationality = EXCLUDED.ccd_nationality,
    ccd_gros_annl_rnge = EXCLUDED.ccd_gros_annl_rnge,
    ccd_gros_annl_asdate = EXCLUDED.ccd_gros_annl_asdate,
    ccd_pep = EXCLUDED.ccd_pep,
    ccd_occupation = EXCLUDED.ccd_occupation,
    ccd_perm_add_line1 = EXCLUDED.ccd_perm_add_line1,
    ccd_perm_add_line2 = EXCLUDED.ccd_perm_add_line2,
    ccd_perm_add_line3 = EXCLUDED.ccd_perm_add_line3,
    ccd_perm_add_city = EXCLUDED.ccd_perm_add_city,
    ccd_perm_add_state = EXCLUDED.ccd_perm_add_state,
    ccd_perm_add_country = EXCLUDED.ccd_perm_add_country,
    ccd_perm_pin = EXCLUDED.ccd_perm_pin,
    ccd_poa_funds = EXCLUDED.ccd_poa_funds,
    ccd_poa_securities = EXCLUDED.ccd_poa_securities,
    request_payload = EXCLUDED.request_payload,
    updated_at = NOW()
  RETURNING id, unique_id AS application_id;
`;
