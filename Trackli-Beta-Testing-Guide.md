# Trackli Beta Testing Guide
## Your Guide to Testing Trackli

---

# Welcome, Beta Tester!

Thank you for helping test Trackli! Your feedback will directly shape the product before launch.

**What we need from you:**
1. Follow the test scenarios in this guide
2. Explore the app on your own
3. Document what works, what doesn't, and what confuses you
4. Submit your feedback using the provided template

**Time commitment:** About 45-60 minutes for structured testing, plus any additional exploration time you'd like to spend.

---

# Before You Start

## Setup Checklist

- [ ] Create your Trackli account at **gettrackli.com**
- [ ] Verify your email (check spam folder if needed)
- [ ] Download the **Feedback Template** document
- [ ] Have this testing guide open alongside Trackli
- [ ] Note which device/browser you're using

## What to Document

As you test, note:
- **What worked well** - Things that felt intuitive or delightful
- **What was confusing** - Anything unclear or hard to find
- **What broke** - Errors, unexpected behavior, things that didn't work
- **Ideas & suggestions** - Features you wish existed or improvements

---

# Part 1: Core Test Scenarios

Complete each scenario and note the outcome in your feedback template.

---

## Scenario 1: First-Time Setup

**Goal:** Create your first project and understand the basics.

**Steps:**
1. Log in to Trackli
2. When prompted, create a new project called "Beta Testing"
3. Add yourself as a team member (your name)
4. Add a sample customer called "Test Client"
5. Look around the main screen

**What to note:**
- Was the setup process clear?
- Did you understand what projects, team members, and customers are for?
- Any confusion about what to do next?

---

## Scenario 2: Creating Tasks

**Goal:** Create tasks using different methods.

### 2a: Quick Task Creation
1. Click the "+ Add Task" button
2. Type "Review beta testing guide" as the title
3. Press Enter or click Create
4. Verify the task appears in the Backlog column

### 2b: Detailed Task Creation
1. Click "+ Add Task" again
2. Fill in:
   - Title: "Send feedback to Aimee"
   - Due date: Pick a date this week
   - Time estimate: 30 minutes
   - Energy level: Low
   - Category: Email
   - Mark as Critical: Yes
3. Click Create Task
4. Verify all details saved correctly by clicking the task to reopen it

**What to note:**
- Was it clear how to create a task?
- Did the detailed options make sense?
- Were any fields confusing?

---

## Scenario 3: Moving Tasks Through Stages

**Goal:** Understand the Kanban workflow.

**Steps:**
1. Find your "Review beta testing guide" task in Backlog
2. Drag it to the "To Do" column
3. Drag it to "In Progress"
4. Drag it to "Done"
5. Notice the confetti celebration!

**What to note:**
- Was drag-and-drop smooth?
- Did the columns make sense?
- Could you easily see where tasks were?

---

## Scenario 4: Using Different Views

**Goal:** Explore all four views and understand when to use each.

### 4a: Board View (Kanban)
1. Click the "Board" tab if not already there
2. Look at the four columns
3. Try filtering by project using the dropdown

### 4b: Calendar View
1. Click the "Calendar" tab
2. Look at the monthly view
3. Find your task with a due date
4. Click on a date to see tasks due that day
5. Navigate to next/previous months

### 4c: Table View
1. Click the "Table" tab
2. Look at the spreadsheet-style layout
3. Try clicking column headers to sort
4. Try editing a task directly in the table

