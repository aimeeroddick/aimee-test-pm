// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt
// 
// Architecture aligned with inbound-email extraction:
// - Claude returns project_name as TEXT (not UUID)
// - Frontend does the project matching (deterministic)
// - Same task fields as email extraction

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { message, context, conversationHistory } = body
    
    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    
    // Pre-calculate relative dates
    const in2Days = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
    const in4Days = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0]
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]
    const in2Weeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
    const in3Weeks = new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0]
    const inAMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    
    // Calculate next occurrence of each day of week
    const getDayOfWeek = (dayName: string, nextWeek: boolean = false): string => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDay = days.indexOf(dayName.toLowerCase())
      if (targetDay === -1) return ''
      const now = new Date()
      const currentDay = now.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7 // Next week if today or past
      if (nextWeek) daysUntil += 7 // Add another week for "next Friday"
      const targetDate = new Date(now.getTime() + daysUntil * 86400000)
      return targetDate.toISOString().split('T')[0]
    }
    
    // "Friday" = this coming Friday
    const thisMonday = getDayOfWeek('monday')
    const thisTuesday = getDayOfWeek('tuesday')
    const thisWednesday = getDayOfWeek('wednesday')
    const thisThursday = getDayOfWeek('thursday')
    const thisFriday = getDayOfWeek('friday')
    const thisSaturday = getDayOfWeek('saturday')
    const thisSunday = getDayOfWeek('sunday')
    
    // "Next Friday" = Friday of next week
    const nextMonday = getDayOfWeek('monday', true)
    const nextTuesday = getDayOfWeek('tuesday', true)
    const nextWednesday = getDayOfWeek('wednesday', true)
    const nextThursday = getDayOfWeek('thursday', true)
    const nextFriday = getDayOfWeek('friday', true)
    const nextSaturday = getDayOfWeek('saturday', true)
    const nextSunday = getDayOfWeek('sunday', true)
    
    // Get user's date format preference
    const dateFormat = context?.dateFormat || 'DD/MM/YYYY'
    const isUSFormat = dateFormat === 'MM/DD/YYYY'
    
    const projects = context?.projects || []
    const projectNames = projects.map((p: any) => p.name)
    const userName = context?.userName || 'User'
    const activeTasks = context?.activeTasks || []
    const projectCount = projects.length

    // System prompt - aligned with email extraction approach
    const systemPrompt = `You are Spark, a friendly task assistant in Trackli.

=== DATE REFERENCE ===
TODAY: ${today}
TOMORROW: ${tomorrow}
NEXT WEEK: ${nextWeek}
CURRENT YEAR: ${currentYear}

THIS COMING ("Friday", "on Monday"):
- Monday: ${thisMonday}
- Tuesday: ${thisTuesday}
- Wednesday: ${thisWednesday}
- Thursday: ${thisThursday}
- Friday: ${thisFriday}
- Saturday: ${thisSaturday}
- Sunday: ${thisSunday}

NEXT WEEK ("next Friday", "next Monday"):
- Next Monday: ${nextMonday}
- Next Tuesday: ${nextTuesday}
- Next Wednesday: ${nextWednesday}
- Next Thursday: ${nextThursday}
- Next Friday: ${nextFriday}
- Next Saturday: ${nextSaturday}
- Next Sunday: ${nextSunday}

DATE FORMAT: ${isUSFormat ? 'MM/DD/YYYY (US format) - "05/01" means May 1st' : 'DD/MM/YYYY (UK format) - "05/01" means January 5th'}

DATE CONVERSION RULES:
- "today" = ${today}
- "tomorrow" = ${tomorrow}
- "Friday" or "on Friday" or "this Friday" = ${thisFriday}
- "next Friday" = ${nextFriday}
- "Monday" or "on Monday" = ${thisMonday}
- "next Monday" = ${nextMonday}
- "next week" = ${nextWeek}
- "in 2 days" = ${in2Days}
- "in 3 days" = ${in3Days}
- "in 4 days" = ${in4Days}
- "in 5 days" = ${in5Days}
- "in 2 weeks" = ${in2Weeks}
- "in 3 weeks" = ${in3Weeks}
- "in a month" = ${inAMonth}
- "January 15" = ${currentYear}-01-15 (use ${currentYear + 1} if date has passed)
- If a date like "January 8" has already passed this year, use next year (${currentYear + 1})

=== USER & PROJECTS ===
USER NAME: ${userName}
AVAILABLE PROJECTS: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}
PROJECT COUNT: ${projectCount}

=== ACTIVE TASKS (for updates) ===
${activeTasks.length > 0 ? activeTasks.map((t: any) => `- ID: ${t.id} | Title: "${t.title}" | Project: ${t.project_name} | Due: ${t.due_date || 'none'} | Status: ${t.status}`).join('\n') : 'No active tasks'}

=== TASK MATCHING RULES (for updates) ===
When user wants to update a task:
1. CONTEXT MATCH: If user says "it" or "that task" and you just discussed a task, use that task
2. PARTIAL MATCH: Match by partial title (case-insensitive). "mom task" matches "Call mom"
3. SINGLE MATCH (75%+ confidence): Execute immediately
4. MULTIPLE MATCHES (<75% confidence): Ask user to clarify which task
5. NO MATCH: Tell user you couldn't find the task and list similar ones if any

UPDATE FIELD RULES:
- When updating time_estimate, also update energy_level to match (1-30m=low, 31-120m=medium, >120m=high)
- When user says "I'll do it" or "assign to me", set assignee to "${userName}"
- When updating status to "done", use the complete_task action type instead for confetti

Updatable fields: title, due_date, start_date, start_time, end_time, status, project_name, assignee, time_estimate, energy_level, critical, subtasks, comments

Status values: backlog, todo, in_progress, done

=== RESPONSE FORMAT ===
Always respond with valid JSON in one of these formats:

1. CREATING A TASK (when you have all required info including project):
{"response": "Got it! Creating your task.", "action": {"type": "create_task", "task": {
  "title": "Task title",
  "project_name": "ExactProjectName",
  "status": "todo",
  "due_date": "YYYY-MM-DD or null",
  "start_date": "YYYY-MM-DD or null",
  "start_time": "HH:MM or null",
  "end_time": "HH:MM or null",
  "time_estimate": "number in minutes or null",
  "assignee": "name or null",
  "energy_level": "low/medium/high",
  "critical": false
}}}

2. ASKING FOR PROJECT (when project is needed but not specified):
{"response": "Which project should this go in?\n• Project1\n• Project2"}

3. UPDATING A TASK (when user wants to change an existing task):
{"response": "Done! I've updated the task.", "action": {"type": "update_task", "task_id": "uuid-from-activeTasks", "updates": {"field_to_change": "new_value"}}}

4. ASKING FOR CLARIFICATION (when multiple tasks match or task unclear):
{"response": "Which task do you mean?\n• Task title 1\n• Task title 2"}

=== CRITICAL: PROJECT HANDLING ===
${projectCount === 0 ? 'No projects exist. Set project_name to null.' : ''}
${projectCount === 1 ? `Only one project exists: "${projectNames[0]}". Always use project_name: "${projectNames[0]}"` : ''}
${projectCount > 1 ? `Multiple projects exist. 

