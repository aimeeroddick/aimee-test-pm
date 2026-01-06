# CLAUDE.md

This file provides guidance for Claude when working on the Trackli project.

---

## Project: Trackli

**Overview**: Trackli is a task management app for busy professionals with Kanban boards, calendar views, My Day planning, and AI-powered task extraction.

### Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL with RLS)
- **Desktop**: Electron (macOS, Windows, Linux)
- **AI**: Anthropic Claude API (image task extraction)
- **Deployment**: Vercel (web), GitHub releases (desktop)

### Key Commands
```bash
npm run dev              # Start dev server (localhost:5173)
npm run build            # Production build
npm run electron:dev     # Desktop dev mode
npm run electron:build   # Build desktop apps
```

### Project Structure
```
src/
├── components/          # React components
│   ├── KanbanBoard.jsx  # Main board (entry point for most features)
│   ├── kanban/          # Board subcomponents
│   │   ├── constants.js # Colors, enums, button styles
│   │   ├── utils.js     # Date, status, color helpers
│   │   ├── views/       # Calendar, My Day, Table
│   │   └── modals/      # Task/Project creation
├── contexts/            # AuthContext (user state)
├── lib/                 # Supabase client, error logging
└── utils/               # Task extraction utilities
api/                     # Vercel serverless functions
electron/                # Desktop app (main.cjs, preload.cjs)
```

### Database Tables
- `projects` - Folders/teams
- `tasks` - Main entities (status: backlog→todo→in_progress→done)
- `subtasks` - Task breakdowns
- `attachments` - File uploads
- `task_dependencies` - Blocking relationships
- `profiles` - User settings

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
- Primary framework: React ecosystem (React, Next.js, etc.)
- Use proper TypeScript types where applicable
- Follow modern ES6+ conventions
- Prefer named exports for better refactoring support

### Python
- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Prefer f-strings for string formatting
- Use virtual environments for dependency management

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

### Pre-Commit Checklist
Before requesting a commit, verify:
- [ ] Tested on mobile viewport (375px)
- [ ] Tested in Safari (if touching dates/inputs)
- [ ] Checked overflow/clipping behavior
- [ ] Handled loading and error states
- [ ] Used existing patterns from codebase
