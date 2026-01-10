# Atlassian Integration - Comprehensive Test Plan

## Overview
This document outlines all positive and negative tests needed to verify the Atlassian integration functionality.

**Last Updated:** January 10, 2026

---

## Pre-Requisites

Before testing, ensure:
- [ ] You have a Jira account with at least one project
- [ ] You have Jira issues in various statuses (To Do, In Progress, Done)
- [ ] You have at least one issue assigned to you
- [ ] The app is running (localhost:5173 or Vercel preview)
- [ ] Edge Functions are deployed to Supabase

---

## 1. OAuth Connection Flow

### 1.1 Positive Tests - Connect Flow

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Initial connect button | Go to Settings → Integrations | See "Connect" button for Atlassian |
| OAuth redirect | Click "Connect" button | Redirects to Atlassian authorization page |
| Successful authorization | Authorize the app in Atlassian | Redirects back to Trackli with success |
| Connection displayed | After authorization | Shows "Connected to [Site Name]" in green |
| Multiple Jira sites | Have access to multiple sites | All sites connected and stored |

### 1.2 Negative Tests - Connect Flow

| Test | Steps | Expected Result |
|------|-------|-----------------|
| User denies authorization | Click "Deny" on Atlassian auth page | Redirects back with error message, no connection created |
| Cancel during OAuth | Close browser during OAuth flow | No connection created, can try again |
| Invalid state parameter | Manually corrupt the OAuth state | Error: "Invalid OAuth state", connection rejected |
| Expired OAuth state | Wait >10 minutes, then authorize | Error: "OAuth state expired", prompt to retry |
| Network failure during callback | Disconnect internet during callback | Graceful error, prompt to retry |

### 1.3 Positive Tests - Disconnect Flow

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Disconnect button visible | When connected | "Disconnect" button appears |
| Successful disconnect | Click "Disconnect" | Connection removed, shows "Connect" button |
| Database cleanup | After disconnect | `atlassian_connections` record deleted |
| Vault cleanup | After disconnect | Access and refresh tokens deleted from Vault |

### 1.4 Negative Tests - Disconnect Flow

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Disconnect during sync | Click disconnect while sync running | Waits for sync to complete, then disconnects |
| Network failure during disconnect | Disconnect internet, click Disconnect | Shows error, connection may remain (retry needed) |

---

## 2. Token Management

### 2.1 Positive Tests - Token Storage

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Tokens in Vault | After connecting, check Vault | Access & refresh tokens encrypted |
| Token expiry set | Check `atlassian_connections` | `token_expires_at` ~1 hour from connection |
| Secret IDs stored | Check connection record | `access_token_secret_id` and `refresh_token_secret_id` populated |

### 2.2 Positive Tests - Token Refresh

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Auto-refresh before expiry | Set token to expire in 2 min, call API | Token auto-refreshes, API succeeds |
| New tokens stored | After refresh | New tokens in Vault, old ones deleted |
| Expiry updated | After refresh | `token_expires_at` updated to new time |
| Audit log entry | After refresh | `oauth.token_refreshed` event logged |

### 2.3 Negative Tests - Token Refresh

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Refresh token revoked | Revoke access in Atlassian settings, expire token | Error: "Token expired and refresh failed. Please reconnect Atlassian." |
| Invalid refresh token | Corrupt refresh token in Vault | Error with `needsReconnect: true` |
| Atlassian API down | Simulate Atlassian outage during refresh | Error: "Failed to refresh token", logged to audit |
| Missing client credentials | Remove ATLASSIAN_CLIENT_ID env var | Error: "Missing Atlassian credentials" |
| Rate limited during refresh | Make many rapid refresh calls | Handles 429 response gracefully |

**How to test token refresh:**
```sql
-- Force token expiry in Supabase SQL Editor
UPDATE atlassian_connections
SET token_expires_at = NOW() - INTERVAL '1 minute'
WHERE user_id = 'your-user-id';
```

---

## 3. Test Connection Button

### 3.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Button appears | When connected | "Test" button visible next to Disconnect |
| Loading state | Click Test | Button shows "..." while loading |
| Success with issues | Have assigned issues | "Found X Jira issues assigned to you" |
| Success with zero issues | No assigned issues | "Found 0 Jira issues assigned to you" |
| Console logging | Click Test | Full response logged to browser console |

### 3.2 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| No auth header | Call function without auth | 401: "No authorization header" |
| Invalid JWT | Call with invalid token | 401: "Invalid token" |
| No connection | Delete connection, call function | 404: "No Atlassian connection found" |
| Jira API error | Atlassian returns 500 | Error displayed to user with details |
| Network timeout | Slow/no network | Timeout error after 30s |
| Invalid site_id | Corrupt site_id in database | Error: Jira API returns 404 |

---

## 4. Jira Project Selection

