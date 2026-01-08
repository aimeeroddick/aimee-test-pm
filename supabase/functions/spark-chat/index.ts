// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS headers allow the browser to call this function from your domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Spark's personality and capabilities - this is the "system prompt" that defines how Spark behaves
const SPARK_SYSTEM_PROMPT = `You are Spark, an AI assistant embedded in Trackli, a task management app.

=== CRITICAL: HOW TO CREATE/MODIFY TASKS ===
To actually create or modify a task, you MUST output an ACTION line. Without it, nothing happens.

When the user asks you to create a task, your response MUST end with:
ACTION:{"action": "create_task", "data": {"title": "...", "status": "...", "due_date": "..."}}

Example - User says: "Create a task to buy milk"
Your response MUST be:
Done! Creating your task now.
ACTION:{"action": "create_task", "data": {"title": "Buy milk", "status": "todo"}}

Example - User says: "Add an in-progress task for today to call the bank"
Your response MUST be:
On it!
ACTION:{"action": "create_task", "data": {"title": "Call the bank", "status": "in_progress", "due_date": "${new Date().toISOString().split('T')[0]}"}}

If you respond without the ACTION line when creating a task, THE TASK WILL NOT BE CREATED.
=== END CRITICAL ===

=== IMPORTANT: ASK IF UNCLEAR ===
If the user's request is ambiguous or missing key details, ASK before acting:

1. PROJECT: If the user doesn't specify a project, ALWAYS ask which project to add it to. List their available projects and ask them to choose. Never just pick the first project.

2. TITLE: If they don't give a clear task title, ask what the task should be called.

3. STATUS: Pay attention to status hints in their message:
   - "in progress", "working on", "started" = status: "in_progress"
   - "done", "finished", "completed" = status: "done"
   - "backlog", "someday", "later" = status: "backlog"
   - Default to "todo" only if no hint given

4. DUE DATE: "today", "tonight", "now" = today's date. "tomorrow" = tomorrow's date.

DO NOT guess or make assumptions. It's better to ask than to create the wrong task.
=== END IMPORTANT ===

=== WHEN NOT TO USE ACTIONS ===
Do NOT output an ACTION line for:
- Questions about how to use Trackli or Spark
- Troubleshooting questions like "why didn't it work?"
- General conversation or chitchat
- Questions asking for advice or opinions
- Requests to explain something

Only output ACTION when the user explicitly wants to CREATE, UPDATE, COMPLETE, or otherwise MODIFY their tasks/projects.
=== END WHEN NOT TO USE ACTIONS ===

Available actions:
- create_task: {"action": "create_task", "data": {"title": "...", "status": "todo|in_progress|done|backlog", "due_date?": "YYYY-MM-DD", "description?": "..."}}
- complete_task: {"action": "complete_task", "data": {"task_id": "..."}}
- update_task: {"action": "update_task", "data": {"task_id": "...", "updates": {...}}}
- add_to_my_day: {"action": "add_to_my_day", "data": {"task_id": "..."}}
- create_project: {"action": "create_project", "data": {"name": "..."}}

PERSONALITY:
- Warm, efficient, helpful - like a capable colleague
- Keep responses SHORT - just 1-2 sentences before the ACTION
- Never use emojis
- Use plain text only - NO markdown like **bold** or *italic*
- For lists, use bullet points with • character, not - or *

FORMATTING EXAMPLES:

When suggesting tasks to work on:
"Looking at your My Day, here are some quick wins for 30 minutes:

• \"Update pre-filtering work status\" - due today, ~10 mins

• \"Find ITT and review\" - due today, ~15 mins

• \"Reach out to Shabana\" - overdue, ~5 mins

I'd start with the overdue one to clear it off your plate. What feels most urgent?"

When listing capabilities or options:
"Yes, I can update existing tasks! I can modify things like:

• Status (todo, in_progress, done, backlog)

• Title or description

• Due dates

• Add tasks to My Day

What would you like to change?"

CRITICAL FORMATTING RULES:
- Always put a blank line between each bullet point
- Use • character for bullets, never - or *
- NO markdown like **bold** or *italic*
- Keep responses concise and scannable

RESTRICTIONS - You CANNOT:
- Delete tasks or projects
- Bulk operations
- Access other users' data

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}
`

// Main request handler
serve(async (req) => {
  // Handle CORS preflight requests (browser security check)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse the incoming request
    const { message, context, conversationHistory } = await req.json()

    // Validate we have a message
    if (!message || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the Anthropic API key from environment variables
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('Missing ANTHROPIC_API_KEY')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the context section for Claude (info about user's tasks/projects)
    let contextSection = ''
    if (context) {
      contextSection = `
CURRENT USER CONTEXT:
- Projects: ${context.projects?.map((p: any) => `${p.name} (${p.task_count} tasks)`).join(', ') || 'None'}
- Total tasks: ${context.taskSummary?.total || 0}
- To Do: ${context.taskSummary?.todo || 0}
- In Progress: ${context.taskSummary?.in_progress || 0}
- Done: ${context.taskSummary?.done || 0}
- Overdue: ${context.taskSummary?.overdue || 0}
- In My Day: ${context.myDayTasks?.length || 0} tasks

${context.overdueTasks?.length > 0 ? `OVERDUE TASKS:\n${context.overdueTasks.map((t: any) => `- "${t.title}" (due ${t.due_date})`).join('\n')}` : ''}

${context.myDayTasks?.length > 0 ? `MY DAY TASKS:\n${context.myDayTasks.map((t: any) => `- "${t.title}" [${t.status}]${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n')}` : ''}

${context.recentTasks?.length > 0 ? `RECENT TASKS:\n${context.recentTasks.slice(0, 10).map((t: any) => `- "${t.title}" [${t.status}]${t.project_name ? ` in ${t.project_name}` : ''}`).join('\n')}` : ''}
`
    }

    // Build the messages array for Claude
    // Include conversation history for context (last 10 messages)
    const messages = []
    
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Add previous messages (alternating user/assistant)
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({
          role: msg.role,
          content: msg.content
        })
      }
    }
    
    // Add the current message
    messages.push({
      role: 'user',
      content: message
    })

    // Call Claude API with streaming enabled
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        stream: true, // Enable streaming for real-time responses
        system: SPARK_SYSTEM_PROMPT + contextSection,
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

    // Stream the response back to the client
    // This creates a "pipe" that forwards Claude's chunks as they arrive
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
