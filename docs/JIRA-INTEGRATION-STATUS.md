# Jira Integration Status

Last updated: January 10, 2026

---

## Overview

Trackli integrates with Jira to sync issues bidirectionally. Users can connect their Atlassian account, select which Jira projects to sync, and have their assigned issues appear as Trackli tasks.

---

## Completed Features

### Step 1: OAuth Connection
**Status: Complete**

- Users can connect Atlassian account via Settings
- OAuth 2.0 flow with PKCE
- Tokens stored securely in Supabase Vault
- Automatic token refresh when expired

**Files:**
- `supabase/functions/atlassian-auth-init/index.ts` - Starts OAuth flow
- `supabase/functions/atlassian-auth-callback/index.ts` - Handles callback, stores tokens
- `src/components/auth/AtlassianCallback.jsx` - Frontend callback handler

---

### Step 2: Token Refresh
**Status: Complete**

- Tokens auto-refresh 5 minutes before expiry
- Refresh logic built into all Edge Functions
- Failed refreshes prompt user to reconnect

**Implementation:** Token refresh is embedded in each Edge Function that needs Jira access (`jira-sync`, `jira-test-fetch`, `jira-update-issue`, `jira-sync-scheduled`).

---

### Step 3: Project Selection UI
**Status: Complete**

- Settings shows list of user's Jira projects
- Toggle switches to enable/disable sync per project
- Persists to `jira_project_sync` table

**Location:** `src/components/KanbanBoard.jsx` (~line 11500-11600, Settings modal)

---

### Step 4: Import Jira Issues (Sync Now)
**Status: Complete**

- "Sync Now" button in Settings
- Fetches unresolved issues assigned to user from enabled projects
- Creates new Trackli tasks or updates existing ones
- Shows success message with counts

**Files:**
- `supabase/functions/jira-sync/index.ts` - Main sync logic
- `src/components/KanbanBoard.jsx` - `handleSyncJira` function (~line 4267)

**Field Mapping:**
| Jira Field | Trackli Field |
|------------|---------------|
| summary | title |
| description (ADF) | description (plain text) |
| status.name | status (via keyword mapping) |
| priority = "Highest"/"Critical" | critical = true |
| duedate | due_date |
| issuetype.name | jira_issue_type |
| project.key | jira_project_id |
| key | jira_issue_key |

---

### Step 5: Jira Badge on Task Cards
**Status: Complete**

- Tasks from Jira show blue Jira icon + issue key
- Clicking opens Jira issue in new tab
- Badge color: #0052CC (Jira blue)

**Location:** TaskCard component in `KanbanBoard.jsx`

---

### Step 6: Status Mapping (Keyword-Based)
**Status: Complete**

Smart status mapping using keyword matching with category fallback.

**Layer 1 - Keyword Matching (case-insensitive):**
| If status contains... | → Trackli |
|----------------------|-----------|
| "backlog" | `backlog` |
| "to do", "todo", "open", "ready" | `todo` |
| "progress", "review", "test", "dev", "design" | `in_progress` |
| "done", "closed", "complete", "resolved" | `done` |

**Layer 2 - Category Fallback:**
| Jira Category | → Trackli |
|---------------|-----------|
| `new` | `todo` |
| `indeterminate` | `in_progress` |
| `done` | `done` |

**Function:** `mapStatusToTrackli()` in `jira-sync/index.ts` and `jira-sync-scheduled/index.ts`

---

### Step 7: Scheduled Auto-Sync
**Status: Complete**

- Cron job runs every 15 minutes
- Syncs all users with active Atlassian connections
- Updates `last_sync_at` on connection
- Logs to `integration_audit_log`

**Files:**
- `supabase/functions/jira-sync-scheduled/index.ts`

