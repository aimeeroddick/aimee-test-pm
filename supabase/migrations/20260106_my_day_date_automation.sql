-- Migration: Automatic my_day_date assignment
-- Date: 2026-01-06
-- Description: Automatically sets my_day_date when tasks qualify for My Day based on start_date or due_date
-- This ensures all My Day queries can simply filter on my_day_date = today

-- ============================================
-- PART 1: Trigger Function
-- ============================================

-- Function to automatically set my_day_date when task qualifies for My Day
CREATE OR REPLACE FUNCTION set_my_day_date_automatically()
RETURNS TRIGGER AS $$
DECLARE
  user_timezone TEXT;
  user_today DATE;
BEGIN
  -- Skip if task is done
  IF NEW.status = 'done' THEN
    RETURN NEW;
  END IF;
  
  -- Get user's timezone from their profile (via project ownership)
  SELECT COALESCE(p.timezone, 'America/New_York') INTO user_timezone
  FROM projects pr
  JOIN profiles p ON p.id = pr.user_id
  WHERE pr.id = NEW.project_id;
  
  -- Calculate "today" in user's timezone
  user_today := (NOW() AT TIME ZONE COALESCE(user_timezone, 'America/New_York'))::date;
  
  -- Check if user removed this task from My Day today - if so, don't auto-add
  IF NEW.removed_from_myday_at IS NOT NULL 
     AND (NEW.removed_from_myday_at AT TIME ZONE COALESCE(user_timezone, 'America/New_York'))::date = user_today THEN
    RETURN NEW;
  END IF;
  
  -- If my_day_date is already set to today, leave it alone
  IF NEW.my_day_date = user_today THEN
    RETURN NEW;
  END IF;
  
  -- Auto-set my_day_date if start_date or due_date qualifies
  IF (NEW.start_date IS NOT NULL AND NEW.start_date <= user_today)
     OR (NEW.due_date IS NOT NULL AND NEW.due_date <= user_today) THEN
    NEW.my_day_date := user_today;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_my_day_date_automatically() IS 
  'Automatically sets my_day_date when a task qualifies for My Day based on start_date or due_date. Respects removed_from_myday_at to avoid re-adding tasks the user explicitly removed today.';

-- ============================================
-- PART 2: Create Trigger
-- ============================================

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_set_my_day_date ON tasks;

-- Create trigger that fires on insert or update of relevant fields
CREATE TRIGGER trigger_set_my_day_date
  BEFORE INSERT OR UPDATE OF start_date, due_date, status
  ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_my_day_date_automatically();

-- ============================================
-- PART 3: Daily Scheduled Job Function
-- ============================================

-- Function to run daily to set my_day_date for qualifying tasks
-- This catches tasks that become eligible at midnight (e.g., start_date = tomorrow becomes today)
CREATE OR REPLACE FUNCTION refresh_my_day_dates()
RETURNS void AS $$
BEGIN
  -- Update tasks where:
  -- 1. Task is not done
  -- 2. start_date or due_date qualifies (is today or earlier in user's timezone)
  -- 3. my_day_date is not already set to today
  -- 4. User hasn't removed it from My Day today
  UPDATE tasks t
  SET my_day_date = (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date
  FROM projects pr
  JOIN profiles p ON p.id = pr.user_id
  WHERE t.project_id = pr.id
    AND t.status != 'done'
    AND (
      (t.start_date IS NOT NULL AND t.start_date <= (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
      OR (t.due_date IS NOT NULL AND t.due_date <= (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
    )
    AND (t.my_day_date IS NULL OR t.my_day_date < (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
    AND (
      t.removed_from_myday_at IS NULL 
      OR (t.removed_from_myday_at AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date < (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_my_day_dates() IS 
  'Daily job to refresh my_day_date for all qualifying tasks. Run at 5am UTC to cover midnight for most US timezones.';

-- ============================================
-- PART 4: Schedule the Daily Job (pg_cron)
-- ============================================

-- Note: pg_cron extension must be enabled in Supabase Dashboard first
-- Go to Database > Extensions > Search "pg_cron" > Enable

-- Remove existing job if it exists (for idempotency)
SELECT cron.unschedule('refresh-my-day-dates')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-my-day-dates'
);

-- Schedule the job to run daily at 5am UTC
SELECT cron.schedule(
  'refresh-my-day-dates',           -- job name
  '0 5 * * *',                       -- cron expression: 5:00 AM UTC daily
  'SELECT refresh_my_day_dates()'   -- SQL to execute
);
