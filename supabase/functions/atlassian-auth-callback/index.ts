import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Atlassian OAuth Callback Handler
 * 
 * Called by the frontend after Atlassian redirects back with code & state.
 * 1. Validates state (CSRF protection)
 * 2. Exchanges code for tokens
 * 3. Gets user info and accessible sites
 * 4. Stores tokens securely in Vault
 * 5. Creates connection record
 * 6. Returns success/error to frontend
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('ATLASSIAN_CLIENT_ID')
  const clientSecret = Deno.env.get('ATLASSIAN_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseServiceKey || !clientId || !clientSecret) {
    console.error('Missing environment variables')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Parse request body
    const body = await req.json()
    const { code, state, callbackUrl } = body

    if (!code || !state) {
      return new Response(JSON.stringify({ error: 'Missing code or state' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Validate state (CSRF protection)
    const { data: stateRecord, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'atlassian')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (stateError || !stateRecord) {
      console.error('Invalid or expired state:', stateError)
      await logEvent(supabase, null, 'oauth.callback_failed', { reason: 'invalid_state' }, false)
      return new Response(JSON.stringify({ error: 'Invalid or expired state. Please try connecting again.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = stateRecord.user_id
    const redirectPath = stateRecord.redirect_path || '/settings'

    // Delete the used state immediately
    await supabase.from('oauth_states').delete().eq('state', state)

    // 2. Exchange code for tokens
    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: callbackUrl,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData)
      await logEvent(supabase, userId, 'oauth.token_exchange_failed', { error: tokenData }, false)
      return new Response(JSON.stringify({ 
        error: 'Failed to exchange authorization code. Please try again.',
        details: tokenData.error_description || tokenData.error,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in || 3600

    // 3. Get user info from Atlassian
    const userResponse = await fetch('https://api.atlassian.com/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    const atlassianUser = await userResponse.json()

    if (!userResponse.ok || !atlassianUser.account_id) {
      console.error('Failed to get Atlassian user:', atlassianUser)
      await logEvent(supabase, userId, 'oauth.user_fetch_failed', { error: atlassianUser }, false)
      return new Response(JSON.stringify({ error: 'Failed to get Atlassian user info' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Get accessible resources (Jira/Confluence sites)
    const resourcesResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    const resources = await resourcesResponse.json()

    if (!resourcesResponse.ok || !Array.isArray(resources) || resources.length === 0) {
      console.error('No accessible resources:', resources)
      await logEvent(supabase, userId, 'oauth.no_resources', { error: resources }, false)
      return new Response(JSON.stringify({ 
        error: 'No Atlassian sites found. Make sure you have access to at least one Jira or Confluence site.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Store tokens and create connections for each site
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const connectionsCreated = []

    for (const resource of resources) {
      const siteId = resource.id
      const siteUrl = resource.url
      const siteName = resource.name

      // Store access token in Vault using SQL function
      const accessSecretName = `atlassian_access_${userId}_${siteId}`
      const { data: accessVaultResult, error: accessVaultError } = await supabase
        .rpc('create_vault_secret', {
          p_secret: accessToken,
          p_name: accessSecretName,
        })

      let accessTokenSecretId = null
      if (accessVaultError) {
        console.error('Vault error for access token:', accessVaultError)
        // Fallback: We'll need to handle this - for now log and continue
      } else {
        accessTokenSecretId = accessVaultResult
      }

      // Store refresh token in Vault
      let refreshTokenSecretId = null
      if (refreshToken) {
        const refreshSecretName = `atlassian_refresh_${userId}_${siteId}`
        const { data: refreshVaultResult, error: refreshVaultError } = await supabase
          .rpc('create_vault_secret', {
            p_secret: refreshToken,
            p_name: refreshSecretName,
          })

        if (!refreshVaultError) {
          refreshTokenSecretId = refreshVaultResult
        } else {
          console.error('Vault error for refresh token:', refreshVaultError)
        }
      }

      // 6. Create or update connection record
      const { data: connection, error: connectionError } = await supabase
        .from('atlassian_connections')
        .upsert({
          user_id: userId,
          site_id: siteId,
          site_url: siteUrl,
          site_name: siteName,
          access_token_secret_id: accessTokenSecretId,
          refresh_token_secret_id: refreshTokenSecretId,
          token_expires_at: tokenExpiresAt,
          atlassian_account_id: atlassianUser.account_id,
          atlassian_email: atlassianUser.email,
          atlassian_display_name: atlassianUser.name || atlassianUser.displayName,
          sync_enabled: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,site_id',
        })
        .select()
        .single()

      if (connectionError) {
        console.error('Failed to create connection:', connectionError)
      } else {
        connectionsCreated.push({
          id: connection.id,
          site_id: siteId,
          site_name: siteName,
          site_url: siteUrl,
        })

        // Fetch and store Jira projects for this site
        await fetchAndStoreJiraProjects(supabase, accessToken, siteId, userId, connection.id)
      }
    }

    // 7. Log successful connection
    await logEvent(supabase, userId, 'oauth.connected', {
      sites: connectionsCreated.map(c => ({ site_id: c.site_id, site_name: c.site_name })),
      atlassian_account_id: atlassianUser.account_id,
    }, true)

    // 8. Auto-register webhooks for real-time sync
    console.log(`Attempting to register webhooks for ${connectionsCreated.length} connections`)
    for (const conn of connectionsCreated) {
      console.log(`Registering webhook for site ${conn.site_id}...`)
      await registerJiraWebhook(supabase, accessToken, conn.site_id, userId, supabaseUrl!)
    }

    // 9. Return success response
    return new Response(JSON.stringify({
      success: true,
      connections: connectionsCreated,
      user: {
        account_id: atlassianUser.account_id,
        email: atlassianUser.email,
        name: atlassianUser.name || atlassianUser.displayName,
      },
      redirectPath,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('OAuth callback error:', error)
    return new Response(JSON.stringify({ error: 'Server error. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Fetch Jira projects and store sync settings
 */
async function fetchAndStoreJiraProjects(
  supabase: any,
  accessToken: string,
  siteId: string,
  userId: string,
  connectionId: string
) {
  try {
    const projectsResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/project/search`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    )

    if (!projectsResponse.ok) {
      console.error('Failed to fetch Jira projects:', await projectsResponse.text())
      return
    }

    const projectsData = await projectsResponse.json()
    const projects = projectsData.values || []

    for (const project of projects) {
      await supabase.from('jira_project_sync').upsert({
        user_id: userId,
        connection_id: connectionId,
        jira_project_id: project.id,
        jira_project_key: project.key,
        jira_project_name: project.name,
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,jira_project_id',
      })
    }

    console.log(`Stored ${projects.length} Jira projects for site ${siteId}`)
  } catch (error) {
    console.error('Error fetching Jira projects:', error)
  }
}

/**
 * Register a Jira webhook for real-time sync
 */
async function registerJiraWebhook(
  supabase: any,
  accessToken: string,
  siteId: string,
  userId: string,
  supabaseUrl: string
) {
  console.log(`registerJiraWebhook called for site ${siteId}, user ${userId}`)
  try {
    const webhookUrl = `${supabaseUrl}/functions/v1/jira-webhook`
    console.log(`Webhook URL: ${webhookUrl}`)
    
    // Check if we already have a webhook registered
    const { data: existingConn } = await supabase
      .from('atlassian_connections')
      .select('webhook_id')
      .eq('user_id', userId)
      .eq('site_id', siteId)
      .single()

    if (existingConn?.webhook_id) {
      console.log(`Webhook already registered for site ${siteId}`)
      return
    }

    // Register webhook with Jira
    // Using the dynamic webhook registration API
    // jqlFilter is required - we use a broad filter and handle filtering in our webhook handler
    const webhookPayload = {
      url: webhookUrl,
      webhooks: [
        {
          events: [
            'jira:issue_created',
            'jira:issue_updated', 
            'jira:issue_deleted',
            'sprint_started',
            'sprint_closed',
          ],
          jqlFilter: 'project != "ZZZZNONEXISTENT"',  // Matches all projects (only project/status/assignee clauses supported)
        }
      ]
    }

    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${siteId}/rest/api/3/webhook`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      }
    )

    console.log(`Webhook registration response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to register webhook for site ${siteId}:`, response.status, errorText)
      
      // Log but don't fail - webhook is optional, cron sync will still work
      await supabase.from('integration_audit_log').insert({
        user_id: userId,
        event_type: 'webhook.registration_failed',
        provider: 'atlassian',
        site_id: siteId,
        details: { error: errorText, status: response.status, url: webhookUrl },
        success: false,
      })
      return
    }

    const webhookData = await response.json()
    console.log('Webhook registration response:', JSON.stringify(webhookData))
    const webhookId = webhookData.webhookRegistrationResult?.[0]?.createdWebhookId
    console.log('Extracted webhook ID:', webhookId)

    if (webhookId) {
      // Store webhook ID for later cleanup on disconnect
      await supabase
        .from('atlassian_connections')
        .update({ 
          webhook_id: String(webhookId),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('site_id', siteId)

      console.log(`Registered webhook ${webhookId} for site ${siteId}`)
      
      await supabase.from('integration_audit_log').insert({
        user_id: userId,
        event_type: 'webhook.registered',
        provider: 'atlassian',
        site_id: siteId,
        details: { webhook_id: webhookId, url: webhookUrl },
        success: true,
      })
    }
  } catch (error) {
    console.error('Error registering webhook:', error)
    // Log the error so we can see what went wrong
    try {
      await supabase.from('integration_audit_log').insert({
        user_id: userId,
        event_type: 'webhook.registration_error',
        provider: 'atlassian',
        site_id: siteId,
        details: { error: error.message || String(error) },
        success: false,
      })
    } catch (logErr) {
      console.error('Failed to log webhook error:', logErr)
    }
    // Don't throw - webhook is optional enhancement
  }
}

/**
 * Log an event to the audit log
 */
async function logEvent(
  supabase: any,
  userId: string | null,
  eventType: string,
  details: any,
  success: boolean
) {
  try {
    await supabase.from('integration_audit_log').insert({
      user_id: userId,
      event_type: eventType,
      provider: 'atlassian',
      details,
      success,
    })
  } catch (error) {
    console.error('Failed to log event:', error)
  }
}
