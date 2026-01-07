// Supabase Edge Function: Extract tasks from meeting notes using Claude AI
// Deploy with: supabase functions deploy extract-tasks --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract tasks using Claude AI
async function extractTasksWithAI(
  notesText: string,
  meetingTitle: string,
  meetingDate: string,
  projectMembers: string[],
  anthropicKey: string
) {
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()
  
  const membersList = projectMembers.length > 0 
    ? `Known team members: ${projectMembers.join(', ')}`
    : 'No team members specified'

  const prompt = `You are a task extraction assistant. Extract ONLY clear action items from these meeting notes.

TODAY'S DATE: ${today} (Current year is ${currentYear})
MEETING TITLE: ${meetingTitle || '(Untitled meeting)'}
MEETING DATE: ${meetingDate || today}

${membersList}

MEETING NOTES:
${notesText}

WHAT TO EXTRACT (action items with clear ownership):
- "[Name] to [action]" → Task assigned to Name (MOST IMPORTANT PATTERN)
- "[Name] will [action]" → Task assigned to Name
- "Action: [Name] to [action]" → Task assigned to Name
- Clear commitments where a specific person is taking responsibility

WHAT NOT TO EXTRACT:
- Past tense statements ("Ben spoke with...", "Dave started...", "We discussed...")
- Observations without actions ("One thing to keep an eye on...", "Good progress on...")
- Headings or topic labels ("How we manage inbound requirements", "Team Hub updates")
- Sub-bullets that provide context/details but aren't new action items
- Status updates ("Project is on track", "Going well")
- Decisions without action owners ("Decision is to continue as is")
- Future discussions without clear ownership ("Will discuss next meeting")
- Informational notes ("He's relatively new to FIFA", "15 years are Globant")

CONTEXT EXPANSION RULES:
When you see pronouns like "this", "that", "it" in an action item, expand them using context from the surrounding text.
Example: 
- Notes say: "How we manage inbound requirements... Aimee to put together process for this"
- Extract as: "Aimee to put together process for managing inbound requirements"

Example:
- Notes say: "Senior engineering lead hire... Dave started to help with job description"  
- This is PAST TENSE ("started") - do NOT extract

CONFIDENCE SCORING:
- 0.85-1.0: Clear "[Name] to [verb]" or "[Name] will [verb]" pattern with specific action
- 0.7-0.84: Action item is implied but ownership is clear
- Below 0.7: Don't extract - too ambiguous

For each task found, provide:
- title: Clear, actionable task title with context expanded (max 150 chars)
- assignee: Person responsible (first name only, must be explicitly stated)
- due_date: YYYY-MM-DD format if mentioned, otherwise null
- critical: true ONLY if explicitly marked urgent/ASAP/critical
- confidence: Your confidence this is a real action item (0.7-1.0)

DATE INTERPRETATION:
- "by January 9" or "January 9" → "${currentYear}-01-09"
- "by Friday" → Calculate next Friday from today
- "first week of January" → "${currentYear}-01-07" (use Friday of that week)
- "next week" → Calculate from today
- "biweekly on Thursdays" → Next Thursday from today
- If a date has passed this year, use next year

EXAMPLES OF CORRECT EXTRACTION:
Notes: "Aimee to setup personal OneNote and OneNote for Aimee/Ben"
→ {"title": "Setup personal OneNote and OneNote for Aimee/Ben", "assignee": "Aimee", "due_date": null, "critical": false, "confidence": 0.95}

Notes: "Ben will make this 2x weekly"
→ {"title": "Make globers list updates 2x weekly", "assignee": "Ben", "due_date": null, "critical": false, "confidence": 0.9}

Notes: "Aimee to check with Chris about going to Globant office biweekly on Thursdays"
→ {"title": "Check with Chris about going to Globant office biweekly on Thursdays", "assignee": "Aimee", "due_date": null, "critical": false, "confidence": 0.95}

EXAMPLES OF WHAT NOT TO EXTRACT:
- "One thing to keep an eye on is bandwidth" → NOT a task (observation)
- "Ben spoke with Carlos" → NOT a task (past tense)
- "Dave started to help with job description" → NOT a task (past tense)
- "How we manage inbound requirements" → NOT a task (heading)
- "Senior engineering lead - Still need to hire this person" → NOT a task (no clear owner with "to" or "will")
- "Managing backlog and prioritising aspects currently in is fine" → NOT a task (status update)

Rules:
- Extract ONLY items with clear "[Name] to/will [action]" patterns
- Be VERY conservative - when in doubt, don't extract
- Maximum 20 tasks
- If NO clear action items found, return empty array []
- Expand pronouns to full context
- Skip ALL past tense statements
- Skip ALL observations and status updates

Respond ONLY with a JSON array:
[{"title": "...", "assignee": "Name", "due_date": "YYYY-MM-DD", "critical": false, "confidence": 0.9}]

If no tasks found, respond with: []`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return { error: 'AI extraction failed', details: errorText }
    }

    const data = await response.json()
    const content = data.content?.[0]?.text

    if (!content) {
      console.error('No content in Claude response')
      return { error: 'No response from AI' }
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    const tasks = JSON.parse(jsonStr)
    
    if (!Array.isArray(tasks)) {
      console.error('Claude response is not an array:', content)
      return { error: 'Invalid response format' }
    }

    // Filter to only high-confidence tasks and format for frontend
    const filteredTasks = tasks
      .filter((t: any) => t.confidence >= 0.7)
      .slice(0, 20)
      .map((t: any, index: number) => ({
        id: `extracted-${Date.now()}-${index}`,
        title: t.title,
        assignee: t.assignee || null,
        dueDate: t.due_date || null,
        critical: t.critical || false,
        confidence: t.confidence,
        selected: t.confidence >= 0.85 // Auto-select high confidence items
      }))

    return { tasks: filteredTasks }

  } catch (error) {
    console.error('Error in AI extraction:', error)
    return { error: 'Failed to parse AI response', details: String(error) }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { notes, title, date, members } = await req.json()

    if (!notes || notes.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'Notes text is required (minimum 10 characters)' }),
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

    const result = await extractTasksWithAI(
      notes,
      title || '',
      date || '',
      members || [],
      anthropicKey
    )

    if (result.error) {
      return new Response(
        JSON.stringify(result),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Request error:', error)
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
