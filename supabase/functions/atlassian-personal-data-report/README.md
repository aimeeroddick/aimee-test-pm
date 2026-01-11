# Atlassian Personal Data Reporting API

## Overview

This Edge Function implements the [Atlassian Personal Data Reporting API](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/), which is required for GDPR compliance when storing personal data associated with Atlassian accounts.

## What It Does

1. **Reports stored accounts** - Sends all stored `atlassian_account_id` values to Atlassian's API
2. **Handles ERASE requests** - When Atlassian says a user requested deletion, removes all their data
3. **Handles REFRESH requests** - Flags accounts that need their personal data refreshed

## Data We Store

| Data | Table | Purpose |
|------|-------|---------|
| `atlassian_account_id` | `atlassian_connections` | User identification |
| `atlassian_email` | `atlassian_connections` | Display/reference |
| `atlassian_display_name` | `atlassian_connections` | Display/reference |
| OAuth tokens | Supabase Vault | API authentication |
| Jira issue data | `tasks` | Two-way sync |
| Confluence task data | `tasks`, `confluence_pending_tasks` | Task import |

## Scheduling

This function should run periodically. Atlassian recommends at least weekly reporting.

### Option 1: Supabase Cron (pg_cron)

```sql
-- Run daily at 3 AM UTC
SELECT cron.schedule(
  'atlassian-personal-data-report',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/atlassian-personal-data-report',
    headers := '{"Authorization": "Bearer your-service-role-key"}'::jsonb
  );
  $$
);
```

### Option 2: External Cron

Use a service like cron-job.org, GitHub Actions, or your own server:

```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/atlassian-personal-data-report \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Option 3: Manual Trigger

Call the endpoint manually when needed (e.g., before Atlassian security review).

## API Endpoint

**URL**: `POST /functions/v1/atlassian-personal-data-report`

**Authentication**: Service role key (server-side only)

**Response**:
```json
{
  "success": true,
  "reported": 5,
  "eraseProcessed": 0,
  "refreshFlagged": 1,
  "errors": []
}
```

## What Happens on ERASE

When Atlassian returns an ERASE action for an account:

1. OAuth tokens deleted from Vault
2. `jira_project_sync` records deleted
3. `confluence_pending_tasks` deleted
4. Jira/Confluence fields cleared from `tasks` (tasks kept, links removed)
5. `atlassian_connections` record deleted
6. Event logged to `integration_audit_log`

## Monitoring

Check the audit log for reporting activity:

```sql
SELECT event_type, details, success, created_at
FROM integration_audit_log
WHERE event_type LIKE 'personal_data.%'
ORDER BY created_at DESC
LIMIT 20;
```

## Deployment

```bash
npx supabase functions deploy atlassian-personal-data-report --no-verify-jwt
```

Note: `--no-verify-jwt` allows the function to be called by cron/service role without user JWT.

## References

- [Atlassian User Privacy Developer Guide](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/)
- [Confluence Personal Data Reporting API](https://developer.atlassian.com/cloud/confluence/user-privacy-developer-guide/)
