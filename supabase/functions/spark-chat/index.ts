// Supabase Edge Function: Spark AI Chat Assistant
// Deploy with: supabase functions deploy spark-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('Request received:', req.method)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Body received, message:', body.message?.substring(0, 50))
    
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('No API key')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const today = new Date().toISOString().split('T')[0]
    const projects = body.context?.projects || []
    const userName = body.context?.userName || 'User'
    
    // Simplified prompt
    const projectCount = projects.length
    const systemPrompt = `You are Spark, a task assistant. Today is ${today}.

RESPOND IN JSON FORMAT ONLY:
{"response": "your message", "action": {"type": "create_task", "task": {...}}} - when creating tasks
{"response": "your message"} - for questions/conversation

TASK FIELDS: title, status (todo/in_progress/done/backlog), due_date (YYYY-MM-DD), start_date, start_time (HH:MM), end_time, time_estimate (minutes), assignee, project_id (UUID), energy_level (low/medium/high), critical (boolean)

USER: ${userName}
PROJECTS (${projectCount} total): ${projects.map((p: any) => `${p.name} (ID: ${p.id})`).join(', ') || 'None'}

CRITICAL PROJECT RULE:
${projectCount > 1 ? `User has ${projectCount} projects. If they do NOT specify a project name in their message, you MUST ask which project. Do NOT create the task yet - respond with just {"response": "Which project?..."} and list the project names.` : 'User has 1 project, use it automatically.'}

OTHER RULES:
- If user says "I need to..." assign to ${userName}
- Parse times: "8:30am" → "08:30", "2pm-4pm" → start "14:00" end "16:00"
- energy_level: <=30min=low, 31-120min=medium, >120min=high
- "tomorrow" = calculate tomorrow's date
- "one week from today" = calculate that date`

    console.log('Calling Claude...')
    
    // Build messages with conversation history
    const messages = []
    if (body.conversationHistory && Array.isArray(body.conversationHistory)) {
      for (const msg of body.conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }
    messages.push({ role: 'user', content: body.message })
    
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
        messages: messages
      })
    })

    console.log('Claude status:', response.status)

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude error:', err)
      return new Response(
        JSON.stringify({ error: 'AI unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''
    console.log('Claude response:', rawText.substring(0, 100))

    let result
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
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Something went wrong', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
