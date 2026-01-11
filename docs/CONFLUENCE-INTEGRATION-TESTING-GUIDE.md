# Confluence Integration Testing Guide

## Overview
This guide covers end-to-end testing of the Confluence integration, from initial connection through all user workflows.

---

## Prerequisites

Before testing, ensure:
- [ ] Dev server running: `npm run dev` → http://localhost:5173/
- [ ] Logged into Trackli with a valid account
- [ ] Access to a Confluence site with edit permissions
- [ ] Edge Functions deployed (confluence-fetch-tasks, confluence-complete-task)

---

## Part 1: Connection Setup

### 1.1 Connect Atlassian Account (If Not Already Connected)

**Steps:**
1. Go to **Settings** (gear icon in header)
2. Scroll to **Integrations** section
3. Find **Atlassian (Jira & Confluence)**
4. Click **"Connect"** button

**Expected:**
- [ ] Redirects to Atlassian login/authorization page
- [ ] Shows requested permissions (Jira + Confluence read/write)
- [ ] After authorizing, redirects back to Trackli
- [ ] Shows "Connected to [site-name]" in green
- [ ] Shows three buttons: "Sync Jira", "Search Confluence", "Disconnect"

**Verify in Database:**
```sql
SELECT site_name, site_url, atlassian_email, connected_at
FROM atlassian_connections
WHERE user_id = '[your-user-id]';
```

---

## Part 2: Create Test Data in Confluence

### 2.1 Create Inline Tasks in Confluence

**Steps:**
1. Go to your Confluence site (e.g., spicymango.atlassian.net)
2. Create or open a test page
3. Add inline tasks using one of these methods:
   - Type `[]` followed by a space, then task text
   - Use the `/action` slash command
   - Click the checkbox icon in the toolbar

4. **IMPORTANT**: Assign tasks to yourself:
   - Click on the task
   - Add assignee using `@your-name`
   - Tasks without assignees won't appear in Trackli

**Create at least 3 test tasks:**
- [ ] Task 1: "Test task - approve this one" (assigned to you)
- [ ] Task 2: "Test task - dismiss this one" (assigned to you)
- [ ] Task 3: "Test task - complete this one" (assigned to you, for completion sync test)

**Tip**: Create tasks on different pages/spaces to test the page info display.

---

## Part 3: Search & Discovery

### 3.1 Manual Confluence Search

**Steps:**
1. Go to **Settings** → **Integrations**
2. Click **"Search Confluence"** button (teal color)

**Expected:**
- [ ] Button shows "..." while syncing
- [ ] After sync completes, button returns to "Search Confluence"
- [ ] If tasks found: Blue badge appears in header with count
- [ ] If no tasks found: No badge appears (or badge shows 0)

**Verify in Database:**
```sql
SELECT confluence_task_id, task_title, confluence_page_title,
       confluence_space_name, status, created_at
FROM confluence_pending_tasks
WHERE user_id = '[your-user-id]'
ORDER BY created_at DESC;
```

**Check Audit Log:**
```sql
SELECT event_type, details, success, created_at
FROM integration_audit_log
WHERE user_id = '[your-user-id]'
  AND event_type = 'confluence.tasks_fetched'
ORDER BY created_at DESC
LIMIT 1;
```

### 3.2 Verify Task Details

**Expected for each pending task:**
- [ ] Task title matches Confluence task text
- [ ] Page title is displayed correctly
- [ ] Space name is displayed (if available)
- [ ] Due date appears if set in Confluence

---

## Part 4: Review Pending Tasks

### 4.1 Open Pending Queue (Desktop)

**Steps:**
1. Click the blue Confluence badge in the header
2. Dropdown panel should open

**Expected:**
- [ ] Panel shows list of pending Confluence tasks
- [ ] Each task shows:
  - Checkbox for selection
  - Task title (editable)
  - Page info: "📄 [Page Title] · [Space Name]"
  - Due date picker
  - Project dropdown
  - Approve (✓) and Dismiss (✕) buttons
- [ ] "Approve All" button at bottom (if multiple tasks)

### 4.2 Inline Editing Before Approval

**Steps:**
1. Click on task title in pending queue
2. Edit the title text
3. Press Enter or click away

**Expected:**
- [ ] Title updates in real-time
- [ ] Change persists (refresh page to verify)

