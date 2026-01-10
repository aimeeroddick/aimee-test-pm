# CLAUDE.md

This file provides guidance for Claude when working on the Trackli project.

---

## Project: Trackli

**Overview**: Trackli is a task management app for busy professionals with Kanban boards, calendar views, My Day planning, and AI-powered task extraction.

**Current Version**: 2.23.1

### Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL with RLS, Edge Functions, Vault)
- **Desktop**: Electron (macOS, Windows, Linux)
- **AI**: Anthropic Claude API (Spark assistant, image task extraction)
- **Deployment**: Vercel (web), GitHub releases (desktop)

### Key Commands
```bash
# Development
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build

# Desktop
npm run electron:dev     # Desktop dev mode
npm run electron:build:mac   # Build macOS app (requires signing)
npm run electron:build:win   # Build Windows app
npm run electron:build:linux # Build Linux app

# Supabase Edge Functions
npx supabase functions deploy <function-name> --no-verify-jwt
npx supabase secrets set KEY=value

# Git Workflow
git push origin test-develop  # Deploy to test environment
# NEVER push directly to main - always test first
```

### Project Structure
```
src/
├── components/          # React components
│   ├── KanbanBoard.jsx  # Main board (11,800+ lines - entry point for most features)
│   ├── kanban/          # Board subcomponents
│   │   ├── constants.js # Colors, enums, button styles
│   │   ├── utils.js     # Date, status, color helpers
│   │   ├── views/       # Calendar, My Day, Table
│   │   ├── modals/      # Task/Project creation
│   │   └── SparkPanel.jsx # AI assistant
│   └── auth/            # OAuth callbacks (Atlassian, etc.)
├── contexts/            # AuthContext (user state)
├── lib/                 # Supabase client, error logging
└── utils/               
    ├── analytics.js     # Event tracking
    └── cacheManager.js  # PWA cache control
api/                     # Vercel serverless functions
electron/                # Desktop app (main.cjs, preload.cjs)
supabase/
└── functions/           # Edge Functions (Deno/TypeScript)
    ├── spark-chat/      # AI assistant
    ├── atlassian-auth-init/
    ├── atlassian-auth-callback/
    └── jira-test-fetch/
docs/                    # PRDs and progress docs
build/                   # Desktop app resources (icons, entitlements)
public/
└── icons/               # PWA icons (icon-72x72.png through icon-512x512.png)
```

### Database Tables
- `projects` - Folders/teams
- `tasks` - Main entities (status: backlog→todo→in_progress→done)
- `subtasks` - Task breakdowns
- `attachments` - File uploads
- `task_dependencies` - Blocking relationships
- `profiles` - User settings
- `atlassian_connections` - OAuth tokens (encrypted via Vault)
- `jira_project_sync` - Per-project sync settings
- `oauth_states` - CSRF protection for OAuth flows
- `integration_audit_log` - Security audit trail
- `spark_analytics` - AI query routing analytics

---

## Deployment & Releases

### Git Workflow (CRITICAL)
```
All changes → test-develop → test thoroughly → merge to main
```
- **NEVER push directly to main**
- Test environment: https://trackli-git-test-develop-trackli.vercel.app
- Production: https://gettrackli.com

### Vercel (Web)
- Auto-deploys from both branches
- Preview URLs for test-develop branch
- Production deploys from main branch

### Edge Functions (Supabase)
```bash
cd ~/Desktop/Trackli
npx supabase functions deploy <function-name> --no-verify-jwt
```
- Functions are in `/supabase/functions/`
- Each function has its own folder with `index.ts`
- Secrets set via: `npx supabase secrets set KEY=value`

### macOS Notarization
**Prerequisites:**
- Apple Developer Account ($99/year)
- Developer ID Application certificate (in Keychain)
- App-specific password (from appleid.apple.com)
- Team ID: `YKB55F67P3`

**Build & Notarize:**
```bash
export APPLE_ID="aw291@evansville.edu"
export APPLE_TEAM_ID="YKB55F67P3"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
npm run electron:build:mac
```

**Check notarization status:**
```bash
xcrun notarytool history --apple-id "aw291@evansville.edu" --team-id "YKB55F67P3" --password "xxxx"
```

### Windows Store (Future)
- Microsoft Partner Center account ($19 one-time)
- Build: `npm run electron:build:win`
- Output: `release/Trackli-Setup.exe`

---

## Cache Management

### Overview
PWA caching can cause stale icons/assets. A cache management system handles this:

**File:** `/src/utils/cacheManager.js`

### Updating Icons/Assets
When changing PWA icons or assets:

1. **Update the icons** in `/public/icons/`
2. **Increment CACHE_VERSION** in `/src/utils/cacheManager.js`:
   ```javascript
   export const CACHE_VERSION = '2.23.2' // Bump this
   ```
