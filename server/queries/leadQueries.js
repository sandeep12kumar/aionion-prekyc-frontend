// kyc_master_details is shared with a separate "KYC" flow (a different
// codebase/team) that writes its own rows into the same table — kyc_type is
// how the two are told apart. This app is the "PRE KYC" flow, so every lead
// it creates is explicitly tagged 'PRE KYC' here, rather than relying on the
// column's DB-level default (which either flow could change independently).
export const INSERT_LEAD = `
  INSERT INTO kyc_master_details (client_name, mobile_number, email, unique_id, kyc_type)
  VALUES ($1, $2, $3, $4, 'PRE KYC')
  RETURNING id, unique_id, client_name, mobile_number, email, kyc_type, created_at
`;

export const GET_LEAD_SUMMARY = `
  SELECT id, unique_id, client_name, mobile_number, email,
    pan_number, dob, provider, kra_gender,
    kra_name,
    CONCAT_WS(', ', NULLIF(address_1, ''), NULLIF(address_2, ''), NULLIF(address_3, ''), NULLIF(city, ''), NULLIF(district, ''), NULLIF(state, ''), NULLIF(pincode, '')) AS kra_address,
    aadhaar_seeding_status
  FROM kyc_master_details
  WHERE id = $1
  LIMIT 1
`;

export const GET_CLIENT_REVIEW = `
  SELECT * FROM kyc_master_details WHERE unique_id = $1 LIMIT 1
`;

export const GET_CLIENT_LINK_SUMMARY = `
  SELECT id, unique_id, client_name, pan_number,
    mobile_number, email, mobile_verified, email_verified,
    selected_scheme, current_stage,
    COALESCE(NULLIF(state, ''), NULLIF(digilocker_state, '')) AS place_of_supply,
    bank_account_number, bank_ifsc_code, bank_account_type, bank_name,
    COALESCE(NULLIF(bank_account_holder_name, ''), NULLIF(client_name, '')) AS bank_holder_name,
    bank_bank_verified,
    payment_status, payment_amount,
    esign_status, esign_request_id, is_completed
  FROM kyc_master_details
  WHERE unique_id = $1
  LIMIT 1
`;

export const GET_LEAD_CONTACT = `
  SELECT id, unique_id, client_name, mobile_number, email
  FROM kyc_master_details WHERE id = $1 LIMIT 1
`;

export const MARK_CLIENT_LINK_SENT = `
  UPDATE kyc_master_details SET client_link_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  WHERE id = $1 RETURNING id, client_link_sent_at
`;

export const UPDATE_PAN_IMAGE = `
  UPDATE kyc_master_details
  SET pan_card_file_path = $2, pan_card_file_name = $3, pan_card_file_type = $4, updated_at = CURRENT_TIMESTAMP
  WHERE id = $1
  RETURNING id, pan_card_file_path, updated_at
`;

export const UPDATE_SIGNATURE_IMAGE = `
  UPDATE kyc_master_details
  SET signature_file_path = $2, signature_file_name = $3, signature_file_type = $4, updated_at = CURRENT_TIMESTAMP
  WHERE id = $1
  RETURNING id, signature_file_path, updated_at
`;

// KRA writes only kra_gender; DigiLocker writes only digilocker_gender.
export const SAVE_KRA_DETAILS = `
  UPDATE kyc_master_details SET pan_number=$2, dob=$3, client_name=COALESCE(NULLIF($4,''), client_name), kra_email=$5, kra_mobile=$6, father_name=$7, kra_gender=$8, address_1=$9, address_2=$10, address_3=$11, city=$12, district=$13, state=$14, pincode=$15, kra_name=$16, aadhaar_number=$17, provider_dob=$18, kra_raw_xml=$19, provider='CVL_KRA', current_stage='kra-confirmation', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING *`;

export const SAVE_INCOME_TAX_DETAILS = `
  UPDATE kyc_master_details SET pan_number=$2, dob=$3, itr_name=$4, itr_last_name=$5, category=$6, aadhaar_seeding_status=$7, provider='INCOME_TAX', current_stage='digilocker', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING *`;

export const SAVE_ITR_NAME = `UPDATE kyc_master_details SET itr_name=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id, itr_name`;

export const SAVE_DIGILOCKER_DETAILS = `
  UPDATE kyc_master_details SET digilocker_name=$2, digilocker_father_name=$3, digilocker_gender=$4,
    digilocker_dob=NULLIF($5, '')::date, digilocker_aadhaar_number_masked=$6, digilocker_address=$7,
    digilocker_city=$8, digilocker_district=$9, digilocker_state=$10, digilocker_pincode=$11,
    digilocker_photo_base64=$12, digilocker_provider=$13, digilocker_raw_xml=$14,
    provider='SETU_DIGILOCKER', current_stage='bank', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING *`;

// account_number/confirm_account_number/ifsc_code/account_type/branch_name/
// micr_code/bank_verified/bank_verification_id/bank_verification_raw were all
// dropped from the schema — only the bank_-prefixed columns remain.
export const SAVE_VERIFIED_BANK_DETAILS = `
  UPDATE kyc_master_details SET
    bank_account_number=$2, bank_confirm_account_number=$2,
    bank_ifsc_code=$3, bank_account_type=$4, bank_name=$5,
    bank_branch_name=$6, bank_address=$7, bank_micr_code=$8,
    bank_account_holder_name=$9, bank_verification_amount=$10, bank_response=$11,
    bank_verification_status='VERIFIED', bank_verification_type='PENNY_DROP',
    bank_bank_verified=TRUE,
    current_stage='personal', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING *`;

export const SAVE_SCHEME = `
  UPDATE kyc_master_details SET selected_scheme=$2, current_stage='signature', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING id, selected_scheme`;

// Gender is set by the verification route and must not be overwritten by the
// personal-details form.
export const SAVE_PERSONAL_DETAILS = `
  UPDATE kyc_master_details SET personal_father_name=$2, mother_name=$3,
    marital_status=$4, education=$5, annual_income=$6, trading_experience=$7,
    occupation=$8, net_worth=$9, running_account_authorization=$10,
    country_of_birth=$11, aadhaar_address=$12, politically_exposed=$13,
    citizen_of_india=$14, ddpi=$15, ddpi_selected=$15,
    ddpi_status=(CASE WHEN $15 IS TRUE THEN 'SELECTED' WHEN $15 IS FALSE THEN 'NOT_SELECTED' ELSE ddpi_status END),
    income_declaration_accepted=$16,
    rights_accepted=$17, depository_credit_instruction=$18, pledge_instruction=$19,
    account_statement_requirement=$20, electronic_transaction_statement=$21,
    share_email_with_rta=$22, annual_report_preference=$23,
    dividend_interest_ecs=$24, contract_note_preference=$25,
    trust_facility_instruction=$26, dis_at_account_opening=$27,
    standing_instruction_completed=TRUE, current_stage='nominee', updated_at=CURRENT_TIMESTAMP
  WHERE id=$1 RETURNING *`;
