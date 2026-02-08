-- Create label_customer_contacts table for multiple contacts per customer
CREATE TABLE public.label_customer_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.label_customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'contact',
  receives_proofs BOOLEAN DEFAULT true,
  receives_notifications BOOLEAN DEFAULT true,
  can_approve_proofs BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.label_customer_contacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies using the existing security definer function
CREATE POLICY "Staff can manage all contacts"
  ON public.label_customer_contacts
  FOR ALL
  TO authenticated
  USING (NOT public.is_label_client(auth.uid()))
  WITH CHECK (NOT public.is_label_client(auth.uid()));

CREATE POLICY "Clients can view own contacts"
  ON public.label_customer_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.label_customers lc
      WHERE lc.id = label_customer_contacts.customer_id
      AND lc.user_id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_label_customer_contacts_updated_at
  BEFORE UPDATE ON public.label_customer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_label_customer_contacts_customer_id ON public.label_customer_contacts(customer_id);
CREATE INDEX idx_label_customer_contacts_email ON public.label_customer_contacts(email);