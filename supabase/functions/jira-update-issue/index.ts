import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Jira Update Issue
 *
 * Updates a Jira issue when a Trackli task changes.
 * Currently supports status transitions (moving issues between columns).
 *
 * Jira uses "transitions" rather than direct status updates, so we:
 * 1. Get available transitions for the issue
 * 2. Find a transition that leads to the desired status category
 * 3. Execute that transition
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
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

    // Parse request body
    const body = await req.json()
    const { issueKey, targetStatus, taskId, updates } = body

    console.log(`jira-update-issue called: issueKey=${issueKey}, targetStatus=${targetStatus}, taskId=${taskId}, updates=${JSON.stringify(updates)}`)

    if (!issueKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: issueKey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Must have either targetStatus or updates
    if (!targetStatus && !updates) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: issueKey, targetStatus' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log(`Connection lookup: found=${!!connection}, error=${connError?.message || 'none'}`)

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Atlassian connection found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get valid access token (refresh if needed)
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

    let statusResult = null
    let fieldResult = null

    // Handle field updates (title, due date, start date, etc.)
    if (updates && Object.keys(updates).length > 0) {
      fieldResult = await updateIssueFields(accessToken, connection.site_id, issueKey, updates)
      if (!fieldResult.success) {
        console.error('Field update failed:', fieldResult.error)
      }
    }

    // If no status change requested, return field update result
    if (!targetStatus) {
      // Log the sync event for field updates
      if (fieldResult) {
        await supabase.from('integration_audit_log').insert({
          user_id: user.id,
          event_type: 'jira.issue_fields_updated',
          provider: 'atlassian',
          site_id: connection.site_id,
          details: {
            issueKey,
            updates,
            success: fieldResult.success,
            error: fieldResult.error,
          },
          success: fieldResult.success,
        })
      }

      return new Response(
        JSON.stringify({
          success: fieldResult?.success ?? true,
          fieldUpdate: {
            success: fieldResult?.success ?? true,
            updatedFields: Object.keys(updates || {}),
            error: fieldResult?.error,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle status transition
      // Map Trackli status to Jira status category

    // Get available transitions for the issue
    const transitionsResult = await getAvailableTransitions(accessToken, connection.site_id, issueKey)

    if (!transitionsResult.success) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Jira transitions', details: transitionsResult.error }),
        { status: transitionsResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find a transition that leads to the target status
    const targetTransition = findTransitionForStatus(transitionsResult.transitions, targetStatus)

    if (!targetTransition) {
      // No transition available - this might mean the issue is already in the right state
      // or there's no valid path to the target status
      console.log(`No transition found for ${issueKey} to status ${targetStatus}`)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No transition needed or available',
          issueKey,
          targetStatus,
          availableTransitions: transitionsResult.transitions.map((t: any) => ({
            name: t.name,
            toStatus: t.to.name,
            toCategory: t.to.statusCategory?.key,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Execute the transition
    const transitionResult = await executeTransition(
      accessToken,
      connection.site_id,
      issueKey,
      targetTransition.id
    )

    if (!transitionResult.success) {
      return new Response(
        JSON.stringify({ error: 'Failed to transition issue', details: transitionResult.error }),
        { status: transitionResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the task's jira_status to reflect the new status
    if (taskId) {
      await supabase
        .from('tasks')
        .update({
          jira_status: targetTransition.to.name,
          jira_status_category: targetTransition.to.statusCategory?.key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
    }

    // Log the sync event
    await supabase.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'jira.issue_transitioned',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: {
        issueKey,
        fromTrackliStatus: targetStatus,
        toJiraStatus: targetTransition.to.name,
        transitionName: targetTransition.name,
      },
      success: true,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: `Transitioned ${issueKey} to ${targetTransition.to.name}`,
        issueKey,
        transition: targetTransition.name,
        newStatus: targetTransition.to.name,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error updating Jira issue:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Map Trackli status to Jira status category
 */
function mapTrackliStatusToJiraCategory(trackliStatus: string): string {
  switch (trackliStatus) {
    case 'backlog':
    case 'todo':
      return 'new'
    case 'in_progress':
      return 'indeterminate'
    case 'done':
      return 'done'
    default:
      return 'new'
  }
}

/**
 * Get available transitions for an issue
 */
async function getAvailableTransitions(
  accessToken: string,
  siteId: string,
  issueKey: string
): Promise<{ success: boolean; transitions?: any[]; error?: string; status?: number }> {
  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue/${issueKey}/transitions`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Failed to get transitions:', errorText)
    return {
      success: false,
      error: errorText,
      status: response.status,
    }
  }

  const data = await response.json()
  return {
    success: true,
    transitions: data.transitions || [],
  }
}

/**
 * Find a transition that leads to the target Trackli status
 * Priority:
 * 1. Exact status name match (case-insensitive)
 * 2. Keyword match based on Trackli status
 * 3. Category fallback
 */
function findTransitionForStatus(transitions: any[], trackliStatus: string): any | null {
  // Define keywords for each Trackli status
  const statusKeywords: Record<string, string[]> = {
    'backlog': ['backlog'],
    'todo': ['to do', 'todo', 'open', 'new', 'ready'],
    'in_progress': ['in progress', 'in review', 'in testing', 'working', 'started', 'active', 'development'],
    'done': ['done', 'complete', 'closed', 'resolved', 'finished'],
  }

  // Define category for fallback
  const statusCategory: Record<string, string> = {
    'backlog': 'new',
    'todo': 'new',
    'in_progress': 'indeterminate',
    'done': 'done',
  }

  const keywords = statusKeywords[trackliStatus] || []
  const category = statusCategory[trackliStatus] || 'new'

  console.log(`Finding transition for trackliStatus=${trackliStatus}, keywords=${keywords.join(',')}, category=${category}`)
  console.log(`Available transitions: ${transitions.map(t => `${t.name} -> ${t.to?.name} (${t.to?.statusCategory?.key})`).join(', ')}`)

  // Priority 1: Exact keyword match on destination status name
  for (const keyword of keywords) {
    const match = transitions.find(t => {
      const statusName = t.to?.name?.toLowerCase() || ''
      return statusName === keyword || statusName.includes(keyword)
    })
    if (match) {
      console.log(`Found keyword match: ${match.name} -> ${match.to?.name}`)
      return match
    }
  }

  // Priority 2: Category fallback (but exclude 'backlog' if we're looking for 'todo')
  const categoryMatch = transitions.find(t => {
    const toCategory = t.to?.statusCategory?.key
    const toName = t.to?.name?.toLowerCase() || ''
    
    // If looking for todo, don't match backlog even though both are 'new' category
    if (trackliStatus === 'todo' && toName.includes('backlog')) {
      return false
    }
    // If looking for backlog, don't match to do
    if (trackliStatus === 'backlog' && (toName.includes('to do') || toName === 'todo')) {
      return false
    }
    
    return toCategory === category
  })

  if (categoryMatch) {
    console.log(`Found category match: ${categoryMatch.name} -> ${categoryMatch.to?.name}`)
    return categoryMatch
  }

  console.log('No transition found')
  return null
}

/**
 * Update issue fields (title, due date, start date)
 */
async function updateIssueFields(
  accessToken: string,
  siteId: string,
  issueKey: string,
  updates: { title?: string; due_date?: string | null; start_date?: string | null }
): Promise<{ success: boolean; error?: string; status?: number }> {
  // Build the fields object for Jira API
  const fields: any = {}

  if (updates.title !== undefined) {
    fields.summary = updates.title
  }

  if (updates.due_date !== undefined) {
    // Jira expects date in YYYY-MM-DD format or null
    fields.duedate = updates.due_date ? updates.due_date.split('T')[0] : null
  }

  if (updates.start_date !== undefined) {
    // Start date might be in a custom field (customfield_10015) or native field
    // Try the native startDate field first
    fields.startDate = updates.start_date ? updates.start_date.split('T')[0] : null
  }

  if (Object.keys(fields).length === 0) {
    return { success: true } // Nothing to update
  }

  console.log(`Updating Jira issue ${issueKey} with fields:`, JSON.stringify(fields))

  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue/${issueKey}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Failed to update issue ${issueKey}:`, response.status, errorText)
    
    // If startDate failed, try with customfield_10015
    if (updates.start_date !== undefined && errorText.includes('startDate')) {
      console.log('Retrying start date with customfield_10015...')
      const retryFields: any = { ...fields }
      delete retryFields.startDate
      retryFields.customfield_10015 = updates.start_date ? updates.start_date.split('T')[0] : null

      const retryResponse = await fetch(
        `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue/${issueKey}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields: retryFields }),
        }
      )

      if (retryResponse.ok) {
        return { success: true }
      }
      const retryError = await retryResponse.text()
      return { success: false, error: retryError, status: retryResponse.status }
    }

    return { success: false, error: errorText, status: response.status }
  }

  return { success: true }
}

/**
 * Execute a transition on an issue
 */
async function executeTransition(
  accessToken: string,
  siteId: string,
  issueKey: string,
  transitionId: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/issue/${issueKey}/transitions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Failed to execute transition:', errorText)
    return {
      success: false,
      error: errorText,
      status: response.status,
    }
  }

  return { success: true }
}

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

  // Token expired, refresh it
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
