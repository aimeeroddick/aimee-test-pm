-- Migration: Add my_day_date column to tasks table
-- Run this in Supabase SQL Editor if upgrading from a previous version

-- Add the column (IF NOT EXISTS prevents errors if already added)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS my_day_date DATE;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_tasks_my_day_date ON tasks(my_day_date);

-- Verify
SELECT 'my_day_date column added successfully!' as message;
