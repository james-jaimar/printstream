CREATE OR REPLACE FUNCTION public.get_dashboard_job_stats(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  wo_no text,
  customer text,
  status text,
  due_date text,
  proof_approved_at timestamp with time zone,
  current_stage_name text,
  current_stage_status text,
  current_stage_color text,
  display_stage_name text,
  workflow_progress numeric,
  category text,
  category_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- All authenticated users can view dashboard stats (read-only aggregate data)
  
  RETURN QUERY
  WITH current_stages AS (
    SELECT DISTINCT ON (jsi.job_id)
      jsi.job_id,
      jsi.production_stage_id,
      jsi.status as stage_status,
      ps.name as stage_name,
      ps.color as stage_color,
      jsi.stage_order
    FROM job_stage_instances jsi
    JOIN production_stages ps ON ps.id = jsi.production_stage_id
    WHERE jsi.status IN ('pending', 'active', 'awaiting_approval', 'changes_requested')
    ORDER BY jsi.job_id, jsi.stage_order DESC, jsi.created_at DESC
  ),
  workflow_stats AS (
    SELECT 
      jsi.job_id,
      COUNT(*) FILTER (WHERE jsi.status = 'completed') * 100.0 / NULLIF(COUNT(*), 0) as progress
    FROM job_stage_instances jsi
    GROUP BY jsi.job_id
  )
  SELECT 
    pj.id,
    pj.wo_no,
    pj.customer,
    COALESCE(pj.status, 'Unknown') as status,
    pj.due_date::text,
    pj.proof_approved_at,
    COALESCE(cs.stage_name, 'Not Started') as current_stage_name,
    COALESCE(cs.stage_status, 'pending') as current_stage_status,
    COALESCE(cs.stage_color, '#6B7280') as current_stage_color,
    COALESCE(cs.stage_name, 'Not Started') as display_stage_name,
    COALESCE(ws.progress, 0) as workflow_progress,
    c.name as category,
    c.color as category_color
  FROM production_jobs pj
  LEFT JOIN current_stages cs ON cs.job_id = pj.id
  LEFT JOIN workflow_stats ws ON ws.job_id = pj.id
  LEFT JOIN categories c ON c.id = pj.category_id
  ORDER BY pj.due_date ASC NULLS LAST, pj.created_at DESC;
END;
$$;