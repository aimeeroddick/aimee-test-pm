import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Confluence Complete Task
 *
 * Marks a Confluence inline task as complete when the corresponding
 * Trackli task is moved to "done" status.
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

    // Parse request body
    const body = await req.json()
    const { confluenceTaskId, siteId, status = 'complete' } = body

    if (!confluenceTaskId) {
      return new Response(
        JSON.stringify({ error: 'Missing confluenceTaskId' }),
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

    // Get user's Atlassian connection (use provided siteId or get first connection)
    let connectionQuery = supabase
      .from('atlassian_connections')
      .select('*')
      .eq('user_id', user.id)

    if (siteId) {
      connectionQuery = connectionQuery.eq('site_id', siteId)
    }

    const { data: connection, error: connError } = await connectionQuery.single()

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Atlassian connection found', details: connError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if token is expired and needs refresh
    const tokenExpiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    const bufferMinutes = 5

    let accessToken: string

    if (tokenExpiresAt.getTime() - now.getTime() < bufferMinutes * 60 * 1000) {
      console.log('Token expired or expiring soon, refreshing...')

      const refreshResult = await refreshToken(supabase, user.id, connection.id)

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

    // Update task status in Confluence
    const updateResult = await updateConfluenceTask(
      accessToken,
      connection.site_id,
      confluenceTaskId,
      status
    )

    if (!updateResult.success) {
      if (updateResult.status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Confluence access denied. Token may have been revoked. Please reconnect Atlassian.',
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Log failure
      await supabase.from('integration_audit_log').insert({
        user_id: user.id,
        event_type: 'confluence.task_update_failed',
        provider: 'atlassian',
        site_id: connection.site_id,
        details: {
          confluence_task_id: confluenceTaskId,
          target_status: status,
          error: updateResult.error,
        },
        success: false,
      })

      return new Response(
        JSON.stringify({ error: 'Failed to update Confluence task', details: updateResult.error }),
        { status: updateResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log success
    await supabase.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'confluence.task_completed',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: {
        confluence_task_id: confluenceTaskId,
        status: status,
      },
      success: true,
    })

    return new Response(
      JSON.stringify({
        success: true,
        confluenceTaskId,
        status,
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
  connectionId: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const clientId = Deno.env.get('ATLASSIAN_CLIENT_ID')
  const clientSecret = Deno.env.get('ATLASSIAN_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return { success: false, error: 'Missing Atlassian credentials' }
  }

  const { data: connection, error: connError } = await supabase
    .from('atlassian_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (connError || !connection || !connection.refresh_token_secret_id) {
    return { success: false, error: 'No refresh token available' }
  }

  const { data: refreshTokenValue, error: refreshError } = await supabase
    .rpc('get_vault_secret', { p_id: connection.refresh_token_secret_id })

  if (refreshError || !refreshTokenValue) {
    return { success: false, error: 'Failed to retrieve refresh token' }
  }

  const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
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
  if (newRefreshToken && newRefreshToken !== refreshTokenValue) {
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
 * Update a Confluence task status
 * Uses Confluence REST API v2
 */
async function updateConfluenceTask(
  accessToken: string,
  siteId: string,
  taskId: string,
  status: string
): Promise<{
  success: boolean;
  error?: string;
  status?: number;
}> {
  try {
    // Confluence Tasks API v2 - update task
    const url = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/tasks/${taskId}`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: status, // 'complete' or 'incomplete'
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Confluence Task Update API error:', errorText)
      return {
        success: false,
        error: errorText,
        status: response.status,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('updateConfluenceTask error:', error)
    return { success: false, error: error.message }
  }
}
