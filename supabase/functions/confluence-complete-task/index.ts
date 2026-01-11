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
 * 
 * Note: Our confluenceTaskId is a composite "pageId-localId" format.
 * We need to find the actual task and update it via the page content.
 * The Tasks API v2 uses different IDs than our parsed localId.
 */
async function updateConfluenceTask(
  accessToken: string,
  siteId: string,
  compositeTaskId: string,
  status: string
): Promise<{
  success: boolean;
  error?: string;
  status?: number;
}> {
  try {
    // Parse our composite ID: "pageId-localId"
    const parts = compositeTaskId.split('-')
    if (parts.length < 2) {
      return { success: false, error: 'Invalid task ID format', status: 400 }
    }
    
    const pageId = parts[0]
    const localId = parts.slice(1).join('-') // Handle IDs that might contain dashes
    
    console.log(`Updating Confluence task: pageId=${pageId}, localId=${localId}, status=${status}`)
    
    // First, try the Tasks API with the localId (sometimes works)
    const tasksApiUrl = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/tasks/${localId}`
    
    const tasksApiResponse = await fetch(tasksApiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    
    if (tasksApiResponse.ok) {
      console.log('Task updated via Tasks API')
      return { success: true }
    }
    
    console.log(`Tasks API returned ${tasksApiResponse.status}, trying page content approach...`)
    
    // Fallback: Update task by modifying page content
    // Get current page content
    const pageUrl = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/pages/${pageId}?body-format=storage`
    
    const pageResponse = await fetch(pageUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })
    
    if (!pageResponse.ok) {
      const errorText = await pageResponse.text()
      console.error('Failed to fetch page:', errorText)
      return { success: false, error: `Failed to fetch page: ${errorText}`, status: pageResponse.status }
    }
    
    const pageData = await pageResponse.json()
    const currentContent = pageData.body?.storage?.value || ''
    const currentVersion = pageData.version?.number || 1
    
    // Find and update the task status in the content
    // The XML structure is: <ac:task><ac:task-id>X</ac:task-id><ac:task-uuid>...</ac:task-uuid><ac:task-status>incomplete</ac:task-status>...
    // We need a flexible pattern that finds the task by ID and updates its status
    const taskIdPattern = new RegExp(
      `<ac:task-id>${localId}</ac:task-id>`,
      'g'
    )
    
    if (!taskIdPattern.test(currentContent)) {
      console.error(`Task ID ${localId} not found in page content`)
      return { success: false, error: 'Task not found in page content', status: 404 }
    }
    
    // Reset regex lastIndex after test()
    taskIdPattern.lastIndex = 0
    
    const newStatus = status === 'complete' ? 'complete' : 'incomplete'
    
    // Find the task block and update the status within it
    // Match the entire <ac:task>...</ac:task> block containing our task ID
    const taskBlockPattern = new RegExp(
      `(<ac:task>[\\s\\S]*?<ac:task-id>${localId}</ac:task-id>[\\s\\S]*?<ac:task-status>)(incomplete|complete)(</ac:task-status>[\\s\\S]*?</ac:task>)`,
      'g'
    )
    
    const updatedContent = currentContent.replace(taskBlockPattern, `$1${newStatus}$3`)
    
    if (updatedContent === currentContent) {
      console.log('Task already has the correct status')
      return { success: true }
    }
    
    // Update the page
    const updateUrl = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/pages/${pageId}`
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: pageId,
        status: 'current',
        title: pageData.title,
        body: {
          storage: {
            value: updatedContent,
            representation: 'storage',
          },
        },
        version: {
          number: currentVersion + 1,
          message: `Task ${localId} marked as ${newStatus} via Trackli`,
        },
      }),
    })
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Failed to update page:', errorText)
      return { success: false, error: `Failed to update page: ${errorText}`, status: updateResponse.status }
    }
    
    console.log('Task updated via page content modification')
    return { success: true }
    
  } catch (error) {
    console.error('updateConfluenceTask error:', error)
    return { success: false, error: error.message }
  }
}
