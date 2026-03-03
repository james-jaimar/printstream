CREATE OR REPLACE FUNCTION public.scheduler_append_jobs(p_job_ids uuid[], p_only_if_unset boolean DEFAULT true)
 RETURNS TABLE(wrote_slots integer, updated_jsi integer, violations jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_time timestamptz;
  wrote_count integer := 0;
  updated_count integer := 0;
  validation_results jsonb := '[]'::jsonb;
  gap_filled_count integer := 0;
  
  r_job record;
  r_stage_group record;
  r_stage record;
  
  job_stage_barriers jsonb := '{}'::jsonb;
  resource_available_time timestamptz;
  stage_earliest_start timestamptz;
  placement_result record;
  slot_record jsonb;
  stage_end_time timestamptz;
  
  completed_barriers jsonb;
  cover_barrier_time timestamptz;
  text_barrier_time timestamptz;
  main_barrier_time timestamptz;
  barrier_key text;
  
  job_inserted_slot_ids uuid[];
  job_updated_stage_ids uuid[];
  job_failed boolean := false;
  inserted_slot_id uuid;
  
  -- Gap-filling variables
  gap_candidate record;
  best_gap record;
  original_start timestamptz;
  days_saved numeric;
  earliest_possible_start timestamptz;
  v_lookback_days integer;
  predecessor_end timestamptz;
  gap_filled_end timestamptz;
  
  -- Multi-pass convergence variables
  pass_iteration integer;
  moved_count integer;
  
  v_rows integer := 0;
  stage_start_time timestamptz;
BEGIN
  -- FIX: Use now() instead of forcing tomorrow, so jobs approved before 08:00 can schedule today
  base_time := public.next_working_start(now());
  RAISE NOTICE '🔄 Append jobs starting from: %', base_time;

  IF NOT p_only_if_unset THEN
    DELETE FROM stage_time_slots
    WHERE job_id = ANY(p_job_ids)
      AND COALESCE(is_completed, false) = false
      AND slot_start_time >= base_time;

    UPDATE job_stage_instances
    SET schedule_status = 'unscheduled',
        scheduled_start_at = NULL,
        scheduled_end_at = NULL,
        scheduled_minutes = NULL,
        updated_at = now()
    WHERE job_id = ANY(p_job_ids)
      AND status IN ('pending', 'on_hold')
      AND (NOT p_only_if_unset OR scheduled_start_at IS NULL);
  END IF;

  PERFORM public.create_stage_availability_tracker();

  completed_barriers := (
    SELECT jsonb_object_agg(job_id::text,
      jsonb_build_object(
        'main', COALESCE(main_end, base_time),
        'cover', COALESCE(cover_end, base_time),
        'text', COALESCE(text_end, base_time),
        'both', COALESCE(both_end, base_time)
      )
    )
    FROM (
      SELECT
        jsi.job_id,
        MAX(sts.slot_end_time) FILTER (WHERE jsi.part_assignment = 'both') AS both_end,
        MAX(sts.slot_end_time) FILTER (WHERE jsi.part_assignment IN ('cover', 'both')) AS cover_end,
        MAX(sts.slot_end_time) FILTER (WHERE jsi.part_assignment IN ('text', 'both')) AS text_end,
        MAX(sts.slot_end_time) FILTER (WHERE jsi.part_assignment = 'both') AS main_end
      FROM stage_time_slots sts
      JOIN job_stage_instances jsi ON jsi.id = sts.stage_instance_id
      WHERE sts.is_completed = true
        AND jsi.job_id = ANY(p_job_ids)
      GROUP BY jsi.job_id
    ) s
  );

  INSERT INTO _stage_tails(stage_id, next_available_time)
  SELECT
    production_stage_id,
    COALESCE(MAX(slot_end_time), base_time)
  FROM stage_time_slots
  WHERE slot_end_time >= base_time
  GROUP BY production_stage_id
  ON CONFLICT (stage_id) DO UPDATE SET
    next_available_time = GREATEST(EXCLUDED.next_available_time, _stage_tails.next_available_time);

  INSERT INTO _stage_tails(stage_id, next_available_time)
  SELECT DISTINCT
    jsi.production_stage_id,
    base_time
  FROM job_stage_instances jsi
  WHERE jsi.job_id = ANY(p_job_ids)
  ON CONFLICT (stage_id) DO NOTHING;

  RAISE NOTICE '📋 Phase 1: FIFO Scheduling for % jobs', array_length(p_job_ids, 1);

  -- PHASE 1: FIFO SCHEDULING
  FOR r_job IN
    SELECT 
      pj.id as job_id,
      pj.wo_no,
      pj.proof_approved_at,
      pj.category_id
    FROM production_jobs pj
    WHERE pj.id = ANY(p_job_ids)
      AND pj.proof_approved_at IS NOT NULL
    ORDER BY pj.proof_approved_at ASC
  LOOP
    job_inserted_slot_ids := ARRAY[]::uuid[];
    job_updated_stage_ids := ARRAY[]::uuid[];
    job_failed := false;

    barrier_key := r_job.job_id::text;
    completed_barriers := COALESCE(completed_barriers, '{}'::jsonb);

    IF completed_barriers ? barrier_key THEN
      cover_barrier_time := (completed_barriers->barrier_key->>'cover')::timestamptz;
      text_barrier_time := (completed_barriers->barrier_key->>'text')::timestamptz;
      main_barrier_time := (completed_barriers->barrier_key->>'main')::timestamptz;
    ELSE
      cover_barrier_time := base_time;
      text_barrier_time := base_time;
      main_barrier_time := base_time;
    END IF;

    FOR r_stage IN
      SELECT 
        jsi.id as stage_instance_id,
        jsi.production_stage_id,
        jsi.stage_order,
        jsi.part_assignment,
        jsi.status,
        public.jsi_minutes(jsi.scheduled_minutes, jsi.estimated_duration_minutes, jsi.remaining_minutes, jsi.completion_percentage) as duration_minutes,
        ps.name as stage_name,
        jsi.setup_time_minutes
      FROM job_stage_instances jsi
      JOIN production_stages ps ON ps.id = jsi.production_stage_id
      WHERE jsi.job_id = r_job.job_id
        AND jsi.status IN ('pending', 'on_hold')
        AND (NOT p_only_if_unset OR jsi.scheduled_start_at IS NULL)
        AND ps.name NOT ILIKE '%dtp%'
        AND ps.name NOT ILIKE '%proof%'
        AND ps.name NOT ILIKE '%batch%allocation%'
      ORDER BY jsi.stage_order ASC
    LOOP
      resource_available_time := (
        SELECT next_available_time
        FROM _stage_tails
        WHERE stage_id = r_stage.production_stage_id
      );

      IF resource_available_time IS NULL THEN
        resource_available_time := base_time;
      END IF;

      CASE 
        WHEN COALESCE(r_stage.part_assignment, 'both') = 'both' THEN
          stage_earliest_start := GREATEST(resource_available_time, main_barrier_time);
        WHEN r_stage.part_assignment = 'cover' THEN
          stage_earliest_start := GREATEST(resource_available_time, cover_barrier_time);
        WHEN r_stage.part_assignment = 'text' THEN
          stage_earliest_start := GREATEST(resource_available_time, text_barrier_time);
        ELSE
          stage_earliest_start := GREATEST(resource_available_time, main_barrier_time);
      END CASE;

      SELECT * INTO placement_result
      FROM public.place_duration_sql(
        stage_earliest_start,
        COALESCE(r_stage.duration_minutes, 0) + COALESCE(r_stage.setup_time_minutes, 0),
        60
      );

      IF NOT placement_result.placement_success THEN
        RAISE NOTICE '⏭️ Could not place stage % (order %), skipping', r_stage.stage_name, r_stage.stage_order;
        CONTINUE;
      END IF;

      FOR slot_record IN SELECT * FROM jsonb_array_elements(placement_result.slots_created)
      LOOP
        INSERT INTO stage_time_slots(
          production_stage_id, date, slot_start_time, slot_end_time,
          duration_minutes, job_id, job_table_name, stage_instance_id, is_completed
        )
        VALUES (
          r_stage.production_stage_id,
          (slot_record ->> 'date')::date,
          (slot_record ->> 'start_time')::timestamptz,
          (slot_record ->> 'end_time')::timestamptz,
          (slot_record ->> 'duration_minutes')::integer,
          r_job.job_id, 'production_jobs', r_stage.stage_instance_id, false
        )
        ON CONFLICT (production_stage_id, slot_start_time) DO NOTHING;
        
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN
          wrote_count := wrote_count + 1;
        ELSE
          RAISE NOTICE '⏭️ Phase 1 skipped conflicting slot: stage %, start %', 
            r_stage.production_stage_id, (slot_record->>'start_time')::timestamptz;
        END IF;
      END LOOP;

      SELECT MIN(slot_start_time), MAX(slot_end_time)
      INTO stage_start_time, stage_end_time
      FROM stage_time_slots
      WHERE stage_instance_id = r_stage.stage_instance_id
        AND COALESCE(is_completed, false) = false;

      IF stage_end_time IS NULL THEN
        RAISE NOTICE '⏭️ No slots inserted for stage % (Phase 1), skipping updates', r_stage.stage_instance_id;
        CONTINUE;
      END IF;

      UPDATE _stage_tails 
      SET next_available_time = stage_end_time
      WHERE stage_id = r_stage.production_stage_id;

      UPDATE job_stage_instances
      SET scheduled_start_at = stage_start_time,
          scheduled_end_at = stage_end_time,
          scheduled_minutes = COALESCE(r_stage.duration_minutes, 0) + COALESCE(r_stage.setup_time_minutes, 0),
          schedule_status = 'scheduled',
          updated_at = now()
      WHERE id = r_stage.stage_instance_id;
      updated_count := updated_count + 1;

      CASE 
        WHEN COALESCE(r_stage.part_assignment, 'both') = 'both' THEN
          main_barrier_time := stage_end_time;
        WHEN r_stage.part_assignment = 'cover' THEN
          cover_barrier_time := stage_end_time;
        WHEN r_stage.part_assignment = 'text' THEN
          text_barrier_time := stage_end_time;
        ELSE
          main_barrier_time := stage_end_time;
      END CASE;
    END LOOP;
  END LOOP;

  RAISE NOTICE '✅ Phase 1 complete: % slots written, % stages scheduled', wrote_count, updated_count;

  -- ============================================================
  -- PHASE 2: GAP-FILLING FOR NEWLY APPENDED JOBS ONLY
  -- ============================================================
  RAISE NOTICE '🔀 Phase 2: Gap-Filling newly appended jobs (up to 3 iterations, 960-min cap)';
  
  v_lookback_days := 90;
  
  FOR pass_iteration IN 1..3 LOOP
    moved_count := 0;
    
    RAISE NOTICE '🔀 Phase 2 Pass %/3 starting...', pass_iteration;
    
    FOR gap_candidate IN
      SELECT 
        jsi.id as stage_instance_id,
        jsi.job_id,
        jsi.production_stage_id,
        jsi.scheduled_start_at,
        jsi.scheduled_end_at,
        jsi.scheduled_minutes,
        jsi.stage_order,
        jsi.part_assignment,
        ps.name as stage_name,
        ps.allow_gap_filling,
        pj.wo_no
      FROM job_stage_instances jsi
      JOIN production_stages ps ON ps.id = jsi.production_stage_id
      JOIN production_jobs pj ON pj.id = jsi.job_id
      WHERE jsi.job_id = ANY(p_job_ids)  -- ⭐ ONLY GAP-FILL NEWLY APPENDED JOBS
        AND jsi.schedule_status = 'scheduled'
        AND ps.allow_gap_filling = true
        AND ps.name NOT IN ('DTP', 'PROOF', 'BATCH')
        AND jsi.scheduled_minutes IS NOT NULL
        AND jsi.scheduled_minutes <= 960
        AND jsi.scheduled_start_at IS NOT NULL
      ORDER BY 
        jsi.job_id,
        jsi.stage_order ASC,
        jsi.scheduled_start_at ASC
    LOOP
      original_start := gap_candidate.scheduled_start_at;
      
      -- CRITICAL: Calculate earliest_possible_start WITH PART-AWARE FILTERING
      SELECT COALESCE(MAX(jsi2.scheduled_end_at), base_time)
      INTO earliest_possible_start
      FROM job_stage_instances jsi2
      WHERE jsi2.job_id = gap_candidate.job_id
        AND jsi2.stage_order < gap_candidate.stage_order
        AND jsi2.scheduled_end_at IS NOT NULL
        AND (
          gap_candidate.part_assignment = 'both'
          OR jsi2.part_assignment = 'both'
          OR jsi2.part_assignment = gap_candidate.part_assignment
        );

      RAISE NOTICE '🔍 Part-aware predecessor check for % (part=%): earliest_possible=% (only checked %+both predecessors)',
        gap_candidate.stage_name, COALESCE(gap_candidate.part_assignment, 'main'), 
        earliest_possible_start, COALESCE(gap_candidate.part_assignment, 'main');
      
      SELECT * INTO best_gap
      FROM find_available_gaps(
        gap_candidate.production_stage_id,
        gap_candidate.scheduled_minutes,
        original_start,
        v_lookback_days,
        earliest_possible_start
      )
      WHERE gap_start >= earliest_possible_start
      ORDER BY gap_start ASC
      LIMIT 1;
      
      IF best_gap IS NOT NULL 
         AND best_gap.gap_start >= earliest_possible_start 
         AND best_gap.gap_start < original_start THEN
        
        days_saved := EXTRACT(EPOCH FROM (original_start - best_gap.gap_start)) / 86400.0;
        
        RAISE NOTICE '🔀 GAP-FILLING Pass %: Moving stage % (WO: %, order %, part=%) from % to % (saves %.2f days)',
          pass_iteration, gap_candidate.stage_name, gap_candidate.wo_no, gap_candidate.stage_order,
          COALESCE(gap_candidate.part_assignment, 'main'), original_start, best_gap.gap_start, days_saved;
        
        DELETE FROM stage_time_slots 
        WHERE stage_instance_id = gap_candidate.stage_instance_id
          AND COALESCE(is_completed, false) = false;
        
        SELECT * INTO placement_result
        FROM public.place_duration_sql(
          best_gap.gap_start,
          gap_candidate.scheduled_minutes,
          60
        );
        
        IF placement_result.placement_success THEN
          FOR slot_record IN SELECT * FROM jsonb_array_elements(placement_result.slots_created)
          LOOP
            INSERT INTO stage_time_slots(
              production_stage_id, date, slot_start_time, slot_end_time,
              duration_minutes, job_id, job_table_name, stage_instance_id, is_completed
            )
            VALUES (
              gap_candidate.production_stage_id,
              (slot_record ->> 'date')::date,
              (slot_record ->> 'start_time')::timestamptz,
              (slot_record ->> 'end_time')::timestamptz,
              (slot_record ->> 'duration_minutes')::integer,
              gap_candidate.job_id, 'production_jobs', gap_candidate.stage_instance_id, false
            )
            ON CONFLICT (production_stage_id, slot_start_time) DO NOTHING;
            
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            IF v_rows = 0 THEN
              RAISE NOTICE '⏭️ Phase 2 skipped conflicting slot: stage %, start %', 
                gap_candidate.production_stage_id, (slot_record->>'start_time')::timestamptz;
            END IF;
          END LOOP;
          
          SELECT MIN(slot_start_time), MAX(slot_end_time)
          INTO stage_start_time, gap_filled_end
          FROM stage_time_slots
          WHERE stage_instance_id = gap_candidate.stage_instance_id
            AND COALESCE(is_completed, false) = false;
          
          IF gap_filled_end IS NOT NULL THEN
            UPDATE job_stage_instances
            SET 
              scheduled_start_at = stage_start_time,
              scheduled_end_at = gap_filled_end,
              updated_at = now()
            WHERE id = gap_candidate.stage_instance_id;
            
            INSERT INTO schedule_gap_fills(
              job_id, stage_instance_id, production_stage_id,
              original_scheduled_start, gap_filled_start, days_saved,
              minutes_saved, scheduler_run_type
            )
            VALUES (
              gap_candidate.job_id, gap_candidate.stage_instance_id, gap_candidate.production_stage_id,
              original_start, best_gap.gap_start, days_saved,
              (days_saved * 1440)::integer, 'append_jobs'  -- ⭐ DIFFERENT RUN TYPE
            );
            
            gap_filled_count := gap_filled_count + 1;
            moved_count := moved_count + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Phase 2 Pass %/3 complete: % stages moved in this pass', pass_iteration, moved_count;
    
    IF moved_count = 0 THEN
      RAISE NOTICE '🎯 Phase 2 converged after % passes', pass_iteration;
      EXIT;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Phase 2 complete: % total stages gap-filled', gap_filled_count;
  RAISE NOTICE '📊 FINAL: % total slots written, % stages updated, % gap-filled', wrote_count, updated_count, gap_filled_count;

  RETURN QUERY SELECT wrote_count, updated_count, validation_results;
END;
$function$;