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
- due_date: YYYY-MM-DD format. "tomorrow" = ${tomorrow}, "next week" = ${nextWeek}
- start_date: When work should begin (YYYY-MM-DD)
- start_time: 24-hour format. "8:30am" = "08:30", "2pm" = "14:00"
- end_time: From time ranges. "9am-11am" = end_time "11:00"
- time_estimate: Minutes as number. "1 hour" = 60, "30 mins" = 30
- assignee: Person's name. If user says "I need to..." use "${userName}"
- energy_level: <=30 mins or "quick/easy" = "low", 31-120 mins = "medium", >120 mins or "complex" = "high"
- critical: true only if "urgent", "ASAP", "critical" mentioned

=== EXAMPLES ===

User: "Create a task to pay rent tomorrow" (multiple projects, no project specified)
{"response": "I'll create that task! Which project should it go in?\n• Feedback\n• Internal - Gameday\n• ChPP"}

User: "Gameday" (responding to project question, look at history for task details)
{"response": "Got it! Creating your rent payment task.", "action": {"type": "create_task", "task": {"title": "Pay rent", "project_name": "Internal - Gameday", "due_date": "${tomorrow}", "status": "todo", "energy_level": "medium"}}}

User: "Add a task to call mom in the ChPP project"
{"response": "Created your task!", "action": {"type": "create_task", "task": {"title": "Call mom", "project_name": "ChPP", "status": "todo", "energy_level": "medium"}}}`

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
