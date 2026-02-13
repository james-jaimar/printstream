ALTER TABLE public.label_client_auth
  ADD COLUMN IF NOT EXISTS password_reset_token uuid,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;