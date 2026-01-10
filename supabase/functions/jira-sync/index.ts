import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Jira Sync
 *
 * Imports Jira issues as Trackli tasks.
 * - Fetches unresolved issues from enabled projects
 * - Creates new tasks for new issues
 * - Updates existing tasks if Jira issue changed
 * - Handles token refresh automatically
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's Atlassian connection
    const { data: connection, error: connError } = await supabase
      .from('atlassian_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Atlassian connection found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get enabled projects for sync
    const { data: enabledProjects, error: projectsError } = await supabase
      .from('jira_project_sync')
      .select('*')
      .eq('user_id', user.id)
      .eq('sync_enabled', true)

    if (projectsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to get project sync settings', details: projectsError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!enabledProjects || enabledProjects.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No projects enabled for sync',
          created: 0,
          updated: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if token needs refresh
    const accessToken = await getValidToken(supabase, user.id, connection)
    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: 'Token expired and refresh failed. Please reconnect Atlassian.',
          needsReconnect: true,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build project keys filter for JQL
    const projectKeys = enabledProjects.map(p => p.jira_project_key).join(', ')

    // Fetch issues from Jira
    const jiraResult = await fetchJiraIssues(accessToken, connection.site_id, projectKeys)

    if (!jiraResult.success) {
      // Update connection with error
      await supabase
        .from('atlassian_connections')
        .update({
          sync_error: jiraResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      return new Response(
        JSON.stringify({ error: 'Jira API error', details: jiraResult.error }),
        { status: jiraResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get or create a Trackli project for Jira tasks
    const trackliProject = await getOrCreateJiraProject(supabase, user.id, enabledProjects)

    // Get existing Jira tasks for this user (by jira_issue_key, not project)
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('id, jira_issue_key, jira_status, status, title, description, due_date, start_date, critical, updated_at, project_id')
      .eq('project_id', trackliProject.id)
      .not('jira_issue_key', 'is', null)

    const existingByKey = new Map(
      (existingTasks || []).map(t => [t.jira_issue_key, t])
    )

    let created = 0
    let updated = 0
    const errors: string[] = []

    // Process each Jira issue
    for (const issue of jiraResult.issues || []) {
      try {
        const existing = existingByKey.get(issue.key)

        if (existing) {
          // Update existing task if Jira data changed
          const updates = buildTaskUpdates(issue, existing)
          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from('tasks')
              .update({
                ...updates,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)

            if (updateError) {
              errors.push(`Failed to update ${issue.key}: ${updateError.message}`)
            } else {
              updated++
            }
          }
        } else {
          // Create new task
          const newTask = buildNewTask(issue, user.id, trackliProject.id, connection.site_id, connection.site_url)
          const { error: insertError } = await supabase
            .from('tasks')
            .insert(newTask)

          if (insertError) {
            errors.push(`Failed to create ${issue.key}: ${insertError.message}`)
          } else {
            created++
          }
        }
      } catch (err) {
        errors.push(`Error processing ${issue.key}: ${err.message}`)
      }
    }

    // Update last_sync_at on connection
    await supabase
      .from('atlassian_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    // Log sync event
    await supabase.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'jira.sync_completed',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: {
        projects: projectKeys,
        totalIssues: jiraResult.issues?.length || 0,
        created,
        updated,
        errors: errors.length,
      },
      success: errors.length === 0,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync complete: ${created} created, ${updated} updated`,
        totalFetched: jiraResult.issues?.length || 0,
        created,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Jira sync error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Get a valid access token, refreshing if needed
 */
async function getValidToken(
  supabase: any,
  userId: string,
  connection: any
): Promise<string | null> {
  const tokenExpiresAt = new Date(connection.token_expires_at)
  const now = new Date()
  const bufferMinutes = 5

  // If token is still valid, get it from Vault
  if (tokenExpiresAt.getTime() - now.getTime() >= bufferMinutes * 60 * 1000) {
    const { data: tokenData } = await supabase
      .rpc('get_vault_secret', { p_id: connection.access_token_secret_id })

    if (tokenData) {
      return tokenData
    }
  }

  // Token expired or expiring soon, refresh it
  console.log('Token expired, refreshing...')

  const clientId = Deno.env.get('ATLASSIAN_CLIENT_ID')
  const clientSecret = Deno.env.get('ATLASSIAN_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    console.error('Missing Atlassian credentials')
    return null
  }

  // Get refresh token from Vault
  const { data: refreshToken } = await supabase
    .rpc('get_vault_secret', { p_id: connection.refresh_token_secret_id })

  if (!refreshToken) {
    console.error('No refresh token available')
    return null
  }

  // Call Atlassian token refresh endpoint
  const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error('Token refresh failed:', tokenData)

    await supabase.from('integration_audit_log').insert({
      user_id: userId,
      event_type: 'oauth.token_refresh_failed',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: { error: tokenData.error || 'unknown' },
      success: false,
    })

    return null
  }

  const newAccessToken = tokenData.access_token
  const newRefreshToken = tokenData.refresh_token
  const expiresIn = tokenData.expires_in || 3600
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Delete old access token and store new one
  if (connection.access_token_secret_id) {
    await supabase.rpc('delete_vault_secret', { p_id: connection.access_token_secret_id })
  }

  const accessSecretName = `atlassian_access_${userId}_${connection.site_id}`
  const { data: newAccessSecretId } = await supabase
    .rpc('create_vault_secret', {
      p_secret: newAccessToken,
      p_name: accessSecretName,
    })

  // Update refresh token if we got a new one
  let newRefreshSecretId = connection.refresh_token_secret_id
  if (newRefreshToken && newRefreshToken !== refreshToken) {
    await supabase.rpc('delete_vault_secret', { p_id: connection.refresh_token_secret_id })

    const refreshSecretName = `atlassian_refresh_${userId}_${connection.site_id}`
    const { data: refreshSecretId } = await supabase
      .rpc('create_vault_secret', {
        p_secret: newRefreshToken,
        p_name: refreshSecretName,
      })

    if (refreshSecretId) {
      newRefreshSecretId = refreshSecretId
    }
  }

  // Update connection record
  await supabase
    .from('atlassian_connections')
    .update({
      access_token_secret_id: newAccessSecretId,
      refresh_token_secret_id: newRefreshSecretId,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  await supabase.from('integration_audit_log').insert({
    user_id: userId,
    event_type: 'oauth.token_refreshed',
    provider: 'atlassian',
    site_id: connection.site_id,
    details: { expires_at: newExpiresAt },
    success: true,
  })

  return newAccessToken
}

/**
 * Fetch issues from Jira API
 */
async function fetchJiraIssues(
  accessToken: string,
  siteId: string,
  projectKeys: string
): Promise<{
  success: boolean
  issues?: any[]
  error?: string
  status?: number
}> {
  // JQL: project IN (keys) AND assignee = currentUser() AND resolution = Unresolved
  // Note: Uses /rest/api/3/search/jql (the old /rest/api/3/search endpoint is deprecated and returns 410)
  const jql = `project IN (${projectKeys}) AND assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`
  const fields = ['summary', 'description', 'status', 'priority', 'duedate', 'startDate', 'created', 'updated', 'issuetype', 'project', 'parent', 'customfield_10016']

  const jiraResponse = await fetch(
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/search/jql`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql,
        fields,
        maxResults: 100,
      }),
    }
  )

  if (!jiraResponse.ok) {
    const errorText = await jiraResponse.text()
    console.error('Jira API error:', errorText)
    return {
      success: false,
      error: errorText,
      status: jiraResponse.status,
    }
  }

  const jiraData = await jiraResponse.json()

  const issues = jiraData.issues?.map((issue: any) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    description: extractDescription(issue.fields.description),
    status: issue.fields.status?.name,
    statusCategory: issue.fields.status?.statusCategory?.key,
    priority: issue.fields.priority?.name,
    issueType: issue.fields.issuetype?.name,
    projectId: issue.fields.project?.id,
    projectKey: issue.fields.project?.key,
    projectName: issue.fields.project?.name,
    dueDate: issue.fields.duedate,
    startDate: issue.fields.startDate,
    created: issue.fields.created,
    updated: issue.fields.updated,
    parentId: issue.fields.parent?.id,
    parentKey: issue.fields.parent?.key,
    storyPoints: issue.fields.customfield_10016,
  })) || []

  return {
    success: true,
    issues,
  }
}

/**
 * Extract plain text description from Jira ADF format
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
 * Get or create a default Trackli project for Jira tasks
 */
async function getOrCreateDefaultProject(
  supabase: any,
  userId: string
): Promise<{ id: string }> {
  // First check if there's already a Jira project
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Jira')
    .single()

  if (existing) {
    return existing
  }

  // Create a new project named "Jira"
  const { data: newProject } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: 'Jira',
      color: '#0052CC', // Jira blue
    })
    .select('id')
    .single()

  return newProject || { id: '' }
}

