const GreetingIcon = ({ hour }) => {
  if (hour < 12) {
    // Morning - sunrise
    return (
      <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-8 sm:h-8">
        <defs>
          <linearGradient id="sunriseGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
        <path d="M4 22 L28 22" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="18" r="6" fill="url(#sunriseGrad)" />
        <line x1="16" y1="6" x2="16" y2="9" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
        <line x1="7" y1="12" x2="9" y2="14" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
        <line x1="25" y1="12" x2="23" y2="14" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  } else if (hour < 17) {
    // Afternoon - sun
    return (
      <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-8 sm:h-8">
        <defs>
          <linearGradient id="afternoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="6" fill="url(#afternoonGrad)" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <line key={i} x1="16" y1="4" x2="16" y2="7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 16 16)`} />
        ))}
      </svg>
    )
  } else {
    // Evening - moon with stars
    return (
      <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-8 sm:h-8">
        <defs>
          <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        {/* Crescent moon */}
        <circle cx="14" cy="16" r="8" fill="url(#moonGrad)" />
        <circle cx="18" cy="13" r="6" fill="#F8FAFC" className="dark:fill-gray-800" />
        {/* Stars */}
        <circle cx="26" cy="8" r="1.5" fill="#FCD34D" />
        <circle cx="24" cy="22" r="1" fill="#FCD34D" />
        <circle cx="6" cy="10" r="1" fill="#FCD34D" />
      </svg>
    )
  }
}

// Custom Empty State Icons
const EmptyStateIcons = {
  celebrate: () => (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <defs>
        <linearGradient id="celebrateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="16" fill="url(#celebrateGrad)" />
      <path d="M16 22 Q18 18 20 22 Q22 26 24 22 Q26 18 28 22 Q30 26 32 22" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="18" r="2" fill="white" />
      <circle cx="30" cy="18" r="2" fill="white" />
      <path d="M8 8 L12 14" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 8 L36 14" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 24 L10 24" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 24 L42 24" stroke="#F472B6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="36" r="2" fill="#FBBF24" />
      <circle cx="38" cy="36" r="2" fill="#A78BFA" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <defs>
        <linearGradient id="emptySunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="10" fill="url(#emptySunGrad)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="24" y1="6" x2="24" y2="10" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 24 24)`} />
      ))}
    </svg>
  ),
  folder: () => (
    <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-12 sm:h-12">
      <defs>
        <linearGradient id="emptyFolderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <path d="M6 14 L6 38 Q6 40 8 40 L40 40 Q42 40 42 38 L42 18 Q42 16 40 16 L24 16 L20 12 L8 12 Q6 12 6 14 Z" fill="url(#emptyFolderGrad)" />
      <line x1="18" y1="26" x2="30" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="18" y1="32" x2="26" y2="32" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  ),
}

const EmptyState = ({ icon, title, description, action, actionLabel, variant = 'default' }) => {
  const variants = {
    default: 'from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30',
    success: 'from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30',
    warning: 'from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30',
    celebrate: 'from-pink-100 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30',
  }
  
  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-6 sm:px-8 text-center animate-fadeIn">
      <div className="relative mb-6">
        {/* Decorative rings */}
        <div className={`absolute inset-0 w-24 h-24 rounded-full bg-gradient-to-br ${variants[variant]} opacity-50 animate-pulse`} style={{ transform: 'scale(1.3)' }} />
        <div className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br ${variants[variant]} flex items-center justify-center shadow-lg`}>
          {EmptyStateIcons[icon] ? EmptyStateIcons[icon]() : <div className="text-3xl sm:text-4xl">{icon}</div>}
        </div>
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-300 mb-6 max-w-xs sm:max-w-sm leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action}
          className="group px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="flex items-center gap-2">
            {actionLabel}
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}

export { GreetingIcon, EmptyState, EmptyStateIcons }
