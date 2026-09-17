/**
 * Build CVLKRA export data directly from public.kyc_master_details.
 * $1 is the master record ID (called application_id by the API).
 * $2 is JSON containing supported field overrides and service defaults.
 * Selected CVLKRA codes fall back to the existing export row, then defaults.
 * Defaults: document proof S, political connection NA, both address
 * proof 31. Income and occupation use the supplied CVLKRA code mappings;
 * unresolved values fall back to existing codes, then blank strings.
 * Permanent address mirrors correspondence.
 *
 * Address lines (app_cor_add1..3 / app_per_add1..3) and district
 * (app_corr_district / app_perm_district) are NOT computed here — they're
 * supplied as overrides by cvlkraExportService.js (word-wrapped / resolved
 * in JS) so this file never depends on a Postgres helper function that
 * doesn't exist in this database.
 */

const buildCvlkraStateCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(${fieldName}) = 'JAMMU AND KASHMIR' THEN '001'
    WHEN UPPER(${fieldName}) = 'HIMACHAL PRADESH' THEN '002'
    WHEN UPPER(${fieldName}) = 'PUNJAB' THEN '003'
    WHEN UPPER(${fieldName}) = 'CHANDIGARH' THEN '004'
    WHEN UPPER(${fieldName}) IN ('UTTARAKHAND', 'UTTARANCHAL') THEN '005'
    WHEN UPPER(${fieldName}) = 'HARYANA' THEN '006'
    WHEN UPPER(${fieldName}) = 'DELHI' THEN '007'
    WHEN UPPER(${fieldName}) = 'RAJASTHAN' THEN '008'
    WHEN UPPER(${fieldName}) = 'UTTAR PRADESH' THEN '009'
    WHEN UPPER(${fieldName}) = 'BIHAR' THEN '010'
    WHEN UPPER(${fieldName}) = 'SIKKIM' THEN '011'
    WHEN UPPER(${fieldName}) = 'ARUNACHAL PRADESH' THEN '012'
    WHEN UPPER(${fieldName}) = 'NAGALAND' THEN '013'
    WHEN UPPER(${fieldName}) = 'MANIPUR' THEN '014'
    WHEN UPPER(${fieldName}) = 'MIZORAM' THEN '015'
    WHEN UPPER(${fieldName}) = 'TRIPURA' THEN '016'
    WHEN UPPER(${fieldName}) = 'MEGHALAYA' THEN '017'
    WHEN UPPER(${fieldName}) = 'ASSAM' THEN '018'
    WHEN UPPER(${fieldName}) = 'WEST BENGAL' THEN '019'
    WHEN UPPER(${fieldName}) = 'JHARKHAND' THEN '020'
    WHEN UPPER(${fieldName}) IN ('ODISHA', 'ORISSA') THEN '021'
    WHEN UPPER(${fieldName}) = 'CHHATTISGARH' THEN '022'
    WHEN UPPER(${fieldName}) = 'MADHYA PRADESH' THEN '023'
    WHEN UPPER(${fieldName}) = 'GUJARAT' THEN '024'
    WHEN UPPER(${fieldName}) IN ('DAMAN AND DIU', 'DAMAN & DIU') THEN '025'
    WHEN UPPER(${fieldName}) IN ('DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DADRA & NAGAR HAVELI AND DAMAN & DIU') THEN '026'
    WHEN UPPER(${fieldName}) = 'MAHARASHTRA' THEN '027'
    WHEN UPPER(${fieldName}) = 'KARNATAKA' THEN '029'
    WHEN UPPER(${fieldName}) = 'GOA' THEN '030'
    WHEN UPPER(${fieldName}) = 'LAKSHADWEEP' THEN '031'
    WHEN UPPER(${fieldName}) = 'KERALA' THEN '032'
    WHEN UPPER(${fieldName}) = 'TAMIL NADU' THEN '033'
    WHEN UPPER(${fieldName}) IN ('PUDUCHERRY', 'PONDICHERRY') THEN '034'
    WHEN UPPER(${fieldName}) IN ('ANDAMAN & NICOBAR ISLANDS', 'ANDAMAN AND NICOBAR ISLANDS') THEN '035'
    WHEN UPPER(${fieldName}) = 'TELANGANA' THEN '036'
    WHEN UPPER(${fieldName}) = 'ANDHRA PRADESH' THEN '037'
    WHEN UPPER(${fieldName}) = 'LADAKH' THEN '038'
    WHEN ${fieldName} ~ '^[0-9]{3}$' THEN ${fieldName}
    ELSE NULL
  END