/**
 * Get or create a Trackli project for Jira tasks
 * Uses the first enabled project's name, or creates a generic "Jira" project
 */
async function getOrCreateJiraProject(
  supabase: any,
  userId: string,
  enabledProjects: any[]
): Promise<{ id: string }> {
  // For now, use a single "Jira" project
  // Future: Could create separate projects per Jira project
  return getOrCreateDefaultProject(supabase, userId)
}

/**
 * Map Jira status to Trackli status using keyword matching + category fallback
 *
 * Layer 1: Keyword matching on status name (case-insensitive)
 * Layer 2: Fall back to Jira status category if no keyword match
 */
function mapStatusToTrackli(statusName: string, statusCategory: string): string {
  const lowerName = (statusName || '').toLowerCase()

  // Layer 1: Keyword matching
  if (lowerName.includes('backlog')) return 'backlog'
  if (lowerName.includes('to do') || lowerName.includes('todo') ||
      lowerName.includes('open') || lowerName.includes('ready')) return 'todo'
  if (lowerName.includes('progress') || lowerName.includes('review') ||
      lowerName.includes('test') || lowerName.includes('dev') ||
      lowerName.includes('design')) return 'in_progress'
  if (lowerName.includes('done') || lowerName.includes('closed') ||
      lowerName.includes('complete') || lowerName.includes('resolved')) return 'done'

  // Layer 2: Category fallback (note: 'new' now maps to 'todo' not 'backlog')
  switch (statusCategory) {
    case 'new': return 'todo'
    case 'indeterminate': return 'in_progress'
    case 'done': return 'done'
    default: return 'backlog'
  }
}

