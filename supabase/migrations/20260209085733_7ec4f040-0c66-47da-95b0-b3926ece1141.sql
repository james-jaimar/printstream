-- Add proofing status to label_items
ALTER TABLE label_items
ADD COLUMN IF NOT EXISTS proofing_status text DEFAULT 'draft' 
  CHECK (proofing_status IN ('draft', 'ready_for_proof', 'awaiting_client', 'client_needs_upload', 'approved'));

-- Add artwork_issue field for admin feedback to client
ALTER TABLE label_items
ADD COLUMN IF NOT EXISTS artwork_issue text;

-- Create table to track proofing requests per order
CREATE TABLE IF NOT EXISTS label_proofing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES label_orders(id) ON DELETE CASCADE NOT NULL,
  requested_by uuid,
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'approved', 'changes_needed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create table to track which contacts were notified
CREATE TABLE IF NOT EXISTS label_proofing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES label_proofing_requests(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES label_customer_contacts(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  sent_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(request_id, contact_id)
);

-- Enable RLS on new tables
ALTER TABLE label_proofing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_proofing_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for proofing_requests
CREATE POLICY "Admin users can manage proofing requests"
ON label_proofing_requests
FOR ALL
USING (true)
WITH CHECK (true);

-- RLS policies for proofing_notifications
CREATE POLICY "Admin users can manage proofing notifications"
ON label_proofing_notifications
FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_label_proofing_requests_order_id ON label_proofing_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_label_proofing_notifications_request_id ON label_proofing_notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_label_items_proofing_status ON label_items(proofing_status);

-- Update timestamp trigger for proofing_requests
CREATE TRIGGER update_label_proofing_requests_updated_at
  BEFORE UPDATE ON label_proofing_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();