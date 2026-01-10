import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Jira Test Fetch
 *
 * Fetches issues assigned to the current user from Jira.
 * Used to test the connection and verify token validity.
 * Automatically refreshes expired tokens.
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
        JSON.stringify({ error: 'No Atlassian connection found', details: connError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if token is expired and needs refresh
    const tokenExpiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    const bufferMinutes = 5 // Refresh 5 minutes before expiry

    let accessToken: string

    if (tokenExpiresAt.getTime() - now.getTime() < bufferMinutes * 60 * 1000) {
      console.log('Token expired or expiring soon, refreshing...')

      // Token is expired or expiring soon, need to refresh
      const refreshResult = await refreshToken(supabase, user.id, connection.id, authHeader)

      if (!refreshResult.success) {
        return new Response(
          JSON.stringify({
            error: 'Token expired and refresh failed. Please reconnect Atlassian.',
            details: refreshResult.error,
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      accessToken = refreshResult.accessToken!
    } else {
      // Token is still valid, get it from Vault
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('get_vault_secret', { p_id: connection.access_token_secret_id })

      if (tokenError || !tokenData) {
        return new Response(
          JSON.stringify({ error: 'Failed to get access token', details: tokenError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      accessToken = tokenData
    }

    // Fetch issues assigned to user from Jira
    const jiraResult = await fetchJiraIssues(accessToken, connection.site_id)

    if (!jiraResult.success) {
      // If 401, token might have been revoked - suggest reconnecting
      if (jiraResult.status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Jira access denied. Token may have been revoked. Please reconnect Atlassian.',
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Jira API error', details: jiraResult.error }),
        { status: jiraResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        connection: {
          site: connection.site_name || connection.site_url,
          email: connection.atlassian_email,
        },
        totalIssues: jiraResult.total,
        issues: jiraResult.issues,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Refresh the access token using the refresh token
 */
async function refreshToken(
  supabase: any,
  userId: string,
  connectionId: string,
  authHeader: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const clientId = Deno.env.get('ATLASSIAN_CLIENT_ID')
  const clientSecret = Deno.env.get('ATLASSIAN_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return { success: false, error: 'Missing Atlassian credentials' }
  }

  // Get connection with refresh token
  const { data: connection, error: connError } = await supabase
    .from('atlassian_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (connError || !connection || !connection.refresh_token_secret_id) {
    return { success: false, error: 'No refresh token available' }
  }

  // Get refresh token from Vault
  const { data: refreshToken, error: refreshError } = await supabase
    .rpc('get_vault_secret', { p_id: connection.refresh_token_secret_id })

  if (refreshError || !refreshToken) {
    return { success: false, error: 'Failed to retrieve refresh token' }
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

    return { success: false, error: tokenData.error_description || 'Token refresh failed' }
  }

  const newAccessToken = tokenData.access_token
  const newRefreshToken = tokenData.refresh_token
  const expiresIn = tokenData.expires_in || 3600
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Delete old access token from Vault
  if (connection.access_token_secret_id) {
    await supabase.rpc('delete_vault_secret', { p_id: connection.access_token_secret_id })
  }

  // Store new access token in Vault
  const accessSecretName = `atlassian_access_${userId}_${connection.site_id}`
  const { data: newAccessSecretId, error: accessVaultError } = await supabase
    .rpc('create_vault_secret', {
      p_secret: newAccessToken,
      p_name: accessSecretName,
    })

  if (accessVaultError) {
    return { success: false, error: 'Failed to store new access token' }
  }

  // If we got a new refresh token, update it too
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
    .eq('id', connectionId)

  // Log success
  await supabase.from('integration_audit_log').insert({
    user_id: userId,
    event_type: 'oauth.token_refreshed',
    provider: 'atlassian',
    site_id: connection.site_id,
    details: { expires_at: newExpiresAt },
    success: true,
  })

  return { success: true, accessToken: newAccessToken }
}

/**
 * Fetch issues from Jira API
 */
async function fetchJiraIssues(
  accessToken: string,
  siteId: string
): Promise<{
  success: boolean;
  total?: number;
  issues?: any[];
  error?: string;
  status?: number;
}> {
  // JQL: assignee = currentUser() AND resolution = Unresolved
  const jql = encodeURIComponent('assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC')
  const fields = 'summary,status,priority,duedate,created,updated,issuetype,project,parent,customfield_10016'

  const jiraResponse = await fetch(
    `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/search?jql=${jql}&fields=${fields}&maxResults=50`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
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
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    statusCategory: issue.fields.status?.statusCategory?.key,
    priority: issue.fields.priority?.name,
    issueType: issue.fields.issuetype?.name,
    project: issue.fields.project?.name,
    projectKey: issue.fields.project?.key,
    dueDate: issue.fields.duedate,
    created: issue.fields.created,
    updated: issue.fields.updated,
    parentKey: issue.fields.parent?.key,
    storyPoints: issue.fields.customfield_10016,
  })) || []

  return {
    success: true,
    total: jiraData.total,
    issues,
  }
}
