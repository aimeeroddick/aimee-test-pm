-- Migration: Fix remaining RLS policies for Atlassian/Jira integration tables

-- oauth_states
DROP POLICY IF EXISTS "Users can view own oauth states" ON oauth_states;
DROP POLICY IF EXISTS "Users can insert own oauth states" ON oauth_states;
DROP POLICY IF EXISTS "Users can delete own oauth states" ON oauth_states;
CREATE POLICY "Users can view own oauth states" ON oauth_states FOR SELECT USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can insert own oauth states" ON oauth_states FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can delete own oauth states" ON oauth_states FOR DELETE USING (
    (select auth.uid()) = user_id
);

-- atlassian_connections
DROP POLICY IF EXISTS "Users can view own atlassian connections" ON atlassian_connections;
DROP POLICY IF EXISTS "Users can insert own atlassian connections" ON atlassian_connections;
DROP POLICY IF EXISTS "Users can update own atlassian connections" ON atlassian_connections;
DROP POLICY IF EXISTS "Users can delete own atlassian connections" ON atlassian_connections;
CREATE POLICY "Users can view own atlassian connections" ON atlassian_connections FOR SELECT USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can insert own atlassian connections" ON atlassian_connections FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can update own atlassian connections" ON atlassian_connections FOR UPDATE USING (
    (select auth.uid()) = user_id
);
CREATE POLICY "Users can delete own atlassian connections" ON atlassian_connections FOR DELETE USING (
    (select auth.uid()) = user_id
);

-- jira_project_sync
DROP POLICY IF EXISTS "Users can manage own jira project sync" ON jira_project_sync;
CREATE POLICY "Users can manage own jira project sync" ON jira_project_sync FOR ALL USING (
    (select auth.uid()) = user_id
) WITH CHECK (
    (select auth.uid()) = user_id
);

-- confluence_pending_tasks
DROP POLICY IF EXISTS "Users can manage own confluence pending tasks" ON confluence_pending_tasks;
CREATE POLICY "Users can manage own confluence pending tasks" ON confluence_pending_tasks FOR ALL USING (
    (select auth.uid()) = user_id
) WITH CHECK (
    (select auth.uid()) = user_id
);

-- integration_audit_log
DROP POLICY IF EXISTS "Users can view own audit logs" ON integration_audit_log;
CREATE POLICY "Users can view own audit logs" ON integration_audit_log FOR SELECT USING (
    (select auth.uid()) = user_id
);

-- Add missing foreign key indexes for confluence_pending_tasks
CREATE INDEX IF NOT EXISTS idx_confluence_pending_connection ON confluence_pending_tasks(connection_id);
CREATE INDEX IF NOT EXISTS idx_confluence_pending_created_task ON confluence_pending_tasks(created_task_id);
