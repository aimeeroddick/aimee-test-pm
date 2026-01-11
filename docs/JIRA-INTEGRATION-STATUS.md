# Jira Integration Status

Last updated: January 10, 2026

---

## Overview

Trackli integrates with Jira to sync issues bidirectionally. Users can connect their Atlassian account, select which Jira projects to sync, and have their assigned issues appear as Trackli tasks.

**Key Features:**
- OAuth 2.0 connection with automatic token refresh
- Two-way sync: Jira ↔ Trackli
- Real-time updates via webhooks (instant)
- Scheduled sync as fallback (every 15 minutes)
- Automatic webhook registration on connect

---

## Completed Features

### Step 1: OAuth Connection
**Status: ✅ Complete**

- Users can connect Atlassian account via Settings
- OAuth 2.0 flow with PKCE
- Tokens stored securely in Supabase Vault
- Automatic token refresh when expired
- **Auto-registers webhooks on connect** (no manual setup needed)

**Files:**
- `supabase/functions/atlassian-auth-init/index.ts` - Starts OAuth flow
- `supabase/functions/atlassian-auth-callback/index.ts` - Handles callback, stores tokens, registers webhooks
- `supabase/functions/atlassian-disconnect/index.ts` - Cleanup on disconnect (removes webhooks, tokens)
- `src/components/auth/AtlassianCallback.jsx` - Frontend callback handler

---

### Step 2: Token Refresh
**Status: ✅ Complete**

- Tokens auto-refresh 5 minutes before expiry
- Refresh logic built into all Edge Functions
- Failed refreshes prompt user to reconnect

**Implementation:** Token refresh is embedded in each Edge Function that needs Jira access (`jira-sync`, `jira-test-fetch`, `jira-update-issue`, `jira-sync-scheduled`).

---

### Step 3: Project Selection UI
**Status: ✅ Complete**

- Settings shows list of user's Jira projects
- Toggle switches to enable/disable sync per project
- Persists to `jira_project_sync` table

**Location:** `src/components/KanbanBoard.jsx` (~line 11500-11600, Settings modal)

---

### Step 4: Import Jira Issues (Sync Now)
**Status: ✅ Complete**

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
**Status: ✅ Complete**

- Tasks from Jira show blue Jira icon + issue key
- Clicking opens Jira issue in new tab
- Badge color: #0052CC (Jira blue)

**Location:** TaskCard component in `KanbanBoard.jsx`

---

### Step 6: Status Mapping (Keyword-Based)
**Status: ✅ Complete**

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

**Function:** `mapStatusToTrackli()` in `jira-sync/index.ts`, `jira-sync-scheduled/index.ts`, and `jira-webhook/index.ts`

---

### Step 7: Scheduled Auto-Sync
**Status: ✅ Complete**

- Cron job runs every 15 minutes
- Syncs all users with active Atlassian connections
- Updates `last_sync_at` on connection
- Logs to `integration_audit_log`
- **Serves as fallback if webhooks miss events**

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
**Status: ✅ Complete**

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
**Status: ✅ Complete**

Instant sync from Jira via webhooks with Supabase Realtime for UI updates.

**Architecture:**
```
Jira Issue Changed
        ↓
Jira Sends Webhook
        ↓
jira-webhook Edge Function
        ↓
Updates tasks table (with user_id)
        ↓
Supabase Realtime broadcasts change
        ↓
Browser receives update
        ↓
UI updates instantly (no refresh needed)
```

**Files:**
- `supabase/functions/jira-webhook/index.ts` - Webhook receiver
- `supabase/functions/atlassian-auth-callback/index.ts` - Auto-registers webhook on connect
- `supabase/functions/atlassian-disconnect/index.ts` - Removes webhook on disconnect
- `src/components/KanbanBoard.jsx` - Realtime subscription (~line 4940)

**Events Handled:**
| Jira Event | Action |
|------------|--------|
| `jira:issue_created` | Creates new Trackli task |
| `jira:issue_updated` | Updates status, title, due date, priority |
| `jira:issue_deleted` | Marks task as `jira_sync_status = 'deleted'` |

**Auto-Registration Details:**
- Webhooks are registered automatically during OAuth callback
- Uses JQL filter: `project != "ZZZZNONEXISTENT"` (matches all projects)
- Webhook ID stored in `atlassian_connections.webhook_id`
- Cleaned up when user disconnects

**UI Indicator:**
- Settings shows "Real-Time Sync: Active" (green) when webhook_id exists
- Falls back to "15-min polling" (yellow) if webhook registration failed

---

