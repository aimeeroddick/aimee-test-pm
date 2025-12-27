-- Migration v5: Add completed_at timestamp for streak tracking

-- Add completed_at column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Backfill completed_at for existing done tasks (use updated_at as approximation)
UPDATE tasks 
SET completed_at = updated_at 
WHERE status = 'done' AND completed_at IS NULL;

-- Create index for efficient streak queries
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_completed ON tasks(status, completed_at);