/**
 * Build a new task object from a Jira issue
 */
function buildNewTask(
  issue: any,
  userId: string,
  projectId: string,
  siteId: string,
  siteUrl: string
): any {
  // Build proper Jira issue URL using the site URL
  const jiraUrl = siteUrl ? `${siteUrl}/browse/${issue.key}` : `https://atlassian.net/browse/${issue.key}`

  return {
    user_id: userId,
    project_id: projectId,
    title: issue.summary,
    description: issue.description || null,
    status: mapStatusToTrackli(issue.status, issue.statusCategory),
    critical: issue.priority === 'Highest' || issue.priority === 'Critical',
    due_date: issue.dueDate || null,
    start_date: issue.startDate || null,
    source: 'jira',
    source_link: jiraUrl,
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    jira_project_id: issue.projectId,
    jira_status: issue.status,
    jira_status_category: issue.statusCategory,
    jira_sync_status: 'active',
    jira_assigned_at: new Date().toISOString(),
    jira_parent_id: issue.parentId || null,
    jira_issue_type: issue.issueType,
    jira_site_id: siteId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Build updates for an existing task based on Jira changes
 */
function buildTaskUpdates(
  issue: any,
  existingTask: any
): Record<string, any> {
  const updates: Record<string, any> = {}

  // Update status if it changed in Jira
  const newStatus = mapStatusToTrackli(issue.status, issue.statusCategory)
  if (existingTask.jira_status !== issue.status) {
    updates.jira_status = issue.status
    updates.jira_status_category = issue.statusCategory
    updates.status = newStatus
    
    // Set completed_at when moving to done, clear when moving away
    if (newStatus === 'done') {
      updates.completed_at = new Date().toISOString()
    } else if (existingTask.status === 'done') {
      updates.completed_at = null
    }
  }

  // Update title if changed
  if (existingTask.title !== issue.summary) {
    updates.title = issue.summary
  }

  // Update description if changed
  const newDescription = issue.description || null
  if (existingTask.description !== newDescription) {
    updates.description = newDescription
  }

  // Update due date if changed
  const newDueDate = issue.dueDate || null
  if (existingTask.due_date !== newDueDate) {
    updates.due_date = newDueDate
  }

  // Update start date if changed
  const newStartDate = issue.startDate || null
  if (existingTask.start_date !== newStartDate) {
    updates.start_date = newStartDate
  }

  // Update critical flag if priority changed
  const newCritical = issue.priority === 'Highest' || issue.priority === 'Critical'
  if (existingTask.critical !== newCritical) {
    updates.critical = newCritical
  }

  return updates
}
