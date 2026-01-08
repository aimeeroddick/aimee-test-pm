import { supabase } from '../lib/supabase'

/**
 * Track user events for analytics
 * @param {string} eventName - Name of the event (e.g., 'task_created', 'my_day_used')
 * @param {object} eventData - Optional additional data about the event
 */
export async function trackEvent(eventName, eventData = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return // Don't track anonymous users
    
    await supabase.from('user_events').insert({
      user_id: user.id,
      user_email: user.email,
      event_name: eventName,
      event_data: eventData
    })
  } catch (error) {
    // Silently fail - don't break the app for analytics
    console.error('Analytics error:', error)
  }
}

/**
 * Common events to track:
 * 
 * - task_created: { source: 'manual' | 'email' | 'ai_notes' }
 * - task_completed: { had_subtasks: boolean }
 * - task_deleted
 * - my_day_task_added
 * - my_day_viewed
 * - ai_breakdown_used: { subtask_count: number }
 * - ai_notes_used: { task_count: number }
 * - project_created
 * - view_changed: { view: 'board' | 'calendar' | 'myday' | 'table' }
 * - filter_used: { filter_type: string }
 * - email_forwarding_setup
 * - bulk_action_used: { action: string, count: number }
 */
