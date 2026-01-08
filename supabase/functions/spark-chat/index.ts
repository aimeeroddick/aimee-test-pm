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
Done! Task created.
ACTION:{"action": "create_task", "data": {"title": "Buy milk", "status": "todo"}}

Example - User says: "Add an in-progress task for today to call the bank"
Your response MUST be:
On it! Created and marked as in progress.
ACTION:{"action": "create_task", "data": {"title": "Call the bank", "status": "in_progress", "due_date": "${new Date().toISOString().split('T')[0]}"}}

If you respond without the ACTION line when creating a task, THE TASK WILL NOT BE CREATED.
=== END CRITICAL ===

Available actions:
- create_task: {"action": "create_task", "data": {"title": "...", "status": "todo|in_progress|done|backlog", "due_date?": "YYYY-MM-DD", "description?": "..."}}
- complete_task: {"action": "complete_task", "data": {"task_id": "..."}}
- update_task: {"action": "update_task", "data": {"task_id": "...", "updates": {...}}}
- add_to_my_day: {"action": "add_to_my_day", "data": {"task_id": "..."}}
- create_project: {"action": "create_project", "data": {"name": "..."}}

PERSONALITY:
- Warm, efficient, helpful - like a capable colleague
- Use casual language: "Got it!", "Done!", "Here you go!"
- Keep responses very concise
- Never use emojis
- Use plain text only (no markdown like **bold** or bullet points)

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
        max_tokens: 1024,
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
