import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Atlassian Disconnect Handler
 * 
 * Cleans up when user disconnects:
 * 1. Deletes webhook from Jira
 * 2. Deletes tokens from Vault
 * 3. Deletes connection record
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Verify user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get connection ID from request body
    const body = await req.json()
    const { connectionId } = body

    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'Missing connectionId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the connection (verify ownership)
    const { data: connection, error: connError } = await supabase
      .from('atlassian_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Delete webhook from Jira if we have one
    if (connection.webhook_id) {
      try {
        // Get access token to make API call
        const { data: accessToken } = await supabase
          .rpc('get_vault_secret', { p_id: connection.access_token_secret_id })

        if (accessToken) {
          const deleteResponse = await fetch(
            `https://api.atlassian.com/ex/jira/${connection.site_id}/rest/api/3/webhook`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                webhookIds: [parseInt(connection.webhook_id)]
              }),
            }
          )

          if (deleteResponse.ok) {
            console.log(`Deleted webhook ${connection.webhook_id} for site ${connection.site_id}`)
          } else {
            console.error('Failed to delete webhook:', await deleteResponse.text())
          }
        }
      } catch (err) {
        console.error('Error deleting webhook:', err)
        // Continue with disconnect even if webhook deletion fails
      }
    }

    // 2. Delete tokens from Vault
    if (connection.access_token_secret_id) {
      await supabase.rpc('delete_vault_secret', { p_id: connection.access_token_secret_id })
    }
    if (connection.refresh_token_secret_id) {
      await supabase.rpc('delete_vault_secret', { p_id: connection.refresh_token_secret_id })
    }

    // 3. Delete jira_project_sync records
    await supabase
      .from('jira_project_sync')
      .delete()
      .eq('user_id', user.id)

    // 4. Delete the connection record
    await supabase
      .from('atlassian_connections')
      .delete()
      .eq('id', connectionId)

    // 5. Log the disconnection
    await supabase.from('integration_audit_log').insert({
      user_id: user.id,
      event_type: 'oauth.disconnected',
      provider: 'atlassian',
      site_id: connection.site_id,
      details: { 
        site_name: connection.site_name,
        webhook_deleted: !!connection.webhook_id,
      },
      success: true,
    })

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Disconnected successfully',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Disconnect error:', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
