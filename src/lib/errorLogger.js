import { supabase } from './supabase'

// Log error to Supabase error_logs table
export const logError = async (error, context = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    
    await supabase.from('error_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || 'anonymous',
      error_message: error?.message || String(error) || 'Unknown error',
      error_stack: error?.stack || '',
      component_stack: context.componentStack || '',
      url: window.location.href,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      app_version: '2.11.44',
      context: JSON.stringify({
        ...context,
        type: context.type || 'runtime_error'
      })
    })
  } catch (e) {
    // Silently fail - don't crash the app trying to log an error
    console.error('Failed to log error:', e)
  }
}

// Wrapper for API calls that logs failures
export const safeApiCall = async (apiCall, context = {}) => {
  try {
    const result = await apiCall()
    return result
  } catch (error) {
    await logError(error, { ...context, type: 'api_error' })
    throw error // Re-throw so calling code can handle it
  }
}

// Log specific error types
export const logApiError = (error, endpoint) => 
  logError(error, { type: 'api_error', endpoint })

export const logAuthError = (error, action) => 
  logError(error, { type: 'auth_error', action })

export const logRenderError = (error, component) => 
  logError(error, { type: 'render_error', component })
