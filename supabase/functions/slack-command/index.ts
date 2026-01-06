import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatDateForDisplay(isoDate: string | null, dateFormat: string): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  if (dateFormat === 'MM/DD/YYYY') {
    return `${month}/${day}/${year}`
  }
  return `${day}/${month}/${year}`
}

function getTodayInTimezone(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(now)
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

function parseSimpleDate(text: string, dateFormat: string): string | null {
  const today = new Date()
  const lowerText = text.toLowerCase()
  
  if (lowerText.includes('today') || lowerText.includes('eod')) {
    return today.toISOString().split('T')[0]
  }
  if (lowerText.includes('tomorrow')) {
    today.setDate(today.getDate() + 1)
    return today.toISOString().split('T')[0]
  }
  
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (const day of days) {
    if (lowerText.includes(day)) {
      const targetDay = days.indexOf(day)
      let daysUntil = (targetDay - today.getDay() + 7) % 7
      if (daysUntil === 0) daysUntil = 7
      today.setDate(today.getDate() + daysUntil)
      return today.toISOString().split('T')[0]
    }
  }
  
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (dateMatch) {
    const isUS = dateFormat === 'MM/DD/YYYY'
    const month = isUS ? parseInt(dateMatch[1]) : parseInt(dateMatch[2])
    const day = isUS ? parseInt(dateMatch[2]) : parseInt(dateMatch[1])
    let year = today.getFullYear()
    if (dateMatch[3]) {
      year = dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])
    }
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  
  return null
}

function findProjectMatch(text: string, projectNames: string[]): string | null {
  const lowerText = text.toLowerCase()
  for (const name of projectNames) {
    if (lowerText.includes(name.toLowerCase())) {
      return name
    }
  }
  return null
}

function extractTitle(text: string, projectName: string | null): string {
  let result = text
    .replace(/\b(by|on|due|for)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  if (projectName) {
    const regex = new RegExp(projectName, 'gi')
    result = result.replace(regex, '').replace(/\s+/g, ' ').trim()
  }
  
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const slackUserId = params.get('user_id')
    const slackTeamId = params.get('team_id')
    const commandText = params.get('text')?.trim() || ''

    if (!slackUserId || !slackTeamId) {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: 'Invalid request'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: connection } = await supabase
      .from('slack_connections')
      .select('user_id')
      .eq('slack_user_id', slackUserId)
      .eq('slack_team_id', slackTeamId)
      .single()

    if (!connection) {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: 'Your Slack is not connected to Trackli. Go to Settings > Integrations.'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId = connection.user_id
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone, date_format')
      .eq('id', userId)
      .single()
    
    const timezone = profile?.timezone || 'America/New_York'
    
    // Determine date format - if 'auto' or not set, infer from timezone
    let dateFormat = profile?.date_format
    if (!dateFormat || dateFormat === 'auto') {
      // US timezones use MM/DD/YYYY, others use DD/MM/YYYY
      const usTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu']
      dateFormat = usTimezones.some(tz => timezone.startsWith('America/') || timezone.startsWith('Pacific/')) ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
    }
    const today = getTodayInTimezone(timezone)
    const lowerText = commandText.toLowerCase()

    // Debug logging removed for production

    if (lowerText === 'help' || lowerText === '') {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: '*Trackli Commands*\n\n• `/trackli Buy milk Friday` - Create task\n• `/trackli today` - My Day tasks\n• `/trackli summary` - Overview'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get projects for both queries and task creation
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', userId)
      .eq('archived', false)

    const projectIds = projects?.map(p => p.id) || []
    const projectNames = projects?.map(p => p.name) || []

    if (lowerText === 'today' || lowerText === 'my day') {
      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select('title, due_date, critical, my_day_date')
        .eq('my_day_date', today)
        .neq('status', 'done')
        .in('project_id', projectIds)

      let msg = `*My Day - ${formatDateForDisplay(today, dateFormat)}*\n\n`
      if (!tasks || tasks.length === 0) {
        msg += 'No tasks for today.'
      } else {
        tasks.forEach((t, i) => {
          const due = t.due_date ? ` (due ${formatDateForDisplay(t.due_date, dateFormat)})` : ''
          msg += `${i + 1}. ${t.title}${due}${t.critical ? ' 🔴' : ''}\n`
        })
      }

      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: msg
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (lowerText === 'summary') {
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('due_date, critical, my_day_date')
        .in('project_id', projectIds)
        .neq('status', 'done')

      const overdue = allTasks?.filter(t => t.due_date && t.due_date < today).length || 0
      const dueToday = allTasks?.filter(t => t.due_date === today).length || 0
      const myDay = allTasks?.filter(t => t.my_day_date === today).length || 0
      const critical = allTasks?.filter(t => t.critical).length || 0

      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `*Summary*\n\n• Overdue: ${overdue}\n• Due Today: ${dueToday}\n• My Day: ${myDay}\n• Critical: ${critical}`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Create task
    const dueDate = parseSimpleDate(commandText, dateFormat)
    const matchedProjectName = findProjectMatch(commandText, projectNames)
    const matchedProject = matchedProjectName ? projects?.find(p => p.name.toLowerCase() === matchedProjectName.toLowerCase()) : null
    const title = extractTitle(commandText, matchedProjectName) || commandText.slice(0, 100)

    // If project matched, create real task; otherwise create pending task
    if (matchedProject) {
      const { error } = await supabase
        .from('tasks')
        .insert({
          title: title,
          due_date: dueDate,
          project_id: matchedProject.id,
          status: 'todo',
          energy_level: 'medium'
        })

      if (error) {
        console.error('Insert error:', error)
        return new Response(JSON.stringify({
          response_type: 'ephemeral',
          text: 'Could not create task. Please try again.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const dueStr = dueDate ? ` (due ${formatDateForDisplay(dueDate, dateFormat)})` : ''
      
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `✅ Task created:\n\n• ${title}${dueStr}\n📁 Project: ${matchedProject.name}`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } else {
      // No project matched - create pending task
      const { error } = await supabase
        .from('pending_tasks')
        .insert({
          user_id: userId,
          title: title,
          due_date: dueDate,
          project_id: null,
          source: 'slack',
          status: 'pending'
        })

      if (error) {
        console.error('Insert error:', error)
        return new Response(JSON.stringify({
          response_type: 'ephemeral',
          text: 'Could not create task. Please try again.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const dueStr = dueDate ? ` (due ${formatDateForDisplay(dueDate, dateFormat)})` : ''
      
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `⏳ Pending task created:\n\n• ${title}${dueStr}\n⚠️ No project matched - please review in Trackli`
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: 'An error occurred. Please try again.'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
