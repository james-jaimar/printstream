-- Add saved_layout column to store the selected layout option as JSONB
ALTER TABLE public.label_orders
ADD COLUMN saved_layout jsonb DEFAULT NULL;

COMMENT ON COLUMN public.label_orders.saved_layout IS 'Stores the selected LayoutOption from the AI optimizer for quoting purposes';