### Step 10: Reassignment Handling
**Status: ✅ Complete**

When a Jira task is reassigned to someone else, it's automatically removed from the user's board.

**How it works:**
| Trigger | Action |
|---------|--------|
| Manual sync ("Sync Now") | Compares Jira results with existing tasks. Tasks not in results → marked `unassigned` |
| Scheduled sync (every 15 min) | Same as manual sync |
| Webhook (real-time) | Detects assignee change, marks old owner's task as `unassigned` |

**Task states (`jira_sync_status`):**
- `active` - Task is assigned to user, shown on board
- `unassigned` - Task was reassigned away, hidden from board
- `deleted` - Jira issue was deleted
- `paused` - User paused sync (future feature)

**Note:** Unassigned tasks are hidden, not deleted. If the task is reassigned back, a new sync will create it again.

---

## Not Yet Implemented

### Project Mapping (User Choice)
**Status: Discussed, Not Implemented**

Currently all Jira issues go into a single "Jira" project in Trackli.

**Planned (Option D - Hybrid):**
- Default: Issues go to "Jira" project
- Optional: User can map each Jira project to a specific Trackli project

---

### Subtask Handling
**Status: Basic**

- Subtasks sync as regular tasks (if assigned to user)
- `jira_parent_id` is stored but not used
- No hierarchical display

---

### Conflict Resolution
**Status: Last-Write-Wins**

If same issue is changed in both systems:
- Jira → Trackli sync overwrites Trackli status
- Trackli → Jira sync overwrites Jira status
- No conflict detection or user prompt

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
| **webhook_id** | Registered Jira webhook ID |

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
| **user_id** | Owner (required for Realtime) |
| jira_issue_id | Jira issue ID |
| jira_issue_key | e.g., "ATTP-1" |
| jira_project_id | Jira project ID |
| jira_status | Current Jira status name |
| jira_status_category | new/indeterminate/done |
| jira_issue_type | Task/Story/Bug/etc. |
| jira_site_id | Which Jira site |
| jira_parent_id | Parent issue ID (subtasks) |
| jira_sync_status | active/paused/deleted/unassigned |
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
- `webhook.registered` - Webhook auto-registered
- `webhook.registration_failed` - Webhook registration failed
- `jira.sync_completed` - Manual sync finished (includes `markedUnassigned` count)
- `jira.scheduled_sync_completed` - Cron sync finished (includes `markedUnassigned` count)
- `jira.issue_transitioned` - Status pushed to Jira
- `jira.webhook.issue_reassigned_away` - Task reassigned to someone else via webhook
- `jira.webhook.issue_created` - Webhook received for new issue
- `jira.webhook.issue_updated` - Webhook received for update
- `jira.webhook.issue_deleted` - Webhook received for deletion

---

## Edge Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `atlassian-auth-init` | Start OAuth flow | User |
| `atlassian-auth-callback` | Handle OAuth callback, register webhooks | None (state param) |
| `atlassian-disconnect` | Cleanup on disconnect (webhooks, tokens) | User |
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

See `docs/JIRA-TESTING-CHECKLIST.md` for comprehensive test scenarios.

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

### Real-time sync not working
1. Check Settings shows "Real-Time Sync: Active"
2. Check browser console for "Realtime tasks subscription: SUBSCRIBED"
3. Check jira-webhook logs in Supabase for errors
4. Verify task has `user_id` set (required for Realtime filter)

### Webhook not registered
- Check `atlassian_connections.webhook_id` is not null
- Check `integration_audit_log` for `webhook.registration_failed`
- Try disconnecting and reconnecting

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
7. **Webhook refresh** - Auto-extend webhook expiry (30 days)

---

## Key Code Locations

| Feature | File | Line/Function |
|---------|------|---------------|
| Sync Now handler | KanbanBoard.jsx | `handleSyncJira` ~4267 |
| Test button handler | KanbanBoard.jsx | `handleTestAtlassian` ~4232 |
| Status change → Jira | KanbanBoard.jsx | `syncStatusToJira` ~7270 |
| Project toggle | KanbanBoard.jsx | `handleToggleJiraProjectSync` ~4302 |
| Realtime subscription | KanbanBoard.jsx | ~4940 |
| Settings UI | KanbanBoard.jsx | ~11500-11650 |
| Status mapping | jira-sync/index.ts | `mapStatusToTrackli` ~500 |
| Webhook handler | jira-webhook/index.ts | main handler |
| Auto-register webhook | atlassian-auth-callback/index.ts | `registerJiraWebhook` ~330 |
| Token refresh | (all Edge Functions) | `getValidToken` function |
