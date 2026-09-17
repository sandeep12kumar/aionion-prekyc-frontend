ALTER TABLE kyc_master_details ADD COLUMN IF NOT EXISTS kra_name VARCHAR(100);
ALTER TABLE kyc_master_details ADD COLUMN IF NOT EXISTS kra_status VARCHAR(100);
ALTER TABLE kyc_master_details ADD COLUMN IF NOT EXISTS itr_last_name VARCHAR(150);
