# Spark AI Test Plan

## Test Environment
- Date: January 8, 2026 (Wednesday)
- Tomorrow: January 9, 2026 (Thursday)
- Next week: January 15, 2026

---

## 1. TASK CREATION - Basic

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 1.1 | Simple task, specify project | "Create a task to buy groceries in the Feedback project" | Task created in Feedback, title "Buy groceries" | |
| 1.2 | Simple task, no project (should ask) | "Create a task to call mom" | Asks which project | |
| 1.3 | Answer project question | "ChPP" (after being asked) | Task created in ChPP with previous task details | |
| 1.4 | Partial project name | "Create a task to review docs in Gameday" | Task created in "Internal - Gameday" | |
| 1.5 | Task with "I need to" | "I need to send the report" | Task created with assignee = user's name | |

---

## 2. TASK CREATION - Dates

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 2.1 | Today | "Task to call bank today in Feedback" | due_date = 2026-01-08 | |
| 2.2 | Tomorrow | "Task to pay rent tomorrow in Feedback" | due_date = 2026-01-09 | |
| 2.3 | Next week | "Task due next week in Feedback" | due_date = 2026-01-15 | |
| 2.4 | Specific date | "Task for January 20th in Feedback" | due_date = 2026-01-20 | |
| 2.5 | Start and due different | "Start tomorrow, due next week in Feedback" | start_date = 01-09, due_date = 01-15 | |
| 2.6 | Day of week | "Task for Friday in Feedback" | due_date = 2026-01-10 (next Friday) | |
| 2.7 | No date specified | "Task to organize desk in Feedback" | due_date = null | |

---

## 3. TASK CREATION - Times

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 3.1 | Single time AM | "Meeting at 9am tomorrow in Feedback" | start_time = "09:00" | |
| 3.2 | Single time PM | "Call at 2pm tomorrow in Feedback" | start_time = "14:00" | |
| 3.3 | Time with minutes | "Task at 8:30am tomorrow in Feedback" | start_time = "08:30" | |
| 3.4 | Time range AM | "Meeting 9-10am tomorrow in Feedback" | start = "09:00", end = "10:00" | |
| 3.5 | Time range PM | "Call 2pm-4pm tomorrow in Feedback" | start = "14:00", end = "16:00" | |
| 3.6 | Time range mixed | "Task 11am-1pm tomorrow in Feedback" | start = "11:00", end = "13:00" | |
| 3.7 | Time range with minutes | "Meeting 8:30-9:30am tomorrow in Feedback" | start = "08:30", end = "09:30" | |

---

## 4. TASK CREATION - Duration/Effort

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 4.1 | Minutes | "15 minute task in Feedback" | time_estimate = 15, energy = low | |
| 4.2 | Half hour | "30 min task in Feedback" | time_estimate = 30, energy = low | |
| 4.3 | One hour | "1 hour task in Feedback" | time_estimate = 60, energy = medium | |
| 4.4 | Two hours | "2 hour meeting in Feedback" | time_estimate = 120, energy = medium | |
| 4.5 | Three hours | "3 hour workshop in Feedback" | time_estimate = 180, energy = high | |
| 4.6 | Quick/easy words | "Quick task to reply to email in Feedback" | energy = low | |
| 4.7 | Complex words | "Complex task to refactor code in Feedback" | energy = high | |
| 4.8 | No duration hint | "Task to review document in Feedback" | energy = medium (default) | |

---

## 5. TASK CREATION - Status

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 5.1 | Default (todo) | "Create task in Feedback" | status = "todo" | |
| 5.2 | In progress | "Task I'm working on in Feedback" | status = "in_progress" | |
| 5.3 | In progress alt | "Started task in Feedback" | status = "in_progress" | |
| 5.4 | Backlog | "Someday task in Feedback" | status = "backlog" | |
| 5.5 | Backlog alt | "Low priority task for later in Feedback" | status = "backlog" | |
| 5.6 | Done | "Completed task in Feedback" | status = "done" | |

---

