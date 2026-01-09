// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt
// 
// Architecture aligned with inbound-email extraction:
// - Claude returns project_name as TEXT (not UUID)
// - Frontend does the project matching (deterministic)
// - Same task fields as email extraction

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { parseClaudeJsonResponse } from "../_shared/task-extraction.ts"

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
    const { message, context, conversationHistory, lastQueryResults } = body
    
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

    // Essential date references only - Claude can calculate day-of-week dates
    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    // Get user's date format preference
    const dateFormat = context?.dateFormat || 'DD/MM/YYYY'
    const isUSFormat = dateFormat === 'MM/DD/YYYY'
    
    const projects = context?.projects || []
    const projectNames = projects.map((p: any) => p.name)
    const userName = context?.userName || 'User'
    const activeTasks = context?.activeTasks || []
    const projectCount = projects.length

    // System prompt - simplified and focused
    const systemPrompt = `You are Spark, a friendly task assistant in Trackli.

=== DATE REFERENCE ===
TODAY: ${today} | TOMORROW: ${tomorrow} | YESTERDAY: ${yesterday} | NEXT WEEK: ${nextWeek}
CURRENT YEAR: ${currentYear}
USER'S DATE FORMAT: ${dateFormat} (${isUSFormat ? 'US: 1/9 = January 9th' : 'UK: 9/1 = January 9th'})

For day-of-week dates ("Friday", "next Monday"), calculate from today's date.
- "Friday" = next occurrence of Friday from today
- "next Friday" = the Friday after that (add 7 days)
- If a named date has passed this year, use next year

=== USER & PROJECTS ===
USER NAME: ${userName}
AVAILABLE PROJECTS: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}
PROJECT COUNT: ${projectCount}

=== ACTIVE TASKS (for updates and queries) ===
${activeTasks.length > 0 ? activeTasks.map((t: any) => `- ID: ${t.id} | Title: "${t.title}" | Project: ${t.project_name} | Due: ${t.due_date || 'none'} | Start: ${t.start_date || 'none'} | Status: ${t.status} | Effort: ${t.energy_level || 'none'} | Time: ${t.time_estimate || 'none'} | Critical: ${t.critical ? 'yes' : 'no'} | My Day: ${t.my_day_date || 'no'} | Owner: ${t.assignee || 'none'}`).join('\n') : 'No active tasks'}

${lastQueryResults && lastQueryResults.length > 0 ? `=== PREVIOUS QUERY RESULTS ===
The user just saw these tasks from a query. If they reference #1, #2, etc., use these IDs:
${lastQueryResults.map((t: any) => `#${t.position}: "${t.title}" (ID: ${t.id})`).join('\n')}

