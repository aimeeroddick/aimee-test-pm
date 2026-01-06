import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify Slack request signature using Web Crypto API
async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const baseString = `v0:${timestamp}:${body}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString))
    const hashArray = Array.from(new Uint8Array(sig))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const mySignature = `v0=${hashHex}`
    return mySignature === signature
  } catch (e) {
    console.error('Signature verification error:', e)
    return false
  }
}

// Extract task details using Claude AI
async function extractTaskWithAI(text: string, projectNames: string[], anthropicKey: string) {
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()

  const prompt = `You are a task extraction assistant. Parse this task request.

TODAY'S DATE: ${today} (Current year is ${currentYear})

DATE FORMAT: When you encounter dates in DD/MM/YYYY or DD/MM/YY format (e.g., "10/01/26"), interpret them as day/month/year (UK/European format). So "10/01/26" means January 10, 2026, NOT October 1, 2026.

TASK REQUEST:
${text}

Available projects: ${projectNames.length > 0 ? projectNames.join(', ') : 'None'}

Extract:
- title: Clear, actionable task title (max 100 chars)
- description: Additional context if any (max 200 chars, or null)
- due_date: YYYY-MM-DD format. Convert relative dates: "tomorrow" = next day, "Wednesday" = next Wednesday, "next week" = 7 days, "Friday" = this Friday if today is before Friday else next Friday. Use null if no date mentioned.
- start_date: YYYY-MM-DD format. If a specific time/time range is mentioned with a date, use that date. Otherwise null.
- start_time: HH:MM format (24-hour). Extract from time ranges like "8:30-9:30am", "2pm-4pm", "at 3pm". For "8:30am" use "08:30". For "2pm" use "14:00". Use null if no time mentioned.
- end_time: HH:MM format (24-hour). Extract end time from ranges. If only start time given (e.g., "at 3pm"), use null. Use null if no time range mentioned.
- project_name: Match to available projects if mentioned (case-insensitive match, or null if not mentioned or no match)
- critical: true ONLY if words like "urgent", "ASAP", "critical", "important" are used
- time_estimate: Duration in MINUTES if mentioned (e.g., "quick" = 15, "30 mins" = 30, "2 hours" = 120). If time range given, calculate from that. Use null if not mentioned.
- energy_level: "low" for quick/easy tasks, "medium" for moderate tasks, "high" for complex/difficult. Infer from task complexity, or null.
- customer: Customer/client name if mentioned, or null.

