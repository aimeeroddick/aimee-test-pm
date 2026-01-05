// Supabase Edge Function: Receive inbound emails and create pending tasks with AI extraction
// Deploy with: supabase functions deploy inbound-email --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract tasks using Claude AI
async function extractTasksWithAI(subject: string, bodyText: string, userNote: string, projectNames: string[], anthropicKey: string) {
  const projectList = projectNames.length > 0 
    ? `Available projects: ${projectNames.join(', ')}`
    : 'No projects available'

  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const currentYear = new Date().getFullYear()
  
  const prompt = `You are a task extraction assistant. Extract ONLY clear action items from this email.

TODAY'S DATE: ${today} (Current year is ${currentYear})

USER'S NOTE (instructions from the person forwarding):
${userNote || '(No specific instructions)'}

EMAIL SUBJECT:
${subject || '(No subject)'}

EMAIL BODY:
${bodyText || '(No body)'}

${projectList}

WHAT TO EXTRACT (action items):
- "[Name] will [action]" → Task assigned to Name
- "[Name] to [action]" → Task assigned to Name  
- "Please [action]" or "Can you [action]" → Task for recipient
- Clear commitments with a person and action verb

WHAT NOT TO EXTRACT:
- Future agenda items ("will discuss next time", "will have on agenda")
- Status updates ("project is on track", "going well")
- Meeting summaries ("met with Dave to discuss")
- Informational statements without a clear task
- Signature blocks, contact info, disclaimers

EXAMPLES:
✅ "Chris will forward the PPT to Aimee" → Extract as task
✅ "Please review the budget by Friday" → Extract as task
❌ "Will determine the date next meeting" → NOT a task (future discussion)
❌ "Project status: on track" → NOT a task (status update)
❌ "Great meeting today" → NOT a task (commentary)

For each task, provide:
- title: Clear, actionable task title (max 100 chars)
- description: Brief context if needed (max 200 chars, or null)
- due_date: Convert any date mentioned to YYYY-MM-DD format (e.g., "January 8" → "2026-01-08", "tomorrow" → calculate from today). Use null if no date.
- assignee_text: Person responsible if mentioned (or null)
- project_name: Match to one of the available projects if mentioned in user note or email (exact match from list, or null)
- critical: true ONLY if explicitly marked urgent/ASAP/critical
- time_estimate: Duration in MINUTES if mentioned (e.g., "10 minutes" → 10, "2 hours" → 120, "30 mins" → 30). Use null if not mentioned.
- energy_level: If effort/complexity mentioned, use "low" (quick/easy/simple), "medium" (moderate), or "high" (complex/difficult/big). Use null if not mentioned.
- customer: If a customer/client/company name is mentioned for the task, extract it. Use null if not mentioned.
- confidence: Your confidence this is a real action item (0.7-1.0 for clear "[Name] to [action]" patterns, 0.5-0.7 for ambiguous items)

IMPORTANT: 
- If the user's note mentions a project name (e.g., "Add to Feedback project"), match it to the available projects list.
- If the user's note mentions "high priority", "urgent", or "critical", set critical=true for ALL tasks.
- If the user's note mentions effort like "quick", "easy", "simple" set energy_level="low" for ALL tasks. If "complex", "big", "difficult" set energy_level="high".
- If the user's note mentions a customer/client name, set customer for ALL tasks.
- Convert ALL dates to YYYY-MM-DD format using the current year (${currentYear}) or next year if the date has already passed this year.
- "January 8" in ${currentYear} → "${currentYear}-01-08". If January 8 has passed, use "${currentYear + 1}-01-08".

Rules:
- Extract up to 20 tasks maximum
- If user's note specifies dates/assignees/project, apply to all tasks
- If NO clear action items found, return empty array []
- Be conservative - when in doubt, don't extract

Respond ONLY with a JSON array:
[{"title": "...", "description": null, "due_date": "${currentYear}-01-15", "assignee_text": "Chris", "project_name": "Feedback", "critical": false, "time_estimate": 30, "energy_level": "medium", "customer": "Acme Corp", "confidence": 0.9}]

If no tasks found, respond with: []`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    const content = data.content?.[0]?.text

    if (!content) {
      console.error('No content in Claude response')
      return null
    }

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    const tasks = JSON.parse(jsonStr)
    
    if (!Array.isArray(tasks)) {
      console.error('Claude response is not an array')
      return null
    }

    return tasks.slice(0, 20) // Enforce max 20 tasks
  } catch (error) {
    console.error('AI extraction error:', error)
    return null
  }
}

