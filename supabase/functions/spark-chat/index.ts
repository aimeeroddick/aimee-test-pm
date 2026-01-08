// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simplified, focused system prompt
const getSystemPrompt = (today: string) => `You are Spark, a friendly AI assistant in Trackli (a task management app).

TODAY'S DATE: ${today}

YOUR CAPABILITIES:
1. Create tasks
2. Answer questions about the user's tasks
3. Help plan their day
4. General productivity chat

CREATING TASKS:
When the user wants to create a task, respond with JSON in this exact format:
{"response": "Your friendly message here", "action": {"type": "create_task", "task": {"title": "...", "status": "...", "due_date": "...", "project_id": "..."}}}

Task fields:
- title (required): The task name
- status: "todo", "in_progress", "done", or "backlog" (default: "todo")
- due_date: YYYY-MM-DD format (use ${today} for "today"/"tonight", calculate tomorrow, etc.)
- project_id: Use the UUID from the PROJECT LIST below, NOT the name

STATUS HINTS - detect from user's message:
- "in progress", "working on", "started" → "in_progress"
- "done", "finished", "completed" → "done"  
- "backlog", "someday", "later" → "backlog"
- Otherwise → "todo"

ASKING FOR CLARIFICATION:
If the user has MULTIPLE projects and doesn't specify which one, ASK them. Include the project names in your question.
If the user has only ONE project, use it automatically.
If the task title is unclear, ask for clarification.

WHEN NOT CREATING TASKS:
For questions, advice, or conversation, just respond normally:
{"response": "Your helpful answer here"}

FORMATTING:
- Keep responses short and friendly
- No markdown (**bold**, *italic*)
- For lists, use • with blank lines between items
- No emojis

EXAMPLE - Create task:
User: "I need to call the bank tomorrow"
{"response": "Got it! Created your task to call the bank for tomorrow.", "action": {"type": "create_task", "task": {"title": "Call the bank", "status": "todo", "due_date": "2026-01-09"}}}

EXAMPLE - Ask for project:
User: "Add a task to review the report" (user has multiple projects)
{"response": "I'll create that task! Which project should it go in?\\n\\n• Project A\\n\\n• Project B\\n\\n• Project C"}

EXAMPLE - Question:
User: "What's overdue?"
{"response": "You have 3 overdue tasks:\\n\\n• \\"Review Q3 report\\" - was due Monday\\n\\n• \\"Send invoice\\" - was due last week"}
`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, context, conversationHistory } = await req.json()

    if (!message || message.trim().length === 0) {
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
    
    // Build context with PROJECT IDs (critical for task creation)
    let contextSection = ''
    if (context) {
      // Include project IDs so Claude can use them
      const projectList = context.projects?.map((p: any) => 
        `- "${p.name}" (ID: ${p.id}, ${p.task_count} tasks)`
      ).join('\n') || 'No projects'
      
      contextSection = `

PROJECT LIST (use these IDs when creating tasks):
${projectList}

TASK SUMMARY:
- Total: ${context.taskSummary?.total || 0}
- To Do: ${context.taskSummary?.todo || 0}
- In Progress: ${context.taskSummary?.in_progress || 0}
- Done: ${context.taskSummary?.done || 0}
- Overdue: ${context.taskSummary?.overdue || 0}

${context.overdueTasks?.length > 0 ? `OVERDUE TASKS:\n${context.overdueTasks.map((t: any) => `- "${t.title}" (due ${t.due_date})`).join('\n')}` : ''}

${context.myDayTasks?.length > 0 ? `MY DAY TASKS:\n${context.myDayTasks.map((t: any) => `- "${t.title}" [${t.status}]`).join('\n')}` : ''}
`
    }

    // Build messages array
    const messages = []
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
    messages.push({ role: 'user', content: message })

    // NON-STREAMING call to Claude
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
        system: getSystemPrompt(today) + contextSection,
        messages: messages
      })
    })

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
    
    // Try to parse as JSON
    let result: any
    try {
      result = JSON.parse(rawText)
    } catch {
      // If not valid JSON, treat as plain text response
      result = { response: rawText }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: 'Something went wrong', details: String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