`;

const buildCvlkraGenderCodeCase = (fieldName) => `
  CASE
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('MALE', 'M') THEN 'M'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('FEMALE', 'F') THEN 'F'
    WHEN UPPER(COALESCE(${fieldName}, '')) IN ('TRANSGENDER', 'T', 'THIRD GENDER', 'OTHER', 'O') THEN 'T'
    ELSE NULL
  END
`;

// Ignore case, whitespace and separators when matching known descriptions.
const normalizeCvlkraDescription = (fieldName) =>
  `REGEXP_REPLACE(UPPER(COALESCE(${fieldName}, '')), '[^A-Z0-9<>]', '', 'g')`;

const buildCvlkraIncomeCodeCase = (fieldName) => `
  CASE ${normalizeCvlkraDescription(fieldName)}
    WHEN '01' THEN '01'
    WHEN 'BELOW1LAC' THEN '01'
    WHEN 'LESSTHANONELAKHS' THEN '01'
    WHEN '02' THEN '02'
    WHEN '15LAC' THEN '02'
    WHEN 'ONETOFIVELAKHS' THEN '02'
    WHEN '03' THEN '03'
    WHEN '510LAC' THEN '03'
    WHEN 'FIVETOTENLAKHS' THEN '03'
    WHEN '04' THEN '04'
    WHEN '1025LAC' THEN '04'
    WHEN 'TENTOTWENTYFIVELAKHS' THEN '04'
    WHEN '05' THEN '05'
    WHEN '25LAC1CR' THEN '05'
    WHEN 'TWENTYFIVELAKHSTOONECRORE' THEN '05'
    WHEN '06' THEN '06'
    WHEN '>1CR' THEN '06'
    WHEN 'ABOVEONECRORE' THEN '06'
    ELSE NULL
  END
`;

const buildCvlkraOccupationCodeCase = (fieldName) => `
  CASE ${normalizeCvlkraDescription(fieldName)}
    WHEN '01' THEN '01'
    WHEN 'PRIVATESECTORSERVICE' THEN '01'
    WHEN 'PRIVATESECTOR' THEN '01'
    WHEN '02' THEN '02'
    WHEN 'PUBLICSECTOR' THEN '02'
    WHEN '03' THEN '03'
    WHEN 'BUSINESS' THEN '03'
    WHEN '04' THEN '04'
    WHEN 'PROFESSIONAL' THEN '04'
    WHEN '05' THEN '05'
    WHEN 'AGRICULTURIST' THEN '05'
    WHEN '06' THEN '06'
    WHEN 'RETIRED' THEN '06'
    WHEN '07' THEN '07'
    WHEN 'HOUSEWIFE' THEN '07'
    WHEN '08' THEN '08'
    WHEN 'STUDENT' THEN '08'
    WHEN '09' THEN '09'
    WHEN 'FOREXDEALER' THEN '09'
    WHEN '10' THEN '10'
    WHEN 'GOVERNMENTSERVICE' THEN '10'
    WHEN '99' THEN '99'
    WHEN 'OTHERS' THEN '99'
    WHEN 'OTHER' THEN '99'
    ELSE NULL
  END
