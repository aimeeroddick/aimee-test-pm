# Atlassian Integration - Progress Summary

## Date: January 10, 2026

---

## ✅ COMPLETED

### 1. Security Foundations

**PRD Created:** `/docs/PRD-atlassian-security-foundations.md`

**Database Tables (RLS enabled):**
- `oauth_states` - CSRF protection with 10-minute expiry
- `atlassian_connections` - Stores connection info per user per site (tokens stored as Vault secret IDs)
- `jira_project_sync` - Per-project sync settings (sync_enabled toggle)
- `confluence_pending_tasks` - Approval queue for Confluence tasks
- `integration_audit_log` - Security audit trail

**New columns on `tasks` table:**
- Jira: `jira_issue_id`, `jira_issue_key`, `jira_project_id`, `jira_status`, `jira_status_category`, `jira_sync_status`, `jira_assigned_at`, `jira_reassigned_to`, `jira_parent_id`, `jira_tshirt_size`, `jira_epic_key`, `jira_epic_name`, `jira_issue_type`, `jira_site_id`
- Confluence: `confluence_task_id`, `confluence_page_id`, `confluence_page_title`, `confluence_space_key`

**Vault Functions (run in Supabase SQL Editor):**
- `create_vault_secret(p_secret, p_name)` - Stores encrypted secret, returns UUID
- `get_vault_secret(p_id)` - Retrieves decrypted secret
- `delete_vault_secret(p_id)` - Deletes secret

**Migration file:** `/supabase/migrations/20260110_atlassian_security_foundations.sql`

---

### 2. OAuth Flow (Working ✅)

**Edge Functions:**

1. **`atlassian-auth-init`** (`/supabase/functions/atlassian-auth-init/index.ts`)
   - POST endpoint, requires user authentication
   - Generates secure random state (crypto.randomUUID)
   - Stores state in oauth_states table with 10-minute expiry
   - Logs `oauth.initiated` event
   - Returns Atlassian authorization URL with scopes:
     - `read:me`, `read:jira-work`, `write:jira-work`, `read:jira-user`
     - `read:confluence-content.all`, `write:confluence-content`, `read:confluence-user`
     - `offline_access` (for refresh tokens)

2. **`atlassian-auth-callback`** (`/supabase/functions/atlassian-auth-callback/index.ts`)
   - POST endpoint called by frontend after OAuth redirect
   - Validates state (CSRF protection), deletes used state immediately
   - Exchanges code for access/refresh tokens
   - Fetches Atlassian user info (account_id, email, name)
   - Fetches accessible resources (Jira/Confluence sites)
   - Stores tokens in Vault using `create_vault_secret()` function
   - Creates `atlassian_connections` record per site
   - Fetches and stores Jira projects for each site in `jira_project_sync`
   - Logs `oauth.connected` event with site details

**Frontend Components:**

1. **`AtlassianCallback`** (`/src/components/auth/AtlassianCallback.jsx`)
   - Handles redirect from Atlassian after OAuth
   - Shows loading/success/error states
   - Redirects to /app with status params

2. **Route added to `App.jsx`:**
   ```jsx
   <Route path="/auth/atlassian/callback" element={<ProtectedRoute><AtlassianCallback /></ProtectedRoute>} />
   ```

3. **Settings UI in `KanbanBoard.jsx`:**
   - Added state variables: `atlassianConnections`, `atlassianLoading`, `atlassianError`, `atlassianSuccess`
   - Added functions: `fetchAtlassianConnections()`, `handleConnectAtlassian()`, `handleDisconnectAtlassian()`
   - Added UI in Integrations section with Connect/Disconnect button

---

### 3. Atlassian App Configuration

**Developer Console:** https://developer.atlassian.com/console/myapps

**App Name:** Trackli

**Client ID:** `TgE5f4mC6j1tdrWOmE3ws0VlmNhzC5c0`

**APIs Enabled:**
- Jira API: `read:jira-work`, `write:jira-work`, `read:jira-user`
- Confluence API: `read:confluence-content.all`, `write:confluence-content`, `read:confluence-user`
- User Identity API: `read:me`

