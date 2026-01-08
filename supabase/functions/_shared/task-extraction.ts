// Shared Task Extraction Module
// Used by: spark-chat, inbound-email, extract-tasks
//
// This module defines the canonical task schema and extraction rules
// so all AI-powered task creation uses identical logic.

// ============================================
// CANONICAL TASK FIELDS
// ============================================

export const TASK_FIELD_DEFINITIONS = `
TASK FIELDS TO EXTRACT:
- title: Clear, actionable task title (max 100 chars, required)
- description: Brief context if needed (max 200 chars, or null)
- project_name: Project name as TEXT - must match exactly from available list (or null)
- status: "todo" (default), "in_progress", "done", or "backlog"
- due_date: YYYY-MM-DD format (null if not mentioned)
- start_date: YYYY-MM-DD format - when work should begin (null if not mentioned)
- start_time: HH:MM 24-hour format, e.g., "08:30", "14:00" (null if not mentioned)
- end_time: HH:MM 24-hour format from time ranges (null if not mentioned)
- time_estimate: Duration in MINUTES as integer, e.g., 60 for 1 hour (null if not mentioned)
- assignee: Person's name as TEXT (null if not mentioned)
- energy_level: "low" (≤30min or quick/easy), "medium" (31-120min, default), "high" (>120min or complex)
- critical: true only if explicitly urgent/ASAP/critical (default false)
- customer: Client/company name if mentioned (null if not mentioned)
`

// ============================================
// DATE/TIME PARSING RULES
// ============================================

export function getDateTimeRules(today: string, currentYear: number): string {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  
  return `
DATE INTERPRETATION:
- "today" = "${today}"
- "tomorrow" = "${tomorrow}"
- "next week" = "${nextWeek}"
- "Monday", "Friday", etc. = calculate next occurrence
- "January 15" = "${currentYear}-01-15" (use next year if date has passed)

TIME INTERPRETATION:
- "8:30am" → "08:30"
- "2pm" → "14:00"  
- "8:30-9:30am" → start_time "08:30", end_time "09:30"
- "2pm-4pm" → start_time "14:00", end_time "16:00"

DURATION INTERPRETATION:
- "30 minutes", "30 mins" → time_estimate: 30
- "1 hour", "an hour" → time_estimate: 60
- "2 hours" → time_estimate: 120
- "half hour" → time_estimate: 30
`
}

// ============================================
// ENERGY LEVEL RULES
// ============================================

export const ENERGY_LEVEL_RULES = `
ENERGY LEVEL DETERMINATION:
1. If time_estimate is set:
   - ≤30 minutes → "low"
   - 31-120 minutes → "medium"
   - >120 minutes → "high"

2. If explicit words used (override time):
   - "quick", "easy", "simple", "small" → "low"
   - "complex", "difficult", "big", "major" → "high"

3. Default if no hint → "medium"
`

// ============================================
// STATUS DETECTION RULES
// ============================================

export const STATUS_DETECTION_RULES = `
STATUS DETECTION from user's words:
- "in progress", "working on", "started", "already doing" → "in_progress"
- "done", "finished", "completed", "already done" → "done"
- "backlog", "someday", "later", "eventually", "low priority" → "backlog"
- Default → "todo"
`

// ============================================
// PROJECT MATCHING
// ============================================

export function matchProjectNameToId(
  projectName: string | null | undefined,
  projects: Array<{ id: string; name: string }>
): string | null {
  if (!projectName || projects.length === 0) return null

  const searchName = projectName.toLowerCase().trim()

  // Try exact match first
  const exactMatch = projects.find(p => p.name.toLowerCase() === searchName)
  if (exactMatch) return exactMatch.id

  // Try partial match (project name contains search or vice versa)
  const partialMatch = projects.find(p =>
    p.name.toLowerCase().includes(searchName) ||
    searchName.includes(p.name.toLowerCase())
  )
  if (partialMatch) return partialMatch.id

  return null
}

// ============================================
// ASSIGNEE DETECTION RULES
// ============================================

export function getAssigneeRules(userName: string): string {
  return `
ASSIGNEE DETECTION:
- "I need to...", "I have to...", "I should..." → assignee: "${userName}"
- "remind me to..." → assignee: "${userName}"
- "[Name] will...", "[Name] to..." → assignee: that name
- No mention of person → assignee: null
`
}

// ============================================
// JSON RESPONSE PARSING
// ============================================

export function parseClaudeJsonResponse(rawText: string): any {
  try {
    let jsonStr = rawText.trim()

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    // Try to extract JSON if there's text before/after it
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const result = JSON.parse(jsonStr)

    // Validate result has expected structure
    if (Array.isArray(result)) {
      return result // For extract-tasks which returns array
    }
    if (result.response || result.action || result.error || result.tasks) {
      return result
    }

    return { response: rawText }
  } catch {
    // If JSON parsing fails, try to extract response text
    let cleanText = rawText
    if (rawText.includes('{"response"')) {
      const match = rawText.match(/"response"\s*:\s*"([^"]+)"/)
      if (match) cleanText = match[1].replace(/\\n/g, '\n')
    }
    return { response: cleanText }
  }
}

// ============================================
// BUILD STANDARD TASK INSERT OBJECT
// ============================================

export interface ExtractedTask {
  title: string
  description?: string | null
  project_name?: string | null
  status?: string
  due_date?: string | null
  start_date?: string | null
  start_time?: string | null
  end_time?: string | null
  time_estimate?: number | null
  assignee?: string | null
  energy_level?: string
  critical?: boolean
  customer?: string | null
}

export function buildTaskInsertData(
  task: ExtractedTask,
  projectId: string | null,
  source: string
): Record<string, any> {
  return {
    title: task.title?.trim() || 'New task',
    description: task.description || null,
    project_id: projectId,
    status: task.status || 'todo',
    due_date: task.due_date || null,
    start_date: task.start_date || task.due_date || null,
    start_time: task.start_time || null,
    end_time: task.end_time || null,
    time_estimate: task.time_estimate || null,
    assignee: task.assignee || null,
    critical: task.critical || false,
    energy_level: task.energy_level || 'medium',
    customer: task.customer || null,
    category: 'deliverable',
    source: source
  }
}
