-- Migration: Fix RLS Performance and Add Missing Indexes
-- 1. Fix auth.uid() -> (select auth.uid()) for better query planning
-- 2. Add missing foreign key indexes
-- 3. Remove duplicate policies from user_list_items

-- ============================================================================
-- STEP 1: Remove duplicate policies from user_list_items
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete their own list items" ON user_list_items;
DROP POLICY IF EXISTS "Users can insert their own list items" ON user_list_items;
DROP POLICY IF EXISTS "Users can update their own list items" ON user_list_items;
DROP POLICY IF EXISTS "Users can view their own list items" ON user_list_items;

-- ============================================================================
-- STEP 2: Add missing foreign key indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_spark_analytics_user_id ON spark_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_tasks_project_id ON pending_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_pending_tasks_email_source_id ON pending_tasks(email_source_id);
CREATE INDEX IF NOT EXISTS idx_pending_tasks_assignee_id ON pending_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_task_id ON feedback(task_id);
CREATE INDEX IF NOT EXISTS idx_email_extraction_analytics_user_id ON email_extraction_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_email_extraction_analytics_email_source_id ON email_extraction_analytics(email_source_id);

-- ============================================================================
-- STEP 3: Recreate RLS policies with (select auth.uid()) for performance
-- ============================================================================

-- attachments
DROP POLICY IF EXISTS "Users can delete attachments" ON attachments;
DROP POLICY IF EXISTS "Users can view attachments" ON attachments;
CREATE POLICY "Users can delete attachments" ON attachments FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = attachments.task_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view attachments" ON attachments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = attachments.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- email_attachments
DROP POLICY IF EXISTS "Users can view own email attachments" ON email_attachments;
CREATE POLICY "Users can view own email attachments" ON email_attachments FOR SELECT USING (
    email_source_id IN (
        SELECT email_sources.id FROM email_sources
        WHERE email_sources.user_id = (select auth.uid())
    )
);

-- email_extraction_analytics
DROP POLICY IF EXISTS "Users can view own analytics" ON email_extraction_analytics;
CREATE POLICY "Users can view own analytics" ON email_extraction_analytics FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- email_sources
DROP POLICY IF EXISTS "Users can delete own email sources" ON email_sources;
DROP POLICY IF EXISTS "Users can view own email sources" ON email_sources;
CREATE POLICY "Users can delete own email sources" ON email_sources FOR DELETE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own email sources" ON email_sources FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- email_tokens
DROP POLICY IF EXISTS "Users can view own token" ON email_tokens;
CREATE POLICY "Users can view own token" ON email_tokens FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- feedback
DROP POLICY IF EXISTS "Admin can read all feedback" ON feedback;
DROP POLICY IF EXISTS "Admin can update feedback" ON feedback;
CREATE POLICY "Admin can read all feedback" ON feedback FOR SELECT USING (
    (select auth.uid()) = ANY (ARRAY['93e06390-daeb-4866-bb32-5becfdb5fb08'::uuid, '012957ee-b988-42d7-968e-d7385d49b72f'::uuid])
);
CREATE POLICY "Admin can update feedback" ON feedback FOR UPDATE USING (
    (select auth.uid()) = ANY (ARRAY['93e06390-daeb-4866-bb32-5becfdb5fb08'::uuid, '012957ee-b988-42d7-968e-d7385d49b72f'::uuid])
);

-- pending_tasks
DROP POLICY IF EXISTS "Users can delete own pending tasks" ON pending_tasks;
DROP POLICY IF EXISTS "Users can update own pending tasks" ON pending_tasks;
DROP POLICY IF EXISTS "Users can view own pending tasks" ON pending_tasks;
CREATE POLICY "Users can delete own pending tasks" ON pending_tasks FOR DELETE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can update own pending tasks" ON pending_tasks FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own pending tasks" ON pending_tasks FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (
    (select auth.uid()) = id
);
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (
    (select auth.uid()) = id
);

-- project_customers
DROP POLICY IF EXISTS "Users can delete project customers" ON project_customers;
DROP POLICY IF EXISTS "Users can update project customers" ON project_customers;
DROP POLICY IF EXISTS "Users can view project customers" ON project_customers;
CREATE POLICY "Users can delete project customers" ON project_customers FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_customers.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can update project customers" ON project_customers FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_customers.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view project customers" ON project_customers FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_customers.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- project_members
DROP POLICY IF EXISTS "Users can delete project members" ON project_members;
DROP POLICY IF EXISTS "Users can update project members" ON project_members;
DROP POLICY IF EXISTS "Users can view project members" ON project_members;
CREATE POLICY "Users can delete project members" ON project_members FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_members.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can update project members" ON project_members FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_members.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view project members" ON project_members FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_members.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- project_tags
DROP POLICY IF EXISTS "Users can delete project tags" ON project_tags;
DROP POLICY IF EXISTS "Users can update project tags" ON project_tags;
DROP POLICY IF EXISTS "Users can view project tags" ON project_tags;
CREATE POLICY "Users can delete project tags" ON project_tags FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_tags.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can update project tags" ON project_tags FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_tags.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view project tags" ON project_tags FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = project_tags.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- projects
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- slack_connections
DROP POLICY IF EXISTS "Users can delete own slack connection" ON slack_connections;
DROP POLICY IF EXISTS "Users can update own slack connection" ON slack_connections;
DROP POLICY IF EXISTS "Users can view own slack connection" ON slack_connections;
CREATE POLICY "Users can delete own slack connection" ON slack_connections FOR DELETE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can update own slack connection" ON slack_connections FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own slack connection" ON slack_connections FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- task_dependencies
DROP POLICY IF EXISTS "Users can delete task dependencies" ON task_dependencies;
DROP POLICY IF EXISTS "Users can view task dependencies" ON task_dependencies;
CREATE POLICY "Users can delete task dependencies" ON task_dependencies FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_dependencies.task_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view task dependencies" ON task_dependencies FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_dependencies.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- task_tags
DROP POLICY IF EXISTS "Users can delete task tags" ON task_tags;
DROP POLICY IF EXISTS "Users can view task tags" ON task_tags;
CREATE POLICY "Users can delete task tags" ON task_tags FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_tags.task_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view task tags" ON task_tags FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM tasks
        JOIN projects ON projects.id = tasks.project_id
        WHERE tasks.id = task_tags.task_id
        AND projects.user_id = (select auth.uid())
    )
);

-- tasks
DROP POLICY IF EXISTS "Users can delete tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks" ON tasks;
CREATE POLICY "Users can delete tasks" ON tasks FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = tasks.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can update tasks" ON tasks FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = tasks.project_id
        AND projects.user_id = (select auth.uid())
    )
);
CREATE POLICY "Users can view tasks" ON tasks FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = tasks.project_id
        AND projects.user_id = (select auth.uid())
    )
);

-- user_list_items (keep only one set of policies)
DROP POLICY IF EXISTS "Users can delete own list items" ON user_list_items;
DROP POLICY IF EXISTS "Users can update own list items" ON user_list_items;
DROP POLICY IF EXISTS "Users can view own list items" ON user_list_items;
CREATE POLICY "Users can delete own list items" ON user_list_items FOR DELETE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can update own list items" ON user_list_items FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own list items" ON user_list_items FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- user_settings
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (
    (select auth.uid()) = user_id
);
