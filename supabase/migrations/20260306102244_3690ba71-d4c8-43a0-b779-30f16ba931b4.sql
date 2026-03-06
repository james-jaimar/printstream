
CREATE OR REPLACE FUNCTION public.get_mapping_library_stats()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total', count(*),
    'verified', count(*) FILTER (WHERE is_verified),
    'unverified', count(*) FILTER (WHERE NOT is_verified),
    'production_stages', count(*) FILTER (WHERE mapping_type = 'production_stage'),
    'paper_specs', count(*) FILTER (WHERE mapping_type = 'paper_specification'),
    'delivery_specs', count(*) FILTER (WHERE mapping_type = 'delivery_specification')
  )
  FROM excel_import_mappings;
$$;
