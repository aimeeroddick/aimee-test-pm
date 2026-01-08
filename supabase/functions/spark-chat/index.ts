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
    
    const projects = context?.projects || []
    const projectNames = projects.map((p: any) => p.name)
    const userName = context?.userName || 'User'
    const projectCount = projects.length

    // System prompt - aligned with email extraction approach
    const systemPrompt = `You are Spark, a friendly task assistant in Trackli.

TODAY: ${today}
TOMORROW: ${tomorrow}
ONE WEEK FROM TODAY: ${nextWeek}
CURRENT YEAR: ${currentYear}

USER NAME: ${userName}
AVAILABLE PROJECTS: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}
PROJECT COUNT: ${projectCount}

=== RESPONSE FORMAT ===
Always respond with valid JSON in one of these formats:

1. CREATING A TASK (when you have all required info):
{"response": "Got it! Creating your task.", "action": {"type": "create_task", "task": {
  "title": "Task title",
  "project_name": "ProjectName or null",
  "status": "todo",
  "due_date": "YYYY-MM-DD or null",
  "start_date": "YYYY-MM-DD or null",
  "start_time": "HH:MM or null",
  "end_time": "HH:MM or null",
  "time_estimate": "number in minutes or null",
  "assignee": "name or null",
  "energy_level": "low/medium/high",
  "critical": false,
  "customer": "customer name or null",
  "description": "brief context or null"
}}}

2. ASKING FOR CLARIFICATION (when info is missing):
{"response": "Your question here"}

=== CRITICAL: PROJECT HANDLING ===
${projectCount === 0 ? 'No projects exist. Set project_name to null.' : ''}
${projectCount === 1 ? `Only one project: "${projectNames[0]}". Always use this project_name.` : ''}
${projectCount > 1 ? `Multiple projects exist. If the user mentions a project name in their message, use it for project_name. If they do NOT mention any project, you MUST ask which project BEFORE creating the task. Do not guess - ask!

When asking, respond like this (NO action):
{"response": "I'll create that task! Which project should it go in?\\n\\n• ${projectNames.join('\\n\\n• ')}"}` : ''}

=== TASK FIELD RULES ===
- title: Clear, actionable (max 100 chars)
- project_name: EXACT name from the list above, or null. NOT a UUID.
- status: "todo" (default), "in_progress", "done", or "backlog"
- due_date: YYYY-MM-DD format. "tomorrow" = ${tomorrow}, "next week" = ${nextWeek}
- start_date: When work should begin (YYYY-MM-DD)
- start_time: 24-hour format. "8:30am" = "08:30", "2pm" = "14:00"
- end_time: From time ranges. "9am-11am" = end_time "11:00"
- time_estimate: Minutes as number. "1 hour" = 60, "30 mins" = 30
- assignee: Person's name. If user says "I need to..." use "${userName}"
- energy_level: Based on time OR words:
  - "low": ≤30 mins, or "quick", "easy", "simple"
  - "medium": 31-120 mins (default)
  - "high": >120 mins, or "complex", "difficult", "big"
- critical: true only if "urgent", "ASAP", "critical" mentioned
- customer: Client/company name if mentioned

=== STATUS DETECTION ===
- "in progress", "working on", "started" → "in_progress"
- "done", "finished", "completed" → "done"
- "backlog", "someday", "later" → "backlog"
- Default → "todo"

=== EXAMPLES ===

User: "I need to call the doctor tomorrow 8:30-9:30am" (1 project exists: "Personal")
{"response": "Got it! I'll create that task for tomorrow morning.", "action": {"type": "create_task", "task": {"title": "Call the doctor", "project_name": "Personal", "due_date": "${tomorrow}", "start_date": "${tomorrow}", "start_time": "08:30", "end_time": "09:30", "time_estimate": 60, "assignee": "${userName}", "status": "todo", "energy_level": "medium", "critical": false}}}

User: "Add a task to review the report" (multiple projects exist)
{"response": "I'll create that task! Which project should it go in?\\n\\n• Feedback\\n\\n• ChPP\\n\\n• Personal"}

User: "Create a quick task to send the email in the ChPP project"
{"response": "Created your task!", "action": {"type": "create_task", "task": {"title": "Send the email", "project_name": "ChPP", "status": "todo", "energy_level": "low", "time_estimate": 5}}}

=== CONVERSATION ===
For questions about tasks, general chat, or when you need more info, just respond normally:
{"response": "Your helpful answer here"}`

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

    // Parse JSON response
    let result: any
    try {
      let jsonStr = rawText.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      result = JSON.parse(jsonStr)
    } catch {
      result = { response: rawText }
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
