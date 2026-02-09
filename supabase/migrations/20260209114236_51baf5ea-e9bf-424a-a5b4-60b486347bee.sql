
-- Create label_client_auth table for independent customer portal authentication
CREATE TABLE public.label_client_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL UNIQUE REFERENCES public.label_customer_contacts(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS with NO policies (only accessed via service role in edge functions)
ALTER TABLE public.label_client_auth ENABLE ROW LEVEL SECURITY;

-- Update timestamp trigger
CREATE TRIGGER update_label_client_auth_updated_at
  BEFORE UPDATE ON public.label_client_auth
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
