-- Trackli Database Migration v2
-- Adds: Recurrence, Dependencies, and Blocked Status
-- Run this in the Supabase SQL Editor AFTER the initial schema

-- ============================================
-- ADD RECURRENCE FIELDS TO TASKS
-- ============================================
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS recurrence_type TEXT CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for recurrence lookups
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_parent ON tasks(recurrence_parent_id);

-- ============================================
-- TASK DEPENDENCIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    depends_on_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id, depends_on_id),
    CHECK (task_id != depends_on_id) -- Can't depend on itself
);

-- Enable Row Level Security
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- Users can manage dependencies on tasks in their own projects
CREATE POLICY "Users can view task dependencies" ON task_dependencies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_dependencies.task_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert task dependencies" ON task_dependencies
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_dependencies.task_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete task dependencies" ON task_dependencies
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM tasks 
            JOIN projects ON projects.id = tasks.project_id
            WHERE tasks.id = task_dependencies.task_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id);

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Migration v2 completed successfully!' as message;
