-- Helper function: count business hours elapsed since a given timestamp
-- Uses the existing is_working_day() function to skip weekends and public holidays
CREATE OR REPLACE FUNCTION public.count_business_hours_since(p_since timestamptz)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current timestamptz;
  v_now timestamptz := now();
  v_hours integer := 0;
  v_day_start integer := 8;  -- 8 AM SAST
  v_day_end integer := 17;   -- 5 PM SAST
  v_day_hours integer := 9;  -- hours per business day
  v_current_date date;
  v_is_working boolean;
BEGIN
  -- Work day by day from p_since to now
  v_current := p_since;
  
  -- For the first (partial) day
  v_current_date := (v_current AT TIME ZONE 'Africa/Johannesburg')::date;
  
  WHILE v_current_date <= (v_now AT TIME ZONE 'Africa/Johannesburg')::date LOOP
    -- Check if this date is a working day
    SELECT public.is_working_day(v_current_date) INTO v_is_working;
    
    IF v_is_working THEN
      IF v_current_date = (v_current AT TIME ZONE 'Africa/Johannesburg')::date 
         AND v_current_date = (v_now AT TIME ZONE 'Africa/Johannesburg')::date THEN
        -- Same day: count hours between start and now (clamped to business hours)
        v_hours := v_hours + GREATEST(0, 
          LEAST(EXTRACT(HOUR FROM v_now AT TIME ZONE 'Africa/Johannesburg')::integer, v_day_end)
          - GREATEST(EXTRACT(HOUR FROM v_current AT TIME ZONE 'Africa/Johannesburg')::integer, v_day_start)
        );
      ELSIF v_current_date = (v_current AT TIME ZONE 'Africa/Johannesburg')::date THEN
        -- First day: count remaining business hours
        v_hours := v_hours + GREATEST(0, 
          v_day_end - GREATEST(EXTRACT(HOUR FROM v_current AT TIME ZONE 'Africa/Johannesburg')::integer, v_day_start)
        );
      ELSIF v_current_date = (v_now AT TIME ZONE 'Africa/Johannesburg')::date THEN
        -- Last day: count business hours up to now
        v_hours := v_hours + GREATEST(0, 
          LEAST(EXTRACT(HOUR FROM v_now AT TIME ZONE 'Africa/Johannesburg')::integer, v_day_end) - v_day_start
        );
      ELSE
        -- Full business day in between
        v_hours := v_hours + v_day_hours;
      END IF;
    END IF;
    
    v_current_date := v_current_date + 1;
  END LOOP;
  
  RETURN v_hours;
END;
$$;