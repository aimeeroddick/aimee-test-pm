-- Backfill Script: Set my_day_date for existing tasks that qualify
-- Date: 2026-01-06
-- Description: One-time script to update existing tasks that should be in My Day
-- 
-- RUN THIS ONCE after applying the migration, then you can delete this file

-- First, let's see how many tasks will be affected (preview)
SELECT 
  COUNT(*) as tasks_to_update,
  COUNT(DISTINCT pr.user_id) as users_affected
FROM tasks t
JOIN projects pr ON t.project_id = pr.id
JOIN profiles p ON p.id = pr.user_id
WHERE t.status != 'done'
  AND (
    (t.start_date IS NOT NULL AND t.start_date <= (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
    OR (t.due_date IS NOT NULL AND t.due_date <= (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
  )
  AND (t.my_day_date IS NULL OR t.my_day_date < (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date)
  AND (
    t.removed_from_myday_at IS NULL 
    OR (t.removed_from_myday_at AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date < (NOW() AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date
  );

-- If the preview looks good, run the actual update:

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

-- Verify the update
SELECT 
  'Backfill complete!' as status,
  COUNT(*) as tasks_now_in_my_day
FROM tasks
WHERE my_day_date = CURRENT_DATE
  AND status != 'done';