`;

const buildCvlkraSourceCte = () => `
  WITH overrides AS (
    SELECT COALESCE($2::jsonb, '{}'::jsonb) AS data
  ),
  source_row AS (
    SELECT
      k.id AS application_id,
      -- The link token (kyc_master_details.unique_id) is what actually goes
      -- into cvlkra_data.unique_id — kept as text here so the service can
      -- validate it's numeric before the INSERT ever casts it to bigint.
      NULLIF(BTRIM(k.unique_id), '') AS source_unique_id_text,
      k.created_at AS application_created_at,
      NULLIF(BTRIM(k.pan_number), '') AS source_pan_number,
      COALESCE(k.dob, k.digilocker_dob) AS source_dob,
      NULLIF(BTRIM(COALESCE(k.itr_name, k.digilocker_name)), '') AS source_full_name,
      NULLIF(BTRIM(COALESCE(k.personal_father_name, k.digilocker_father_name)), '') AS source_father_name,
      -- kyc_master_details has no plain "gender" column — kra_gender /
      -- digilocker_gender are the route-specific columns that actually exist.
      NULLIF(BTRIM(COALESCE(k.kra_gender, k.digilocker_gender)), '') AS source_gender,
      -- Prefer structured address fields, then Aadhaar/DigiLocker address.
      NULLIF(BTRIM(
        CASE
          WHEN k.address_1 IS NOT NULL OR k.address_2 IS NOT NULL
            THEN CONCAT_WS(', ', NULLIF(BTRIM(k.address_1), ''), NULLIF(BTRIM(k.address_2), ''))
          ELSE COALESCE(k.aadhaar_address, k.digilocker_address)
        END
      ), '') AS source_full_address,
      -- DigiLocker columns supply location when identity fields are NULL.
      NULLIF(BTRIM(COALESCE(k.city, k.digilocker_city)), '') AS source_city,
      NULLIF(BTRIM(COALESCE(k.district, k.digilocker_district)), '') AS source_district,
      NULLIF(BTRIM(COALESCE(k.state, k.digilocker_state)), '') AS source_state,
      NULLIF(BTRIM(COALESCE(k.pincode, k.digilocker_pincode)), '') AS source_pincode,
      CASE
        WHEN REGEXP_REPLACE(COALESCE(k.aadhaar_number, ''), '[[:space:]-]', '', 'g') ~ '^[0-9]{12}$'
          THEN REGEXP_REPLACE(k.aadhaar_number, '[[:space:]-]', '', 'g')
        ELSE NULL
      END AS source_aadhaar_number,
      REGEXP_REPLACE(COALESCE(k.digilocker_aadhaar_number_masked, ''), '[[:space:]-]', '', 'g') AS source_masked_aadhaar_number,
      NULLIF(BTRIM(k.email), '') AS source_email,
      NULLIF(BTRIM(k.mobile_number), '') AS source_mobile,
      k.mobile_verified AS source_mobile_verified,
      k.email_verified AS source_email_verified,
      k.annual_income AS source_annual_income,
      k.occupation AS source_occupation,
      NULLIF(BTRIM(k.marital_status), '') AS source_marital_status,
      NULLIF(BTRIM(k.country_of_birth), '') AS source_country_of_birth,
      NULLIF(BTRIM(k.citizen_of_india::text), '') AS source_citizen_of_india,
      existing.company_code AS existing_company_code,
      existing.app_pos_code AS existing_app_pos_code,
      existing.app_updtflg AS existing_app_updtflg,
      existing.app_type AS existing_app_type,
      existing.app_ipv_flag AS existing_app_ipv_flag,
      existing.app_nationality AS existing_app_nationality,
      existing.app_res_status AS existing_app_res_status,
      existing.app_cor_add_proof AS existing_app_cor_add_proof,
      existing.app_per_add_proof AS existing_app_per_add_proof,
      existing.app_income AS existing_app_income,
      existing.app_occ AS existing_app_occ,
      existing.app_pol_conn AS existing_app_pol_conn,
      existing.app_doc_proof AS existing_app_doc_proof,
      existing.app_mar_status AS existing_app_mar_status,
      existing.app_kyc_mode AS existing_app_kyc_mode,
      existing.app_ver_no AS existing_app_ver_no,
      existing.app_kra_code AS existing_app_kra_code
    FROM public.kyc_master_details k
    LEFT JOIN public.cvlkra_data existing
      ON existing.unique_id = (CASE WHEN k.unique_id ~ '^[0-9]+$' THEN k.unique_id::bigint ELSE NULL END)
    WHERE k.id = $1
  ),
  prepared_row AS (
    SELECT
      source_row.application_id,
      source_row.source_unique_id_text AS shared_unique_id_text,
      -- Passed straight through so the service can word-wrap it in JS
      -- (app_cor_add1..3 / app_per_add1..3 below read the wrapped lines
      -- back as overrides on the second query pass).
      source_row.source_full_address AS raw_full_address,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'company_code'), ''),
        source_row.existing_company_code,
        NULLIF(BTRIM(overrides.data->>'app_pos_code'), ''),
        source_row.existing_app_pos_code
      ) AS company_code,
      TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS batch_date,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_updtflg'), ''),
        source_row.existing_app_updtflg,
        CASE
          -- TODO: CVLKRA update-flag semantics need business confirmation; this keeps first export distinct from re-export.
          WHEN EXISTS (
            SELECT 1
            FROM public.cvlkra_data existing_cvl
            WHERE existing_cvl.unique_id = (CASE WHEN source_row.source_unique_id_text ~ '^[0-9]+$' THEN source_row.source_unique_id_text::bigint ELSE NULL END)
          ) THEN '99'
          ELSE '01'
        END
      ) AS app_updtflg,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_pos_code'), ''),
        source_row.existing_app_pos_code,
        NULLIF(BTRIM(overrides.data->>'company_code'), ''),
        source_row.existing_company_code
      ) AS app_pos_code,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_type'), ''),
        source_row.existing_app_type,
        'I'
      ) AS app_type,
      NULL::text AS app_no,
      TO_CHAR(COALESCE(source_row.application_created_at::date, CURRENT_DATE), 'DD/MM/YYYY') AS app_date,
      source_row.source_pan_number AS app_pan_no,
      CASE
        WHEN source_row.source_pan_number IS NOT NULL THEN 'Y'
        ELSE NULL
      END AS app_pan_copy,
      'N'::text AS app_exmt,
      NULL::text AS app_exmt_cat,
      NULLIF(BTRIM(overrides.data->>'app_exmt_id_proof'), '') AS app_exmt_id_proof,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_ipv_flag'), ''),
        source_row.existing_app_ipv_flag,
        'E'
      ) AS app_ipv_flag,
      TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS app_ipv_date,
      ${buildCvlkraGenderCodeCase("source_row.source_gender")} AS app_gen,
      source_row.source_full_name AS app_name,
      -- TODO: Relationship prefix like S/o, D/o, W/o is not stored separately in current KYC tables.
      source_row.source_father_name AS app_f_name,
      NULL::text AS app_regno,
      TO_CHAR(source_row.source_dob, 'DD/MM/YYYY') AS app_dob_incorp,
      NULL::text AS app_commence_dt,
      CASE
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('YES', 'Y', 'TRUE')
          OR UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
        THEN '01'
        ELSE COALESCE(
          NULLIF(BTRIM(overrides.data->>'app_nationality'), ''),
          source_row.existing_app_nationality
        )
      END AS app_nationality,
      NULL::text AS app_oth_nationality,
      NULL::text AS app_comp_status,
      NULL::text AS app_oth_comp_status,
      CASE
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('YES', 'Y', 'TRUE')
          OR UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
        THEN 'R'
        ELSE COALESCE(
          NULLIF(BTRIM(overrides.data->>'app_res_status'), ''),
          source_row.existing_app_res_status
        )
      END AS app_res_status,
      NULL::text AS app_res_status_proof,
      CASE
        WHEN source_row.source_aadhaar_number IS NOT NULL THEN 'xxxxxxxx' || RIGHT(source_row.source_aadhaar_number, 4)
        WHEN source_row.source_masked_aadhaar_number ~ '^[xX*]{8}[0-9]{4}$'
          THEN 'xxxxxxxx' || RIGHT(source_row.source_masked_aadhaar_number, 4)
        ELSE NULL
      END AS app_uid_no,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_cor_add1'), ''), '') AS app_cor_add1,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_cor_add2'), ''), '') AS app_cor_add2,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_cor_add3'), ''), '') AS app_cor_add3,
      source_row.source_city AS app_cor_city,
      source_row.source_pincode AS app_cor_pincd,
      ${buildCvlkraStateCodeCase("source_row.source_state")} AS app_cor_state,
      CASE
        WHEN source_row.source_full_address IS NOT NULL THEN '101'
        ELSE NULL
      END AS app_cor_ctry,
      NULL::text AS app_off_isd,
      NULL::text AS app_off_std,
      NULL::text AS app_off_no,
      NULL::text AS app_res_isd,
      NULL::text AS app_res_std,
      NULL::text AS app_res_no,
      NULL::text AS app_mob_isd,
      source_row.source_mobile AS app_mob_no,
      NULL::text AS app_fax_isd,
      NULL::text AS app_fax_std,
      NULL::text AS app_fax_no,
      source_row.source_email AS app_email,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_cor_add_proof'), ''),
        source_row.existing_app_cor_add_proof,
        '31'
      ) AS app_cor_add_proof,
      CASE
        -- TODO: CVLKRA address reference source needs business confirmation; Aadhaar last 4 is staged when available.
        WHEN source_row.source_aadhaar_number IS NOT NULL THEN RIGHT(source_row.source_aadhaar_number, 4)
        ELSE NULL
      END AS app_cor_add_ref,
      TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS app_cor_add_dt,
      'Y'::text AS app_per_add_flag,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_per_add1'), ''), '') AS app_per_add1,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_per_add2'), ''), '') AS app_per_add2,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_per_add3'), ''), '') AS app_per_add3,
      source_row.source_city AS app_per_city,
      source_row.source_pincode AS app_per_pincd,
      ${buildCvlkraStateCodeCase("source_row.source_state")} AS app_per_state,
      CASE
        WHEN source_row.source_full_address IS NOT NULL THEN '101'
        ELSE NULL
      END AS app_per_ctry,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_per_add_proof'), ''),
        source_row.existing_app_per_add_proof,
        '31'
      ) AS app_per_add_proof,
      CASE
        WHEN source_row.source_aadhaar_number IS NOT NULL THEN RIGHT(source_row.source_aadhaar_number, 4)
        ELSE NULL
      END AS app_per_add_ref,
      TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS app_per_add_dt,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_income'), ''),
        ${buildCvlkraIncomeCodeCase("source_row.source_annual_income")},
        NULLIF(BTRIM(source_row.existing_app_income), ''),
        ''
      ) AS app_income,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_occ'), ''),
        ${buildCvlkraOccupationCodeCase("source_row.source_occupation")},
        NULLIF(BTRIM(source_row.existing_app_occ), ''),
        ''
      ) AS app_occ,
      NULLIF(BTRIM(overrides.data->>'app_oth_occ'), '') AS app_oth_occ,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_pol_conn'), ''),
        source_row.existing_app_pol_conn,
        'NA'
      ) AS app_pol_conn,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_doc_proof'), ''),
        source_row.existing_app_doc_proof,
        'S'
      ) AS app_doc_proof,
      NULL::text AS app_internal_ref,
      NULL::text AS app_branch_code,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_mar_status'), ''),
        source_row.existing_app_mar_status,
        CASE
          WHEN UPPER(COALESCE(source_row.source_marital_status, '')) = 'SINGLE' THEN '01'
          WHEN UPPER(COALESCE(source_row.source_marital_status, '')) = 'MARRIED' THEN '02'
          ELSE NULL
        END
      ) AS app_mar_status,
      NULL::text AS app_netwrth,
      NULL::text AS app_networth_dt,
      NULL::text AS app_incorp_plc,
      NULL::text AS app_otherinfo,
      NULL::text AS app_filler1,
      NULL::text AS app_filler2,
      NULL::text AS app_filler3,
      NULL::text AS app_ipv_name,
      NULL::text AS app_ipv_desg,
      NULL::text AS app_ipv_organ,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_kyc_mode'), ''),
        source_row.existing_app_kyc_mode,
        '5'
      ) AS app_kyc_mode,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_ver_no'), ''),
        source_row.existing_app_ver_no,
        'V28'
      ) AS app_ver_no,
      COALESCE(
        NULLIF(BTRIM(overrides.data->>'app_kra_code'), ''),
        source_row.existing_app_kra_code,
        'CVLKRA'
      ) AS app_kra_code,
      NULL::text AS app_vid_no,
      NULL::text AS app_uid_token,
      NULL::text AS app_auth_name,
      NULL::text AS app_auth_email,
      NULL::text AS app_auth_email1,
      NULL::text AS app_auth_email2,
      NULL::text AS app_auth_mobile,
      NULL::text AS app_auth_fpiconsent,
      NULL::text AS app_auth_uboconsent,
      'N'::text AS app_fatca_applicable_flag,
      CASE
        WHEN UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
        THEN 'INDIA'
        ELSE NULL
      END AS app_fatca_birth_place,
      NULL::text AS app_fatca_birth_country,
      CASE
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('YES', 'Y', 'TRUE')
          OR UPPER(COALESCE(source_row.source_country_of_birth, '')) IN ('IN', 'IND', 'INDIA')
        THEN 'IN'
        ELSE NULL
      END AS app_fatca_country_res,
      CASE
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('YES', 'Y', 'TRUE') THEN 'Y'
        WHEN UPPER(COALESCE(source_row.source_citizen_of_india, '')) IN ('NO', 'N', 'FALSE') THEN 'N'
        ELSE NULL
      END AS app_fatca_country_cityzenship,
      TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS app_fatca_date_declaration,
      CASE
        WHEN source_row.source_mobile_verified IS TRUE THEN 'Y'
        WHEN source_row.source_mobile IS NOT NULL THEN 'N'
        ELSE NULL
      END AS app_mobile_flg,
      CASE
        WHEN source_row.source_email_verified IS TRUE THEN 'Y'
        WHEN source_row.source_email IS NOT NULL THEN 'N'
        ELSE NULL
      END AS app_email_flg,
      NULL::text AS app_otp_refno,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_perm_district'), ''), source_row.source_district) AS app_perm_district,
      COALESCE(NULLIF(BTRIM(overrides.data->>'app_corr_district'), ''), source_row.source_district) AS app_corr_district,
      jsonb_build_object(
        'header',
        jsonb_build_object(
          'company_code', COALESCE(
            NULLIF(BTRIM(overrides.data->>'company_code'), ''),
            source_row.existing_company_code,
            NULLIF(BTRIM(overrides.data->>'app_pos_code'), ''),
            source_row.existing_app_pos_code
          ),
          'batch_date', TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY')
        ),
        'source_tables',
        ARRAY['public.kyc_master_details', 'public.cvlkra_data'],
        'field_mapping',
        jsonb_build_object(
          'app_income', 'request override -> kyc_master_details.annual_income mapped to 01-06 -> existing code -> blank; legacy Above TwentyFive Lakhs is ambiguous',
          'app_occ', 'request override -> kyc_master_details.occupation mapped to 01-10/99 -> existing code -> blank',
          'company_code', 'request.body.company_code fallback env.CVL_POSCODE fallback existing cvlkra_data.company_code',
          'app_pos_code', 'request.body.app_pos_code fallback env.CVL_POSCODE fallback existing cvlkra_data.app_pos_code',
          'app_pan_no', 'kyc_master_details.pan_number',
          'app_name', 'COALESCE(kyc_master_details.itr_name, kyc_master_details.digilocker_name)',
          'app_f_name', 'kyc_master_details.personal_father_name fallback kyc_master_details.digilocker_father_name',
          'app_dob_incorp', 'COALESCE(kyc_master_details.dob, kyc_master_details.digilocker_dob) -> DD/MM/YYYY',
          'app_gen', 'COALESCE(kyc_master_details.kra_gender, kyc_master_details.digilocker_gender) -> M/F/T',
          'app_cor_add1_to_3', 'COALESCE(kyc_master_details.address_1+address_2, kyc_master_details.aadhaar_address, kyc_master_details.digilocker_address) word-wrapped into <=40-char lines in cvlkraExportService.js (app_per_add1_to_3 mirrors it)',
          'app_cor_city', 'COALESCE(kyc_master_details.city, kyc_master_details.digilocker_city) (app_per_city mirrors it)',
          'app_cor_state', 'COALESCE(kyc_master_details.state, kyc_master_details.digilocker_state) -> CVLKRA numeric state code (app_per_state mirrors it)',
          'app_cor_pincd', 'COALESCE(kyc_master_details.pincode, kyc_master_details.digilocker_pincode) (app_per_pincd mirrors it)',
          'app_corr_district', 'COALESCE(kyc_master_details.district, kyc_master_details.digilocker_district) fallback before export upsert',
          'app_email', 'kyc_master_details.email',
          'app_mob_no', 'kyc_master_details.mobile_number',
          'app_mobile_flg', 'kyc_master_details.mobile_verified -> Y/N',
          'app_email_flg', 'kyc_master_details.email_verified -> Y/N',
          'app_uid_no', 'xxxxxxxx + last 4 digits of valid kyc_master_details.aadhaar_number; fallback to digilocker_aadhaar_number_masked (8 mask characters followed by 4 digits)',
          'app_cor_add_ref', 'kyc_master_details.aadhaar_number -> last 4 digits when full numeric',
          'app_per_add_ref', 'kyc_master_details.aadhaar_number -> last 4 digits when full numeric',
          'app_perm_district', 'COALESCE(kyc_master_details.district, kyc_master_details.digilocker_district) fallback before export upsert'
        ),
        'overrides',
        overrides.data,
        'todo_fields',
        ARRAY[
          'app_updtflg_meaning_needs_cvlkra_business_confirmation',
          'app_exmt_id_proof_is_kept_inside_request_payload_only_and_needs_exact_cvlkra_code_mapping',
          'legacy_above_twentyfive_lakhs_needs_an_exact_income_band',
          'app_doc_proof_needs_exact_cvlkra_code_mapping',
          'app_cor_add_proof_needs_exact_cvlkra_code_mapping',
          'app_per_add_proof_needs_exact_cvlkra_code_mapping',
          'app_ver_no_defaulted_to_sample_version_until_business_confirms_a_newer_required_value',
          'fatca_fields_are_staged_with_minimal_india_defaults_only'
        ]
      ) AS request_payload
    FROM source_row
    CROSS JOIN overrides
  )
