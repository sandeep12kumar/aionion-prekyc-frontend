-- Run this once in the kyc_master database before using the PAN-image upload API.
ALTER TABLE kyc_master_details
ADD COLUMN IF NOT EXISTS pan_image_path TEXT;
