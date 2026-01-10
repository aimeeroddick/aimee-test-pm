# Project Tags - PRD

**Status:** Draft  
**Created:** January 2025  
**Author:** Aimee

---

## Overview

Add project-scoped tags to enable flexible sub-categorization within projects. Works alongside existing Customer field - users can use either or both.

### Problem Statement

Different users organize their work differently:
- **Some users** use a single project and need the Customer field to categorize tasks by client
- **Other users** use Project = Customer (e.g., FIFA, BFBS, ICC) and need a way to sub-categorize within each project (e.g., "Website", "Phase 1", "UAT")

Tags provide this flexibility without changing existing Customer functionality.

---

## User Stories

- As a user who uses projects as customers, I want to tag tasks with sub-projects (e.g., "Website", "Phase 1") so I can organize work within a customer
- As a user who uses the customer field, I can continue using it unchanged and optionally add tags too
- As a user, I want to filter tasks by tag to focus on specific workstreams
- As a user, I want to create tags on-the-fly when adding them to tasks, or manage them in project settings

---

## Database Schema

### `project_tags`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| project_id | uuid | FK to projects, ON DELETE CASCADE |
| name | text | Tag name, NOT NULL |
| created_at | timestamptz | default now() |

**Indexes:**
- `project_id` (for fetching tags by project)
- Unique constraint on `(project_id, name)` - no duplicate tag names within a project

### `task_tags`

| Column | Type | Notes |
|--------|------|-------|
| task_id | uuid | FK to tasks, ON DELETE CASCADE |
| tag_id | uuid | FK to project_tags, ON DELETE CASCADE |

**Primary Key:** Composite `(task_id, tag_id)`

---

## UI Changes

### Task Modal

- **Location:** New "TAGS" row below Customer/Assignee (full width)
- **Component:** Multi-select dropdown with project's available tags
- **Behavior:**
  - Type to search existing tags or create new tag on-the-fly
  - Selected tags display as pills with × to remove
  - Max **3 tags per task** - disable adding more once at limit
  - Only shows tags for the currently selected project
  - If project changes, clear selected tags (they're project-specific)

```
CUSTOMER/CLIENT                    ASSIGNEE
[No customer            ▼]        [Unassigned           ▼]

TAGS
[+ Add tag...  ▼] [Website ×] [API ×]

EFFORT LEVEL                       TIME ESTIMATE
```

### Task Card

- **Location:** Bottom line of card, alongside Project and Customer
- **Format:** `Project · Customer · Tag1, Tag2, Tag3`
- **Variations:**
  - If no customer: `Project · Tag1, Tag2`
  - If no tags: `Project · Customer` (unchanged from current)
  - If neither: `Project` only
- **Truncation:** If line is too long, truncate with ellipsis

### Project Settings

- **Location:** New "Tags" section in project settings (same pattern as Customers)
- **Features:**
  - View all tags for the project
  - Add new tag
  - Edit tag name
  - Delete tag (with confirmation - will remove from all tasks)

### Filter Panel

- **Location:** Add to existing filter options
- **Component:** Multi-select dropdown to filter by tag(s)
- **Behavior:** Shows tags from all projects, or scoped to selected project filter

---

## Technical Considerations

### RLS Policies

```sql
-- project_tags: Users can manage tags for projects they have access to
CREATE POLICY "Users can view project tags" ON project_tags
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert project tags" ON project_tags
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Similar for UPDATE, DELETE

-- task_tags: Users can manage tags on their tasks
CREATE POLICY "Users can manage task tags" ON task_tags
  FOR ALL USING (
    task_id IN (SELECT id FROM tasks WHERE user_id = auth.uid())
  );
```

### Data Fetching

- Fetch project tags when project is selected (for dropdown options)
- Include task tags in task queries (join through task_tags)
- Consider caching project tags client-side

---

## Out of Scope (v1)

- **Tag colors** - Keep simple for now, may add later
- **Spark AI integration** - Can add "show tasks tagged X" later
- **Pending tasks (email extraction)** - Tags added after task creation
- **Notes extraction** - Tags added after task creation
- **Tag ordering/sorting** - Alphabetical for now
- **Tag usage analytics** - How often each tag is used

---

## Future Enhancements (v2+)

- Tag colors for visual distinction
- Spark commands: "tag this API", "show Website tasks"
- Bulk tag operations: "tag all selected tasks as UAT"
- Tag suggestions based on task content
- Tag templates per project type

---

## Open Questions

- ~~Colors for tags?~~ → No colors for v1
- ~~Limit on tags per task?~~ → Max 3 tags
- ~~Show both Customer and Tags on card?~~ → Yes, show both

---

## Acceptance Criteria

- [ ] Can create tags in project settings
- [ ] Can add/remove tags on tasks in modal (max 3)
- [ ] Tags display on task card alongside customer
- [ ] Can create tags on-the-fly when tagging a task
- [ ] Can filter tasks by tag
- [ ] Deleting a project deletes its tags
- [ ] Deleting a tag removes it from all tasks
- [ ] Tags are project-specific (not shared across projects)
