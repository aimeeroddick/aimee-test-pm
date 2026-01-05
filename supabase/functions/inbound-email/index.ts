// Supabase Edge Function: Receive inbound emails and create pending tasks with AI extraction
// Deploy with: supabase functions deploy inbound-email --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract tasks using Claude AI
async function extractTasksWithAI(subject: string, bodyText: string, userNote: string, projectNames: string[], anthropicKey: string) {
  const projectList = projectNames.length > 0 
    ? `Available projects: ${projectNames.join(', ')}`
    : 'No projects available'

  const prompt = `You are a task extraction assistant. Extract ONLY clear action items from this email.

USER'S NOTE (instructions from the person forwarding):
${userNote || '(No specific instructions)'}

EMAIL SUBJECT:
${subject || '(No subject)'}

EMAIL BODY:
${bodyText || '(No body)'}

${projectList}

WHAT TO EXTRACT (action items):
- "[Name] will [action]" → Task assigned to Name
- "[Name] to [action]" → Task assigned to Name  
- "Please [action]" or "Can you [action]" → Task for recipient
- Clear commitments with a person and action verb

WHAT NOT TO EXTRACT:
- Future agenda items ("will discuss next time", "will have on agenda")
- Status updates ("project is on track", "going well")
- Meeting summaries ("met with Dave to discuss")
- Informational statements without a clear task
- Signature blocks, contact info, disclaimers

EXAMPLES:
✅ "Chris will forward the PPT to Aimee" → Extract as task
✅ "Please review the budget by Friday" → Extract as task
❌ "Will determine the date next meeting" → NOT a task (future discussion)
❌ "Project status: on track" → NOT a task (status update)
❌ "Great meeting today" → NOT a task (commentary)

For each task, provide:
- title: Clear, actionable task title (max 100 chars)
- description: Brief context if needed (max 200 chars, or null)
- due_date: In YYYY-MM-DD format if mentioned (or null)
- assignee_text: Person responsible if mentioned (or null)
- project_name: Match to one of the available projects if mentioned in user note or email (exact match from list, or null)
- critical: true ONLY if explicitly marked urgent/ASAP/critical
- confidence: Your confidence this is a real action item (0.5-1.0)

IMPORTANT: If the user's note mentions a project name (e.g., "Add to Feedback project"), match it to the available projects list.

Rules:
- Extract up to 20 tasks maximum
- If user's note specifies dates/assignees/project, apply to all tasks
- If NO clear action items found, return empty array []
- Be conservative - when in doubt, don't extract

Respond ONLY with a JSON array:
[{"title": "...", "description": null, "due_date": "2025-01-15", "assignee_text": "Chris", "project_name": "Feedback", "critical": false, "confidence": 0.9}]

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
        model: 'claude-3-haiku-20240307',
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
      return null
    }

    const data = await response.json()
    const content = data.content?.[0]?.text

    if (!content) {
      console.error('No content in Claude response')
      return null
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    const tasks = JSON.parse(jsonStr)
    
    if (!Array.isArray(tasks)) {
      console.error('Claude response is not an array')
      return null
    }

    return tasks.slice(0, 20) // Enforce max 20 tasks
  } catch (error) {
    console.error('AI extraction error:', error)
    return null
  }
}

// Extract user's note from forwarded email (text before the forwarded content)
function extractUserNote(bodyText: string): string {
  if (!bodyText) return ''
  
  // Common forward markers
  const forwardMarkers = [
    '---------- Forwarded message ---------',
    '-------- Original Message --------',
    'Begin forwarded message:',
    '-----Original Message-----',
    'From:',
    '________________________________'
  ]
  
  let earliestIndex = bodyText.length
  for (const marker of forwardMarkers) {
    const idx = bodyText.indexOf(marker)
    if (idx > 0 && idx < earliestIndex) {
      earliestIndex = idx
    }
  }
  
  if (earliestIndex < bodyText.length) {
    return bodyText.substring(0, earliestIndex).trim()
  }
  
  return ''
}

// Match project name to project ID (case-insensitive, partial match)
function matchProjectId(projectName: string | null, projects: any[]): string | null {
  if (!projectName || projects.length === 0) return null
  
  const searchName = projectName.toLowerCase().trim()
  
  // Try exact match first
  const exactMatch = projects.find(p => p.name.toLowerCase() === searchName)
  if (exactMatch) return exactMatch.id
  
  // Try partial match (project name contains search or vice versa)
  const partialMatch = projects.find(p => 
    p.name.toLowerCase().includes(searchName) || 
    searchName.includes(p.name.toLowerCase())
  )
  if (partialMatch) return partialMatch.id
  
  return null
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SendGrid sends multipart/form-data
    const formData = await req.formData()
    
    // Extract email fields from SendGrid payload
    const to = formData.get('to') as string || ''
    const from = formData.get('from') as string || ''
    const subject = formData.get('subject') as string || ''
    const text = formData.get('text') as string || ''
    const html = formData.get('html') as string || ''
    
    console.log('Received email:', { to, from, subject: subject.substring(0, 50) })
    
    // Extract token from email address (tasks+TOKEN@inbound.gettrackli.com)
    const tokenMatch = to.match(/tasks\+([a-zA-Z0-9]+)@/)
    if (!tokenMatch) {
      console.error('Invalid email format - no token found:', to)
      return new Response(JSON.stringify({ error: 'Invalid email address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const token = tokenMatch[1]
    console.log('Extracted token:', token)
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Find user by token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('inbound_email_token', token)
      .single()
    
    if (profileError) {
      console.error('Profile lookup error:', profileError)
      return new Response(JSON.stringify({ error: 'Database error', details: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (!profile) {
      console.error('User not found for token:', token)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Found user:', profile.id)
    
    // Fetch user's projects for matching
    const { data: userProjects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', profile.id)
    
    const projectNames = userProjects?.map(p => p.name) || []
    console.log('User projects:', projectNames)
    
    // Store the original email
    const { data: emailSource, error: emailError } = await supabase
      .from('email_sources')
      .insert({
        user_id: profile.id,
        from_address: from,
        subject: subject,
        body_text: text,
        body_html: html,
        raw_payload: Object.fromEntries(formData.entries())
      })
      .select()
      .single()
    
    if (emailError) {
      console.error('Failed to store email:', emailError)
      return new Response(JSON.stringify({ error: 'Failed to store email', details: emailError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Stored email source:', emailSource.id)
    
    // Extract user's note (text they added before forwarding)
    const userNote = extractUserNote(text)
    console.log('User note:', userNote ? userNote.substring(0, 100) : '(none)')
    
    // Try AI extraction if API key is available
    let extractedTasks = null
    if (anthropicKey) {
      console.log('Attempting AI extraction...')
      extractedTasks = await extractTasksWithAI(subject, text, userNote, projectNames, anthropicKey)
      console.log('AI extracted tasks:', extractedTasks?.length || 0)
    } else {
      console.log('No ANTHROPIC_API_KEY, skipping AI extraction')
    }
    
    // If AI extraction failed or returned null, create a single fallback task
    if (extractedTasks === null) {
      extractedTasks = [{
        title: subject || 'Task from email',
        description: text?.substring(0, 500) || null,
        due_date: null,
        assignee_text: null,
        project_name: null,
        critical: false,
        confidence: 0.3
      }]
      console.log('AI failed, using fallback single task')
    } else if (extractedTasks.length === 0) {
      extractedTasks = [{
        title: subject || 'Review forwarded email',
        description: 'No specific action items extracted. Please review the original email.',
        due_date: null,
        assignee_text: null,
        project_name: null,
        critical: false,
        confidence: 0.2
      }]
      console.log('AI found no tasks, creating review task')
    }
    
    // Create pending tasks with project matching
    const pendingTasksToInsert = extractedTasks.map(task => {
      const matchedProjectId = matchProjectId(task.project_name, userProjects || [])
      console.log(`Project match: "${task.project_name}" -> ${matchedProjectId}`)
      
      return {
        user_id: profile.id,
        email_source_id: emailSource.id,
        title: task.title?.substring(0, 200) || 'Untitled task',
        description: task.description?.substring(0, 1000) || null,
        due_date: task.due_date || null,
        assignee_text: task.assignee_text || null,
        project_id: matchedProjectId,
        critical: task.critical || false,
        ai_confidence: task.confidence || 0.5,
        status: 'pending'
      }
    })
    
    const { data: pendingTasks, error: taskError } = await supabase
      .from('pending_tasks')
      .insert(pendingTasksToInsert)
      .select()
    
    if (taskError) {
      console.error('Failed to create pending tasks:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to create pending tasks', details: taskError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Created pending tasks:', pendingTasks.length)
    
    return new Response(JSON.stringify({ 
      success: true, 
      email_source_id: emailSource.id,
      pending_tasks_count: pendingTasks.length,
      pending_task_ids: pendingTasks.map(t => t.id)
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Error processing email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
