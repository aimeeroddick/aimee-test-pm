-- Trackli Database Migration v4
-- Adds: Subtasks as JSONB column in tasks table, archived column for projects

-- Add subtasks column to tasks table (JSONB for flexibility)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;

-- Add archived column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- The subtasks column stores an array of objects like:
-- [
--   { "id": "uuid", "title": "Subtask name", "completed": false },
--   { "id": "uuid", "title": "Another subtask", "completed": true }
-- ]

-- No RLS changes needed since subtasks inherit task permissions

SELECT 'Migration v4 completed successfully - subtasks and archived columns added!' as message;
