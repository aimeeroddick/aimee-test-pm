import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // This will be the user's Trackli user_id
  const error = url.searchParams.get('error')

  if (error) {
    console.error('Slack OAuth error:', error)
    return Response.redirect('https://gettrackli.com/settings?slack=error&message=' + encodeURIComponent(error))
  }

  if (!code || !state) {
    console.error('Missing code or state')
    return Response.redirect('https://gettrackli.com/settings?slack=error&message=missing_params')
  }

  const clientId = Deno.env.get('SLACK_CLIENT_ID')
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables')
    return Response.redirect('https://gettrackli.com/settings?slack=error&message=config_error')
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: 'https://quzfljuvpvevvvdnsktd.supabase.co/functions/v1/slack-oauth',
      }),
    })

    const tokenData = await tokenResponse.json()
    console.log('Token response:', JSON.stringify(tokenData, null, 2))

    if (!tokenData.ok) {
      console.error('Slack token error:', tokenData.error)
      return Response.redirect('https://gettrackli.com/settings?slack=error&message=' + encodeURIComponent(tokenData.error))
    }

    const accessToken = tokenData.access_token
    const slackUserId = tokenData.authed_user?.id
    const slackTeamId = tokenData.team?.id
    const slackTeamName = tokenData.team?.name

    if (!accessToken || !slackUserId || !slackTeamId) {
      console.error('Missing token data')
      return Response.redirect('https://gettrackli.com/settings?slack=error&message=invalid_response')
    }

    // Get user's timezone from Slack
    let timezone = 'Europe/London'
    try {
      const userInfoResponse = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })
      const userInfo = await userInfoResponse.json()
      if (userInfo.ok && userInfo.user?.tz) {
        timezone = userInfo.user.tz
      }
    } catch (e) {
      console.error('Error fetching user timezone:', e)
    }

    // Store in database
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: upsertError } = await supabase
      .from('slack_connections')
      .upsert({
        user_id: state, // The Trackli user ID passed as state
        slack_user_id: slackUserId,
        slack_team_id: slackTeamId,
        slack_team_name: slackTeamName,
        access_token: accessToken,
        timezone: timezone,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })

    if (upsertError) {
      console.error('Database error:', upsertError)
      return Response.redirect('https://gettrackli.com/settings?slack=error&message=database_error')
    }

    // Send welcome message to user
    try {
      // First, open a DM channel with the user
      const openDmResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          users: slackUserId,
        }),
      })
      const dmData = await openDmResponse.json()
      
      if (dmData.ok && dmData.channel?.id) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: dmData.channel.id,
            text: `🎉 *Trackli is now connected!*\n\nYou can now:\n• Type \`/trackli Buy milk by Friday\` to create tasks\n• Type \`/trackli today\` to see your My Day tasks\n• Type \`/trackli summary\` for a quick overview\n\nYou'll also receive a daily summary at 9am with your tasks for the day.`,
          }),
        })
      }
    } catch (e) {
      console.error('Error sending welcome message:', e)
      // Don't fail the connection if welcome message fails
    }

    console.log('Slack connection successful for user:', state)
    return Response.redirect('https://gettrackli.com/settings?slack=success')

  } catch (error) {
    console.error('OAuth error:', error)
    return Response.redirect('https://gettrackli.com/settings?slack=error&message=server_error')
  }
})
