
-- Add new columns to label_dielines
ALTER TABLE public.label_dielines 
  ADD COLUMN IF NOT EXISTS die_no text,
  ADD COLUMN IF NOT EXISTS rpl text,
  ADD COLUMN IF NOT EXISTS die_type text DEFAULT 'rectangle',
  ADD COLUMN IF NOT EXISTS client text;

-- Unique index on die_no where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_label_dielines_die_no 
  ON public.label_dielines (die_no) WHERE die_no IS NOT NULL;
