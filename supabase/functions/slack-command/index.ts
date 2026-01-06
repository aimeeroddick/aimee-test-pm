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

// Format ISO date for display based on user preference
function formatDateForDisplay(isoDate: string | null, dateFormat: string | null): string {
  if (!isoDate) return ''
  
  const [year, month, day] = isoDate.split('-')
  const isUSFormat = dateFormat === 'MM/DD/YYYY'
  
  if (isUSFormat) {
    return `${month}/${day}/${year}`
  } else {
    return `${day}/${month}/${year}`
  }
}

// Extract tasks using Claude AI
async function extractTasksWithAI(
  text: string, 
  projectNames: string[], 
  anthropicKey: string, 
  dateFormat: string | null
) {
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()
  
  const isUSFormat = dateFormat === 'MM/DD/YYYY'
  const dateFormatInstruction = isUSFormat 
    ? 'When you encounter dates like "05/01" or "10/01/26", interpret them as MM/DD/YYYY (US format). So "05/01" means May 1st, "10/01/26" means October 1, 2026.'
    : 'When you encounter dates like "05/01" or "10/01/26", interpret them as DD/MM/YYYY (UK/European format). So "05/01" means January 5th, "10/01/26" means January 10, 2026.'

  const prompt = `You are a task extraction assistant. Extract action items from this Slack message.

TODAY'S DATE: ${today} (Current year is ${currentYear})

DATE FORMAT: ${dateFormatInstruction}

SLACK MESSAGE:
${text}

Available projects: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}

For each task found, provide:
- title: Clear, actionable task title (max 100 chars)
- description: Brief context if needed (max 200 chars, or null)
- due_date: YYYY-MM-DD format if mentioned. Use null if no date.
- project_name: Match to available projects if mentioned (exact match, or null)
- critical: true ONLY if explicitly marked urgent/ASAP/critical
- time_estimate: Duration in MINUTES if mentioned. Use null if not mentioned.
- energy_level: "low", "medium", or "high". Use null if unclear.
- customer: Customer/client name if mentioned. Use null if not mentioned.
- confidence: 0.7-1.0 for clear tasks, 0.5-0.7 for ambiguous

Respond ONLY with a JSON array:
[{"title": "...", "description": null, "due_date": "2026-05-01", "project_name": null, "critical": false, "time_estimate": 30, "energy_level": "medium", "customer": null, "confidence": 0.9}]

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
function formatTasksForSlack(
  tasks: any[], 
  title: string, 
  dateFormat: string | null
): string {
  if (tasks.length === 0) {
    return `*${title}*\n\nNo tasks found.`
  }

  let message = `*${title}*\n\n`
  tasks.forEach((task, i) => {
    const dueStr = task.due_date 
      ? ` (due ${formatDateForDisplay(task.due_date, dateFormat)})` 
      : ''
    const criticalStr = task.critical ? ' 🔴' : ''
    message += `${i + 1}. ${task.title}${dueStr}${criticalStr}\n`
  })
  return message
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!signingSecret || !supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)
  
  const timestamp = req.headers.get('x-slack-request-timestamp') || ''
  const signature = req.headers.get('x-slack-signature') || ''
  
  if (signature && timestamp) {
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return new Response('Invalid request', { status: 401 })
    }
    if (!verifySlackSignature(signingSecret, signature, timestamp, body)) {
      return new Response('Invalid signature', { status: 401 })
    }
  }

  const slackUserId = params.get('user_id')
  const slackTeamId = params.get('team_id')
  const commandText = params.get('text')?.trim() || ''

  console.log('Slack command:', { slackUserId, slackTeamId, commandText })

  if (!slackUserId || !slackTeamId) {
    return new Response(JSON.stringify({ 
      response_type: 'ephemeral',
      text: '❌ Invalid request' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Find the Trackli user - date_format may not exist yet
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
  // Default to UK format if column doesn't exist
  const dateFormat = (connection as any).date_format || 'DD/MM/YYYY'
  const lowerText = commandText.toLowerCase()

  console.log('User found:', userId, 'dateFormat:', dateFormat)

  // /trackli today
  if (lowerText === 'today' || lowerText === 'my day' || lowerText === 'myday') {
    const today = new Date().toISOString().split('T')[0]
    
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
    
    const projectIds = projects?.map(p => p.id) || []
    
    if (projectIds.length === 0) {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `*☀️ My Day - ${formatDateForDisplay(today, dateFormat)}*\n\nNo projects found.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const { data: myDayTasks } = await supabase
      .from('tasks')
      .select('title, due_date, critical, status, project_id')
      .eq('my_day_date', today)
      .neq('status', 'done')
      .in('project_id', projectIds)
      .order('critical', { ascending: false })

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: formatTasksForSlack(
        myDayTasks || [], 
        `☀️ My Day - ${formatDateForDisplay(today, dateFormat)}`, 
        dateFormat
      )
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // /trackli summary
  if (lowerText === 'summary' || lowerText === 'overview') {
    const today = new Date().toISOString().split('T')[0]
    
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
    
    const projectIds = projects?.map(p => p.id) || []

    if (projectIds.length === 0) {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: '*📊 Trackli Summary*\n\nNo projects found.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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
    message += `\n_Open Trackli: https://gettrackli.com_`

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // /trackli help
  if (lowerText === 'help' || lowerText === '') {
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: `*🚀 Trackli Commands*\n\n• \`/trackli Buy milk by Friday\` - Create task\n• \`/trackli today\` - My Day tasks\n• \`/trackli summary\` - Overview\n• \`/trackli help\` - This message`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Create task
  const { data: projects } = await supabase
    .from('projects')
    .select('name')
    .eq('user_id', userId)
    .eq('archived', false)

  const projectNames = projects?.map(p => p.name) || []

  console.log('Extracting tasks with AI, dateFormat:', dateFormat)

  const extractedTasks = await extractTasksWithAI(
    commandText, 
    projectNames, 
    anthropicKey || '', 
    dateFormat
  )

  console.log('Extracted tasks:', extractedTasks?.length || 0)

  if (!extractedTasks || extractedTasks.length === 0) {
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

  const pendingTasks = []
  for (const task of extractedTasks) {
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

    if (insertError) {
      console.error('Insert error:', insertError)
    }

    if (!insertError && newTask) {
      pendingTasks.push(newTask)
    }
  }

  if (pendingTasks.length > 0) {
    let responseText = `✅ Created ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}:\n\n`
    pendingTasks.forEach((t) => {
      const dueStr = t.due_date 
        ? ` (due ${formatDateForDisplay(t.due_date, dateFormat)})` 
        : ''
      responseText += `• ${t.title}${dueStr}\n`
    })
    responseText += `\n_Review in Trackli to approve._`

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
