import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-atlassian-webhook-identifier',
}

/**
 * Jira Webhook Handler
 *
 * Receives real-time events from Jira and syncs to Trackli.
 * Events: jira:issue_created, jira:issue_updated, jira:issue_deleted
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Get raw body
    const rawBody = await req.text()
    const payload = JSON.parse(rawBody)

    // Initialize Supabase client (service role for cross-user access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Extract webhook info
    const webhookEvent = payload.webhookEvent
    const issue = payload.issue
    const sprint = payload.sprint
    const changelog = payload.changelog

    console.log(`Webhook received: ${webhookEvent} for ${issue?.key || sprint?.name || 'unknown'}`)
    console.log(`issue.self: ${issue?.self || 'undefined'}`)
    console.log(`payload.baseUrl: ${payload.baseUrl || 'undefined'}`)

    // Handle sprint events separately (they don't have issue data)
    if (webhookEvent === 'sprint_started' || webhookEvent === 'sprint_closed') {
      return await handleSprintEvent(supabase, payload, webhookEvent, startTime)
    }

    // Validate required fields for issue events
    if (!webhookEvent || !issue) {
      console.log('Invalid webhook payload - missing required fields')
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract site ID from the issue self URL or baseUrl
    let siteId: string | null = null
    const selfUrl = issue.self || ''

    // Try API gateway format: api.atlassian.com/ex/jira/{siteId}/...
    if (selfUrl.includes('api.atlassian.com/ex/jira/')) {
      const match = selfUrl.match(/api\.atlassian\.com\/ex\/jira\/([^/]+)/)
      siteId = match ? match[1] : null
    }

    // Try direct Atlassian URL format: https://{site}.atlassian.net/...
    if (!siteId && selfUrl.includes('.atlassian.net')) {
      const match = selfUrl.match(/https:\/\/([^/]+\.atlassian\.net)/)
      if (match) {
        const siteUrl = match[0] // e.g., https://spicymango.atlassian.net
        console.log(`Looking up site by URL: ${siteUrl}`)
        
        const { data: connectionByUrl, error: urlError } = await supabase
          .from('atlassian_connections')
          .select('site_id, site_url')
          .eq('site_url', siteUrl)
          .limit(1)
          .single()

        console.log(`Lookup result: ${JSON.stringify(connectionByUrl)}, error: ${urlError?.message || 'none'}`)
        if (connectionByUrl) {
          siteId = connectionByUrl.site_id
        }
      }
    }

    // Also try to get from baseUrl in webhook if available
    if (!siteId && payload.baseUrl) {
      const baseUrl = payload.baseUrl
      console.log(`Looking up site by baseUrl: ${baseUrl}`)
      const { data: connectionByUrl, error: urlError } = await supabase
        .from('atlassian_connections')
        .select('site_id, site_url')
        .eq('site_url', baseUrl)
        .limit(1)
        .single()

      console.log(`Lookup result: ${JSON.stringify(connectionByUrl)}, error: ${urlError?.message || 'none'}`)
      if (connectionByUrl) {
        siteId = connectionByUrl.site_id
      }
    }

    if (!siteId) {
      console.log('Could not determine Jira site ID from webhook')
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: 'unknown_site' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get assignee accountId
    const assigneeAccountId = issue.fields?.assignee?.accountId || null

    if (!assigneeAccountId) {
      console.log(`Issue ${issue.key} has no assignee, skipping`)
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: 'no_assignee' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find Trackli user with this Atlassian connection
    const { data: connection, error: connError } = await supabase
      .from('atlassian_connections')
      .select('*')
      .eq('site_id', siteId)
      .eq('atlassian_account_id', assigneeAccountId)
      .single()

    if (connError || !connection) {
      console.log(`No Trackli user found for assignee ${assigneeAccountId} on site ${siteId}`)
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: 'user_not_found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = connection.user_id

    // Check if this project is enabled for sync
    const projectKey = issue.fields?.project?.key
    const { data: enabledProjects } = await supabase
      .from('jira_project_sync')
      .select('*')
      .eq('user_id', userId)
      .eq('jira_project_key', projectKey)
      .eq('sync_enabled', true)

    if (!enabledProjects || enabledProjects.length === 0) {
      console.log(`Project ${projectKey} not enabled for sync, skipping`)
      return new Response(
        JSON.stringify({ received: true, processed: false, reason: 'project_not_enabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle the event
    let result: { action: string; taskId?: string; error?: string }

    switch (webhookEvent) {
      case 'jira:issue_created':
        result = await handleIssueCreated(supabase, userId, connection, issue)
        break

      case 'jira:issue_updated':
        result = await handleIssueUpdated(supabase, userId, connection, issue, changelog)
        break

      case 'jira:issue_deleted':
        result = await handleIssueDeleted(supabase, userId, issue)
        break

      default:
        console.log(`Unhandled webhook event: ${webhookEvent}`)
        result = { action: 'ignored', error: `Unhandled event: ${webhookEvent}` }
    }

    // Log to audit
    await supabase.from('integration_audit_log').insert({
      user_id: userId,
      event_type: `jira.webhook.${webhookEvent.replace('jira:', '')}`,
      provider: 'atlassian',
      site_id: siteId,
      details: {
        issue_key: issue.key,
        action: result.action,
        task_id: result.taskId,
        error: result.error,
        processing_time_ms: Date.now() - startTime,
      },
      success: !result.error,
    })

    return new Response(
      JSON.stringify({
        received: true,
        processed: true,
        event: webhookEvent,
        issue: issue.key,
        action: result.action,
        taskId: result.taskId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook processing error:', error)

    // Return 200 to prevent Jira from retrying on our errors
    return new Response(
      JSON.stringify({
        received: true,
        processed: false,
        error: error.message,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Handle issue created event - create new Trackli task
 */