` : ''}=== QUERY TASKS ===
When user asks about their tasks (what's due, what's overdue, show tasks, etc.), use the query_tasks tool to filter tasks. DO NOT try to filter the ACTIVE TASKS list yourself - always use the tool.

The query_tasks tool accepts these parameters:
- field: The field to filter on (due_date, start_date, status, project_name, energy_level, time_estimate, critical, my_day_date, assignee)
- operator: How to compare (equals, before, after, is_null, is_not_null, contains)
- value: The value to compare against (use YYYY-MM-DD format for dates)

Examples of when to use query_tasks:
- "What's due today?" → query_tasks(field: "due_date", operator: "equals", value: "${today}")
- "What's due tomorrow?" → query_tasks(field: "due_date", operator: "equals", value: "${tomorrow}")
- "What's overdue?" → query_tasks(field: "due_date", operator: "before", value: "${today}")
- "What's due this week?" → query_tasks(field: "due_date", operator: "before", value: "${nextWeek}") then filter >= today
- "What's in my day?" → query_tasks(field: "my_day_date", operator: "is_not_null")
- "What tasks are in [project]?" → query_tasks(field: "project_name", operator: "equals", value: "ProjectName")
- "Show my high effort tasks" → query_tasks(field: "energy_level", operator: "equals", value: "high")
- "Tasks without time estimates" → query_tasks(field: "time_estimate", operator: "is_null")
- "What's critical?" → query_tasks(field: "critical", operator: "equals", value: "true")
- "What am I working on?" → query_tasks(field: "status", operator: "equals", value: "in_progress")
- "What's assigned to Harry?" → query_tasks(field: "assignee", operator: "contains", value: "Harry")

After getting results from query_tasks, format them as a numbered list for the user.

QUERY RESPONSE FORMAT:
- Always use numbered lists so user can reference tasks by number
- Count the tasks as you list them - the number you report should match the tasks you actually list
- DISPLAY only first 5 tasks for readability, but track ALL matching task IDs internally
- If more than 5 exist, say "Here are 5 of [total] matching tasks:" and mention there are more
- Keep task descriptions short: "Task title (Project) - status"

Example with many results:
"You have 24 medium effort tasks without time estimates. Here are 5 of them:
1. Review docs (Trackli) - in progress
2. Call client (Feedback) - todo
3. Submit report (FIFA) - todo
4. Update website (Internal) - backlog
5. Send proposal (Feedback) - todo

Would you like me to update any of these, or all of them?"

BULK UPDATES:
- When user says "update all" after a query, include ALL matching task IDs (not just the 5 displayed)
- Filter the ACTIVE TASKS list to find ALL tasks matching the query criteria
- Maximum 20 tasks per bulk update
- If more than 20 match, update first 20 and offer to continue

AFTER QUERY FOLLOW-UPS:
- User can say "move #2 to tomorrow" or "mark 1 as done" to act on specific tasks
- For bulk actions like "update all" or "move them all": Use the bulk_update_tasks action with ALL matching task IDs (up to 20)
- IMPORTANT: If user wants DIFFERENT updates for different tasks (e.g., "set 1 to 30 mins and 2 to 90 mins"), you can only do ONE action per response. Update the first task, then ALWAYS ask: "Should I update [task 2 name] to [value] now?" Do NOT forget to ask about the remaining tasks.

=== TASK MATCHING RULES (for updates) ===
When user wants to update a task:
1. CONTEXT MATCH: If user says "it" or "that task" and you just discussed a task, use that task
2. PARTIAL MATCH: Match by partial title (case-insensitive). "mom task" matches "Call mom"
3. SINGLE MATCH (75%+ confidence): Execute immediately
4. MULTIPLE MATCHES (<75% confidence): List ALL matching tasks with numbers (1, 2, 3...) and ask user to pick
5. NUMBER RESPONSE: If user replies with just a number (1, 2, 3), match to the numbered task from previous clarification
6. NO MATCH: Tell user you couldn't find the task. It may be completed or in an archived project. Spark can only update active tasks.

⚠️ CRITICAL: EVERY update MUST include an action object with task_id and updates. A response without an action object does NOTHING - the task will NOT be updated. NEVER say "Done" or "Updated" without including the action.

UPDATE FIELD RULES:
- When updating time_estimate, use NUMBER only (e.g., 30, 60, 90), NOT strings like "30 minutes" or "INDIVIDUAL"
- When updating time_estimate, also update energy_level to match (1-30m=low, 31-120m=medium, >120m=high)
- When user says "I'll do it" or "assign to me", set assignee to "${userName}"
- When updating status to "done", use the complete_task action type instead
- When user asks to "undo", "revert", or "change it back": Do NOT take action.
- "Add to my day" or "put in my day": Set my_day_date to today (${today}) AND removed_from_myday_at to null
- "Remove from my day": Set BOTH my_day_date to null AND removed_from_myday_at to today (${today})
- "Add subtask": Use addSubtask operation: {"addSubtask": {"text": "subtask text"}}
- "Add comment" or "add note": Use addComment operation: {"addComment": {"text": "comment"}}
- Undo requests: Respond with "I don't have access to previous values. Use the Undo button that appears after updates."

Updatable fields: title, due_date, start_date, start_time, end_time, status, project_name, assignee, time_estimate, energy_level, critical, my_day_date, removed_from_myday_at
Structured operations: addSubtask, addComment (these append to arrays)

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

4. BULK UPDATING TASKS (when user wants to update multiple tasks from a query):
{"response": "Done! I've updated all 24 tasks to 60 minutes.", "action": {"type": "bulk_update_tasks", "task_ids": ["uuid1", "uuid2", ...all matching IDs up to 20], "updates": {"time_estimate": 60, "energy_level": "medium"}}}
Note: Include ALL task IDs matching the query criteria (up to 20). Get the IDs from the ACTIVE TASKS list by filtering for the query criteria.

5. ASKING FOR CLARIFICATION (when multiple tasks match or task unclear):
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

=== KEY EXAMPLES ===

Creating task (no project specified):
User: "Create a task to pay rent tomorrow"
{"response": "Which project should it go in?\\n• Feedback\\n• Internal", "action": null}

Creating task (project specified):
User: "Quick task to call mom in Feedback"
{"response": "Created!", "action": {"type": "create_task", "task": {"title": "Call mom", "project_name": "Feedback", "time_estimate": 15, "energy_level": "low", "status": "todo"}}}

Updating task:
User: "Move Call mom to tomorrow"
{"response": "Done!", "action": {"type": "update_task", "task_id": "uuid-from-active-tasks", "updates": {"due_date": "${tomorrow}"}}}

Multiple matches - ask for clarification:
User: "Update the bug task" (multiple tasks match)
{"response": "Which task?\\n1. Fix bug (Trackli)\\n2. Debug login (Feedback)"}

After clarification:
User: "1"
{"response": "What would you like to update on 'Fix bug'?"}

My Day updates:
User: "add task to my day"
{"response": "Done!", "action": {"type": "update_task", "task_id": "uuid", "updates": {"my_day_date": "${today}", "removed_from_myday_at": null}}}

Subtasks/comments (structured operations):
User: "add subtask: check formatting"
{"response": "Added!", "action": {"type": "update_task", "task_id": "uuid", "updates": {"addSubtask": {"text": "check formatting"}}}}

Bulk update after query:
User: "Update all to 60 minutes"
{"response": "Updated 20 tasks!", "action": {"type": "bulk_update_tasks", "task_ids": ["id1", "id2", ...], "updates": {"time_estimate": 60}}}`

    // Define the query_tasks tool
    const tools = [
      {
        name: 'query_tasks',
        description: 'Filter and search tasks based on field values. Use this for any query about tasks (what\'s due, overdue, by project, by status, etc.)',
        input_schema: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              enum: ['due_date', 'start_date', 'status', 'project_name', 'energy_level', 'time_estimate', 'critical', 'my_day_date', 'assignee', 'title'],
              description: 'The task field to filter on'
            },
            operator: {
              type: 'string',
              enum: ['equals', 'before', 'after', 'before_or_equals', 'after_or_equals', 'is_null', 'is_not_null', 'contains'],
              description: 'The comparison operator. Use "before" for dates earlier than value, "after" for dates later than value.'
            },
            value: {
              type: 'string',
              description: 'The value to compare against. Use YYYY-MM-DD format for dates. For boolean fields like critical, use "true" or "false".'
            }
          },
          required: ['field', 'operator']
        }
      }
    ]

    // Function to execute query_tasks tool
    const executeQueryTool = (toolInput: any): any[] => {
      const { field, operator, value } = toolInput
      
      return activeTasks.filter((task: any) => {
        let taskValue = task[field]
        
        // Handle null/undefined checks
        if (operator === 'is_null') {
          return taskValue === null || taskValue === undefined || taskValue === '' || taskValue === 'none'
        }
        if (operator === 'is_not_null') {
          return taskValue !== null && taskValue !== undefined && taskValue !== '' && taskValue !== 'none' && taskValue !== 'no'
        }
        
        // For other operators, we need a value
        if (value === undefined) return false
        
        // Handle different operators
        switch (operator) {
          case 'equals':
            // Case-insensitive string comparison
            if (typeof taskValue === 'string' && typeof value === 'string') {
              return taskValue.toLowerCase() === value.toLowerCase()
            }
            // Boolean handling
            if (field === 'critical') {
              return (taskValue === true || taskValue === 'yes') === (value === 'true' || value === 'yes')
            }
            return taskValue === value
            
          case 'before':
            // Date comparison: taskValue < value
            if (!taskValue) return false
            return taskValue < value
            
          case 'after':
            // Date comparison: taskValue > value
            if (!taskValue) return false
            return taskValue > value
            
          case 'before_or_equals':
            if (!taskValue) return false
            return taskValue <= value
            
          case 'after_or_equals':
            if (!taskValue) return false
            return taskValue >= value
            
          case 'contains':
            if (!taskValue) return false
            return String(taskValue).toLowerCase().includes(String(value).toLowerCase())
            
          default:
            return false
        }
      })
    }

    // Build messages with history
    const messages: any[] = []
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
    messages.push({ role: 'user', content: message })

    // Debug logging
    console.log('TODAY:', today)
    console.log('YESTERDAY:', yesterday)

    // Call Claude with tools
    const callClaude = async (msgs: any[], includeTools: boolean = true) => {
      const requestBody: any = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: msgs
      }
      
      if (includeTools) {
        requestBody.tools = tools
      }
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        const err = await response.text()
        console.error('Claude API error:', response.status, err)
        throw new Error('AI service temporarily unavailable')
      }
      
      return response.json()
    }

    // Initial call to Claude
    let data: any
    try {
      data = await callClaude(messages)
      console.log('Claude initial response stop_reason:', data.stop_reason)
      
      // Handle tool use - Claude wants to call query_tasks
      if (data.stop_reason === 'tool_use') {
        const toolUseBlock = data.content.find((block: any) => block.type === 'tool_use')
        
        if (toolUseBlock && toolUseBlock.name === 'query_tasks') {
          console.log('Tool call:', toolUseBlock.name, JSON.stringify(toolUseBlock.input))
          
          // Execute the query
          const queryResults = executeQueryTool(toolUseBlock.input)
          console.log('Query results count:', queryResults.length)
          
          // Format results for Claude
          const formattedResults = queryResults.map((t: any) => 
            `ID: ${t.id} | "${t.title}" | Project: ${t.project_name} | Due: ${t.due_date || 'none'} | Status: ${t.status}`
          ).join('\n')
          
          console.log('Formatted results preview:', formattedResults.substring(0, 200))
          
          // Send tool result back to Claude
          const toolResultMessages = [
            ...messages,
            { role: 'assistant', content: data.content },
            { 
              role: 'user', 
              content: [{
                type: 'tool_result',
                tool_use_id: toolUseBlock.id,
                content: queryResults.length > 0 
                  ? `Found ${queryResults.length} matching tasks:\n${formattedResults}`
                  : 'No tasks match that criteria.'
              }]
            }
          ]
          
          console.log('Calling Claude with tool results...')
          // Get Claude's final response (no tools on second call)
          data = await callClaude(toolResultMessages, false)
          console.log('Claude final response stop_reason:', data.stop_reason)
        }
      }
    } catch (error) {
      console.error('Claude call error:', String(error))
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract the text response
    const textBlock = data.content?.find((block: any) => block.type === 'text')
    const rawText = textBlock?.text || ''
    
    if (!rawText) {
      console.log('No text block found in response. Full content:', JSON.stringify(data.content))
    }
    
    console.log('Claude raw response:', rawText.substring(0, 500))

    // Parse JSON response using shared utility
    const result = parseClaudeJsonResponse(rawText)

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