**Callback URLs Configured:**
- `https://www.gettrackli.com/auth/atlassian/callback`
- `https://test.trackli.com/auth/atlassian/callback`
- `https://trackli-git-test-develop-trackli.vercel.app/auth/atlassian/callback`
- `http://localhost:5173/auth/atlassian/callback`

---

### 4. Secrets Configured

**Supabase Secrets (set via CLI):**
```bash
npx supabase secrets set ATLASSIAN_CLIENT_ID=TgE5f4mC6j1tdrWOmE3ws0VlmNhzC5c0
npx supabase secrets set ATLASSIAN_CLIENT_SECRET=<your-rotated-secret>
```

**Note:** Original secret was accidentally committed and exposed. It was rotated on Jan 10, 2026.

**Webhook Secret (for future use):**
```
ATLASSIAN_WEBHOOK_SECRET=75583486e9ae67aaf725d92d18661f949d36087df8679c07023f2d90a6cd307c
```

---

### 5. Test Fetch Function (Deployed but untested)

**`jira-test-fetch`** (`/supabase/functions/jira-test-fetch/index.ts`)
- Fetches issues assigned to user from Jira
- JQL: `assignee = currentUser() AND resolution = Unresolved`
- Returns: key, summary, status, priority, issueType, project, dueDate, etc.

**Issue:** Console test failed because localStorage auth token not available on Vercel preview domain. Need to test while properly logged in.

---

### 6. Security Document Created

**PDF:** `trackli-security-overview.pdf`
- Covers all integrations: Atlassian, Slack, Email, Outlook
- Documents data access scopes, protections, and user controls
- Ready to share with stakeholders

---

## 🔄 CURRENT STATE

### What's Working:
- OAuth flow complete - can connect Atlassian account
- Connection stored in `atlassian_connections` table
- Tokens encrypted in Vault
- Jira projects fetched and stored in `jira_project_sync`
- UI shows connected state in Settings → Integrations
- Can disconnect from UI

### Database State:
```sql
-- Check connections
SELECT site_name, site_url, atlassian_email, connected_at FROM atlassian_connections;

-- Check projects
SELECT jira_project_key, jira_project_name, sync_enabled FROM jira_project_sync;
```

### Test User:
- Aimee has Jira issues created for testing
- Connected to Spicy Mango Atlassian site

---

## 🔲 REMAINING WORK

### Phase 1: Test & Verify Jira Fetch (Priority: High)

1. **Test `jira-test-fetch` function properly**
   - Either test from localhost where auth works
   - Or add a temporary "Test Connection" button in Settings UI
   - Verify we can read Jira issues assigned to user

### Phase 2: Import Jira Issues (Priority: High)

1. **Create `jira-sync` Edge Function**
   - Fetch all unresolved issues assigned to user
   - Check if issue already exists in Trackli (by `jira_issue_key`)
   - Create new tasks for new issues
   - Map fields:
     - `summary` → `title`
     - `status` → map to Trackli status (todo/in_progress/done)
     - `priority` → map to `critical` flag
     - `duedate` → `due_date`
     - `issuetype` → store in `jira_issue_type`
     - `project` → create/link Trackli project
   - Store Jira metadata on task (`jira_issue_id`, `jira_issue_key`, etc.)

2. **Status Mapping Configuration**
   - Create `jira_status_mapping` table or use JSON config
   - Map Jira statuses to Trackli columns (Backlog, Todo, In Progress, Done)
   - Use Jira `statusCategory` (todo, indeterminate, done) as fallback

3. **Add "Sync Now" Button in UI**
   - Manual trigger for initial sync
   - Show progress/results

### Phase 3: Auto-Sync (Priority: High)

**Option A: Webhooks (Recommended)**
1. Create `jira-webhook` Edge Function
2. Register webhook in Atlassian for:
   - `jira:issue_created`
   - `jira:issue_updated`
   - `jira:issue_deleted`
3. Verify webhook signature using `ATLASSIAN_WEBHOOK_SECRET`
4. Process events in real-time

**Option B: Polling (Fallback)**
1. Create scheduled function (cron) to poll every 5-15 minutes
2. Fetch issues updated since last sync
3. Less real-time but simpler to implement

