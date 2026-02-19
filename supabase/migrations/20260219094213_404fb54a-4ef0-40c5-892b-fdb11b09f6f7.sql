
ALTER TABLE public.label_stock
ADD COLUMN glue_type text DEFAULT NULL
CHECK (glue_type IN ('Hot Melt', 'Acrylic'));

NOTIFY pgrst, 'reload schema';
