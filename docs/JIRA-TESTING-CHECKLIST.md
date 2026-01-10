# Jira Integration Testing Checklist

Last updated: January 10, 2026

This checklist covers comprehensive testing of the Jira ↔ Trackli integration.

---

## Prerequisites

Before testing:
1. Have a Jira Cloud account with at least one project
2. Have issues assigned to you in that project
3. Have Trackli running on test-develop branch
4. Open browser DevTools Console to monitor realtime events

---

## 1. Connection Tests

### 1.1 Initial Connection
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Connect Atlassian | Settings → Connect Atlassian | OAuth flow opens, returns to Trackli |  |
| Projects loaded | After connection | List of Jira projects appears |  |
| Webhook registered | Check Settings | "Real-Time Sync: Active" (green badge) |  |
| Audit logged | Check `integration_audit_log` | `oauth.connected` and `webhook.registered` events |  |

### 1.2 Disconnect
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Disconnect | Settings → Disconnect | Connection removed |  |
| Webhook cleaned | N/A | Webhook removed from Jira |  |
| Tokens removed | Check Vault | No orphaned secrets |  |
| Can reconnect | Connect again | Works normally |  |

### 1.3 Token Refresh
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Token refresh | Wait 1+ hour, then Sync Now | Sync works (token auto-refreshed) |  |
| Refresh logged | Check audit log | `oauth.token_refreshed` event |  |

---

## 2. Jira → Trackli Sync (Manual)

### 2.1 Sync Now Button
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| First sync | Click "Sync Now" | Issues appear in Trackli |  |
| Count correct | Compare to Jira | Same number of assigned issues |  |
| Duplicate prevention | Click "Sync Now" again | "0 created, 0 updated" (no duplicates) |  |

### 2.2 Field Mapping
| Jira Field | Test Value | Expected in Trackli | ✓ |
|------------|------------|---------------------|---|
| Summary | "Test Task Title" | title = "Test Task Title" |  |
| Description | "Some description" | description shows text |  |
| Due Date | Set to Jan 20 | due_date = Jan 20 |  |
| Due Date | None | due_date = null |  |
| Priority | "Highest" | critical = true (red flag) |  |
| Priority | "High" | critical = false |  |
| Priority | "Medium" | critical = false |  |
| Issue Type | "Task" | jira_issue_type = "Task" |  |
| Issue Type | "Bug" | jira_issue_type = "Bug" |  |
| Issue Type | "Story" | jira_issue_type = "Story" |  |

### 2.3 Status Mapping (Jira → Trackli)
| Jira Status | Expected Trackli Column | ✓ |
|-------------|-------------------------|---|
| "Backlog" | Backlog |  |
| "To Do" | To Do |  |
| "Open" | To Do |  |
| "Ready" | To Do |  |
| "In Progress" | In Progress |  |
| "In Review" | In Progress |  |
| "Testing" | In Progress |  |
| "In Development" | In Progress |  |
| "Done" | Done |  |
| "Closed" | Done |  |
| "Resolved" | Done |  |
| "Complete" | Done |  |
| Custom status (new category) | To Do |  |
| Custom status (indeterminate) | In Progress |  |
| Custom status (done category) | Done |  |

---

## 3. Trackli → Jira Sync (Two-Way)

### 3.1 Status Changes
| Test | Steps | Expected in Jira | ✓ |
|------|-------|------------------|---|
| To Do → In Progress | Drag task to In Progress | Status changes to "In Progress" (or equivalent) |  |
| In Progress → Done | Drag task to Done | Status changes to "Done" (or equivalent) |  |
| Done → To Do | Drag task back to To Do | Status changes to "To Do" (or equivalent) |  |
| Backlog → To Do | Drag from Backlog | Status changes appropriately |  |

### 3.2 Console Verification
| Test | What to check | ✓ |
|------|---------------|---|
| Sync initiated | Console shows "Syncing status to Jira..." |  |
| Sync success | Console shows "Synced [status] to Jira for [key]" |  |
| No errors | No red errors in console |  |

### 3.3 Edge Cases
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| No available transition | Move to status with no valid transition | Error logged, task still moves in Trackli |  |
| Bulk move | Select multiple Jira tasks, bulk move | All update in Jira |  |
| Mixed selection | Bulk move with Jira + non-Jira tasks | Only Jira tasks sync |  |

---

## 4. Real-Time Webhooks (Jira → Trackli)

### 4.1 Setup Verification
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Badge shows Active | Check Settings | "Real-Time Sync: Active" (green) |  |
| Realtime subscribed | Check browser console | "Realtime tasks subscription: SUBSCRIBED" |  |

