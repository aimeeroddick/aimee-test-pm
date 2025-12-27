-- Migration: Add my_day_date column for My Day feature
-- Run this in Supabase SQL Editor

-- Add my_day_date column to track manually added My Day tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS my_day_date DATE;

-- Create index for efficient my_day_date queries
CREATE INDEX IF NOT EXISTS idx_tasks_my_day_date ON tasks(my_day_date);

-- Add comment for clarity
COMMENT ON COLUMN tasks.my_day_date IS 'Date when task was manually added to My Day. Persists until task is completed or manually removed.';

-- Success message
SELECT 'my_day_date column added successfully!' as message;
