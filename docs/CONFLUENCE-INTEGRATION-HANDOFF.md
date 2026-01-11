# Confluence Integration - Handoff Document

**Date:** January 11, 2026
**Status:** Implementation complete, pending OAuth scope configuration

---

## Summary

Confluence task integration has been implemented for Trackli. Users can search for Confluence inline tasks assigned to them, review them in an approval queue, and sync completion status back to Confluence. The integration is code-complete but blocked by a missing OAuth scope configuration in the Atlassian Developer Console.

---

## What Was Done

### 1. Edge Functions Created

#### `confluence-fetch-tasks` (`/supabase/functions/confluence-fetch-tasks/index.ts`)
- Fetches inline tasks assigned to the user from Confluence API v2
- Endpoint: `GET /wiki/api/v2/tasks?assignee={accountId}&status=incomplete`
- Enriches tasks with page title and space name via additional API calls
- Upserts tasks into `confluence_pending_tasks` table (dedupes by task ID)
- Handles token refresh automatically
- Logs to `integration_audit_log`
- **Deployed to Supabase**

#### `confluence-complete-task` (`/supabase/functions/confluence-complete-task/index.ts`)
- Marks a Confluence task as complete when Trackli task moves to "done"
- Endpoint: `PUT /wiki/api/v2/tasks/{taskId}` with `{ "status": "complete" }`
- Handles token refresh
- Logs success/failure to audit log
- **Deployed to Supabase**

### 2. Database Migration Applied

```sql
-- Added to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confluence_space_name TEXT;

-- Added index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tasks_confluence_task_id
ON tasks(confluence_task_id) WHERE confluence_task_id IS NOT NULL;
```

**Note:** The `confluence_pending_tasks` table already existed from the security foundations migration.

### 3. Frontend Implementation (`/src/components/KanbanBoard.jsx`)

#### State Variables Added (~line 4503)
```javascript
const [pendingConfluenceTasks, setPendingConfluenceTasks] = useState([])
const [pendingConfluenceCount, setPendingConfluenceCount] = useState(0)
const [confluencePendingExpanded, setConfluencePendingExpanded] = useState(true)
const [confluenceDropdownOpen, setConfluenceDropdownOpen] = useState(false)
const [selectedConfluenceIds, setSelectedConfluenceIds] = useState(new Set())
const [expandedConfluenceIds, setExpandedConfluenceIds] = useState(new Set())
const [confluenceSyncing, setConfluenceSyncing] = useState(false)
const [approvingConfluenceId, setApprovingConfluenceId] = useState(null)
```

#### Functions Implemented
- `fetchPendingConfluenceTasks()` - Fetches pending tasks from database
- `handleSearchConfluenceTasks()` - Triggers manual sync via Edge Function
- `handleApproveConfluencePendingTask()` - Approves task, creates in Trackli
- `handleDismissConfluencePendingTask()` - Dismisses task from queue
- `handleBulkApproveConfluencePending()` - Bulk approve selected tasks
- `handleUpdateConfluencePendingTask()` - Inline edit title/date/project
- `toggleConfluencePendingSelection()` - Toggle selection for bulk actions

#### Realtime Subscription
```javascript
const confluenceChannel = supabase
  .channel('confluence-pending-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'confluence_pending_tasks',
    filter: `user_id=eq.${user.id}`
  }, () => fetchPendingConfluenceTasks())
  .subscribe()
```

