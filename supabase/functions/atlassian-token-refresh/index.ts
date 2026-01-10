import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Atlassian Token Refresh
 *
 * Refreshes an expired access token using the refresh token.
 * Called internally by other Edge Functions when token is expired.
 *
 * Can be called directly for a specific connection, or will refresh
 * all expired tokens for a user if no connectionId provided.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const clientId = Deno.env.get('ATLASSIAN_CLIENT_ID')
  const clientSecret = Deno.env.get('ATLASSIAN_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Missing Atlassian credentials' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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

    // Parse request body for optional connectionId
    let connectionId: string | null = null
    try {
      const body = await req.json()
      connectionId = body.connectionId || null
    } catch {
      // No body provided, that's fine
    }

    // Get connection(s) to refresh
    let query = supabase
      .from('atlassian_connections')
      .select('*')
      .eq('user_id', user.id)

    if (connectionId) {
      query = query.eq('id', connectionId)
    }

    const { data: connections, error: connError } = await query

    if (connError || !connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No Atlassian connections found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    for (const connection of connections) {
      // Check if refresh token exists
      if (!connection.refresh_token_secret_id) {
        results.push({
          connectionId: connection.id,
          site: connection.site_name,
          success: false,
          error: 'No refresh token available',
        })
        continue
      }

      // Get refresh token from Vault
      const { data: refreshToken, error: refreshError } = await supabase
        .rpc('get_vault_secret', { p_id: connection.refresh_token_secret_id })

      if (refreshError || !refreshToken) {
        console.error('Failed to get refresh token:', refreshError)
        results.push({
          connectionId: connection.id,
          site: connection.site_name,
          success: false,
          error: 'Failed to retrieve refresh token',
        })
        continue
      }

      // Call Atlassian token refresh endpoint
      const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

        // Log the failure
        await supabase.from('integration_audit_log').insert({
          user_id: user.id,
          event_type: 'oauth.token_refresh_failed',
          provider: 'atlassian',
          site_id: connection.site_id,
          details: { error: tokenData.error || 'unknown' },
          success: false,
        })

        results.push({
          connectionId: connection.id,
          site: connection.site_name,
          success: false,
          error: tokenData.error_description || 'Token refresh failed',
        })
        continue
      }

      const newAccessToken = tokenData.access_token
      const newRefreshToken = tokenData.refresh_token // May be a new refresh token
      const expiresIn = tokenData.expires_in || 3600
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

      // Delete old access token from Vault
      if (connection.access_token_secret_id) {
        await supabase.rpc('delete_vault_secret', { p_id: connection.access_token_secret_id })
      }

      // Store new access token in Vault
      const accessSecretName = `atlassian_access_${user.id}_${connection.site_id}`
      const { data: newAccessSecretId, error: accessVaultError } = await supabase
        .rpc('create_vault_secret', {
          p_secret: newAccessToken,
          p_name: accessSecretName,
        })

      if (accessVaultError) {
        console.error('Failed to store new access token:', accessVaultError)
        results.push({
          connectionId: connection.id,
          site: connection.site_name,
          success: false,
          error: 'Failed to store new access token',
        })
        continue
      }

      // If we got a new refresh token, update it too
      let newRefreshSecretId = connection.refresh_token_secret_id
      if (newRefreshToken && newRefreshToken !== refreshToken) {
        // Delete old refresh token
        await supabase.rpc('delete_vault_secret', { p_id: connection.refresh_token_secret_id })

        // Store new refresh token
        const refreshSecretName = `atlassian_refresh_${user.id}_${connection.site_id}`
        const { data: refreshSecretId, error: refreshVaultError } = await supabase
          .rpc('create_vault_secret', {
            p_secret: newRefreshToken,
            p_name: refreshSecretName,
          })

        if (!refreshVaultError) {
          newRefreshSecretId = refreshSecretId
        }
      }

      // Update connection record
      const { error: updateError } = await supabase
        .from('atlassian_connections')
        .update({
          access_token_secret_id: newAccessSecretId,
          refresh_token_secret_id: newRefreshSecretId,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      if (updateError) {
        console.error('Failed to update connection:', updateError)
        results.push({
          connectionId: connection.id,
          site: connection.site_name,
          success: false,
          error: 'Failed to update connection',
        })
        continue
      }

      // Log success
      await supabase.from('integration_audit_log').insert({
        user_id: user.id,
        event_type: 'oauth.token_refreshed',
        provider: 'atlassian',
        site_id: connection.site_id,
        details: { expires_at: newExpiresAt },
        success: true,
      })

      results.push({
        connectionId: connection.id,
        site: connection.site_name,
        success: true,
        expiresAt: newExpiresAt,
      })
    }

    const allSucceeded = results.every(r => r.success)
    const anySucceeded = results.some(r => r.success)

    return new Response(
      JSON.stringify({
        success: anySucceeded,
        results,
        message: allSucceeded
          ? `Refreshed ${results.length} connection(s)`
          : anySucceeded
            ? 'Some connections refreshed'
            : 'All refresh attempts failed',
      }),
      {
        status: anySucceeded ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Token refresh error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
