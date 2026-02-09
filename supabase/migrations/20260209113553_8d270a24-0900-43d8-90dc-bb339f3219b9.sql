-- Clear user_id references from label_customer_contacts
UPDATE label_customer_contacts SET user_id = NULL WHERE user_id IS NOT NULL;

-- Remove customer entries from user_roles and profiles
DELETE FROM user_roles WHERE user_id IN (
  '6396a811-2807-473c-b429-437a75ec161c',
  '2182756a-51c7-40c9-be51-dc2d6c44ccd9',
  '722e154c-6716-42c6-af09-76024812e77c',
  'e6f69018-c10d-441d-bc68-e44084c0192b'
);
DELETE FROM profiles WHERE id IN (
  '6396a811-2807-473c-b429-437a75ec161c',
  '2182756a-51c7-40c9-be51-dc2d6c44ccd9',
  '722e154c-6716-42c6-af09-76024812e77c',
  'e6f69018-c10d-441d-bc68-e44084c0192b'
);

-- Simplify is_label_client to always return false
CREATE OR REPLACE FUNCTION public.is_label_client(check_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT false $$;