-- =====================================================
-- Personal Data Reporting API Support
-- Adds fields needed for GDPR compliance with Atlassian
-- =====================================================

-- 1. Add needs_data_refresh flag to track when Atlassian
-- requests we refresh personal data for an account
ALTER TABLE atlassian_connections 
ADD COLUMN IF NOT EXISTS needs_data_refresh BOOLEAN DEFAULT FALSE;

-- 2. Add webhook_id if not exists (stores Jira webhook ID for cleanup)
ALTER TABLE atlassian_connections 
ADD COLUMN IF NOT EXISTS webhook_id TEXT;

-- 3. Add jira_project_key to tasks if not exists (for data cleanup)
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS jira_project_key TEXT;

-- 4. Add jira_last_synced to tasks if not exists
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS jira_last_synced TIMESTAMPTZ;

-- 5. Add confluence_space_name to tasks if not exists
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS confluence_space_name TEXT;

-- 6. Create index for efficient lookup by atlassian_account_id
CREATE INDEX IF NOT EXISTS idx_atlassian_connections_account 
ON atlassian_connections(atlassian_account_id);

-- 7. Create index for Confluence task lookups
CREATE INDEX IF NOT EXISTS idx_tasks_confluence_task_id
ON tasks(confluence_task_id) WHERE confluence_task_id IS NOT NULL;

-- =====================================================
-- Done! Personal Data Reporting support added.
-- =====================================================
