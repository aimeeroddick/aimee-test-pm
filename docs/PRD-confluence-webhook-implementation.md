# Confluence Webhook Implementation Plan

## Summary
Add automated two-way sync for Confluence tasks via webhooks, following the same pattern as Jira webhooks. This replaces manual "Search Confluence" with real-time task discovery and enables Confluence → Trackli completion sync.

**Current State:**
- ✅ Manual sync via "Search Confluence" button works
- ✅ Trackli → Confluence completion sync works
- ❌ No real-time task discovery (requires manual button click)
- ❌ No Confluence → Trackli completion sync

**Goal:**
- Automatic task discovery when assigned in Confluence
- Two-way completion sync (complete in either place, syncs to the other)

---

## Phase 1: OAuth Scope Update

**File**: `/supabase/functions/atlassian-auth-init/index.ts`

Add Confluence webhook management scope to the OAuth flow:

```typescript
const scopes = [
  // ... existing scopes ...
  'manage:confluence-configuration',  // NEW - Required for webhook management
]
```

**Note**: After updating, users must disconnect and reconnect Atlassian to get new scope grant.

---

## Phase 2: Database Migration

**File**: New migration via `mcp__supabase__apply_migration`

```sql
-- Add Confluence webhook ID storage to atlassian_connections
ALTER TABLE atlassian_connections
ADD COLUMN IF NOT EXISTS confluence_webhook_id TEXT;

-- Add column to track last known task status for change detection
ALTER TABLE confluence_pending_tasks
ADD COLUMN IF NOT EXISTS last_known_status TEXT DEFAULT 'incomplete';

-- Index for efficient webhook lookups
CREATE INDEX IF NOT EXISTS idx_atlassian_connections_confluence_webhook
ON atlassian_connections(confluence_webhook_id)
WHERE confluence_webhook_id IS NOT NULL;
```

---

## Phase 3: Webhook Registration

**File**: `/supabase/functions/atlassian-auth-callback/index.ts`

Add `registerConfluenceWebhook()` function (similar to existing `registerJiraWebhook()`):

