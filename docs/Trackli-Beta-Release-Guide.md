# Trackli Beta Release Guide
## Version 2.20 | Beta Testing Documentation

---

# Welcome to Trackli

**Trackli** is a modern task management application designed for busy professionals who juggle multiple projects, clients, and deadlines. Unlike traditional to-do apps, Trackli combines flexible organization with AI-powered features to help you capture, prioritize, and complete work more effectively.

**What makes Trackli different:**
- **Multiple views** for different planning styles (Kanban board, Calendar, Daily planner, Table)
- **AI-powered task extraction** from meeting notes and images
- **Smart daily planning** that prioritizes what matters most
- **Context-rich tasks** with projects, customers, team members, and more
- **Cross-platform** availability (Web, macOS, Windows, Linux)

This guide will help you understand how Trackli works, explore its features, and get the most out of the application during beta testing.

---

# Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [Views & Navigation](#views--navigation)
4. [Working with Tasks](#working-with-tasks)
5. [AI-Powered Features](#ai-powered-features)
6. [Projects & Organization](#projects--organization)
7. [My Day: Smart Daily Planning](#my-day-smart-daily-planning)
8. [Best Practices & Tips](#best-practices--tips)
9. [Technical Architecture](#technical-architecture)
10. [Known Limitations](#known-limitations)
11. [Providing Feedback](#providing-feedback)

---

# Getting Started

## Creating Your Account

1. Visit **gettrackli.com** or open the desktop app
2. Click **"Get Started"** or **"Sign Up"**
3. Enter your email and create a password
4. Check your email for a confirmation link
5. Click the link to verify your account
6. You're ready to go!

## First-Time Setup

When you first log in, Trackli will guide you through creating your first project. A **project** is like a folder that groups related tasks together (e.g., "Q1 Marketing Campaign" or "Product Launch").

**Quick setup steps:**
1. Create your first project with a descriptive name
2. Optionally add team members (people you assign tasks to)
3. Optionally add customers/clients (for client-facing work)
4. Start creating tasks!

## Desktop App Installation

Trackli is available as a desktop application for:
- **macOS** (Intel and Apple Silicon)
- **Windows** (64-bit)
- **Linux** (AppImage and .deb)

Download from the releases page and install. The desktop app includes:
- Automatic updates when new versions are released
- Native system integration (notifications, dark mode)
- Offline capability for viewing tasks

---

# Core Concepts

## Tasks

A **task** is the fundamental unit in Trackli. Each task can have:

| Property | Description | Example |
|----------|-------------|---------|
| **Title** | What needs to be done | "Review Q1 budget proposal" |
| **Description** | Detailed explanation | "Check line items against forecasts" |
| **Status** | Current workflow stage | Backlog, To Do, In Progress, Done |
| **Due Date** | When it's due | January 15, 2026 |
| **Start Date** | When to begin working | January 10, 2026 |
| **Time Estimate** | How long it will take | 2 hours |
| **Energy Level** | Mental effort required | High, Medium, Low |
| **Category** | Type of work | Meeting Follow-up, Email, Deliverable |
| **Source** | Where it came from | Meeting, Email, Slack, Client Request |
| **Assignee** | Who's responsible | Team member name |
| **Customer** | Related client | Client company name |
| **Critical** | Urgent flag | Yes/No |
| **Notes** | Additional context | Free-form text |
| **Attachments** | Related files | Documents, images |

## Projects

**Projects** are containers that group related tasks. Think of them as folders or workspaces.

**Examples of projects:**
- "Website Redesign" (a specific initiative)
- "Client: Acme Corp" (all work for one client)
- "Weekly Admin" (recurring operational tasks)
- "Personal" (non-work items)

Each project can have its own:
- **Team members** - People you can assign tasks to
- **Customers** - Clients associated with this work
- **Color** - Visual identifier in the interface

## Workflow Stages (Status)

Trackli uses a 4-stage Kanban workflow:

```
BACKLOG → TO DO → IN PROGRESS → DONE
```

| Stage | Purpose | When to Use |
|-------|---------|-------------|
| **Backlog** | Future work, ideas, someday tasks | Tasks you'll do eventually but not actively planning |
| **To Do** | Ready to start, actively planned | Tasks you intend to work on soon |
| **In Progress** | Currently being worked on | Tasks you're actively doing |
| **Done** | Completed | Finished tasks (auto-hidden after 5) |

---

# Views & Navigation

Trackli offers four different views, each suited for different planning styles. Switch between them using the tabs at the top of the screen.

## Board View (Kanban)

The **Board view** displays tasks as cards in columns representing workflow stages.

**Best for:**
- Visual overview of all work
- Drag-and-drop task management
- Seeing bottlenecks (too many tasks in one column)
- Team standups and status reviews

**How it works:**
- Tasks appear as cards in their respective status columns
- Drag cards between columns to change status
- Click a card to open the task detail modal
- Cards show key info: title, due date, assignee, critical flag
- Color-coded indicators show due date status (overdue = red, due today = amber)

**Tips:**
- Done column auto-hides tasks beyond the 5 most recent
- Backlog shows 10 tasks by default with "Show more" option
- Use the project dropdown to filter by project

## Calendar View

The **Calendar view** displays tasks on a monthly calendar based on their due dates.

**Best for:**
- Timeline planning
- Seeing workload distribution
- Deadline management
- Scheduling work around meetings

**How it works:**
- Tasks appear on their due date
- Click a date to see all tasks due that day
- Task cards are color-coded by status
- Progress ring shows completion percentage for each day
- Click a task to open details in the sidebar

**Tips:**
- Use the navigation arrows to move between months
- Great for spotting deadline clusters
- Combine with start dates to plan when to begin work

## My Day View

The **My Day view** is your personalized daily planning dashboard. This is where Trackli's smart prioritization shines.

**Best for:**
- Daily planning and focus
- Deciding what to work on today
- Managing energy and time
- Staying on track throughout the day

**How it works:**
- Shows only tasks you've committed to for today
- AI-powered suggestions help you plan
- Progress tracking shows how much you've completed
- Meeting notes section for capturing action items

**Detailed explanation in the [My Day section](#my-day-smart-daily-planning) below.**

## Table View

The **Table view** displays tasks in a spreadsheet-like format with sortable columns.

**Best for:**
- Bulk editing and review
- Sorting and filtering large task lists
- Data-driven task management
- Exporting or reporting

**How it works:**
- Each row is a task, each column is a property
- Click column headers to sort
- Inline editing for quick changes
- Filter and search across all tasks

---

# Working with Tasks

## Creating Tasks

**Method 1: Quick Create**
1. Click the **"+ Add Task"** button
2. Enter the task title
3. Press Enter or click Create

**Method 2: Full Details**
1. Click **"+ Add Task"**
2. Fill in the task modal with all relevant details
3. Click **"Create Task"**

**Method 3: AI Extraction** (covered in [AI Features](#ai-powered-features))
- Extract tasks from meeting notes
- Extract tasks from images of whiteboards/notes

## Task Detail Modal

When you click on a task, the detail modal opens with all task properties organized into sections:

**Basic Information**
- Title (required)
- Description
- Status dropdown
- Project assignment

**Scheduling**
- Due date picker
- Start date picker
- Time estimate (minutes, hours)

**Classification**
- Category (Meeting Follow-up, Email, Deliverable, etc.)
- Source (where the task came from)
- Energy level (High/Medium/Low)
- Critical flag toggle

**Assignment**
- Assignee (from project team members)
- Customer (from project customers)

**Additional**
- Notes (rich text area)
- Source link (URL reference)
- Attachments (file uploads)
- Subtasks (break down complex work)

## Subtasks

Complex tasks can be broken into subtasks. Each subtask has its own:
- Title
- Status (checkbox)
- Due date
- Assignee

**Creating subtasks:**
1. Open the task detail modal
2. Scroll to the Subtasks section
3. Click **"Add Subtask"** or use **"AI Break Down"**

## Task Categories

Categories help you understand the type of work:

| Category | Description |
|----------|-------------|
| **Meeting Follow-up** | Action items from meetings |
| **Email** | Email-related tasks |
| **Deliverable** | Concrete outputs to produce |
| **Admin** | Administrative tasks |
| **Review** | Review or approval tasks |
| **Call** | Phone or video call tasks |
| **Research** | Research and analysis |

## Task Sources

Track where tasks originate:

| Source | Description |
|--------|-------------|
| **Email** | Came from an email |
| **Meeting** | Discussed in a meeting |
| **Slack** | From Slack/chat |
| **Ad-hoc** | Spontaneous request |
| **Project Plan** | Part of planned work |
| **Client Request** | Direct client ask |

## Energy Levels

Energy levels help you match tasks to your mental state:

| Level | When to Use |
|-------|-------------|
| **High** | Complex thinking, creative work, difficult problems |
| **Medium** | Standard work requiring focus |
| **Low** | Routine tasks, admin, low-stakes items |

**Pro tip:** Schedule high-energy tasks for your peak productivity hours.

## Critical Tasks

Mark tasks as **Critical** when they are:
- Urgent and time-sensitive
- Blocking other work or people
- High-stakes or high-visibility

Critical tasks display a red indicator and are prioritized higher in My Day suggestions.

---

# AI-Powered Features

Trackli uses Claude AI (Anthropic's large language model) to help you work smarter. Here's how each AI feature works.

## Extract Tasks from Images

**What it does:** Analyzes photos of meeting notes, whiteboards, or handwritten notes and extracts action items as tasks.

**How it works technically:**
1. You upload an image (photo, screenshot, scan)
2. The image is sent to Claude's vision model (Claude Sonnet 4)
3. Claude analyzes the text and visual structure
4. It identifies action items based on patterns like:
   - Bullet points with action verbs
   - Owner/assignee mentions
   - Due dates or deadlines
   - Urgency indicators
5. Returns structured task data with confidence scores

**To use:**
1. Open the task creation modal
2. Click the **"Extract from Image"** tab
3. Upload or drag-drop your image
4. Click **"Extract Tasks"**
5. Review the extracted tasks
6. Adjust titles, assignees, dates as needed
7. Click **"Create All"** or select specific tasks

**What it extracts:**
- Task title (the action item)
- Assignee (if mentioned)
- Due date (parsed from text like "by Friday" or "Jan 15")
- Critical flag (if urgency words detected)
- Confidence score (how certain the AI is)

**Tips for best results:**
- Take clear, well-lit photos
- Ensure text is legible
- Include context around action items
- Structured notes extract better than scattered ones

## Extract Tasks from Text

**What it does:** Parses meeting notes, emails, or any text to find action items.

**How it works technically:**
The extraction uses pattern matching to identify common action item formats:

1. **Bullet patterns:**
   - "- Review the proposal"
   - "* Send email to client"
   - "→ Follow up with team"

2. **Owner: Action patterns:**
   - "Sarah: Review budget"
   - "John - Send update"
   - "@Mike: Complete analysis"

3. **Table formats:**
   - Markdown tables with Action/Owner/Due columns
   - Tab or pipe-delimited tables

4. **Date parsing:**
   - Relative: "today", "tomorrow", "next week", "next Tuesday"
   - Absolute: "Jan 15", "1/15", "January 15, 2026"
   - Informal: "end of week", "by Friday"

**To use:**
1. Open the task creation modal
2. Click the **"Extract from Text"** tab
3. Paste your meeting notes or text
4. Click **"Extract Tasks"**
5. Review and adjust the extracted tasks
6. Create selected tasks

**What gets filtered out:**
- Status updates ("Project is on track")
- FYI items ("Budget was approved")
- Agenda items ("Discuss roadmap")
- General summaries

## AI Task Breakdown

**What it does:** Takes a complex task and generates 3-5 actionable subtasks.

**How it works technically:**
1. Sends task title, description, and project context to Claude
2. Claude analyzes the work required
3. Generates subtasks that are:
   - Specific and actionable
   - Logically ordered
   - Starting with action verbs
   - Appropriately scoped

**To use:**
1. Open an existing task or create a new one
2. In the subtasks section, click **"AI Break Down"**
3. Review the suggested subtasks
4. Adjust or remove as needed
5. Subtasks are automatically created

**Example:**
- **Original task:** "Prepare quarterly business review presentation"
- **AI-generated subtasks:**
  1. Gather Q4 metrics and KPIs from analytics dashboard
  2. Create slide deck outline with key sections
  3. Draft executive summary slide with highlights
  4. Build data visualizations for revenue and growth charts
  5. Schedule review meeting with stakeholders for feedback

---

# Projects & Organization

## Creating Projects

1. Click the project dropdown in the header
2. Click **"+ New Project"**
3. Enter a project name
4. Choose a color (optional)
5. Click **"Create"**

## Project Settings

Open project settings by clicking the gear icon next to the project name.

**Team Members:**
Add people you work with so you can assign tasks to them.
1. Go to project settings
2. Click **"Add Team Member"**
3. Enter name and email
4. They'll appear in assignee dropdowns

**Customers:**
Track which clients tasks relate to.
1. Go to project settings
2. Click **"Add Customer"**
3. Enter the customer/client name
4. They'll appear in customer dropdowns

## Filtering Tasks

Use the filter bar to narrow down tasks:

- **Project filter:** Show tasks from specific project(s)
- **Assignee filter:** Show tasks for specific team member(s)
- **Customer filter:** Show tasks for specific client(s)
- **Search:** Find tasks by title or description

## Archiving Projects

Completed projects can be archived to reduce clutter while preserving history.

1. Open project settings
2. Click **"Archive Project"**
3. Project moves to archived section
4. Can be unarchived anytime

---

# My Day: Smart Daily Planning

The **My Day** feature is Trackli's intelligent daily planning system. It helps you decide what to work on and stay focused throughout the day.

## How My Day Works

### Planning Your Day

1. Click the **"My Day"** tab
2. Click **"Plan My Day"**
3. Enter your available time (e.g., "4 hours" or "6h")
4. Trackli suggests tasks based on priority scoring

### The Priority Algorithm

Trackli ranks tasks using a scoring system that considers:

| Factor | Weight | Logic |
|--------|--------|-------|
| **Critical + Overdue** | Highest | Urgent work that's already late |
| **Critical + Due Today** | Very High | Urgent work due now |
| **Critical + Due This Week** | High | Urgent work coming up |
| **Overdue** | High | Late but not marked critical |
| **Due Today** | Medium-High | Today's deadlines |
| **Due This Week** | Medium | This week's work |
| **Started (past start date)** | Medium | Work you intended to begin |
| **Has Time Estimate** | Bonus | Helps fit into available time |
| **Energy Level Match** | Considered | Factors in energy requirements |

### Using Suggestions

When you plan your day:
1. Trackli shows ranked suggestions
2. Each suggestion shows: title, project, due date, time estimate
3. Check the tasks you want to commit to
4. Click **"Start My Day"**
5. Only selected tasks appear in your My Day view

### During the Day

Your My Day dashboard shows:
- **Progress bar:** How much you've completed
- **Time remaining:** Based on estimates
- **Task list:** Only your committed tasks
- **Quick actions:** Mark complete, reschedule, add notes

### Meeting Notes Section

My Day includes a dedicated area for capturing meeting notes:
1. Click **"Add Meeting Notes"**
2. Type or paste notes during/after meetings
3. Use **"Extract Tasks"** to create action items
4. Tasks automatically link to today's My Day

## Best Practices for My Day

1. **Plan in the morning:** Take 5 minutes to set your day's priorities
2. **Be realistic:** Don't overcommit; leave buffer time
3. **Include buffer:** Schedule 70-80% of available time
4. **Review at end of day:** Move incomplete tasks or reschedule
5. **Use time estimates:** Helps the algorithm and your planning

---

# Best Practices & Tips

## Task Management Tips

### Writing Good Task Titles
- **Start with a verb:** "Review", "Send", "Create", "Schedule"
- **Be specific:** "Review Q1 budget" not "Budget stuff"
- **Include context:** "Call Sarah re: project timeline"

### Using Due Dates Effectively
- **Set realistic dates:** Don't make everything due tomorrow
- **Use start dates:** For tasks that can't begin until a certain date
- **Buffer before deadlines:** Set due date 1-2 days before actual deadline

### Managing Energy
- **High energy mornings:** Schedule complex tasks early
- **Low energy afternoons:** Save admin and routine tasks
- **Match tasks to state:** Don't force creative work when exhausted

### Staying Organized
- **Weekly review:** Go through all tasks, update statuses, clean up
- **Archive done projects:** Keep active workspace clean
- **Use projects meaningfully:** Group by client, initiative, or theme

## Workflow Recommendations

### Daily Workflow
```
Morning:
1. Open My Day
2. Plan your day (5 min)
3. Work through prioritized tasks

Throughout day:
4. Capture new tasks immediately
5. Update progress as you work
6. Extract tasks from meetings

End of day:
7. Review what's done
8. Move incomplete to tomorrow
9. Quick check of upcoming deadlines
```

### Weekly Workflow
```
Monday:
- Review all projects
- Plan the week's priorities
- Set critical flags for urgent items

Friday:
- Archive completed tasks
- Review what didn't get done
- Adjust estimates for accuracy
```

### Meeting Workflow
```
Before meeting:
- Review related tasks
- Note items to discuss

During meeting:
- Take notes in My Day meeting notes

After meeting:
- Extract action items
- Assign and set due dates
- Move to appropriate projects
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + N` | New task |
| `Cmd/Ctrl + K` | Quick search |
| `Escape` | Close modal |
| `Enter` | Save/confirm |

## Getting the Most from AI Features

### Image Extraction Tips
- Good lighting on photos
- Capture full context (headers, dates)
- Structured notes work best
- Review and adjust extracted tasks

### Text Extraction Tips
- Use clear formatting (bullets, tables)
- Include owner names explicitly
- Write dates in recognizable formats
- Action verbs help identification

### Task Breakdown Tips
- Provide good task descriptions
- Context from project name helps
- Review and customize subtasks
- Works best for substantial tasks

---

# Technical Architecture

This section provides technical context for users who want to understand how Trackli works under the hood.

## Technology Stack

### Frontend
- **React 18** - User interface framework
- **Vite** - Build tool and development server
- **Tailwind CSS** - Styling system
- **React Router** - Navigation

### Backend & Data
- **Supabase** - Backend-as-a-service providing:
  - PostgreSQL database
  - User authentication
  - File storage (attachments, avatars)
  - Row-Level Security for data privacy

### AI Services
- **Anthropic Claude API** - Powers AI features
  - Claude Sonnet 4 for image analysis
  - Claude Sonnet 4 for task breakdown
  - Hosted on Vercel serverless functions

### Deployment
- **Web:** Vercel (automatic deployments)
- **Desktop:** Electron (cross-platform)
  - macOS: Universal binary (Intel + Apple Silicon)
  - Windows: NSIS installer
  - Linux: AppImage and .deb packages

## Data Model

### How Tasks Are Stored

```
tasks
├── id (unique identifier)
├── project_id (links to project)
├── title
├── description
├── status (backlog/todo/in_progress/done)
├── due_date
├── start_date
├── time_estimate (in minutes)
├── energy_level (high/medium/low)
├── category
├── source
├── assignee
├── customer
├── critical (boolean)
├── notes
├── my_day_date (if added to My Day)
├── created_at
└── updated_at
```

### Security Model

Trackli uses **Row-Level Security (RLS)** at the database level:
- You can only see your own projects and tasks
- Team members and customers are scoped to your projects
- All data access is authenticated and authorized
- No data is shared between users unless explicitly designed

### Data Privacy

- All data stored in Supabase (SOC 2 compliant)
- Images sent to AI are processed and not stored
- No training on your data
- HTTPS encryption for all traffic

## Performance Considerations

- **Lazy loading:** Components load on demand
- **Optimized queries:** Database indexes on key fields
- **Efficient rendering:** React optimization patterns
- **Image processing:** Done server-side to reduce client load

---

# Known Limitations

As a beta product, Trackli has some limitations we're aware of:

## Current Limitations

| Limitation | Details | Workaround |
|------------|---------|------------|
| **No real-time sync** | Changes don't auto-sync between devices | Refresh to see updates |
| **No task dependencies** | Can't formally link blocking tasks | Use notes to reference |
| **No recurring tasks UI** | Recurring patterns calculated but no UI | Manually recreate |
| **Mobile web only** | No native iOS/Android app yet | Use mobile browser (PWA) |
| **Single user** | No team/collaboration features | Share projects manually |
| **No offline editing** | Desktop app needs connection to save | View works offline |

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome (latest) | Fully supported |
| Safari (latest) | Supported (minor date picker differences) |
| Firefox (latest) | Fully supported |
| Edge (latest) | Fully supported |
| Mobile Safari | Supported |
| Mobile Chrome | Supported |

## Known Issues

1. **Safari date picker:** Native date picker behavior differs; use manual entry if needed
2. **Large file uploads:** Files over 10MB may fail; compress before uploading
3. **Long meeting notes:** Very long text extraction may timeout; break into chunks

---

# Providing Feedback

Your feedback is essential to making Trackli better. Here's how to share your thoughts:

## Bug Reports

When reporting bugs, please include:
1. **What happened:** Describe the issue
2. **What you expected:** What should have happened
3. **Steps to reproduce:** How to make it happen again
4. **Browser/Platform:** Chrome on Mac, Desktop app on Windows, etc.
5. **Screenshots:** If applicable

## Feature Requests

We want to hear your ideas! When suggesting features:
1. **Describe the problem:** What are you trying to accomplish?
2. **Proposed solution:** How do you envision it working?
3. **Use case:** When would you use this?

## Feedback Channels

- **In-app feedback:** Click the feedback button in the app
- **Email:** [Your feedback email]
- **Beta tester form:** Available in the app under Settings

## What We're Looking For

During beta, we especially want feedback on:
- **Usability:** Is anything confusing or hard to find?
- **Performance:** Is the app fast enough?
- **AI accuracy:** Are extracted tasks accurate?
- **Missing features:** What's blocking your workflow?
- **Bugs:** Anything broken or unexpected?

---

# Quick Reference

## Status Workflow
```
BACKLOG → TO DO → IN PROGRESS → DONE
```

## Task Properties Quick List
- Title, Description, Notes
- Status, Due Date, Start Date
- Time Estimate, Energy Level
- Category, Source
- Assignee, Customer
- Critical flag, Attachments, Subtasks

## Views
- **Board:** Kanban columns
- **Calendar:** Monthly timeline
- **My Day:** Daily planning
- **Table:** Spreadsheet format

## AI Features
- **Extract from Image:** Photo → Tasks
- **Extract from Text:** Notes → Tasks
- **AI Break Down:** Task → Subtasks

---

# Getting Help

- **This guide:** Reference for features and usage
- **In-app tooltips:** Hover for quick tips
- **Feedback form:** Report issues or ask questions

---

**Thank you for being a Trackli beta tester!**

Your feedback shapes the future of the product. We appreciate your time and input.

---

*Document Version: 2.20 | Last Updated: January 2026*