**Steps for due date:**
1. Click the date picker
2. Select a date

**Expected:**
- [ ] Date updates immediately
- [ ] Date will be applied when task is approved

**Steps for project:**
1. Click project dropdown
2. Select a project

**Expected:**
- [ ] Project selection updates
- [ ] Task will be created in selected project when approved

---

## Part 5: Approve Tasks

### 5.1 Approve Single Task

**Steps:**
1. Open the Confluence pending dropdown
2. Find a task to approve
3. Click the green checkmark (✓) button

**Expected:**
- [ ] Task disappears from pending queue
- [ ] Badge count decreases by 1
- [ ] New task appears on your Kanban board
- [ ] Task has Confluence metadata:
  - `confluence_task_id` set
  - `confluence_page_id` set
  - `confluence_page_title` set
  - `confluence_space_key` set (if available)

**Verify in Database:**
```sql
-- Check task was created with Confluence metadata
SELECT id, title, confluence_task_id, confluence_page_id,
       confluence_page_title, confluence_space_key, status
FROM tasks
WHERE confluence_task_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- Check pending task was updated
SELECT id, status, trackli_task_id
FROM confluence_pending_tasks
WHERE confluence_task_id = '[the-confluence-task-id]';
```

### 5.2 Approve with Project Assignment

**Steps:**
1. In pending queue, select a project from dropdown
2. Click approve (✓)

**Expected:**
- [ ] Task created in the selected project
- [ ] Task appears in correct project column/view

### 5.3 Approve with Custom Title/Due Date

**Steps:**
1. Edit the task title in pending queue
2. Set a due date
3. Click approve (✓)

**Expected:**
- [ ] Task created with edited title (not original Confluence text)
- [ ] Task has the due date you selected

### 5.4 Bulk Approve

**Steps:**
1. Select multiple tasks using checkboxes
2. Click "Approve All" or "Approve Selected" button

**Expected:**
- [ ] All selected tasks approved at once
- [ ] All tasks appear on board
- [ ] Badge count updates correctly
- [ ] All tasks have Confluence metadata

---

## Part 6: Dismiss Tasks

### 6.1 Dismiss Single Task

**Steps:**
1. Open the Confluence pending dropdown
2. Click the red X (✕) button on a task

**Expected:**
- [ ] Task removed from pending queue
- [ ] Badge count decreases
- [ ] Task NOT created on board
- [ ] Task marked as 'dismissed' in database (not deleted)

**Verify in Database:**
```sql
SELECT id, task_title, status
FROM confluence_pending_tasks
WHERE status = 'dismissed'
ORDER BY created_at DESC
LIMIT 1;
```

### 6.2 Re-discover Dismissed Task

**Steps:**
1. Dismiss a task
2. Click "Search Confluence" again

**Expected:**
- [ ] Dismissed task does NOT reappear in pending queue
- [ ] (Tasks are only shown once; dismissing is permanent until task changes in Confluence)

---

## Part 7: Completion Sync (Trackli → Confluence)

### 7.1 Complete an Approved Task

**Steps:**
1. Approve a Confluence task (creates it on your board)
2. Drag the task to "Done" column, OR
3. Open task details and change status to "Done"

**Expected:**
- [ ] Task moves to Done in Trackli
- [ ] Background sync to Confluence is triggered
- [ ] In Confluence: The inline task checkbox should now be checked ✓

**Verify in Confluence:**
1. Go to the original Confluence page
2. Find the inline task
3. Verify the checkbox is now checked/completed

**Verify in Audit Log:**
```sql
SELECT event_type, details, success, created_at
FROM integration_audit_log
WHERE event_type = 'confluence.task_completed'
ORDER BY created_at DESC
LIMIT 1;
```

### 7.2 Verify Sync Failure Handling

**Steps:**
1. Disconnect Atlassian (to invalidate token)
2. Try to complete a Confluence-linked task

**Expected:**
- [ ] Task still moves to Done in Trackli (local change succeeds)
- [ ] Error logged but user experience not blocked
- [ ] Audit log shows failure with `success: false`

---

## Part 8: Edge Cases

### 8.1 No Confluence Tasks Found

**Steps:**
1. Ensure no inline tasks assigned to you in Confluence
2. Click "Search Confluence"

