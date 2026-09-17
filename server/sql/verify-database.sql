-- Run this in pgAdmin after you connect to the kyc_master database.
SELECT current_database(), current_user;
SELECT to_regclass('public.kyc_master_details') AS kyc_master_details_table;
SELECT id, client_name, mobile_number, email, created_at
FROM kyc_master_details
ORDER BY id DESC
LIMIT 20;
