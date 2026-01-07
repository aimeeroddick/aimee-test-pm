import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { L } from '../lib/locale'

export default function Login() {
  const [searchParams] = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signup') === 'true')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '', '', ''])
  
  const { signIn, signUp, resetPassword, resendConfirmation, verifyOtp, user } = useAuth()
  const navigate = useNavigate()
  
  // Check URL parameters for confirmation states
  const isUnconfirmed = searchParams.get('unconfirmed') === 'true'
  const isAwaitingConfirmation = searchParams.get('awaiting_confirmation') === 'true'
  const emailFromParams = searchParams.get('email') || ''
  
  // Set email from URL params if present
  useEffect(() => {
    if (emailFromParams && !email) {
      setEmail(emailFromParams)
    }
  }, [emailFromParams])
  
  // Switch to sign-in mode if awaiting confirmation
  useEffect(() => {
    if (isAwaitingConfirmation) {
      setIsSignUp(false)
    }
  }, [isAwaitingConfirmation])
  
  // Show message for unconfirmed users
  useEffect(() => {
    if (isUnconfirmed && user && !user.email_confirmed_at) {
      setMessage('Please check your email and click the confirmation link to access Trackli.')
    }
  }, [isUnconfirmed, user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        setLoading(false)
        return
      }
      const { data, error } = await signUp(email, password)
      if (error) {
        setError(error.message)
      } else if (!data?.user?.identities || data.user.identities.length === 0) {
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        window.location.href = `/login?awaiting_confirmation=true&email=${encodeURIComponent(email)}`
        return
      }
    } else {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error.message)
      }
    }
    setLoading(false)
  }

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address')
      return
    }
    setLoading(true)
    setError('')
    
    const { error } = await resetPassword(email)
    if (error) {
      setError(error.message)
    } else {
      setMessage('Password reset email sent! Check your inbox.')
    }
    setLoading(false)
  }

  const handleTabClick = (signup) => {
    setIsSignUp(signup)
    setError('')
    setMessage('')
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      {/* Animated spectrum gradient background */}
      <div 
        className="absolute inset-0 animate-gradient-shift"
        style={{
          background: 'linear-gradient(135deg, #7C3AED, #A855F7, #EC4899, #F97316, #FBBF24, #34D399, #06B6D4, #7C3AED)',
          backgroundSize: '400% 400%',
        }}
      />
      
      {/* Floating blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-20 -left-20 w-96 h-96 bg-white/20 rounded-full blur-3xl animate-blob"
        />
        <div 
          className="absolute -bottom-32 -right-32 w-80 h-80 bg-white/15 rounded-full blur-3xl animate-blob-reverse"
          style={{ animationDelay: '-2s' }}
        />
        <div 
          className="absolute top-1/4 right-1/4 w-48 h-48 bg-white/10 rounded-full blur-2xl animate-blob"
          style={{ animationDelay: '-4s' }}
        />
      </div>
      
      {/* Centered form card */}
      <div className="relative z-10 w-full max-w-md">
        
        {/* Logo above card */}
        <div className="text-center mb-6 animate-gentle-pulse">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10">
              <svg viewBox="0 0 56 56" fill="none" className="w-full h-full drop-shadow-lg">
                <path d="M6 18L28 6L28 38L6 26Z" fill="white" fillOpacity="0.95"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="white" fillOpacity="0.8"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="white" fillOpacity="0.6"/>
                <path d="M18 19L25 26L36 14" fill="none" stroke="rgba(251, 146, 60, 0.9)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-2xl font-bold text-white drop-shadow-lg">Trackli</span>
          </Link>
          <p className="text-white/70 text-sm mt-1">Task management that sparks joy</p>
        </div>
        
        {/* Form Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8">
          
          {/* Sign up / Log in toggle - only show when not awaiting confirmation */}
          {!isAwaitingConfirmation && (
            <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
              <button 
                type="button"
                onClick={() => handleTabClick(true)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  isSignUp 
                    ? 'bg-white shadow-sm text-gray-900' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign up
              </button>
              <button 
                type="button"
                onClick={() => handleTabClick(false)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  !isSignUp 
                    ? 'bg-white shadow-sm text-gray-900' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Log in
              </button>
            </div>
          )}
          
          {/* Awaiting Confirmation State */}
          {isAwaitingConfirmation && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 text-center mb-2">Check Your Email</h2>
              <p className="text-gray-500 text-sm text-center mb-6">We sent a verification code to your email</p>
              
              <div className="p-6 bg-purple-50 border border-purple-100 rounded-xl text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-700 mb-2">
                  We sent a verification code to:
                </p>
                <p className="font-semibold text-gray-900 mb-4">
                  {emailFromParams || email}
                </p>
                
                {/* OTP Input */}
                <div className="flex justify-center gap-2 mb-4">
                  {otpCode.map((digit, index) => (
                    <input
                      key={index}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        const newOtp = [...otpCode]
                        newOtp[index] = value
                        setOtpCode(newOtp)
                        if (value && index < 7) {
                          const nextInput = document.getElementById(`otp-${index + 1}`)
                          nextInput?.focus()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
                          const prevInput = document.getElementById(`otp-${index - 1}`)
                          prevInput?.focus()
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault()
                        const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 8)
                        const newOtp = [...otpCode]
                        for (let i = 0; i < pastedData.length; i++) {
                          newOtp[i] = pastedData[i]
                        }
                        setOtpCode(newOtp)
                      }}
                      id={`otp-${index}`}
                      className="w-9 h-11 text-center text-lg font-bold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900"
                    />
                  ))}
                </div>
                
                <button
                  type="button"
                  onClick={async () => {
                    const code = otpCode.join('')
                    if (code.length !== 8) {
                      setError('Please enter the 8-digit code')
                      return
                    }
                    setLoading(true)
                    setError('')
                    setMessage('')
                    
                    const timeoutId = setTimeout(() => {
                      setError('Verification is taking too long. Please refresh the page and try again.')
                      setLoading(false)
                    }, 15000)
                    
                    try {
                      const { data, error } = await verifyOtp(emailFromParams || email, code)
                      clearTimeout(timeoutId)
                      if (error) {
                        if (error.message.includes('expired') || error.message.includes('invalid')) {
                          setError('Invalid or expired code. Please request a new code and try again.')
                        } else {
                          setError(error.message)
                        }
                        setLoading(false)
                      } else {
                        setLoading(false)
                        navigate('/app')
                      }
                    } catch (err) {
                      clearTimeout(timeoutId)
                      setError('Verification failed. Please refresh the page and try again.')
                      setLoading(false)
                    }
                  }}
                  disabled={loading || otpCode.join('').length !== 8}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 mb-3"
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>
                
                <p className="text-sm text-gray-500 mb-3">
                  Didn't receive the code? Check your spam folder or
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true)
                    setError('')
                    const { error } = await resendConfirmation(emailFromParams || email)
                    if (error) {
                      setError(error.message)
                    } else {
                      setMessage('Code resent! Check your inbox.')
                      setOtpCode(['', '', '', '', '', '', '', ''])
                    }
                    setLoading(false)
                  }}
                  disabled={loading}
                  className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                >
                  Resend Code
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to Sign In
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-600">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {message}
              </div>
              {isUnconfirmed && user && (
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true)
                    const { error } = await resendConfirmation(user.email)
                    if (error) {
                      setError(error.message)
                    } else {
                      setMessage('Confirmation email resent! Check your inbox.')
                    }
                    setLoading(false)
                  }}
                  disabled={loading}
                  className="mt-3 w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Resend Confirmation Email'}
                </button>
              )}
            </div>
          )}

          {!isAwaitingConfirmation && (
            <>
              <h2 className="text-xl font-semibold text-gray-800 text-center mb-2">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-gray-500 text-sm text-center mb-6">
                {isSignUp ? `Start ${L.organizing} your tasks today` : 'Sign in to continue to Trackli'}
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1.5">Confirm password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                      >
                        {showConfirmPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{isSignUp ? 'Creating account...' : 'Signing in...'}</span>
                    </>
                  ) : (
                    isSignUp ? 'Create Account' : 'Sign In'
                  )}
                </button>
              </form>

              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="w-full mt-4 text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                >
                  Forgot password?
                </button>
              )}

              {isSignUp && (
                <p className="text-center text-xs text-gray-400 mt-4">
                  By signing up, you agree to our{' '}
                  <Link to="/terms" className="text-purple-600 hover:underline">Terms</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>
                </p>
              )}
            </>
          )}
        </div>
        
        {/* Back to home link */}
        <p className="text-center mt-6">
          <Link to="/" className="text-white/80 text-sm hover:text-white transition-colors">← Back to home</Link>
        </p>
        
      </div>
      
      {/* CSS Animations */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 15s ease infinite;
        }
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-blob {
          animation: blob 8s ease-in-out infinite;
        }
        .animate-blob-reverse {
          animation: blob 10s ease-in-out infinite reverse;
        }
        @keyframes gentle-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-gentle-pulse {
          animation: gentle-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
