# Security Foundations for Atlassian Integration

## Overview

Before integrating with Atlassian (which may contain sensitive client data), we need to implement security foundations to protect OAuth tokens and prevent common attack vectors.

**Priority:** Must complete before Atlassian integration development

---

## 1. Encrypt OAuth Tokens at Rest

### Problem
If the database is compromised, attackers could steal OAuth tokens and access users' Atlassian accounts (including client data in Jira).

### Solution
Encrypt tokens before storing in Supabase, decrypt only when needed server-side.

### Implementation

**Option A: Supabase Vault (Recommended)**
- Use Supabase's built-in [Vault](https://supabase.com/docs/guides/database/vault) for secrets management
- Tokens encrypted with Supabase's managed encryption key
- Access via `vault.create_secret()` and `vault.decrypted_secrets` view

**Option B: Application-level encryption**
- Encrypt tokens using AES-256-GCM before storing
- Store encryption key in environment variable (not in database)
- Decrypt in Edge Function only when making API calls

### Database Schema
```sql
CREATE TABLE atlassian_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,                    -- Atlassian cloud site ID
  site_url TEXT NOT NULL,                   -- e.g., spicymango.atlassian.net
  -- Encrypted tokens (never store plaintext)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- Metadata (safe to store plaintext)
  atlassian_account_id TEXT NOT NULL,
  email TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, site_id)
);

-- RLS: Users can only see their own connections
ALTER TABLE atlassian_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON atlassian_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON atlassian_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON atlassian_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON atlassian_connections
  FOR DELETE USING (auth.uid() = user_id);
```

### Acceptance Criteria
- [ ] Tokens are encrypted before database write
- [ ] Encryption key is NOT stored in database
- [ ] Tokens can only be decrypted server-side (Edge Function)
- [ ] Frontend never receives raw tokens

---

## 2. OAuth State Parameter (CSRF Protection)

### Problem
Without state validation, an attacker could trick a user into connecting the attacker's Atlassian account to the victim's Trackli account (CSRF attack).

### Solution
Generate a random state parameter, store it temporarily, validate on callback.

### Implementation
```javascript
// 1. Generate state before redirect
const state = crypto.randomUUID();
await supabase.from('oauth_states').insert({
  state,
  user_id: user.id,
  expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min expiry
});

// Redirect to Atlassian with state
const authUrl = `https://auth.atlassian.com/authorize?state=${state}&...`;

// 2. Validate on callback
const { state: returnedState, code } = queryParams;
const { data: validState } = await supabase
  .from('oauth_states')
  .select()
  .eq('state', returnedState)
  .eq('user_id', user.id)
  .gt('expires_at', new Date().toISOString())
  .single();

if (!validState) {
  throw new Error('Invalid or expired OAuth state');
}

// Delete used state
await supabase.from('oauth_states').delete().eq('state', returnedState);
```

### Database Schema
```sql
CREATE TABLE oauth_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'atlassian',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup expired states
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own states" ON oauth_states
  FOR ALL USING (auth.uid() = user_id);
```

### Acceptance Criteria
- [ ] Random state generated for each OAuth flow
- [ ] State stored with expiry (10 minutes)
- [ ] Callback validates state matches and hasn't expired
- [ ] Used states are deleted immediately

---

## 3. Webhook Signature Verification

### Problem
Without verification, attackers could send fake webhooks to manipulate task data.

### Solution
Verify Atlassian's webhook signatures using HMAC.

### Implementation
```javascript
// In Edge Function receiving webhooks
import { createHmac } from 'crypto';

function verifyAtlassianWebhook(request, body) {
  const signature = request.headers.get('x-hub-signature');
  if (!signature) {
    throw new Error('Missing webhook signature');
  }
  
  const secret = Deno.env.get('ATLASSIAN_WEBHOOK_SECRET');
  const expectedSignature = 'sha256=' + createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid webhook signature');
  }
}
```

### Acceptance Criteria
- [ ] All webhook endpoints verify signatures
- [ ] Invalid signatures return 401 and are logged
- [ ] Webhook secret stored in environment variable

---

## 4. Server-Side Only Token Handling

### Problem
If tokens reach the frontend, they could be stolen via XSS or browser extensions.

### Solution
All Atlassian API calls happen in Edge Functions. Frontend only receives safe, processed data.

### Architecture
```
Frontend                    Edge Function                 Atlassian API
   │                              │                              │
   │ Request: "Get my Jira tasks" │                              │
   │─────────────────────────────>│                              │
   │                              │ Decrypt token                │
   │                              │ GET /rest/api/3/search       │
   │                              │─────────────────────────────>│
   │                              │                              │
   │                              │<─────────────────────────────│
   │                              │ Return issues                │
   │<─────────────────────────────│                              │
   │ Return: [task objects]       │                              │
   │ (no tokens!)                 │                              │
