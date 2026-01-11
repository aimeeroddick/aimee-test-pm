import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Confluence Fetch Tasks
 *
 * Fetches inline tasks assigned to the current user from Confluence.
 * Inserts new tasks into the confluence_pending_tasks table for approval.
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

    // Fetch tasks from Confluence API
    const tasksResult = await fetchConfluenceTasks(
      accessToken,
      connection.site_id,
      connection.atlassian_account_id
    )

    if (!tasksResult.success) {
      if (tasksResult.status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Confluence access denied. Token may have been revoked. Please reconnect Atlassian.',
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Confluence API error', details: tasksResult.error }),
        { status: tasksResult.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch page details for each task to get space info
    const tasksWithPageInfo = await enrichTasksWithPageInfo(
      accessToken,
      connection.site_id,
      tasksResult.tasks || []
    )

    // Insert/update tasks in confluence_pending_tasks table
    let newCount = 0
    let existingCount = 0

    for (const task of tasksWithPageInfo) {
      const { data: existing } = await supabase
        .from('confluence_pending_tasks')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('confluence_task_id', task.id)
        .single()

      if (existing) {
        // Task already exists - only update if still pending
        if (existing.status === 'pending') {
          await supabase
            .from('confluence_pending_tasks')
            .update({
              task_title: task.bodyText || 'Untitled task',
              confluence_page_title: task.pageTitle,
              confluence_space_key: task.spaceKey,
              confluence_space_name: task.spaceName,
              due_date: task.dueDate || null,
            })
            .eq('id', existing.id)
        }
        existingCount++
      } else {
        // New task - insert
        const { error: insertError } = await supabase
          .from('confluence_pending_tasks')
          .insert({
            user_id: user.id,
            connection_id: connection.id,
            confluence_task_id: task.id,
            confluence_page_id: task.pageId,
            confluence_page_title: task.pageTitle,
            confluence_space_key: task.spaceKey,
            confluence_space_name: task.spaceName,
            task_title: task.bodyText || 'Untitled task',
            task_description: null,
            due_date: task.dueDate || null,
            status: 'pending',
          })

        if (!insertError) {
          newCount++
        } else {
          console.error('Error inserting task:', insertError)
        }
      }
    }

    // Log the sync event
    await supabase.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'confluence.tasks_fetched',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: {
        total_found: tasksResult.tasks?.length || 0,
        new_pending: newCount,
        existing: existingCount,
      },
      success: true,
    })

    // Get current pending count
    const { count: pendingCount } = await supabase
      .from('confluence_pending_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')

    return new Response(
      JSON.stringify({
        success: true,
        discovered: tasksResult.tasks?.length || 0,
        newPending: newCount,
        alreadyTracked: existingCount,
        totalPending: pendingCount || 0,
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
 * Fetch tasks from Confluence API v2
 * Tasks endpoint: /wiki/api/v2/tasks
 */
async function fetchConfluenceTasks(
  accessToken: string,
  siteId: string,
  atlassianAccountId: string
): Promise<{
  success: boolean;
  tasks?: any[];
  error?: string;
  status?: number;
}> {
  try {
    // Confluence Tasks API v2 - filter by assignee and incomplete status
    const url = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/tasks?assignee=${atlassianAccountId}&status=incomplete&limit=100`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Confluence Tasks API error:', errorText)
      return {
        success: false,
        error: errorText,
        status: response.status,
      }
    }

    const data = await response.json()

    // Map tasks to simpler structure
    const tasks = (data.results || []).map((task: any) => ({
      id: task.id,
      localId: task.localId,
      pageId: task.pageId,
      spaceId: task.spaceId,
      bodyText: task.body?.text || task.bodyText || '',
      dueDate: task.dueDate || null,
      status: task.status,
      assignee: task.assignedTo?.accountId,
    }))

    return {
      success: true,
      tasks,
    }
  } catch (error) {
    console.error('fetchConfluenceTasks error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enrich tasks with page and space information
 * Fetches page details to get title and space name
 */
async function enrichTasksWithPageInfo(
  accessToken: string,
  siteId: string,
  tasks: any[]
): Promise<any[]> {
  // Cache page info to avoid duplicate API calls
  const pageCache: Record<string, { title: string; spaceKey: string; spaceName: string }> = {}

  const enrichedTasks = []

  for (const task of tasks) {
    let pageInfo = pageCache[task.pageId]

    if (!pageInfo) {
      // Fetch page details
      try {
        const pageResponse = await fetch(
          `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/pages/${task.pageId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        )

        if (pageResponse.ok) {
          const pageData = await pageResponse.json()

          // Fetch space details for space name
          let spaceName = ''
          if (pageData.spaceId) {
            try {
              const spaceResponse = await fetch(
                `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/spaces/${pageData.spaceId}`,
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                  },
                }
              )

              if (spaceResponse.ok) {
                const spaceData = await spaceResponse.json()
                spaceName = spaceData.name || ''
              }
            } catch (e) {
              console.error('Error fetching space:', e)
            }
          }

          pageInfo = {
            title: pageData.title || 'Untitled Page',
            spaceKey: pageData.spaceKey || pageData._links?.space?.split('/').pop() || '',
            spaceName: spaceName,
          }

          pageCache[task.pageId] = pageInfo
        } else {
          console.error('Failed to fetch page:', task.pageId)
          pageInfo = { title: 'Unknown Page', spaceKey: '', spaceName: '' }
        }
      } catch (e) {
        console.error('Error fetching page info:', e)
        pageInfo = { title: 'Unknown Page', spaceKey: '', spaceName: '' }
      }
    }

    enrichedTasks.push({
      ...task,
      pageTitle: pageInfo.title,
      spaceKey: pageInfo.spaceKey,
      spaceName: pageInfo.spaceName,
    })
  }

  return enrichedTasks
}