**Expected:**
- [ ] Sync completes without error
- [ ] Badge shows 0 or doesn't appear
- [ ] No error message shown

### 8.2 Token Refresh

**Steps:**
1. Wait for token to expire (check `token_expires_at` in database)
2. Click "Search Confluence"

**Expected:**
- [ ] Token auto-refreshes without user action
- [ ] Sync completes successfully
- [ ] `token_expires_at` updated in database

**Verify Token Refresh:**
```sql
SELECT token_expires_at, updated_at
FROM atlassian_connections
WHERE user_id = '[your-user-id]';
```

### 8.3 Disconnected State

**Steps:**
1. Click "Disconnect" in Settings
2. Try to access Confluence features

**Expected:**
- [ ] Connection removed from database
- [ ] Settings shows "Connect" button again
- [ ] Confluence badge disappears from header
- [ ] No errors on pages

### 8.4 Multiple Atlassian Sites (Future)

**Note:** Current implementation supports single site. Multi-site support may be added later.

---

## Part 9: Mobile Testing

### 9.1 Header Badge on Mobile

**Steps:**
1. Open Trackli on mobile viewport (375px width)
2. Have pending Confluence tasks

**Expected:**
- [ ] Badge visible in header
- [ ] Tap opens dropdown or bottom sheet
- [ ] Touch targets at least 44x44px

### 9.2 Approve/Dismiss on Mobile

**Steps:**
1. Tap on badge to open pending queue
2. Try approve and dismiss actions

**Expected:**
- [ ] Buttons are tappable
- [ ] Actions complete successfully
- [ ] UI updates correctly

---

## Part 10: Realtime Updates

### 10.1 Realtime Pending Count

**Steps:**
1. Open Trackli in two browser tabs
2. In Tab 1: Click "Search Confluence"
3. Watch Tab 2

**Expected:**
- [ ] Tab 2 badge count updates automatically
- [ ] No manual refresh needed

### 10.2 Realtime After Approve/Dismiss

**Steps:**
1. Open two tabs
2. In Tab 1: Approve or dismiss a task
3. Watch Tab 2

**Expected:**
- [ ] Tab 2 pending list updates automatically
- [ ] Badge count syncs between tabs

---

## Troubleshooting

### Common Issues

**"No Atlassian connection found"**
- Re-connect Atlassian in Settings

**"Token expired and refresh failed"**
- Disconnect and reconnect Atlassian
- Check ATLASSIAN_CLIENT_SECRET is correct in Supabase secrets

**Tasks not appearing after search**
- Verify tasks are assigned to you in Confluence
- Check tasks are not already completed in Confluence
- Check Edge Function logs for errors

**Completion not syncing to Confluence**
- Check audit log for errors
- Verify task has `confluence_task_id` set
- Check network tab for failed requests

### Check Edge Function Logs

In Supabase Dashboard → Edge Functions → Logs, or:
```sql
-- Check recent audit log entries
SELECT event_type, details, success, created_at
FROM integration_audit_log
WHERE provider = 'atlassian'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Test Completion Checklist

### Connection
- [ ] OAuth flow works
- [ ] Token stored securely
- [ ] Disconnect works

### Discovery
- [ ] Manual search finds tasks
- [ ] Tasks have correct metadata
- [ ] Already-tracked tasks not duplicated

### Approval Queue
- [ ] Badge shows correct count
- [ ] Dropdown displays tasks
- [ ] Inline editing works
- [ ] Project selection works

### Approve Flow
- [ ] Single approve creates task
- [ ] Task has Confluence metadata
- [ ] Custom title/date preserved
- [ ] Bulk approve works

### Dismiss Flow
- [ ] Dismiss removes from queue
- [ ] Dismissed tasks don't reappear

### Completion Sync
- [ ] Done → syncs to Confluence
- [ ] Confluence checkbox gets checked
- [ ] Audit log records success

### Error Handling
- [ ] Token refresh works
- [ ] Graceful degradation on errors
- [ ] Clear error messages

### Mobile
- [ ] Badge visible
- [ ] Touch targets adequate
- [ ] Actions work

### Realtime
- [ ] Multi-tab sync works
- [ ] Badge count updates

---

## Sign-off

**Tested by:** _________________
**Date:** _________________
**Environment:** localhost / test / production
**All tests passed:** Yes / No
**Notes:**

