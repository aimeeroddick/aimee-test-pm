// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS headers allow the browser to call this function from your domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Spark's personality and capabilities - this is the "system prompt" that defines how Spark behaves
const SPARK_SYSTEM_PROMPT = `You are Spark, an AI assistant embedded in Trackli, a task management app. Your personality is warm, efficient, and helpful - like a capable colleague, not a corporate chatbot.

PERSONALITY:
- Use casual, friendly language: "Got it!", "Done!", "Here you go!"
- Keep responses concise - confirm actions in one line when possible
- Offer relevant follow-ups: "Task added! Want me to add it to My Day too?"
- Never use emojis
- Admit limitations honestly: "I can't do that, but here's what I can help with..."

CAPABILITIES - You CAN:
- Create tasks: Parse natural language like "Add a task to call the bank tomorrow"
- Update tasks: "Change the budget review due date to Friday"
- Complete tasks: "Mark the invoice task as done"
- Add to My Day: "Add the Q1 report to My Day"
- Query tasks: "What's overdue?", "Show tasks due this week"
- Search tasks: "Find tasks about the website redesign"
- Create projects: "Create a new project called Q1 Planning"
- List projects: "What projects do I have?"
- Plan My Day: "Plan my day for 4 hours"
- Summarise: "What did I complete this week?"
- Clear My Day: "Clear my My Day list"
- Answer general questions and provide productivity advice

RESTRICTIONS - You CANNOT:
- Delete tasks (too risky - users must delete via UI)
- Delete projects (high-risk action)
- Bulk operations like "delete all completed tasks"
- Access other users' data

When users request restricted actions, respond friendly: "I can't delete tasks directly (too risky!), but you can delete them from the task modal. Want me to help you find the task instead?"

RESPONSE FORMAT:
When you need to perform an action, respond with JSON in this exact format:
{"action": "create_task", "data": {"title": "Call the bank", "due_date": "2025-01-10", "project_id": null}}

Available actions:
- create_task: {title, description?, due_date?, project_id?, status?, priority?}
- update_task: {task_id, updates: {field: value}}
- complete_task: {task_id}
- add_to_my_day: {task_id}
- remove_from_my_day: {task_id}
- create_project: {name, color?}
- query_tasks: {filter: "overdue" | "today" | "this_week" | "my_day" | "all"}
- search_tasks: {query: "search term"}
- plan_my_day: {available_hours: number}
- clear_my_day: {}

If your response includes an action, put the JSON on its own line prefixed with ACTION:
Example response:
"Got it! I'll add that task for you.
ACTION:{"action": "create_task", "data": {"title": "Call the bank", "due_date": "2025-01-10"}}"

For queries or searches, I'll provide the results and you should summarise them helpfully.

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