### 4.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Projects section visible | After connecting | "Jira Projects (X/Y syncing)" header |
| Expand/collapse | Click header | Section expands/collapses smoothly |
| Project list | Expand section | All Jira projects listed with key and name |
| Toggle on | Enable a project | Toggle turns Jira blue, count updates |
| Toggle off | Disable a project | Toggle turns gray, count updates |
| Persistence | Refresh page | Toggle states persist |
| Dark mode styling | Enable dark mode | Proper colors and contrast |

### 4.2 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| No projects in Jira | User has no Jira projects | Shows "No projects found" message |
| Database error on toggle | Simulate DB failure | Error toast, toggle reverts |
| Very long project name | Project with 100+ char name | Name truncates with ellipsis |
| Special characters in name | Project name with emoji/unicode | Displays correctly |
| Rapid toggle clicking | Click toggle 10x quickly | Only final state saved, no race conditions |

---

## 5. Jira Sync (Import Issues)

### 5.1 Positive Tests - Sync Button

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Button visible | Projects enabled | "Sync Now" button appears |
| Button disabled | No projects enabled | Button disabled or hidden |
| Loading state | Click Sync Now | Button shows "..." while syncing |
| Success message | Sync completes | "Sync complete: X created, Y updated" |

### 5.2 Positive Tests - Task Creation

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Tasks created | After first sync | Jira issues appear as Trackli tasks |
| Jira project created | First sync | "Jira" project created with #0052CC color |
| Status mapping - To Do | Jira issue in "To Do" | Task in Backlog column |
| Status mapping - In Progress | Jira issue in "In Progress" | Task in In Progress column |
| Status mapping - Done | Jira issue in "Done" | Task in Done column |
| Title mapping | Issue with summary | Task title = issue summary |
| Description mapping | Issue with description | Task description = issue description |
| Priority mapping | Highest priority issue | Task marked as critical |
| Due date mapping | Issue with due date | Task due date matches |
| Jira metadata | After sync | `jira_issue_key`, `jira_status`, `jira_issue_type` populated |
| Source link | After sync | `source_link` = correct Jira URL |

### 5.3 Positive Tests - Re-sync

| Test | Steps | Expected Result |
|------|-------|-----------------|
| No duplicates | Sync twice | Same tasks, not duplicated |
| Status updates | Change status in Jira, re-sync | Task moves to correct column |
| Title updates | Change summary in Jira, re-sync | Task title updated |
| New issues | Create issue in Jira, re-sync | New task created |
| Last sync timestamp | After sync | UI shows "Last sync: [timestamp]" |

### 5.4 Negative Tests - Sync Failures

| Test | Steps | Expected Result |
|------|-------|-----------------|
| No projects enabled | Disable all projects, sync | "No projects enabled for sync" |
| Jira API error | Atlassian returns 500 | Error message, no partial data |
| Rate limited | Hit Jira rate limit | Graceful error, retry later message |
| Token expired during sync | Long sync with expired token | Auto-refresh, sync continues |
| Network failure mid-sync | Disconnect during sync | Error message, partial sync may complete |
| Invalid issue data | Jira returns malformed issue | Skip bad issue, continue with others |
| Very long description | Issue with 100KB description | Truncates to fit Trackli limits |
| Missing required fields | Issue with no summary | Uses fallback title like "[No Title]" |

### 5.5 Negative Tests - Edge Cases

| Test | Steps | Expected Result |
|------|-------|-----------------|
| 1000+ issues | Project with many issues | Pagination works, all issues synced |
| Unicode in summary | Issue with emoji/CJK characters | Displays correctly |
| HTML in description | Issue with HTML tags | Renders or strips HTML appropriately |
| Deleted issue in Jira | Delete issue, re-sync | Task remains in Trackli (no auto-delete) |
| Moved issue between projects | Move issue, re-sync | Task updates with new project info |
| Issue type changed | Change type in Jira, re-sync | `jira_issue_type` updates |

---

## 6. Jira Badge on Task Cards