**Cron Job:**
```sql
-- Runs every 15 minutes
SELECT cron.schedule(
  'jira-scheduled-sync',
  '*/15 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

**To check cron status:**
```sql
SELECT * FROM cron.job WHERE jobname = 'jira-scheduled-sync';
```

---

### Step 8: Two-Way Sync (Trackli → Jira)
**Status: Complete**

- When task status changes in Trackli, updates Jira
- Uses Jira transitions API (not direct status set)
- Runs in background, doesn't block UI
- Works for both single and bulk status changes

**Files:**
- `supabase/functions/jira-update-issue/index.ts` - Executes Jira transitions
- `src/components/KanbanBoard.jsx` - `syncStatusToJira()` function (~line 7270)

**How it works:**
1. User moves task to different column
2. `handleUpdateTaskStatus` detects `jira_issue_key`
3. Calls `syncStatusToJira()` in background
4. Edge Function gets available transitions
5. Finds matching transition and executes it

---

### Step 9: Real-Time Webhooks (Jira → Trackli)
**Status: Complete**

Instant sync from Jira via webhooks (vs 15-minute polling fallback).

**Files:**
- `supabase/functions/jira-webhook/index.ts` - Webhook receiver
- Settings UI shows webhook URL + setup instructions

**Events Handled:**
- `jira:issue_created` - Creates new Trackli task
- `jira:issue_updated` - Updates status, title, due date, priority
- `jira:issue_deleted` - Marks task as `jira_sync_status = 'deleted'`

**Setup (Manual):**
1. User goes to Jira Settings → System → Webhooks
2. Creates webhook with Trackli URL
3. Selects events: issue created, updated, deleted
4. Saves webhook

**Note:** 15-minute cron sync remains as fallback.

---

## Not Yet Implemented

---

### Project Mapping (User Choice)
**Status: Discussed, Not Implemented**

Currently all Jira issues go into a single "Jira" project in Trackli.

**Planned (Option D - Hybrid):**
- Default: Issues go to "Jira" project
- Optional: User can map each Jira project to a specific Trackli project

**Would require:**
1. Add `trackli_project_id` column to `jira_project_sync` table
2. Add dropdown in Settings UI next to each Jira project toggle
3. Update sync logic to use mapped project if set

---

### Subtask Handling
**Status: Basic**

- Subtasks sync as regular tasks (if assigned to user)
- `jira_parent_id` is stored but not used
- No hierarchical display

**Future options:**
- Create Trackli subtasks under parent task
- Show parent reference in task detail

---

### Conflict Resolution
**Status: Last-Write-Wins**

If same issue is changed in both systems:
- Jira → Trackli sync overwrites Trackli status
- Trackli → Jira sync overwrites Jira status
- No conflict detection or user prompt

**Future:** Could compare `updated_at` timestamps and prompt user.

---

### Resolved Issues Handling
**Status: Not Specified**

When a Jira issue is resolved/closed:
- Currently stays in Trackli (moves to Done column)
- Not automatically archived or removed

**Future options:**
- Auto-archive after X days in Done
- Remove from Trackli when unassigned in Jira

---

## Database Tables

### `atlassian_connections`
Stores OAuth tokens and connection metadata.

| Column | Description |
|--------|-------------|
| user_id | Trackli user |
| site_id | Jira cloud ID |
| site_url | e.g., https://company.atlassian.net |
| site_name | Display name |
| atlassian_account_id | User's Atlassian ID |
| atlassian_email | User's email |
| access_token_secret_id | Vault reference |
| refresh_token_secret_id | Vault reference |
| token_expires_at | When access token expires |
| last_sync_at | Last successful sync |
| sync_error | Last error message |

### `jira_project_sync`
Per-project sync settings.

| Column | Description |
|--------|-------------|
| user_id | Trackli user |
| jira_project_id | Jira project ID |
| jira_project_key | e.g., "ATTP" |
| jira_project_name | Display name |
| sync_enabled | Whether to sync this project |

### `tasks` (Jira-related columns)
| Column | Description |
|--------|-------------|
| jira_issue_id | Jira issue ID |
| jira_issue_key | e.g., "ATTP-1" |
| jira_project_id | Jira project ID |
| jira_status | Current Jira status name |
| jira_status_category | new/indeterminate/done |
| jira_issue_type | Task/Story/Bug/etc. |
| jira_site_id | Which Jira site |
| jira_parent_id | Parent issue ID (subtasks) |
| jira_sync_status | active/paused |
| jira_assigned_at | When first synced |
| source | "jira" for synced tasks |
| source_link | URL to Jira issue |

### `integration_audit_log`
Tracks all sync events for debugging.

| Column | Description |
|--------|-------------|
| user_id | Who |
| event_type | What happened |
| provider | "atlassian" |
| site_id | Which Jira site |
| details | JSON with specifics |
| success | true/false |

**Event types:**
- `oauth.connected` - User connected
- `oauth.disconnected` - User disconnected
- `oauth.token_refreshed` - Token was refreshed
- `oauth.token_refresh_failed` - Refresh failed
- `jira.sync_completed` - Manual sync finished
- `jira.scheduled_sync_completed` - Cron sync finished
- `jira.issue_transitioned` - Status pushed to Jira

---

## Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `atlassian-auth-init` | Start OAuth flow | User |
| `atlassian-auth-callback` | Handle OAuth callback | None (state param) |
| `jira-test-fetch` | Test connection, show issue count | User |
| `jira-sync` | Manual sync (Sync Now button) | User |
| `jira-sync-scheduled` | Cron sync (every 15 min) | Cron header |
| `jira-update-issue` | Push status change to Jira | User |
| `jira-webhook` | Receive real-time events from Jira | None (public) |

**Deploying:**
```bash
npx supabase functions deploy <function-name> --no-verify-jwt
```

---

## Testing Checklist

### Connection
- [ ] Connect Atlassian account
- [ ] See list of Jira projects
- [ ] Disconnect and reconnect

### Sync (Jira → Trackli)
- [ ] Enable a project, click Sync Now
- [ ] Verify issues appear in correct columns
- [ ] Verify Jira badge and link work
- [ ] Test with different status names
- [ ] Wait 15 min, verify auto-sync works

### Sync (Trackli → Jira)
- [ ] Move Jira task to In Progress
- [ ] Check Jira - should be In Progress
- [ ] Move to Done in Trackli
- [ ] Check Jira - should be Done
- [ ] Move back to To Do
- [ ] Check Jira - should be To Do

### Webhooks (Real-Time Sync)
- [ ] Create issue in Jira → appears in Trackli instantly
- [ ] Update issue status in Jira → task moves columns
- [ ] Update issue title in Jira → task title changes
- [ ] Delete issue in Jira → task marked as deleted
- [ ] Unassign issue in Jira → task marked unassigned

### Edge Cases
- [ ] Token refresh (wait 1+ hour)
- [ ] Disable project, sync - issues shouldn't update
- [ ] Assign new issue in Jira, wait for auto-sync
- [ ] Bulk status change with mixed Jira/non-Jira tasks
- [ ] Webhook for non-enabled project → ignored
- [ ] Webhook for non-connected user → ignored

---

## Troubleshooting

### "Token expired" error
- Tokens auto-refresh, but if refresh fails, user needs to reconnect
- Check `integration_audit_log` for `oauth.token_refresh_failed` events

### Sync shows 0 issues
- Verify issues are assigned to the connected user
- Check JQL: `assignee = currentUser() AND resolution = Unresolved`
- Subtasks need explicit assignment

### Status not mapping correctly
- Check if status name matches keywords in `mapStatusToTrackli()`
- Falls back to category if no keyword match
- Add new keywords if needed

### Cron not running
```sql
-- Check job exists
SELECT * FROM cron.job WHERE jobname = 'jira-scheduled-sync';

