# Trackli Future Enhancements

This document tracks planned features and technical improvements that have been documented but deferred for future implementation.

---

## Confluence Integration Enhancements

### 1. Confluence Space Filter (UI)

**Status:** Deferred  
**Priority:** Medium  
**Context:** Similar to how Jira has project toggles, Confluence should have space selection

**What it would do:**
- Show list of user's Confluence spaces in Settings
- Toggle which spaces to search for tasks
- Reduce noise from irrelevant spaces

**Implementation approach:**
1. Fetch spaces from Confluence API on connect
2. Store space preferences (new `confluence_spaces` table or add to `atlassian_connections`)
3. Add expandable "Confluence Spaces" section in Settings (mirror Jira Projects UI)
4. Modify `confluence-fetch-tasks` to filter by selected spaces

**Files to modify:**
- `/supabase/functions/confluence-fetch-tasks/index.ts` - Add space filtering
- `/src/components/KanbanBoard.jsx` - Add Confluence Spaces UI section
- Database migration for space preferences

---

### 2. Confluence Webhook Implementation (Real-time Sync)

**Status:** Deferred  
**Priority:** Low (manual sync working well)  
**PRD:** `/docs/PRD-confluence-webhook-implementation.md`

**What it would do:**
- Automatic task discovery when assigned in Confluence (no manual "Sync Confluence" click)
- Two-way completion sync (complete in Confluence → updates Trackli)

**Key considerations:**
- Confluence webhooks are page-centric, not task-centric
- Every page edit triggers webhook (high volume)
- Need change detection to identify new/completed tasks
- More complex than Jira webhooks

**Implementation phases (from PRD):**
1. OAuth scope update (`manage:confluence-configuration`)
2. Database migration (`confluence_webhook_id` column)
3. Webhook registration in auth callback
4. Create `confluence-webhook` Edge Function
5. Webhook cleanup on disconnect

**When to implement:**
- If beta users complain about manual sync
- When Confluence adoption increases significantly
- When there's time to properly test edge cases

---

## Current Confluence Implementation (Shipped)

For reference, here's what's currently working:

- ✅ Manual sync via "Sync Confluence" button
- ✅ Pending queue with approval workflow
- ✅ Clickable page links in pending dropdown
- ✅ Confluence badge on task cards (links to page)
- ✅ Trackli → Confluence completion sync
- ✅ No duplicate imports on re-sync
- ✅ Dismissed tasks don't reappear

**Known limitations (documented in user guide):**
- Manual sync only
- One-way discovery (Confluence → Trackli completion not synced)
- @mention required inside task checkbox
- Only native task checkbox format supported

---

## Other Future Enhancements

### Task Dependencies
- Visual dependency chains on board
- Blocked task indicators
- Critical path highlighting

### Team Collaboration
- Shared projects
- Real-time collaboration
- Comments and @mentions

### Calendar Two-Way Sync
- Google Calendar integration
- Outlook Calendar integration
- Auto-schedule tasks around meetings

### Mobile Native Apps
- iOS app
- Android app
- Push notifications

---

*Last Updated: January 2026*