### 4.2 Issue Updates (Instant)
| Test | Change in Jira | Expected in Trackli | ✓ |
|------|----------------|---------------------|---|
| Title change | Edit summary | Title updates instantly (no refresh) |  |
| Status change | Move to In Progress | Task moves to In Progress column |  |
| Status to Done | Move to Done | Task moves to Done column |  |
| Due date add | Set due date | Due date appears |  |
| Due date remove | Clear due date | Due date disappears |  |
| Priority to Highest | Set to Highest | Critical flag appears |  |
| Priority from Highest | Set to Medium | Critical flag disappears |  |

### 4.3 Issue Creation
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| New issue assigned | Create issue in Jira, assign to self | Appears in Trackli instantly |  |
| Correct column | Create with status "To Do" | Appears in To Do column |  |
| Correct project | N/A | Appears in "Jira" project |  |

### 4.4 Issue Deletion
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Delete in Jira | Delete the issue | Task marked as deleted in Trackli |  |

### 4.5 Reassignment
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Unassign from me | Change assignee to someone else | Task marked as unassigned |  |
| Reassign to me | Assign back to me | Task becomes active again (via scheduled sync) |  |

### 4.6 Console Verification
| Test | What to check | ✓ |
|------|---------------|---|
| Webhook received | Console shows "Realtime: Task updated [id]" |  |
| No page refresh | UI updates without manual refresh |  |

---

## 5. Project Sync Settings

### 5.1 Enable/Disable Projects
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Disable project | Toggle off a project | Issues from that project stop syncing |  |
| Enable project | Toggle on a project | Issues from that project start syncing |  |
| Webhook still works | With project disabled | Webhook ignores events from disabled project |  |

### 5.2 Multiple Projects
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Sync multiple | Enable 2+ projects, Sync Now | Issues from all enabled projects appear |  |
| Mixed enable | Enable some, disable others | Only enabled project issues sync |  |

---

## 6. Scheduled Sync (Fallback)

### 6.1 Cron Job
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Cron running | Check `cron.job` table | Job exists and scheduled |  |
| Sync occurs | Wait 15 min after change | Change syncs even if webhook missed |  |
| Audit logged | Check audit log | `jira.scheduled_sync_completed` events |  |

---

## 7. Error Handling

### 7.1 Network Errors
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Jira down | (hard to test) | Graceful error, retry later |  |
| Timeout | (hard to test) | Error logged, doesn't crash |  |

### 7.2 Invalid Data
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Issue without assignee | Create unassigned issue | Webhook ignores (logged as "no_assignee") |  |
| Disabled project | Update issue in disabled project | Webhook ignores (logged as "project_not_enabled") |  |
| Unknown user | Webhook for non-connected user | Webhook ignores (logged as "user_not_found") |  |

---

## 8. UI/UX Tests

### 8.1 Jira Badge
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Badge visible | View Jira task card | Blue Jira icon with issue key |  |
| Badge clickable | Click the badge | Opens Jira issue in new tab |  |
| Correct URL | Check opened URL | Points to correct Jira site/issue |  |

### 8.2 Settings UI
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Connection status | Open Settings | Shows "Connected to [site]" |  |
| Project list | Expand projects | All Jira projects listed with toggles |  |
| Sync Now button | N/A | Button visible and functional |  |
| Test button | Click Test | Shows issue count from Jira |  |
| Real-time badge | N/A | Shows Active (green) or 15-min (yellow) |  |

---

## 9. Data Integrity

### 9.1 No Duplicates
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| Sync twice | Click Sync Now twice | Same task count, no duplicates |  |
| Webhook + Sync | Webhook then Sync Now | No duplicate tasks created |  |
| Cron + Webhook | Both fire for same change | No duplicate tasks |  |

### 9.2 Correct Ownership
| Test | Steps | Expected Result | ✓ |
|------|-------|-----------------|---|
| user_id set | Check tasks table | All Jira tasks have user_id |  |
| Realtime works | Make Jira change | Realtime subscription fires |  |

---

## 10. Performance

### 10.1 Sync Speed
| Test | Measure | Target | ✓ |
|------|---------|--------|---|
| Webhook latency | Time from Jira change to UI update | < 3 seconds |  |
| Sync Now (10 issues) | Time to complete | < 10 seconds |  |
| Sync Now (50 issues) | Time to complete | < 30 seconds |  |

---

## Test Results Summary

| Category | Tests Passed | Tests Failed | Notes |
|----------|-------------|--------------|-------|
| Connection | /4 | | |
| Manual Sync | /15 | | |
| Two-Way Sync | /7 | | |
| Real-Time | /12 | | |
| Project Settings | /4 | | |
| Scheduled Sync | /3 | | |
| Error Handling | /3 | | |
| UI/UX | /7 | | |
| Data Integrity | /4 | | |
| Performance | /3 | | |
| **TOTAL** | **/62** | | |

---

## Known Issues / Notes

*(Record any issues discovered during testing)*

1. 
2. 
3. 

---

## Tester Information

- **Tested by:** 
- **Date:** 
- **Environment:** test-develop branch
- **Browser:** 
- **Jira Site:** 
