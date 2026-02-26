
-- Add rework tracking columns to production_jobs
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS rework_qty integer,
  ADD COLUMN IF NOT EXISTS rework_percentage numeric,
  ADD COLUMN IF NOT EXISTS rework_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS rework_requested_by uuid;

-- Add payment hold columns to production_jobs
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS payment_hold_reason text,
  ADD COLUMN IF NOT EXISTS payment_held_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_released_by uuid;

-- Add index for payment status filtering
CREATE INDEX IF NOT EXISTS idx_production_jobs_payment_status ON public.production_jobs(payment_status);
