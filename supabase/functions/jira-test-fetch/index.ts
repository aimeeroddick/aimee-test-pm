import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // Get access token from Vault
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('get_vault_secret', { p_id: connection.access_token_id })

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'Failed to get access token', details: tokenError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accessToken = tokenData

    // Fetch issues assigned to user from Jira
    // JQL: assignee = currentUser() AND resolution = Unresolved
    const jql = encodeURIComponent('assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC')
    const fields = 'summary,status,priority,duedate,created,updated,issuetype,project,parent,customfield_10016' // customfield_10016 is often story points
    
    const jiraResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${connection.site_id}/rest/api/3/search?jql=${jql}&fields=${fields}&maxResults=50`,
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
      
      // Check if token expired
      if (jiraResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Jira token expired, need to refresh', status: 401 }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ error: 'Jira API error', details: errorText }),
        { status: jiraResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const jiraData = await jiraResponse.json()

    // Format the response
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

    return new Response(
      JSON.stringify({
        success: true,
        connection: {
          site: connection.site_name || connection.site_url,
          email: connection.atlassian_email,
        },
        totalIssues: jiraData.total,
        issues,
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
