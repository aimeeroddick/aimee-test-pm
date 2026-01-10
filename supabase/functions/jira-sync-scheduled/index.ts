import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Jira Sync Scheduled
 *
 * Runs as a cron job to sync Jira issues for all users with active connections.
 * This function is called by pg_cron, not by users directly.
 *
 * Expected to run every 15 minutes via Supabase cron.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Verify this is an authorized cron call
  // In production, you'd verify a secret header or use Supabase's built-in cron
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')

  // Allow service role or cron secret
  const isServiceRole = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
  const isCronCall = cronSecret && req.headers.get('X-Cron-Secret') === cronSecret

  if (!isServiceRole && !isCronCall) {
    // Also allow calls from Supabase's internal cron (no auth header but from internal network)
    const isInternalCall = req.headers.get('X-Supabase-Cron') === 'true'
    if (!isInternalCall) {
      console.log('Unauthorized cron call attempt')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('Starting scheduled Jira sync...')

    // Get all active Atlassian connections (those with valid tokens)
    const { data: connections, error: connError } = await supabase
      .from('atlassian_connections')
      .select('*')
      .not('access_token_secret_id', 'is', null)

    if (connError) {
      console.error('Error fetching connections:', connError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch connections', details: connError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!connections || connections.length === 0) {
      console.log('No active connections to sync')
      return new Response(
        JSON.stringify({ success: true, message: 'No active connections', synced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${connections.length} active connections to sync`)

    const results = []

    // Process each connection
    for (const connection of connections) {
      try {
        console.log(`Syncing connection ${connection.id} for user ${connection.user_id}...`)

        // Get enabled projects for this user
        const { data: enabledProjects } = await supabase
          .from('jira_project_sync')
          .select('*')
          .eq('user_id', connection.user_id)
          .eq('sync_enabled', true)

        if (!enabledProjects || enabledProjects.length === 0) {
          console.log(`No enabled projects for connection ${connection.id}, skipping`)
          results.push({
            connectionId: connection.id,
            userId: connection.user_id,
            site: connection.site_name,
            success: true,
            skipped: true,
            reason: 'No enabled projects',
          })
          continue
        }

        // Get valid access token (refresh if needed)
        const accessToken = await getValidToken(supabase, connection)
        if (!accessToken) {
          console.error(`Failed to get valid token for connection ${connection.id}`)
          results.push({
            connectionId: connection.id,
            userId: connection.user_id,
            site: connection.site_name,
            success: false,
            error: 'Token refresh failed',
          })

          // Update connection with error
          await supabase
            .from('atlassian_connections')
            .update({
              sync_error: 'Token refresh failed - reconnection required',
              updated_at: new Date().toISOString(),
            })
            .eq('id', connection.id)

          continue
        }

        // Build project keys filter
        const projectKeys = enabledProjects.map(p => p.jira_project_key).join(', ')

        // Fetch issues from Jira
        const jiraResult = await fetchJiraIssues(accessToken, connection.site_id, projectKeys)

        if (!jiraResult.success) {
          console.error(`Jira API error for connection ${connection.id}:`, jiraResult.error)
          results.push({
            connectionId: connection.id,
            userId: connection.user_id,
            site: connection.site_name,
            success: false,
            error: jiraResult.error,
          })

          await supabase
            .from('atlassian_connections')
            .update({
              sync_error: jiraResult.error,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connection.id)

          continue
        }

        // Cache for Trackli project and tag lookups (per Jira project)
        const projectCache = new Map<string, { projectId: string; tagId: string | null }>()

        // Get all existing Jira tasks for this user
        const { data: existingTasks } = await supabase
          .from('tasks')
          .select('id, jira_issue_key, jira_status, status, title, description, due_date, start_date, critical, energy_level, time_estimate, jira_tshirt_size, jira_sprint_id, comments, updated_at, project_id')
          .eq('user_id', connection.user_id)
          .not('jira_issue_key', 'is', null)

        const existingByKey = new Map(
          (existingTasks || []).map(t => [t.jira_issue_key, t])
        )

        let created = 0
        let updated = 0

        // Process each issue
        for (const issue of jiraResult.issues || []) {
          // Get or create Trackli project for this Jira project (cached)
          let projectData = projectCache.get(issue.projectKey)
          if (!projectData) {
            const trackliProject = await getOrCreateProjectForJiraProject(
              supabase, connection.user_id, issue.projectKey, issue.projectName
            )
            const jiraTagId = await getOrCreateJiraTag(supabase, trackliProject.id)
            projectData = { projectId: trackliProject.id, tagId: jiraTagId }
            projectCache.set(issue.projectKey, projectData)
          }

          const existing = existingByKey.get(issue.key)

          if (existing) {
            // Build updates for all changed fields
            const updates = buildTaskUpdates(issue, existing)
            
            // Check if project changed
            if (existing.project_id !== projectData.projectId) {
              updates.project_id = projectData.projectId
            }
            
            if (Object.keys(updates).length > 0) {
              const { error: updateError } = await supabase
                .from('tasks')
                .update({
                  ...updates,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)

              if (!updateError) {
                if (projectData.tagId) {
                  await addTagToTask(supabase, existing.id, projectData.tagId)
                }
                updated++
              }
            } else {
              // Ensure tag exists even if no changes
              if (projectData.tagId) {
                await addTagToTask(supabase, existing.id, projectData.tagId)
              }
            }
          } else {
            // Create new task
            const newTask = buildNewTask(issue, connection.user_id, projectData.projectId, connection.site_id, connection.site_url)
            const { data: inserted, error: insertError } = await supabase
              .from('tasks')
              .insert(newTask)
              .select('id')
              .single()

            if (!insertError && inserted?.id) {
              if (projectData.tagId) {
                await addTagToTask(supabase, inserted.id, projectData.tagId)
              }
              created++
            }
          }
        }

        // Update last_sync_at
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
          user_id: connection.user_id,
          event_type: 'jira.scheduled_sync_completed',
          provider: 'atlassian',
          site_id: connection.site_id,
          details: {
            projects: projectKeys,
            totalIssues: jiraResult.issues?.length || 0,
            created,
            updated,
          },
          success: true,
        })

        results.push({
          connectionId: connection.id,
          userId: connection.user_id,
          site: connection.site_name,
          success: true,
          totalFetched: jiraResult.issues?.length || 0,
          created,
          updated,
        })

        console.log(`Synced connection ${connection.id}: ${created} created, ${updated} updated`)

      } catch (err) {
        console.error(`Error syncing connection ${connection.id}:`, err)
        results.push({
          connectionId: connection.id,
          userId: connection.user_id,
          site: connection.site_name,
          success: false,
          error: err.message,
        })
      }
    }

    const successCount = results.filter(r => r.success && !r.skipped).length
    const failCount = results.filter(r => !r.success).length
    const skippedCount = results.filter(r => r.skipped).length

    console.log(`Scheduled sync complete: ${successCount} synced, ${failCount} failed, ${skippedCount} skipped`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount} connections`,
        total: connections.length,
        synced: successCount,
        failed: failCount,
        skipped: skippedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Scheduled sync error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

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

    if (tokenData) {
      return tokenData
    }
  }

  // Token expired, refresh it
  console.log(`Refreshing token for connection ${connection.id}...`)

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
      user_id: connection.user_id,
      event_type: 'oauth.token_refresh_failed',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: { error: tokenData.error || 'unknown', source: 'scheduled_sync' },
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

  const accessSecretName = `atlassian_access_${connection.user_id}_${connection.site_id}`
  const { data: newAccessSecretId } = await supabase
    .rpc('create_vault_secret', {
      p_secret: newAccessToken,
      p_name: accessSecretName,
    })

  // Update refresh token if we got a new one
  let newRefreshSecretId = connection.refresh_token_secret_id
  if (newRefreshToken && newRefreshToken !== refreshToken) {
    await supabase.rpc('delete_vault_secret', { p_id: connection.refresh_token_secret_id })

    const refreshSecretName = `atlassian_refresh_${connection.user_id}_${connection.site_id}`
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
    user_id: connection.user_id,
    event_type: 'oauth.token_refreshed',
    provider: 'atlassian',
    site_id: connection.site_id,
    details: { expires_at: newExpiresAt, source: 'scheduled_sync' },
    success: true,
  })

  return newAccessToken
}

/**
 * Fetch issues from Jira API
 * Note: Uses /rest/api/3/search/jql (the old /rest/api/3/search endpoint is deprecated and returns 410)
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
  const jql = `project IN (${projectKeys}) AND assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC`
  const fields = ['summary', 'description', 'status', 'priority', 'duedate', 'startDate', 'created', 'updated', 'issuetype', 'project', 'parent', 'assignee', 'customfield_10015', 'customfield_10020', 'comment']

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
    startDate: issue.fields.startDate || issue.fields.customfield_10015,
    parentId: issue.fields.parent?.id,
    parentKey: issue.fields.parent?.key,
    parentName: issue.fields.parent?.fields?.summary,
    sprint: extractActiveSprint(issue.fields.customfield_10020),
    storyPoints: issue.fields.customfield_10016,
    comments: extractComments(issue.fields.comment?.comments),
  })) || []

  return { success: true, issues }
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
 * Map Jira T-Shirt Size to Trackli effort and time estimate
 * Per PRD: XS=30m/Low, S=1h/Low, M=2h/Medium, L=4h/High, XL=8h/High
 */
function mapTshirtSize(storyPoints: any): { energy_level: string; time_estimate: number; jira_tshirt_size: string | null } {
  const size = String(storyPoints || '').toUpperCase().trim()
  
  switch (size) {
    case 'XS':
    case '1':
      return { energy_level: 'low', time_estimate: 30, jira_tshirt_size: 'XS' }
    case 'S':
    case '2':
      return { energy_level: 'low', time_estimate: 60, jira_tshirt_size: 'S' }
    case 'M':
    case '3':
    case '5':
      return { energy_level: 'medium', time_estimate: 120, jira_tshirt_size: 'M' }
    case 'L':
    case '8':
      return { energy_level: 'high', time_estimate: 240, jira_tshirt_size: 'L' }
    case 'XL':
    case '13':
    case '21':
      return { energy_level: 'high', time_estimate: 480, jira_tshirt_size: 'XL' }
    default:
      return { energy_level: 'medium', time_estimate: 0, jira_tshirt_size: size || null }
  }
}

/**
 * Extract comments from Jira format to Trackli format
 */
function extractComments(jiraComments: any[]): any[] {
  if (!jiraComments || !Array.isArray(jiraComments)) return []

  return jiraComments.map(comment => ({
    text: extractDescription(comment.body),
    author: comment.author?.displayName || 'Unknown',
    created_at: comment.created,
    source: 'Jira',
    jira_comment_id: comment.id,
  })).filter(c => c.text) // Only include comments with text
}

/**
 * Extract the active sprint from Jira sprint field
 */
function extractActiveSprint(sprints: any[]): { id: string; name: string; state: string } | null {
  if (!sprints || !Array.isArray(sprints) || sprints.length === 0) return null

  // First look for active sprint
  const activeSprint = sprints.find(s => s.state === 'active')
  if (activeSprint) {
    return {
      id: String(activeSprint.id),
      name: activeSprint.name,
      state: activeSprint.state,
    }
  }

  // Then look for future sprint
  const futureSprint = sprints.find(s => s.state === 'future')
  if (futureSprint) {
    return {
      id: String(futureSprint.id),
      name: futureSprint.name,
      state: futureSprint.state,
    }
  }

  // Fall back to most recent
  const lastSprint = sprints[sprints.length - 1]
  return {
    id: String(lastSprint.id),
    name: lastSprint.name,
    state: lastSprint.state,
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
 * Map Jira status to Trackli status using keyword matching + category fallback
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

  // Layer 2: Category fallback
  switch (statusCategory) {
    case 'new': return 'todo'
    case 'indeterminate': return 'in_progress'
    case 'done': return 'done'
    default: return 'backlog'
  }
}

/**
 * Build a new task from a Jira issue
 */
function buildNewTask(
  issue: any,
  userId: string,
  projectId: string,
  siteId: string,
  siteUrl: string
): any {
  const jiraUrl = siteUrl ? `${siteUrl}/browse/${issue.key}` : `https://atlassian.net/browse/${issue.key}`

  // Map T-shirt size to effort and time estimate
  const sizeMapping = mapTshirtSize(issue.storyPoints)

  return {
    user_id: userId,
    project_id: projectId,
    title: issue.summary,
    description: issue.description || null,
    status: mapStatusToTrackli(issue.status, issue.statusCategory),
    critical: issue.priority === 'Highest' || issue.priority === 'Critical',
    energy_level: sizeMapping.energy_level,
    time_estimate: sizeMapping.time_estimate,
    due_date: issue.dueDate || null,
    start_date: issue.startDate || null,
    comments: issue.comments || [],
    source: 'Jira',
    source_link: jiraUrl,
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    jira_project_id: issue.projectId,
    jira_status: issue.status,
    jira_status_category: issue.statusCategory,
    jira_sync_status: 'active',
    jira_assigned_at: new Date().toISOString(),
    jira_parent_id: issue.parentId || null,
    jira_parent_key: issue.parentKey || null,
    jira_parent_name: issue.parentName || null,
    jira_sprint_id: issue.sprint?.id || null,
    jira_sprint_name: issue.sprint?.name || null,
    jira_sprint_state: issue.sprint?.state || null,
    jira_issue_type: issue.issueType,
    jira_tshirt_size: sizeMapping.jira_tshirt_size,
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

  // Update T-shirt size / effort / time estimate if changed
  const sizeMapping = mapTshirtSize(issue.storyPoints)
  if (existingTask.jira_tshirt_size !== sizeMapping.jira_tshirt_size) {
    updates.jira_tshirt_size = sizeMapping.jira_tshirt_size
    updates.energy_level = sizeMapping.energy_level
    updates.time_estimate = sizeMapping.time_estimate
  }

  // Sync comments - merge Jira comments with existing Trackli comments
  const existingComments = existingTask.comments || []
  const newJiraComments = issue.comments || []
  
  // Get IDs of existing Jira comments
  const existingJiraCommentIds = new Set(
    existingComments
      .filter((c: any) => c.jira_comment_id)
      .map((c: any) => c.jira_comment_id)
  )
  
  // Find new Jira comments that don't exist yet
  const newComments = newJiraComments.filter(
    (c: any) => !existingJiraCommentIds.has(c.jira_comment_id)
  )
  
  if (newComments.length > 0) {
    updates.comments = [...existingComments, ...newComments]
  }

  // Update sprint if changed
  const newSprintId = issue.sprint?.id || null
  if (existingTask.jira_sprint_id !== newSprintId) {
    updates.jira_sprint_id = newSprintId
    updates.jira_sprint_name = issue.sprint?.name || null
    updates.jira_sprint_state = issue.sprint?.state || null
  }

  return updates
}
