# Trackli Backend Readiness Checklist

## Supabase Dashboard Checks

### 1. Row Level Security (RLS) - CRITICAL ✅
Go to: **Database → Tables** → Click each table → **Policies**

Each table should have RLS **enabled** with policies like:
- `SELECT`: `auth.uid() = user_id`
- `INSERT`: `auth.uid() = user_id`
- `UPDATE`: `auth.uid() = user_id`
- `DELETE`: `auth.uid() = user_id`

**Tables to check:**
- [ ] `tasks` - user_id policy
- [ ] `projects` - user_id policy
- [ ] `subtasks` - via parent task's user_id
- [ ] `project_members` - via project's user_id
- [ ] `project_customers` - via project's user_id
- [ ] `attachments` - user_id policy
- [ ] `task_dependencies` - via task's user_id
- [ ] `feedback` - user_id policy (or public insert for anonymous feedback)
- [ ] `task_templates` - user_id policy

### 2. Database Indexes - PERFORMANCE
Go to: **Database → Tables** → Click table → **Indexes** (or use SQL Editor)

Recommended indexes for better query performance:
```sql
-- Run in SQL Editor if not already created
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
```

### 3. Storage Bucket Security
Go to: **Storage → Policies**

- [ ] `attachments` bucket has RLS policies
- [ ] Only authenticated users can upload
- [ ] Users can only access their own files

### 4. Auth Settings
Go to: **Authentication → Providers**

- [ ] Email confirmations enabled/disabled as desired
- [ ] Password requirements set appropriately
- [ ] Rate limiting enabled (prevents abuse)

Go to: **Authentication → URL Configuration**
- [ ] Site URL set to `https://gettrackli.com`
- [ ] Redirect URLs include your domain

### 5. Database Backups
Go to: **Project Settings → Database**

- [ ] Point-in-time recovery enabled (Pro plan)
- [ ] Or: Manual backup schedule if on free plan

### 6. Usage & Limits
Go to: **Project Settings → Usage**

Check current usage vs limits:
- [ ] Database size
- [ ] Storage size
- [ ] API requests
- [ ] Auth users

---

## Vercel Dashboard Checks

### 1. Analytics & Monitoring
Go to: **Project → Analytics**

- [ ] Analytics enabled
- [ ] Speed Insights enabled
- [ ] Web Vitals tracking

### 2. Environment Variables
Go to: **Project → Settings → Environment Variables**

Verify all are set for Production:
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Any other API keys

### 3. Spending Limits
Go to: **Team Settings → Billing**

- [ ] Spending alerts configured
- [ ] Budget limits set if desired

### 4. Domain Settings
Go to: **Project → Settings → Domains**

- [ ] `gettrackli.com` configured
- [ ] SSL certificate active
- [ ] Redirects working (www → non-www or vice versa)

---

## Nice to Have (Later)

### Uptime Monitoring
- [ ] UptimeRobot (free tier) - monitors if site is up
- [ ] Alerts via email/SMS when down

### Error Tracking
- [ ] Sentry integration (free tier)
- [ ] Captures JavaScript errors in production

### Database Monitoring
- [ ] Supabase Dashboard → Reports
- [ ] Slow query monitoring

---

## Quick Health Check Commands

Test your Supabase connection:
```javascript
// In browser console on your app
const { data, error } = await supabase.from('projects').select('count')
console.log(data, error)
```

Check RLS is working (should fail without auth):
```bash
curl 'https://YOUR_PROJECT.supabase.co/rest/v1/tasks' \
  -H "apikey: YOUR_ANON_KEY"
# Should return empty or error, NOT all tasks
```