3. **Icons have cache-busting** in `vite.config.js`:
   ```javascript
   src: 'icons/icon-192x192.png?v=2',  // Increment ?v=X for major icon changes
   ```

### How It Works
- On app load, `initCacheManager()` checks if version changed
- If changed: clears all caches, service workers, and reloads
- Users can manually clear via Settings → Troubleshooting → "Clear & Reload"

### Troubleshooting PWA Issues
If users report stale icons/content:
1. Tell them: Settings → Troubleshooting → "Clear & Reload"
2. For stubborn cases (Windows taskbar): 
   - Unpin from taskbar
   - Uninstall PWA from chrome://apps
   - Clear site data: chrome://settings/content/all → find gettrackli → delete
   - Reinstall and re-pin while app is open

---

## Integrations

### Atlassian (Jira/Confluence)
**Status:** OAuth working, Jira fetch in progress

**Progress doc:** `/docs/ATLASSIAN-INTEGRATION-PROGRESS.md`

**Key files:**
- `/supabase/functions/atlassian-auth-init/` - Starts OAuth flow
- `/supabase/functions/atlassian-auth-callback/` - Handles callback, stores tokens
- `/supabase/functions/jira-test-fetch/` - Test fetching Jira issues
- `/src/components/auth/AtlassianCallback.jsx` - Frontend callback handler

**OAuth App:** developer.atlassian.com/console/myapps (App: "Trackli")

**Scopes:** read:me, read:jira-work, write:jira-work, read:jira-user, read:confluence-content.all, write:confluence-content, read:confluence-user, offline_access

### Spark AI Assistant
**Architecture:** Hybrid frontend/Claude approach

**Why hybrid?** Claude API rate limit is 10,000 tokens/minute organization-wide. Each query uses ~5,000 tokens × 2 calls. Hybrid handles 80%+ locally.

**Flow:**
```
User Query → Frontend Pattern Matching (handleLocalQuery)
           ↓
    Match? → Yes → Instant Response (no API)
           ↓ No
    Follow-up? → Yes → Claude API (with lastQueryResults context)
           ↓ No
    Claude API (task creation, complex queries)
```

**Local patterns:** Due today/tomorrow/this week, overdue, in progress, backlog, critical, my day, effort levels, project queries, assignee queries

**Key file:** `/src/components/kanban/SparkPanel.jsx`

### Slack Integration
- DM-based notifications
- Minimal scopes: chat:write, commands, users:read, im:write

### Email-to-Task
- Users have unique inbound email address
- Forwards create tasks via approval queue
- Address shown in Settings

### Outlook Add-in
- Creates tasks from current email
- User-triggered only, no background access

---

## Lessons Learned (From Git History)

These patterns have caused rework in the past. Address them upfront:

### 1. Mobile-First Development
**Problem**: Multiple commits fixing mobile issues discovered late (tap handlers, touch events, responsive layouts).

