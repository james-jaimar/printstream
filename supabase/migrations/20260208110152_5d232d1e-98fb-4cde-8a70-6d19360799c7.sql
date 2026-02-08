-- Add bleed fields to label_dielines table for asymmetric bleed support
ALTER TABLE public.label_dielines
ADD COLUMN IF NOT EXISTS bleed_left_mm numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS bleed_right_mm numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS bleed_top_mm numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS bleed_bottom_mm numeric DEFAULT 1.5;

-- Create label-files storage bucket for PDF uploads
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES ('label-files', 'label-files', true, ARRAY['application/pdf', 'image/png', 'image/jpeg'], 52428800)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for label-files bucket
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads to label-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'label-files');

-- Allow authenticated users to read files
CREATE POLICY "Allow authenticated reads from label-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'label-files');

-- Allow public read access for label files (for preview/download)
CREATE POLICY "Allow public reads from label-files"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'label-files');

-- Allow authenticated users to update their uploads
CREATE POLICY "Allow authenticated updates to label-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'label-files');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Allow authenticated deletes from label-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'label-files');