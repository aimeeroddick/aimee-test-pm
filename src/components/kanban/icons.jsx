// Shared SVG icons for Kanban components

// Toast Notification Icons
export const ToastIcons = {
  success: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="12" r="10" fill="#10B981" />
      <path d="M8 12l2.5 2.5L16 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  error: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="12" r="10" fill="#EF4444" />
      <path d="M12 7v5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill="white" />
    </svg>
  ),
  warning: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
      <path d="M12 3L2 21h20L12 3z" fill="#F59E0B" />
      <path d="M12 9v5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.5" fill="white" />
    </svg>
  ),
  info: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
      <circle cx="12" cy="12" r="10" fill="#3B82F6" />
      <circle cx="12" cy="8" r="1.5" fill="white" />
      <path d="M12 11v6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
}

// Empty State Icons for Kanban Columns
export const ColumnEmptyIcons = {
  backlog: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="3" y="6" width="18" height="14" rx="2" fill="#9CA3AF" />
      <rect x="3" y="6" width="18" height="4" rx="2" fill="#6B7280" />
      <rect x="7" y="12" width="10" height="2" rx="1" fill="#E5E7EB" />
      <rect x="7" y="15" width="6" height="2" rx="1" fill="#E5E7EB" opacity="0.7" />
    </svg>
  ),
  todo: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <rect x="7" y="7" width="10" height="2" rx="1" fill="#3B82F6" />
      <rect x="7" y="11" width="8" height="2" rx="1" fill="#93C5FD" />
      <rect x="7" y="15" width="6" height="2" rx="1" fill="#93C5FD" opacity="0.7" />
    </svg>
  ),
  in_progress: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="9" fill="#FCE7F3" stroke="#EC4899" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  done: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="12" r="9" fill="#D1FAE5" stroke="#10B981" strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
}

// Task Card Icons - SVG replacements for emojis
export const TaskCardIcons = {
  sun: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="5" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="12" y1="2" x2="12" y2="5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 12 12)`} />
      ))}
    </svg>
  ),
  flag: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 21V4" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 4h12l-3 4 3 4H4" fill="#EF4444" />
    </svg>
  ),
  lock: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" fill="#F97316" />
      <path d="M8 11V7a4 4 0 018 0v4" stroke="#EA580C" strokeWidth="2" fill="none" />
      <circle cx="12" cy="16" r="1.5" fill="#FED7AA" />
    </svg>
  ),
  repeat: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M17 2l4 4-4 4" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 11V9a4 4 0 014-4h14" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M7 22l-4-4 4-4" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M21 13v2a4 4 0 01-4 4H3" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  ),
  timer: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="13" r="8" fill="#E0E7FF" stroke="#6366F1" strokeWidth="1.5" />
      <path d="M12 9v4l2.5 2.5" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 2h4" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 2v2" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  calendar: (className = "w-3.5 h-3.5") => (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#FEE2E2" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#EF4444" />
      <circle cx="7" cy="3" r="1.5" fill="#DC2626" />
      <circle cx="17" cy="3" r="1.5" fill="#DC2626" />
      <rect x="6" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="10.5" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
    </svg>
  ),
}

export const MenuIcons = {
  myday: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="12" y1="3" x2="12" y2="5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 12 12)`} />
      ))}
    </svg>
  ),
  lightbulb: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M12 2 C8 2 5 5 5 9 C5 12 7 14 8 15 L8 18 L16 18 L16 15 C17 14 19 12 19 9 C19 5 16 2 12 2 Z" fill="#FCD34D" />
      <rect x="9" y="19" width="6" height="2" rx="1" fill="#F59E0B" />
      <rect x="10" y="21" width="4" height="1" rx="0.5" fill="#D97706" />
      <path d="M9 9 L12 12 L15 9" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  ),
}
