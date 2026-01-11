import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Atlassian Personal Data Reporting API
 * 
 * GDPR compliance requirement for apps that store personal data.
 * This function:
 * 1. Collects all Atlassian account IDs stored in our system
 * 2. Reports them to Atlassian's Personal Data Reporting API
 * 3. Handles ERASE/REFRESH actions returned by Atlassian
 * 
 * Should be scheduled to run periodically (daily or weekly)
 * 
 * API Docs: https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Allow both POST (manual trigger) and GET (cron trigger)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get all unique Atlassian account IDs from our connections
    const { data: connections, error: connError } = await supabase
      .from('atlassian_connections')
      .select('atlassian_account_id, updated_at, user_id, id, site_id, access_token_secret_id')
      .not('atlassian_account_id', 'is', null)

    if (connError) {
      console.error('Error fetching connections:', connError)
      throw connError
    }

    if (!connections || connections.length === 0) {
      console.log('No Atlassian connections found, nothing to report')
      await logEvent(supabase, null, 'personal_data.report_empty', { message: 'No connections to report' }, true)
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No connections to report',
        reported: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group by accountId to dedupe (a user might have multiple sites)
    const accountMap = new Map<string, { updatedAt: string, connections: typeof connections }>()
    
    for (const conn of connections) {
      const existing = accountMap.get(conn.atlassian_account_id)
      if (!existing || new Date(conn.updated_at) > new Date(existing.updatedAt)) {
        accountMap.set(conn.atlassian_account_id, {
          updatedAt: conn.updated_at,
          connections: existing ? [...existing.connections, conn] : [conn],
        })
      } else {
        existing.connections.push(conn)
      }
    }

    // 2. Build the report payload (max 90 accounts per request)
    const accounts = Array.from(accountMap.entries()).map(([accountId, data]) => ({
      accountId,
      updatedAt: new Date(data.updatedAt).toISOString(),
    }))

    console.log(`Reporting ${accounts.length} Atlassian accounts`)

    // Get a valid access token for API call
    // Use the first connection's token (any valid token works for this API)
    const firstConn = connections[0]
    let accessToken: string | null = null

    if (firstConn.access_token_secret_id) {
      const { data: tokenData } = await supabase
        .rpc('get_vault_secret', { p_id: firstConn.access_token_secret_id })
      accessToken = tokenData
    }

    if (!accessToken) {
      console.error('No valid access token available for reporting')
      await logEvent(supabase, null, 'personal_data.report_failed', { reason: 'no_valid_token' }, false)
      return new Response(JSON.stringify({ 
        error: 'No valid access token available',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Report to Atlassian API (batch in groups of 90)
    const results = {
      reported: 0,
      eraseRequired: [] as string[],
      refreshRequired: [] as string[],
      errors: [] as string[],
    }

    for (let i = 0; i < accounts.length; i += 90) {
      const batch = accounts.slice(i, i + 90)
      
      try {
        const response = await fetch('https://api.atlassian.com/app/report-accounts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ accounts: batch }),
        })

        results.reported += batch.length

        if (response.status === 204) {
          // No action required for any accounts in this batch
          console.log(`Batch ${i / 90 + 1}: No action required for ${batch.length} accounts`)
          continue
        }

        if (response.status === 200) {
          // Some accounts need action
          const responseData = await response.json()
          
          if (responseData.accounts) {
            for (const account of responseData.accounts) {
              if (account.action === 'ERASE') {
                results.eraseRequired.push(account.accountId)
              } else if (account.action === 'REFRESH') {
                results.refreshRequired.push(account.accountId)
              }
            }
          }
        } else {
          const errorText = await response.text()
          console.error(`Report API error: ${response.status}`, errorText)
          results.errors.push(`Batch ${i / 90 + 1}: ${response.status} - ${errorText}`)
        }
      } catch (batchError) {
        console.error('Batch reporting error:', batchError)
        results.errors.push(`Batch ${i / 90 + 1}: ${batchError}`)
      }
    }

    // 4. Handle ERASE requests
    if (results.eraseRequired.length > 0) {
      console.log(`Processing ERASE for ${results.eraseRequired.length} accounts`)
      
      for (const accountId of results.eraseRequired) {
        await eraseAccountData(supabase, accountId)
      }
    }

    // 5. Handle REFRESH requests (update the stored personal data)
    // For Trackli, we only store accountId, email, and display name
    // REFRESH means the data might be stale - we can refresh on next login
    if (results.refreshRequired.length > 0) {
      console.log(`${results.refreshRequired.length} accounts flagged for refresh (will update on next use)`)
      
      // Mark connections as needing refresh
      for (const accountId of results.refreshRequired) {
        await supabase
          .from('atlassian_connections')
          .update({ needs_data_refresh: true, updated_at: new Date().toISOString() })
          .eq('atlassian_account_id', accountId)
      }
    }

    // 6. Log the report
    await logEvent(supabase, null, 'personal_data.report_complete', {
      reported: results.reported,
      eraseRequired: results.eraseRequired.length,
      refreshRequired: results.refreshRequired.length,
      errors: results.errors.length,
    }, results.errors.length === 0)

    console.log('Personal data report complete:', results)

    return new Response(JSON.stringify({
      success: true,
      reported: results.reported,
      eraseProcessed: results.eraseRequired.length,
      refreshFlagged: results.refreshRequired.length,
      errors: results.errors,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Personal data report error:', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Erase all personal data for an Atlassian account
 * Called when Atlassian requests data deletion (GDPR right to be forgotten)
 */
async function eraseAccountData(supabase: any, atlassianAccountId: string) {
  console.log(`Erasing data for Atlassian account: ${atlassianAccountId}`)
  
  try {
    // 1. Get all connections for this account
    const { data: connections } = await supabase
      .from('atlassian_connections')
      .select('id, user_id, access_token_secret_id, refresh_token_secret_id, webhook_id, site_id')
      .eq('atlassian_account_id', atlassianAccountId)

    if (!connections || connections.length === 0) {
      console.log(`No connections found for account ${atlassianAccountId}`)
      return
    }

    for (const conn of connections) {
      // 2. Delete tokens from Vault
      if (conn.access_token_secret_id) {
        await supabase.rpc('delete_vault_secret', { p_id: conn.access_token_secret_id })
      }
      if (conn.refresh_token_secret_id) {
        await supabase.rpc('delete_vault_secret', { p_id: conn.refresh_token_secret_id })
      }

      // 3. Delete Jira project sync records
      await supabase
        .from('jira_project_sync')
        .delete()
        .eq('connection_id', conn.id)

      // 4. Delete Confluence pending tasks
      await supabase
        .from('confluence_pending_tasks')
        .delete()
        .eq('connection_id', conn.id)

      // 5. Clear Atlassian-related data from tasks (but keep the tasks)
      // This removes the link to Atlassian while preserving the user's work
      await supabase
        .from('tasks')
        .update({
          jira_issue_id: null,
          jira_issue_key: null,
          jira_project_id: null,
          jira_project_key: null,
          jira_site_id: null,
          jira_status: null,
          jira_last_synced: null,
          confluence_task_id: null,
          confluence_page_id: null,
          confluence_page_title: null,
          confluence_space_key: null,
          confluence_space_name: null,
        })
        .eq('user_id', conn.user_id)
        .or(`jira_site_id.eq.${conn.site_id},confluence_task_id.not.is.null`)
    }

    // 6. Delete the connection records
    await supabase
      .from('atlassian_connections')
      .delete()
      .eq('atlassian_account_id', atlassianAccountId)

    // 7. Log the erasure
    await logEvent(supabase, null, 'personal_data.erased', {
      atlassian_account_id: atlassianAccountId,
      connections_deleted: connections.length,
    }, true)

    console.log(`Erased data for ${connections.length} connections (account: ${atlassianAccountId})`)

  } catch (error) {
    console.error('Error erasing account data:', error)
    await logEvent(supabase, null, 'personal_data.erase_failed', {
      atlassian_account_id: atlassianAccountId,
      error: String(error),
    }, false)
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