// Extract user's note from forwarded email (text before the forwarded content)
function extractUserNote(bodyText: string): string {
  if (!bodyText) return ''
  
  // Common forward markers
  const forwardMarkers = [
    '---------- Forwarded message ---------',
    '-------- Original Message --------',
    'Begin forwarded message:',
    '-----Original Message-----',
    'From:',
    '________________________________'
  ]
  
  let earliestIndex = bodyText.length
  for (const marker of forwardMarkers) {
    const idx = bodyText.indexOf(marker)
    if (idx > 0 && idx < earliestIndex) {
      earliestIndex = idx
    }
  }
  
  if (earliestIndex < bodyText.length) {
    return bodyText.substring(0, earliestIndex).trim()
  }
  
  return ''
}

// Strip email signatures from body text
function stripEmailSignatures(bodyText: string): string {
  if (!bodyText) return ''
  
  let cleaned = bodyText
  
  // Remove embedded image placeholders like [phone], [mail], [branding], [Visit Spicy Mango]
  cleaned = cleaned.replace(/\[[^\]]{1,30}\]/g, '')
  
  // Remove tel: and mailto: link noise like <tel:+44...> or <mailto:email@...>
  cleaned = cleaned.replace(/<tel:[^>]+>/g, '')
  cleaned = cleaned.replace(/<mailto:[^>]+>/g, '')
  
  // Remove URL links like <https://...>
  cleaned = cleaned.replace(/<https?:\/\/[^>]+>/g, '')
  
  // Detect signature blocks and remove them
  // Common patterns: Name followed by Title on next line, then contact info
  const signaturePatterns = [
    // Pattern: Name + Title + contact info block
    /\n[A-Z][a-z]+ [A-Z][a-z]+\n(Project Manager|Chief.*Officer|Director|Manager|CEO|CTO|CFO|COO|Founder|Partner|Consultant|Engineer|Developer|Designer|Analyst)[\s\S]*?(?=\nFrom:|$)/gi,
    // Pattern: Just contact details (phone, email, website on consecutive lines)
    /\n[+]?\d[\d\s()\-]{8,}[\s\S]*?(?=\nFrom:|$)/g,
  ]
  
  for (const pattern of signaturePatterns) {
    cleaned = cleaned.replace(pattern, '\n')
  }
  
  // Remove multiple consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  // Remove lines that are just whitespace and pipe characters (often separators)
  cleaned = cleaned.replace(/\n[\s|]+\n/g, '\n')
  
  return cleaned.trim()
}

// Match project name to project ID (case-insensitive, partial match)
function matchProjectId(projectName: string | null, projects: any[]): string | null {
  if (!projectName || projects.length === 0) return null
  
  const searchName = projectName.toLowerCase().trim()
  
  // Try exact match first
  const exactMatch = projects.find(p => p.name.toLowerCase() === searchName)
  if (exactMatch) return exactMatch.id
  
  // Try partial match (project name contains search or vice versa)
  const partialMatch = projects.find(p => 
    p.name.toLowerCase().includes(searchName) || 
    searchName.includes(p.name.toLowerCase())
  )
  if (partialMatch) return partialMatch.id
  
  return null
}

// Match customer from email domain
function matchCustomerFromEmail(fromAddress: string, customers: string[]): string | null {
  if (!fromAddress || customers.length === 0) return null
  
  // Extract domain from email (e.g., "ABC@Fifa.org" -> "fifa")
  const emailMatch = fromAddress.match(/@([^.]+)/i)
  if (!emailMatch) return null
  
  const emailDomain = emailMatch[1].toLowerCase()
  
  // Try to match domain to customer name
  for (const customer of customers) {
    const customerLower = customer.toLowerCase()
    // Match if domain contains customer name or customer name contains domain
    if (emailDomain.includes(customerLower) || customerLower.includes(emailDomain)) {
      return customer
    }
  }
  
  return null
}

// Parse user note for effort level
function parseEffortFromNote(note: string): string | null {
  if (!note) return null
  const lower = note.toLowerCase()
  if (/\b(quick|easy|simple|small|minor|fast)\b/.test(lower)) return 'low'
  if (/\b(complex|big|difficult|hard|large|major|extensive)\b/.test(lower)) return 'high'
  return null
}

// Parse user note for customer name ("for [Customer]" pattern)
function parseCustomerFromNote(note: string): string | null {
  if (!note) return null
  // Match "for [Customer Name]" - captures words after "for" until common stop words
  const match = note.match(/\bfor\s+([A-Z][a-zA-Z0-9\s]+?)(?:\s+(?:for|in|on|by|to|project|tasks?)\b|$)/i)
  if (match) {
    const customer = match[1].trim()
    // Filter out project-related words
    if (!/^(demo|feedback|test|the|this|my|our)$/i.test(customer)) {
      return customer
    }
  }
  return null
}

