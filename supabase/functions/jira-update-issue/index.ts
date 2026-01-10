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
    const { issueKey, targetStatus, taskId } = body

    if (!issueKey || !targetStatus) {
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

    // Map Trackli status to Jira status category
    const targetCategory = mapTrackliStatusToJiraCategory(targetStatus)

    // Get available transitions for the issue
    const transitionsResult = await getAvailableTransitions(accessToken, connection.site_id, issueKey)

    if (!transitionsResult.success) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Jira transitions', details: transitionsResult.error }),
        { status: transitionsResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find a transition that leads to the target status category
    const targetTransition = findTransitionForCategory(transitionsResult.transitions, targetCategory)

    if (!targetTransition) {
      // No transition available - this might mean the issue is already in the right state
      // or there's no valid path to the target status
      console.log(`No transition found for ${issueKey} to category ${targetCategory}`)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No transition needed or available',
          issueKey,
          targetCategory,
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
 * Find a transition that leads to the target status category
 */
function findTransitionForCategory(transitions: any[], targetCategory: string): any | null {
  // Priority order for finding transitions:
  // 1. Exact category match
  // 2. Status name contains relevant keywords

  // First, try exact category match
  const exactMatch = transitions.find(
    t => t.to?.statusCategory?.key === targetCategory
  )
  if (exactMatch) return exactMatch

  // If no exact match, try keyword matching
  const keywords: Record<string, string[]> = {
    'new': ['backlog', 'to do', 'todo', 'open', 'new'],
    'indeterminate': ['in progress', 'in review', 'working', 'started', 'active'],
    'done': ['done', 'complete', 'closed', 'resolved', 'finished'],
  }

  const targetKeywords = keywords[targetCategory] || []
  const keywordMatch = transitions.find(t => {
    const statusName = t.to?.name?.toLowerCase() || ''
    return targetKeywords.some(kw => statusName.includes(kw))
  })

  return keywordMatch || null
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