async function handleIssueCreated(
  supabase: any,
  userId: string,
  connection: any,
  issue: any
): Promise<{ action: string; taskId?: string; error?: string }> {
  try {
    // Check if task already exists (idempotency)
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('jira_issue_key', issue.key)
      .eq('jira_site_id', connection.site_id)
      .single()

    if (existing) {
      return { action: 'already_exists', taskId: existing.id }
    }

    // Get project info from issue
    const jiraProjectKey = issue.fields?.project?.key || ''
    const jiraProjectName = issue.fields?.project?.name || ''

    // Get or create Trackli project for this Jira project
    const trackliProject = await getOrCreateProjectForJiraProject(
      supabase, userId, jiraProjectKey, jiraProjectName
    )

    // Get or create jira tag for the project
    const jiraTagId = await getOrCreateJiraTag(supabase, trackliProject.id)

    // Build task from issue
    const newTask = buildTaskFromIssue(issue, userId, trackliProject.id, connection.site_id, connection.site_url)

    const { data: inserted, error: insertError } = await supabase
      .from('tasks')
      .insert(newTask)
      .select('id')
      .single()

    if (insertError) {
      return { action: 'create_failed', error: insertError.message }
    }

    // Add jira tag to the new task
    if (jiraTagId && inserted?.id) {
      await addTagToTask(supabase, inserted.id, jiraTagId)
    }

    console.log(`Created task ${inserted.id} for ${issue.key}`)
    return { action: 'created', taskId: inserted.id }

  } catch (err) {
    return { action: 'create_failed', error: err.message }
  }
}

/**
 * Handle issue updated event - update existing Trackli task
 */
async function handleIssueUpdated(
  supabase: any,
  userId: string,
  connection: any,
  issue: any,
  changelog: any
): Promise<{ action: string; taskId?: string; error?: string }> {
  try {
    // Find existing task
    const { data: existing, error: findError } = await supabase
      .from('tasks')
      .select('id, status, jira_status, title, due_date, start_date, critical, updated_at')
      .eq('jira_issue_key', issue.key)
      .eq('jira_site_id', connection.site_id)
      .single()

    if (findError || !existing) {
      // Task doesn't exist - create it
      console.log(`Task for ${issue.key} not found, creating...`)
      return await handleIssueCreated(supabase, userId, connection, issue)
    }

    // Check if this is a reassignment away from this user
    const assigneeChanged = changelog?.items?.some(
      (item: any) => item.field === 'assignee'
    )

    const currentAssignee = issue.fields?.assignee?.accountId
    if (assigneeChanged && currentAssignee !== connection.atlassian_account_id) {
      console.log(`Issue ${issue.key} reassigned away from user, marking inactive`)
      await supabase
        .from('tasks')
        .update({
          jira_sync_status: 'unassigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return { action: 'marked_unassigned', taskId: existing.id }
    }

    // Build updates from issue fields
    const updates = buildTaskUpdates(issue, existing)

    if (Object.keys(updates).length === 0) {
      return { action: 'no_changes', taskId: existing.id }
    }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateError) {
      return { action: 'update_failed', taskId: existing.id, error: updateError.message }
    }

    console.log(`Updated task ${existing.id} for ${issue.key}: ${Object.keys(updates).join(', ')}`)
    return { action: 'updated', taskId: existing.id }

  } catch (err) {
    return { action: 'update_failed', error: err.message }
  }
}

/**
 * Handle issue deleted event
 */
async function handleIssueDeleted(
  supabase: any,
  userId: string,
  issue: any
): Promise<{ action: string; taskId?: string; error?: string }> {
  try {
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('jira_issue_key', issue.key)
      .single()

    if (!existing) {
      return { action: 'not_found' }
    }

    // Mark as deleted rather than actually deleting
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        jira_sync_status: 'deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateError) {
      return { action: 'delete_failed', taskId: existing.id, error: updateError.message }
    }

    console.log(`Marked task ${existing.id} as deleted for ${issue.key}`)
    return { action: 'marked_deleted', taskId: existing.id }

  } catch (err) {
    return { action: 'delete_failed', error: err.message }
  }
}

