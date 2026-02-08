-- Make user_id and contact_email nullable for company records
-- (only contacts have user_id linked, companies are just metadata)

ALTER TABLE public.label_customers 
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.label_customers 
  ALTER COLUMN contact_email DROP NOT NULL;