```

### Acceptance Criteria
- [ ] No Atlassian tokens in frontend code
- [ ] No tokens in API responses to frontend
- [ ] All Atlassian calls routed through Edge Functions

---

## 5. Audit Logging

### Problem
Without logs, we can't investigate security incidents or unusual activity.

### Solution
Log all sensitive operations with timestamp and user context.

### Events to Log
- Atlassian account connected
- Atlassian account disconnected
- Token refresh performed
- Webhook received (success/failure)
- API call failures
- Sync errors

### Database Schema
```sql
CREATE TABLE integration_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'atlassian',
  site_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's activity
CREATE INDEX idx_audit_log_user ON integration_audit_log(user_id, created_at DESC);

-- RLS: Users can view own logs, admins can view all
ALTER TABLE integration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON integration_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Insert policy: Only backend (service role) can insert
CREATE POLICY "Service role can insert" ON integration_audit_log
  FOR INSERT WITH CHECK (TRUE);
```

### Acceptance Criteria
- [ ] All connection/disconnection events logged
- [ ] Token refresh events logged
- [ ] Webhook events logged with success/failure
- [ ] Logs include timestamp, user_id, event type
- [ ] Logs retained for 90 days minimum

---

## 6. Rate Limiting

### Problem
Without rate limits, attackers could abuse OAuth endpoints or webhooks.

### Solution
Implement rate limiting on sensitive endpoints.

### Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| OAuth initiate | 5 requests | per minute per user |
| OAuth callback | 10 requests | per minute per IP |
| Webhook endpoint | 100 requests | per minute per site |
| Sync refresh | 10 requests | per minute per user |

### Implementation
Use Supabase Edge Function with in-memory rate limiting or Redis.

### Acceptance Criteria
- [ ] Rate limits enforced on OAuth endpoints
- [ ] Rate limits enforced on webhooks
- [ ] Exceeded limits return 429 status
- [ ] Rate limit hits are logged

---

## 7. Environment Variables Checklist

Required secrets (never commit to git):

```bash
# Atlassian OAuth
ATLASSIAN_CLIENT_ID=           # From developer.atlassian.com
ATLASSIAN_CLIENT_SECRET=       # From developer.atlassian.com
ATLASSIAN_WEBHOOK_SECRET=      # Generate: openssl rand -hex 32

# Token Encryption (if using app-level encryption)
TOKEN_ENCRYPTION_KEY=          # Generate: openssl rand -hex 32
```

### Acceptance Criteria
- [ ] All secrets in environment variables
- [ ] Secrets not in git history
- [ ] Separate values for test/production
- [ ] Documented in team password manager

---

## Implementation Order

1. **Database tables** - Create tables with RLS (30 min)
2. **Token encryption** - Set up Vault or app-level encryption (1-2 hrs)
3. **OAuth state management** - Implement CSRF protection (1 hr)
4. **Audit logging** - Add logging infrastructure (1 hr)
5. **Webhook verification** - Signature checking (30 min)
6. **Rate limiting** - Add to Edge Functions (1 hr)

**Total estimate:** 5-7 hours

---

## Testing Checklist

Before going live:

- [ ] Try to access another user's Atlassian connection (should fail)
- [ ] Try OAuth callback with invalid/expired state (should fail)
- [ ] Try sending fake webhook without signature (should fail)
- [ ] Verify tokens are encrypted in database (inspect raw data)
- [ ] Verify frontend network tab shows no tokens
- [ ] Test token refresh flow works correctly
- [ ] Verify audit logs capture all events

---

## Questions

1. **Supabase Vault vs app-level encryption?** Vault is simpler but requires Supabase Pro. App-level works on any plan.

2. **Audit log retention?** 90 days recommended. Should we auto-delete older logs?

3. **Alert on suspicious activity?** e.g., multiple failed OAuth attempts, webhook signature failures