/**
 * Get or create a Trackli project for a specific Jira project
 */
async function getOrCreateProjectForJiraProject(
  supabase: any,
  userId: string,
  jiraProjectKey: string,
  jiraProjectName: string
): Promise<{ id: string }> {
  const projectName = jiraProjectName || jiraProjectKey

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('name', projectName)
    .single()

  if (existing) return existing

  const { data: newProject } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: projectName,
      color: '#0052CC',
    })
    .select('id')
    .single()

  return newProject || { id: '' }
}

/**
 * Get or create a "jira" tag for the project
 */
async function getOrCreateJiraTag(
  supabase: any,
  projectId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('project_tags')
    .select('id')
    .eq('project_id', projectId)
    .eq('name', 'Jira')
    .single()

  if (existing) return existing.id

  const { data: newTag, error } = await supabase
    .from('project_tags')
    .insert({ project_id: projectId, name: 'Jira' })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create jira tag:', error)
    return null
  }

  return newTag?.id || null
}

/**
 * Add a tag to a task (idempotent)
 */
async function addTagToTask(
  supabase: any,
  taskId: string,
  tagId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('task_tags')
    .select('task_id')
    .eq('task_id', taskId)
    .eq('tag_id', tagId)
    .single()

  if (existing) return

  await supabase
    .from('task_tags')
    .insert({ task_id: taskId, tag_id: tagId })
}

/**
 * Map Jira status to Trackli status
 */
function mapStatusToTrackli(statusName: string, statusCategory: string): string {
  const lowerName = (statusName || '').toLowerCase()

  // Keyword matching
  if (lowerName.includes('backlog')) return 'backlog'
  if (lowerName.includes('to do') || lowerName.includes('todo') ||
      lowerName.includes('open') || lowerName.includes('ready')) return 'todo'
  if (lowerName.includes('progress') || lowerName.includes('review') ||
      lowerName.includes('test') || lowerName.includes('dev') ||
      lowerName.includes('design')) return 'in_progress'
  if (lowerName.includes('done') || lowerName.includes('closed') ||
      lowerName.includes('complete') || lowerName.includes('resolved')) return 'done'

  // Category fallback
  switch (statusCategory) {
    case 'new': return 'todo'
    case 'indeterminate': return 'in_progress'
    case 'done': return 'done'
    default: return 'backlog'
  }
}

/**
 * Extract plain text from Jira ADF format
 */
function extractDescription(adf: any): string {
  if (!adf || !adf.content) return ''

  const extractText = (nodes: any[]): string => {
    return nodes.map(node => {
      if (node.type === 'text') return node.text || ''
      if (node.content) return extractText(node.content)
      return ''
    }).join('')
  }

  return extractText(adf.content).trim()
}

/**
 * Build a new task from a Jira issue
 */
