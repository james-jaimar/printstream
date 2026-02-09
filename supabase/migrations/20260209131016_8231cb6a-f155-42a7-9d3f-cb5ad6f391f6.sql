
-- Step 1: Add orientation, multi-page, and split support columns to label_items
ALTER TABLE public.label_items
  ADD COLUMN IF NOT EXISTS needs_rotation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS page_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES public.label_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_page_number integer;

-- Index for finding child items of a parent
CREATE INDEX IF NOT EXISTS idx_label_items_parent_item_id ON public.label_items(parent_item_id) WHERE parent_item_id IS NOT NULL;
