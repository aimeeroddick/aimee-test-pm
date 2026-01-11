import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Confluence Fetch Tasks
 *
 * NEW APPROACH: The Tasks API doesn't populate assignedTo for @mentioned tasks.
 * Instead, we:
 * 1. Use CQL to find pages that mention the current user
 * 2. Fetch each page's content
 * 3. Parse <ac:task> elements from the XML
 * 4. Check if the task body contains the user's account ID
 * 5. Extract incomplete tasks assigned to the user
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

    // Build site base URL from site_name (e.g., "spicymango" -> "https://spicymango.atlassian.net")
    const siteBaseUrl = `https://${connection.site_name}.atlassian.net`

    // Fetch tasks by parsing page content (new approach)
    const tasksResult = await fetchTasksFromPageContent(
      accessToken,
      connection.site_id,
      connection.atlassian_account_id,
      siteBaseUrl
    )

    if (!tasksResult.success) {
      console.error('Confluence fetch failed:', {
        error: tasksResult.error,
        siteId: connection.site_id,
        siteName: connection.site_name,
      })

      await supabase.from('integration_audit_log').insert({
        user_id: user.id,
        event_type: 'confluence.fetch_failed',
        provider: 'atlassian',
        site_id: connection.site_id,
        details: {
          error: tasksResult.error,
          site_name: connection.site_name,
        },
        success: false,
      })

      return new Response(
        JSON.stringify({ error: 'Confluence API error', details: tasksResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Insert/update tasks in confluence_pending_tasks table
    let newCount = 0
    let existingCount = 0

    for (const task of tasksResult.tasks || []) {
      // Use a composite ID: pageId-taskLocalId
      const taskId = `${task.pageId}-${task.localId}`

      // Check if task already exists in the main tasks table (already approved/created)
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .eq('confluence_task_id', taskId)
        .maybeSingle()

      if (existingTask) {
        // Task already exists in Trackli - skip it entirely
        existingCount++
        continue
      }

      // Check if task exists in pending table
      const { data: existing } = await supabase
        .from('confluence_pending_tasks')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('confluence_task_id', taskId)
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
              confluence_page_url: task.pageUrl,
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
            confluence_task_id: taskId,
            confluence_page_id: task.pageId,
            confluence_page_title: task.pageTitle,
            confluence_space_key: task.spaceKey,
            confluence_space_name: task.spaceName,
            confluence_page_url: task.pageUrl,
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
        pages_scanned: tasksResult.pagesScanned || 0,
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
        pagesScanned: tasksResult.pagesScanned || 0,
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
 * NEW APPROACH: Fetch tasks by searching for pages mentioning the user
 * and parsing the page content XML to find <ac:task> elements
 */
async function fetchTasksFromPageContent(
  accessToken: string,
  siteId: string,
  atlassianAccountId: string,
  siteBaseUrl: string
): Promise<{
  success: boolean;
  tasks?: any[];
  pagesScanned?: number;
  error?: string;
}> {
  try {
    console.log(`Fetching tasks for user: ${atlassianAccountId}`)

    // Step 1: Use CQL to find pages that mention the user
    // This finds pages where the user is @mentioned
    const cql = `mention = "${atlassianAccountId}" AND type = page`
    const searchUrl = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50&expand=space`

    console.log(`Searching for pages with CQL: ${cql}`)

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('CQL search failed:', searchResponse.status, errorText)
      return { success: false, error: `CQL search failed: ${searchResponse.status} ${errorText}` }
    }

    const searchData = await searchResponse.json()
    const pages = searchData.results || []

    console.log(`Found ${pages.length} pages mentioning user`)

    if (pages.length === 0) {
      return { success: true, tasks: [], pagesScanned: 0 }
    }

    // Step 2: Fetch each page's content and parse tasks
    const allTasks: any[] = []

    for (const page of pages) {
      const pageId = page.id
      const pageTitle = page.title || 'Untitled'
      const spaceKey = page.space?.key || ''
      const spaceName = page.space?.name || ''
      
      // Construct the page URL
      const pageUrl = `${siteBaseUrl}/wiki/spaces/${spaceKey}/pages/${pageId}`

      console.log(`Fetching content for page: ${pageTitle} (${pageId})`)

      // Fetch page content in storage format
      const pageApiUrl = `https://api.atlassian.com/ex/confluence/${siteId}/wiki/api/v2/pages/${pageId}?body-format=storage`

      const pageResponse = await fetch(pageApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!pageResponse.ok) {
        console.error(`Failed to fetch page ${pageId}:`, pageResponse.status)
        continue
      }

      const pageData = await pageResponse.json()
      const bodyContent = pageData.body?.storage?.value || ''

      // Parse tasks from the content
      const pageTasks = parseTasksFromContent(
        bodyContent, 
        atlassianAccountId, 
        pageId, 
        pageTitle, 
        spaceKey, 
        spaceName,
        pageUrl
      )

      console.log(`Found ${pageTasks.length} tasks assigned to user on page ${pageTitle}`)
      allTasks.push(...pageTasks)
    }

    console.log(`Total tasks found: ${allTasks.length} from ${pages.length} pages`)

    return {
      success: true,
      tasks: allTasks,
      pagesScanned: pages.length,
    }

  } catch (error) {
    console.error('fetchTasksFromPageContent error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Parse <ac:task> elements from Confluence storage format XML
 * and extract tasks where the user is @mentioned in the task body
 * 
 * Handles two common patterns:
 * 1. Inline tasks: "@User to complete something" - text is in the task body
 * 2. Table tasks: Task title in one cell, @User checkbox in another cell
 */
function parseTasksFromContent(
  content: string,
  atlassianAccountId: string,
  pageId: string,
  pageTitle: string,
  spaceKey: string,
  spaceName: string,
  pageUrl: string
): any[] {
  const tasks: any[] = []

  // Regex to match <ac:task>...</ac:task> elements (including newlines)
  const taskRegex = /<ac:task>([\s\S]*?)<\/ac:task>/g
  let taskMatch

  while ((taskMatch = taskRegex.exec(content)) !== null) {
    const taskXml = taskMatch[1]
    const taskStartIndex = taskMatch.index

    // Extract task-id
    const idMatch = taskXml.match(/<ac:task-id>(\d+)<\/ac:task-id>/)
    const localId = idMatch ? idMatch[1] : null

    // Extract task-uuid
    const uuidMatch = taskXml.match(/<ac:task-uuid>([^<]+)<\/ac:task-uuid>/)
    const uuid = uuidMatch ? uuidMatch[1] : null

    // Extract task-status
    const statusMatch = taskXml.match(/<ac:task-status>([^<]+)<\/ac:task-status>/)
    const status = statusMatch ? statusMatch[1] : 'incomplete'

    // Skip completed tasks
    if (status === 'complete') {
      continue
    }

    // Extract task-body
    const bodyMatch = taskXml.match(/<ac:task-body>([\s\S]*?)<\/ac:task-body>/)
    const bodyXml = bodyMatch ? bodyMatch[1] : ''

    // Check if this task mentions the user
    // Look for ri:account-id="user_account_id"
    const userMentionPattern = new RegExp(`ri:account-id=["']${atlassianAccountId}["']`, 'i')
    if (!userMentionPattern.test(bodyXml)) {
      // User not mentioned in this task
      continue
    }

    // Extract plain text from the task body (remove XML tags)
    let bodyText = bodyXml
      // Remove user mention links but keep surrounding text
      .replace(/<ac:link>[\s\S]*?<\/ac:link>/g, '')
      .replace(/<ri:user[^>]*\/>/g, '')
      // Remove other XML tags
      .replace(/<[^>]+>/g, ' ')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim()

    // Remove leading "to" if present (common pattern after @mention)
    bodyText = bodyText.replace(/^to\s+/i, '').trim()

    // Capitalize first letter
    if (bodyText) {
      bodyText = bodyText.charAt(0).toUpperCase() + bodyText.slice(1)
    }

    // If task body is empty/just whitespace, try to find title from table context
    let dueDate: string | null = null
    
    if (!bodyText || bodyText.length < 3) {
      // Try to extract from table row context
      const tableContext = extractTableRowContext(content, taskStartIndex)
      if (tableContext.title) {
        bodyText = tableContext.title
      }
      if (tableContext.dueDate) {
        dueDate = tableContext.dueDate
      }
    } else {
      // Still try to find due date from nearby content
      const tableContext = extractTableRowContext(content, taskStartIndex)
      if (tableContext.dueDate) {
        dueDate = tableContext.dueDate
      }
    }

    if (!bodyText) {
      bodyText = 'Untitled task'
    }

    tasks.push({
      localId: localId,
      uuid: uuid,
      pageId: pageId,
      pageTitle: pageTitle,
      spaceKey: spaceKey,
      spaceName: spaceName,
      pageUrl: pageUrl,
      bodyText: bodyText,
      status: status,
      dueDate: dueDate,
    })
  }

  return tasks
}

/**
 * Extract context from the table row containing the task
 * Looks for task title in previous cells and due date in <time> elements
 */
function extractTableRowContext(
  content: string,
  taskPosition: number
): { title: string | null; dueDate: string | null } {
  // Find the containing <tr> by looking backwards
  const beforeTask = content.substring(0, taskPosition)
  const trStartMatch = beforeTask.match(/.*<tr[^>]*>/s)
  
  if (!trStartMatch) {
    return { title: null, dueDate: null }
  }

  const trStartIndex = trStartMatch[0].lastIndexOf('<tr')
  const trStartPos = beforeTask.length - (beforeTask.length - trStartIndex)

  // Find the end of this row
  const afterTrStart = content.substring(trStartPos)
  const trEndMatch = afterTrStart.match(/<\/tr>/)
  
  if (!trEndMatch) {
    return { title: null, dueDate: null }
  }

  const rowContent = afterTrStart.substring(0, trEndMatch.index! + 5)

  // Extract all <td> cells
  const cells: string[] = []
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
  let tdMatch
  while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
    cells.push(tdMatch[1])
  }

  let title: string | null = null
  let dueDate: string | null = null

  // Look for title in cells (usually first non-number cell before the task)
  for (const cell of cells) {
    // Skip cells that contain the task itself
    if (cell.includes('<ac:task>')) {
      continue
    }
    
    // Skip numbering cells
    if (cell.match(/^\s*\d+\s*$/) || cell.includes('numberingColumn')) {
      continue
    }

    // Skip cells with status macros
    if (cell.includes('ac:name="status"')) {
      continue
    }

    // Extract text from this cell
    const cellText = cell
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // If it looks like a meaningful title (more than 3 chars, not a date)
    if (cellText.length > 3 && !cellText.match(/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) {
      if (!title) {
        title = cellText
      }
    }
  }

  // Look for <time> element anywhere in the row for due date
  const timeMatch = rowContent.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/)
  if (timeMatch) {
    dueDate = timeMatch[1]
  }

  // Capitalize title if found
  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1)
  }

  return { title, dueDate }
}