function buildTaskFromIssue(
  issue: any,
  userId: string,
  projectId: string,
  siteId: string,
  siteUrl: string
): any {
  const fields = issue.fields || {}
  const status = fields.status || {}
  const priority = fields.priority?.name || ''

  const jiraUrl = siteUrl
    ? `${siteUrl}/browse/${issue.key}`
    : `https://atlassian.net/browse/${issue.key}`

  return {
    user_id: userId,
    project_id: projectId,
    title: fields.summary || issue.key,
    description: extractDescription(fields.description) || null,
    status: mapStatusToTrackli(status.name, status.statusCategory?.key),
    critical: priority === 'Highest' || priority === 'Critical',
    due_date: fields.duedate || null,
    start_date: fields.startDate || null,
    source: 'Jira',
    source_link: jiraUrl,
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    jira_project_id: fields.project?.id,
    jira_status: status.name,
    jira_status_category: status.statusCategory?.key,
    jira_sync_status: 'active',
    jira_assigned_at: new Date().toISOString(),
    jira_parent_id: fields.parent?.id || null,
    jira_parent_key: fields.parent?.key || null,
    jira_parent_name: fields.parent?.fields?.summary || null,
    jira_issue_type: fields.issuetype?.name,
    jira_site_id: siteId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Build updates for an existing task
 */
function buildTaskUpdates(
  issue: any,
  existingTask: any
): Record<string, any> {
  const updates: Record<string, any> = {}
  const fields = issue.fields || {}
  const status = fields.status || {}

  // Debug: log all field names to find start date field
  console.log(`All fields in webhook: ${Object.keys(fields).join(', ')}`)

  // Update status if changed
  const newJiraStatus = status.name
  if (existingTask.jira_status !== newJiraStatus) {
    updates.jira_status = newJiraStatus
    updates.jira_status_category = status.statusCategory?.key
    const newStatus = mapStatusToTrackli(newJiraStatus, status.statusCategory?.key)
    updates.status = newStatus
    
    // Set completed_at when moving to done, clear it when moving away
    if (newStatus === 'done') {
      updates.completed_at = new Date().toISOString()
    } else if (existingTask.status === 'done') {
      updates.completed_at = null
    }
  }

  // Update title if changed
  const newTitle = fields.summary
  if (newTitle && existingTask.title !== newTitle) {
    updates.title = newTitle
  }

  // Update due date if changed
  const newDueDate = fields.duedate || null
  if (existingTask.due_date !== newDueDate) {
    updates.due_date = newDueDate
  }

  // Update start date if changed
  // Note: Jira may send this as 'startDate' or in a custom field
  const newStartDate = fields.startDate || fields.customfield_10015 || null
  console.log(`Start date debug: fields.startDate=${fields.startDate}, existing=${existingTask.start_date}, new=${newStartDate}`)
  if (existingTask.start_date !== newStartDate) {
    updates.start_date = newStartDate
  }

  // Update priority/critical if changed
  const priority = fields.priority?.name || ''
  const newCritical = priority === 'Highest' || priority === 'Critical'
  if (existingTask.critical !== newCritical) {
    updates.critical = newCritical
  }

  return updates
}

/**
 * Handle sprint_started or sprint_closed events
 * When a sprint starts, import all issues in that sprint for all connected users
 */
async function handleSprintEvent(
  supabase: any,
  payload: any,
  webhookEvent: string,
  startTime: number
): Promise<Response> {
  const sprint = payload.sprint
  const baseUrl = payload.baseUrl

  console.log(`Sprint event: ${webhookEvent}, sprint: ${sprint?.name || 'unknown'}`)

  if (!sprint?.id) {
    console.log('Sprint event missing sprint data')
    return new Response(
      JSON.stringify({ received: true, processed: false, reason: 'no_sprint_data' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get site ID from baseUrl
  let siteId: string | null = null
  if (baseUrl) {
    const { data: connectionByUrl } = await supabase
      .from('atlassian_connections')
      .select('site_id')
      .eq('site_url', baseUrl)
      .limit(1)
      .single()

    if (connectionByUrl) {
      siteId = connectionByUrl.site_id
    }
  }

  if (!siteId) {
    console.log('Could not determine site ID for sprint event')
    return new Response(
      JSON.stringify({ received: true, processed: false, reason: 'unknown_site' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get all users with connections to this site
  const { data: connections } = await supabase
    .from('atlassian_connections')
    .select('*')
    .eq('site_id', siteId)

  if (!connections || connections.length === 0) {
    console.log('No users connected to this site')
    return new Response(
      JSON.stringify({ received: true, processed: false, reason: 'no_users' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let totalCreated = 0
  let totalUpdated = 0
  const results: any[] = []

  // Process each connected user
  for (const connection of connections) {
    try {
      // Get valid access token
      const accessToken = await getValidToken(supabase, connection)
      if (!accessToken) {
        console.log(`No valid token for user ${connection.user_id}`)
        continue
      }

      // Get user's enabled projects
      const { data: enabledProjects } = await supabase
        .from('jira_project_sync')
        .select('jira_project_key')
        .eq('user_id', connection.user_id)
        .eq('sync_enabled', true)

      if (!enabledProjects || enabledProjects.length === 0) {
        console.log(`No enabled projects for user ${connection.user_id}`)
        continue
      }

      const projectKeys = enabledProjects.map((p: any) => p.jira_project_key)

      // Fetch issues in sprint assigned to this user
      const jql = `sprint = ${sprint.id} AND assignee = currentUser() AND project IN (${projectKeys.join(', ')}) ORDER BY updated DESC`
      const fields = ['summary', 'description', 'status', 'priority', 'duedate', 'startDate', 'issuetype', 'project', 'parent', 'customfield_10016', 'customfield_10015', 'customfield_10020']

      const jiraResponse = await fetch(
        `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/search/jql`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jql, fields, maxResults: 100 }),
        }
      )

      if (!jiraResponse.ok) {
        console.error(`Jira API error for user ${connection.user_id}:`, await jiraResponse.text())
        continue
      }

      const jiraData = await jiraResponse.json()
      console.log(`Found ${jiraData.issues?.length || 0} sprint issues for user ${connection.user_id}`)

      // Process each issue
      for (const issue of jiraData.issues || []) {
        // Check if task exists
        const { data: existing } = await supabase
          .from('tasks')
          .select('id')
          .eq('jira_issue_key', issue.key)
          .eq('jira_site_id', siteId)
          .single()

        if (existing) {
          // Update sprint info on existing task
          const sprintData = extractActiveSprint(issue.fields.customfield_10020)
          await supabase
            .from('tasks')
            .update({
              jira_sprint_id: sprintData?.id || null,
              jira_sprint_name: sprintData?.name || null,
              jira_sprint_state: sprintData?.state || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
          totalUpdated++
        } else {
          // Create new task - get/create project first
          const jiraProjectKey = issue.fields.project?.key
          const jiraProjectName = issue.fields.project?.name
          const trackliProject = await getOrCreateProjectForJiraProject(
            supabase, connection.user_id, jiraProjectKey, jiraProjectName
          )
          const jiraTagId = await getOrCreateJiraTag(supabase, trackliProject.id)

          const newTask = buildTaskFromIssue(issue, connection.user_id, trackliProject.id, siteId, connection.site_url)
          
          // Add sprint info
          const sprintData = extractActiveSprint(issue.fields.customfield_10020)
          newTask.jira_sprint_id = sprintData?.id || null
          newTask.jira_sprint_name = sprintData?.name || null
          newTask.jira_sprint_state = sprintData?.state || null

          const { data: inserted, error: insertError } = await supabase
            .from('tasks')
            .insert(newTask)
            .select('id')
            .single()

          if (!insertError && inserted?.id && jiraTagId) {
            await addTagToTask(supabase, inserted.id, jiraTagId)
          }
          totalCreated++
        }
      }

      results.push({
        userId: connection.user_id,
        issuesFound: jiraData.issues?.length || 0,
      })

    } catch (err) {
      console.error(`Error processing sprint for user ${connection.user_id}:`, err)
    }
  }

  // Log to audit
  await supabase.from('integration_audit_log').insert({
    user_id: connections[0]?.user_id, // Log under first user
    event_type: `jira.webhook.${webhookEvent}`,
    provider: 'atlassian',
    site_id: siteId,
    details: {
      sprint_id: sprint.id,
      sprint_name: sprint.name,
      users_processed: results.length,
      total_created: totalCreated,
      total_updated: totalUpdated,
      processing_time_ms: Date.now() - startTime,
    },
    success: true,
  })

  return new Response(
    JSON.stringify({
      received: true,
      processed: true,
      event: webhookEvent,
      sprint: sprint.name,
      created: totalCreated,
      updated: totalUpdated,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidToken(supabase: any, connection: any): Promise<string | null> {
  const tokenExpiresAt = new Date(connection.token_expires_at)
  const now = new Date()
  const bufferMinutes = 5

  // If token is still valid, get it from Vault
  if (tokenExpiresAt.getTime() - now.getTime() >= bufferMinutes * 60 * 1000) {
    const { data: tokenData } = await supabase
      .rpc('get_vault_secret', { p_id: connection.access_token_secret_id })
    return tokenData || null
  }

  // Token expired - would need refresh, but for webhook we'll skip
  console.log('Token expired for sprint sync, skipping user')
  return null
}

/**
 * Extract the active sprint from Jira sprint field
 */
function extractActiveSprint(sprints: any[]): { id: string; name: string; state: string } | null {
  if (!sprints || !Array.isArray(sprints) || sprints.length === 0) return null

  const activeSprint = sprints.find(s => s.state === 'active')
  if (activeSprint) {
    return { id: String(activeSprint.id), name: activeSprint.name, state: activeSprint.state }
  }

  const futureSprint = sprints.find(s => s.state === 'future')
  if (futureSprint) {
    return { id: String(futureSprint.id), name: futureSprint.name, state: futureSprint.state }
  }

  const lastSprint = sprints[sprints.length - 1]
  return { id: String(lastSprint.id), name: lastSprint.name, state: lastSprint.state }
}
