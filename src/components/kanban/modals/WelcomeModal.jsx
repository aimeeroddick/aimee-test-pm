import { useState, useRef } from 'react'

const WelcomeModal = ({ isOpen, onComplete, onUploadAvatar, initialEmail }) => {
  const [displayName, setDisplayName] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1) // 1 = name, 2 = photo (optional)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('Image must be less than 2MB')
        return
      }
      
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async () => {
    if (!displayName.trim()) return
    
    setLoading(true)
    try {
      // Upload avatar if selected
      let avatarUrl = null
      if (avatarFile && onUploadAvatar) {
        const { url, error } = await onUploadAvatar(avatarFile)
        if (!error) avatarUrl = url
      }
      
      await onComplete({
        display_name: displayName.trim(),
        avatar_url: avatarUrl
      })
    } catch (err) {
      console.error('Error saving profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSkipPhoto = async () => {
    setLoading(true)
    try {
      await onComplete({
        display_name: displayName.trim(),
        avatar_url: null
      })
    } catch (err) {
      console.error('Error saving profile:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get initials for avatar placeholder
  const getInitials = () => {
    if (!displayName.trim()) return '?'
    const parts = displayName.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return displayName.trim()[0].toUpperCase()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 px-6 py-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Welcome to Trackli!</h2>
          <p className="text-white/80 text-sm">Let's personalise your experience</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 ? (
            <>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What should we call you?
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoFocus
                className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                style={{ fontSize: '16px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && displayName.trim()) {
                    setStep(2)
                  }
                }}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                This will be shown in your daily greeting
              </p>

              <button
                onClick={() => setStep(2)}
                disabled={!displayName.trim()}
                className={`w-full mt-6 px-6 py-3 rounded-xl font-semibold text-white transition-all ${
                  displayName.trim()
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-xl'
                    : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Add a profile photo (optional)
                </p>
                
                {/* Avatar preview/upload */}
                <div className="relative w-24 h-24 mx-auto">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="w-24 h-24 rounded-full object-cover border-4 border-indigo-100 dark:border-indigo-900"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold border-4 border-indigo-100 dark:border-indigo-900">
                      {getInitials()}
                    </div>
                  )}
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-500 hover:bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSkipPhoto}
                  disabled={loading}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    "Let's go!"
                  )}
                </button>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full mt-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ← Back to name
              </button>
            </>
          )}
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-6 flex justify-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 1 ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 2 ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
        </div>
      </div>
    </div>
  )
}

export default WelcomeModal