### 6.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Badge visible | View synced task | Blue Jira badge with issue key |
| Jira logo | View badge | Small Jira logo icon in badge |
| Click opens Jira | Click badge | Opens Jira issue in new tab |
| Correct URL | Click badge | URL is `https://[site].atlassian.net/browse/[key]` |
| Click doesn't open modal | Click badge | Task edit modal does NOT open |
| Non-Jira tasks | View manual task | No Jira badge |
| Dark mode | Enable dark mode | Badge uses lighter blue (#4C9AFF) |

### 6.2 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Missing source_link | Task with null source_link | Falls back to constructed URL |
| Invalid URL | Corrupted source_link | Still attempts to open, browser handles error |
| Very long issue key | Unusual key like "VERYLONGPROJECT-99999" | Badge truncates or wraps gracefully |
| Popup blocked | Browser blocks popup | User can right-click to open |

---

## 7. Two-Way Sync (Trackli → Jira)

### 7.1 Positive Tests - Status Sync

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Backlog → To Do | Move task to Backlog | Jira issue transitions to "To Do" category |
| In Progress → In Progress | Move task to In Progress | Jira issue transitions to "In Progress" |
| Done → Done | Move task to Done | Jira issue transitions to "Done" category |
| Console logging | Move task | "Synced [KEY] to Jira: Success" in console |
| Audit logging | Move task | `jira.issue_transitioned` event in audit log |
| jira_status updated | After sync | Task's `jira_status` matches new Jira status |

### 7.2 Positive Tests - Bulk Actions

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Bulk status change | Select multiple Jira tasks, bulk move to Done | All Jira issues transition |
| Mixed selection | Select Jira + non-Jira tasks, bulk move | Only Jira tasks sync to Jira |

### 7.3 Positive Tests - Non-Blocking

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Immediate UI update | Drag task | Task moves immediately, doesn't wait for Jira |
| Background sync | Drag task | Jira syncs in background |
| Sync failure doesn't revert | Simulate Jira failure | Task stays in new column |

### 7.4 Negative Tests - Sync Failures

| Test | Steps | Expected Result |
|------|-------|-----------------|
| No valid transition | Move to status with no Jira path | Console logs "No transition needed or available" |
| Workflow restriction | Issue requires fields for transition | Sync fails gracefully, task stays moved |
| Permission denied | User can't transition issue | Console error, task stays moved |
| Token expired | Move task with expired token | Auto-refresh attempt, retry sync |
| Network failure | Move task offline | Console error, task stays moved |
| Jira API error | Atlassian returns 500 | Console error, task stays moved |

### 7.5 Negative Tests - Edge Cases

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Rapid moves | Drag same task 5x quickly | Only final state synced to Jira |
| Move during sync | Move task while previous sync running | Queued or latest state wins |
| Non-Jira task | Move manual task | No Jira sync attempted |
| Deleted Jira issue | Move task whose issue was deleted | Error logged, task stays moved |

---

## 8. Scheduled Auto-Sync

### 8.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Last sync display | After manual sync | "Last sync: [timestamp]" shown in UI |
| Cron job exists | Check Supabase cron.job table | `jira-scheduled-sync` job present |
| Manual trigger | Invoke function with X-Supabase-Cron header | Syncs all active connections |
| Per-user isolation | Multiple users connected | Each user's tasks sync independently |
| Skip inactive connections | Connection with sync_enabled=false | Connection skipped in scheduled sync |

### 8.2 Positive Tests - Automatic Execution

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Auto-sync runs | Wait 15 minutes | `last_sync_at` updates automatically |
| New issues appear | Create issue in Jira, wait for cron | Task appears without manual sync |
| Status updates | Change status in Jira, wait for cron | Task moves to correct column |

### 8.3 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| One user fails | User A's token expired | User A fails, User B still syncs |
| All connections fail | Simulate total failure | Errors logged, no crash |
| Function timeout | Sync takes >60 seconds | Timeout, partial sync logged |
| Cron job disabled | Disable pg_cron job | No auto-sync, manual still works |
| Invalid cron secret | Missing X-Supabase-Cron header | Function rejects request |

---

## 9. Database Integrity

### 9.1 Positive Tests - Tables

| Test | Steps | Expected Result |
|------|-------|-----------------|
| atlassian_connections | After connect | Record with all fields populated |
| jira_project_sync | After connect | One record per Jira project |
| integration_audit_log | After any action | Events logged with correct details |
| tasks.jira_* fields | After sync | Jira metadata populated correctly |

### 9.2 Positive Tests - RLS

| Test | Steps | Expected Result |
|------|-------|-----------------|
| User A can't see User B | Log in as different user | Only own connections visible |
| User A can't modify User B | Try to update other user's data | RLS blocks the operation |

### 9.3 Negative Tests - Data Corruption

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Missing Vault secret | Delete secret, try to use connection | Error: "Failed to get access token" |
| NULL site_id | Corrupt connection record | Jira API calls fail gracefully |
| Invalid JSON in details | Corrupt audit log entry | Other operations unaffected |
| Orphaned projects | Delete connection | jira_project_sync records cleaned up |

---

## 10. Security Tests

### 10.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Tokens encrypted | Check Vault | Tokens stored encrypted, not plaintext |
| Tokens not in response | Call any Edge Function | Response never contains access/refresh tokens |
| RLS enforced | Query from frontend | Only user's own data returned |
| Audit trail | Perform OAuth actions | All events logged with user_id |

### 10.2 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| SQL injection in state | Inject SQL in OAuth state | State sanitized, no injection |
| XSS in site_name | Site name with <script> tag | Escaped in UI, no execution |
| CSRF on disconnect | Try to disconnect without session | Requires valid auth |
| Replay attack | Reuse OAuth callback URL | State already used, rejected |

---

## 11. Performance Tests

### 11.1 Positive Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Fast initial load | Open Settings with connection | UI loads in <1 second |
| Fast sync (small) | Sync 10 issues | Completes in <5 seconds |
| Fast sync (medium) | Sync 100 issues | Completes in <30 seconds |

### 11.2 Negative Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Slow network | Throttle to 3G | Operations complete (slower), no timeout |
| Large sync | Sync 1000+ issues | Pagination works, may take minutes |
| Concurrent syncs | Two users sync simultaneously | Both complete successfully |

---

## Browser Console Commands

### Quick Test (when logged in)
```javascript
// Get auth token
const { data: { session } } = await supabase.auth.getSession()

// Test connection
const test = await supabase.functions.invoke('jira-test-fetch', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
console.log('Test result:', test)

// Manual sync
const sync = await supabase.functions.invoke('jira-sync', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
console.log('Sync result:', sync)

// Force token refresh
const refresh = await supabase.functions.invoke('atlassian-token-refresh', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
console.log('Refresh result:', refresh)
```

### Force Token Expiry (in Supabase SQL Editor)
```sql
-- Expire token to test refresh
UPDATE atlassian_connections
SET token_expires_at = NOW() - INTERVAL '1 minute'
WHERE user_id = 'your-user-id';

-- Check audit log
SELECT * FROM integration_audit_log
ORDER BY created_at DESC
LIMIT 20;

-- Check connection status
SELECT id, site_name, token_expires_at, last_sync_at, sync_error
FROM atlassian_connections
WHERE user_id = 'your-user-id';
```

---

## Edge Function Deployment

Deploy all functions before testing:
```bash
cd ~/Desktop/Trackli

npx supabase functions deploy jira-test-fetch --no-verify-jwt
npx supabase functions deploy atlassian-token-refresh --no-verify-jwt
npx supabase functions deploy jira-sync --no-verify-jwt
npx supabase functions deploy jira-sync-scheduled --no-verify-jwt
npx supabase functions deploy jira-update-issue --no-verify-jwt
```

Verify in Supabase Dashboard → Edge Functions:
- [ ] All 5 functions listed
- [ ] Recent deployment timestamps
- [ ] No deployment errors

---

## Common Issues & Troubleshooting

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| "Failed to get access token" | Vault secret missing or deleted | Reconnect to Atlassian |
| "Token expired and refresh failed" | Refresh token revoked or expired | Reconnect to Atlassian |
| "No Atlassian connection found" | Wrong user or connection deleted | Reconnect to Atlassian |
| Tasks not appearing | Projects not enabled for sync | Enable projects in Settings |
| Jira status not updating | No valid transition available | Check Jira workflow restrictions |
| CORS errors | Edge Function deployment issue | Redeploy Edge Functions |
| Cron not running | pg_cron not enabled | Enable pg_cron extension |

---

## Test Completion Checklist

### OAuth Flow
- [ ] Connect succeeds
- [ ] Disconnect succeeds
- [ ] Handles user denial gracefully
- [ ] Handles expired state gracefully

### Token Management
- [ ] Tokens stored in Vault
- [ ] Auto-refresh works
- [ ] Refresh failure handled
- [ ] Audit events logged

### Test Connection
- [ ] Shows issue count
- [ ] Handles zero issues
- [ ] Handles API errors

### Project Selection
- [ ] Projects listed
- [ ] Toggle works
- [ ] Persistence works
- [ ] Count updates correctly

### Jira Sync
- [ ] Tasks created correctly
- [ ] Status mapping correct
- [ ] No duplicates on re-sync
- [ ] Updates existing tasks
- [ ] Last sync timestamp shown

### Jira Badge
- [ ] Badge visible on synced tasks
- [ ] Click opens Jira
- [ ] Non-Jira tasks unaffected

### Two-Way Sync
- [ ] Status changes sync to Jira
- [ ] Bulk actions work
- [ ] Non-blocking (UI immediate)
- [ ] Failures don't revert UI

### Scheduled Sync
- [ ] Cron job created
- [ ] Manual trigger works
- [ ] Auto-sync updates tasks
- [ ] Per-user isolation works

### Security
- [ ] Tokens encrypted
- [ ] RLS enforced
- [ ] Audit trail complete

---

## Sign-Off

| Area | Tester | Date | Pass/Fail | Notes |
|------|--------|------|-----------|-------|
| OAuth Flow | | | | |
| Token Management | | | | |
| Test Connection | | | | |
| Project Selection | | | | |
| Jira Sync | | | | |
| Jira Badge | | | | |
| Two-Way Sync | | | | |
| Scheduled Sync | | | | |
| Security | | | | |

**Overall Status:** [ ] Ready for Production / [ ] Needs Fixes
