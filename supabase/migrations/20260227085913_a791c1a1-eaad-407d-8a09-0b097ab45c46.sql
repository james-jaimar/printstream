
-- Update the inner function to return payment_status and payment_hold_reason
DROP FUNCTION IF EXISTS get_user_accessible_jobs_with_batch_allocation(uuid, text, text, text);

CREATE OR REPLACE FUNCTION get_user_accessible_jobs_with_batch_allocation(
  p_user_id uuid,
  p_permission_type text DEFAULT 'work',
  p_status_filter text DEFAULT NULL,
  p_stage_filter text DEFAULT NULL
)
RETURNS TABLE(
  job_id uuid,
  id uuid,
  wo_no text,
  customer text,
  contact text,
  status text,
  due_date text,
  reference text,
  category_id uuid,
  category_name text,
  category_color text,
  current_stage_id uuid,
  current_stage_name text,
  current_stage_color text,
  current_stage_status text,
  user_can_view boolean,
  user_can_edit boolean,
  user_can_work boolean,
  user_can_manage boolean,
  workflow_progress numeric,
  total_stages integer,
  completed_stages integer,
  display_stage_name text,
  qty integer,
  has_custom_workflow boolean,
  manual_due_date text,
  batch_category text,
  is_in_batch_processing boolean,
  started_by uuid,
  started_by_name text,
  proof_emailed_at timestamptz,
  proof_approved_at timestamptz,
  is_batch_master boolean,
  batch_name text,
  constituent_job_count integer,
  parallel_stages jsonb,
  current_stage_order integer,
  payment_status text,
  payment_hold_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH job_current_stages AS (
    SELECT DISTINCT ON (jsi.job_id)
      jsi.job_id,
      jsi.production_stage_id,
      jsi.status as stage_status,
      jsi.started_by,
      jsi.proof_emailed_at,
      jsi.stage_order,
      ps.name as stage_name,
      ps.color as stage_color
    FROM job_stage_instances jsi
    JOIN production_stages ps ON jsi.production_stage_id = ps.id
    WHERE jsi.job_table_name = 'production_jobs'
      AND COALESCE(jsi.status, 'pending') IN ('pending', 'active', 'awaiting_approval', 'changes_requested')
    ORDER BY jsi.job_id, jsi.stage_order ASC
  ),
  user_permissions AS (
    SELECT 
      jcs.job_id,
      COALESCE(bool_or(usp.can_view), false) as can_view,
      COALESCE(bool_or(usp.can_edit), false) as can_edit,
      COALESCE(bool_or(usp.can_work), false) as can_work,
      COALESCE(bool_or(usp.can_manage), false) as can_manage
    FROM job_current_stages jcs
    LEFT JOIN user_stage_permissions usp
      ON usp.production_stage_id = jcs.production_stage_id 
      AND usp.user_id = p_user_id
    GROUP BY jcs.job_id
  )
  SELECT 
    pj.id as job_id,
    pj.id,
    pj.wo_no,
    pj.customer,
    pj.contact,
    pj.status,
    pj.due_date::text,
    pj.reference,
    pj.category_id,
    COALESCE(c.name, 'Unknown') as category_name,
    COALESCE(c.color, '#6B7280') as category_color,
    jcs.production_stage_id as current_stage_id,
    COALESCE(jcs.stage_name, 'No Stage') as current_stage_name,
    COALESCE(jcs.stage_color, '#6B7280') as current_stage_color,
    COALESCE(jcs.stage_status, 'pending') as current_stage_status,
    up.can_view as user_can_view,
    up.can_edit as user_can_edit,
    up.can_work as user_can_work,
    up.can_manage as user_can_manage,
    COALESCE(
      (SELECT COUNT(*)::numeric * 100.0 / NULLIF(COUNT(*) FILTER (WHERE j2.status != 'completed'), 0)
       FROM job_stage_instances j2 
       WHERE j2.job_id = pj.id AND j2.job_table_name = 'production_jobs'
       AND j2.status = 'completed'), 
      0
    ) as workflow_progress,
    (SELECT COUNT(*)::integer FROM job_stage_instances j3 WHERE j3.job_id = pj.id AND j3.job_table_name = 'production_jobs') as total_stages,
    (SELECT COUNT(*)::integer FROM job_stage_instances j4 WHERE j4.job_id = pj.id AND j4.job_table_name = 'production_jobs' AND j4.status = 'completed') as completed_stages,
    COALESCE(jcs.stage_name, 'No Stage') as display_stage_name,
    pj.qty,
    COALESCE(pj.has_custom_workflow, false) as has_custom_workflow,
    pj.manual_due_date::text,
    pj.batch_category,
    (pj.status = 'In Batch Processing') as is_in_batch_processing,
    jcs.started_by,
    COALESCE(p.full_name, 'Unknown') as started_by_name,
    jcs.proof_emailed_at,
    pj.proof_approved_at,
    COALESCE(pj.is_batch_master, false) as is_batch_master,
    NULL::text as batch_name,
    0::integer as constituent_job_count,
    '[]'::jsonb as parallel_stages,
    jcs.stage_order as current_stage_order,
    COALESCE(pj.payment_status, 'paid') as payment_status,
    pj.payment_hold_reason
  FROM production_jobs pj
  LEFT JOIN categories c ON pj.category_id = c.id
  LEFT JOIN job_current_stages jcs ON jcs.job_id = pj.id
  LEFT JOIN user_permissions up ON up.job_id = pj.id
  LEFT JOIN profiles p ON jcs.started_by = p.id
  WHERE (p_status_filter IS NULL OR pj.status = p_status_filter)
    AND (p_stage_filter IS NULL OR jcs.stage_name ILIKE '%' || p_stage_filter || '%')
    AND (
      CASE p_permission_type
        WHEN 'view' THEN up.can_view
        WHEN 'edit' THEN up.can_edit
        WHEN 'work' THEN up.can_work
        WHEN 'manage' THEN up.can_manage
        ELSE false
      END
    )
  ORDER BY pj.due_date ASC, pj.created_at ASC;
END;
$$;

-- Update the wrapper function to pass through payment columns
DROP FUNCTION IF EXISTS get_user_accessible_jobs(uuid, text, text, text);

CREATE OR REPLACE FUNCTION get_user_accessible_jobs(
  p_user_id uuid,
  p_permission_type text DEFAULT 'work',
  p_status_filter text DEFAULT NULL,
  p_stage_filter text DEFAULT NULL
)
RETURNS TABLE(
  job_id uuid,
  wo_no text,
  customer text,
  contact text,
  status text,
  due_date text,
  reference text,
  category_id uuid,
  category_name text,
  category_color text,
  current_stage_id uuid,
  current_stage_name text,
  current_stage_color text,
  current_stage_status text,
  user_can_view boolean,
  user_can_edit boolean,
  user_can_work boolean,
  user_can_manage boolean,
  workflow_progress numeric,
  total_stages integer,
  completed_stages integer,
  display_stage_name text,
  qty integer,
  started_by uuid,
  started_by_name text,
  proof_emailed_at timestamptz,
  proof_approved_at timestamptz,
  payment_status text,
  payment_hold_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.job_id,
    t.wo_no,
    t.customer,
    t.contact,
    t.status,
    t.due_date,
    t.reference,
    t.category_id,
    t.category_name,
    t.category_color,
    t.current_stage_id,
    t.current_stage_name,
    t.current_stage_color,
    t.current_stage_status,
    t.user_can_view,
    t.user_can_edit,
    t.user_can_work,
    t.user_can_manage,
    t.workflow_progress,
    t.total_stages,
    t.completed_stages,
    t.display_stage_name,
    t.qty,
    t.started_by,
    t.started_by_name,
    t.proof_emailed_at,
    t.proof_approved_at,
    t.payment_status,
    t.payment_hold_reason
  FROM get_user_accessible_jobs_with_batch_allocation(
    p_user_id,
    p_permission_type,
    p_status_filter,
    p_stage_filter
  ) t;
END;
$$;