-- Check recent runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'jira-scheduled-sync')
ORDER BY start_time DESC LIMIT 10;
```

### Two-way sync not working
- Check browser console for "Synced X to Jira" messages
- Check `integration_audit_log` for `jira.issue_transitioned` events
- Verify task has `jira_issue_key` set

---

## Future Roadmap

1. **Project mapping** - Choose which Trackli project per Jira project
2. **Confluence integration** - Extract tasks from Confluence pages
3. **Comments sync** - Sync comments between systems
4. **Assignee sync** - When assigned in Trackli, assign in Jira
5. **Custom field mapping** - Map Jira custom fields to Trackli fields
6. **Multi-site support** - Connect multiple Jira sites
7. **Auto-register webhooks** - Automatically set up webhooks on connect

---

## Key Code Locations

| Feature | File | Line/Function |
|---------|------|---------------|
| Sync Now handler | KanbanBoard.jsx | `handleSyncJira` ~4267 |
| Test button handler | KanbanBoard.jsx | `handleTestAtlassian` ~4232 |
| Status change → Jira | KanbanBoard.jsx | `syncStatusToJira` ~7270 |
| Project toggle | KanbanBoard.jsx | `handleToggleJiraProjectSync` ~4302 |
| Settings UI | KanbanBoard.jsx | ~11500-11650 |
| Status mapping | jira-sync/index.ts | `mapStatusToTrackli` ~500 |
| Token refresh | (all Edge Functions) | `getValidToken` function |
