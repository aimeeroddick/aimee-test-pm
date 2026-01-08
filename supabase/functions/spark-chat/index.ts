// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// System prompt - aligned with inbound-email extraction pattern
const getSystemPrompt = (today: string, currentYear: number) => `You are Spark, a friendly AI assistant in Trackli (a task management app).

TODAY'S DATE: ${today} (Current year is ${currentYear})

YOUR CAPABILITIES:
1. Create tasks (using the same extraction logic as email-to-task)
2. Answer questions about the user's tasks
3. Help plan their day

CREATING TASKS:
When the user wants to create a task, respond with JSON:
{"response": "Your message", "action": {"type": "create_task", "task": {...}}}

TASK FIELDS (same as email extraction):
- title: Clear task title (max 100 chars, required)
- description: Brief context (max 200 chars, or null)
- due_date: YYYY-MM-DD format (null if not mentioned)
- start_date: YYYY-MM-DD format - if time mentioned with date, use that date (null otherwise)
- start_time: HH:MM 24-hour format - extract from "8:30am" → "08:30", "2pm" → "14:00" (null if not mentioned)
- end_time: HH:MM 24-hour format - from time ranges like "8:30-9:30am" (null if not mentioned)
- time_estimate: Duration in MINUTES - "1 hour" → 60, "30 mins" → 30 (null if not mentioned)
- assignee: Person responsible - if user says "I need to", assign to them (null if not mentioned)
- project_id: UUID from PROJECT LIST below (required - ask if user has multiple projects and didn't specify)
- status: "todo", "in_progress", "done", or "backlog"
- critical: true only if user says urgent/ASAP/critical (default false)
- energy_level: Based on time_estimate OR explicit words:
  - "low": <= 30 minutes, OR words like "quick", "easy", "simple"
  - "medium": 31-120 minutes (default if no hint)
  - "high": > 120 minutes (2+ hours), OR words like "complex", "difficult", "big"
- customer: Customer/client name if mentioned (null otherwise)

STATUS DETECTION from user's message:
- "in progress", "working on", "started", "already doing" → "in_progress"
- "done", "finished", "completed" → "done"
- "backlog", "someday", "later", "eventually" → "backlog"
- Default → "todo"

DATE/TIME INTERPRETATION:
- "today", "tonight", "now" → "${today}"
- "tomorrow" → calculate tomorrow's date
- "January 8" → "${currentYear}-01-08" (or next year if passed)
- "8:30am" → start_time: "08:30"
- "2pm-4pm" → start_time: "14:00", end_time: "16:00"
- "for an hour" → time_estimate: 60
- "30 minutes" → time_estimate: 30

SELF-ASSIGNMENT:
- "I need to..." → assignee: user's name (from context)
- "remind me to..." → assignee: user's name
- "I have to..." → assignee: user's name

=== CRITICAL: PROJECT SELECTION ===
Before creating ANY task, check the PROJECT LIST below:
- If user has exactly 1 project → use it automatically, don't ask
- If user has 2+ projects AND they specified which one → use that project_id
- If user has 2+ projects AND they did NOT specify → YOU MUST ASK. Do NOT pick one automatically.

When asking for project, respond like this (NO action):
{"response": "I'll create that task! Which project should it go in?\n\n• Project A\n\n• Project B\n\n• Project C"}

Do NOT include an action when asking for clarification.
=== END CRITICAL ===

WHEN NOT CREATING TASKS (just respond normally):
{"response": "Your helpful answer here"}

Use this for questions, advice, conversation, or when clarification is needed.

FORMATTING:
- Keep responses short and friendly (1-3 sentences)
- No markdown (**bold**, *italic*)
- For lists, use • with blank lines between items
- No emojis

EXAMPLE - Create task with time:
User: "I need to pick up Jonathan from the airport tomorrow 8:30am to 9:30am"
{"response": "Got it! I'll create a task for the airport pickup tomorrow morning.", "action": {"type": "create_task", "task": {"title": "Pick up Jonathan from the airport", "due_date": "2026-01-09", "start_date": "2026-01-09", "start_time": "08:30", "end_time": "09:30", "time_estimate": 60, "status": "todo", "assignee": "Aimee"}}}

EXAMPLE - Task with effort:
User: "Quick task - send that email to Sarah"
{"response": "Created a quick task to send the email.", "action": {"type": "create_task", "task": {"title": "Send email to Sarah", "status": "todo", "energy_level": "low", "time_estimate": 5}}}

EXAMPLE - Ask for project:
User: "Add a task to review the report" (user has multiple projects)
{"response": "I'll create that task! Which project should it go in?\\n\\n• Feedback\\n\\n• Tech Learning\\n\\n• Trackli"}
`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Spark received request')
    const { message, context, conversationHistory } = await req.json()
    console.log('Message:', message?.substring(0, 100))

    if (!message || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('Missing ANTHROPIC_API_KEY')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('API key found')

    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()
    
    // Build context with project IDs and user info
    let contextSection = ''
    if (context) {
      const projectList = context.projects?.map((p: any) => 
        `- "${p.name}" (ID: ${p.id}, ${p.task_count} tasks)`
      ).join('\n') || 'No projects'
      
      contextSection = `

PROJECT LIST (use these IDs for project_id):
${projectList}

USER: ${context.userName || 'Unknown'} (use for assignee when user says "I need to...")

TASK SUMMARY:
- Total: ${context.taskSummary?.total || 0}
- To Do: ${context.taskSummary?.todo || 0}
- In Progress: ${context.taskSummary?.in_progress || 0}
- Overdue: ${context.taskSummary?.overdue || 0}

${context.overdueTasks?.length > 0 ? `OVERDUE TASKS:\n${context.overdueTasks.map((t: any) => `- "${t.title}" (due ${t.due_date})`).join('\n')}` : ''}

${context.myDayTasks?.length > 0 ? `MY DAY TASKS:\n${context.myDayTasks.map((t: any) => `- "${t.title}" [${t.status}]`).join('\n')}` : ''}
`
    }

    // Build messages
    const messages = []
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
    messages.push({ role: 'user', content: message })

    console.log('Calling Claude API with', messages.length, 'messages')
    
    // Non-streaming call to Claude
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
        system: getSystemPrompt(today, currentYear) + contextSection,
        messages: messages
      })
    })
    
    console.log('Claude API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: 'AI service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''
    console.log('Claude raw response length:', rawText.length)
    console.log('Claude raw response preview:', rawText.substring(0, 200))
    
    // Parse JSON response
    let result: any
    try {
      // Handle potential markdown code blocks
      let jsonStr = rawText.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      result = JSON.parse(jsonStr)
      console.log('Parsed result successfully')
    } catch (parseError) {
      // If not valid JSON, treat as plain text response
      console.log('JSON parse failed, using raw text:', parseError)
      result = { response: rawText }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Request error:', error)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ error: 'Something went wrong', details: String(error), stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