Respond ONLY with a JSON object (no markdown, no explanation):
{"title": "...", "description": null, "due_date": "2026-01-10", "start_date": "2026-01-10", "start_time": "08:30", "end_time": "09:30", "project_name": null, "critical": false, "time_estimate": 60, "energy_level": "medium", "customer": null}`

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
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    const data = await response.json()
    const content = data.content?.[0]?.text || '{}'
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return null
  } catch (error) {
    console.error('AI extraction error:', error)
    return null
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

// Send async response to Slack
async function sendSlackResponse(responseUrl: string, message: string) {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: message,
        replace_original: true
      })
    })
  } catch (e) {
    console.error('Error sending Slack response:', e)
  }
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
    return new Response(JSON.stringify({ 
      response_type: 'ephemeral',
      text: '❌ Configuration error. Please contact support.' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Get raw body for signature verification
  const body = await req.text()
  const params = new URLSearchParams(body)
  
  // Verify Slack signature (skip if missing - for testing)
  const timestamp = req.headers.get('x-slack-request-timestamp') || ''
  const signature = req.headers.get('x-slack-signature') || ''
  
  if (signature && timestamp) {
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error('Request timestamp too old')
      return new Response(JSON.stringify({ 
        response_type: 'ephemeral',
        text: '❌ Request expired. Please try again.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const isValid = await verifySlackSignature(signingSecret, signature, timestamp, body)
    if (!isValid) {
      console.error('Invalid Slack signature')
      return new Response(JSON.stringify({ 
        response_type: 'ephemeral',
        text: '❌ Invalid request signature.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // Parse slash command data
  const slackUserId = params.get('user_id')
  const slackTeamId = params.get('team_id')
  const commandText = params.get('text')?.trim() || ''
  const responseUrl = params.get('response_url') || ''

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
  const lowerText = commandText.toLowerCase()

  // Command: /trackli help (or empty)
  if (lowerText === 'help' || lowerText === '') {
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: `*🚀 Trackli Slash Commands*\n\n` +
        `• \`/trackli Buy milk by Friday\` - Create a new task\n` +
        `• \`/trackli today\` - See your My Day tasks\n` +
        `• \`/trackli summary\` - Get an overview of your tasks\n` +
        `• \`/trackli help\` - Show this help message\n\n` +
        `_Mention a project name to add directly, otherwise goes to Pending._`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Command: /trackli today - Show My Day tasks
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
        text: `*☀️ My Day - ${today}*\n\nNo projects found. Create a project in Trackli first!`
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
      text: formatTasksForSlack(myDayTasks || [], `☀️ My Day - ${today}`)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Command: /trackli summary - Show overview
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
        text: `*📊 Trackli Summary*\n\nNo projects found. Create a project in Trackli first!`
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
    message += `\n_Open Trackli to manage your tasks: https://gettrackli.com_`

    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Default: Create a task from the text
  // Get user's projects for AI matching
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', userId)
    .eq('archived', false)

  const projectNames = projects?.map(p => p.name) || []

  if (!projects || projects.length === 0) {
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: '❌ No projects found. Create a project in Trackli first!'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Process async with AI
  const processTask = async () => {
    let taskData = {
      title: commandText.slice(0, 100),
      description: null as string | null,
      due_date: null as string | null,
      start_date: null as string | null,
      start_time: null as string | null,
      end_time: null as string | null,
      project_id: null as string | null,
      critical: false,
      time_estimate: null as number | null,
      energy_level: null as string | null,
      customer: null as string | null
    }

    // Try AI extraction if we have the key
    if (anthropicKey) {
      const aiResult = await extractTaskWithAI(commandText, projectNames, anthropicKey)
      if (aiResult) {
        taskData.title = aiResult.title || commandText.slice(0, 100)
        taskData.description = aiResult.description || null
        taskData.due_date = aiResult.due_date || null
        taskData.start_date = aiResult.start_date || null
        taskData.start_time = aiResult.start_time || null
        taskData.end_time = aiResult.end_time || null
        taskData.critical = aiResult.critical || false
        taskData.time_estimate = aiResult.time_estimate || null
        taskData.energy_level = aiResult.energy_level || null
        taskData.customer = aiResult.customer || null

        // Match project name to ID
        if (aiResult.project_name) {
          const matchedProject = projects?.find(
            p => p.name.toLowerCase() === aiResult.project_name.toLowerCase()
          )
          if (matchedProject) {
            taskData.project_id = matchedProject.id
          }
        }
      }
    }

    // If only one project, always use it
    if (!taskData.project_id && projects && projects.length === 1) {
      taskData.project_id = projects[0].id
    }

    // If no project matched and multiple projects exist, send to pending
    if (!taskData.project_id) {
      const { data: pendingTask, error: pendingError } = await supabase
        .from('pending_tasks')
        .insert({
          user_id: userId,
          title: taskData.title,
          description: taskData.description,
          due_date: taskData.due_date,
          start_date: taskData.start_date,
          start_time: taskData.start_time,
          end_time: taskData.end_time,
          project_id: null,
          critical: taskData.critical,
          time_estimate: taskData.time_estimate,
          energy_level: taskData.energy_level,
          customer: taskData.customer,
          status: 'pending'
        })
        .select()
        .single()

      if (pendingError) {
        console.error('Pending insert error:', pendingError)
        await sendSlackResponse(responseUrl, '❌ Could not create task. Please try again.')
        return
      }

      let responseText = `📋 *Task added to Pending*\n\n`
      responseText += `• *Title:* ${pendingTask.title}\n`
      if (pendingTask.due_date) responseText += `• *Due:* ${pendingTask.due_date}\n`
      if (pendingTask.start_time) {
        const timeStr = pendingTask.end_time 
          ? `${pendingTask.start_time} - ${pendingTask.end_time}`
          : `${pendingTask.start_time}`
        responseText += `• *Time:* ${timeStr}\n`
      }
      if (pendingTask.time_estimate) responseText += `• *Estimate:* ${pendingTask.time_estimate} mins\n`
      if (pendingTask.critical) responseText += `• *Priority:* 🔴 Critical\n`
      responseText += `\n_No project matched. Review in Trackli to assign a project and approve._`

      await sendSlackResponse(responseUrl, responseText)
      return
    }

    // Project matched - create task directly on board
    // Determine status based on due date (backlog if > 7 days out)
    let taskStatus = 'todo'
    if (taskData.due_date) {
      const dueDate = new Date(taskData.due_date)
      const today = new Date()
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > 7) {
        taskStatus = 'backlog'
      }
    }

    // Create automatic comment
    const now = new Date()
    const createdComment = {
      id: crypto.randomUUID(),
      text: `Created via Slack on ${now.toLocaleDateString('en-GB')} at ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      created_at: now.toISOString(),
      is_system: true
    }

    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        project_id: taskData.project_id,
        title: taskData.title,
        description: taskData.description,
        due_date: taskData.due_date,
        start_date: taskData.start_date,
        start_time: taskData.start_time,
        end_time: taskData.end_time,
        critical: taskData.critical,
        time_estimate: taskData.time_estimate,
        energy_level: taskData.energy_level,
        customer: taskData.customer,
        status: taskStatus,
        comments: [createdComment]
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      await sendSlackResponse(responseUrl, '❌ Could not create task. Please try again.')
      return
    }

    // Build response message
    const projectName = projects?.find(p => p.id === taskData.project_id)?.name || 'Unknown'
    const statusText = taskStatus === 'backlog' ? ' (Backlog)' : ''
    let responseText = `✅ *Task created!*\n\n`
    responseText += `• *Title:* ${newTask.title}\n`
    responseText += `• *Project:* ${projectName}${statusText}\n`
    if (newTask.due_date) responseText += `• *Due:* ${newTask.due_date}\n`
    if (newTask.start_time) {
      const timeStr = newTask.end_time 
        ? `${newTask.start_time} - ${newTask.end_time}`
        : `${newTask.start_time}`
      responseText += `• *Time:* ${timeStr}\n`
    }
    if (newTask.time_estimate) responseText += `• *Estimate:* ${newTask.time_estimate} mins\n`
    if (newTask.critical) responseText += `• *Priority:* 🔴 Critical\n`
    responseText += `\n<https://gettrackli.com?task=${newTask.id}|View task in Trackli>`

    await sendSlackResponse(responseUrl, responseText)
  }

  // Start async processing
  processTask().catch(e => {
    console.error('Task processing error:', e)
    sendSlackResponse(responseUrl, '❌ Error processing task. Please try again.')
  })

  // Respond immediately to Slack
  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: '⏳ Creating task...'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
