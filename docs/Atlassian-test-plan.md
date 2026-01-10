# Atlassian Integration - Test Plan

## Overview
This document outlines all tests needed to verify the Atlassian integration functionality.

**Last Updated:** January 10, 2026

---

## Pre-Requisites

Before testing, ensure:
- [ ] You have a Jira account with at least one project
- [ ] You have Jira issues assigned to you (create some test issues if needed)
- [ ] The app is running (localhost:5173 or Vercel preview)
- [ ] Edge Functions are deployed to Supabase

---

## Step 1: Test Connection Button

### 1.1 Test Button Appears When Connected
- [ ] Go to Settings → Integrations → Atlassian section
- [ ] When connected, both "Test" and "Disconnect" buttons should appear
- [ ] Both buttons should be Jira blue and gray respectively

### 1.2 Test Connection Success
- [ ] Click "Test" button
- [ ] Button should show "..." while loading
- [ ] Should see green success message: "Found X Jira issues assigned to you"
- [ ] Open browser console (F12) - should see full response logged
- [ ] Response should include: `{ success: true, connection: {...}, totalIssues: X, issues: [...] }`

### 1.3 Test Connection When No Issues
- [ ] If you have no unresolved issues assigned, should still succeed
- [ ] Message should show "Found 0 Jira issues assigned to you"

### 1.4 Test Connection Errors
- [ ] Disconnect from Atlassian
- [ ] Try to call jira-test-fetch directly (via console) - should get "No Atlassian connection found" error
- [ ] Connect and test - should work again

---

## Step 2: Token Refresh

### 2.1 Token Expiry Check
- [ ] After connecting, check `atlassian_connections` table in Supabase
- [ ] `token_expires_at` should be ~1 hour from connection time
- [ ] `access_token_secret_id` and `refresh_token_secret_id` should have UUID values

### 2.2 Automatic Refresh (Simulated)
To test without waiting 1 hour:
1. [ ] In Supabase SQL Editor, manually set token to expire soon:
   ```sql
   UPDATE atlassian_connections
   SET token_expires_at = NOW() + INTERVAL '2 minutes'
   WHERE user_id = 'your-user-id';
   ```
2. [ ] Wait 2 minutes (or set to past time)
3. [ ] Click "Test" button
4. [ ] Should still work (token auto-refreshed)
5. [ ] Check `token_expires_at` - should be updated to new time (~1 hour from now)
6. [ ] Check `integration_audit_log` - should have `oauth.token_refreshed` event