## 6. TASK CREATION - Priority/Critical

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 6.1 | Urgent | "Urgent task in Feedback" | critical = true | |
| 6.2 | ASAP | "ASAP need to call client in Feedback" | critical = true | |
| 6.3 | Critical | "Critical bug fix in Feedback" | critical = true | |
| 6.4 | High priority | "High priority review in Feedback" | critical = true | |
| 6.5 | Normal (default) | "Task to send email in Feedback" | critical = false | |

---

## 7. TASK CREATION - Complex/Combined

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 7.1 | Full details | "I need to call the doctor tomorrow 8:30-9:30am, urgent, in ChPP" | assignee=user, date=tomorrow, times set, critical=true, project=ChPP | |
| 7.2 | Multiple attributes | "Quick 15 min task to reply to Sarah tomorrow in Feedback" | time=15, energy=low, date=tomorrow | |
| 7.3 | Start vs due | "Task starting tomorrow due Friday in Feedback" | start=01-09, due=01-10 | |
| 7.4 | Customer mention | "Task for Acme Corp client in Feedback" | customer = "Acme Corp" | |

---

## 8. GENERAL MESSAGING (Non-task)

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 8.1 | Greeting | "Hi" or "Hello" | Friendly greeting, no task created | |
| 8.2 | Question about tasks | "What tasks do I have?" | Summary of tasks | |
| 8.3 | Question about overdue | "What's overdue?" | List of overdue tasks | |
| 8.4 | Question about project | "How many tasks in Feedback?" | Count of tasks | |
| 8.5 | General question | "What can you help me with?" | Capabilities explanation | |
| 8.6 | Thank you | "Thanks!" | Acknowledgment, no task | |
| 8.7 | Ambiguous input | "meeting" | Should ask for clarification | |

---

## 9. OTHER ACTIONS - Task Completion

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 9.1 | Complete by name | "Mark 'Buy groceries' as done" | Task status → done | |
| 9.2 | Complete recent | "Complete my last task" | Most recent task → done | |
| 9.3 | Complete with confirmation | "Done with the report task" | Task completed | |

---

## 10. OTHER ACTIONS - Task Updates

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 10.1 | Change due date | "Move 'Call mom' to Friday" | due_date updated | |
| 10.2 | Change status | "Start working on 'Review doc'" | status → in_progress | |
| 10.3 | Change project | "Move 'Bug fix' to ChPP project" | project_id updated | |
| 10.4 | Add time | "Add 2pm time to 'Meeting' task" | start_time updated | |

---

## 11. ERROR HANDLING

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 11.1 | Empty message | "" or spaces only | Graceful error or prompt | |
| 11.2 | Non-existent project | "Task in XYZ project" | Ask for valid project or clarify | |
| 11.3 | Ambiguous task reference | "Complete that task" | Ask which task | |
| 11.4 | Invalid date | "Task for February 30th" | Handle gracefully | |

---

## 12. CONVERSATION CONTINUITY

| # | Test Case | Input | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| 12.1 | Follow-up project | "Feedback" (after asking) | Uses previous task details | |
| 12.2 | Follow-up clarification | "Tomorrow" (after asking when) | Uses previous task details | |
| 12.3 | Change mind | "Actually put it in ChPP" | Updates project choice | |
| 12.4 | Multi-turn task | Ask → answer → answer → create | Remembers all details | |

---

## Test Results Summary

| Category | Total | Pass | Fail |
|----------|-------|------|------|
| Basic Creation | 5 | | |
| Dates | 7 | | |
| Times | 7 | | |
| Duration/Effort | 8 | | |
| Status | 6 | | |
| Priority | 5 | | |
| Complex | 4 | | |
| General Messaging | 7 | | |
| Completion | 3 | | |
| Updates | 4 | | |
| Error Handling | 4 | | |
| Conversation | 4 | | |
| **TOTAL** | **64** | | |

---

## Notes
- Clear conversation (trash icon) between unrelated tests
- Check both UI display AND database values
- Console logs show actual data being sent