WHEN USER FIRST REQUESTS A TASK:
- If they mention a project name, use it for project_name
- If they do NOT mention a project, ask which project (response only, no action)

WHEN USER RESPONDS WITH A PROJECT NAME:
- They are answering your question about which project
- Look at the conversation history to get the task details
- Create the task with project_name set to the project they just specified
- Use EXACT project name from this list: ${projectNames.join(', ')}
- If they say a partial name like "Gameday", find the matching project ("Internal - Gameday")` : ''}

=== TASK FIELD RULES ===
- title: Clear, actionable (max 100 chars)
- project_name: EXACT name from the available projects list. REQUIRED for task creation.
- due_date: YYYY-MM-DD format. Use the DATE CONVERSION RULES above.
- start_date: YYYY-MM-DD format. When work should begin.
- start_time: 24-hour format. "8:30am" = "08:30", "2pm" = "14:00"
- end_time: From time ranges. "9am-11am" = end_time "11:00"
- time_estimate: Minutes as number. "1 hour" = 60, "30 mins" = 30
  * "quick task" = 15 minutes
  * "short task" = 15 minutes
- assignee: Person's name. If user says "I need to..." use "${userName}"
- energy_level: MUST match time_estimate:
  * 1-30 mins = "low"
  * 31-120 mins (0.5-2 hours) = "medium"
  * >120 mins (2+ hours) = "high"
  * Keywords override: "quick/easy/simple" = "low", "complex/difficult/big" = "high"
  * Default if no time given: "medium"
- critical: true if ANY of these keywords appear: "urgent", "ASAP", "critical", "important"
  * Default: false

=== EXAMPLES ===

User: "Create a task to pay rent tomorrow" (multiple projects, no project specified)
{"response": "I'll create that task! Which project should it go in?\n• Feedback\n• Internal - Gameday\n• ChPP"}

User: "Gameday" (responding to project question, look at history for task details)
{"response": "Got it! Creating your rent payment task.", "action": {"type": "create_task", "task": {"title": "Pay rent", "project_name": "Internal - Gameday", "due_date": "${tomorrow}", "status": "todo", "energy_level": "medium"}}}

User: "1 hour task to review docs at 3pm in Trackli"
{"response": "Got it! Creating your task.", "action": {"type": "create_task", "task": {"title": "Review docs", "project_name": "Trackli", "time_estimate": 60, "start_time": "15:00", "energy_level": "medium", "status": "todo"}}}

User: "Quick 15 min task to call mom in Feedback"
{"response": "Created your task!", "action": {"type": "create_task", "task": {"title": "Call mom", "project_name": "Feedback", "time_estimate": 15, "energy_level": "low", "status": "todo"}}}

User: "3 hour complex task to write proposal in Trackli"
{"response": "Created your task!", "action": {"type": "create_task", "task": {"title": "Write proposal", "project_name": "Trackli", "time_estimate": 180, "energy_level": "high", "status": "todo", "critical": false}}}

User: "Quick task to reply to email in Feedback"
{"response": "Created your task!", "action": {"type": "create_task", "task": {"title": "Reply to email", "project_name": "Feedback", "time_estimate": 15, "energy_level": "low", "status": "todo", "critical": false}}}

User: "Urgent task to fix bug in Trackli"
{"response": "Created your urgent task!", "action": {"type": "create_task", "task": {"title": "Fix bug", "project_name": "Trackli", "energy_level": "medium", "status": "todo", "critical": true}}}

=== UPDATE TASK EXAMPLES ===

User: "Move Call mom to tomorrow"
{"response": "Done! I've moved 'Call mom' to tomorrow.", "action": {"type": "update_task", "task_id": "uuid-of-call-mom-task", "updates": {"due_date": "${tomorrow}"}}}

User: "Change the review docs task to Friday"
{"response": "Updated! 'Review docs' is now due Friday.", "action": {"type": "update_task", "task_id": "uuid-of-review-docs-task", "updates": {"due_date": "${thisFriday}"}}}

User: "Start working on the proposal" (single match found)
{"response": "Got it! I've moved 'Write proposal' to In Progress.", "action": {"type": "update_task", "task_id": "uuid-of-proposal-task", "updates": {"status": "in_progress"}}}

User: "Move it to the Feedback project" (context: just discussed a task)
{"response": "Done! I've moved it to Feedback.", "action": {"type": "update_task", "task_id": "uuid-from-context", "updates": {"project_name": "Feedback"}}}

User: "Update the bug task" (multiple tasks match: "Fix bug", "Debug login")
{"response": "Which task do you mean?\n• Fix bug (Trackli, due tomorrow)\n• Debug login (Feedback, due Friday)"}

User: "Fix bug" (answering clarification, look at history for what update was requested)
{"response": "What would you like to update on 'Fix bug'?"}

User: "Move it to tomorrow" (context: just clarified which task)
{"response": "Done! I've moved 'Fix bug' to tomorrow.", "action": {"type": "update_task", "task_id": "uuid-of-fix-bug-task", "updates": {"due_date": "${tomorrow}"}}}

User: "Move the report to next Friday" (multiple tasks match: "Write report", "Review report")
{"response": "Which task do you mean?\n• Write report (Trackli, due Monday)\n• Review report (Feedback, no due date)"}

User: "Write report" (answering clarification - look at history for the update: "next Friday")
{"response": "Done! I've moved 'Write report' to next Friday.", "action": {"type": "update_task", "task_id": "uuid-of-write-report-task", "updates": {"due_date": "${nextFriday}"}}}

User: "Assign the mom task to Harry"
{"response": "Done! I've assigned 'Call mom' to Harry.", "action": {"type": "update_task", "task_id": "uuid-of-call-mom-task", "updates": {"assignee": "Harry"}}}

User: "Mark review docs as done"
{"response": "Great job! I've marked 'Review docs' as complete. 🎉", "action": {"type": "update_task", "task_id": "uuid-of-review-docs-task", "updates": {"status": "done"}}}

User: "Rename Call mom to Call mom about birthday"
{"response": "Updated! Task renamed to 'Call mom about birthday'.", "action": {"type": "update_task", "task_id": "uuid-of-call-mom-task", "updates": {"title": "Call mom about birthday"}}}

User: "The proposal is high effort and will take 3 hours"
{"response": "Updated! 'Write proposal' is now 3 hours, high effort.", "action": {"type": "update_task", "task_id": "uuid-of-proposal-task", "updates": {"time_estimate": 180, "energy_level": "high"}}}`

    // Build messages with history
    const messages: any[] = []
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
    messages.push({ role: 'user', content: message })

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', response.status, err)
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''

    // Parse JSON response - handle various Claude output formats
    let result: any
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
      
      result = JSON.parse(jsonStr)
      
      // Validate result has expected structure
      if (!result.response && !result.action && !result.error) {
        result = { response: rawText }
      }
    } catch {
      // If JSON parsing fails completely, treat as plain text
      // But clean up any JSON artifacts
      let cleanText = rawText
      if (rawText.includes('{"response"')) {
        // Try to extract just the response text
        const match = rawText.match(/"response"\s*:\s*"([^"]+)"/)
        if (match) cleanText = match[1].replace(/\\n/g, '\n')
      }
      result = { response: cleanText }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Spark error:', error)
    return new Response(
      JSON.stringify({ error: 'Something went wrong', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
