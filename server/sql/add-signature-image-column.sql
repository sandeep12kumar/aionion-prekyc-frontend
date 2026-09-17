-- Run this once in the kyc_master database before using the signature-image upload API.
ALTER TABLE kyc_master_details
ADD COLUMN IF NOT EXISTS signature_image_path TEXT;
