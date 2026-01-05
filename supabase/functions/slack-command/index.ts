import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify Slack request signature
function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const baseString = `v0:${timestamp}:${body}`
  const hmac = createHmac('sha256', signingSecret)
  hmac.update(baseString)
  const mySignature = `v0=${hmac.digest('hex')}`
  return mySignature === signature
}

// Extract tasks using Claude AI (same as email)
async function extractTasksWithAI(text: string, projectNames: string[], anthropicKey: string) {
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()

  const prompt = `You are a task extraction assistant. Extract action items from this Slack message.

TODAY'S DATE: ${today} (Current year is ${currentYear})

DATE FORMAT: When you encounter dates in DD/MM/YYYY or DD/MM/YY format (e.g., "10/01/26"), interpret them as day/month/year (UK/European format). So "10/01/26" means January 10, 2026, NOT October 1, 2026.

SLACK MESSAGE:
${text}

Available projects: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}

For each task found, provide:
- title: Clear, actionable task title (max 100 chars)
- description: Brief context if needed (max 200 chars, or null)
- due_date: YYYY-MM-DD format if mentioned (e.g., "tomorrow" → calculate, "Friday" → next Friday). Use null if no date.
- project_name: Match to available projects if mentioned (exact match, or null)
- critical: true ONLY if explicitly marked urgent/ASAP/critical
- time_estimate: Duration in MINUTES if mentioned (e.g., "10 minutes" → 10, "2 hours" → 120). Use null if not mentioned.
- energy_level: "low" (quick/easy), "medium" (moderate), or "high" (complex/difficult). Use null if not mentioned.
- customer: Customer/client name if mentioned. Use null if not mentioned.
- confidence: 0.7-1.0 for clear tasks, 0.5-0.7 for ambiguous

Rules:
- Even short messages like "Buy milk" should be extracted as a task
- Convert relative dates (tomorrow, next week, Friday) to absolute dates
- If the message is clearly NOT a task (like "hello" or "thanks"), return empty array

Respond ONLY with a JSON array:
[{"title": "...", "description": null, "due_date": "${currentYear}-01-15", "project_name": null, "critical": false, "time_estimate": 30, "energy_level": "medium", "customer": null, "confidence": 0.9}]

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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    const data = await response.json()
    const content = data.content?.[0]?.text || '[]'
    
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return []
  } catch (error) {
    console.error('AI extraction error:', error)
    return []
  }
}

// Format task list for Slack
function formatTasksForSlack(tasks: any[], title: string): string {
  if (tasks.length === 0) {
    return `*${title}*\n\nNo tasks found. 🎉`
  }

  let message = `*${title}*\n\n`
  tasks.forEach((task, i) => {
    const dueStr = task.due_date ? ` (due ${task.due_date})` : ''
    const criticalStr = task.critical ? ' 🔴' : ''
    message += `${i + 1}. ${task.title}${dueStr}${criticalStr}\n`
  })
  return message
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!signingSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables')
    return new Response(JSON.stringify({ error: 'Configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Get raw body for signature verification
  const body = await req.text()
  const params = new URLSearchParams(body)
  
  // Verify Slack signature
  const timestamp = req.headers.get('x-slack-request-timestamp') || ''
  const signature = req.headers.get('x-slack-signature') || ''
  
  // Skip verification in development or if headers missing
  if (signature && timestamp) {
    // Check timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error('Request timestamp too old')
      return new Response('Invalid request', { status: 401 })
    }

    if (!verifySlackSignature(signingSecret, signature, timestamp, body)) {
      console.error('Invalid Slack signature')
      return new Response('Invalid signature', { status: 401 })
    }
  }

  // Parse slash command data
  const slackUserId = params.get('user_id')
  const slackTeamId = params.get('team_id')
  const commandText = params.get('text')?.trim() || ''
  const responseUrl = params.get('response_url')

  console.log('Slack command received:', { slackUserId, slackTeamId, commandText })

  if (!slackUserId || !slackTeamId) {
    return new Response(JSON.stringify({ 
      response_type: 'ephemeral',
      text: '❌ Invalid request - missing user info' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Find the Trackli user linked to this Slack user
  const { data: connection, error: connError } = await supabase
    .from('slack_connections')
    .select('user_id, access_token')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', slackTeamId)
    .single()

  if (connError || !connection) {
    console.error('No connection found:', connError)
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: '❌ Your Slack account is not connected to Trackli.\n\nGo to Trackli Settings → Integrations → Connect to Slack'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const userId = connection.user_id

  // Handle different commands
  const lowerText = commandText.toLowerCase()

  // Command: /trackli today - Show My Day tasks
  if (lowerText === 'today' || lowerText === 'my day' || lowerText === 'myday') {
    const today = new Date().toISOString().split('T')[0]
    
    // Get user's projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
    
    const projectIds = projects?.map(p => p.id) || []
    
    const { data: myDayTasks } = await supabase
      .from('tasks')
      .select('title, due_date, critical, status, project_id')
      .eq('my_day_date', today)
      .neq('status', 'done')
      .in('project_id', projectIds)
      .order('critical', { ascending: false })

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: formatTasksForSlack(myDayTasks || [], `☀️ My Day - ${today}`)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Command: /trackli summary - Show overview
  if (lowerText === 'summary' || lowerText === 'overview') {
    const today = new Date().toISOString().split('T')[0]
    
    // Get user's projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
    
    const projectIds = projects?.map(p => p.id) || []

    // Get various task counts
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('title, due_date, critical, status, my_day_date')
      .in('project_id', projectIds)
      .neq('status', 'done')

    const overdue = allTasks?.filter(t => t.due_date && t.due_date < today) || []
    const dueToday = allTasks?.filter(t => t.due_date === today) || []
    const myDay = allTasks?.filter(t => t.my_day_date === today) || []
    const critical = allTasks?.filter(t => t.critical) || []

    let message = `*📊 Trackli Summary*\n\n`
    message += `• *Overdue:* ${overdue.length} task${overdue.length !== 1 ? 's' : ''}\n`
    message += `• *Due Today:* ${dueToday.length} task${dueToday.length !== 1 ? 's' : ''}\n`
    message += `• *My Day:* ${myDay.length} task${myDay.length !== 1 ? 's' : ''}\n`
    message += `• *Critical:* ${critical.length} task${critical.length !== 1 ? 's' : ''}\n`
    message += `\n_Open Trackli to manage your tasks: https://gettrackli.com_`

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Command: /trackli help
  if (lowerText === 'help' || lowerText === '') {
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: `*🚀 Trackli Slash Commands*\n\n` +
        `• \`/trackli Buy milk by Friday\` - Create a new task\n` +
        `• \`/trackli today\` - See your My Day tasks\n` +
        `• \`/trackli summary\` - Get an overview of your tasks\n` +
        `• \`/trackli help\` - Show this help message\n\n` +
        `_Tasks created via Slack go to your Pending Tasks for review._`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Default: Create a task from the text
  // Get user's projects for AI matching
  const { data: projects } = await supabase
    .from('projects')
    .select('name')
    .eq('user_id', userId)
    .eq('archived', false)

  const projectNames = projects?.map(p => p.name) || []

  // Extract tasks using AI
  const extractedTasks = await extractTasksWithAI(commandText, projectNames, anthropicKey || '')

  if (extractedTasks.length === 0) {
    // If AI didn't find tasks, create one from the raw text
    extractedTasks.push({
      title: commandText.slice(0, 100),
      description: null,
      due_date: null,
      project_name: null,
      critical: false,
      time_estimate: null,
      energy_level: null,
      customer: null,
      confidence: 0.8
    })
  }

  // Create pending tasks
  const pendingTasks = []
  for (const task of extractedTasks) {
    // Match project name to ID
    let projectId = null
    if (task.project_name) {
      const { data: matchedProject } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', userId)
        .ilike('name', task.project_name)
        .single()
      
      if (matchedProject) {
        projectId = matchedProject.id
      }
    }

    const { data: newTask, error: insertError } = await supabase
      .from('pending_tasks')
      .insert({
        user_id: userId,
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        project_id: projectId,
        critical: task.critical || false,
        time_estimate: task.time_estimate,
        energy_level: task.energy_level,
        customer: task.customer,
        confidence: task.confidence || 0.8,
        source: 'slack',
        status: 'pending'
      })
      .select()
      .single()

    if (!insertError && newTask) {
      pendingTasks.push(newTask)
    }
  }

  if (pendingTasks.length > 0) {
    const taskWord = pendingTasks.length === 1 ? 'task' : 'tasks'
    let responseText = `✅ Created ${pendingTasks.length} pending ${taskWord}:\n\n`
    pendingTasks.forEach((t, i) => {
      const dueStr = t.due_date ? ` (due ${t.due_date})` : ''
      responseText += `• ${t.title}${dueStr}\n`
    })
    responseText += `\n_Review in Trackli to approve or edit._`

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: responseText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: '❌ Could not create task. Please try again.'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
