import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/**
 * Atlassian OAuth Callback Handler
 * 
 * This component handles the redirect from Atlassian after OAuth authorization.
 * It extracts the code and state from URL params, sends them to the Edge Function
 * for token exchange, and redirects based on the result.
 */
export default function AtlassianCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle error from Atlassian
    if (errorParam) {
      setStatus('error')
      setError(errorDescription || errorParam)
      setTimeout(() => navigate('/app?atlassian=error&message=' + encodeURIComponent(errorParam)), 3000)
      return
    }

    // Missing required params
    if (!code || !state) {
      setStatus('error')
      setError('Missing authorization code or state')
      setTimeout(() => navigate('/app?atlassian=error&message=missing_params'), 3000)
      return
    }

    try {
      // Determine callback URL (must match what was used in auth request)
      const origin = window.location.origin
      const callbackUrl = `${origin}/auth/atlassian/callback`

      // Call Edge Function to exchange code for tokens
      const { data, error: fnError } = await supabase.functions.invoke('atlassian-auth-callback', {
        body: {
          code,
          state,
          callbackUrl,
        },
      })

      if (fnError) {
        console.error('Edge function error:', fnError)
        setStatus('error')
        setError(fnError.message || 'Failed to complete authorization')
        setTimeout(() => navigate('/app?atlassian=error&message=server_error'), 3000)
        return
      }

      if (data?.error) {
        setStatus('error')
        setError(data.error)
        setTimeout(() => navigate('/app?atlassian=error&message=' + encodeURIComponent(data.error)), 3000)
        return
      }

      // Success!
      setStatus('success')
      const sitesCount = data?.connections?.length || 0
      setTimeout(() => navigate(`/app?atlassian=success&sites=${sitesCount}`), 1500)

    } catch (err) {
      console.error('Callback error:', err)
      setStatus('error')
      setError(err.message || 'An unexpected error occurred')
      setTimeout(() => navigate('/app?atlassian=error&message=unexpected_error'), 3000)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center p-8">
        {status === 'processing' && (
          <>
            <div className="relative mb-6">
              {/* Atlassian logo */}
              <div className="w-16 h-16 mx-auto bg-[#0052CC] rounded-2xl flex items-center justify-center">
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.5 14.5c-.6-1.6-.3-4.2 1.3-5.4 1.1-.8 2.5-1.1 3.8-.8.3.1.6.2.9.3l1.5-4.5c-1.4-.8-3.2-.9-4.7-.4-2.7.9-4.6 3.5-4.6 6.4 0 1.7.6 3.3 1.7 4.5l.1.1 3.9-3.9-2.3-2.3-.5.5-1.1 1.1c-.7.7-.7 1.8 0 2.5l2.8 2.8c.7.7 1.8.7 2.5 0l2.8-2.8c.7-.7.7-1.8 0-2.5L11.8 8l-1.5 4.5 1.4 1.4c.7.7.7 1.8 0 2.5l-2.8 2.8c-.7.7-1.8.7-2.5 0l-.9-.9L4 19.8c1.3 1.3 3.1 2.1 5 2.1 3.9 0 7-3.1 7-7 0-2.5-1.3-4.8-3.4-6.1l-1.5 4.5c.9.9.9 2.3 0 3.2l-2.8 2.8c-1.3 1.3-3.4 1.3-4.7 0L.8 16.5c0-.1.1-.2.1-.2l2.3-2.3c.6.3 1.3.5 2 .5h1.3z"/>
                </svg>
              </div>
              {/* Spinner */}
              <div className="absolute inset-0 w-16 h-16 mx-auto border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              Connecting to Atlassian...
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Please wait while we complete the authorization.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              Connected Successfully!
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Redirecting you back to Trackli...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              Connection Failed
            </h2>
            <p className="text-red-600 dark:text-red-400 mb-2">
              {error}
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              Redirecting you back to Trackli...
            </p>
          </>
        )}
      </div>
    </div>
  )
}