```typescript
async function registerConfluenceWebhook(
  siteId: string,
  accessToken: string,
  supabaseAdmin: SupabaseClient
): Promise<string | null> {
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/confluence-webhook`

  // Register for page events (tasks are embedded in pages)
  const response = await fetch(
    `https://api.atlassian.com/ex/confluence/${siteId}/wiki/rest/api/webhooks`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: [
          'page_created',
          'page_updated',
          'page_removed'
        ]
      })
    }
  )

  if (response.ok) {
    const data = await response.json()
    return data.id  // Store this in atlassian_connections.confluence_webhook_id
  }
  return null
}
```

Call this after successful OAuth, alongside Jira webhook registration.

---

## Phase 4: Create Confluence Webhook Handler

**File**: `/supabase/functions/confluence-webhook/index.ts` (NEW)

### 4.1 Structure (following jira-webhook pattern)

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-atlassian-webhook-identifier',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload = await req.json()
    const event = payload.event  // 'page_created', 'page_updated', 'page_removed'

    // Extract site ID from webhook payload
    const siteId = extractSiteId(payload)
    const pageId = payload.page?.id

    // Handle based on event type
    switch (event) {
      case 'page_created':
      case 'page_updated':
        await handlePageChange(supabaseAdmin, siteId, pageId, payload)
        break
      case 'page_removed':
        await handlePageRemoved(supabaseAdmin, siteId, pageId)
        break
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Confluence webhook error:', error)
    // Always return 200 to prevent Atlassian retries
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

### 4.2 Page Change Handler

```typescript
async function handlePageChange(
  supabase: SupabaseClient,
  siteId: string,
  pageId: string,
  payload: any
) {
  // 1. Find all users connected to this site
  const { data: connections } = await supabase
    .from('atlassian_connections')
    .select('user_id, atlassian_account_id, access_token_secret_id')
    .eq('site_id', siteId)
    .eq('sync_enabled', true)

  if (!connections?.length) return

  // 2. For each connected user, check if page has tasks assigned to them
  for (const conn of connections) {
    // Get valid access token
    const token = await getValidToken(supabase, conn)
    if (!token) continue

    // Fetch page content and parse tasks
    const tasks = await fetchPageTasks(siteId, pageId, token)

    // Filter to tasks assigned to this user
    const userTasks = tasks.filter(t => t.assigneeId === conn.atlassian_account_id)

    for (const task of userTasks) {
      // Check if task already exists in Trackli
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('confluence_task_id', task.id)
        .eq('user_id', conn.user_id)
        .single()

      if (existingTask) {
        // TASK EXISTS - Check for completion sync (Confluence → Trackli)
        if (task.status === 'complete' && existingTask.status !== 'done') {
          // Mark as done in Trackli
          await supabase
            .from('tasks')
            .update({
              status: 'done',
              completed_at: new Date().toISOString()
            })
            .eq('id', existingTask.id)

          await logAuditEvent(supabase, conn.user_id, 'confluence.webhook.task_completed', {
            taskId: existingTask.id,
            confluenceTaskId: task.id
          })
        }
      } else {
        // NEW TASK - Add to pending queue
        await supabase
          .from('confluence_pending_tasks')
          .upsert({
            user_id: conn.user_id,
            connection_id: conn.id,
            confluence_task_id: task.id,
            confluence_page_id: pageId,
            confluence_page_title: payload.page?.title,
            confluence_space_key: payload.page?.spaceKey,
            task_title: task.body,
            status: 'pending',
            discovered_at: new Date().toISOString()
          }, {
            onConflict: 'confluence_task_id,user_id'
          })

        await logAuditEvent(supabase, conn.user_id, 'confluence.webhook.task_discovered', {
          confluenceTaskId: task.id,
          pageId
        })
      }
    }
  }
}
```

### 4.3 Task Parsing from Page Content

```typescript
async function fetchPageTasks(
  siteId: string,
  pageId: string,
  token: string
): Promise<ConfluenceTask[]> {
  // Fetch page content in storage format (XML)
  const response = await fetch(
    `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/pages/${pageId}?body-format=storage`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  if (!response.ok) return []

  const page = await response.json()
  const content = page.body?.storage?.value || ''

  // Parse <ac:task> elements from XML
  // Reuse existing parsing logic from confluence-fetch-tasks
  return parseTasksFromXml(content, pageId)
}
```

---

## Phase 5: Webhook Cleanup on Disconnect

**File**: `/supabase/functions/atlassian-disconnect/index.ts`

Add Confluence webhook deletion (similar to existing Jira webhook cleanup):

```typescript
// After deleting Jira webhook, also delete Confluence webhook
if (connection.confluence_webhook_id) {
  try {
    await fetch(
      `https://api.atlassian.com/ex/confluence/${connection.site_id}/wiki/rest/api/webhooks/${connection.confluence_webhook_id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    )
  } catch (err) {
    console.error('Failed to delete Confluence webhook:', err)
    // Continue with disconnect even if webhook deletion fails
  }
}
```

---

## Phase 6: Frontend Updates

**File**: `/src/components/KanbanBoard.jsx`

### 6.1 Remove Manual Sync Button (Optional)

Once webhooks are working, the "Search Confluence" button becomes optional (keep for manual refresh).

### 6.2 Handle Realtime Updates

The existing realtime subscription on `confluence_pending_tasks` will automatically pick up webhook-inserted tasks - no frontend changes needed for discovery.

### 6.3 Two-Way Completion Already Works

- Trackli → Confluence: Already implemented via `confluence-complete-task`
- Confluence → Trackli: New webhook handler marks tasks as done

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `/supabase/functions/confluence-webhook/index.ts` | Receive webhook events |

### Files to Modify
| File | Changes |
|------|---------|
| `/supabase/functions/atlassian-auth-init/index.ts` | Add webhook management scope |
| `/supabase/functions/atlassian-auth-callback/index.ts` | Register webhook on connect |
| `/supabase/functions/atlassian-disconnect/index.ts` | Delete webhook on disconnect |
| Database migration | Add `confluence_webhook_id` column |

---

## Confluence Webhook Limitations

**Important**: Confluence webhooks are **page-centric**, not task-centric:

1. **No direct task events** - We receive `page_updated` when a task changes
2. **Must parse page content** - Extract tasks from page XML on each update
3. **Change detection needed** - Compare current vs. previous state to detect new/completed tasks
4. **Higher volume** - Any page edit triggers webhook, even non-task changes

**Mitigation**:
- Early exit if page has no tasks
- Cache last-known task state for comparison
- Use efficient XML parsing

---

## Verification Steps

### 1. OAuth Scope Test
- Disconnect Atlassian
- Reconnect and verify new scope granted
- Check browser network tab for scope in OAuth URL

### 2. Webhook Registration Test
- After reconnect, check `atlassian_connections.confluence_webhook_id` is populated
- Verify webhook appears in Confluence admin (if accessible)

### 3. Task Discovery Test
- Create a new task in Confluence assigned to connected user
- Verify task appears in Trackli pending queue within seconds
- Check `integration_audit_log` for `confluence.webhook.task_discovered`

### 4. Confluence → Trackli Completion Test
- Approve a Confluence task in Trackli
- Complete the task directly in Confluence (check the checkbox)
- Verify Trackli task automatically moves to "done"
- Check audit log for `confluence.webhook.task_completed`

### 5. Trackli → Confluence Completion Test (existing)
- Move an approved Confluence task to "done" in Trackli
- Verify task is checked off in Confluence

### 6. Disconnect Cleanup Test
- Disconnect Atlassian
- Verify `confluence_webhook_id` is cleared
- Verify no orphan webhooks in Confluence

---

## Implementation Order

1. Database migration (add `confluence_webhook_id` column)
2. Update OAuth scope in `atlassian-auth-init`
3. Add webhook registration in `atlassian-auth-callback`
4. Create `confluence-webhook` Edge Function
5. Add webhook cleanup in `atlassian-disconnect`
6. Deploy all functions
7. Test: Disconnect/reconnect to register webhook
8. Test: Create task in Confluence → appears in Trackli
9. Test: Complete in Confluence → syncs to Trackli
10. Test: Complete in Trackli → syncs to Confluence (existing)
