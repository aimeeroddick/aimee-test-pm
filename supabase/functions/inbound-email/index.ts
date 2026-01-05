// Supabase Edge Function: Receive inbound emails and create pending tasks
// Deploy with: supabase functions deploy inbound-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    
    console.log('Received email:', { to, from, subject: subject.substring(0, 50) })
    
    // Extract token from email address (tasks+TOKEN@inbound.trackli.app)
    const tokenMatch = to.match(/tasks\+([a-zA-Z0-9]+)@/)
    if (!tokenMatch) {
      console.error('Invalid email format - no token found:', to)
      return new Response(JSON.stringify({ error: 'Invalid email address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const token = tokenMatch[1]
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Find user by token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('inbound_email_token', token)
      .single()
    
    if (profileError || !profile) {
      console.error('User not found for token:', token)
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Found user:', profile.email)
    
    // Store the original email
    const { data: emailSource, error: emailError } = await supabase
      .from('email_sources')
      .insert({
        user_id: profile.id,
        from_address: from,
        subject: subject,
        body_text: text,
        body_html: html,
        raw_payload: Object.fromEntries(formData.entries())
      })
      .select()
      .single()
    
    if (emailError) {
      console.error('Failed to store email:', emailError)
      return new Response(JSON.stringify({ error: 'Failed to store email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Stored email source:', emailSource.id)
    
    // For now, create a single pending task from the email
    // (AI extraction will be added in Chunk 3)
    const taskTitle = subject || 'Task from email'
    
    const { data: pendingTask, error: taskError } = await supabase
      .from('pending_tasks')
      .insert({
        user_id: profile.id,
        email_source_id: emailSource.id,
        title: taskTitle,
        description: text?.substring(0, 1000) || null,
        ai_confidence: 0.5, // Low confidence since no AI yet
        status: 'pending'
      })
      .select()
      .single()
    
    if (taskError) {
      console.error('Failed to create pending task:', taskError)
      return new Response(JSON.stringify({ error: 'Failed to create pending task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log('Created pending task:', pendingTask.id)
    
    return new Response(JSON.stringify({ 
      success: true, 
      email_source_id: emailSource.id,
      pending_task_id: pendingTask.id
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