#### UI Components
- **Header Badge**: Blue Confluence badge with pending count (near email badge ~line 8312)
- **Dropdown Panel**: Shows pending tasks with approve/dismiss actions
- **Settings Button**: "Confluence" button (teal #0891B2) next to "Sync Jira"
- **Inline Editing**: Title, due date, project dropdown in pending queue

#### Completion Sync Hook
When a task with `confluence_task_id` moves to "done", automatically calls `confluence-complete-task` Edge Function to sync completion back to Confluence.

### 4. OAuth Scopes Updated

Added to `/supabase/functions/atlassian-auth-init/index.ts`:
```javascript
const scopes = [
  'read:me',
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'manage:jira-webhook',
  'read:confluence-content.all',
  'write:confluence-content',
  'read:confluence-user',
  'read:task:confluence',   // NEW - Required for Confluence Tasks API v2
  'write:task:confluence',  // NEW - Required for updating Confluence tasks
  'offline_access',
]
```

---

## Current Blocker

### OAuth Scope Issue

The Confluence Tasks API v2 returns **401 Unauthorized** because the app doesn't have the granular task scopes enabled in the Atlassian Developer Console.

**Root Cause:**
- We were requesting `read:confluence-content.all` and `write:confluence-content`
- But the Tasks API requires `read:task:confluence` and `write:task:confluence`
- These granular scopes must be enabled in the Developer Console before OAuth will grant them

**Evidence:**
- Jira sync works fine with the same token
- Confluence Tasks API specifically returns 401
- Token refresh succeeds

---

## What's Remaining

### 1. Configure Atlassian Developer Console (BLOCKING)

1. Go to: https://developer.atlassian.com/console/myapps
2. Select the **Trackli** app
3. Go to **Permissions** → **Confluence API** → **Configure**
4. Enable these scopes:
   - `read:task:confluence`
   - `write:task:confluence`
5. Save changes

### 2. Reconnect Atlassian

After adding scopes in Developer Console:
1. Go to Trackli Settings → Integrations
2. Click **Disconnect**
3. Click **Connect**
4. Authorize with new scopes
5. Test **Confluence** button

### 3. End-to-End Testing

Once OAuth is working, test per the guide at `/docs/CONFLUENCE-INTEGRATION-TESTING-GUIDE.md`:
- [ ] Search Confluence finds tasks
- [ ] Pending tasks appear with page/space info
- [ ] Approve creates task with Confluence metadata
- [ ] Dismiss removes from pending
- [ ] Completing task syncs back to Confluence
- [ ] Realtime updates work between tabs

### 4. Optional Enhancements (Future)

- Confluence webhooks for real-time task discovery
- Mobile bottom sheet for pending tasks
- Inline pending section on board view (dropdown works for now)

---

## Key Files

| File | Purpose |
|------|---------|
| `/supabase/functions/confluence-fetch-tasks/index.ts` | Fetches tasks from Confluence |
| `/supabase/functions/confluence-complete-task/index.ts` | Syncs completion to Confluence |
| `/supabase/functions/atlassian-auth-init/index.ts` | OAuth init with scopes |
| `/src/components/KanbanBoard.jsx` | All frontend UI and logic |
| `/docs/CONFLUENCE-INTEGRATION-TESTING-GUIDE.md` | Testing checklist |
| `/docs/ATLASSIAN-INTEGRATION-PROGRESS.md` | Overall Atlassian progress |

---

## Database Tables

### `confluence_pending_tasks`
```sql
- id (uuid, PK)
- user_id (uuid, FK to auth.users)
- connection_id (uuid, FK to atlassian_connections)
- confluence_task_id (text) -- Confluence's task ID
- confluence_page_id (text)
- confluence_page_title (text)
- confluence_space_key (text)
- confluence_space_name (text)
- task_title (text)
- task_description (text)
- due_date (date)
- status (text) -- 'pending', 'approved', 'dismissed'
- trackli_task_id (uuid) -- Set after approval
- created_at, updated_at
```

### `tasks` (Confluence columns)
```sql
- confluence_task_id (text)
- confluence_page_id (text)
- confluence_page_title (text)
- confluence_space_key (text)
- confluence_space_name (text)
```

---

## API Endpoints

### Confluence Tasks API v2
- **List tasks**: `GET https://api.atlassian.com/ex/confluence/{siteId}/wiki/api/v2/tasks?assignee={accountId}&status=incomplete`
- **Update task**: `PUT https://api.atlassian.com/ex/confluence/{siteId}/wiki/api/v2/tasks/{taskId}`
- **Get page**: `GET https://api.atlassian.com/ex/confluence/{siteId}/wiki/api/v2/pages/{pageId}`
- **Get space**: `GET https://api.atlassian.com/ex/confluence/{siteId}/wiki/api/v2/spaces/{spaceId}`

---

## Git Status

**Branch:** `test-develop`

**Recent Commits:**
1. `Add Confluence task-specific OAuth scopes and improve error logging`
2. `Fix session reference errors in Confluence sync handlers`
3. `Add Confluence task integration`

**Deployed:**
- All Edge Functions deployed to Supabase
- Frontend deployed to Vercel (test-develop preview)

---

## Debugging Tips

### Check Edge Function Logs
Supabase Dashboard → Edge Functions → Logs

### Check Audit Log
```sql
SELECT event_type, details, success, created_at
FROM integration_audit_log
WHERE provider = 'atlassian'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Connection Status
```sql
SELECT site_name, site_url, token_expires_at, updated_at
FROM atlassian_connections
WHERE user_id = '[user-id]';
```

### Check Pending Tasks
```sql
SELECT confluence_task_id, task_title, status, created_at
FROM confluence_pending_tasks
WHERE user_id = '[user-id]'
ORDER BY created_at DESC;
```

---

## Contact

If continuing this work, the key next step is:
1. Add `read:task:confluence` and `write:task:confluence` scopes in Atlassian Developer Console
2. Have user disconnect/reconnect Atlassian
3. Test the Search Confluence flow
