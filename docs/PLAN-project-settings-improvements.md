# Project Settings Improvements - Implementation Plan

## Overview

Three related improvements to project/task workflow:

1. **Hide customer field** for projects that don't have customers
2. **Auto-fill assignee** when project has only one member (the current user)
3. **Fix "Just Me" display name** to show actual profile name

---

## Current State

### Project Creation (`ProjectModal.jsx`)

```
Project Fields:
├── name (required)
├── color
├── members[] → stored in project_members table
├── customers[] → stored in project_customers table
└── tags[] → stored in project_tags table
```

**"Just Me" button (line 52-57):**
```javascript
const myName = user?.user_metadata?.display_name ||
               user?.user_metadata?.full_name ||
               user?.email?.split('@')[0] ||
               'Me'
```

### Task Creation (`TaskModal.jsx`)

- Customer/Assignee shown side-by-side in 2-column grid (lines 491-621)
- New tasks default to empty assignee (line 204: `assignee: ''`)
- Customer dropdown always visible, shows project customers
- No auto-population of assignee

---

## Feature 1: Hide Customer Field

### Goal
Allow projects to opt out of customer tracking, hiding the customer field in task creation/editing.

### Database Change

```sql
-- Add column to projects table
ALTER TABLE projects ADD COLUMN has_customers BOOLEAN DEFAULT true;
```

### UI Change - ProjectModal.jsx

Add a toggle in the project form.

**Final Decision:** "Enable customer tracking" toggle, **default ON**

**Location:** After the color picker, before Team Members section (around line 116)

```jsx
<div className="flex items-center justify-between py-2">
  <label className="text-sm text-gray-700 dark:text-gray-300">
    Enable customer tracking
  </label>
  <button
    type="button"
    onClick={() => setFormData({ ...formData, has_customers: !formData.has_customers })}
    className={`relative w-11 h-6 rounded-full transition-colors ${
      formData.has_customers !== false
        ? 'bg-purple-500'
        : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
      formData.has_customers !== false ? 'translate-x-5' : ''
    }`} />
  </button>
</div>
```

### UI Change - TaskModal.jsx

**Location:** Lines 491-621 (Customer & Assignee section)

```jsx
{/* Customer & Assignee - side by side (or just assignee if no customers) */}
<div className={`grid gap-2 sm:gap-3 ${
  selectedProject?.has_customers !== false
    ? 'grid-cols-1 sm:grid-cols-2'
    : 'grid-cols-1'
}`}>
  {/* Only show customer field if project tracks customers */}
  {selectedProject?.has_customers !== false && (
    <div>
      <label>Customer/Client</label>
      {/* ... existing customer dropdown ... */}
    </div>
  )}

  <div>
    <label>Assignee</label>
    {/* ... existing assignee dropdown ... */}
  </div>
</div>
```

### Data Flow

1. `ProjectModal` saves `has_customers` to projects table
2. `KanbanBoard.fetchData` already fetches projects with all columns
3. `TaskModal` receives `projects` prop, finds `selectedProject`
4. Check `selectedProject?.has_customers !== false` (default true for backwards compat)

---

## Feature 2: Auto-fill Assignee

### Goal
When creating a task in a project where the only member is the current user, auto-fill the assignee field.

### Logic

```javascript
// In TaskModal useEffect for new tasks (around line 190)
// After determining defaultProjectId:

let defaultAssignee = ''
const project = projects.find(p => p.id === defaultProjectId)
if (project?.members?.length === 1) {
  // Single member project - auto-fill
  defaultAssignee = project.members[0]
}

setFormData({
  ...
  assignee: defaultAssignee,
  ...
})
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Project has 1 member | Auto-fill that member |
| Project has 0 members | Leave empty |
| Project has 2+ members | Leave empty (user must choose) |
| User changes project | Re-evaluate and update default |

### Project Change Handler

When user changes project in TaskModal, need to update assignee if:
- New project has 1 member
- Current assignee is empty OR was auto-filled

```javascript
// When project_id changes
const handleProjectChange = (newProjectId) => {
  const project = projects.find(p => p.id === newProjectId)
  let newAssignee = formData.assignee

  // Auto-fill if single member and assignee is empty
  if (!formData.assignee && project?.members?.length === 1) {
    newAssignee = project.members[0]
  }
  // Clear assignee if it doesn't exist in new project's members
  else if (formData.assignee && !project?.members?.includes(formData.assignee)) {
    newAssignee = project?.members?.length === 1 ? project.members[0] : ''
  }

  setFormData({ ...formData, project_id: newProjectId, assignee: newAssignee })
}
```

---

## Feature 3: Fix "Just Me" Display Name

### Problem
The "Just Me" button may show email prefix instead of display name if `user?.user_metadata?.display_name` is not set.

### Current Code (ProjectModal.jsx:52-57)
```javascript
const myName = user?.user_metadata?.display_name ||
               user?.user_metadata?.full_name ||
               user?.email?.split('@')[0] ||
               'Me'
