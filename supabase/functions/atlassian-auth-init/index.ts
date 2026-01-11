import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Atlassian OAuth Initialization
 * 
 * Generates a secure state token and returns the Atlassian authorization URL.
 * The frontend redirects the user to this URL to begin OAuth flow.
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

  if (!supabaseUrl || !supabaseServiceKey || !clientId) {
    console.error('Missing environment variables')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get the user from the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase client with user's token to verify authentication
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    let redirectPath = '/settings'
    let callbackUrl = 'https://www.gettrackli.com/auth/atlassian/callback'
    try {
      const body = await req.json()
      if (body.redirectPath) {
        redirectPath = body.redirectPath
      }
      if (body.callbackUrl) {
        callbackUrl = body.callbackUrl
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Generate secure random state
    const state = crypto.randomUUID()

    // Store state in database with expiry (10 minutes)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: stateError } = await supabaseAdmin
      .from('oauth_states')
      .insert({
        state,
        user_id: user.id,
        provider: 'atlassian',
        redirect_path: redirectPath,
        expires_at: expiresAt,
      })

    if (stateError) {
      console.error('Error storing state:', stateError)
      return new Response(JSON.stringify({ error: 'Failed to initialize OAuth' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log the initiation
    await supabaseAdmin.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'oauth.initiated',
      provider: 'atlassian',
      details: { redirect_path: redirectPath },
      success: true,
    })

    // Build Atlassian authorization URL
    // Note: Confluence Tasks API v2 requires specific granular scopes
    const scopes = [
      'read:me',
      // Jira scopes
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'manage:jira-webhook',  // Required for auto-registering webhooks
      // Confluence classic scopes
      'read:confluence-content.all',
      'write:confluence-content',
      'read:confluence-user',
      'search:confluence',      // Required for CQL search on REST API v1
      // Confluence v2 API granular scopes (required for Tasks, Pages, Spaces APIs)
      'read:task:confluence',   // Required for Confluence Tasks API v2
      'write:task:confluence',  // Required for updating Confluence tasks
      'read:page:confluence',   // Required for fetching page details
      'write:page:confluence',  // Required for updating page content (task completion)
      'read:space:confluence',  // Required for fetching space details
      'read:user:confluence',   // Required for fetching assignee display names
      'read:content:confluence', // Required for reading page content
      'write:content:confluence', // Required for updating page content
      'read:content-details:confluence', // Required for detailed content access
      'read:content.restriction:confluence', // Required for restricted content
      'offline_access', // Required for refresh tokens
    ]

    const authUrl = new URL('https://auth.atlassian.com/authorize')
    authUrl.searchParams.set('audience', 'api.atlassian.com')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('redirect_uri', callbackUrl)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('prompt', 'consent')

    return new Response(JSON.stringify({ 
      authUrl: authUrl.toString(),
      state,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in atlassian-auth-init:', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