### 2.3 Refresh Token Revoked
To test refresh failure:
1. [ ] Revoke access in Atlassian account settings (https://id.atlassian.com/manage-profile/apps)
2. [ ] Manually expire the token (see SQL above)
3. [ ] Click "Test" button
4. [ ] Should get error: "Token expired and refresh failed. Please reconnect Atlassian."
5. [ ] Response should include `needsReconnect: true`

### 2.4 Audit Logging
- [ ] Check `integration_audit_log` table for:
  - `oauth.token_refreshed` events (success = true)
  - `oauth.token_refresh_failed` events if refresh failed (success = false)
- [ ] Events should have correct `user_id`, `site_id`, and `details`

---

## Step 3: Jira Project Selection UI

### 3.1 Projects Section Appears
- [ ] Connect to Atlassian
- [ ] Below the Test/Disconnect buttons, should see "Jira Projects (X/Y syncing)"
- [ ] Click to expand the section
- [ ] Should see list of all Jira projects with toggle switches

### 3.2 Project Toggle
- [ ] Each project shows: project key (e.g., "PROJ") and project name
- [ ] Toggle switch shows Jira blue when enabled, gray when disabled
- [ ] Click toggle to disable a project
- [ ] Toggle should animate and update immediately
- [ ] Header should update count (e.g., "2/3 syncing")

### 3.3 Toggle Persistence
- [ ] Toggle a project off
- [ ] Refresh the page
- [ ] Expand Jira Projects section
- [ ] Toggle state should persist (project still off)

### 3.4 Database Verification
- [ ] Check `jira_project_sync` table in Supabase
- [ ] `sync_enabled` column should match toggle state
- [ ] `updated_at` should update when toggled

### 3.5 Dark Mode
- [ ] Toggle dark mode in settings
- [ ] Jira Projects section should have proper dark mode styling
- [ ] Text readable, backgrounds correct

---

## Step 4: Jira Sync (Import Issues)

### 4.1 Sync Button Appears
- [ ] When connected and projects enabled, "Sync Now" button appears
- [ ] Button is disabled if no projects are enabled for sync
- [ ] Hover tooltip explains the sync action

### 4.2 First Sync
- [ ] Enable at least one Jira project for sync
- [ ] Click "Sync Now" button
- [ ] Button shows "..." while loading
- [ ] Should see success message: "Sync complete: X created, Y updated"
- [ ] Open browser console - should see full response logged
- [ ] Response should include: `{ success: true, totalFetched: X, created: Y, updated: Z }`

### 4.3 Verify Tasks Created
- [ ] Navigate to Kanban board
- [ ] Should see a "Jira" project created (with Jira blue color #0052CC)
- [ ] Tasks from Jira should appear in the appropriate columns:
  - "To Do" status → Backlog column
  - "In Progress" status → In Progress column
  - "Done" status → Done column
- [ ] Tasks should have Jira metadata:
  - `source` = "jira"
  - `jira_issue_key` populated (e.g., "PROJ-123")
  - `jira_status` matches Jira
  - `jira_issue_type` populated

### 4.4 Sync Again (No Duplicates)
- [ ] Click "Sync Now" again
- [ ] Should see message: "Sync complete: 0 created, X updated"
- [ ] No duplicate tasks should be created
- [ ] Existing tasks should be updated if Jira status changed

### 4.5 Status Updates
- [ ] In Jira, move an issue to a different status
- [ ] Click "Sync Now" in Trackli
- [ ] Task should move to correct column based on new status
- [ ] `jira_status` should be updated

### 4.6 Database Verification
- [ ] Check `tasks` table for synced issues:
  - `jira_issue_id` should match Jira issue ID
  - `jira_issue_key` should match (e.g., "PROJ-123")
  - `jira_site_id` should match connection site_id
  - `source` should be "jira"
- [ ] Check `atlassian_connections` table:
  - `last_sync_at` should be updated
  - `sync_error` should be null on success
- [ ] Check `integration_audit_log` for `jira.sync_completed` event

### 4.7 Error Handling
- [ ] Disable all projects for sync
- [ ] Click "Sync Now"
- [ ] Should see message: "No projects enabled for sync"
- [ ] No errors thrown

---

## Step 5: Jira Badge on Task Cards

### 5.1 Badge Appears on Synced Tasks
- [ ] Sync Jira issues (click "Sync Now")
- [ ] Navigate to Kanban board
- [ ] Jira-synced tasks should show a blue Jira badge
- [ ] Badge shows the issue key (e.g., "PROJ-123")
- [ ] Badge has Jira logo icon

### 5.2 Badge Clickable
- [ ] Click on the Jira badge
- [ ] Should open Jira issue in a new browser tab
- [ ] URL should be correct: `https://[site].atlassian.net/browse/[issue-key]`
- [ ] Click should NOT trigger task edit modal

### 5.3 Non-Jira Tasks Unaffected
- [ ] Create a new task manually (not from Jira)
- [ ] Task should NOT have Jira badge
- [ ] Task should function normally

### 5.4 Dark Mode
- [ ] Toggle dark mode
- [ ] Jira badge should be visible and styled correctly
- [ ] Text should use lighter blue (#4C9AFF) in dark mode

---

## Step 6: Scheduled Auto-Sync

### 6.1 Last Sync Display
- [ ] After running "Sync Now", the UI should show "Last sync: [timestamp]"
- [ ] Timestamp updates after each sync
- [ ] Format is readable (e.g., "1/10/2026, 2:30:00 PM")

### 6.2 Scheduled Function Deployment
Deploy the scheduled sync function:
```bash
npx supabase functions deploy jira-sync-scheduled --no-verify-jwt
```

### 6.3 Cron Job Setup
The migration creates a cron job that runs every 15 minutes. Verify in Supabase:
- [ ] Go to Supabase Dashboard → Database → Extensions
- [ ] Verify `pg_cron` extension is enabled
- [ ] Check `cron.job` table for `jira-scheduled-sync` job

### 6.4 Manual Trigger Test
Test the scheduled function manually:
```javascript
// In browser console (with admin/service role access)
const result = await supabase.functions.invoke('jira-sync-scheduled', {
  headers: { 'X-Supabase-Cron': 'true' }
})
console.log(result)
```
- [ ] Should see sync results for all active connections
- [ ] Check `integration_audit_log` for `jira.scheduled_sync_completed` events

### 6.5 Automatic Sync Verification
- [ ] Wait 15 minutes after cron job is set up
- [ ] Check `atlassian_connections.last_sync_at` - should update automatically
- [ ] New Jira issues should appear without manual sync
- [ ] Check Supabase logs for scheduled sync execution

### 6.6 Error Handling
- [ ] If token expires during scheduled sync, should log error
- [ ] Should not crash or affect other users' syncs
- [ ] `sync_error` column should capture failure details

---

## Step 7: Two-Way Sync (Trackli → Jira)

### 7.1 Status Change Syncs to Jira
- [ ] Sync a Jira issue to create a task in Trackli
- [ ] Drag the task to a different column (e.g., Backlog → In Progress)
- [ ] Check browser console - should see "Synced [PROJ-123] to Jira: Success"
- [ ] Open the issue in Jira - status should be updated

### 7.2 Status Mapping (Trackli → Jira)
Test each status transition:
- [ ] Backlog → should transition to a "To Do" or "Open" status in Jira
- [ ] In Progress → should transition to an "In Progress" status
- [ ] Done → should transition to a "Done" or "Closed" status

### 7.3 Bulk Status Change
- [ ] Select multiple Jira-linked tasks
- [ ] Use bulk status change to move them to Done
- [ ] All selected Jira issues should update (check console for sync logs)

### 7.4 Non-Blocking Sync
- [ ] Drag a Jira task to a new column
- [ ] UI should update immediately (not wait for Jira)
- [ ] Even if Jira sync fails, Trackli task should still move

### 7.5 No Transition Available
If an issue can't transition (e.g., workflow restrictions):
- [ ] Console should log "No transition needed or available"
- [ ] Trackli task status should still update
- [ ] No error shown to user

### 7.6 Audit Logging
- [ ] Check `integration_audit_log` for `jira.issue_transitioned` events
- [ ] Event should include: issueKey, fromTrackliStatus, toJiraStatus, transitionName

### 7.7 Edge Function Deployment
```bash
npx supabase functions deploy jira-update-issue --no-verify-jwt
```

---

## Step 8: OAuth Flow (Existing - Verification)

### 8.1 Connect Flow
- [ ] If not connected, click "Connect" button
- [ ] Should redirect to Atlassian authorization page
- [ ] Authorize the app
- [ ] Should redirect back to Trackli
- [ ] Should see "Connected to [Site Name]" in green

### 8.2 Disconnect Flow
- [ ] Click "Disconnect" button
- [ ] Should remove connection
- [ ] Should see "Connect" button again
- [ ] Check `atlassian_connections` table - record should be deleted

### 8.3 Multiple Sites
If you have access to multiple Atlassian sites:
- [ ] Connect and verify all sites appear in connection
- [ ] Check `atlassian_connections` table - should have one record per site
- [ ] Check `jira_project_sync` table - should have projects from all sites

---

## Edge Function Deployment Verification

Before testing, deploy the Edge Functions:

```bash
cd ~/Desktop/Trackli

# Deploy jira-test-fetch (updated with token refresh)
npx supabase functions deploy jira-test-fetch --no-verify-jwt

# Deploy atlassian-token-refresh (new)
npx supabase functions deploy atlassian-token-refresh --no-verify-jwt

# Deploy jira-sync (imports issues as tasks)
npx supabase functions deploy jira-sync --no-verify-jwt

# Deploy jira-sync-scheduled (cron job for auto-sync)
npx supabase functions deploy jira-sync-scheduled --no-verify-jwt

# Deploy jira-update-issue (two-way sync: Trackli → Jira)
npx supabase functions deploy jira-update-issue --no-verify-jwt
```

### Verify Deployment
- [ ] `jira-test-fetch` appears in Supabase Dashboard → Edge Functions
- [ ] `atlassian-token-refresh` appears in Supabase Dashboard → Edge Functions
- [ ] `jira-sync` appears in Supabase Dashboard → Edge Functions
- [ ] `jira-sync-scheduled` appears in Supabase Dashboard → Edge Functions
- [ ] `jira-update-issue` appears in Supabase Dashboard → Edge Functions
- [ ] All show recent deployment timestamp

---

## Database Verification

### Tables Should Exist
- [ ] `atlassian_connections` - stores connection info
- [ ] `jira_project_sync` - stores project sync settings
- [ ] `oauth_states` - stores OAuth CSRF tokens (temporary)
- [ ] `integration_audit_log` - stores audit events
- [ ] `confluence_pending_tasks` - stores Confluence tasks (future use)

### Connection Record Fields
After connecting, verify `atlassian_connections` has:
- [ ] `user_id` - your Supabase user ID
- [ ] `site_id` - Atlassian cloud ID
- [ ] `site_name` - e.g., "Spicy Mango"
- [ ] `site_url` - e.g., "https://spicymango.atlassian.net"
- [ ] `access_token_secret_id` - UUID (not null)
- [ ] `refresh_token_secret_id` - UUID (not null)
- [ ] `token_expires_at` - timestamp ~1 hour from connection
- [ ] `atlassian_account_id` - Atlassian user ID
- [ ] `atlassian_email` - your Atlassian email

### Vault Secrets
Tokens should be encrypted in Vault:
- [ ] Run: `SELECT * FROM vault.decrypted_secrets WHERE name LIKE 'atlassian%';`
- [ ] Should see access and refresh token secrets
- [ ] Actual token values should be visible (for debugging only!)

---

## Error Scenarios

### No Authorization Header
```javascript
// In browser console (without auth)
fetch('https://YOUR_PROJECT.supabase.co/functions/v1/jira-test-fetch')
  .then(r => r.json()).then(console.log)
```
- [ ] Should return `{ error: "No authorization header" }` with status 401

### Invalid Token
```javascript
// With invalid token
fetch('https://YOUR_PROJECT.supabase.co/functions/v1/jira-test-fetch', {
  headers: { 'Authorization': 'Bearer invalid-token' }
}).then(r => r.json()).then(console.log)
```
- [ ] Should return `{ error: "Invalid token" }` with status 401

### No Connection
- [ ] Disconnect from Atlassian
- [ ] Try Test button (shouldn't appear, but if calling directly)
- [ ] Should return `{ error: "No Atlassian connection found" }` with status 404

---

## Browser Console Commands

### Quick Test (when logged in)
```javascript
// Get auth token
const { data: { session } } = await supabase.auth.getSession()

// Call jira-test-fetch
const result = await supabase.functions.invoke('jira-test-fetch', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
console.log(result)
```

### Force Token Refresh
```javascript
const { data: { session } } = await supabase.auth.getSession()
const result = await supabase.functions.invoke('atlassian-token-refresh', {
  headers: { Authorization: `Bearer ${session.access_token}` }
})
console.log(result)
```

---

## Common Issues & Troubleshooting

### "Failed to get access token"
- Check `access_token_secret_id` is not null in `atlassian_connections`
- Verify Vault secrets exist: `SELECT * FROM vault.decrypted_secrets;`
- Re-connect to Atlassian if secrets are missing

### "Jira token expired, need to refresh"
- Token refresh should happen automatically now
- If still failing, check `refresh_token_secret_id` exists
- Check `integration_audit_log` for refresh failure details

### "No Atlassian connection found"
- Verify you're logged in as the correct user
- Check `atlassian_connections` table for your user_id

### CORS Errors
- Ensure Edge Functions have CORS headers
- Check browser network tab for actual error response

---

## Test Completion Checklist

### Step 1 (Test Button)
- [ ] Button appears when connected
- [ ] Shows issue count on success
- [ ] Logs response to console
- [ ] Handles no issues gracefully

### Step 2 (Token Refresh)
- [ ] Tokens stored with expiry
- [ ] Auto-refresh when token expires
- [ ] Audit log captures refresh events
- [ ] Graceful error when refresh fails
- [ ] Suggests reconnect when refresh fails

### Step 3 (Project Selection)
- [ ] Projects section shows after connecting
- [ ] Toggle switches work
- [ ] Settings persist after refresh
- [ ] Count updates correctly (X/Y syncing)

### Step 4 (Jira Sync)
- [ ] Sync Now button works
- [ ] Tasks created with correct Jira fields
- [ ] No duplicates on re-sync
- [ ] Status mapping correct (To Do→Backlog, In Progress→In Progress, Done→Done)
- [ ] Jira project created with blue color
- [ ] Audit log captures sync events

### Step 5 (Jira Badge)
- [ ] Badge appears on synced tasks
- [ ] Badge shows issue key with Jira logo
- [ ] Click opens Jira issue in new tab
- [ ] Non-Jira tasks unaffected
- [ ] Dark mode styling correct

### Step 6 (Scheduled Auto-Sync)
- [ ] Last sync timestamp displayed in UI
- [ ] Cron job created in database
- [ ] Scheduled function can be triggered manually
- [ ] Auto-sync updates tasks without user action
- [ ] Errors logged per-connection, don't affect others

### Step 7 (Two-Way Sync)
- [ ] Status changes sync to Jira automatically
- [ ] Jira transitions execute correctly
- [ ] Bulk status changes sync all Jira tasks
- [ ] Sync is non-blocking (UI updates immediately)
- [ ] Audit log captures `jira.issue_transitioned` events

### Security
- [ ] Tokens encrypted in Vault (not plaintext)
- [ ] Tokens never sent to frontend
- [ ] RLS prevents accessing other users' connections
- [ ] Audit log tracks all OAuth events

---

## Next Steps After Testing

Once all tests pass:
1. Commit changes to `test-develop`
2. Deploy to Vercel preview
3. Test on preview URL
4. Merge to `main` for production