**Solution**:
- Test on mobile viewport (375px) BEFORE committing
- Use `onTouchEnd` alongside `onClick` for tap targets
- Check iOS Safari specifically (showPicker() doesn't work)
- Verify touch targets are at least 44x44px

### 2. Use Standard Tailwind Breakpoints
**Problem**: Arbitrary breakpoints like `min-[1100px]` caused compilation issues.

**Solution**:
- Use standard breakpoints: `sm`, `md`, `lg`, `xl`, `2xl`
- If custom breakpoint truly needed, add to `tailwind.config.js`
- Test at: 375px (mobile), 768px (tablet), 1024px (laptop), 1440px (desktop)

### 3. Test Overflow and Clipping
**Problem**: Badge clipping required 5+ commits to resolve.

**Solution**:
- Check elements that extend beyond parent bounds
- Add `overflow-visible` when children intentionally overflow
- Test with different content lengths

### 4. Browser Compatibility
**Problem**: Safari-specific issues discovered in production.

**Solution**:
- Test date inputs in Safari (native picker differs)
- Avoid `showPicker()` - use click overlays instead
- Check CSS features in caniuse.com when uncertain

### 5. Consider Edge Cases Upfront
Before implementing UI changes, ask:
- What happens on mobile?
- What happens with long text?
- What if the user has no data?
- What if the request fails?

### 6. Incremental Changes
**Problem**: Large batch updates caused deployment timeouts and merge conflicts.

**Solution**:
- Make small, focused commits
- Test each change before moving to next
- Don't bundle unrelated changes

### 7. Root Cause Analysis
**Problem**: Workarounds that didn't fix underlying issues.

**Solution**:
- Always identify the root cause before implementing fix
- Avoid bandaid solutions that mask problems
- Document why a fix works, not just what it does

---

## Core Principles

### Change Philosophy
- **Bug fixes and small changes**: Keep changes minimal and focused. Only modify what's necessary to solve the problem.
- **Features and enhancements**: Proactive improvements are welcome when building something new.
- **Always confirm before acting**: Ask before making changes, especially for anything beyond the immediate request. Never commit or push without explicit approval.

### Code Quality Standards
- Write clean, readable, self-documenting code
- Follow established patterns in the existing codebase
- Use a pragmatic mix of functional and OOP styles—choose what fits the problem best
- Follow standard security practices: validate inputs at boundaries, avoid common vulnerabilities (XSS, injection, etc.)

## Languages & Frameworks

### JavaScript/TypeScript
- Primary framework: React ecosystem
- Use proper TypeScript types for Edge Functions
- Follow modern ES6+ conventions
- Prefer named exports for better refactoring support

### Edge Functions (Deno)
- Use TypeScript
- Import from URLs: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'`
- Access secrets via: `Deno.env.get('SECRET_NAME')`

## Documentation

- Provide thorough documentation for all code
- Include docstrings for functions and classes explaining purpose, parameters, and return values
- Add inline comments for complex logic or non-obvious decisions
- Document the "why" not just the "what"

## Testing

- **Always write tests** for new code
- Match the testing patterns already established in the project
- Test both happy paths and edge cases
- For bug fixes, add a test that would have caught the bug

## Error Handling

- Use context-appropriate error handling:
  - **User-facing code**: Graceful degradation with helpful error messages
  - **Internal/system code**: Fail fast, surface errors clearly
  - **APIs**: Return appropriate status codes with meaningful error responses
- Never silently swallow errors
- Log errors with sufficient context for debugging

## Git Workflow

- **Small fixes**: Use small, atomic commits that do one thing
- **Features**: Use feature-complete commits when the work is cohesive
- **Always ask before committing or pushing**
- Write clear, descriptive commit messages explaining the "why"
- Reference related issues or tickets when applicable
- **Always push to test-develop first, never main directly**

## Communication Style

- Ask clarifying questions when requirements are ambiguous
- Explain reasoning for significant decisions
- Flag potential issues or trade-offs proactively
- When multiple approaches exist, present options with pros/cons

## What to Avoid

- Over-engineering or premature optimization
- Adding features beyond what was requested without asking
- Making assumptions about requirements—ask instead
- Leaving TODO comments without a plan to address them
- Committing code with known issues without flagging them
- Pushing directly to main branch

---

## Trackli-Specific Patterns

### Authentication
```javascript
// Always use the auth hook
const { user, profile, demoMode } = useAuth();

// Check for demo mode when querying
if (demoMode) {
  return demoData.tasks;
}
```

### Supabase Queries
```javascript
// Standard query pattern with error handling
const { data, error } = await supabase
  .from('tasks')
  .select('*, project:project_id(*), subtasks(*)')
  .eq('user_id', user.id);

if (error) {
  logError(error, 'api_error', { context: 'fetchTasks' });
  return;
}
```

### Error Logging
```javascript
import { logError } from '../lib/errorLogger';

// Always include context
logError(error, 'api_error', {
  context: 'functionName',
  taskId: task?.id
});
```

### Styling Conventions
- Use Tailwind utilities, avoid custom CSS
- Dark mode: use `dark:` variants
- Colors: use constants from `kanban/constants.js`
- Icons: use components from `kanban/icons.jsx`

### Date Handling
```javascript
import { formatDate, parseFlexibleTime } from './kanban/utils';
import { L } from '../lib/locale'; // For UK/US spelling

// Use locale-aware formatting
formatDate(date, profile?.date_format || 'uk');
```

### Cache Management
```javascript
import { hardReload, CACHE_VERSION } from '../utils/cacheManager';

// Force clear all caches and reload
hardReload();

// Check/display current version
console.log('App version:', CACHE_VERSION);
```

### Pre-Commit Checklist
Before requesting a commit, verify:
- [ ] Tested on mobile viewport (375px)
- [ ] Tested in Safari (if touching dates/inputs)
- [ ] Checked overflow/clipping behavior
- [ ] Handled loading and error states
- [ ] Used existing patterns from codebase
- [ ] Pushing to test-develop (not main)

---

## Key Documentation

- `/docs/ATLASSIAN-INTEGRATION-PROGRESS.md` - Jira/Confluence integration status
- `/docs/PRD-atlassian-security-foundations.md` - Security architecture
- `/docs/PRD-project-tags.md` - Project tags feature spec
- `/docs/PRD-spark-ai.md` - Spark AI assistant spec