### Phase 4: Two-Way Sync (Priority: Medium)

1. **Trackli → Jira Updates**
   - When task status changes in Trackli, update Jira
   - Map Trackli status back to Jira transition
   - Use `jira_sync_status` to track sync state

2. **Conflict Resolution**
   - If both sides changed, use last-updated wins
   - Or show conflict UI for user to resolve

### Phase 5: Confluence Integration (Priority: Low)

1. **Fetch Confluence Tasks**
   - Use Confluence API to get tasks assigned to user
   - `/wiki/rest/api/content/search?cql=type=task AND assignee=currentUser()`

2. **Approval Queue**
   - Store in `confluence_pending_tasks`
   - Show in UI for user to approve/reject
   - Create Trackli task on approval

### Phase 6: UI Enhancements (Priority: Medium)

1. **Project Toggle UI**
   - Show list of Jira projects in Settings
   - Toggle switches to enable/disable sync per project
   - Update `jira_project_sync.sync_enabled`

2. **Jira Badge on Task Cards**
   - Show Jira icon + issue key on synced tasks
   - Click to open in Jira

3. **Sync Status Indicator**
   - Show last sync time
   - Show sync errors if any

---

## 📁 FILES CREATED/MODIFIED

### New Files:
```
/docs/PRD-atlassian-security-foundations.md
/supabase/migrations/20260110_atlassian_security_foundations.sql
/supabase/functions/atlassian-auth-init/index.ts
/supabase/functions/atlassian-auth-callback/index.ts
/supabase/functions/jira-test-fetch/index.ts
/src/components/auth/AtlassianCallback.jsx
```

### Modified Files:
```
/src/App.jsx - Added AtlassianCallback route
/src/components/KanbanBoard.jsx - Added Atlassian state, functions, and UI
```

---

## 🔐 SECURITY NOTES

1. **Secret Leak Incident:** `.env.local` was accidentally committed. Fixed by:
   - Removed from git tracking: `git rm --cached .env.local`
   - Rotated Atlassian secret in developer console
   - Updated Supabase secrets with new value

2. **Prevention:** `.env.local` is in `.gitignore` - the commit was manual error

3. **Token Security:**
   - All tokens stored in Supabase Vault (AES-256)
   - Tokens never sent to frontend
   - Row Level Security ensures user isolation

---

## 🧪 TESTING CHECKLIST

### OAuth Flow:
- [x] Click Connect → Redirects to Atlassian
- [x] Authorize in Atlassian → Redirects back
- [x] Connection saved in database
- [x] Tokens stored in Vault
- [x] Projects fetched and stored
- [x] UI shows connected state
- [x] Disconnect removes connection

### Jira Sync (Not yet tested):
- [ ] Fetch issues from Jira API
- [ ] Create Trackli tasks from Jira issues
- [ ] Status mapping works correctly
- [ ] Webhook receives events
- [ ] Two-way sync works

---

## 🚀 DEPLOYMENT

**Branch:** `test-develop`

**Vercel Preview:** https://trackli-git-test-develop-trackli.vercel.app

**Edge Functions Deployed:**
- `atlassian-auth-init`
- `atlassian-auth-callback`
- `jira-test-fetch`

**Deploy Edge Function:**
```bash
cd ~/Desktop/Trackli
npx supabase functions deploy <function-name> --no-verify-jwt
```

**Git Workflow:**
1. All changes to `test-develop` first
2. Test thoroughly
3. Merge to `main` for production

---

## 📝 QUICK START FOR CONTINUING

1. **Test Jira fetch locally:**
```bash
cd ~/Desktop/Trackli
npm run dev
# Login, go to Settings, open console, test jira-test-fetch
```

2. **Build Jira import:**
   - Create `/supabase/functions/jira-sync/index.ts`
   - Fetch issues, create tasks, handle mapping
   - Add UI button to trigger

3. **Set up webhooks:**
   - Create `/supabase/functions/jira-webhook/index.ts`
   - Register webhook in Atlassian developer console
   - Test with ngrok for local development

---

## 📚 REFERENCE LINKS

- [Atlassian Developer Console](https://developer.atlassian.com/console/myapps)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Jira Webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/)
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault)