// Check if note mentions high priority
function parseHighPriorityFromNote(note: string): boolean {
  if (!note) return false
  return /\b(high\s*priority|urgent|critical|asap|important)\b/i.test(note)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // SendGrid sends multipart/form-data
    const formData = await req.formData()
    
    // Extract email fields from SendGrid payload
    const to = formData.get('to') as string || ''
    const from = formData.get('from') as string || ''
    const subject = formData.get('subject') as string || ''
    const text = formData.get('text') as string || ''
    const html = formData.get('html') as string || ''
    const headersRaw = formData.get('headers') as string || ''
    const attachmentInfo = formData.get('attachment-info') as string || '{}'
    
    // Check for high priority email (X-Priority: 1 or 2, or Importance: high)
    const isHighPriority = /X-Priority:\s*[12]\b/i.test(headersRaw) || 
                           /Importance:\s*high/i.test(headersRaw) ||
                           /X-MSMail-Priority:\s*High/i.test(headersRaw)
    
    // Parse attachment info
    let attachments: { name: string, type: string, content: Blob }[] = []
    try {
      const attachInfo = JSON.parse(attachmentInfo)
      for (const key of Object.keys(attachInfo)) {
        const file = formData.get(key) as File
        if (file) {
          attachments.push({
            name: attachInfo[key].filename || file.name,
            type: attachInfo[key]['content-type'] || file.type,
            content: file
          })
        }
      }
      console.log('Found attachments:', attachments.length)
    } catch (e) {
      console.log('No attachments or parse error:', e)
    }
    
    console.log('Received email:', { to, from, subject: subject.substring(0, 50), isHighPriority, attachmentCount: attachments.length })
    
    // Extract token from email address (tasks+TOKEN@inbound.gettrackli.com)
    const tokenMatch = to.match(/tasks\+([a-zA-Z0-9]+)@/)
    if (!tokenMatch) {
      console.error('Invalid email format - no token found:', to)
      return new Response(JSON.stringify({ error: 'Invalid email address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const token = tokenMatch[1]
    console.log('Extracted token:', token)
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Find user by token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('inbound_email_token', token)
      .single()
    
    if (profileError) {
      console.error('Profile lookup error:', profileError)
      return new Response(JSON.stringify({ error: 'Database error', details: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (!profile) {
      console.error('User not found for token:', token)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Found user:', profile.id)
    
    // Fetch user's projects for matching
    const { data: userProjects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', profile.id)
    
    // Fetch project customers
    const { data: projectCustomers } = await supabase
      .from('project_customers')
      .select('project_id, name')
      .in('project_id', userProjects?.map(p => p.id) || [])
    
    // Group customers by project
    const customersByProject: { [key: string]: string[] } = {}
    projectCustomers?.forEach(c => {
      if (!customersByProject[c.project_id]) customersByProject[c.project_id] = []
      customersByProject[c.project_id].push(c.name)
    })
    
    const projectNames = userProjects?.map(p => p.name) || []
    console.log('User projects:', projectNames)
    
    // Store the original email
    // Clean email body by stripping signatures
    const cleanedBodyText = stripEmailSignatures(text)
    
    const { data: emailSource, error: emailError } = await supabase
      .from('email_sources')
      .insert({
        user_id: profile.id,
        from_address: from,
        subject: subject,
        body_text: cleanedBodyText,
        body_html: html,
        raw_payload: Object.fromEntries(formData.entries())
      })
      .select()
      .single()
    
    if (emailError) {
      console.error('Failed to store email:', emailError)
      return new Response(JSON.stringify({ error: 'Failed to store email', details: emailError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Stored email source:', emailSource.id)
    
    // Upload email attachments to storage (filter out signature images)
    const uploadedAttachments: { name: string, path: string, size: number, type: string }[] = []
    for (const att of attachments) {
      // Skip embedded email images (typically signature elements)
      // These have generic names like "image001.png" from Outlook/email clients
      const isEmbeddedImage = att.type?.startsWith('image/') && 
        /^image\d+\.(png|jpg|jpeg|gif)$/i.test(att.name)
      
      if (isEmbeddedImage) {
        console.log('Skipping embedded signature image:', att.name, att.content.size, 'bytes')
        continue
      }
      
      try {
        const filePath = `email-attachments/${emailSource.id}/${att.name}`
        const arrayBuffer = await att.content.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, arrayBuffer, { contentType: att.type })
        
        if (!uploadError) {
          uploadedAttachments.push({
            name: att.name,
            path: filePath,
            size: att.content.size,
            type: att.type
          })
          console.log('Uploaded attachment:', att.name)
        } else {
          console.error('Failed to upload attachment:', att.name, uploadError)
        }
      } catch (e) {
        console.error('Error uploading attachment:', att.name, e)
      }
    }
    
    // Store attachment records
    if (uploadedAttachments.length > 0) {
      await supabase.from('email_attachments').insert(
        uploadedAttachments.map(att => ({
          email_source_id: emailSource.id,
          file_name: att.name,
          file_path: att.path,
          file_size: att.size,
          file_type: att.type
        }))
      )
      console.log('Stored attachment records:', uploadedAttachments.length)
    }
    
    // Extract user's note (text they added before forwarding)
    const userNote = extractUserNote(text)
    console.log('User note:', userNote ? userNote.substring(0, 100) : '(none)')
    
    // Try to find project mentioned in user note
    const projectFromNote = matchProjectId(userNote, userProjects || [])
    if (projectFromNote) {
      console.log('Project from user note:', projectFromNote)
    }
    
    // Parse user note for attributes to apply to all tasks
    const effortFromNote = parseEffortFromNote(userNote)
    const customerFromNote = parseCustomerFromNote(userNote)
    const criticalFromNote = parseHighPriorityFromNote(userNote)
    console.log('Parsed from user note:', { effortFromNote, customerFromNote, criticalFromNote })
    
    // Try AI extraction if API key is available
    let extractedTasks = null
    if (anthropicKey) {
      console.log('Attempting AI extraction...')
      extractedTasks = await extractTasksWithAI(subject, text, userNote, projectNames, anthropicKey)
      console.log('AI extracted tasks:', extractedTasks?.length || 0)
    } else {
      console.log('No ANTHROPIC_API_KEY, skipping AI extraction')
    }
    
    // If AI extraction failed or returned null, create a single fallback task
    if (extractedTasks === null) {
      extractedTasks = [{
        title: subject || 'Task from email',
        description: text?.substring(0, 500) || null,
        due_date: null,
        assignee_text: null,
        project_name: null,
        critical: false,
        confidence: 0.3
      }]
      console.log('AI failed, using fallback single task')
    } else if (extractedTasks.length === 0) {
      extractedTasks = [{
        title: subject || 'Review forwarded email',
        description: 'No specific action items extracted. Please review the original email.',
        due_date: null,
        assignee_text: null,
        project_name: null,
        critical: false,
        confidence: 0.2
      }]
      console.log('AI found no tasks, creating review task')
    }
    
    // Create pending tasks with project matching
    const pendingTasksToInsert = extractedTasks.map(task => {
      // First try to match project from task, then fall back to user note
      let matchedProjectId = matchProjectId(task.project_name, userProjects || [])
      if (!matchedProjectId && projectFromNote) {
        matchedProjectId = projectFromNote
        console.log(`Using project from user note for task: "${task.title}"`)
      }
      console.log(`Project match: "${task.project_name}" -> ${matchedProjectId}`)
      
      // Try to match customer: first from AI, then from user note, then from email domain
      let finalCustomer = task.customer || customerFromNote || null
      if (!finalCustomer && matchedProjectId) {
        const projectCustomerList = customersByProject[matchedProjectId] || []
        finalCustomer = matchCustomerFromEmail(from, projectCustomerList)
        if (finalCustomer) {
          console.log(`Customer match from email: "${from}" -> "${finalCustomer}"`)
        }
      }
      
      // Store original AI values for analytics tracking
      const aiOriginalValues = {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        assignee_text: task.assignee_text,
        project_name: task.project_name,
        customer: task.customer,
        energy_level: task.energy_level,
        critical: task.critical,
        time_estimate: task.time_estimate,
        confidence: task.confidence
      }
      
      // Auto-set effort from time (takes priority over AI extraction)
      let finalEffort = null
      if (task.time_estimate) {
        // Time-based effort always wins
        if (task.time_estimate <= 30) finalEffort = 'low'
        else if (task.time_estimate <= 120) finalEffort = 'medium'
        else finalEffort = 'high'
      } else {
        // Fall back to AI or user note
        finalEffort = task.energy_level || effortFromNote || null
      }
      
      return {
        user_id: profile.id,
        email_source_id: emailSource.id,
        title: task.title?.substring(0, 200) || 'Untitled task',
        description: task.description?.substring(0, 1000) || null,
        due_date: task.due_date || null,
        assignee_text: task.assignee_text || null,
        project_id: matchedProjectId,
        customer: finalCustomer,
        energy_level: finalEffort,
        critical: task.critical || criticalFromNote || isHighPriority || false,
        time_estimate: task.time_estimate || null,
        ai_confidence: task.confidence || 0.5,
        ai_original_values: aiOriginalValues,
        status: 'pending'
      }
    })
    
    const { data: pendingTasks, error: taskError } = await supabase
      .from('pending_tasks')
      .insert(pendingTasksToInsert)
      .select()
    
    if (taskError) {
      console.error('Failed to create pending tasks:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to create pending tasks', details: taskError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Created pending tasks:', pendingTasks.length)
    
    return new Response(JSON.stringify({ 
      success: true, 
      email_source_id: emailSource.id,
      pending_tasks_count: pendingTasks.length,
      pending_task_ids: pendingTasks.map(t => t.id)
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Error processing email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