```

### Solution Options

**Option A: Use profile from AuthContext**

The app likely has a `profile` object from the `profiles` table that stores `display_name`.

```javascript
// If profile is passed as prop:
const myName = profile?.display_name ||
               user?.user_metadata?.display_name ||
               user?.user_metadata?.full_name ||
               user?.email?.split('@')[0] ||
               'Me'
```

**Option B: Fetch profile in modal**

```javascript
// Fetch user's profile for accurate name
useEffect(() => {
  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user?.id)
      .single()
    if (data?.display_name) setMyDisplayName(data.display_name)
  }
  if (user?.id) fetchProfile()
}, [user?.id])
```

### Recommendation

Check if `profile` is already available in the component's context or parent. If so, use Option A. The `useAuth()` hook likely provides both `user` and `profile`.

**Files to check:**
- `src/contexts/AuthContext.jsx` - What does `useAuth()` return?
- Where ProjectModal is rendered - What props are passed?

---

## Implementation Order

### Step 1: Database Migration
```sql
ALTER TABLE projects ADD COLUMN has_customers BOOLEAN DEFAULT true;
```

### Step 2: Update ProjectModal
1. Add `has_customers` to formData state
2. Add toggle UI after color picker
3. Include in onSave data
4. Fix "Just Me" to use profile.display_name

### Step 3: Update KanbanBoard
1. Ensure `has_customers` is included in project save
2. No fetch changes needed (already fetches all columns)

### Step 4: Update TaskModal
1. Conditionally render customer field based on `selectedProject?.has_customers`
2. Auto-fill assignee for single-member projects
3. Handle assignee when project changes

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/xxx_add_has_customers.sql` | Add column |
| `src/components/kanban/modals/ProjectModal.jsx` | Toggle UI, formData, "Just Me" fix |
| `src/components/kanban/modals/TaskModal.jsx` | Conditional customer, auto-fill assignee |
| `src/components/KanbanBoard.jsx` | Include has_customers in project save |

---

## Testing Checklist

### Hide Customer Field
- [ ] Create project with "Enable customer tracking" OFF
- [ ] Create task - customer field should be hidden
- [ ] Edit existing project, toggle OFF
- [ ] Create/edit tasks - customer field hidden
- [ ] Existing tasks with customers still show customer (read-only view?)

### Auto-fill Assignee
- [ ] Create project with "Just Me"
- [ ] Create task - assignee auto-filled with your name
- [ ] Create project with 2 members
- [ ] Create task - assignee empty (must choose)
- [ ] Change task's project from multi-member to single-member
- [ ] Assignee should auto-fill

### Display Name
- [ ] Click "Just Me" - shows actual display name, not email prefix
- [ ] Works for users with/without display_name set

---

## Findings from Code Review

### AuthContext provides `profile`

`useAuth()` returns:
- `user` - Supabase auth user
- `profile` - From `profiles` table, includes `display_name`

### Profiles table schema

```sql
profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT,
  date_format TEXT,
  week_starts_on TEXT,
  inbound_email_token TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### Fix for "Just Me" Display Name

**Current:** ProjectModal receives `user` prop but NOT `profile`

**Fix:** Pass `profile` to ProjectModal and update the name logic:

```javascript
// OLD (line 52-57)
const myName = user?.user_metadata?.display_name ||
               user?.user_metadata?.full_name ||
               user?.email?.split('@')[0] ||
               'Me'

// NEW - add profile as first priority
const myName = profile?.display_name ||
               user?.user_metadata?.display_name ||
               user?.user_metadata?.full_name ||
               user?.email?.split('@')[0] ||
               'Me'
```

**Where to update:**
1. `KanbanBoard.jsx` - Pass `profile` to ProjectModal
2. `ProjectModal.jsx` - Add `profile` to props, update `addJustMe()`

---

## Decisions Made

1. **Toggle phrasing:** "Enable customer tracking" ✓
2. **Default value:** ON (true) - backwards compatible with existing behavior ✓
3. **Existing tasks with customers:** When toggle is OFF, existing tasks keep their customer value (just hidden from UI, preserved in database)
