-- =====================================================
-- Security Foundations for Atlassian Integration
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. OAuth States (CSRF Protection)
-- Stores temporary state tokens during OAuth flow
-- =====================================================
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'atlassian',
  redirect_path TEXT DEFAULT '/',  -- Where to redirect after OAuth
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id);

-- RLS: Users can only manage their own states
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oauth states" ON oauth_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oauth states" ON oauth_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states" ON oauth_states
  FOR DELETE USING (auth.uid() = user_id);


-- 2. Atlassian Connections
-- Stores OAuth tokens (encrypted via Vault) per user per site
-- =====================================================
CREATE TABLE IF NOT EXISTS atlassian_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Site identification
  site_id TEXT NOT NULL,                    -- Atlassian cloud ID
  site_url TEXT NOT NULL,                   -- e.g., spicymango.atlassian.net
  site_name TEXT,                           -- Display name
  
  -- Tokens stored as Vault secret IDs (not plaintext!)
  access_token_secret_id UUID,              -- Reference to vault.secrets
  refresh_token_secret_id UUID,             -- Reference to vault.secrets
  token_expires_at TIMESTAMPTZ NOT NULL,
  
  -- User info from Atlassian
  atlassian_account_id TEXT NOT NULL,
  atlassian_email TEXT,
  atlassian_display_name TEXT,
  
  -- Sync settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,                          -- Last error message if any
  
  -- Timestamps
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One connection per user per site
  UNIQUE(user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_atlassian_connections_user ON atlassian_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_atlassian_connections_site ON atlassian_connections(site_id);

-- RLS: Users can only access their own connections
ALTER TABLE atlassian_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own atlassian connections" ON atlassian_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own atlassian connections" ON atlassian_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own atlassian connections" ON atlassian_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own atlassian connections" ON atlassian_connections
  FOR DELETE USING (auth.uid() = user_id);


-- 3. Jira Project Sync Settings
-- Which Jira projects to sync per user
-- =====================================================
CREATE TABLE IF NOT EXISTS jira_project_sync (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES atlassian_connections(id) ON DELETE CASCADE NOT NULL,
  
  -- Project info
  jira_project_id TEXT NOT NULL,
  jira_project_key TEXT NOT NULL,           -- e.g., "GAM"
  jira_project_name TEXT NOT NULL,          -- e.g., "Gameday"
  
  -- Sync settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, jira_project_id)
);

CREATE INDEX IF NOT EXISTS idx_jira_project_sync_user ON jira_project_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_jira_project_sync_connection ON jira_project_sync(connection_id);

-- RLS
ALTER TABLE jira_project_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own jira project sync" ON jira_project_sync
  FOR ALL USING (auth.uid() = user_id);


-- 4. Confluence Pending Tasks
-- Queue for Confluence tasks awaiting user approval
-- =====================================================
CREATE TABLE IF NOT EXISTS confluence_pending_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES atlassian_connections(id) ON DELETE CASCADE NOT NULL,
  
  -- Confluence task info
  confluence_task_id TEXT NOT NULL,
  confluence_page_id TEXT NOT NULL,
  confluence_page_title TEXT,
  confluence_space_key TEXT,
  confluence_space_name TEXT,
  
  -- Task content
  task_title TEXT NOT NULL,
  task_description TEXT,
  due_date DATE,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  processed_at TIMESTAMPTZ,
  created_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, confluence_task_id)
);

CREATE INDEX IF NOT EXISTS idx_confluence_pending_user ON confluence_pending_tasks(user_id, status);

-- RLS
ALTER TABLE confluence_pending_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own confluence pending tasks" ON confluence_pending_tasks
  FOR ALL USING (auth.uid() = user_id);


-- 5. Integration Audit Log
-- Security audit trail for all integration events
-- =====================================================
CREATE TABLE IF NOT EXISTS integration_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Event info
  event_type TEXT NOT NULL,                 -- e.g., 'connection.created', 'token.refreshed'
  provider TEXT NOT NULL DEFAULT 'atlassian',
  site_id TEXT,
  
  -- Details
  details JSONB DEFAULT '{}',               -- Additional context
  ip_address INET,
  user_agent TEXT,
  
  -- Outcome
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON integration_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON integration_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON integration_audit_log(created_at DESC);

-- RLS: Users can view their own logs
ALTER TABLE integration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON integration_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert (for Edge Functions)
CREATE POLICY "Service role can insert audit logs" ON integration_audit_log
  FOR INSERT WITH CHECK (TRUE);


-- 6. Add Jira/Confluence fields to tasks table
-- =====================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_issue_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_issue_key TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_project_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_status TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_status_category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_sync_status TEXT DEFAULT 'active' 
  CHECK (jira_sync_status IN ('active', 'reassigned', 'unlinked', 'sprint_ended'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_assigned_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_reassigned_to TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_parent_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_tshirt_size TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_epic_key TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_epic_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_issue_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS jira_site_id TEXT;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confluence_task_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confluence_page_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confluence_page_title TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confluence_space_key TEXT;

-- Index for Jira lookups
CREATE INDEX IF NOT EXISTS idx_tasks_jira_issue ON tasks(jira_issue_id) WHERE jira_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_jira_key ON tasks(jira_issue_key) WHERE jira_issue_key IS NOT NULL;


-- 7. Function to clean up expired OAuth states
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$;


-- 8. Function to update timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to atlassian_connections
DROP TRIGGER IF EXISTS update_atlassian_connections_updated_at ON atlassian_connections;
CREATE TRIGGER update_atlassian_connections_updated_at
  BEFORE UPDATE ON atlassian_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to jira_project_sync
DROP TRIGGER IF EXISTS update_jira_project_sync_updated_at ON jira_project_sync;
CREATE TRIGGER update_jira_project_sync_updated_at
  BEFORE UPDATE ON jira_project_sync
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- Done! Tables created with RLS enabled.
-- =====================================================