### 4d: My Day View
1. Click the "My Day" tab
2. Look at the daily planning interface
3. Notice the "Plan My Day" button (we'll use this later)

**What to note:**
- Which view felt most natural to you?
- Were the tabs easy to find?
- Any view that was confusing or didn't work as expected?

---

## Scenario 5: My Day Planning

**Goal:** Use the smart daily planning feature.

**Setup:** First, create 5-6 tasks with different properties:
- 2 tasks due today (one marked Critical)
- 2 tasks due this week
- 2 tasks with no due date
- Give each a time estimate (15-60 minutes)

**Steps:**
1. Go to the "My Day" tab
2. Click "Plan My Day"
3. Enter "2 hours" as your available time
4. Look at the suggested tasks
5. Notice the priority order
6. Select 2-3 tasks to commit to
7. Click "Start My Day"
8. See your focused task list

**What to note:**
- Did the suggested order make sense? (Critical/overdue should be first)
- Was "Plan My Day" easy to understand?
- Would you use this feature in real life?

---

## Scenario 6: Subtasks

**Goal:** Break down a complex task.

**Steps:**
1. Create a new task: "Prepare presentation for team meeting"
2. Open the task details
3. Scroll to the Subtasks section
4. Manually add a subtask: "Create slide outline"
5. Add another: "Add data visualizations"
6. Check off one subtask as complete

**What to note:**
- Were subtasks easy to add?
- Did checking them off work correctly?
- Is the subtask area easy to find?

---

# Part 2: AI Feature Testing

These scenarios test Trackli's AI-powered features.

---

## Scenario 7: Extract Tasks from Text

**Goal:** Turn meeting notes into tasks automatically.

**Steps:**
1. Click "+ Add Task"
2. Click the "Extract from Text" tab
3. Paste the following sample meeting notes:

```
Team sync meeting notes - Jan 6

Action items:
- Sarah: Update the project timeline by Friday
- Mike: Review budget proposal and send feedback by tomorrow
- @Lisa: Schedule client call for next week
- John - Fix the login bug (URGENT)

FYI: Project is on track for Q1 launch.
```

4. Click "Extract Tasks"
5. Review the extracted tasks
6. Notice which items were identified as tasks vs. ignored
7. Check if assignees and due dates were captured
8. Create the tasks

**What to note:**
- How many tasks were correctly identified?
- Were assignees captured properly?
- Were due dates parsed correctly? ("Friday", "tomorrow", "next week")
- Was the FYI item correctly ignored?
- Any tasks missed or incorrectly extracted?

---

## Scenario 8: Extract Tasks from Image

**Goal:** Extract tasks from a photo of handwritten notes.

**You'll need:** A photo of handwritten notes OR use a screenshot of typed notes

**If you don't have notes handy:**
1. Write 3-4 action items on paper
2. Take a photo with your phone
3. Transfer to your computer (or do this test on mobile)

**Steps:**
1. Click "+ Add Task"
2. Click "Extract from Image" tab
3. Upload your image
4. Click "Extract Tasks"
5. Review the results
6. Adjust any incorrect fields
7. Create the tasks

**What to note:**
- Could the AI read your handwriting/image?
- How accurate were the extracted tasks?
- Did it capture any dates or assignees mentioned?
- How long did processing take?

---

## Scenario 9: AI Task Breakdown

**Goal:** Let AI break a complex task into subtasks.

**Steps:**
1. Create a task: "Launch new marketing campaign"
2. Add description: "Plan and execute Q2 marketing campaign for product launch"
3. Open the task details
4. In the Subtasks section, click "AI Break Down"
5. Wait for AI to generate subtasks
6. Review the suggested subtasks
7. Keep, modify, or remove as needed

**What to note:**
- Were the generated subtasks relevant and actionable?
- Was the number of subtasks appropriate (should be 3-5)?
- Did they make sense for the task?
- How long did generation take?

---

# Part 3: Cross-Platform Testing

Test Trackli on different devices and browsers.

---

## Scenario 10: Browser Testing

**Goal:** Verify Trackli works across browsers.

If possible, test on at least 2 of these:
- Chrome
- Safari
- Firefox
- Edge

**For each browser, quickly verify:**
1. Login works
2. Tasks display correctly
3. Creating a task works
4. Drag and drop works
5. Calendar displays properly
6. Date pickers work

**What to note:**
- Which browser(s) did you test?
- Any differences between browsers?
- Any features that broke in specific browsers?

---

## Scenario 11: Mobile Testing

**Goal:** Test the mobile experience.

**On your phone (or resize browser to phone width):**

1. Open gettrackli.com on your phone's browser
2. Log in
3. Navigate between views (Board, Calendar, My Day, Table)
4. Create a task
5. Try to drag a task to a different column
6. Open task details
7. Check the calendar view

**What to note:**
- Was the mobile layout usable?
- Could you tap buttons easily? (Were they big enough?)
- Did any features not work on mobile?
- Would you use Trackli on your phone?

---

## Scenario 12: Desktop App (Optional)

**Goal:** Test the desktop application if you downloaded it.

**Steps:**
1. Open the Trackli desktop app
2. Log in with your account
3. Verify your tasks appear
4. Create a task
5. Check if the app responds to your system's dark/light mode

**What to note:**
- Did the desktop app install correctly?
- Does it feel native on your computer?
- Any differences from the web version?
- Did updates work (if prompted)?

---

# Part 4: Free Exploration (15-20 minutes)

Now it's your turn to explore! Use Trackli however you'd like and note anything interesting.

**Suggestions:**
- Try using it for real tasks you need to do
- Explore settings and profile options
- Try edge cases (very long task names, many tasks, etc.)
- Look for anything confusing or broken
- Think about what features are missing

**While exploring, ask yourself:**
- Would I use this app day-to-day?
- What would make me use it more?
- What's frustrating or unclear?
- What's surprisingly good?

---

# Submitting Your Feedback

1. Complete the **Feedback Template** document
2. Save it with your name: `Trackli-Feedback-[YourName].docx`
3. Send to: [Your email/submission method]
4. Deadline: [Your deadline]

---

# Tips for Great Feedback

**Be specific:**
- Instead of "The calendar didn't work"
- Say "When I clicked on January 15 in the calendar, nothing happened. I expected to see tasks due that day."

**Include context:**
- What were you trying to do?
- What did you expect to happen?
- What actually happened?
- What device/browser were you using?

**Screenshots help!**
- If something looks wrong, screenshot it
- If there's an error message, capture it

**Honest feedback is best:**
- We want to hear what doesn't work
- Criticism helps us improve
- Don't worry about hurting feelings!

---

# Thank You!

Your time and feedback are incredibly valuable. Every piece of input helps make Trackli better for everyone.

Questions? Contact [Your contact info]

---

*Beta Testing Guide v1.0 | January 2026*