`;

export const getCvlkraSourceByApplicationIdQuery = `
  ${buildCvlkraSourceCte()}
  SELECT *
  FROM prepared_row
  WHERE application_id = $1;
`;

export const checkCvlkraUniqueIdConstraintQuery = `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'cvlkra_data'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'unique_id'
  ) AS has_unique_id_constraint;
`;

export const upsertCvlkraDataByApplicationIdQuery = `
  ${buildCvlkraSourceCte()}
  INSERT INTO public.cvlkra_data (
    unique_id,
    company_code,
    batch_date,
    app_updtflg,
    app_pos_code,
    app_type,
    app_date,
    app_pan_no,
    app_pan_copy,
    app_exmt,
    app_ipv_flag,
    app_ipv_date,
    app_gen,
    app_name,
    app_f_name,
    app_dob_incorp,
    app_nationality,
    app_res_status,
    app_res_status_proof,
    app_uid_no,
    app_cor_add1,
    app_cor_add2,
    app_cor_add3,
    app_cor_city,
    app_cor_pincd,
    app_cor_state,
    app_cor_ctry,
    app_mob_no,
    app_email,
    app_cor_add_proof,
    app_cor_add_ref,
    app_cor_add_dt,
    app_per_add_flag,
    app_per_add1,
    app_per_add2,
    app_per_add3,
    app_per_city,
    app_per_pincd,
    app_per_state,
    app_per_ctry,
    app_per_add_proof,
    app_per_add_ref,
    app_per_add_dt,
    app_income,
    app_occ,
    app_pol_conn,
    app_doc_proof,
    app_mar_status,
    app_kyc_mode,
    app_ver_no,
    app_kra_code,
    app_fatca_applicable_flag,
    app_fatca_birth_place,
    app_fatca_birth_country,
    app_fatca_country_res,
    app_fatca_country_cityzenship,
    app_fatca_date_declaration,
    app_mobile_flg,
    app_email_flg,
    app_per_district,
    app_cor_district,
    request_payload,
    updated_at
  )
  SELECT
    shared_unique_id_text::bigint,
    company_code,
    batch_date,
    app_updtflg,
    app_pos_code,
    app_type,
    app_date,
    app_pan_no,
    app_pan_copy,
    app_exmt,
    app_ipv_flag,
    app_ipv_date,
    app_gen,
    app_name,
    app_f_name,
    app_dob_incorp,
    app_nationality,
    app_res_status,
    app_res_status_proof,
    app_uid_no,
    app_cor_add1,
    app_cor_add2,
    app_cor_add3,
    app_cor_city,
    app_cor_pincd,
    app_cor_state,
    app_cor_ctry,
    app_mob_no,
    app_email,
    app_cor_add_proof,
    app_cor_add_ref,
    app_cor_add_dt,
    app_per_add_flag,
    app_per_add1,
    app_per_add2,
    app_per_add3,
    app_per_city,
    app_per_pincd,
    app_per_state,
    app_per_ctry,
    app_per_add_proof,
    app_per_add_ref,
    app_per_add_dt,
    app_income,
    app_occ,
    app_pol_conn,
    app_doc_proof,
    app_mar_status,
    app_kyc_mode,
    app_ver_no,
    app_kra_code,
    app_fatca_applicable_flag,
    app_fatca_birth_place,
    app_fatca_birth_country,
    app_fatca_country_res,
    app_fatca_country_cityzenship,
    app_fatca_date_declaration,
    app_mobile_flg,
    app_email_flg,
    app_perm_district,
    app_corr_district,
    request_payload,
    NOW()
  FROM prepared_row
  WHERE application_id = $1
  ON CONFLICT (unique_id) DO UPDATE SET
    company_code = EXCLUDED.company_code,
    batch_date = EXCLUDED.batch_date,
    app_updtflg = EXCLUDED.app_updtflg,
    app_pos_code = EXCLUDED.app_pos_code,
    app_type = EXCLUDED.app_type,
    app_date = EXCLUDED.app_date,
    app_pan_no = EXCLUDED.app_pan_no,
    app_pan_copy = EXCLUDED.app_pan_copy,
    app_exmt = EXCLUDED.app_exmt,
    app_ipv_flag = EXCLUDED.app_ipv_flag,
    app_ipv_date = EXCLUDED.app_ipv_date,
    app_gen = EXCLUDED.app_gen,
    app_name = EXCLUDED.app_name,
    app_f_name = EXCLUDED.app_f_name,
    app_dob_incorp = EXCLUDED.app_dob_incorp,
    app_nationality = EXCLUDED.app_nationality,
    app_res_status = EXCLUDED.app_res_status,
    app_res_status_proof = EXCLUDED.app_res_status_proof,
    app_uid_no = EXCLUDED.app_uid_no,
    app_cor_add1 = EXCLUDED.app_cor_add1,
    app_cor_add2 = EXCLUDED.app_cor_add2,
    app_cor_add3 = EXCLUDED.app_cor_add3,
    app_cor_city = EXCLUDED.app_cor_city,
    app_cor_pincd = EXCLUDED.app_cor_pincd,
    app_cor_state = EXCLUDED.app_cor_state,
    app_cor_ctry = EXCLUDED.app_cor_ctry,
    app_mob_no = EXCLUDED.app_mob_no,
    app_email = EXCLUDED.app_email,
    app_cor_add_proof = EXCLUDED.app_cor_add_proof,
    app_cor_add_ref = EXCLUDED.app_cor_add_ref,
    app_cor_add_dt = EXCLUDED.app_cor_add_dt,
    app_per_add_flag = EXCLUDED.app_per_add_flag,
    app_per_add1 = EXCLUDED.app_per_add1,
    app_per_add2 = EXCLUDED.app_per_add2,
    app_per_add3 = EXCLUDED.app_per_add3,
    app_per_city = EXCLUDED.app_per_city,
    app_per_pincd = EXCLUDED.app_per_pincd,
    app_per_state = EXCLUDED.app_per_state,
    app_per_ctry = EXCLUDED.app_per_ctry,
    app_per_add_proof = EXCLUDED.app_per_add_proof,
    app_per_add_ref = EXCLUDED.app_per_add_ref,
    app_per_add_dt = EXCLUDED.app_per_add_dt,
    app_income = EXCLUDED.app_income,
    app_occ = EXCLUDED.app_occ,
    app_pol_conn = EXCLUDED.app_pol_conn,
    app_doc_proof = EXCLUDED.app_doc_proof,
    app_mar_status = EXCLUDED.app_mar_status,
    app_kyc_mode = EXCLUDED.app_kyc_mode,
    app_ver_no = EXCLUDED.app_ver_no,
    app_kra_code = EXCLUDED.app_kra_code,
    app_fatca_applicable_flag = EXCLUDED.app_fatca_applicable_flag,
    app_fatca_birth_place = EXCLUDED.app_fatca_birth_place,
    app_fatca_birth_country = EXCLUDED.app_fatca_birth_country,
    app_fatca_country_res = EXCLUDED.app_fatca_country_res,
    app_fatca_country_cityzenship = EXCLUDED.app_fatca_country_cityzenship,
    app_fatca_date_declaration = EXCLUDED.app_fatca_date_declaration,
    app_mobile_flg = EXCLUDED.app_mobile_flg,
    app_email_flg = EXCLUDED.app_email_flg,
    app_per_district = EXCLUDED.app_per_district,
    app_cor_district = EXCLUDED.app_cor_district,
    request_payload = EXCLUDED.request_payload,
    updated_at = NOW()
  RETURNING id, unique_id AS application_id;
`;
