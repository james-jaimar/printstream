
-- Add reference and po_number to label_orders
ALTER TABLE label_orders
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS po_number text;

-- Create spec confirmations table
CREATE TABLE IF NOT EXISTS label_order_spec_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES label_orders(id) ON DELETE CASCADE,
  spec_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  flagged_comment text,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(order_id, spec_key)
);

-- Enable RLS (edge function uses service role, so it bypasses RLS)
ALTER TABLE label_order_spec_confirmations ENABLE ROW LEVEL SECURITY;

-- No direct client access — all access goes through the edge function with service role key
-- Admin users can read spec confirmations via service role
CREATE POLICY "Service role full access to spec confirmations"
  ON label_order_spec_confirmations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_label_order_spec_confirmations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_label_order_spec_confirmations_updated_at
  BEFORE UPDATE ON label_order_spec_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION update_label_order_spec_confirmations_updated_at();
