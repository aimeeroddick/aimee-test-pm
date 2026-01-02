import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// Lazy load confetti - only needed when completing tasks
const loadConfetti = () => import('canvas-confetti').then(m => m.default)

// Constants
const ENERGY_LEVELS = {
  high: { bg: '#FEE2E2', text: '#DC2626', icon: '▰▰▰', label: 'High Effort' },
  medium: { bg: '#FEF3C7', text: '#D97706', icon: '▰▰', label: 'Medium Effort' },
  low: { bg: '#D1FAE5', text: '#059669', icon: '▰', label: 'Low Effort' },
}

const CATEGORIES = [
  { id: 'meeting_followup', label: 'Meeting Follow-up', color: '#8B5CF6' },
  { id: 'email', label: 'Email', color: '#3B82F6' },
  { id: 'deliverable', label: 'Deliverable', color: '#10B981' },
  { id: 'admin', label: 'Admin', color: '#4B5563' },
  { id: 'review', label: 'Review/Approval', color: '#F59E0B' },
  { id: 'call', label: 'Call/Meeting', color: '#EC4899' },
  { id: 'research', label: 'Research', color: '#14B8A6' },
]

const SOURCES = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'meeting', label: 'Meeting', icon: '👥' },
  { id: 'slack', label: 'Slack/Teams', icon: '💬' },
  { id: 'ad_hoc', label: 'Ad-hoc', icon: '💡' },
  { id: 'project_plan', label: 'Project Plan', icon: '📋' },
  { id: 'client_request', label: 'Client Request', icon: '🎯' },
]

const RECURRENCE_TYPES = [
  { id: null, label: 'No recurrence' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Bi-weekly (every 2 weeks)' },
  { id: 'monthly', label: 'Monthly' },
]

const COLUMN_COLORS = {
  backlog: '#9CA3AF',
  todo: '#3B82F6',
  in_progress: '#EC4899',
  blocked: '#EF4444',
  done: '#64748B',
}

const COLUMNS = [
  { id: 'backlog', title: 'Backlog', subtitle: 'Future work', color: COLUMN_COLORS.backlog },
  { id: 'todo', title: 'To Do', subtitle: 'Ready to start', color: COLUMN_COLORS.todo },
  { id: 'in_progress', title: 'In Progress', subtitle: 'Active work', color: COLUMN_COLORS.in_progress },
  { id: 'done', title: 'Done', subtitle: 'Completed', color: COLUMN_COLORS.done },
]

const DONE_DISPLAY_LIMIT = 5
const BACKLOG_DISPLAY_LIMIT = 10

// Customer colors for auto-assignment
const CUSTOMER_COLORS = [
  { bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
  { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD' },
  { bg: '#D1FAE5', text: '#059669', border: '#6EE7B7' },
  { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' },
  { bg: '#FCE7F3', text: '#DB2777', border: '#F9A8D4' },
  { bg: '#E0E7FF', text: '#4F46E5', border: '#A5B4FC' },
  { bg: '#CCFBF1', text: '#0D9488', border: '#5EEAD4' },
  { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
  { bg: '#F3E8FF', text: '#9333EA', border: '#D8B4FE' },
  { bg: '#CFFAFE', text: '#0891B2', border: '#67E8F9' },
]

const getCustomerColor = (customerName) => {
  if (!customerName) return null
  // Auto-assigned color based on name
  let hash = 0
  for (let i = 0; i < customerName.length; i++) {
    hash = customerName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CUSTOMER_COLORS[Math.abs(hash) % CUSTOMER_COLORS.length]
}

// Utility functions
const getDueDateStatus = (dueDate, status) => {
  if (!dueDate || status === 'done') return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 3) return 'soon'
  return 'ok'
}

const isReadyToStart = (task) => {
  if (task.status !== 'backlog') return false
  if (!task.start_date) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(task.start_date)
  start.setHours(0, 0, 0, 0)
  return start <= today
}

const isBlocked = (task, allTasks) => {
  if (!task.dependencies || task.dependencies.length === 0) return false
  if (task.status === 'done') return false
  
  return task.dependencies.some(dep => {
    const depTask = allTasks.find(t => t.id === dep.depends_on_id)
    return depTask && depTask.status !== 'done'
  })
}

// Check if task is in My Day (auto-included by start date OR manually added)
const isInMyDay = (task) => {
  // This function is used for the sun indicator on board cards
  // Done tasks should NOT show the sun indicator
  if (task.status === 'done') return false
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check if task was dismissed (my_day_date set to a past date)
  if (task.my_day_date) {
    const myDayDate = new Date(task.my_day_date)
    myDayDate.setHours(0, 0, 0, 0)
    // If my_day_date < today, task was dismissed
    if (myDayDate < today) return false
    // If my_day_date = today, task was manually added
    if (myDayDate.getTime() === today.getTime()) return true
  }
  
  // Auto-included: start_date <= today
  if (task.start_date) {
    const startDate = new Date(task.start_date)
    startDate.setHours(0, 0, 0, 0)
    if (startDate <= today) return true
  }
  
  return false
}

// Calculate next future occurrence based on original start date and recurrence pattern
const getNextRecurrenceDate = (originalStartDate, recurrenceType) => {
  if (!originalStartDate || !recurrenceType) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let nextDate = new Date(originalStartDate)
  nextDate.setHours(0, 0, 0, 0)
  
  // Get the interval in days/months
  const addInterval = (date) => {
    switch (recurrenceType) {
      case 'daily':
        date.setDate(date.getDate() + 1)
        break
      case 'weekly':
        date.setDate(date.getDate() + 7)
        break
      case 'biweekly':
        date.setDate(date.getDate() + 14)
        break
      case 'monthly':
        date.setMonth(date.getMonth() + 1)
        break
      default:
        return null
    }
    return date
  }
  
  // Keep adding intervals until we find a future date
  // (handles case where task is completed late)
  let iterations = 0
  const maxIterations = 365 // Safety limit
  
  while (nextDate <= today && iterations < maxIterations) {
    addInterval(nextDate)
    iterations++
  }
  
  return nextDate.toISOString().split('T')[0]
}

// Generate multiple future occurrence dates for recurring tasks
// Generate future occurrence dates - either by count or until end date
const generateFutureOccurrences = (startDate, recurrenceType, count, endDate = null) => {
  if (!startDate || !recurrenceType) return []
  
  const occurrences = []
  let currentDate = new Date(startDate)
  currentDate.setHours(0, 0, 0, 0)
  
  let endDateTime = null
  if (endDate) {
    endDateTime = new Date(endDate)
    endDateTime.setHours(23, 59, 59, 999)
  }
  
  const addInterval = (date) => {
    switch (recurrenceType) {
      case 'daily':
        date.setDate(date.getDate() + 1)
        break
      case 'weekly':
        date.setDate(date.getDate() + 7)
        break
      case 'biweekly':
        date.setDate(date.getDate() + 14)
        break
      case 'monthly':
        date.setMonth(date.getMonth() + 1)
        break
      default:
        return null
    }
    return date
  }
  
  const maxIterations = endDate ? 365 : count // Safety limit for end date mode
  let iterations = 0
  
  while (iterations < maxIterations) {
    addInterval(currentDate)
    
    // If using end date, check if we've passed it
    if (endDateTime && currentDate > endDateTime) break
    
    occurrences.push(currentDate.toISOString().split('T')[0])
    iterations++
    
    // If using count, stop when we reach it
    if (!endDate && iterations >= count) break
  }
  
  return occurrences
}

// Get number of future occurrences to create based on recurrence type
const getOccurrenceCount = (recurrenceType) => {
  switch (recurrenceType) {
    case 'daily': return 14    // 2 weeks ahead
    case 'weekly': return 8    // 8 weeks ahead
    case 'biweekly': return 6  // 12 weeks ahead
    case 'monthly': return 6   // 6 months ahead
    default: return 0
  }
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Detect if user's locale uses MM/DD (US) or DD/MM (most other countries)
// Uses January 15 as test - if first number is 1, it's month-first (US)
// If first number is 15, it's day-first (UK/EU)
const isUSDateFormat = () => {
  const testDate = new Date(2000, 0, 15) // January 15, 2000
  const formatted = testDate.toLocaleDateString()
  const firstNum = parseInt(formatted.split(/[\/\-\.]/)[0])
  return firstNum === 1 // Month (1) comes first = US format
}

const formatTimeEstimate = (minutes) => {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Flexible time parser - accepts various formats like "230 pm", "2:30pm", "14:30", "9am", "9", etc.
const parseFlexibleTime = (input) => {
  if (!input) return ''
  
  // Clean the input
  let str = input.toString().trim().toLowerCase()
  
  // If already in HH:MM format, return as-is
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  
  // Check for AM/PM
  const isPM = /pm|p\.m\.|p$/.test(str)
  const isAM = /am|a\.m\.|a$/.test(str)
  
  // Remove AM/PM indicators and spaces
  str = str.replace(/\s*(am|pm|a\.m\.|p\.m\.|a|p)\s*/gi, '').trim()
  
  let hours = 0
  let minutes = 0
  
  if (str.includes(':')) {
    // Format: "2:30" or "14:30"
    const parts = str.split(':')
    hours = parseInt(parts[0]) || 0
    minutes = parseInt(parts[1]) || 0
  } else if (str.length === 1 || str.length === 2) {
    // Format: "9" or "14" - just hours
    hours = parseInt(str) || 0
    minutes = 0
  } else if (str.length === 3) {
    // Format: "230" -> 2:30 or "930" -> 9:30
    hours = parseInt(str[0]) || 0
    minutes = parseInt(str.slice(1)) || 0
  } else if (str.length === 4) {
    // Format: "0930" or "1430" -> 09:30 or 14:30
    hours = parseInt(str.slice(0, 2)) || 0
    minutes = parseInt(str.slice(2)) || 0
  } else {
    return '' // Can't parse
  }
  
  // Apply AM/PM conversion
  if (isPM && hours < 12) {
    hours += 12
  } else if (isAM && hours === 12) {
    hours = 0
  }
  
  // Validate
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return ''
  }
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// Natural language date parser
const parseNaturalLanguageDate = (text) => {
  if (!text) return { date: null, cleanedText: '', matched: null }
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check for shorthand format first: T, T+1, D+3, W+1, M+2, etc.
  const shorthandMatch = text.trim().match(/^([TDWM])([+-]\d+)?$/i)
  if (shorthandMatch) {
    const type = shorthandMatch[1].toUpperCase()
    const offset = shorthandMatch[2] ? parseInt(shorthandMatch[2]) : 0
    const d = new Date(today)
    
    switch (type) {
      case 'T': // Today + days
      case 'D': // Days
        d.setDate(d.getDate() + offset)
        break
      case 'W': // Weeks
        d.setDate(d.getDate() + (offset * 7))
        break
      case 'M': // Months
        d.setMonth(d.getMonth() + offset)
        break
    }
    
    return {
      date: d.toISOString().split('T')[0],
      cleanedText: '',
      matched: text.trim()
    }
  }
  
  const patterns = [
    // Today/Tomorrow
    { regex: /\b(today)\b/i, fn: () => new Date(today) },
    { regex: /\b(tomorrow)\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d } },
    { regex: /\b(yesterday)\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() - 1); return d } },
    
    // Day names
    { regex: /\b(next\s+)?(monday)\b/i, fn: (m) => getNextDayOfWeek(1, m[1]) },
    { regex: /\b(next\s+)?(tuesday)\b/i, fn: (m) => getNextDayOfWeek(2, m[1]) },
    { regex: /\b(next\s+)?(wednesday)\b/i, fn: (m) => getNextDayOfWeek(3, m[1]) },
    { regex: /\b(next\s+)?(thursday)\b/i, fn: (m) => getNextDayOfWeek(4, m[1]) },
    { regex: /\b(next\s+)?(friday)\b/i, fn: (m) => getNextDayOfWeek(5, m[1]) },
    { regex: /\b(next\s+)?(saturday)\b/i, fn: (m) => getNextDayOfWeek(6, m[1]) },
    { regex: /\b(next\s+)?(sunday)\b/i, fn: (m) => getNextDayOfWeek(0, m[1]) },
    
    // Relative days
    { regex: /\bin\s+(\d+)\s+days?\b/i, fn: (m) => { const d = new Date(today); d.setDate(d.getDate() + parseInt(m[1])); return d } },
    { regex: /\bin\s+(\d+)\s+weeks?\b/i, fn: (m) => { const d = new Date(today); d.setDate(d.getDate() + parseInt(m[1]) * 7); return d } },
    { regex: /\bin\s+(\d+)\s+months?\b/i, fn: (m) => { const d = new Date(today); d.setMonth(d.getMonth() + parseInt(m[1])); return d } },
    
    // Next week/month
    { regex: /\bnext\s+week\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + 7); return d } },
    { regex: /\bnext\s+month\b/i, fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1); return d } },
    
    // End of week/month
    { regex: /\bend\s+of\s+week\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + (5 - d.getDay())); return d } },
    { regex: /\bend\s+of\s+month\b/i, fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return d } },
  ]
  
  function getNextDayOfWeek(dayOfWeek, isNext) {
    const result = new Date(today)
    const currentDay = result.getDay()
    let daysUntil = dayOfWeek - currentDay
    
    if (daysUntil <= 0 || isNext) {
      daysUntil += 7
    }
    if (isNext && daysUntil <= 7) {
      daysUntil += 7
    }
    
    result.setDate(result.getDate() + daysUntil)
    return result
  }
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex)
    if (match) {
      const date = pattern.fn(match)
      const cleanedText = text.replace(pattern.regex, '').replace(/\s+/g, ' ').trim()
      return {
        date: date.toISOString().split('T')[0],
        cleanedText,
        matched: match[0]
      }
    }
  }
  
  // Parse numeric dates (DD/MM/YYYY or MM/DD/YYYY based on locale)
  const isUSLocale = isUSDateFormat()
  
  // Full date with year: DD/MM/YYYY or MM/DD/YYYY
  let numericMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (numericMatch) {
    let day, month
    if (isUSLocale) {
      month = parseInt(numericMatch[1]) - 1
      day = parseInt(numericMatch[2])
    } else {
      day = parseInt(numericMatch[1])
      month = parseInt(numericMatch[2]) - 1
    }
    const year = numericMatch[3].length === 2 ? 2000 + parseInt(numericMatch[3]) : parseInt(numericMatch[3])
    const d = new Date(year, month, day)
    if (!isNaN(d.getTime())) {
      return {
        date: d.toISOString().split('T')[0],
        cleanedText: '',
        matched: text.trim()
      }
    }
  }
  
  // Short date without year: DD/MM or MM/DD
  numericMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (numericMatch) {
    let day, month
    if (isUSLocale) {
      month = parseInt(numericMatch[1]) - 1
      day = parseInt(numericMatch[2])
    } else {
      day = parseInt(numericMatch[1])
      month = parseInt(numericMatch[2]) - 1
    }
    const d = new Date(today.getFullYear(), month, day)
    // If date is in the past, assume next year
    if (d < today) {
      d.setFullYear(d.getFullYear() + 1)
    }
    if (!isNaN(d.getTime())) {
      return {
        date: d.toISOString().split('T')[0],
        cleanedText: '',
        matched: text.trim()
      }
    }
  }

  return { date: null, cleanedText: text, matched: null }
}

// Smart date shortcuts for UI
const DATE_SHORTCUTS = [
  { label: 'Today', getValue: () => new Date().toISOString().split('T')[0] },
  { label: 'Tomorrow', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] } },
  { label: 'Next Week', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] } },
  { label: 'Next Month', getValue: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0] } },
]

// Toast Component for undo actions
const Toast = ({ message, action, actionLabel, onClose, duration = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])
  
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl shadow-lg">
        <span className="text-sm font-medium">{message}</span>
        {action && (
          <button
            onClick={() => { action(); onClose(); }}
            className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-gray-900/20 hover:bg-white/30 dark:hover:bg-gray-900/30 rounded-lg transition-colors"
          >
            {actionLabel || 'Undo'}
          </button>
        )}
        <button onClick={onClose} className="p-2 sm:p-1 hover:bg-white/20 dark:hover:bg-gray-900/20 rounded transition-colors touch-manipulation">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Confirm Modal Component - replaces browser confirm()
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmStyle = 'danger', icon = '⚠️', loading = false }) => {
  // Keyboard shortcuts: Enter to confirm, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !loading) onConfirm()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, onConfirm, loading])
  
  if (!isOpen) return null
  
  const confirmButtonStyles = {
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    primary: 'bg-indigo-500 hover:bg-indigo-600 text-white',
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="text-xl">{icon}</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <p className="mb-6 text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${confirmButtonStyles[confirmStyle]} disabled:opacity-50`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Pull to Refresh Component for Mobile
const PullToRefresh = ({ onRefresh, children }) => {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const PULL_THRESHOLD = 80
  
  const handleTouchStart = (e) => {
    // Only activate if at the top of window scroll
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }
  
  const handleTouchMove = (e) => {
    if (isRefreshing || touchStartY.current === 0) return
    if (window.scrollY > 0) {
      touchStartY.current = 0
      setPullDistance(0)
      return
    }
    
    const currentY = e.touches[0].clientY
    const diff = currentY - touchStartY.current
    
    if (diff > 0) {
      // Apply resistance to make pull feel natural
      const resistance = Math.min(diff * 0.4, PULL_THRESHOLD + 40)
      setPullDistance(resistance)
      // Prevent default scroll when pulling
      if (resistance > 10) e.preventDefault()
    }
  }
  
  const handleTouchEnd = async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(PULL_THRESHOLD)
      
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
    touchStartY.current = 0
  }
  
  useEffect(() => {
    // Only add listeners on mobile/touch devices
    const isTouchDevice = 'ontouchstart' in window
    if (!isTouchDevice) return
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isRefreshing, pullDistance])
  
  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1)
  
  return (
    <>
      {/* Pull indicator - fixed at top */}
      <div 
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-all duration-200 overflow-hidden bg-gradient-to-b from-indigo-50 to-transparent dark:from-indigo-900/30 sm:hidden"
        style={{ height: pullDistance > 0 ? `${pullDistance}px` : 0 }}
      >
        <div className={`flex items-center gap-2 text-indigo-600 dark:text-indigo-400 ${
          isRefreshing ? 'animate-pulse' : ''
        }`}>
          <svg 
            className={`w-5 h-5 transition-transform duration-200 ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            style={{ transform: isRefreshing ? 'none' : `rotate(${progress * 180}deg)` }}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            {isRefreshing ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            )}
          </svg>
          <span className="text-sm font-medium">
            {isRefreshing ? 'Refreshing...' : progress >= 1 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      </div>
      {children}
    </>
  )
}

// Feedback Modal Component
const FeedbackModal = ({ isOpen, onClose, user }) => {
  const [type, setType] = useState('suggestion')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState([]) // Array of { base64, preview }
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    if (!isOpen) {
      // Reset form when closed
      setTimeout(() => {
        setType('suggestion')
        setMessage('')
        setImages([])
        setSubmitted(false)
        setError(null)
      }, 300)
    }
  }, [isOpen])
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])
  
  // Handle paste for images
  useEffect(() => {
    const handlePaste = (e) => {
      if (!isOpen) return
      
      const items = e.clipboardData?.items
      if (!items) return
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) processImageFile(file)
          break
        }
      }
    }
    
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [isOpen, images])
  
  const processImageFile = (file) => {
    if (images.length >= 3) {
      setError('Maximum 3 images allowed')
      return
    }
    
    const img = new Image()
    const reader = new FileReader()
    
    reader.onload = (event) => {
      img.onload = () => {
        // Max dimensions
        const maxWidth = 1500
        const maxHeight = 1500
        let { width, height } = img
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const base64 = compressedDataUrl.split(',')[1]
        
        setImages(prev => [...prev, { base64, preview: compressedDataUrl }])
        setError(null)
      }
      
      img.onerror = () => setError('Failed to load image')
      img.src = event.target.result
    }
    
    reader.onerror = () => setError('Failed to read image')
    reader.readAsDataURL(file)
  }
  
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) processImageFile(file)
    e.target.value = '' // Reset input
  }
  
  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    
    setSubmitting(true)
    setError(null)
    try {
      // Upload images to Supabase Storage if any
      const imageUrls = []
      for (const image of images) {
        const fileName = `feedback/${user?.id || 'anonymous'}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
        
        // Convert base64 to blob
        const byteCharacters = atob(image.base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'image/jpeg' })
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(fileName, blob)
        
        if (uploadError) {
          console.error('Upload error:', uploadError)
        } else {
          const { data: urlData } = supabase.storage
            .from('attachments')
            .getPublicUrl(fileName)
          if (urlData?.publicUrl) {
            imageUrls.push(urlData.publicUrl)
          }
        }
      }
      
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id,
        user_email: user?.email,
        type,
        message: message.trim(),
        images: imageUrls.length > 0 ? imageUrls : null,
        page: window.location.pathname,
      })
      
      if (error) throw error
      setSubmitted(true)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      console.error('Error submitting feedback:', err)
      setError('Failed to submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  
  if (!isOpen) return null
  
  const feedbackTypes = [
    { id: 'bug', label: '🐛 Bug', desc: 'Something isn\'t working' },
    { id: 'suggestion', label: '💡 Suggestion', desc: 'Ideas for improvement' },
    { id: 'question', label: '❓ Question', desc: 'Need help with something' },
    { id: 'other', label: '💬 Other', desc: 'General feedback' },
  ]
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-modalSlideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Thanks for your feedback!</h3>
            <p className="text-gray-600 dark:text-gray-400">We really appreciate you taking the time to help us improve.</p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Send Feedback</h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Help us make Trackli better!</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {feedbackTypes.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        type === t.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white text-sm">{t.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what's on your mind..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  required
                />
              </div>
              
              {/* Image Upload Section */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Screenshots (optional)</label>
                
                {/* Display uploaded images */}
                {images.length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {images.map((img, index) => (
                      <div key={index} className="relative">
                        <img 
                          src={img.preview} 
                          alt={`Screenshot ${index + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {images.length < 3 && (
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Add image or paste from clipboard</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
                
                {error && (
                  <p className="text-sm text-red-500 mt-2">{error}</p>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// Admin Feedback Panel Component
const ADMIN_EMAIL = 'roddickaimee@gmail.com'

const AdminFeedbackPanel = ({ isOpen, onClose, userEmail }) => {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, new, read, resolved
  
  const isAdmin = userEmail === ADMIN_EMAIL
  
  useEffect(() => {
    if (isOpen && isAdmin) {
      loadFeedback()
    }
  }, [isOpen, isAdmin])
  
  const loadFeedback = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setFeedback(data || [])
    } catch (err) {
      console.error('Error loading feedback:', err)
    } finally {
      setLoading(false)
    }
  }
  
  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ status })
        .eq('id', id)
      
      if (error) throw error
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, status } : f))
    } catch (err) {
      console.error('Error updating feedback:', err)
    }
  }
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])
  
  if (!isOpen || !isAdmin) return null
  
  const filteredFeedback = filter === 'all' ? feedback : feedback.filter(f => f.status === filter)
  
  const typeIcons = {
    bug: '🐛',
    suggestion: '💡',
    question: '❓',
    other: '💬'
  }
  
  const statusColors = {
    new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    read: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4" onClick={onClose}>
      <div 
        className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-modalSlideUp flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Feedback Admin</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{feedback.length} total submissions</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex gap-2 mt-4">
            {['all', 'new', 'read', 'resolved'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && (
                  <span className="ml-1 opacity-70">
                    ({feedback.filter(fb => f === 'all' || fb.status === f).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading feedback...</div>
          ) : filteredFeedback.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl mb-2 block">📫</span>
              No feedback yet
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFeedback.map(item => (
                <div key={item.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{typeIcons[item.type] || '💬'}</span>
                        <span className="font-medium text-gray-900 dark:text-white capitalize">{item.type}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.message}</p>
                      {item.images && item.images.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {item.images.map((imgUrl, idx) => (
                            <a 
                              key={idx} 
                              href={imgUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img 
                                src={imgUrl} 
                                alt={`Screenshot ${idx + 1}`}
                                className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600 hover:opacity-80 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>{item.user_email}</span>
                        <span>•</span>
                        <span>{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}</span>
                        {item.page && (
                          <>
                            <span>•</span>
                            <span>{item.page}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {item.status !== 'read' && (
                        <button
                          onClick={() => updateStatus(item.id, 'read')}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                          title="Mark as read"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      {item.status !== 'resolved' && (
                        <button
                          onClick={() => updateStatus(item.id, 'resolved')}
                          className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                          title="Mark as resolved"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Loading Skeleton Components
const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
    </div>
    <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
    <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
    <div className="flex items-center gap-2">
      <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  </div>
)

const SkeletonColumn = () => (
  <div className="flex-1 min-w-[300px] max-w-[380px] bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600" />
      <div className="h-5 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
      <div className="ml-auto h-6 w-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
    </div>
    <div className="space-y-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
)

// Keyboard Shortcuts Modal
const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null
  
  // Detect if user is on Mac
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? '⌘⌃' : 'Ctrl+Alt'
  
  const shortcuts = [
    { keys: ['Q'], description: 'Quick add task' },
    { keys: [modifier, 'T'], description: 'New task (full form)' },
    { keys: [modifier, 'P'], description: 'New project' },
    { keys: [modifier, 'S'], description: 'Search tasks' },
    { keys: ['/'], description: 'Quick search' },
    { keys: [modifier, 'D'], description: 'My Day view' },
    { keys: [modifier, 'B'], description: 'Board view' },
    { keys: [modifier, 'L'], description: 'Calendar view' },
    { keys: [modifier, 'A'], description: 'All Tasks view' },
    { keys: [modifier, 'N'], description: 'Import notes' },
    { keys: [modifier, 'V'], description: 'Voice input' },
    { keys: ['Esc'], description: 'Close modal' },
    { keys: ['?'], description: 'Show this help' },
  ]
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl mx-4 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((shortcut, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, keyIdx) => (
                  <span key={keyIdx}>
                    <kbd className="px-2 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                      {key}
                    </kbd>
                    {keyIdx < shortcut.keys.length - 1 && <span className="text-gray-400 mx-1">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">?</kbd> anytime to see shortcuts</p>
        </div>
      </div>
    </div>
  )
}

// Empty State Component - Enhanced with illustrations and animations
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
          <div className="text-3xl sm:text-4xl">{icon}</div>
        </div>
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-6 max-w-xs sm:max-w-sm leading-relaxed">{description}</p>
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

// Modal Component
const Modal = ({ isOpen, onClose, title, children, wide, fullScreenMobile }) => {
  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div className={`relative bg-white dark:bg-gray-900 shadow-2xl w-full flex flex-col animate-modalSlideUp ${
        fullScreenMobile 
          ? 'h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl sm:mx-4' 
          : 'rounded-t-2xl sm:rounded-2xl sm:mx-4 max-h-[95vh] sm:max-h-[90vh]'
      } ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className={`flex-shrink-0 flex items-center justify-between p-4 pr-6 sm:p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20 ${fullScreenMobile ? 'rounded-none sm:rounded-t-2xl' : 'rounded-t-2xl'}`}>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-3 -mr-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400 touch-manipulation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

// Attachment Viewer Modal
const AttachmentViewer = ({ isOpen, onClose, attachment, attachments, onNavigate }) => {
  if (!isOpen || !attachment) return null
  
  const fileName = attachment.file_name || ''
  const fileUrl = attachment.file_url || ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  const isPdf = ext === 'pdf'
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext)
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)
  const isOfficeDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
  const isEmail = ['eml', 'msg'].includes(ext)
  
  const currentIndex = attachments?.findIndex(a => a.id === attachment.id) ?? -1
  const hasMultiple = attachments && attachments.length > 1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < (attachments?.length || 0) - 1
  
  const handlePrev = () => {
    if (hasPrev && onNavigate) {
      onNavigate(attachments[currentIndex - 1])
    }
  }
  
  const handleNext = () => {
    if (hasNext && onNavigate) {
      onNavigate(attachments[currentIndex + 1])
    }
  }
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) handlePrev()
      if (e.key === 'ArrowRight' && hasNext) handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, attachments])
  
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/80 text-sm truncate max-w-[300px]">{fileName}</span>
          {hasMultiple && (
            <span className="text-white/50 text-sm">
              {currentIndex + 1} / {attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={fileUrl}
            download={fileName}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Download"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Open in new tab"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all ${
              hasPrev ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all ${
              hasNext ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      
      {/* Content */}
      <div className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center">
        {isImage && (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        )}
        
        {isPdf && (
          <iframe
            src={fileUrl}
            title={fileName}
            className="w-[90vw] h-[85vh] max-w-4xl rounded-lg bg-white"
          />
        )}
        
        {isVideo && (
          <video
            src={fileUrl}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
          >
            Your browser does not support video playback.
          </video>
        )}
        
        {isAudio && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center">
              <span className="text-4xl">🎵</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-4">{fileName}</p>
            <audio src={fileUrl} controls autoPlay className="w-full max-w-md">
              Your browser does not support audio playback.
            </audio>
          </div>
        )}
        
        {isOfficeDoc && (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
            title={fileName}
            className="w-[90vw] h-[85vh] max-w-5xl rounded-lg bg-white"
          />
        )}
        
        {isEmail && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/50 rounded-full flex items-center justify-center">
              <span className="text-4xl">✉️</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">{fileName}</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Email files can be opened in your email client</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Email
            </a>
          </div>
        )}
        
        {!isImage && !isPdf && !isVideo && !isAudio && !isOfficeDoc && !isEmail && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center">
              <span className="text-4xl">📄</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">{fileName}</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Preview not available for this file type</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

const OnboardingOverlay = ({ step, onNext, onSkip, onComplete }) => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const shortcut = isMac ? '⌘⌃T' : 'Ctrl+Alt+T'
  
  const steps = [
    {
      target: 'summary-bar',
      title: 'Welcome to Trackli! 👋',
      description: 'This is your Summary Bar - click any stat to filter tasks. Use the ☀️ My Day filter to see your daily focus, or filter by assignee, customer, category and more.',
      position: 'bottom',
    },
    {
      target: 'columns',
      title: 'Kanban Board',
      description: 'Your tasks flow from Backlog → To Do → In Progress → Done. Drag and drop to move tasks between columns.',
      position: 'top',
    },
    {
      target: 'task-card',
      title: 'Task Cards',
      description: 'Each card shows key info at a glance. Look for the ☀️ sun icon on cards in your My Day list! Hover to see details and attachments.',
      position: 'right',
    },
    {
      target: 'views',
      title: 'Multiple Views',
      description: 'Switch between Board, My Day, All Tasks (with sorting & CSV export), Calendar, and Progress views using the menu.',
      position: 'bottom',
    },
    {
      target: 'add-task',
      title: 'Create Tasks',
      description: `Click + Task or press ${shortcut} to create. Set dates, effort level, assignee, customer, category, attachments, subtasks, dependencies, and recurring schedules.`,
      position: 'bottom',
    },
    {
      target: 'notes',
      title: 'Meeting Notes → Tasks',
      description: 'Click Notes to quickly capture meeting notes - type, paste, or even speak! AI extracts action items as tasks automatically.',
      position: 'bottom',
    },
    {
      target: 'help',
      title: 'Need Help?',
      description: 'Click the ? icon anytime to access the full help guide. You\'re all set! 🎉',
      position: 'bottom',
    },
  ]
  
  const currentStep = steps[step]
  if (!currentStep) return null
  
  return (
    <div className="fixed inset-0 z-[1000]">
      {/* Dark overlay with spotlight cutout */}
      <div className="absolute inset-0 bg-black/60" onClick={onSkip} />
      
      {/* Tooltip */}
      <div 
        className={`absolute z-[1001] max-w-sm animate-fadeIn ${
          step === 0 ? 'top-32 left-1/2 -translate-x-1/2' :
          step === 1 ? 'top-40 left-1/2 -translate-x-1/2' :
          step === 2 ? 'top-60 left-[340px]' :
          step === 3 ? 'top-24 left-8' :
          step === 4 ? 'top-20 right-48' :
          step === 5 ? 'top-20 right-32' :
          'top-20 right-24'
        }`}
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, i) => (
              <div 
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step ? 'w-6 bg-indigo-500' : 
                  i < step ? 'bg-indigo-300' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
          
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
            {currentStep.title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {currentStep.description}
          </p>
          
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={() => onNext(step - 1)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => step < steps.length - 1 ? onNext(step + 1) : onComplete()}
                className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
              >
                {step < steps.length - 1 ? 'Next' : 'Get Started!'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Arrow pointer */}
        <div className={`absolute w-4 h-4 bg-white dark:bg-gray-800 rotate-45 border-gray-200 dark:border-gray-700 ${
          currentStep.position === 'bottom' ? '-top-2 left-1/2 -translate-x-1/2 border-t border-l' :
          currentStep.position === 'top' ? '-bottom-2 left-1/2 -translate-x-1/2 border-b border-r' :
          currentStep.position === 'right' ? '-left-2 top-8 border-l border-b' :
          '-right-2 top-8 border-r border-t'
        }`} />
      </div>
    </div>
  )
}

// Animated SVG Components for Tours
const AddToMyDayAnimation = () => (
  <svg viewBox="0 0 280 120" className="w-full h-32 rounded-lg bg-gray-50 dark:bg-gray-700/50">
    <defs>
      <linearGradient id="sunGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
    
    {/* Recommendations section */}
    <rect x="10" y="10" width="120" height="100" rx="8" fill="#F3F4F6" className="dark:fill-gray-600" />
    <text x="70" y="26" textAnchor="middle" fontSize="9" fill="#6B7280">💡 Recommendations</text>
    
    {/* Task card with sun button */}
    <rect x="18" y="36" width="104" height="32" rx="6" fill="white" className="dark:fill-gray-500" stroke="#E5E7EB" />
    <circle cx="30" cy="52" r="6" fill="#E5E7EB" />
    <rect x="42" y="48" width="50" height="8" rx="2" fill="#9CA3AF" />
    
    {/* Sun button - animated */}
    <g>
      <circle cx="108" cy="52" r="10" fill="#FEF3C7">
        <animate attributeName="r" values="10;12;10" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <text x="108" y="56" textAnchor="middle" fontSize="12">☀️</text>
      {/* Click ripple effect */}
      <circle cx="108" cy="52" r="10" fill="none" stroke="#F59E0B" strokeWidth="2">
        <animate attributeName="r" values="10;20;20" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0;0" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </g>
    
    {/* Second task card */}
    <rect x="18" y="74" width="104" height="28" rx="6" fill="white" className="dark:fill-gray-500" stroke="#E5E7EB" />
    <circle cx="30" cy="88" r="5" fill="#E5E7EB" />
    <rect x="42" y="84" width="40" height="8" rx="2" fill="#D1D5DB" />
    
    {/* My Day area */}
    <rect x="150" y="10" width="120" height="100" rx="8" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" />
    <text x="210" y="26" textAnchor="middle" fontSize="10" fill="#D97706" fontWeight="bold">☀️ My Day</text>
    
    {/* Task appearing in My Day */}
    <rect x="158" y="36" width="104" height="32" rx="6" fill="#FDE68A">
      <animate attributeName="opacity" values="0;0;1;1" dur="1.5s" repeatCount="indefinite" keyTimes="0;0.3;0.5;1" />
    </rect>
    <circle cx="170" cy="52" r="6" fill="#10B981">
      <animate attributeName="opacity" values="0;0;1;1" dur="1.5s" repeatCount="indefinite" keyTimes="0;0.3;0.5;1" />
    </circle>
    <rect x="182" y="48" width="50" height="8" rx="2" fill="#92400E" opacity="0.5">
      <animate attributeName="opacity" values="0;0;0.5;0.5" dur="1.5s" repeatCount="indefinite" keyTimes="0;0.3;0.5;1" />
    </rect>
    
    {/* Arrow showing the action */}
    <path d="M125 52 L145 52 L140 47 M145 52 L140 57" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round">
      <animate attributeName="opacity" values="0;1;1;0" dur="1.5s" repeatCount="indefinite" keyTimes="0;0.2;0.6;1" />
    </path>
  </svg>
)

const DragToCalendarAnimation = () => (
  <svg viewBox="0 0 280 140" className="w-full h-36 rounded-lg bg-gray-50 dark:bg-gray-700/50">
    <defs>
      <linearGradient id="calCardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
      <filter id="calShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2"/>
      </filter>
    </defs>
    
    {/* Sidebar */}
    <rect x="10" y="10" width="70" height="120" rx="6" fill="#F3F4F6" className="dark:fill-gray-600" />
    <text x="45" y="26" textAnchor="middle" fontSize="8" fill="#9CA3AF">Tasks</text>
    <rect x="16" y="34" width="58" height="18" rx="4" fill="#E5E7EB" className="dark:fill-gray-500" />
    <rect x="16" y="56" width="58" height="18" rx="4" fill="#E5E7EB" className="dark:fill-gray-500" />
    
    {/* Calendar grid */}
    <rect x="90" y="10" width="180" height="120" rx="6" fill="white" className="dark:fill-gray-800" stroke="#E5E7EB" />
    
    {/* Time labels */}
    <text x="100" y="40" fontSize="8" fill="#9CA3AF">9:00</text>
    <text x="100" y="70" fontSize="8" fill="#9CA3AF">10:00</text>
    <text x="100" y="100" fontSize="8" fill="#9CA3AF">11:00</text>
    
    {/* Time slot lines */}
    <line x1="125" y1="32" x2="260" y2="32" stroke="#E5E7EB" strokeWidth="1" />
    <line x1="125" y1="62" x2="260" y2="62" stroke="#E5E7EB" strokeWidth="1" />
    <line x1="125" y1="92" x2="260" y2="92" stroke="#E5E7EB" strokeWidth="1" />
    <line x1="125" y1="122" x2="260" y2="122" stroke="#E5E7EB" strokeWidth="1" />
    
    {/* Existing scheduled task */}
    <rect x="130" y="36" width="120" height="22" rx="4" fill="#10B981" opacity="0.8" />
    <rect x="136" y="43" width="50" height="6" rx="2" fill="white" opacity="0.7" />
    
    {/* Animated dragging card */}
    <g filter="url(#calShadow)">
      <rect x="16" y="34" width="58" height="18" rx="4" fill="url(#calCardGradient)">
        <animate attributeName="x" values="16;130;130" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
        <animate attributeName="y" values="34;66;66" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
        <animate attributeName="width" values="58;120;120" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
        <animate attributeName="height" values="18;22;22" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
      </rect>
      <rect x="22" y="40" width="30" height="5" rx="2" fill="white" opacity="0.8">
        <animate attributeName="x" values="22;136;136" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
        <animate attributeName="y" values="40;73;73" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
        <animate attributeName="width" values="30;50;50" dur="2.5s" repeatCount="indefinite" keyTimes="0;0.4;1" />
      </rect>
    </g>
    
    {/* Current time indicator */}
    <line x1="125" y1="85" x2="260" y2="85" stroke="#EF4444" strokeWidth="2" />
    <circle cx="125" cy="85" r="4" fill="#EF4444" />
  </svg>
)

const ResizeTaskAnimation = () => (
  <svg viewBox="0 0 200 100" className="w-full h-28 rounded-lg bg-gray-50 dark:bg-gray-700/50">
    <defs>
      <linearGradient id="resizeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
    </defs>
    
    {/* Time labels */}
    <text x="15" y="25" fontSize="9" fill="#9CA3AF">9:00</text>
    <text x="15" y="55" fontSize="9" fill="#9CA3AF">10:00</text>
    <text x="15" y="85" fontSize="9" fill="#9CA3AF">11:00</text>
    
    {/* Grid lines */}
    <line x1="45" y1="18" x2="190" y2="18" stroke="#E5E7EB" strokeWidth="1" />
    <line x1="45" y1="48" x2="190" y2="48" stroke="#E5E7EB" strokeWidth="1" />
    <line x1="45" y1="78" x2="190" y2="78" stroke="#E5E7EB" strokeWidth="1" />
    
    {/* Animated resizable task */}
    <rect x="50" y="22" width="130" rx="4" fill="url(#resizeGradient)">
      <animate attributeName="height" values="22;52;22" dur="3s" repeatCount="indefinite" />
    </rect>
    <rect x="56" y="28" width="60" height="6" rx="2" fill="white" opacity="0.8" />
    
    {/* Resize handle indicator */}
    <g>
      <rect x="105" width="20" height="6" rx="3" fill="white" opacity="0.9">
        <animate attributeName="y" values="40;70;40" dur="3s" repeatCount="indefinite" />
      </rect>
      {/* Cursor icon */}
      <path d="M115 0 L115 8 M111 4 L119 4" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round">
        <animate attributeName="transform" values="translate(0,48);translate(0,78);translate(0,48)" dur="3s" repeatCount="indefinite" />
      </path>
    </g>
  </svg>
)

const ProgressBarAnimation = () => (
  <svg viewBox="0 0 240 80" className="w-full h-24 rounded-lg bg-gray-50 dark:bg-gray-700/50">
    {/* Container */}
    <rect x="20" y="20" width="200" height="40" rx="8" fill="#FEF3C7" />
    
    {/* Label */}
    <text x="30" y="38" fontSize="10" fill="#92400E" fontWeight="bold">Today's Progress</text>
    
    {/* Progress bar background */}
    <rect x="30" y="45" width="180" height="8" rx="4" fill="#FDE68A" />
    
    {/* Animated progress fill */}
    <rect x="30" y="45" height="8" rx="4" fill="url(#progressGradient)">
      <animate attributeName="width" values="0;180;180;0" dur="4s" repeatCount="indefinite" keyTimes="0;0.4;0.9;1" />
    </rect>
    
    {/* Percentage text */}
    <text x="120" y="38" textAnchor="middle" fontSize="10" fill="#059669" fontWeight="bold">
      <animate attributeName="opacity" values="0;1;1;0" dur="4s" repeatCount="indefinite" keyTimes="0;0.4;0.9;1" />
      100% ✓
    </text>
    
    {/* Confetti dots */}
    <circle cx="60" cy="15" r="3" fill="#F59E0B">
      <animate attributeName="opacity" values="0;0;1;0" dur="4s" repeatCount="indefinite" keyTimes="0;0.4;0.5;0.7" />
      <animate attributeName="cy" values="15;5;5" dur="4s" repeatCount="indefinite" keyTimes="0;0.4;1" />
    </circle>
    <circle cx="120" cy="12" r="3" fill="#EC4899">
      <animate attributeName="opacity" values="0;0;1;0" dur="4s" repeatCount="indefinite" keyTimes="0;0.45;0.55;0.75" />
      <animate attributeName="cy" values="12;2;2" dur="4s" repeatCount="indefinite" keyTimes="0;0.45;1" />
    </circle>
    <circle cx="180" cy="14" r="3" fill="#6366F1">
      <animate attributeName="opacity" values="0;0;1;0" dur="4s" repeatCount="indefinite" keyTimes="0;0.42;0.52;0.72" />
      <animate attributeName="cy" values="14;4;4" dur="4s" repeatCount="indefinite" keyTimes="0;0.42;1" />
    </circle>
    
    <defs>
      <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
  </svg>
)

// View-Specific Tour Component
const ViewTour = ({ view, step, onNext, onSkip, onComplete }) => {
  const tourContent = {
    myday: [
      {
        title: '☀️ Welcome to My Day!',
        description: 'This is your personal daily focus list. Plan what to work on today without cluttering your board view.',
        icon: '🎯',
      },
      {
        title: 'Add Tasks to My Day',
        description: 'Tasks with today\'s start date appear automatically. Click the ☀️ button on any recommended task to add it to your day!',
        icon: '📥',
        animation: 'addToMyDay',
      },
      {
        title: 'Track Your Progress',
        description: 'Watch your progress bar fill up as you complete tasks. Finish everything for a confetti celebration!',
        icon: '📊',
        animation: 'progressBar',
      },
    ],
    calendar: [
      {
        title: '🗓 Welcome to Calendar!',
        description: 'Schedule your tasks visually. Switch between daily, weekly, and monthly views using the buttons at the top.',
        icon: '🗓️',
      },
      {
        title: 'Drag to Schedule',
        description: 'Drag tasks from the sidebar onto any time slot to schedule them. The task\'s start time updates automatically.',
        icon: '✨',
        animation: 'dragToCalendar',
      },
      {
        title: 'Resize to Adjust Duration',
        description: 'Drag the bottom edge of any scheduled task to change how long it takes. Time estimate updates automatically!',
        icon: '🎨',
        animation: 'resizeTask',
      },
    ],
    tasks: [
      {
        title: '🗃️ All Tasks View',
        description: 'See every task in a powerful table format. Click any column header to sort, or use the Filters button to narrow down results.',
        icon: '📋',
      },
      {
        title: 'Import & Export CSV',
        description: 'Export tasks for reporting, or import to bulk create/edit. Use * in the ID column to create new tasks, or include existing IDs to update them.',
        icon: '📥',
      },
    ],
    projects: [
      {
        title: '📁 Projects View',
        description: 'Organize your work into projects. Each project gets its own color that appears on task cards throughout the app.',
        icon: '🏗️',
      },
      {
        title: 'Manage Projects',
        description: 'Create new projects, edit details, or archive completed ones. Archived projects hide their tasks from the main board.',
        icon: '⚙️',
      },
    ],
    progress: [
      {
        title: '📊 Progress View',
        description: 'Track your productivity across all projects. See completion rates, task counts, and how you\'re doing over time.',
        icon: '📈',
      },
      {
        title: 'Completion Insights',
        description: 'The charts show your completed vs. remaining tasks. Use this to identify bottlenecks and celebrate wins!',
        icon: '🏆',
      },
    ],
  }

  // Animation component mapping
  const animations = {
    addToMyDay: AddToMyDayAnimation,
    dragToCalendar: DragToCalendarAnimation,
    resizeTask: ResizeTaskAnimation,
    progressBar: ProgressBarAnimation,
  }

  const steps = tourContent[view] || []
  const currentStep = steps[step]
  if (!currentStep) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onSkip} />
      
      {/* Tour card */}
      <div className="relative z-[1001] max-w-md w-full animate-fadeIn">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
            <div className="text-4xl mb-3">{currentStep.icon}</div>
            <h3 className="text-xl font-bold">{currentStep.title}</h3>
          </div>
          
          {/* Content */}
          <div className="p-6">
            <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
              {currentStep.description}
            </p>
            
            {/* Animation if available */}
            {currentStep.animation && animations[currentStep.animation] && (
              <div className="mb-6">
                {(() => {
                  const AnimationComponent = animations[currentStep.animation]
                  return <AnimationComponent />
                })()}
              </div>
            )}
            
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {steps.map((_, i) => (
                <div 
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === step ? 'w-8 bg-indigo-500' : 
                    i < step ? 'bg-indigo-300' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={onSkip}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Skip
              </button>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    onClick={() => onNext(step - 1)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => step < steps.length - 1 ? onNext(step + 1) : onComplete()}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
                >
                  {step < steps.length - 1 ? 'Next' : 'Got it!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Help Modal Component
const HelpModal = ({ isOpen, onClose, initialTab = 'board', shortcutModifier = '⌘⌃' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  
  // Reset to initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])
  
  if (!isOpen) return null
  
  const tabs = [
    { id: 'board', label: 'Board', icon: '📋' },
    { id: 'myday', label: 'My Day', icon: '☀️' },
    { id: 'calendar', label: 'Calendar', icon: '🗓' },
    { id: 'alltasks', label: 'All Tasks', icon: '🗃️' },
    { id: 'tasks', label: 'Tasks', icon: '✅' },
    { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️' },
  ]
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl">
              ❓
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Trackli Help Guide</h2>
              <p className="text-sm text-gray-500">Learn how to use Trackli effectively</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
          {activeTab === 'board' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  Summary Bar (Filter Stats)
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">Click any stat to filter your tasks:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="font-semibold text-indigo-600">Active</span>
                    <p className="text-sm text-gray-500">Tasks in To Do + In Progress</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="font-semibold text-purple-600">Backlog</span>
                    <p className="text-sm text-gray-500">Future work not yet started</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="font-semibold text-red-600">🚩 Critical</span>
                    <p className="text-sm text-gray-500">High priority flagged tasks</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="font-semibold text-orange-600">Due Today</span>
                    <p className="text-sm text-gray-500">Tasks due today</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="font-semibold text-red-600">Overdue</span>
                    <p className="text-sm text-gray-500">Past due date</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Kanban Columns
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-3 rounded-xl border-l-4" style={{ borderColor: '#9CA3AF', backgroundColor: '#F9FAFB' }}>
                    <span className="font-semibold text-gray-700">Backlog</span>
                    <p className="text-xs text-gray-500">Future work</p>
                  </div>
                  <div className="p-3 rounded-xl border-l-4" style={{ borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }}>
                    <span className="font-semibold text-blue-700">To Do</span>
                    <p className="text-xs text-gray-500">Ready to start</p>
                  </div>
                  <div className="p-3 rounded-xl border-l-4" style={{ borderColor: '#EC4899', backgroundColor: '#FDF2F8' }}>
                    <span className="font-semibold text-pink-700">In Progress</span>
                    <p className="text-xs text-gray-500">Active work</p>
                  </div>
                  <div className="p-3 rounded-xl border-l-4" style={{ borderColor: '#64748B', backgroundColor: '#F8FAFC' }}>
                    <span className="font-semibold text-slate-700">Done</span>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">💡 Drag and drop tasks between columns to change status</p>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Task Card Indicators
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Left Border Colors:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded bg-orange-500"></div>
                        <span>Orange = Blocked</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded bg-red-500"></div>
                        <span>Red = Critical</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded bg-green-500"></div>
                        <span>Green = Ready to Start</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded bg-blue-500"></div>
                        <span>Blue/Pink/Gray = Column</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Effort Indicator (under checkbox):</p>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 font-bold">▰</span>
                        <span>Low Effort</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600 font-bold">▰▰</span>
                        <span>Medium Effort</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 font-bold">▰▰▰</span>
                        <span>High Effort</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Other Indicators:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>🚩 = Critical/Flagged</div>
                      <div>🔒 = Blocked by another task</div>
                      <div>🔁 = Recurring task</div>
                      <div>🗓 = Due date (red if overdue)</div>
                      <div>▶ = Start date</div>
                      <div>⏱ = Time estimate</div>
                    </div>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Hover Popup
                </h3>
                <p className="text-gray-600 dark:text-gray-400">Hover over any task card to see additional details:</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>• Category badge</li>
                  <li>• Customer name</li>
                  <li>• Effort level badge</li>
                  <li>• Full description</li>
                  <li>• Assignee</li>
                  <li>• Subtask progress</li>
                  <li>• Attachments count</li>
                </ul>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">5</span>
                  Filtering Tasks
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">Use the filter bar above the board to narrow down your tasks:</p>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Quick Filters (Summary Bar):</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>☀️ My Day – Tasks in your daily focus</div>
                      <div>🟢 Active – To Do + In Progress</div>
                      <div>🟣 Backlog – Future work</div>
                      <div>🟠 Due Today</div>
                      <div>🔴 Overdue</div>
                      <div>🚩 Critical – Flagged tasks</div>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Field Filters:</p>
                    <p className="text-sm text-gray-500 mb-2">Use the "Filter by..." dropdown to filter by:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>• Assignee</div>
                      <div>• Customer</div>
                      <div>• Category</div>
                      <div>• Effort Level</div>
                      <div>• Source</div>
                      <div>• Due Date</div>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Search:</p>
                    <p className="text-sm text-gray-500">Type in the search box to find tasks by title or description. Press ⌘K to jump to search.</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">💡 Active filters show a count badge. Click "Clear" to reset all filters.</p>
              </section>
            </div>
          )}
          
          {activeTab === 'myday' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">☀️</span>
                  What is My Day?
                </h3>
                <p className="text-gray-600 dark:text-gray-400">My Day is your personal daily focus list. It helps you plan what to work on today without cluttering your board view.</p>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  How Tasks Appear in My Day
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-green-600 dark:text-green-400 mb-1">Auto-included:</p>
                    <p className="text-sm text-gray-500">Tasks with a start date of today or earlier automatically appear in My Day</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-blue-600 dark:text-blue-400 mb-1">Manually added:</p>
                    <p className="text-sm text-gray-500">Click the ☀️ button on any task in Recommendations to add it to your focus list</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Sun Icon on Cards (☀️)
                </h3>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-gray-700 dark:text-gray-300">Tasks in your My Day list show a <span className="text-lg">☀️</span> sun icon on their card in the board view, right below the effort bars. This helps you quickly identify your daily focus tasks while browsing the board.</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Recommendations & All Tasks
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">The Recommendations section shows tasks organized by urgency and status. Click the ☀️ button on any task to add it:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                    <span className="font-semibold text-red-600">🔴 Overdue</span>
                    <p className="text-sm text-gray-500">Past due date</p>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                    <span className="font-semibold text-orange-600">🟠 Due Today</span>
                    <p className="text-sm text-gray-500">Due today</p>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                    <span className="font-semibold text-yellow-600">🟡 Due Soon</span>
                    <p className="text-sm text-gray-500">Due in next 3 days</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <span className="font-semibold text-green-600">🟢 Quick Wins</span>
                    <p className="text-sm text-gray-500">Low effort tasks</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <span className="font-semibold text-blue-600">🔵 In Progress</span>
                    <p className="text-sm text-gray-500">Currently being worked on</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-xl">
                    <span className="font-semibold text-slate-600">⚪ To Do</span>
                    <p className="text-sm text-gray-500">Ready to start</p>
                  </div>
                  <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl col-span-2">
                    <span className="font-semibold text-gray-600">📋 Backlog</span>
                    <p className="text-sm text-gray-500">Future work not yet prioritized</p>
                  </div>
                </div>
              </section>
              
<section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">4</span>
                  Daily Reset
                </h3>
                <p className="text-gray-600 dark:text-gray-400">Manually added tasks clear from My Day at midnight (or when completed), giving you a fresh start each day. Auto-included tasks based on start date will remain until their start date passes.</p>
              </section>
            </div>
          )}
          
          {activeTab === 'calendar' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">🗓</span>
                  Calendar View
                </h3>
                <p className="text-gray-600 dark:text-gray-400">Schedule tasks on your calendar with start times and durations. Access via the menu or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">⌘L</kbd>.</p>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  View Modes
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
                    <span className="text-2xl">🗓</span>
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mt-1">Daily</p>
                    <p className="text-xs text-gray-500">Single day view</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
                    <span className="text-2xl">🗓</span>
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mt-1">Weekly</p>
                    <p className="text-xs text-gray-500">7-day overview</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
                    <span className="text-2xl">🗓️</span>
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mt-1">Monthly</p>
                    <p className="text-xs text-gray-500">Full month grid</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Scheduling Tasks
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Drag & Drop:</p>
                    <p className="text-sm text-gray-500">Drag tasks from the sidebar onto any time slot to schedule them. The task's start time and date will be automatically set.</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Resize Duration:</p>
                    <p className="text-sm text-gray-500">Drag the bottom edge of a scheduled task to adjust its duration. Time estimate updates automatically.</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Double-Click:</p>
                    <p className="text-sm text-gray-500">Double-click any empty time slot to create a new task at that time.</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Sidebar Task Sections
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">The sidebar organizes unscheduled tasks by priority:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span>🔴</span><span>Overdue tasks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🟠</span><span>Due Today</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🟡</span><span>Due Soon (3 days)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🔵</span><span>In Progress</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>☀️</span><span>My Day tasks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>⚪</span><span>To Do</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📋</span><span>Backlog</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🟢</span><span>Quick Wins</span>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">4</span>
                  Visual Indicators
                </h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>• <span className="text-red-500 font-medium">Red line</span> – Current time indicator</p>
                  <p>• <span className="text-orange-500 font-medium">⚠️ Orange ring</span> – Task overlaps with another scheduled task</p>
                  <p>• <span className="font-medium">Colored bars</span> – Tasks are color-coded by project</p>
                  <p>• <span className="font-medium">30-min slots</span> – Calendar auto-scrolls to 6am on load</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">5</span>
                  Quick Actions
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">Hover over any scheduled task to reveal action buttons:</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <span className="text-lg">▶</span>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">Start task</p>
                  </div>
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <span className="text-lg">✓</span>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">Mark done</p>
                  </div>
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <span className="text-lg">✕</span>
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">Remove from calendar</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">💡 Removing a task from calendar clears its scheduled time. If not done, it returns to the sidebar for rescheduling.</p>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400">⚙️</span>
                  Workflow Automation
                </h3>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                  <p className="text-gray-700 dark:text-gray-300">When you schedule a task:</p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>• Status automatically changes to "To Do" (if in Backlog)</li>
                    <li>• Start date is set to the scheduled day</li>
                    <li>• Start time is set to the slot time</li>
                    <li>• Task appears in My Day if scheduled for today</li>
                  </ul>
                </div>
              </section>
            </div>
          )}
          
          {activeTab === 'alltasks' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">🗃️</span>
                  All Tasks View
                </h3>
                <p className="text-gray-600 dark:text-gray-400">Access all your tasks in a powerful table format. Click the view switcher in the header and select "All Tasks" or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">⌘⌃A</kbd> (Mac) / <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Ctrl+Alt+A</kbd> (Win).</p>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  Sorting
                </h3>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <p className="text-gray-600 dark:text-gray-400">Click any column header to sort by that field. Click again to reverse the sort order. An arrow indicator shows the current sort direction.</p>
                  <div className="mt-2 text-sm text-gray-500">Sortable columns: Title, Project, Status, Due Date, Start Date, Assignee, Customer, Category, Effort, Source, Time Estimate, Created</div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Filtering
                </h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• Click the <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-medium">Filters</span> button to show filter inputs for each column</p>
                  <p>• Type in the filter boxes below column headers to narrow results</p>
                  <p>• Click <span className="text-red-600">Clear Filters</span> to reset all filters</p>
                  <p>• Active filters show a dot indicator on the Filters button</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400">3</span>
                  Export to CSV
                </h3>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                  <p className="text-gray-700 dark:text-gray-300 mb-2">Click the <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">Export CSV</span> button to download your tasks.</p>
                  <p className="text-sm text-gray-500">The export includes: Title, Project, Status, Critical, Due Date, Start Date, Assignee, Customer, Category, Effort, Source, Time Estimate, Description, and Created date.</p>
                  <p className="text-sm text-gray-500 mt-2">💡 Only currently filtered/visible tasks are exported, making it easy to export specific subsets of your data.</p>
                </div>
              </section>
            </div>
          )}
          
          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  Creating Tasks
                </h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• Click the <span className="px-2 py-1 bg-indigo-500 text-white rounded text-sm font-medium">+</span> button in the header</p>
                  <p>• Or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">⌘⌃T</kbd> (Mac) / <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Ctrl+Alt+T</kbd> (Win)</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Task Fields
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Title *</p>
                    <p className="text-sm text-gray-500">The task name (required)</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Project *</p>
                    <p className="text-sm text-gray-500">Which project this belongs to</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Start Date</p>
                    <p className="text-sm text-gray-500">When to start working on it</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Due Date</p>
                    <p className="text-sm text-gray-500">Deadline for completion</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Time Estimate</p>
                    <p className="text-sm text-gray-500">How long it will take</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Effort Level</p>
                    <p className="text-sm text-gray-500">Low / Medium / High effort</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Customer</p>
                    <p className="text-sm text-gray-500">Client/customer for the task</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Assignee</p>
                    <p className="text-sm text-gray-500">Who's responsible</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Category</p>
                    <p className="text-sm text-gray-500">Type of work</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">🚩 Critical</p>
                    <p className="text-sm text-gray-500">Flag as high priority</p>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Completing Tasks
                </h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• Click the circle checkbox on the left of the card</p>
                  <p>• Or drag the task to the "Done" column</p>
                  <p>• Completed tasks show with a green checkmark</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">4</span>
                  Dependencies (Blocking)
                </h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• In the task editor, use "Blocked By" to select tasks that must be completed first</p>
                  <p>• Blocked tasks show with 🔒 and an orange border</p>
                  <p>• When the blocking task is completed, the blocked task becomes "ready to start"</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">5</span>
                  Recurring Tasks
                </h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• Set a recurrence pattern: Daily, Weekly, Bi-weekly, Monthly</p>
                  <p>• When completed, a new instance is automatically created</p>
                  <p>• Recurring tasks show 🔁 on the card</p>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">6</span>
                  Attachments
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Adding Attachments:</p>
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>• Open a task and go to the Details tab</p>
                      <p>• Drag & drop files or click "Choose files"</p>
                      <p>• Supports images, PDFs, documents, and more</p>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Viewing Attachments:</p>
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>• Click any attachment to open the viewer</p>
                      <p>• PDFs display inline with page navigation</p>
                      <p>• Images show in a lightbox view</p>
                      <p>• Use ← → arrow keys to navigate between multiple attachments</p>
                      <p>• Click the download icon to save files locally</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">💡 Tasks with attachments show a 📎 icon with count on the card</p>
                </div>
              </section>
            </div>
          )}
          
          {activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Navigation Shortcuts</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">☀️ My Day View</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘D</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">📋 Board View</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘B</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">🗓 Calendar View</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘L</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">🔍 Quick Search</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘K</kbd>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Action Shortcuts</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">New Task</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">{shortcutModifier}T</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">New Project</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">{shortcutModifier}P</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">Import Tasks</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">{shortcutModifier}N</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">Help / Shortcuts</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">?</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">Close Modal</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">Esc</kbd>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Quick Actions</h3>
                <div className="space-y-2 text-gray-600 dark:text-gray-400">
                  <p>• <strong>Click task</strong> – Open task editor</p>
                  <p>• <strong>Click checkbox</strong> – Mark complete/incomplete</p>
                  <p>• <strong>Drag task</strong> – Move between columns or schedule on calendar</p>
                  <p>• <strong>Hover task</strong> – See details popup (desktop only)</p>
                  <p>• <strong>Double-click calendar</strong> – Create task at that time</p>
                  <p>• <strong>Drag task edge</strong> – Resize duration on calendar</p>
                </div>
              </section>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <p className="text-sm text-gray-500">Need more help? <a href="mailto:support@gettrackli.com" className="text-indigo-500 hover:text-indigo-600 hover:underline">Contact support</a></p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}

// Search Modal Component
const SearchModal = ({ isOpen, onClose, tasks, projects, onEditTask, allTasks }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef(null)
  
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
    if (!isOpen) {
      setSearchQuery('')
    }
  }, [isOpen])
  
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])
  
  if (!isOpen) return null
  
  const filteredTasks = searchQuery.trim() 
    ? tasks.filter(task => {
        const query = searchQuery.toLowerCase()
        return (
          task.title?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.assignee?.toLowerCase().includes(query) ||
          task.customer?.toLowerCase().includes(query) ||
          task.notes?.toLowerCase().includes(query)
        )
      })
    : []
  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Search Input */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title, description, assignee, customer..."
              className="flex-1 text-lg outline-none placeholder-gray-400"
            />
            <kbd className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded">ESC</kbd>
          </div>
        </div>
        
        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {searchQuery.trim() === '' ? (
            <div className="p-8 text-center text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>Start typing to search across all tasks</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🔍</span>
              </div>
              <p className="text-gray-600 dark:text-gray-300 font-medium">No results found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTasks.map(task => {
                const project = projects.find(p => p.id === task.project_id)
                const category = CATEGORIES.find(c => c.id === task.category)
                const dueDateStatus = getDueDateStatus(task.due_date, task.status)
                
                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      onEditTask(task)
                      onClose()
                    }}
                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: COLUMN_COLORS[task.status] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-800 truncate">{task.title}</h4>
                          {task.critical && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">Critical</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{project?.name}</span>
                          {category && (
                            <>
                              <span>•</span>
                              <span style={{ color: category.color }}>{category.label}</span>
                            </>
                          )}
                          {task.assignee && (
                            <>
                              <span>•</span>
                              <span>{task.assignee}</span>
                            </>
                          )}
                          {task.due_date && (
                            <>
                              <span>•</span>
                              <span className={dueDateStatus === 'overdue' ? 'text-red-600' : dueDateStatus === 'today' ? 'text-orange-600' : ''}>
                                Due {formatDate(task.due_date)}
                              </span>
                            </>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-400 mt-1 truncate">{task.description}</p>
                        )}
                      </div>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded-lg text-gray-500 shrink-0">
                        {COLUMNS.find(c => c.id === task.status)?.title}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        {filteredTasks.length > 0 && (
          <div className="p-3 border-t border-gray-100 bg-gray-50 text-center text-sm text-gray-500">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>
    </div>
  )
}

// Progress Ring Component
const ProgressRing = ({ progress, size = 120, strokeWidth = 8, color = '#6366F1' }) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference
  
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500 ease-out"
      />
    </svg>
  )
}

// Calendar Sidebar Task Card - click to schedule approach
const CalendarSidebarTaskCard = ({ task, highlight, onSelectForScheduling, onEditTask, COLUMN_COLORS, formatTimeEstimate, formatDate }) => {
  
  const handleScheduleClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    onSelectForScheduling(task)
  }
  
  const handleClick = () => {
    onEditTask(task)
  }
  
  return (
    <div
      onClick={handleClick}
      className={`relative p-2.5 rounded-lg border cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${
        highlight === 'red' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
        highlight === 'orange' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
        highlight === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
        highlight === 'pink' ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800' :
        highlight === 'amber' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
        highlight === 'green' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
        highlight === 'blue' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
        highlight === 'gray' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' :
        'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-2">
        <div 
          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: COLUMN_COLORS[task.status] }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {task.critical && '🚩 '}{task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            {task.time_estimate && <span>⏱{formatTimeEstimate(task.time_estimate)}</span>}
            {task.due_date && (
              <span className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {formatDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
        {/* Schedule button */}
        <button
          onClick={handleScheduleClick}
          className="shrink-0 p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
          title="Click to schedule"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Calendar View Component - Daily/Weekly/Monthly
const CalendarView = ({ tasks, projects, onEditTask, allTasks, onUpdateTask, onCreateTask, onDeleteTask, onDuplicateTask, viewMode, setViewMode, onShowConfirm }) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [draggedTask, setDraggedTask] = useState(null)
  const [hoverSlot, setHoverSlot] = useState(null) // { date, slotIndex } for drop zone highlighting
  const [resizingTask, setResizingTask] = useState(null) // { task, startY, originalDuration }
  const [contextMenu, setContextMenu] = useState(null) // { x, y, task }
  const [selectedTaskForScheduling, setSelectedTaskForScheduling] = useState(null) // For mobile tap-to-schedule
  const [taskToSchedule, setTaskToSchedule] = useState(null) // For schedule modal
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0])
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const calendarScrollRef = useRef(null)
  const isDraggingRef = useRef(false)
  
  // Generate consistent color for project based on ID
  const PROJECT_COLORS = [
    { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
    { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
    { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
    { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
    { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
    { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
    { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
    { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  ]
  
  const getProjectColor = (projectId) => {
    if (!projectId) return { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' }
    // Use project ID to get consistent color
    const index = projectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PROJECT_COLORS.length
    return PROJECT_COLORS[index]
  }
  
  // Check if a task overlaps with other tasks on the same day
  const hasOverlap = (task, date) => {
    if (!task.start_time) return false
    const dateStr = date.toISOString().split('T')[0]
    const taskStart = parseTimeToMinutes(task.start_time)
    const taskEnd = taskStart + (task.time_estimate || 30)
    
    return tasks.some(t => {
      if (t.id === task.id) return false
      if (t.start_date !== dateStr) return false
      if (!t.start_time) return false
      
      const otherStart = parseTimeToMinutes(t.start_time)
      const otherEnd = otherStart + (t.time_estimate || 30)
      
      // Check for overlap
      return (taskStart < otherEnd && taskEnd > otherStart)
    })
  }
  
  // Auto-scroll to 6am when daily/weekly view loads
  useEffect(() => {
    if ((viewMode === 'daily' || viewMode === 'weekly') && calendarScrollRef.current) {
      // 6am = slot index 12 (6*2), each slot is 32px
      const scrollTo6am = 12 * 32
      calendarScrollRef.current.scrollTop = scrollTo6am
    }
  }, [viewMode, currentDate])
  
  // Track resize movements globally
  useEffect(() => {
    if (!resizingTask) return
    
    const handleMouseMove = (e) => {
      e.preventDefault()
    }
    
    const handleMouseUp = (e) => {
      handleResizeEnd(e)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingTask])
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  
  // Generate hours for day/week view (12am to 11pm)
  // Generate 30-minute time slots (48 total)
  const timeSlots = Array.from({ length: 48 }, (_, i) => {
    const totalMinutes = i * 30
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const hour = h % 12 || 12
    const ampm = h < 12 ? 'AM' : 'PM'
    return { 
      slotIndex: i, 
      minutes: totalMinutes,
      label: `${hour}:${m.toString().padStart(2, '0')} ${ampm}`,
      isHour: m === 0 // Only show label for full hours
    }
  })
  
  // Format time from minutes since midnight to HH:MM (24-hour format for database)
  const formatTime = (minutes) => {
    if (minutes === null || minutes === undefined) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }
  
  // Format time for display (12-hour format with AM/PM)
  // Handles both "07:00" (24-hour) and "7:00 AM" (12-hour) input formats
  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return ''
    
    // Check if already in 12-hour format (contains AM/PM)
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      return timeStr
    }
    
    // Parse 24-hour format (HH:MM)
    const [h, m] = timeStr.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return timeStr // Return as-is if can't parse
    
    const hour = h % 12 || 12
    const ampm = h < 12 ? 'AM' : 'PM'
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }
  
  // Parse time string to minutes since midnight
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!match) return null
    let hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const ampm = match[3]?.toUpperCase()
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    return hours * 60 + minutes
  }
  
  // Calculate end time based on start time and duration
  const calculateEndTime = (startMinutes, durationMinutes) => {
    if (startMinutes === null || !durationMinutes) return null
    return startMinutes + durationMinutes
  }
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Navigation functions based on view mode
  const prevPeriod = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'daily') {
      newDate.setDate(newDate.getDate() - 1)
    } else if (viewMode === 'weekly') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }
  
  const nextPeriod = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'daily') {
      newDate.setDate(newDate.getDate() + 1)
    } else if (viewMode === 'weekly') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }
  
  const goToToday = () => setCurrentDate(new Date())
  
  // Context menu handlers
  const handleContextMenu = (e, task) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, task })
  }
  
  const closeContextMenu = () => setContextMenu(null)
  
  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu()
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
      return () => {
        document.removeEventListener('click', handleClick)
        document.removeEventListener('contextmenu', handleClick)
      }
    }
  }, [contextMenu])
  
  // Context menu actions
  const handleMenuAction = async (action) => {
    if (!contextMenu?.task) return
    const task = contextMenu.task
    closeContextMenu()
    
    switch (action) {
      case 'edit':
        onEditTask(task)
        break
      case 'delete':
        if (onDeleteTask && onShowConfirm) {
          onShowConfirm({
            title: 'Delete Task',
            message: `Delete "${task.title}"? This cannot be undone.`,
            confirmLabel: 'Delete',
            confirmStyle: 'danger',
            icon: '🗑️',
            onConfirm: () => {
              onDeleteTask(task.id)
            }
          })
        }
        break
      case 'duplicate':
        if (onDuplicateTask) {
          onDuplicateTask(task)
        }
        break
      case 'start':
        if (task.status !== 'in_progress') {
          await onUpdateTask(task.id, { status: 'in_progress' })
        }
        break
      case 'done':
        await onUpdateTask(task.id, { status: 'done' })
        break
      case 'todo':
        await onUpdateTask(task.id, { status: 'todo' })
        break
      case 'unschedule':
        await onUpdateTask(task.id, { start_time: null, end_time: null })
        break
      case 'tomorrow':
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        await onUpdateTask(task.id, { 
          start_date: tomorrow.toISOString().split('T')[0],
          start_time: task.start_time,
          end_time: task.end_time
        })
        break
      case 'nextWeek':
        const nextWeek = new Date()
        nextWeek.setDate(nextWeek.getDate() + 7)
        await onUpdateTask(task.id, { 
          start_date: nextWeek.toISOString().split('T')[0],
          start_time: task.start_time,
          end_time: task.end_time
        })
        break
    }
  }
  
  // Get week start (Sunday) for current date
  const getWeekStart = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }
  
  // Get week dates
  const getWeekDates = () => {
    const weekStart = getWeekStart(currentDate)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }
  
  const getTasksForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    // Show tasks with either start_date or due_date on this day
    return tasks.filter(t => t.start_date === dateStr || t.due_date === dateStr)
  }
  
  // Get tasks for a specific 30-minute slot on a date
  const getTasksForSlot = (date, slotIndex) => {
    const dateStr = date.toISOString().split('T')[0]
    const slotStart = slotIndex * 30
    const slotEnd = slotStart + 30
    
    return tasks.filter(t => {
      if (t.start_date !== dateStr) return false
      const startTime = t.start_time ? parseTimeToMinutes(t.start_time) : null
      if (startTime === null) return false
      return startTime >= slotStart && startTime < slotEnd
    })
  }
  
  // Handle drag start
  const handleDragStart = (e, task) => {
    isDraggingRef.current = true
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggedTask(null)
    setHoverSlot(null) // Clear calendar drop zone highlighting
    // Small delay to prevent click from firing after drag
    setTimeout(() => { isDraggingRef.current = false }, 100)
  }
  
  // Handle task click (only if not dragging)
  const handleTaskClick = (task) => {
    if (!isDraggingRef.current && !resizingTask) {
      onEditTask(task)
    }
  }
  
  // Quick status advancement: backlog → todo → in_progress → done
  const handleAdvanceStatus = async (e, task) => {
    e.stopPropagation()
    if (!onUpdateTask) return
    
    const statusOrder = ['backlog', 'todo', 'in_progress', 'done']
    const currentIndex = statusOrder.indexOf(task.status)
    const nextStatus = statusOrder[Math.min(currentIndex + 1, statusOrder.length - 1)]
    
    if (nextStatus !== task.status) {
      await onUpdateTask(task.id, { status: nextStatus })
    }
  }
  
  // Remove task from calendar (clear scheduled time)
  const handleRemoveFromCalendar = async (e, task) => {
    e.stopPropagation()
    if (!onUpdateTask) return
    
    await onUpdateTask(task.id, { 
      start_time: null, 
      end_time: null 
    })
  }
  
  // Mark task as done directly
  const handleMarkDone = async (e, task) => {
    e.stopPropagation()
    if (!onUpdateTask) return
    
    await onUpdateTask(task.id, { status: 'done' })
  }
  
  // Start task (move to in_progress)
  const handleStartTask = async (e, task) => {
    e.stopPropagation()
    if (!onUpdateTask) return
    
    await onUpdateTask(task.id, { status: 'in_progress' })
  }
  
  // Get next status label for button
  const getNextStatusLabel = (status) => {
    switch (status) {
      case 'backlog': return '→ To Do'
      case 'todo': return '→ Start'
      case 'in_progress': return '✓ Done'
      default: return null
    }
  }
  
  // Handle double-click on time slot to create new task
  const handleDoubleClickSlot = (date, slotIndex) => {
    if (!onCreateTask) return
    
    const dateStr = date.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const startTimeMinutes = slotIndex * 30
    const startTime = formatTime(startTimeMinutes)
    const endTime = formatTime(startTimeMinutes + 30) // Default 30 min
    
    const prefill = {
      start_date: dateStr,
      due_date: dateStr,
      start_time: startTime,
      end_time: endTime,
      status: 'todo'
    }
    
    // Auto-add to My Day if creating on today
    if (dateStr === todayStr) {
      prefill.my_day_date = todayStr
    }
    
    onCreateTask(prefill)
  }
  
  // Handle drop on time slot (30-minute increments)
  const handleDropOnSlot = async (date, slotIndex, e) => {
    console.log('handleDropOnSlot called', { date, slotIndex, hasEvent: !!e, draggedTask })
    
    // Get task from state OR from dataTransfer (backup if dragEnd fires first)
    let taskToSchedule = draggedTask
    if (!taskToSchedule && e?.dataTransfer) {
      const taskId = e.dataTransfer.getData('text/plain')
      console.log('Fallback to dataTransfer, taskId:', taskId)
      taskToSchedule = allTasks.find(t => t.id === taskId)
      console.log('Found task from allTasks:', taskToSchedule?.title)
    }
    
    if (!taskToSchedule || !onUpdateTask) {
      console.log('Drop failed: no task or onUpdateTask', { taskToSchedule, hasOnUpdateTask: !!onUpdateTask, allTasksLength: allTasks?.length })
      return
    }
    
    const dateStr = date.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    const startTimeMinutes = slotIndex * 30
    const startTime = formatTime(startTimeMinutes)
    
    // Calculate end time based on time_estimate
    const duration = taskToSchedule.time_estimate || 30 // default 30 mins
    const endTimeMinutes = startTimeMinutes + duration
    const endTime = formatTime(endTimeMinutes)
    
    console.log('Dropping task:', {
      taskId: taskToSchedule.id,
      dateStr,
      startTime,
      endTime,
      duration
    })
    
    const updates = {
      start_date: dateStr,
      start_time: startTime,
      end_time: endTime
    }
    
    // Set due_date if it's blank
    if (!taskToSchedule.due_date) {
      updates.due_date = dateStr
    }
    
    // Move backlog tasks to todo when scheduled
    if (taskToSchedule.status === 'backlog') {
      updates.status = 'todo'
    }
    
    // Auto-add to My Day if dropping on today
    if (dateStr === todayStr) {
      updates.my_day_date = todayStr
    }
    
    const taskId = taskToSchedule.id
    setDraggedTask(null)
    
    try {
      await onUpdateTask(taskId, updates)
      console.log('Task updated successfully with:', updates)
    } catch (err) {
      console.error('Error updating task:', err)
    }
  }
  
  // Handle drop on date (monthly view - no time)
  const handleDropOnDate = async (date) => {
    if (!draggedTask || !onUpdateTask) return
    
    const dateStr = date.toISOString().split('T')[0]
    
    await onUpdateTask(draggedTask.id, {
      start_date: dateStr,
      start_time: null,
      end_time: null
    })
    
    setDraggedTask(null)
  }
  
  // Handle resize start
  const handleResizeStart = (e, task) => {
    e.stopPropagation()
    e.preventDefault()
    setResizingTask({
      task,
      startY: e.clientY,
      originalDuration: task.time_estimate || 30
    })
  }
  
  // Handle resize move
  const handleResizeMove = (e) => {
    if (!resizingTask) return
    e.preventDefault()
  }
  
  // Handle resize end
  const handleResizeEnd = async (e) => {
    if (!resizingTask || !onUpdateTask) {
      setResizingTask(null)
      return
    }
    
    const deltaY = e.clientY - resizingTask.startY
    // Each 32px = 30 minutes in daily view
    const slotsDelta = Math.round(deltaY / 32)
    const newDuration = Math.max(15, resizingTask.originalDuration + (slotsDelta * 30))
    
    // Calculate new end time
    const startMinutes = parseTimeToMinutes(resizingTask.task.start_time)
    if (startMinutes !== null) {
      const newEndMinutes = startMinutes + newDuration
      const newEndTime = formatTime(newEndMinutes)
      
      console.log('Resizing task:', {
        taskId: resizingTask.task.id,
        oldDuration: resizingTask.originalDuration,
        newDuration,
        newEndTime
      })
      
      await onUpdateTask(resizingTask.task.id, {
        time_estimate: newDuration,
        end_time: newEndTime
      })
    }
    
    setResizingTask(null)
  }
  
  const renderCalendarDays = () => {
    const days = []
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-20 sm:h-28 bg-gray-50/50 dark:bg-gray-800/30" />)
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateStr = date.toISOString().split('T')[0]
      const dayTasks = getTasksForDate(date)
      const isToday = date.getTime() === today.getTime()
      const isSelected = selectedDate === dateStr
      const isPast = date < today
      
      const overdueTasks = dayTasks.filter(t => t.status !== 'done' && isPast && !isToday)
      const criticalTasks = dayTasks.filter(t => t.critical && t.status !== 'done')
      const completedTasks = dayTasks.filter(t => t.status === 'done')
      const pendingTasks = dayTasks.filter(t => t.status !== 'done')
      
      days.push(
        <div
          key={day}
          data-dropzone="calendar-date"
          data-date={date}
          onClick={() => {
            // Switch to daily view for this date
            setCurrentDate(date)
            setViewMode('daily')
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={(e) => { e.preventDefault(); handleDropOnDate(date) }}
          className={`h-20 sm:h-28 p-1.5 sm:p-2 border-b border-r border-gray-100 dark:border-gray-800 cursor-pointer transition-all hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 touch-manipulation ${
            isToday ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-2 ring-inset ring-indigo-400' : 
            isSelected ? 'bg-indigo-100 dark:bg-indigo-900/50' : 
            isPast ? 'bg-gray-50/30 dark:bg-gray-800/30' : 'bg-white dark:bg-gray-900'
          }`}
        >
          <div className="flex items-center justify-between mb-0.5 sm:mb-1">
            <span className={`text-xs sm:text-sm font-semibold ${
              isToday ? 'text-indigo-600 dark:text-indigo-400' : isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {day}
            </span>
            {dayTasks.length > 0 && (
              <span className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full ${
                overdueTasks.length > 0 ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                criticalTasks.length > 0 ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' :
                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
                {dayTasks.length}
              </span>
            )}
          </div>
          <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
            {dayTasks.slice(0, 2).map(task => {
              const project = projects.find(p => p.id === task.project_id)
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded truncate cursor-grab active:cursor-grabbing transition-all hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-600 ${
                    task.status === 'done' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 line-through' :
                    task.critical ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                    isPast && !isToday ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                    'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                  }`}
                  title={task.title}
                >
                  {task.critical && '🚩 '}{task.title}
                </div>
              )
            })}
            {dayTasks.length > 2 && (
              <div className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 px-1.5 sm:px-2">
                +{dayTasks.length - 2} more
              </div>
            )}
          </div>
        </div>
      )
    }
    
    return days
  }
  
  const selectedTasks = selectedDate ? tasks.filter(t => t.due_date === selectedDate || t.start_date === selectedDate) : []
  
  // Get header title based on view mode
  const getHeaderTitle = () => {
    if (viewMode === 'daily') {
      return currentDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    } else if (viewMode === 'weekly') {
      const weekDates = getWeekDates()
      const startDate = weekDates[0]
      const endDate = weekDates[6]
      if (startDate.getMonth() === endDate.getMonth()) {
        return `${startDate.getDate()} - ${endDate.getDate()} ${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`
      } else {
        return `${startDate.getDate()} ${monthNames[startDate.getMonth()].slice(0,3)} - ${endDate.getDate()} ${monthNames[endDate.getMonth()].slice(0,3)} ${endDate.getFullYear()}`
      }
    }
    return `${monthNames[month]} ${year}`
  }
  
  // Get tasks that can be scheduled, organized by category
  const getSchedulableTasks = () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const threeDaysFromNow = new Date(today)
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    
    // Filter out done tasks
    // Include tasks that either:
    // 1. Don't have a start_time (never scheduled)
    // 2. Have start_time but start_date is in the past and incomplete (needs rescheduling)
    const schedulable = tasks.filter(t => {
      if (t.status === 'done') return false
      
      // No start_time = definitely needs scheduling
      if (!t.start_time) return true
      
      // Has start_time - only include if start_date is in the past (incomplete, needs rescheduling)
      if (t.start_date) {
        const startDate = new Date(t.start_date)
        startDate.setHours(0, 0, 0, 0)
        if (startDate < today) return true // Past incomplete task - show it
      }
      
      return false // Has start_time for today or future - already scheduled
    })
    
    // Helper to check if task is in My Day (matching main My Day logic)
    const taskInMyDay = (task) => {
      if (task.status === 'done') return false
      
      // Check if task was dismissed (my_day_date set to a past date)
      if (task.my_day_date) {
        const myDayDate = new Date(task.my_day_date)
        myDayDate.setHours(0, 0, 0, 0)
        // If my_day_date < today, task was dismissed - NOT in My Day
        if (myDayDate < today) return false
        // If my_day_date = today, task was manually added - IS in My Day
        if (myDayDate.getTime() === today.getTime()) return true
      }
      
      // Auto-included: start_date = today (not past dates)
      if (task.start_date === todayStr) return true
      
      return false
    }
    
    // My Day gets priority - show all My Day tasks first
    const myDay = schedulable.filter(t => taskInMyDay(t))
    
    // Overdue (not in My Day)
    const overdue = schedulable.filter(t => {
      if (myDay.includes(t)) return false
      if (!t.due_date) return false
      const due = new Date(t.due_date)
      due.setHours(0, 0, 0, 0)
      return due < today
    })
    
    // Due Today (not in My Day or Overdue)
    const dueToday = schedulable.filter(t => {
      if (myDay.includes(t)) return false
      return t.due_date === todayStr
    })
    
    // Due Soon (not in above sections)
    const dueSoon = schedulable.filter(t => {
      if (myDay.includes(t) || dueToday.includes(t)) return false
      if (!t.due_date || t.due_date === todayStr) return false
      const due = new Date(t.due_date)
      due.setHours(0, 0, 0, 0)
      return due > today && due <= threeDaysFromNow
    })
    
    // Already categorized
    const alreadyCategorized = (t) => 
      myDay.includes(t) || overdue.includes(t) || dueToday.includes(t) || dueSoon.includes(t)
    
    // In Progress (not already categorized)
    const inProgress = schedulable.filter(t => 
      t.status === 'in_progress' && !alreadyCategorized(t)
    )
    
    // To Do (not already categorized or in progress)
    const todo = schedulable.filter(t => 
      t.status === 'todo' && 
      !alreadyCategorized(t) &&
      !inProgress.includes(t)
    )
    
    // Backlog (not already categorized)
    const backlog = schedulable.filter(t => 
      t.status === 'backlog' && 
      !alreadyCategorized(t) &&
      !inProgress.includes(t) &&
      !todo.includes(t)
    )
    
    // Quick Wins - low effort tasks not already shown
    const quickWins = schedulable.filter(t => 
      t.energy_level === 'low' &&
      !alreadyCategorized(t) &&
      !inProgress.includes(t) &&
      !todo.includes(t) &&
      !backlog.includes(t)
    )
    
    // Sort function to match board order (due date > created date)
    const sortByBoardOrder = (arr) => arr.sort((a, b) => {
      // Critical tasks first
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      // Then by due date (soonest first)
      if (a.due_date && b.due_date) {
        const diff = new Date(a.due_date) - new Date(b.due_date)
        if (diff !== 0) return diff
      }
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      // Then by created date (oldest first - first in, first out)
      return new Date(a.created_at) - new Date(b.created_at)
    })
    
    return { 
      overdue: sortByBoardOrder(overdue), 
      dueToday: sortByBoardOrder(dueToday), 
      dueSoon: sortByBoardOrder(dueSoon), 
      inProgress: sortByBoardOrder(inProgress), 
      myDay: sortByBoardOrder(myDay), 
      todo: sortByBoardOrder(todo), 
      backlog: sortByBoardOrder(backlog), 
      quickWins: sortByBoardOrder(quickWins) 
    }
  }
  
  // Handle schedule task from modal
  const handleScheduleFromModal = async () => {
    if (!taskToSchedule) return
    await onUpdateTask(taskToSchedule.id, {
      start_date: scheduleDate,
      start_time: scheduleTime,
      status: taskToSchedule.status === 'backlog' ? 'todo' : taskToSchedule.status
    })
    setTaskToSchedule(null)
  }

  // Render Daily View
  const renderDailyView = () => {
    const dateStr = currentDate.toISOString().split('T')[0]
    const isToday = currentDate.toDateString() === new Date().toDateString()
    const schedulable = getSchedulableTasks()
    const totalSchedulable = schedulable.overdue.length + schedulable.dueToday.length + schedulable.dueSoon.length + schedulable.inProgress.length + schedulable.myDay.length + schedulable.todo.length + schedulable.backlog.length + schedulable.quickWins.length
    
    // Reusable task card component for sidebar with hold-to-drag
    const TaskCard = ({ task, highlight }) => {
    const holdTimerRef = useRef(null)
    const isHoldingRef = useRef(false)
    const isDraggingRef = useRef(false)
    const [isHolding, setIsHolding] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const didDragRef = useRef(false)
    const touchStartPosRef = useRef(null)
    const [isTouchDragging, setIsTouchDragging] = useState(false)
    const [touchPos, setTouchPos] = useState({ x: 0, y: 0 })
    
    const handleMouseDown = (e) => {
    if (e.target.closest('button')) return
    didDragRef.current = false
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true
        setIsHolding(true)
      }, 200)
    }
    
    const handleMouseUp = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    setIsDragging(false)
    setTimeout(() => {
    isHoldingRef.current = false
      setIsHolding(false)
        didDragRef.current = false
      }, 100)
    }
    
    const handleCardDragStart = (e) => {
      isDraggingRef.current = true
      didDragRef.current = true
      setIsDragging(true)
      handleDragStart(e, task)
    }
    
    const handleCardDragEnd = () => {
      setIsDragging(false)
      setTimeout(() => {
        isDraggingRef.current = false
        didDragRef.current = false
      }, 100)
    }
    
    const handleClick = () => {
      if (!isDraggingRef.current) onEditTask(task)
    }
    
    // Touch event handlers for mobile drag and drop
    const handleTouchStart = (e) => {
    if (e.target.closest('button')) return
    
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    didDragRef.current = false
    
    holdTimerRef.current = setTimeout(() => {
    isHoldingRef.current = true
    setIsHolding(true)
    if (navigator.vibrate) navigator.vibrate(50)
        }, 200)
      }
      
      const handleTouchMove = (e) => {
        if (!isHoldingRef.current) {
          if (touchStartPosRef.current) {
            const touch = e.touches[0]
            const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
            const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
            if (dx > 10 || dy > 10) {
              // User is scrolling, not tapping
              didDragRef.current = true
              if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current)
                holdTimerRef.current = null
              }
            }
          }
          return
        }
        
        e.preventDefault()
        setIsTouchDragging(true)
        didDragRef.current = true
        setDraggedTask(task)
        
        const touch = e.touches[0]
        setTouchPos({ x: touch.clientX, y: touch.clientY })
        
        // Highlight drop zone if over it
        const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY)
        const dropSlot = elemBelow?.closest('[data-dropzone="calendar-slot"]')
        const dropDate = elemBelow?.closest('[data-dropzone="calendar-date"]')
        
        // Clear all highlights
        document.querySelectorAll('[data-dropzone="calendar-slot"], [data-dropzone="calendar-date"]').forEach(el => {
          el.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-100', 'dark:bg-indigo-900/40')
        })
        
        if (dropSlot) {
          dropSlot.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-100', 'dark:bg-indigo-900/40')
        } else if (dropDate) {
          dropDate.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-100', 'dark:bg-indigo-900/40')
        }
      }
      
      const handleTouchEnd = (e) => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current)
          holdTimerRef.current = null
        }
        
        // Clean up drop zone highlighting
        document.querySelectorAll('[data-dropzone="calendar-slot"], [data-dropzone="calendar-date"]').forEach(el => {
          el.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-100', 'dark:bg-indigo-900/40')
        })
        
        if (isTouchDragging && isHoldingRef.current) {
          const touch = e.changedTouches[0]
          const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY)
          const dropSlot = elemBelow?.closest('[data-dropzone="calendar-slot"]')
          const dropDate = elemBelow?.closest('[data-dropzone="calendar-date"]')
          
          if (dropSlot) {
            const slotDate = dropSlot.dataset.date
            const slotIndex = parseInt(dropSlot.dataset.slotIndex, 10)
            if (slotDate && !isNaN(slotIndex)) {
              handleDropOnSlot(slotDate, slotIndex, null)
            }
          } else if (dropDate) {
            const dateValue = dropDate.dataset.date
            if (dateValue) {
              handleDropOnDate(dateValue)
            }
          }
        } else if (!didDragRef.current && !isHoldingRef.current) {
          onEditTask(task)
        }
        
        setIsTouchDragging(false)
        setDraggedTask(null)
        setTimeout(() => {
          isHoldingRef.current = false
          setIsHolding(false)
          didDragRef.current = false
        }, 100)
        touchStartPosRef.current = null
      }
      
      return (
        <>
        <div
          draggable
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => holdTimerRef.current && clearTimeout(holdTimerRef.current)}
          onDragStart={handleCardDragStart}
          onDragEnd={handleCardDragEnd}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`p-2.5 rounded-lg border transition-all duration-200 select-none ${
            isDragging || isTouchDragging ? 'opacity-40 scale-[0.98]' : 
            isHolding ? 'cursor-grabbing ring-2 ring-indigo-400 scale-[1.02] shadow-lg' :
            'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
          } ${
            highlight === 'red' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
            highlight === 'orange' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' :
            highlight === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
            highlight === 'pink' ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800' :
            highlight === 'amber' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
            highlight === 'green' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
            highlight === 'blue' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
            highlight === 'gray' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' :
            'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}
        >
          <div className="flex items-start gap-2">
            <div 
              className="w-2 h-2 rounded-full mt-1.5 shrink-0"
              style={{ backgroundColor: COLUMN_COLORS[task.status] }}
            />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
              {task.critical && '🚩 '}{task.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
              {task.time_estimate && <span>⏱{formatTimeEstimate(task.time_estimate)}</span>}
              {task.due_date && <span>🗓{formatDate(task.due_date)}</span>}
            </div>
          </div>
        </div>
      </div>
      {/* Touch drag ghost */}
      {isTouchDragging && (
        <div
          className="fixed pointer-events-none z-[9999] p-2.5 rounded-lg border bg-white dark:bg-gray-800 border-indigo-400 shadow-2xl opacity-90 max-w-[200px]"
          style={{ left: touchPos.x - 100, top: touchPos.y - 30 }}
        >
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {task.critical && '🚩 '}{task.title}
          </p>
        </div>
      )}
      </>
    )
  }
    
    // Section component - uses external CalendarSidebarTaskCard with click-to-schedule
    const Section = ({ title, icon, tasks, highlight, defaultOpen = true }) => {
      if (tasks.length === 0) return null
      return (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <span>{icon}</span> {title}
            <span className="text-gray-400">({tasks.length})</span>
          </h4>
          <div className="space-y-1.5">
            {tasks.slice(0, 5).map(task => (
              <CalendarSidebarTaskCard
                key={task.id}
                task={task}
                highlight={highlight}
                onSelectForScheduling={setTaskToSchedule}
                onEditTask={onEditTask}
                COLUMN_COLORS={COLUMN_COLORS}
                formatTimeEstimate={formatTimeEstimate}
                formatDate={formatDate}
              />
            ))}
            {tasks.length > 5 && (
              <p className="text-[10px] text-gray-400 text-center">+{tasks.length - 5} more</p>
            )}
          </div>
        </div>
      )
    }
    
    return (
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Task scheduling indicator - shown when a task is selected */}
        {selectedTaskForScheduling && (
          <div className="fixed bottom-4 left-4 right-4 z-50 bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">🗓</span>
              <span className="text-sm font-medium truncate">Click a time slot to schedule: {selectedTaskForScheduling.title}</span>
            </div>
            <button
              onClick={() => setSelectedTaskForScheduling(null)}
              className="shrink-0 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {/* Main Calendar */}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Fixed header */}
          <div className="grid grid-cols-[60px_1fr] divide-x divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700">
            <div className="h-12 bg-gray-50 dark:bg-gray-800" />
            <div className={`h-12 flex items-center justify-center font-semibold ${isToday ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'}`}>
              {fullDayNames[currentDate.getDay()]} {currentDate.getDate()}
            </div>
          </div>
          {/* Scrollable time grid */}
          <div ref={calendarScrollRef} className="max-h-[600px] overflow-y-auto">
            <div className="grid grid-cols-[60px_1fr] divide-x divide-gray-200 dark:divide-gray-700">
              {/* Time column */}
              <div className="bg-gray-50 dark:bg-gray-800">
                {timeSlots.map(({ slotIndex, label, isHour }) => (
                  <div key={slotIndex} className="h-8 px-2 flex items-center justify-end border-b border-gray-100 dark:border-gray-800">
                    {isHour && <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>}
                  </div>
                ))}
              </div>
              
              {/* Day column */}
              <div className="relative">
                {/* Current time indicator */}
                {isToday && (() => {
                  const now = new Date()
                  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
                  const topPosition = (minutesSinceMidnight / 30) * 32 // 32px per 30-min slot
                  return (
                    <div 
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${topPosition}px` }}
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <div className="flex-1 h-0.5 bg-red-500" />
                      </div>
                    </div>
                  )
                })()}
                {timeSlots.map(({ slotIndex, isHour }) => {
                  const slotTasks = getTasksForSlot(currentDate, slotIndex)
                  const isHoverTarget = hoverSlot && hoverSlot.date === dateStr && hoverSlot.slotIndex === slotIndex
                  return (
                    <div
                      key={slotIndex}
                      data-dropzone="calendar-slot"
                      data-date={currentDate}
                      data-slot-index={slotIndex}
                      className={`h-8 border-b relative transition-all duration-150 ${
                        isHour ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800'
                      } ${isHoverTarget && draggedTask ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-2 ring-inset ring-indigo-400' : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20'} cursor-pointer`}
                      onDragOver={(e) => { 
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setHoverSlot({ date: dateStr, slotIndex })
                      }}
                      onDragLeave={() => setHoverSlot(null)}
                      onDrop={(e) => { 
                        e.preventDefault()
                        setHoverSlot(null)
                        handleDropOnSlot(currentDate, slotIndex, e) 
                      }}
                      onDoubleClick={() => handleDoubleClickSlot(currentDate, slotIndex)}
                    >
                      {/* Drop preview */}
                      {isHoverTarget && draggedTask && (
                        <div 
                          className="absolute inset-x-1 top-0 bg-indigo-200/50 dark:bg-indigo-700/30 border-2 border-dashed border-indigo-400 rounded text-[10px] text-indigo-600 dark:text-indigo-300 px-1 truncate pointer-events-none z-30"
                          style={{ height: `${Math.ceil((draggedTask.time_estimate || 30) / 30) * 32 - 2}px` }}
                        >
                          {draggedTask.title}
                        </div>
                      )}
                      {slotTasks.map(task => {
                        const duration = task.time_estimate || 30
                        const heightSlots = Math.ceil(duration / 30)
                        const projectColor = getProjectColor(task.project_id)
                        const isOverlapping = hasOverlap(task, currentDate)
                        return (
                          <div
                            key={task.id}
                            draggable={!resizingTask}
                            onDragStart={(e) => !resizingTask && handleDragStart(e, task)}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                            onDoubleClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                            className={`absolute left-1 right-1 px-2 py-0.5 rounded text-xs font-medium cursor-grab active:cursor-grabbing shadow-sm transition-all hover:shadow-md z-10 overflow-hidden group ${
                              task.status === 'done' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 line-through' :
                              task.critical ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                              `${projectColor.bg} ${projectColor.text}`
                            } ${isOverlapping ? 'ring-2 ring-orange-400 dark:ring-orange-500' : ''}`}
                            style={{ height: `${heightSlots * 32 - 2}px`, top: '1px' }}
                            title={`${task.title}${task.start_time ? ` (${formatTimeDisplay(task.start_time)}${task.end_time ? ' - ' + formatTimeDisplay(task.end_time) : ''})` : ''}${isOverlapping ? ' ⚠️ Overlaps with another task' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="truncate text-[11px]">
                                {isOverlapping && <span title="Time conflict">⚠️ </span>}
                                {task.critical && '🚩 '}{task.title}
                              </div>
                              {/* Quick action buttons - grouped on right */}
                              <div className="flex items-center gap-0.5 shrink-0">
                                {/* Start button - only show if not started */}
                                {(task.status === 'backlog' || task.status === 'todo') && (
                                  <button
                                    onClick={(e) => handleStartTask(e, task)}
                                    className="text-[8px] px-1 py-0.5 rounded bg-white/50 dark:bg-black/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Start task"
                                  >
                                    ▶
                                  </button>
                                )}
                                {/* Done button - show if not done */}
                                {task.status !== 'done' && (
                                  <button
                                    onClick={(e) => handleMarkDone(e, task)}
                                    className="text-[8px] px-1 py-0.5 rounded bg-white/50 dark:bg-black/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Mark as done"
                                  >
                                    ✓
                                  </button>
                                )}
                                {/* Remove from calendar button */}
                                <button
                                  onClick={(e) => handleRemoveFromCalendar(e, task)}
                                  className="text-[8px] px-1 py-0.5 rounded bg-white/50 dark:bg-black/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove from calendar"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            {heightSlots > 1 && task.start_time && (
                              <div className="text-[9px] opacity-70">{formatTimeDisplay(task.start_time)}{task.end_time && ` - ${formatTimeDisplay(task.end_time)}`}</div>
                            )}
                            {/* Resize handle */}
                            <div
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-transparent hover:bg-indigo-300/50 dark:hover:bg-indigo-600/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-b"
                              onMouseDown={(e) => handleResizeStart(e, task)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Schedulable Tasks Sidebar */}
        <div className="w-full lg:w-72 lg:shrink-0">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
              <span>🗓</span> Schedule Tasks
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Click 🗓 to set date & time{isToday ? ' • Auto-adds to My Day' : ''}</p>
            
            <div className="max-h-[600px] overflow-y-auto pr-1">
              {totalSchedulable === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">All caught up! 🎉</p>
              ) : (
                <>
                  <Section title="My Day" icon="☀️" tasks={schedulable.myDay} highlight="amber" />
                  <Section title="In Progress" icon="🟣" tasks={schedulable.inProgress} highlight="pink" />
                  <Section title="To Do" icon="📋" tasks={schedulable.todo} highlight="blue" />
                  <Section title="Backlog" icon="📦" tasks={schedulable.backlog} highlight="gray" />
                  <Section title="Overdue" icon="🔴" tasks={schedulable.overdue} highlight="red" />
                  <Section title="Due Today" icon="🟠" tasks={schedulable.dueToday} highlight="orange" />
                  <Section title="Due Soon" icon="🟡" tasks={schedulable.dueSoon} highlight="yellow" />
                  <Section title="Quick Wins" icon="⚡" tasks={schedulable.quickWins} highlight="green" />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // Render Weekly View
  const renderWeeklyView = () => {
    const weekDates = getWeekDates()
    const todayStr = new Date().toISOString().split('T')[0]
    
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Horizontal scroll wrapper for mobile */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
        {/* Fixed header */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] divide-x divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700">
          <div className="h-12 bg-gray-50 dark:bg-gray-800" />
          {weekDates.map((date, idx) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayStr
            return (
              <div key={idx} className={`h-12 flex flex-col items-center justify-center ${isToday ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                <span className="text-xs text-gray-500 dark:text-gray-400">{dayNames[date.getDay()]}</span>
                <span className={`text-sm font-semibold ${isToday ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{date.getDate()}</span>
              </div>
            )
          })}
        </div>
        
        {/* Scrollable time grid */}
        <div ref={calendarScrollRef} className="max-h-[600px] overflow-y-auto">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] divide-x divide-gray-200 dark:divide-gray-700">
            {/* Time column */}
            <div className="bg-gray-50 dark:bg-gray-800">
              {timeSlots.map(({ slotIndex, label, isHour }) => (
                <div key={slotIndex} className="h-6 px-1 flex items-center justify-end border-b border-gray-100 dark:border-gray-800">
                  {isHour && <span className="text-[9px] text-gray-500 dark:text-gray-400">{label}</span>}
                </div>
              ))}
            </div>
            
            {/* Day columns */}
            {weekDates.map((date, idx) => {
              const dateStr = date.toISOString().split('T')[0]
              const isToday = dateStr === todayStr
              
              return (
                <div key={idx} className={`min-w-[80px] relative ${isToday ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                  {/* Current time indicator for today */}
                  {isToday && (() => {
                    const now = new Date()
                    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes()
                    const topPosition = (minutesSinceMidnight / 30) * 24 // 24px per 30-min slot in weekly
                    return (
                      <div 
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: `${topPosition}px` }}
                      >
                        <div className="h-0.5 bg-red-500" />
                      </div>
                    )
                  })()}
                  {timeSlots.map(({ slotIndex, isHour }) => {
                    const slotTasks = getTasksForSlot(date, slotIndex)
                    return (
                      <div
                        key={slotIndex}
                        data-dropzone="calendar-slot"
                        data-date={date}
                        data-slot-index={slotIndex}
                        className={`h-6 border-b relative transition-colors ${
                          isHour ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800'
                        } hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 cursor-pointer`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                        onDrop={(e) => { e.preventDefault(); handleDropOnSlot(date, slotIndex, e) }}
                        onDoubleClick={() => handleDoubleClickSlot(date, slotIndex)}
                      >
                        {slotTasks.map(task => {
                          const duration = task.time_estimate || 30
                          const heightSlots = Math.min(Math.ceil(duration / 30), 8) // Cap at 4 hours for weekly
                          const projectColor = getProjectColor(task.project_id)
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                              onDoubleClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                              className={`absolute left-0.5 right-0.5 px-1 rounded text-[9px] font-medium cursor-grab active:cursor-grabbing shadow-sm transition-all hover:shadow-md z-10 overflow-hidden group ${
                                task.status === 'done' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 line-through' :
                                task.critical ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                                `${projectColor.bg} ${projectColor.text}`
                              }`}
                              style={{ height: `${heightSlots * 24 - 2}px`, top: '1px' }}
                              title={task.title}
                            >
                              <div className="flex items-center justify-between">
                                <span className="truncate">{task.critical && '🚩'}{task.title}</span>
                                {/* Quick action buttons - grouped on right */}
                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {/* Start button - only show if not started */}
                                  {(task.status === 'backlog' || task.status === 'todo') && (
                                    <button
                                      onClick={(e) => handleStartTask(e, task)}
                                      className="hover:text-blue-500"
                                      title="Start task"
                                    >
                                      ▶
                                    </button>
                                  )}
                                  {/* Done button - show if not done */}
                                  {task.status !== 'done' && (
                                    <button
                                      onClick={(e) => handleMarkDone(e, task)}
                                      className="hover:text-green-500"
                                      title="Mark as done"
                                    >
                                      ✓
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => handleRemoveFromCalendar(e, task)}
                                    className="hover:text-red-500"
                                    title="Remove from calendar"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
          </div>{/* closes min-w-[700px] */}
        </div>{/* closes overflow-x-auto */}
      </div>
    )
  }
  
  return (
    <div className="max-w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 overflow-x-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-gray-100">
              {getHeaderTitle()}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
              {tasks.filter(t => (t.due_date || t.start_date) && t.status !== 'done').length} tasks scheduled
            </p>
          </div>
          
          {/* Navigation - always visible */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={goToToday}
              className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={prevPeriod}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors touch-manipulation"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextPeriod}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors touch-manipulation"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* View Mode Switcher - sleek pill design */}
        <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-0.5">
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === 'daily' 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === 'weekly' 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === 'monthly' 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Month
          </button>
        </div>
      </div>
      
      {/* Daily View */}
      {viewMode === 'daily' && renderDailyView()}
      
      {/* Weekly View */}
      {viewMode === 'weekly' && renderWeeklyView()}
      
      {/* Monthly View */}
      {viewMode === 'monthly' && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {dayNames.map((day, idx) => (
                <div key={day} className="py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-400">
                  <span className="hidden sm:inline">{day}</span>
                  <span className="sm:hidden">{day.charAt(0)}</span>
                </div>
              ))}
            </div>
            
            {/* Calendar Days */}
            <div className="grid grid-cols-7">
              {renderCalendarDays()}
            </div>
          </div>
      
      {/* Selected Date Tasks */}
      {selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">
            Tasks for {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="text-gray-500 text-sm">No tasks due on this date</p>
          ) : (
            <div className="space-y-3">
              {selectedTasks.map(task => {
                const project = projects.find(p => p.id === task.project_id)
                const category = CATEGORIES.find(c => c.id === task.category)
                return (
                  <div
                    key={task.id}
                    onClick={() => onEditTask(task)}
                    className={`p-4 rounded-xl border cursor-pointer hover:shadow-md transition-all ${
                      task.status === 'done' ? 'bg-green-50 border-green-200' :
                      task.critical ? 'bg-red-50 border-red-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: COLUMN_COLORS[task.status] }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-medium ${
                          task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'
                        }`}>
                          {task.critical && '🚩 '}{task.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          {project && <span>{project.name}</span>}
                          {category && (
                            <span className="px-2 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: category.color }}>
                              {category.label}
                            </span>
                          )}
                          {task.assignee && <span>• {task.assignee}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg ${
                        task.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {COLUMNS.find(c => c.id === task.status)?.title}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Legend - Monthly View */}
          <div className="mt-6 flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-400" />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/50" />
              <span>Overdue / Critical</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/50" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">📌</span>
              <span>Drag tasks to reschedule</span>
            </div>
          </div>
        </>
      )}
      
      {/* Legend - Day/Week Views */}
      {(viewMode === 'daily' || viewMode === 'weekly') && (
        <div className="mt-6 flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-100 dark:bg-indigo-900/50" />
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/50" />
            <span>Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/50" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">📌</span>
            <span>Drag tasks to schedule time</span>
          </div>
        </div>
      )}
      
      {/* Schedule Task Modal */}
      {taskToSchedule && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setTaskToSchedule(null)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xs p-4">
            <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">🗓 Schedule Task</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{taskToSchedule.title}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setTaskToSchedule(null)}
                  className="flex-1 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleFromModal}
                  className="flex-1 px-3 py-2.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-semibold"
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// My Day Task Card - simplified without drag
const MyDayTaskCard = ({ task, project, showRemove = false, isCompleted = false, blocked, dueDateStatus, energyStyle, onEditTask, onQuickStatusChange, onRemoveFromMyDay, onAddToMyDay }) => {
  return (
    <div
      onClick={() => onEditTask(task)}
      className={`group relative p-4 rounded-xl select-none transition-all duration-200 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 hover:-translate-y-0.5 cursor-pointer ${
        isCompleted 
          ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60' 
          : blocked 
            ? 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800' 
            : task.critical 
              ? 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800' 
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')
          }}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
            task.status === 'done'
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
          }`}
        >
          {task.status === 'done' && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-medium text-sm leading-tight ${
              isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-100'
            }`}>
              {task.critical && !isCompleted && <span className="text-red-500 mr-1">🚩</span>}
              {blocked && !isCompleted && <span className="text-orange-500 mr-1">🔒</span>}
              {task.title}
            </h4>
            
            {/* Add to My Day button - shown in Recommendations */}
            {onAddToMyDay && !isCompleted && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddToMyDay(task.id)
                }}
                className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all touch-manipulation text-amber-500 hover:text-amber-600 dark:text-amber-400"
                title="Add to My Day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
            )}
            
            {/* Remove from My Day button - shown in My Day list */}
            {showRemove && !isCompleted && (
              <button
                onClick={(e) => onRemoveFromMyDay(e, task)}
                className="sm:opacity-0 sm:group-hover:opacity-100 p-2 sm:p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all touch-manipulation"
                title="Remove from My Day"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {project && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {project.name}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                dueDateStatus === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                dueDateStatus === 'today' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                dueDateStatus === 'soon' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {formatDate(task.due_date)}
              </span>
            )}
            {energyStyle && (
              <span className="text-xs" title={`${energyStyle.label} effort`}>
                {task.energy_level === 'low' && <span style={{color: energyStyle.text}}>▰</span>}
                {task.energy_level === 'medium' && <span style={{color: energyStyle.text}}>▰▰</span>}
                {task.energy_level === 'high' && <span style={{color: energyStyle.text}}>▰▰▰</span>}
              </span>
            )}
            {task.time_estimate && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {task.time_estimate < 60 ? `${task.time_estimate}m` : `${Math.round(task.time_estimate / 60)}h`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// My Day Dashboard Component - Redesigned
const MyDayDashboard = ({ tasks, projects, onEditTask, allTasks, onQuickStatusChange, onUpdateMyDayDate, showConfettiPref }) => {
  const [expandedSection, setExpandedSection] = useState('overdue')
  const [confettiShown, setConfettiShown] = useState(false)
  const prevActiveCountRef = useRef(null)
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingEmoji = hour < 12 ? '🌅' : hour < 17 ? '☀️' : '🌙'
  
  const taskInMyDay = (task) => {
    // Check if task was dismissed (my_day_date set to a past date)
    if (task.my_day_date) {
      const myDayDate = new Date(task.my_day_date)
      myDayDate.setHours(0, 0, 0, 0)
      // If my_day_date < today, task was dismissed - exclude it
      if (myDayDate < today) return false
      // If my_day_date = today, task was manually added - include it
      if (myDayDate.getTime() === today.getTime()) {
        // But not if it's done (unless completed today)
        if (task.status === 'done') {
          if (!task.completed_at) return false
          const completedDate = new Date(task.completed_at)
          completedDate.setHours(0, 0, 0, 0)
          return completedDate.getTime() === today.getTime()
        }
        return true
      }
    }
    
    // For done tasks without my_day_date, show if auto-added and completed today
    if (task.status === 'done') {
      if (!task.completed_at) return false
      const completedDate = new Date(task.completed_at)
      completedDate.setHours(0, 0, 0, 0)
      if (completedDate.getTime() !== today.getTime()) return false
      
      // Was auto-added via start_date
      if (task.start_date) {
        const startDate = new Date(task.start_date)
        startDate.setHours(0, 0, 0, 0)
        if (startDate <= today) return true
      }
      return false
    }
    
    // For active tasks: auto-included if start_date <= today
    if (task.start_date) {
      const startDate = new Date(task.start_date)
      startDate.setHours(0, 0, 0, 0)
      if (startDate <= today) return true
    }
    
    return false
  }
  
  const isAutoAdded = (task) => {
    if (task.start_date) {
      const startDate = new Date(task.start_date)
      startDate.setHours(0, 0, 0, 0)
      if (startDate <= today) return true
    }
    return false
  }
  
  // Memoize My Day task filtering for performance
  const myDayTasks = useMemo(() => tasks.filter(t => taskInMyDay(t)), [tasks])
  const myDayActive = useMemo(() => myDayTasks.filter(t => t.status !== 'done'), [myDayTasks])
  const myDayCompleted = useMemo(() => myDayTasks.filter(t => t.status === 'done'), [myDayTasks])
  
  // Sort My Day tasks to match board order:
  // - Tasks WITH start_date: sorted by date > time
  // - Tasks WITHOUT start_date: sorted by status > created_at
  myDayActive.sort((a, b) => {
    const aHasDate = !!a.start_date
    const bHasDate = !!b.start_date
    
    // Tasks with start_date come first
    if (aHasDate && !bHasDate) return -1
    if (!aHasDate && bHasDate) return 1
    
    // Both have start_date: sort by date, then time
    if (aHasDate && bHasDate) {
      const dateDiff = new Date(a.start_date) - new Date(b.start_date)
      if (dateDiff !== 0) return dateDiff
      
      // Same date: sort by time (earliest first, nulls last)
      const aTime = a.start_time || a.end_time
      const bTime = b.start_time || b.end_time
      if (aTime && !bTime) return -1
      if (!aTime && bTime) return 1
      if (aTime && bTime) {
        const timeDiff = aTime.localeCompare(bTime)
        if (timeDiff !== 0) return timeDiff
      }
    }
    
    // Neither has start_date (or same date/time): sort by status > created_at
    const statusOrder = { 'in_progress': 0, 'todo': 1, 'backlog': 2 }
    const aStatus = statusOrder[a.status] ?? 3
    const bStatus = statusOrder[b.status] ?? 3
    if (aStatus !== bStatus) return aStatus - bStatus
    
    // Same status: sort by created_at (earliest first)
    return new Date(a.created_at) - new Date(b.created_at)
  })
  
  const notInMyDay = tasks.filter(t => !taskInMyDay(t) && t.status !== 'done')
  
  // For date-based recommendations (overdue, due today, due soon), include todo and in_progress
  const dateBasedEligible = notInMyDay.filter(t => 
    (t.status === 'todo' || t.status === 'in_progress') && !isBlocked(t, allTasks)
  )
  
  const overdueTasks = dateBasedEligible.filter(t => 
    getDueDateStatus(t.due_date, t.status) === 'overdue'
  )
  
  const dueTodayTasks = dateBasedEligible.filter(t => 
    getDueDateStatus(t.due_date, t.status) === 'today' && !overdueTasks.includes(t)
  )
  
  const dueSoonTasks = dateBasedEligible.filter(t => {
    if (!t.due_date || overdueTasks.includes(t) || dueTodayTasks.includes(t)) return false
    const dueDate = new Date(t.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
    return diffDays > 0 && diffDays <= 3
  })
  
  // Helper to check if task is already in a date-based section
  const isInDateSection = (t) => 
    overdueTasks.includes(t) || dueTodayTasks.includes(t) || dueSoonTasks.includes(t)
  
  // Status-based sections (exclude tasks already shown in date sections)
  const inProgressTasks = notInMyDay.filter(t => 
    t.status === 'in_progress' && !isBlocked(t, allTasks) && !isInDateSection(t)
  )
  
  const todoTasks = notInMyDay.filter(t => 
    t.status === 'todo' && !isBlocked(t, allTasks) && !isInDateSection(t)
  )
  
  const backlogTasks = notInMyDay.filter(t => 
    t.status === 'backlog' && !isBlocked(t, allTasks)
  )
  
  const quickWinTasks = notInMyDay.filter(t => 
    t.energy_level === 'low' && 
    !isInDateSection(t) &&
    !inProgressTasks.includes(t) &&
    !todoTasks.includes(t) &&
    !backlogTasks.includes(t)
  ).slice(0, 5)
  
  const totalMyDayTime = myDayActive.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  const completedTime = myDayCompleted.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  const progressPercent = myDayTasks.length > 0 
    ? Math.round((myDayCompleted.length / myDayTasks.length) * 100) 
    : 0
  
  // Confetti when all My Day tasks are completed!
  useEffect(() => {
    // Only trigger if we had active tasks before and now have none
    // And we have completed tasks (meaning we actually finished something)
    if (
      prevActiveCountRef.current > 0 && 
      myDayActive.length === 0 && 
      myDayCompleted.length > 0 && 
      !confettiShown &&
      showConfettiPref !== false
    ) {
      // Fire confetti! (lazy loaded)
      setConfettiShown(true)
      loadConfetti().then(confetti => {
        const duration = 3000
        const end = Date.now() + duration
        
        const frame = () => {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.8 },
            colors: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899']
          })
          confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.8 },
            colors: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899']
          })
          
          if (Date.now() < end) {
            requestAnimationFrame(frame)
          }
        }
        frame()
      })
    }
    
    // Update previous count
    prevActiveCountRef.current = myDayActive.length
  }, [myDayActive.length, myDayCompleted.length, confettiShown, showConfettiPref])

  const handleRemoveFromMyDay = (e, task) => {
    e.stopPropagation()
    // Set to yesterday to mark as "dismissed from My Day"
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    onUpdateMyDayDate(task.id, yesterdayStr)
  }
  
  const RecommendationSection = ({ title, emoji, color, tasks, id }) => {
    if (tasks.length === 0) return null
    const isExpanded = expandedSection === id
    
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className={`w-full px-3 sm:px-4 py-3 sm:py-3 flex items-center justify-between ${color} transition-colors touch-manipulation`}
        >
          <div className="flex items-center gap-2">
            <span>{emoji}</span>
            <span className="font-medium text-sm">{title}</span>
            <span className="text-xs bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-full">{tasks.length}</span>
          </div>
          <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isExpanded && (
          <div className="p-2 sm:p-3 space-y-2 bg-white dark:bg-gray-900">
            {tasks.map(task => {
              const project = projects.find(p => p.id === task.project_id)
              const blocked = isBlocked(task, allTasks)
              const dueDateStatus = getDueDateStatus(task.due_date, task.status)
              const energyStyle = ENERGY_LEVELS[task.energy_level]
              return (
                <MyDayTaskCard
                  key={task.id}
                  task={task}
                  project={project}
                  blocked={blocked}
                  dueDateStatus={dueDateStatus}
                  energyStyle={energyStyle}
                  onEditTask={onEditTask}
                  onQuickStatusChange={onQuickStatusChange}
                  onAddToMyDay={(taskId) => onUpdateMyDayDate(taskId, todayStr)}
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className="max-w-6xl mx-auto px-4 sm:p-6 py-4">
      <div className="mb-4 sm:mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 sm:gap-3">
            {greetingEmoji} {greeting}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            {dayNames[today.getDay()]}, {monthNames[today.getMonth()]} {today.getDate()}
          </p>
        </div>
        
        
      </div>
      
      {myDayTasks.length > 0 && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Today's Progress</span>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {myDayCompleted.length} of {myDayTasks.length} tasks ({progressPercent}%)
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {totalMyDayTime > 0 && (
            <div className="flex justify-between mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              <span>~{Math.round(totalMyDayTime / 60)}h remaining</span>
              <span>~{Math.round(completedTime / 60)}h completed</span>
            </div>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <span className="text-lg sm:text-xl">☀️</span>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">My Day</h2>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">({myDayActive.length} active)</span>
          </div>
          
          <div
            className="min-h-[150px] sm:min-h-[200px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 transition-all"
          >
            {myDayActive.length === 0 && myDayCompleted.length === 0 ? (
              <EmptyState
                icon="☀️"
                title="Your day is wide open"
                description="Click the ☀️ button on recommended tasks below to add them here, or create tasks with today's start date."
                variant="default"
              />
            ) : (
              <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                {myDayActive.map(task => {
                  const project = projects.find(p => p.id === task.project_id)
                  const blocked = isBlocked(task, allTasks)
                  const dueDateStatus = getDueDateStatus(task.due_date, task.status)
                  const energyStyle = ENERGY_LEVELS[task.energy_level]
                  return (
                    <MyDayTaskCard
                      key={task.id}
                      task={task}
                      project={project}
                      showRemove={true}
                      blocked={blocked}
                      dueDateStatus={dueDateStatus}
                      energyStyle={energyStyle}
                      onEditTask={onEditTask}
                      onQuickStatusChange={onQuickStatusChange}
                      onRemoveFromMyDay={handleRemoveFromMyDay}
                    />
                  )
                })}
                
                {myDayCompleted.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-3 sm:pt-4 pb-2">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">Completed today ({myDayCompleted.length})</span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                    {myDayCompleted.map(task => {
                      const project = projects.find(p => p.id === task.project_id)
                      const blocked = isBlocked(task, allTasks)
                      const dueDateStatus = getDueDateStatus(task.due_date, task.status)
                      const energyStyle = ENERGY_LEVELS[task.energy_level]
                      return (
                        <MyDayTaskCard
                          key={task.id}
                          task={task}
                          project={project}
                          isCompleted={true}
                          blocked={blocked}
                          dueDateStatus={dueDateStatus}
                          energyStyle={energyStyle}
                          onEditTask={onEditTask}
                          onQuickStatusChange={onQuickStatusChange}
                        />
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <span className="text-lg sm:text-xl">💡</span>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">Recommendations</h2>
          </div>
          
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            Click the ☀️ button on any task to add it to your focus list
          </p>
          
          <div className="space-y-2 sm:space-y-3">
            <RecommendationSection
              id="overdue"
              title="Overdue"
              emoji="🔴"
              color="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              tasks={overdueTasks}
            />
            
            <RecommendationSection
              id="dueToday"
              title="Due Today"
              emoji="🟠"
              color="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400"
              tasks={dueTodayTasks}
            />
            
            <RecommendationSection
              id="dueSoon"
              title="Due Soon"
              emoji="🟡"
              color="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
              tasks={dueSoonTasks}
            />
            
            <RecommendationSection
              id="quickWins"
              title="Quick Wins"
              emoji="🟢"
              color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
              tasks={quickWinTasks}
            />
            
            <RecommendationSection
              id="inProgress"
              title="In Progress"
              emoji="🔵"
              color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
              tasks={inProgressTasks}
            />
            
            <RecommendationSection
              id="todo"
              title="To Do"
              emoji="⚪"
              color="bg-slate-50 dark:bg-slate-900/20 text-slate-700 dark:text-slate-400"
              tasks={todoTasks}
            />
            
            <RecommendationSection
              id="backlog"
              title="Backlog"
              emoji="📋"
              color="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400"
              tasks={backlogTasks}
            />
            
            {overdueTasks.length === 0 && dueTodayTasks.length === 0 && dueSoonTasks.length === 0 && quickWinTasks.length === 0 && inProgressTasks.length === 0 && todoTasks.length === 0 && backlogTasks.length === 0 && (
              <EmptyState
                icon="🎉"
                title="You're all caught up!"
                description="No tasks need your attention right now. Enjoy the moment or create something new."
                variant="celebrate"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Task Table View Component
const TaskTableView = ({ tasks, projects, onEditTask, allTasks }) => {
  const { user } = useAuth()
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState('desc')
  const [columnFilters, setColumnFilters] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  
  // Get unique values for filter dropdowns
  const getUniqueValues = (field) => {
    const values = tasks.map(t => {
      if (field === 'project') return projects.find(p => p.id === t.project_id)?.name
      if (field === 'category') return CATEGORIES.find(c => c.id === t.category)?.label
      if (field === 'source') return SOURCES.find(s => s.id === t.source)?.label
      return t[field]
    }).filter(Boolean)
    return [...new Set(values)].sort()
  }
  
  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }
  
  // Filter tasks (memoized for performance)
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      for (const [field, value] of Object.entries(columnFilters)) {
        if (!value) continue
        
        let taskValue
        if (field === 'project') {
          taskValue = projects.find(p => p.id === task.project_id)?.name || ''
        } else if (field === 'category') {
          taskValue = CATEGORIES.find(c => c.id === task.category)?.label || ''
        } else if (field === 'source') {
          taskValue = SOURCES.find(s => s.id === task.source)?.label || ''
        } else {
          taskValue = task[field] || ''
        }
        
        if (value === '__blank__' && taskValue) return false
        if (value !== '__blank__' && String(taskValue).toLowerCase() !== String(value).toLowerCase()) return false
      }
      return true
    })
  }, [tasks, columnFilters, projects])
  
  // Sort tasks (memoized for performance)
  const sortedTasks = useMemo(() => [...filteredTasks].sort((a, b) => {
    let aVal, bVal
    
    if (sortField === 'project') {
      aVal = projects.find(p => p.id === a.project_id)?.name || ''
      bVal = projects.find(p => p.id === b.project_id)?.name || ''
    } else if (sortField === 'category') {
      aVal = CATEGORIES.find(c => c.id === a.category)?.label || ''
      bVal = CATEGORIES.find(c => c.id === b.category)?.label || ''
    } else {
      aVal = a[sortField] ?? ''
      bVal = b[sortField] ?? ''
    }
    
    // Handle dates
    if (sortField.includes('date') || sortField === 'created_at') {
      aVal = aVal ? new Date(aVal).getTime() : 0
      bVal = bVal ? new Date(bVal).getTime() : 0
    }
    
    // Handle booleans
    if (typeof aVal === 'boolean') aVal = aVal ? 1 : 0
    if (typeof bVal === 'boolean') bVal = bVal ? 1 : 0
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  }), [filteredTasks, sortField, sortDirection, projects])
  
  // Export to CSV
  const exportToCSV = () => {
    const headers = ['ID', 'Title', 'Project', 'Project Archived', 'Status', 'Critical', 'Due Date', 'Start Date', 'Assignee', 'Customer', 'Category', 'Effort', 'Source', 'Time Estimate', 'Description', 'Created']
    const rows = sortedTasks.map(t => {
      const taskProject = projects.find(p => p.id === t.project_id)
      return [
        t.id || '',
        t.title || '',
        taskProject?.name || '',
        taskProject?.archived ? 'Yes' : 'No',
        t.status || '',
        t.critical ? 'Yes' : 'No',
      t.due_date || '',
      t.start_date || '',
      t.assignee || '',
      t.customer || '',
      CATEGORIES.find(c => c.id === t.category)?.label || '',
      t.energy_level || '',
      SOURCES.find(s => s.id === t.source)?.label || '',
      t.time_estimate ? `${t.time_estimate}m` : '',
      (t.description || '').replace(/[\n\r,]/g, ' '),
      t.created_at ? new Date(t.created_at).toLocaleDateString() : ''
      ]
    })
    
    const csvContent = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `trackli-tasks-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }
  
  // Download blank CSV template
  const downloadTemplate = () => {
    const headers = ['ID', 'Title', 'Project', 'Status', 'Critical', 'Due Date', 'Start Date', 'Assignee', 'Customer', 'Category', 'Effort', 'Source', 'Time Estimate', 'Description']
    // Add example row with * for new task
    const exampleRow = ['*', 'Example Task', projects[0]?.name || 'Project Name', 'todo', 'No', '', '', '', '', '', '', '', '30m', 'Task description here']
    
    const csvContent = [headers, exampleRow].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'trackli-template.csv'
    link.click()
  }
  
  // Import CSV
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)
  
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setImporting(true)
    setImportResult(null)
    
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        setImportResult({ error: 'CSV must have a header row and at least one data row' })
        setImporting(false)
        return
      }
      
      // Parse header
      const parseCSVLine = (line) => {
        const result = []
        let current = ''
        let inQuotes = false
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
      const idIndex = headers.indexOf('id')
      const titleIndex = headers.indexOf('title')
      const projectIndex = headers.indexOf('project')
      const statusIndex = headers.indexOf('status')
      const criticalIndex = headers.indexOf('critical')
      const dueDateIndex = headers.indexOf('due date')
      const startDateIndex = headers.indexOf('start date')
      const assigneeIndex = headers.indexOf('assignee')
      const customerIndex = headers.indexOf('customer')
      const categoryIndex = headers.indexOf('category')
      const effortIndex = headers.indexOf('effort')
      const sourceIndex = headers.indexOf('source')
      const timeEstimateIndex = headers.indexOf('time estimate')
      const descriptionIndex = headers.indexOf('description')
      
      if (titleIndex === -1) {
        setImportResult({ error: 'CSV must have a Title column' })
        setImporting(false)
        return
      }
      
      let created = 0
      let updated = 0
      let errors = []
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])
        if (values.length === 0 || values.every(v => !v)) continue // Skip empty rows
        
        const id = idIndex >= 0 ? values[idIndex] : ''
        const title = titleIndex >= 0 ? values[titleIndex] : ''
        
        if (!title) {
          errors.push(`Row ${i + 1}: Missing title`)
          continue
        }
        
        // Find project by name
        const projectName = projectIndex >= 0 ? values[projectIndex] : ''
        const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        
        // Find category by label
        const categoryLabel = categoryIndex >= 0 ? values[categoryIndex] : ''
        const category = CATEGORIES.find(c => c.label.toLowerCase() === categoryLabel.toLowerCase())
        
        // Find source by label
        const sourceLabel = sourceIndex >= 0 ? values[sourceIndex] : ''
        const source = SOURCES.find(s => s.label.toLowerCase() === sourceLabel.toLowerCase())
        
        // Parse status
        const statusRaw = statusIndex >= 0 ? values[statusIndex]?.toLowerCase() : 'todo'
        const statusMap = { 'backlog': 'backlog', 'to do': 'todo', 'todo': 'todo', 'in progress': 'in_progress', 'in_progress': 'in_progress', 'done': 'done' }
        const status = statusMap[statusRaw] || 'todo'
        
        // Parse critical
        const criticalRaw = criticalIndex >= 0 ? values[criticalIndex]?.toLowerCase() : ''
        const critical = criticalRaw === 'yes' || criticalRaw === 'true' || criticalRaw === '1'
        
        // Parse time estimate (remove 'm' suffix if present)
        const timeEstimateRaw = timeEstimateIndex >= 0 ? values[timeEstimateIndex] : ''
        const timeEstimate = timeEstimateRaw ? parseInt(timeEstimateRaw.replace(/m$/i, '')) || null : null
        // Parse date from various formats to YYYY-MM-DD
        const parseDate = (dateStr) => {
          if (!dateStr) return null
          // Already in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
          
          // Detect locale for date parsing
          const isUSLocale = isUSDateFormat()
          
          const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (match) {
            let day, month
            if (isUSLocale) {
              // US: MM/DD/YYYY
              month = match[1].padStart(2, '0')
              day = match[2].padStart(2, '0')
            } else {
              // UK/EU: DD/MM/YYYY
              day = match[1].padStart(2, '0')
              month = match[2].padStart(2, '0')
            }
            return `${match[3]}-${month}-${day}`
          }
          return null
        }
        
        // Build task data
        const taskData = {
          title,
          project_id: project?.id || null,
          status,
          critical,
          due_date: parseDate(dueDateIndex >= 0 ? values[dueDateIndex] : null),
          start_date: parseDate(startDateIndex >= 0 ? values[startDateIndex] : null),
          assignee: assigneeIndex >= 0 ? values[assigneeIndex] || null : null,
          customer: customerIndex >= 0 ? values[customerIndex] || null : null,
          category: category?.id || null,
          energy_level: effortIndex >= 0 && values[effortIndex] ? values[effortIndex].toLowerCase() : null,
          source: source?.id || null,
          time_estimate: timeEstimate,
          description: descriptionIndex >= 0 ? values[descriptionIndex] || null : null,
        }
        
        try {
          if (!id || id === '*') {
            // Create new task
            const { error } = await supabase.from('tasks').insert(taskData)
            if (error) throw error
            created++
          } else {
            // Update existing task
            const { error } = await supabase.from('tasks').update(taskData).eq('id', id)
            if (error) throw error
            updated++
          }
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err.message}`)
        }
      }
      
      setImportResult({ created, updated, errors })
      
      // Refresh tasks
      if (created > 0 || updated > 0) {
        const { data } = await supabase.from('tasks').select('*, dependencies:task_dependencies!task_dependencies_task_id_fkey(depends_on_id)').eq('user_id', user.id).order('created_at', { ascending: false })
        if (data) {
          // This will trigger a re-render - we need to call the parent's refresh
          window.location.reload() // Simple approach - reload to refresh all data
        }
      }
    } catch (err) {
      setImportResult({ error: `Failed to parse CSV: ${err.message}` })
    }
    
    setImporting(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  
  // Column definitions
  const columns = [
    { key: 'title', label: 'Title', width: 'min-w-[200px]' },
    { key: 'project', label: 'Project', width: 'min-w-[120px]' },
    { key: 'status', label: 'Status', width: 'min-w-[100px]' },
    { key: 'critical', label: 'Critical', width: 'min-w-[80px]' },
    { key: 'due_date', label: 'Due Date', width: 'min-w-[100px]' },
    { key: 'start_date', label: 'Start Date', width: 'min-w-[100px]' },
    { key: 'assignee', label: 'Assignee', width: 'min-w-[120px]' },
    { key: 'customer', label: 'Customer', width: 'min-w-[120px]' },
    { key: 'category', label: 'Category', width: 'min-w-[120px]' },
    { key: 'energy_level', label: 'Effort', width: 'min-w-[100px]' },
    { key: 'source', label: 'Source', width: 'min-w-[100px]' },
    { key: 'time_estimate', label: 'Est. Time', width: 'min-w-[90px]' },
    { key: 'created_at', label: 'Created', width: 'min-w-[100px]' },
  ]
  
  const getCellValue = (task, key) => {
    switch (key) {
      case 'project':
        return projects.find(p => p.id === task.project_id)?.name || '-'
      case 'status':
        return { backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[task.status] || task.status
      case 'critical':
        return task.critical ? '🚨 Yes' : '-'
      case 'due_date':
      case 'start_date':
        return task[key] ? formatDate(task[key]) : '-'
      case 'category':
        return CATEGORIES.find(c => c.id === task.category)?.label || '-'
      case 'energy_level':
        return { high: '▰▰▰ High', medium: '▰▰ Medium', low: '▰ Low' }[task.energy_level] || '-'
      case 'source':
        const src = SOURCES.find(s => s.id === task.source)
        return src ? `${src.icon} ${src.label}` : '-'
      case 'time_estimate':
        return task.time_estimate ? formatTimeEstimate(task.time_estimate) : '-'
      case 'created_at':
        return task.created_at ? new Date(task.created_at).toLocaleDateString() : '-'
      default:
        return task[key] || '-'
    }
  }
  
  const getStatusColor = (status) => {
    const colors = {
      backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      in_progress: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
      done: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">All Tasks</h2>
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            {sortedTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showFilters || Object.values(columnFilters).some(v => v)
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="hidden sm:inline">Filters</span>
            {Object.values(columnFilters).some(v => v) && (
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            )}
          </button>
          
          {/* Clear filters - show when active */}
          {Object.values(columnFilters).some(v => v) && (
            <button
              onClick={() => setColumnFilters({})}
              className="px-2 py-1.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
          
          {/* Divider - desktop only */}
          <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700" />
          
          {/* Export button */}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900/70 rounded-lg text-sm font-medium transition-colors"
            title="Export CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          
          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Import CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import'}</span>
          </button>
          
          {/* Template button - desktop only */}
          <button
            onClick={downloadTemplate}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            title="Download CSV template"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Template
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
        </div>
      </div>
      
      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setImportResult(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
              {importResult.error ? 'Import Error' : 'Import Complete'}
            </h3>
            {importResult.error ? (
              <p className="text-red-600 dark:text-red-400">{importResult.error}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-green-600">{importResult.created}</span> tasks created
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-blue-600">{importResult.updated}</span> tasks updated
                </p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">Errors:</p>
                    <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>...and {importResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setImportResult(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`${col.width} px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700`}
                >
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {col.label}
                    {sortField === col.key && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="bg-gray-100 dark:bg-gray-800/50">
                {columns.map(col => (
                  <th key={`filter-${col.key}`} className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                    {['title', 'time_estimate', 'created_at'].includes(col.key) ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <select
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">All</option>
                        <option value="__blank__">(Blank)</option>
                        {col.key === 'status' && (
                          <>
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </>
                        )}
                        {col.key === 'critical' && (
                          <>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </>
                        )}
                        {col.key === 'energy_level' && (
                          <>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </>
                        )}
                        {['project', 'assignee', 'customer', 'category', 'source'].includes(col.key) && 
                          getUniqueValues(col.key).map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))
                        }
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center mb-4">
                      <span className="text-2xl">🔍</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">No tasks found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your filters or search terms</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedTasks.map(task => {
                const taskProject = projects.find(p => p.id === task.project_id)
                const isArchived = taskProject?.archived
                return (
                <tr
                  key={task.id}
                  onClick={() => onEditTask(task)}
                  className={`cursor-pointer transition-colors ${isArchived ? 'bg-gray-100 dark:bg-gray-800/50 opacity-60' : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                >
                  {columns.map(col => (
                    <td key={`${task.id}-${col.key}`} className="px-4 py-3 text-sm">
                      {col.key === 'title' ? (
                        <div className="flex items-center gap-2">
                          {task.critical && <span className="text-red-500">🚨</span>}
                          {isArchived && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300">Archived</span>}
                          <span className={`font-medium truncate max-w-[250px] ${isArchived ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{task.title}</span>
                        </div>
                      ) : col.key === 'status' ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                          {getCellValue(task, col.key)}
                        </span>
                      ) : col.key === 'critical' ? (
                        <span className={task.critical ? 'text-red-500 font-medium' : 'text-gray-400'}>
                          {getCellValue(task, col.key)}
                        </span>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-400">
                          {getCellValue(task, col.key)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Critical Toggle Component
const CriticalToggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
      checked 
        ? 'bg-red-50 border-red-300 text-red-700' 
        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
    }`}
  >
    <svg 
      className={`w-5 h-5 ${checked ? 'text-red-500' : 'text-gray-400'}`} 
      fill={checked ? 'currentColor' : 'none'} 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
    <span className="font-medium">{checked ? 'Critical' : 'Mark as Critical'}</span>
  </button>
)

// Task Card Component
const TaskCard = ({ task, project, onEdit, onDragStart, showProject = true, allTasks = [], onQuickComplete, bulkSelectMode, isSelected, onToggleSelect, onStatusChange, onSetDueDate, onToggleMyDay, isDragging, onUpdateTitle, onToggleCritical }) => {
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(task.title)
  const titleInputRef = useRef(null)
  const isDraggingRef = useRef(false)
  
  const handleCardDragStart = (e) => {
    isDraggingRef.current = true
    onDragStart(e, task)
  }
  
  const handleCardDragEnd = () => {
    setTimeout(() => { isDraggingRef.current = false }, 100)
  }
  
  const handleCardClick = () => {
    if (!isDraggingRef.current) {
      bulkSelectMode ? onToggleSelect?.(task.id) : onEdit(task)
    }
  }
  
  // Inline title editing handlers
  const handleTitleDoubleClick = (e) => {
    if (bulkSelectMode || !onUpdateTitle) return
    e.stopPropagation()
    setIsEditingTitle(true)
    setEditedTitle(task.title)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }
  
  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      onUpdateTitle(task.id, editedTitle.trim())
    }
    setIsEditingTitle(false)
  }
  
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      setEditedTitle(task.title)
      setIsEditingTitle(false)
    }
  }
  
  const dueDateStatus = getDueDateStatus(task.due_date, task.status)
  const blocked = isBlocked(task, allTasks)
  const recurrence = task.recurrence_type ? RECURRENCE_TYPES.find(r => r.id === task.recurrence_type) : null
  const isDone = task.status === 'done'
  const isInProgress = task.status === 'in_progress'
  const readyToStart = isReadyToStart(task)
  const category = CATEGORIES.find(c => c.id === task.category)
  const energyStyle = ENERGY_LEVELS[task.energy_level]
  const inMyDay = isInMyDay(task)
  
  // Due date urgency takes visual priority (only for non-done tasks)
  const isOverdue = !isDone && dueDateStatus === 'overdue'
  const isDueToday = !isDone && dueDateStatus === 'today'
  
  const accentColor = isOverdue ? '#DC2626' : isDueToday ? '#D97706' : blocked ? '#F97316' : task.critical ? '#EF4444' : readyToStart ? '#10B981' : COLUMN_COLORS[task.status]
  
  const hasExtraInfo = task.description || task.assignee || category || 
    (task.subtasks?.length > 0) || (task.attachments?.length > 0)

  return (
    <div
      draggable
      onDragStart={handleCardDragStart}
      onDragEnd={handleCardDragEnd}
      onClick={handleCardClick}
      className={`task-card relative rounded-lg p-2 sm:p-2.5 shadow-sm border cursor-pointer transition-all duration-200 group hover:z-[100] ${
        isDragging ? 'opacity-30 scale-95 ring-2 ring-dashed ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'hover:-translate-y-1 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50'
      } ${
        !isDragging && isDone ? 'opacity-60 bg-white dark:bg-gray-800' : 
        !isDragging && isOverdue ? 'bg-red-50 dark:bg-red-900/40' :
        !isDragging && isDueToday ? 'bg-amber-50 dark:bg-amber-900/40' :
        !isDragging ? 'bg-white dark:bg-gray-800' : ''
      } ${
        isSelected ? 'ring-2 ring-indigo-500 border-indigo-300' :
        isOverdue ? 'border-red-300 dark:border-red-500 hover:border-red-400 dark:hover:border-red-400' :
        isDueToday ? 'border-amber-300 dark:border-amber-500 hover:border-amber-400 dark:hover:border-amber-400' :
        blocked ? 'border-orange-200 dark:border-orange-800 hover:border-orange-300' :
        task.critical ? 'border-red-200 dark:border-red-800 hover:border-red-300' :
        readyToStart ? 'border-green-200 dark:border-green-800 hover:border-green-300' :
        'border-gray-100 dark:border-gray-700 hover:border-gray-200'
      }`}
      style={{ borderLeftWidth: '2px', borderLeftColor: accentColor }}
    >
      {/* Hover Popup Bubble - Hidden on mobile */}
      {hasExtraInfo && (
        <div className={`hidden md:block absolute top-0 z-[200] w-56 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none ${
          task.status === 'done' ? 'right-full mr-2' : 'left-full ml-2'
        }`}>
          {/* Category */}
          {category && (
            <div className="mb-2">
              <span className="px-2 py-0.5 text-xs font-medium rounded text-white" style={{ backgroundColor: category.color }}>{category.label}</span>
            </div>
          )}
          {/* Customer */}
          {task.customer && <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">{task.customer}</p>}
          {/* Effort Level */}
          {energyStyle && (
            <div className="flex items-center gap-2 mb-2">
              <span 
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{ backgroundColor: energyStyle.bg, color: energyStyle.text }}
              >
                {energyStyle.icon} {energyStyle.label}
              </span>
            </div>
          )}
          {/* Description */}
          {task.description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-3">{task.description}</p>}
          {/* Assignee with icon */}
          {task.assignee && (
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-medium flex items-center justify-center flex-shrink-0">{task.assignee.charAt(0).toUpperCase()}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{task.assignee}</span>
            </div>
          )}
          {/* Blocking Tasks */}
          {task.dependencies?.length > 0 && (() => {
            const blockingTasks = task.dependencies
              .map(dep => allTasks.find(t => t.id === dep.depends_on_id))
              .filter(t => t && t.status !== 'done')
            if (blockingTasks.length === 0) return null
            return (
              <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">🚫 Blocked by:</p>
                {blockingTasks.map(t => (
                  <p key={t.id} className="text-xs text-red-500 dark:text-red-400 truncate">• {t.title}</p>
                ))}
              </div>
            )
          })()}
          {/* Subtasks Progress */}
          {task.subtasks?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtasks</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500">{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
              </div>
            </div>
          )}
          {/* Attachments */}
          {task.attachments?.length > 0 && <div className="text-xs text-gray-500">📎 {task.attachments.length} attachment{task.attachments.length > 1 ? 's' : ''}</div>}
        </div>
      )}
      
      {/* Card Content */}
      <div className="flex flex-col">
        {/* Bulk select checkbox */}
        {bulkSelectMode && (
          <div className="absolute top-1 left-1 z-10">
            <button onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id) }}
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800'}`}>
              {isSelected && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-1">
            {/* My Day sun at start of title */}
            {inMyDay && !isDone && (
              <span className="text-xs flex-shrink-0" title="In My Day">☀️</span>
            )}
            {isOverdue && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-red-100 dark:bg-red-500/80 text-red-700 dark:text-white flex-shrink-0">OVERDUE</span>}
            {isDueToday && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-100 dark:bg-amber-500/80 text-amber-700 dark:text-white flex-shrink-0">TODAY</span>}
            {blocked && <span title="Blocked" className="text-xs flex-shrink-0">🔒</span>}
            {task.critical && <span title="Critical" className="text-xs flex-shrink-0">🚩</span>}
            {recurrence && <span title={recurrence.label} className="text-xs flex-shrink-0">🔁</span>}
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-xs font-medium bg-white dark:bg-gray-700 border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-200"
              />
            ) : (
              <h4 
                onClick={(e) => onUpdateTitle && e.stopPropagation()}
                onDoubleClick={handleTitleDoubleClick}
                className={`flex-1 text-xs font-medium line-clamp-2 leading-tight ${
                  isOverdue ? 'text-red-700 dark:text-red-200 group-hover:text-red-800 dark:group-hover:text-red-100' :
                  isDueToday ? 'text-amber-700 dark:text-amber-200 group-hover:text-amber-800 dark:group-hover:text-amber-100' :
                  'text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                } ${onUpdateTitle ? 'cursor-text' : ''}`}
                title={onUpdateTitle ? 'Double-click to edit' : ''}
              >{task.title}</h4>
            )}
          </div>
          
          {/* Dates & Effort Row */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[10px] text-gray-600 dark:text-gray-400">
            {task.start_date && (
              <span className={`flex items-center gap-0.5 ${readyToStart ? 'text-green-600 dark:text-green-400' : ''}`}>
                <span>▶</span> {formatDate(task.start_date)}
              </span>
            )}
            {task.due_date && (
                          <span className={`flex items-center gap-0.5 font-medium ${
                dueDateStatus === 'overdue' ? 'text-red-600 dark:text-red-400' : 
                dueDateStatus === 'today' ? 'text-orange-600 dark:text-orange-400' : 
                dueDateStatus === 'soon' ? 'text-amber-600 dark:text-amber-400' : ''
              }`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {formatDate(task.due_date)}
              </span>
            )}
            {task.time_estimate && (
              <span className="flex items-center gap-0.5">
                <span>⏱</span> {formatTimeEstimate(task.time_estimate)}
              </span>
            )}
            {energyStyle && (
              <span 
                className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-medium rounded-full"
                style={{ backgroundColor: energyStyle.bg, color: energyStyle.text }}
                title={energyStyle.label}
              >
                {energyStyle.icon} {energyStyle.label}
              </span>
            )}
          </div>
          
          {/* Customer - hidden on mobile */}
          {task.customer && (
            <div className="hidden sm:block mt-1.5">
              <span 
                className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full"
                style={{
                  backgroundColor: getCustomerColor(task.customer)?.bg || '#EDE9FE',
                  color: getCustomerColor(task.customer)?.text || '#7C3AED',
                  border: `1px solid ${getCustomerColor(task.customer)?.border || '#C4B5FD'}`
                }}
              >
                {task.customer}
              </span>
            </div>
          )}
          
          {/* Project at bottom - hidden on mobile */}
          {showProject && project && (
            <div className="hidden sm:block mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{project.name}</span>
            </div>
          )}
          
          {/* Mobile Quick Status Buttons */}
          {onQuickComplete && (
            <div className="sm:hidden flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              {task.status === 'backlog' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'todo') }}
                  className="flex-1 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-100 transition-colors"
                >
                  → To Do
                </button>
              )}
              {task.status === 'todo' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'in_progress') }}
                  className="flex-1 py-1 text-[10px] font-medium text-pink-600 bg-pink-50 dark:bg-pink-900/30 dark:text-pink-400 rounded hover:bg-pink-100 transition-colors"
                >
                  ▶ Start
                </button>
              )}
              {(task.status === 'backlog' || task.status === 'todo' || task.status === 'in_progress') && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'done') }}
                  className="flex-1 py-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded hover:bg-emerald-100 transition-colors"
                >
                  ✓ Done
                </button>
              )}
              {task.status === 'done' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'todo') }}
                  className="flex-1 py-1 text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 rounded hover:bg-amber-100 transition-colors"
                >
                  ↩ Reopen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Quick Actions - floating bubble in top-right corner on hover (desktop only) */}
      {!isDragging && (
      <div className="hidden md:flex absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 z-10">
        <div className="flex items-center gap-0.5 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
          {/* Start button - show if not in progress and not done */}
          {!isInProgress && !isDone && onQuickComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'in_progress') }}
              className="p-1.5 text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded transition-colors"
              title="Start working"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
          
          {/* Done button */}
          {onQuickComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, isDone ? 'todo' : 'done') }}
              className={`p-1.5 rounded transition-colors ${
                isDone 
                  ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' 
                  : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
              }`}
              title={isDone ? 'Reopen task' : 'Mark done'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          
          {/* Toggle Critical */}
          {onToggleCritical && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCritical(task.id, !task.critical) }}
              className={`p-1.5 rounded transition-colors ${
                task.critical 
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/30' 
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
              }`}
              title={task.critical ? 'Remove critical flag' : 'Mark as critical'}
            >
              <svg className="w-3.5 h-3.5" fill={task.critical ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </button>
          )}
          
          {/* Add to My Day - only show if not already in My Day and not done */}
          {onToggleMyDay && !inMyDay && !isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleMyDay(task.id, true) }}
              className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
              title="Add to My Day"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

// Recently Completed Component - Shows last 5 completed tasks
const RecentlyCompleted = ({ tasks, projects, onEditTask, onUndoComplete }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (tasks.length === 0) return null
  
  const formatTimeAgo = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }
  
  return (
    <div className="mt-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-gray-700 dark:text-gray-200">Recently Completed</span>
          <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {tasks.map(task => {
            const project = projects.find(p => p.id === task.project_id)
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 group hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
              >
                <button
                  onClick={() => onUndoComplete(task.id)}
                  className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 hover:bg-amber-500 transition-colors"
                  title="Mark as incomplete"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onEditTask(task)}
                >
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-through truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {project && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{project.name}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{formatTimeAgo(task.completed_at)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Column Component
const Column = ({ column, tasks, projects, onEditTask, onDragStart, onDragOver, onDrop, showProject, allTasks, onQuickComplete, onStatusChange, onSetDueDate, bulkSelectMode, selectedTaskIds, onToggleSelect, onAddTask, onToggleMyDay, isMobileFullWidth, draggedTask, onUpdateTitle, onToggleCritical }) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  const [showAllBacklog, setShowAllBacklog] = useState(false)
  
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  const criticalCount = tasks.filter(t => t.critical).length
  const readyCount = tasks.filter(t => isReadyToStart(t)).length
  
  const isDoneColumn = column.id === 'done'
  const isBacklogColumn = column.id === 'backlog'
  
  // Calculate display tasks based on column type and limits
  let displayTasks = tasks
  let hiddenCount = 0
  
  if (isDoneColumn && !showAllDone) {
    displayTasks = tasks.slice(0, DONE_DISPLAY_LIMIT)
    hiddenCount = Math.max(0, tasks.length - DONE_DISPLAY_LIMIT)
  } else if (isBacklogColumn && !showAllBacklog) {
    displayTasks = tasks.slice(0, BACKLOG_DISPLAY_LIMIT)
    hiddenCount = Math.max(0, tasks.length - BACKLOG_DISPLAY_LIMIT)
  }
  
  return (
    <div
      className={`${isMobileFullWidth ? 'w-full' : 'flex-shrink-0 w-[280px] sm:w-[300px] lg:flex-1 lg:min-w-[300px] lg:max-w-[400px] xl:max-w-[450px]'} bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl p-3 sm:p-4 transition-all duration-200 overflow-visible ${
        isDragOver ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-900 bg-indigo-50/50 dark:bg-indigo-900/20 scale-[1.01]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
        onDragOver(e, column.id)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false)
        onDrop(e, column.id)
      }}
    >
      <div className={`${isMobileFullWidth ? 'hidden' : 'flex'} items-center gap-3 mb-2`}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">{column.title}</h3>
        <span className="ml-auto bg-white dark:bg-gray-700 px-2.5 py-0.5 rounded-full text-sm font-medium text-gray-500 dark:text-gray-300 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className={`${isMobileFullWidth ? 'hidden' : 'flex'} items-center gap-2 mb-4 ml-6 text-xs text-gray-500 dark:text-gray-400`}>
        {totalMinutes > 0 && <span>{formatTimeEstimate(totalMinutes)}</span>}
        {column.id !== 'done' && criticalCount > 0 && <span className="text-red-500">{criticalCount} critical</span>}
        {column.id === 'backlog' && readyCount > 0 && <span className="text-green-600 dark:text-green-400">{readyCount} ready</span>}
      </div>
      
      <div className="space-y-2 overflow-visible">
        {displayTasks.length === 0 && !isDragOver && (
          <div className="py-6 sm:py-8 text-center">
            <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3 sm:mb-2 opacity-60">
              <span className="text-xl sm:text-lg">{column.id === 'done' ? '✅' : column.id === 'in_progress' ? '💭' : column.id === 'todo' ? '📋' : '📦'}</span>
            </div>
            <p className="text-sm sm:text-xs text-gray-400 dark:text-gray-500 px-4">
              {column.id === 'done' ? 'Completed tasks appear here' : column.id === 'in_progress' ? 'Tasks you\'re working on' : column.id === 'todo' ? 'Ready to start' : 'Future tasks'}
            </p>
          </div>
        )}
        {displayTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            project={projects.find((p) => p.id === task.project_id)}
            onEdit={onEditTask}
            onDragStart={onDragStart}
            showProject={showProject}
            allTasks={allTasks}
            onQuickComplete={onQuickComplete}
            onStatusChange={onStatusChange}
            onSetDueDate={onSetDueDate}
            bulkSelectMode={bulkSelectMode}
            isSelected={selectedTaskIds?.has(task.id)}
            onToggleSelect={onToggleSelect}
            onToggleMyDay={onToggleMyDay}
            isDragging={draggedTask?.id === task.id}
            onUpdateTitle={onUpdateTitle}
            onToggleCritical={onToggleCritical}
          />
        ))}
        
        {isDoneColumn && hiddenCount > 0 && !showAllDone && (
          <button
            onClick={() => setShowAllDone(true)}
            className="w-full py-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium bg-white rounded-xl border border-gray-200 hover:border-indigo-300 transition-all"
          >
            View all {tasks.length} completed tasks →
          </button>
        )}
        
        {isDoneColumn && showAllDone && tasks.length > DONE_DISPLAY_LIMIT && (
          <button
            onClick={() => setShowAllDone(false)}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 font-medium bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-all"
          >
            Show less ↑
          </button>
        )}
        
        {isBacklogColumn && hiddenCount > 0 && !showAllBacklog && (
          <button
            onClick={() => setShowAllBacklog(true)}
            className="w-full py-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-indigo-300 transition-all"
          >
            View all {tasks.length} backlog tasks →
          </button>
        )}
        
        {isBacklogColumn && showAllBacklog && tasks.length > BACKLOG_DISPLAY_LIMIT && (
          <button
            onClick={() => setShowAllBacklog(false)}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 font-medium bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-gray-300 transition-all"
          >
            Show less ↑
          </button>
        )}
        
        {/* Drop Zone Placeholder */}
        {draggedTask && draggedTask.status !== column.id && isDragOver && (
          <div className="w-full py-4 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 animate-dropZone flex items-center justify-center gap-2 text-indigo-500 dark:text-indigo-400 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Drop here
          </div>
        )}
        
        {/* Add Task Button */}
        <button
          onClick={() => onAddTask(column.id)}
          className="w-full mt-3 py-3 sm:py-2.5 text-sm text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
        >
          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add task
        </button>
      </div>
    </div>
  )
}

// Task Modal Component
const TaskModal = ({ isOpen, onClose, task, projects, allTasks, onSave, onDelete, loading, templates = [], onSaveTemplate, onDeleteTemplate, onShowConfirm }) => {
  const fileInputRef = useRef(null)
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'backlog',
    critical: false,
    start_date: '',
    start_time: '',
    end_time: '',
    due_date: '',
    assignee: '',
    time_estimate: '',
    energy_level: 'medium',
    category: 'deliverable',
    source: 'ad_hoc',
    source_link: '',
    customer: '',
    notes: '',
    recurrence_type: null,
    recurrence_count: 8,
    recurrence_end_date: '',
  })
  const [selectedDependencies, setSelectedDependencies] = useState([])
  const [attachments, setAttachments] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [activeTab, setActiveTab] = useState('details')
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [useCustomAssignee, setUseCustomAssignee] = useState(false)
  const [customAssignee, setCustomAssignee] = useState('')
  const [useCustomCustomer, setUseCustomCustomer] = useState(false)
  const [customCustomer, setCustomCustomer] = useState('')
  const [pasteMessage, setPasteMessage] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [comments, setComments] = useState([])
  const [newCommentText, setNewCommentText] = useState('')
  const initializedRef = useRef(null) // Track which task we've initialized for
  const [viewingAttachment, setViewingAttachment] = useState(null)
  
  // Keyboard handler for delete confirmation and save shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showDeleteConfirm) {
        if (e.key === 'Escape') setShowDeleteConfirm(false)
        if (e.key === 'Enter') {
          onDelete(task.id)
          setShowDeleteConfirm(false)
          onClose()
        }
      }
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !showDeleteConfirm) {
        e.preventDefault()
        document.querySelector('form')?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showDeleteConfirm, task, onDelete, onClose])
  
  // Apply a template to the form
  const applyTemplate = (template) => {
    if (!template) return
    setFormData(prev => ({
      ...prev,
      title: template.title || '',
      description: template.description || '',
      project_id: template.project_id || prev.project_id,
      category: template.category || 'deliverable',
      energy_level: template.energy_level || 'medium',
      time_estimate: template.time_estimate || '',
      source: template.source || 'ad_hoc',
      assignee: template.assignee || '',
      customer: template.customer || '',
      critical: template.critical || false,
      recurrence_type: template.recurrence_type || null,
      recurrence_count: template.recurrence_count || 8,
    }))
    setSubtasks(template.subtasks || [])
    if (template.assignee) {
      const allAssignees = projects.flatMap(p => p.team_members || [])
      if (!allAssignees.includes(template.assignee)) {
        setUseCustomAssignee(true)
        setCustomAssignee(template.assignee)
      }
    }
    if (template.customer) {
      setUseCustomCustomer(true)
      setCustomCustomer(template.customer)
    }
  }
  
  // Save current form as template
  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) return
    onSaveTemplate({
      name: templateName.trim(),
      title: formData.title,
      description: formData.description,
      project_id: formData.project_id,
      category: formData.category,
      energy_level: formData.energy_level,
      time_estimate: formData.time_estimate,
      source: formData.source,
      assignee: useCustomAssignee ? customAssignee : formData.assignee,
      customer: useCustomCustomer ? customCustomer : formData.customer,
      critical: formData.critical,
      recurrence_type: formData.recurrence_type,
      recurrence_count: formData.recurrence_count,
      subtasks: subtasks,
    })
    setShowSaveTemplateInput(false)
    setTemplateName('')
  }
  
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const extension = file.type.split('/')[1] || 'png'
          const namedFile = new File([file], `pasted-image-${timestamp}.${extension}`, { type: file.type })
          
          if (namedFile.size > 10 * 1024 * 1024) {
            setUploadError('Pasted image is too large. Max size is 10MB.')
            return
          }
          
          setNewFiles(prev => [...prev, namedFile])
          setPasteMessage('📎 Image captured!')
          setTimeout(() => setPasteMessage(''), 2000)
        }
        break
      }
    }
  }
  
  useEffect(() => {
    // Only initialize if modal just opened or we're editing a different task
    // Include prefill data in key to ensure re-initialization when coming from Quick Add
    const taskKey = task?.id ? `edit-${task.id}` : (isOpen ? `new-${task?.title || ''}-${task?.project_id || ''}` : null)
    if (!isOpen || initializedRef.current === taskKey) return
    initializedRef.current = taskKey
    
    if (task?.id) {
      const project = projects.find((p) => p.id === task.project_id)
      const isCustomAssignee = project && !project.members?.includes(task.assignee) && task.assignee
      const isCustomCustomer = project && !project.customers?.includes(task.customer) && task.customer
      
      setFormData({
        title: task.title || '',
        description: task.description || '',
        project_id: task.project_id || '',
        status: task.status || 'backlog',
        critical: task.critical || false,
        start_date: task.start_date || '',
        start_time: task.start_time || '',
        end_time: task.end_time || '',
        due_date: task.due_date || '',
        assignee: isCustomAssignee ? '' : (task.assignee || ''),
        time_estimate: task.time_estimate || '',
        energy_level: task.energy_level || 'medium',
        category: task.category || 'deliverable',
        source: task.source || 'ad_hoc',
        source_link: task.source_link || '',
        customer: isCustomCustomer ? '' : (task.customer || ''),
        notes: task.notes || '',
        recurrence_type: task.recurrence_type || null,
        recurrence_count: task.recurrence_count || 8,
        recurrence_end_date: task.recurrence_end_date || '',
      })
      setAttachments(task.attachments || [])
      setSelectedDependencies(task.dependencies?.map(d => d.depends_on_id) || [])
      setUseCustomAssignee(isCustomAssignee)
      setCustomAssignee(isCustomAssignee ? task.assignee : '')
      setUseCustomCustomer(isCustomCustomer)
      setCustomCustomer(isCustomCustomer ? task.customer : '')
      setSubtasks(task.subtasks || [])
      setComments(task.comments || [])
    } else {
      // New task - may have prefilled status
      setFormData({
        title: task?.title || '',
        description: '',
        project_id: task?.project_id || projects[0]?.id || '',
        status: task?.status || 'backlog',
        critical: false,
        start_date: '',
        start_time: '',
        end_time: '',
        due_date: task?.due_date || '',
        assignee: '',
        time_estimate: '',
        energy_level: 'medium',
        category: 'deliverable',
        source: 'ad_hoc',
        source_link: '',
        customer: '',
        notes: '',
        recurrence_type: null,
        recurrence_count: 8,
        recurrence_end_date: '',
      })
      setAttachments([])
      setSelectedDependencies([])
      setUseCustomAssignee(false)
      setCustomAssignee('')
      setUseCustomCustomer(false)
      setCustomCustomer('')
      setSubtasks([])
      setComments([])
    }
    setNewFiles([])
    setActiveTab('details')
    setUploadError('')
    setNewSubtaskTitle('')
    setNewCommentText('')
  }, [task?.id, task?.title, task?.project_id, isOpen])
  
  // Reset initialization tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = null
    }
  }, [isOpen])
  
  const selectedProject = projects.find((p) => p.id === formData.project_id)
  
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    
    setUploadError('')
    const validFiles = []
    
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`File "${file.name}" is too large. Max size is 10MB.`)
        continue
      }
      validFiles.push(file)
    }
    
    setNewFiles([...newFiles, ...validFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  
  const removeNewFile = (index) => {
    setNewFiles(newFiles.filter((_, i) => i !== index))
  }
  
  const removeExistingAttachment = (attachmentId) => {
    setAttachments(attachments.filter((a) => a.id !== attachmentId))
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    const finalAssignee = useCustomAssignee ? customAssignee : formData.assignee
    const finalCustomer = useCustomCustomer ? customCustomer : formData.customer
    
    await onSave({
      ...formData,
      assignee: finalAssignee,
      customer: finalCustomer,
      time_estimate: formData.time_estimate ? parseInt(formData.time_estimate) : null,
      id: task?.id,
      dependencies: selectedDependencies,
      subtasks: subtasks,
      comments: comments,
    }, newFiles, attachments)
    onClose()
  }
  
  const availableDependencies = allTasks?.filter(t => 
    t.project_id === formData.project_id && 
    t.id !== task?.id && 
    t.status !== 'done'
  ) || []
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task?.id ? 'Edit Task' : 'New Task'} wide fullScreenMobile>
      <form onSubmit={handleSubmit}>
        {/* Template selector for new tasks */}
        {!task?.id && templates.length > 0 && (
          <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">📋 Use template:</span>
              <select
                onChange={(e) => {
                  const template = templates.find(t => t.id === parseInt(e.target.value))
                  if (template) applyTemplate(template)
                  e.target.value = ''
                }}
                className="flex-1 min-w-[150px] px-3 py-1.5 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                value=""
              >
                <option value="">Select a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {onDeleteTemplate && (
                <div className="relative group">
                  <button
                    type="button"
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Manage templates"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 hidden group-hover:block">
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">Delete template</div>
                    {templates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onDeleteTemplate(t.id)}
                        className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto min-h-[44px]">
          {[
            { id: 'details', label: 'Details' },
            { id: 'additional', label: 'More' },
            { id: 'subtasks', label: 'Subtasks' },
            { id: 'dependencies', label: 'Deps', labelFull: 'Dependencies' },
            { id: 'activity', label: 'Activity' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.labelFull ? (
                <>
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">{tab.labelFull}</span>
                </>
              ) : tab.label}
            </button>
          ))}
        </div>
        
        {activeTab === 'details' && (
          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.title ? 'border-l-4 border-l-red-400 dark:border-l-red-500' : ''}`}
                placeholder="What needs to be done?"
              />
            </div>
            
            {/* Description - moved up */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onPaste={handlePaste}
                rows={2}
                className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.description ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                placeholder="Add more context... (paste images here!)"
              />
              {pasteMessage && activeTab === 'details' && (
                <p className="text-sm text-green-600 mt-1">{pasteMessage}</p>
              )}
            </div>
            
            {/* Project & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project *</label>
                <select
                  required
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value, assignee: '', customer: '' })}
                  className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.project_id ? 'border-l-4 border-l-red-400 dark:border-l-red-500' : ''}`}
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Customer & Energy Level - side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer/Client</label>
                {!useCustomCustomer ? (
                  <select
                    value={formData.customer}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setUseCustomCustomer(true)
                        setFormData({ ...formData, customer: '' })
                      } else {
                        setFormData({ ...formData, customer: e.target.value })
                      }
                    }}
                    className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.customer ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                  >
                    <option value="">No customer</option>
                    {selectedProject?.customers?.map((cust) => (
                      <option key={cust} value={cust}>{cust}</option>
                    ))}
                    <option value="__other__">Other (enter name)</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customCustomer}
                      onChange={(e) => setCustomCustomer(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Customer name"
                    />
                    <button
                      type="button"
                      onClick={() => { setUseCustomCustomer(false); setCustomCustomer('') }}
                      className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Effort Level</label>
                <select
                  value={formData.energy_level}
                  onChange={(e) => setFormData({ ...formData, energy_level: e.target.value })}
                  className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.energy_level ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                >
                  {Object.entries(ENERGY_LEVELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Start Date & Due Date side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                  <span className="ml-2 text-xs text-gray-400 font-normal">T, T+1, W+1, M+1</span>
                </label>
                <input
                  type="text"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  onBlur={(e) => {
                    const val = e.target.value.trim()
                    if (!val) {
                      setFormData({ ...formData, start_date: '' })
                      return
                    }
                    // Try shorthand parsing first
                    const parsed = parseNaturalLanguageDate(val)
                    if (parsed.date) {
                      setFormData({ ...formData, start_date: parsed.date })
                    }
                    // Otherwise keep as-is (might be a valid date already)
                  }}
                  placeholder="T, T+1, W+1, or date"
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm ${!formData.start_date ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Due Date
                  <span className="ml-2 text-xs text-gray-400 font-normal">T, T+1, W+1, M+1</span>
                </label>
                <input
                  type="text"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  onBlur={(e) => {
                    const val = e.target.value.trim()
                    if (!val) {
                      setFormData({ ...formData, due_date: '' })
                      return
                    }
                    // Try shorthand parsing first
                    const parsed = parseNaturalLanguageDate(val)
                    if (parsed.date) {
                      setFormData({ ...formData, due_date: parsed.date })
                    }
                    // Otherwise keep as-is (might be a valid date already)
                  }}
                  placeholder="T, T+1, W+1, or date"
                  className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm ${!formData.due_date ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                />
              </div>
            </div>
            
            {/* Start Time & End Time side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                <input
                  type="text"
                  value={formData.start_time || ''}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  onBlur={(e) => {
                    const parsed = parseFlexibleTime(e.target.value)
                    if (parsed || !e.target.value) {
                      const updates = { start_time: parsed }
                      
                      // If there's a time_estimate, recalculate end_time
                      if (parsed && formData.time_estimate) {
                        const [hours, mins] = parsed.split(':').map(Number)
                        const startMinutes = hours * 60 + mins
                        const endMinutes = startMinutes + parseInt(formData.time_estimate)
                        const endHours = Math.floor(endMinutes / 60)
                        const endMins = endMinutes % 60
                        updates.end_time = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
                      }
                      
                      setFormData({ ...formData, ...updates })
                    }
                  }}
                  placeholder="e.g. 9am, 230pm, 14:30"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                <input
                  type="text"
                  value={formData.end_time || ''}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  onBlur={(e) => {
                    const parsed = parseFlexibleTime(e.target.value)
                    if (parsed || !e.target.value) {
                      const updates = { end_time: parsed }
                      
                      // If there's a start_time, recalculate time_estimate
                      if (formData.start_time && parsed) {
                        const [startH, startM] = formData.start_time.split(':').map(Number)
                        const [endH, endM] = parsed.split(':').map(Number)
                        const startMinutes = startH * 60 + startM
                        const endMinutes = endH * 60 + endM
                        const duration = endMinutes - startMinutes
                        if (duration > 0) {
                          updates.time_estimate = String(duration)
                        }
                      }
                      
                      setFormData({ ...formData, ...updates })
                    }
                  }}
                  placeholder="e.g. 10am, 430pm, 16:00"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
            </div>
            
            {/* Critical & Recurring - compact toggles */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, critical: !formData.critical })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.critical
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-2 ring-red-300 dark:ring-red-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                🚩 Critical
              </button>
              
              <button
                type="button"
                onClick={() => setFormData({ ...formData, recurrence_type: formData.recurrence_type ? null : 'weekly' })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.recurrence_type
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-2 ring-blue-300 dark:ring-blue-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                🔁 Recurring
              </button>
            </div>
            
            {/* Recurrence options - shown when toggle is on */}
            {formData.recurrence_type && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeat</label>
                  <select
                    value={formData.recurrence_type || ''}
                    onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    {RECURRENCE_TYPES.filter(t => t.id).map((type) => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </div>
                
                {!formData.start_date ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span>⚠️</span> Set a Start Date above for recurrence to work
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Occurrences</label>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          value={formData.recurrence_count}
                          onChange={(e) => setFormData({ ...formData, recurrence_count: parseInt(e.target.value) || 1, recurrence_end_date: '' })}
                          className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Or until date</label>
                        <input
                          type="text"
                          value={formData.recurrence_end_date}
                          onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                          onBlur={(e) => {
                            const val = e.target.value.trim()
                            if (!val) return
                            const parsed = parseNaturalLanguageDate(val)
                            if (parsed.date) {
                              setFormData({ ...formData, recurrence_end_date: parsed.date, recurrence_count: 0 })
                            }
                          }}
                          placeholder="e.g. M+6"
                          className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      🗓 {formData.recurrence_end_date 
                        ? `Will create occurrences until ${formData.recurrence_end_date}` 
                        : `Will create ${formData.recurrence_count} future occurrence${formData.recurrence_count !== 1 ? 's' : ''}`}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'subtasks' && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <h3 className="font-medium text-indigo-800 dark:text-indigo-200">Checklist</h3>
              </div>
              <p className="text-sm text-indigo-600 dark:text-indigo-300 mb-4">Break down this task into smaller steps</p>
              
              {/* Add subtask input */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                      e.preventDefault()
                      setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false }])
                      setNewSubtaskTitle('')
                    }
                  }}
                  placeholder="Add a subtask..."
                  className="flex-1 px-4 py-2.5 border border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newSubtaskTitle.trim()) {
                      setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false }])
                      setNewSubtaskTitle('')
                    }
                  }}
                  className="px-4 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium"
                >
                  Add
                </button>
              </div>
              
              {/* Progress bar */}
              {subtasks.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-indigo-700 dark:text-indigo-300 mb-2">
                    <span>{subtasks.filter(s => s.completed).length} of {subtasks.length} completed</span>
                    <span>{Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${(subtasks.filter(s => s.completed).length / subtasks.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Subtasks list */}
              {subtasks.length === 0 ? (
                <div className="text-center py-8 text-indigo-400 dark:text-indigo-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p>No subtasks yet. Add some to track progress!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {subtasks.map((subtask, index) => (
                    <div 
                      key={subtask.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        subtask.completed 
                          ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' 
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSubtasks(subtasks.map(s => 
                            s.id === subtask.id ? { ...s, completed: !s.completed } : s
                          ))
                        }}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          subtask.completed 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                        }`}
                      >
                        {subtask.completed && (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`flex-1 ${
                        subtask.completed ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'
                      }`}>
                        {subtask.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubtasks(subtasks.filter(s => s.id !== subtask.id))}
                        className="p-2 sm:p-1 text-gray-400 hover:text-red-500 transition-colors touch-manipulation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'additional' && (
          <div className="space-y-4">
            {/* Time Estimate & Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Estimate</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={formData.time_estimate}
                  onChange={(e) => {
                    const newEstimate = e.target.value
                    const updates = { time_estimate: newEstimate }
                    
                    // If there's a start_time, recalculate end_time based on new duration
                    if (formData.start_time && newEstimate) {
                      const [hours, mins] = formData.start_time.split(':').map(Number)
                      const startMinutes = hours * 60 + mins
                      const endMinutes = startMinutes + parseInt(newEstimate)
                      const endHours = Math.floor(endMinutes / 60)
                      const endMins = endMinutes % 60
                      updates.end_time = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
                    }
                    
                    setFormData({ ...formData, ...updates })
                  }}
                  className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.time_estimate ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                  placeholder="Minutes (e.g., 30)"
                />
                {formData.time_estimate && (
                  <p className="text-xs text-gray-400 mt-1">{formatTimeEstimate(parseInt(formData.time_estimate))}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assignee</label>
                {!useCustomAssignee ? (
                  <select
                    value={formData.assignee}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setUseCustomAssignee(true)
                        setFormData({ ...formData, assignee: '' })
                      } else {
                        setFormData({ ...formData, assignee: e.target.value })
                      }
                    }}
                    className={`w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.assignee ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                  >
                    <option value="">Unassigned</option>
                    {selectedProject?.members?.map((member) => (
                      <option key={member} value={member}>{member}</option>
                    ))}
                    <option value="__other__">Other (enter name)</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customAssignee}
                      onChange={(e) => setCustomAssignee(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Enter name"
                    />
                    <button
                      type="button"
                      onClick={() => { setUseCustomAssignee(false); setCustomAssignee('') }}
                      className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Category & Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {SOURCES.map((src) => (
                    <option key={src.id} value={src.id}>{src.icon} {src.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Source Link */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source Link</label>
              <input
                type="text"
                value={formData.source_link}
                onChange={(e) => setFormData({ ...formData, source_link: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="URL or reference to the source"
              />
            </div>
            
            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onPaste={handlePaste}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Running notes, context, updates... (paste images here!)"
              />
              {pasteMessage && activeTab === 'additional' && (
                <p className="text-sm text-green-600 mt-1">{pasteMessage}</p>
              )}
            </div>
            
            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attachments</label>
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center hover:border-indigo-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  id="camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById('camera-input')?.click()}
                    disabled={isUploading}
                    className="sm:hidden w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    📷 Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full sm:w-auto px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    {isUploading ? 'Uploading...' : '📎 Choose Files'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Max 10MB • Paste images with ⌘V</p>
              </div>
              
              {uploadError && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {uploadError}
                </div>
              )}
              
              {(attachments.length > 0 || newFiles.length > 0) && (
                <div className="mt-3 space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                      <div 
                        className="flex items-center gap-2 min-w-0 cursor-pointer flex-1"
                        onClick={() => setViewingAttachment(attachment)}
                      >
                        <span className="text-lg">📄</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{attachment.file_name}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(attachment.file_size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewingAttachment(attachment)}
                          className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-500"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </button>
                        <a
                          href={attachment.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                          title="Download"
                        >
                          ⬇️
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            if (onShowConfirm) {
                              onShowConfirm({
                                title: 'Remove Attachment',
                                message: `Remove "${attachment.file_name || attachment.name}"? This cannot be undone.`,
                                confirmLabel: 'Remove',
                                confirmStyle: 'danger',
                                icon: '🗑️',
                                onConfirm: () => removeExistingAttachment(attachment.id)
                              })
                            } else {
                              removeExistingAttachment(attachment.id)
                            }
                          }}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {newFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">➕</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{file.name}</p>
                          <p className="text-xs text-green-600 dark:text-green-400">New • {formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeNewFile(index)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500 flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'dependencies' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-200">Blocked by</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This task won't start until these are done</p>
              </div>
              {selectedDependencies.length > 0 && (
                <span className="text-xs font-medium px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full">
                  {selectedDependencies.length} selected
                </span>
              )}
            </div>
            
            {!formData.project_id ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select a project first</p>
              </div>
            ) : availableDependencies.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">No other tasks to link</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
                {availableDependencies.map((depTask) => {
                  const isSelected = selectedDependencies.includes(depTask.id)
                  return (
                    <label
                      key={depTask.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-indigo-50 dark:bg-indigo-900/30' 
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected 
                          ? 'bg-indigo-500 border-indigo-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDependencies([...selectedDependencies, depTask.id])
                          } else {
                            setSelectedDependencies(selectedDependencies.filter(id => id !== depTask.id))
                          }
                        }}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${
                          isSelected 
                            ? 'font-medium text-gray-900 dark:text-gray-100' 
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>{depTask.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            depTask.status === 'done' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                            depTask.status === 'in_progress' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                            depTask.status === 'todo' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>
                            {COLUMNS.find(c => c.id === depTask.status)?.title}
                          </span>
                          {depTask.critical && (
                            <span className="text-xs text-red-500 dark:text-red-400">🚩</span>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* Add Comment */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">💬</span>
                <div>
                  <h3 className="font-medium text-blue-800 dark:text-blue-300">Add a Comment</h3>
                  <p className="text-sm text-blue-600 dark:text-blue-400">Notes and updates about this task</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a comment or note..."
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCommentText.trim()) {
                      const newComment = {
                        id: Date.now().toString(),
                        text: newCommentText.trim(),
                        created_at: new Date().toISOString(),
                        type: 'comment'
                      }
                      setComments([newComment, ...comments])
                      setNewCommentText('')
                    }
                  }}
                  disabled={!newCommentText.trim()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium sm:self-end"
                >
                  Add Comment
                </button>
              </div>
            </div>
            
            {/* Comments & Activity List */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span>📋</span> Activity & Comments
                {comments.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">({comments.length})</span>
                )}
              </h3>
              
              {comments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                  <span className="text-3xl mb-2 block">📝</span>
                  <p className="text-sm">No comments yet</p>
                  <p className="text-xs">Add notes to track progress and context</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {comments.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        item.type === 'comment' 
                          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' 
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {item.type === 'comment' ? (
                            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{item.text}</p>
                          ) : (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              <span className="text-gray-400 dark:text-gray-500">{item.icon || '•'}</span> {item.text}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {new Date(item.created_at).toLocaleString(undefined, { 
                              month: 'short', 
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        {item.type === 'comment' && (
                          <button
                            type="button"
                            onClick={() => setComments(comments.filter(c => c.id !== item.id))}
                            className="p-2 sm:p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors touch-manipulation"
                            title="Delete comment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 sm:gap-3 pt-6 mt-6 border-t border-gray-100 dark:border-gray-700">
          {task?.id && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="px-3 sm:px-4 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base"
            >
              Delete
            </button>
          )}
          
          {/* Save as Template - desktop only */}
          <div className="hidden sm:block">
          {showSaveTemplateInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name..."
                className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  if (templateName.trim() && onSaveTemplate) {
                    onSaveTemplate({ ...formData, name: templateName.trim(), subtasks })
                    setTemplateName('')
                    setShowSaveTemplateInput(false)
                  }
                }}
                disabled={!templateName.trim()}
                className="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveTemplateInput(false); setTemplateName('') }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveTemplateInput(true)}
              className="px-4 py-2.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors text-sm"
              title="Save current task settings as a reusable template"
            >
              💾 Save as Template
            </button>
          )}
          </div>
          
          <div className="flex-1" />
          
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-sm sm:text-base"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50 text-sm sm:text-base"
          >
            {loading ? 'Saving...' : task?.id ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
      
      {/* Attachment Viewer */}
      <AttachmentViewer
        isOpen={!!viewingAttachment}
        onClose={() => setViewingAttachment(null)}
        attachment={viewingAttachment}
        attachments={attachments}
        onNavigate={setViewingAttachment}
      />
      
      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="text-xl">🗑️</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Task</h3>
            </div>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              Delete "{task?.title}"? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(task.id)
                  setShowDeleteConfirm(false)
                  onClose()
                }}
                className="px-4 py-2 rounded-xl font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Project Modal Component
const ProjectModal = ({ isOpen, onClose, project, onSave, onDelete, onArchive, loading, onShowConfirm }) => {
  const [formData, setFormData] = useState({ name: '', members: [], customers: [] })
  const [newMember, setNewMember] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  
  useEffect(() => {
    if (project) {
      setFormData({ 
        name: project.name, 
        members: [...(project.members || [])],
        customers: [...(project.customers || [])],
      })
    } else {
      setFormData({ name: '', members: [], customers: [] })
    }
    setNewMember('')
    setNewCustomer('')
  }, [project, isOpen])
  
  // Ctrl/Cmd + S to save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isOpen) {
        e.preventDefault()
        document.querySelector('form')?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
  
  const addMember = () => {
    if (newMember.trim() && !formData.members.includes(newMember.trim())) {
      setFormData({ ...formData, members: [...formData.members, newMember.trim()] })
      setNewMember('')
    }
  }
  
  const removeMember = (member) => {
    setFormData({ ...formData, members: formData.members.filter((m) => m !== member) })
  }
  
  const addCustomer = () => {
    if (newCustomer.trim() && !formData.customers.includes(newCustomer.trim())) {
      setFormData({ ...formData, customers: [...formData.customers, newCustomer.trim()] })
      setNewCustomer('')
    }
  }
  
  const removeCustomer = (customer) => {
    setFormData({ ...formData, customers: formData.customers.filter((c) => c !== customer) })
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSave({ ...formData, id: project?.id })
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project ? 'Edit Project' : 'New Project'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="Enter project name"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team Members</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="Add team member"
            />
            <button type="button" onClick={addMember} className="px-4 py-2.5 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.members.map((member) => (
              <span key={member} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                {member}
                <button type="button" onClick={() => removeMember(member)} className="hover:text-indigo-900">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customers/Clients</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomer())}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="Add customer/client"
            />
            <button type="button" onClick={addCustomer} className="px-4 py-2.5 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.customers.map((customer) => (
              <span key={customer} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm">
                {customer}
                <button type="button" onClick={() => removeCustomer(customer)} className="hover:text-purple-900">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex gap-3 pt-4">
          {project && (
            <>
              <button
                type="button"
                onClick={() => {
                  onShowConfirm({
                    title: 'Delete Project',
                    message: `Delete "${project.name}" and all its tasks? This cannot be undone.`,
                    confirmLabel: 'Delete Project',
                    confirmStyle: 'danger',
                    icon: '🗑️',
                    onConfirm: () => {
                      onDelete(project.id)
                      onClose()
                    }
                  })
                }}
                disabled={loading}
                className="px-4 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => { onArchive(project.id); onClose() }}
                disabled={loading}
                className="px-4 py-2.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors disabled:opacity-50"
              >
                {project.archived ? 'Unarchive' : 'Archive'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Saving...' : project ? <><u>S</u>ave Changes</> : <><u>S</u>ave Project</>}
          </button>
        </div>
      </form>
      
    </Modal>
  )
}


// Main KanbanBoard Component
export default function KanbanBoard() {
  const { user, signOut } = useAuth()
  
  // Detect OS for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const shortcutModifier = isMac ? '⌘⌃' : 'Ctrl+Alt+'
  
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [undoToast, setUndoToast] = useState(null) // { taskId, previousStatus, message }
  const [notification, setNotification] = useState(null) // { message, type: 'success' | 'info' }
  
  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  
  // Show notification helper
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }
  
  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    
    setDeleting(true)
    try {
      // Delete all user data
      await supabase.from('tasks').delete().eq('user_id', user.id)
      await supabase.from('projects').delete().eq('user_id', user.id)
      await supabase.from('feedback').delete().eq('user_id', user.id)
      await supabase.from('task_templates').delete().eq('user_id', user.id)
      
      // Sign out (account deletion from auth would need admin API)
      await signOut()
    } catch (err) {
      console.error('Error deleting account:', err)
      setError('Failed to delete account')
      setDeleting(false)
    }
  }
  
  // Handle saving display name
  const handleSaveDisplayName = async () => {
    setSavingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      })
      if (error) throw error
      setEditingDisplayName(false)
      showNotification('Display name saved')
    } catch (err) {
      console.error('Error saving display name:', err)
      setError('Failed to save display name')
    }
    setSavingProfile(false)
  }
  
  // Handle password reset email
  const handleSendPasswordReset = async () => {
    setSendingPasswordReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin
      })
      if (error) throw error
      setPasswordResetSent(true)
    } catch (err) {
      console.error('Error sending password reset:', err)
      setError('Failed to send password reset email')
    }
    setSendingPasswordReset(false)
  }
  
  // Handle preference changes
  const handlePreferenceChange = (key, value) => {
    localStorage.setItem(key, value)
    if (key === 'trackli-default-view') setDefaultView(value)
    if (key === 'trackli-week-start') setWeekStartsOn(value)
    if (key === 'trackli-show-confetti') setShowConfetti(value === 'true')
  }
  
  // Handle clearing old completed tasks
  const handleClearCompletedTasks = async () => {
    setClearingTasks(true)
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(clearTasksAge))
      
      const { data: tasksToDelete, error: fetchError } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'done')
        .lt('updated_at', cutoffDate.toISOString())
      
      if (fetchError) throw fetchError
      
      if (tasksToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('tasks')
          .delete()
          .in('id', tasksToDelete.map(t => t.id))
        
        if (deleteError) throw deleteError
        
        setTasks(prev => prev.filter(t => !tasksToDelete.find(d => d.id === t.id)))
        showNotification(`Cleared ${tasksToDelete.length} completed task${tasksToDelete.length === 1 ? '' : 's'}`)
      } else {
        showNotification('No completed tasks older than ' + clearTasksAge + ' days')
      }
    } catch (err) {
      console.error('Error clearing tasks:', err)
      setError('Failed to clear completed tasks')
    }
    setClearingTasks(false)
  }
  
  // View state
  const [currentView, setCurrentView] = useState(() => localStorage.getItem('trackli-default-view') || 'board') // 'board', 'myday', 'calendar', or 'projects'
  const [calendarViewMode, setCalendarViewMode] = useState('monthly') // 'daily', 'weekly', 'monthly'
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('trackli-dark-mode') === 'true'
    }
    return false
  })
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768
    }
    return false
  })
  const [mobileColumnIndex, setMobileColumnIndex] = useState(1) // Default to To Do column
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  // Settings - Profile
  const [displayName, setDisplayName] = useState('')
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  // Settings - Password
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  // Settings - Preferences
  const [defaultView, setDefaultView] = useState(() => localStorage.getItem('trackli-default-view') || 'board')
  const [weekStartsOn, setWeekStartsOn] = useState(() => localStorage.getItem('trackli-week-start') || '0')
  const [showConfetti, setShowConfetti] = useState(() => localStorage.getItem('trackli-show-confetti') !== 'false')
  // Settings - Data
  const [clearingTasks, setClearingTasks] = useState(false)
  const [clearTasksAge, setClearTasksAge] = useState('30')
  const [helpModalTab, setHelpModalTab] = useState('board')
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('trackli_onboarding_complete')
  })
  const [onboardingStep, setOnboardingStep] = useState(0)
  
  // View-specific tour state
  const [activeViewTour, setActiveViewTour] = useState(null) // 'myday', 'calendar', 'tasks', 'projects', 'progress'
  const [viewTourStep, setViewTourStep] = useState(0)
  const [viewToursCompleted, setViewToursCompleted] = useState(() => {
    const saved = localStorage.getItem('trackli_view_tours_completed')
    return saved ? JSON.parse(saved) : {}
  })
  
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [focusTask, setFocusTask] = useState(null)
  const [draggedTask, setDraggedTask] = useState(null)
  const [deleteRecurringConfirm, setDeleteRecurringConfirm] = useState(null) // { taskId, title, parentId } for recurring delete confirmation
  
  // Simple filters
  const [filterCritical, setFilterCritical] = useState(false)
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [filterBlocked, setFilterBlocked] = useState(false)
  const [filterActive, setFilterActive] = useState(false)
  const [filterBacklog, setFilterBacklog] = useState(false)
  const [filterDueToday, setFilterDueToday] = useState(false)
  const [filterMyDay, setFilterMyDay] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Field filters - supports multiple (e.g., { assignee: 'John', customer: 'Acme' })
  const [fieldFilters, setFieldFilters] = useState({})
  const [pendingFilterField, setPendingFilterField] = useState('')
  
  const [filterReadyToStart, setFilterReadyToStart] = useState(false)
  const [filterTimeOperator, setFilterTimeOperator] = useState('all')
  const [filterTimeValue, setFilterTimeValue] = useState('')
  
  // Saved filter views
  const [savedFilterViews, setSavedFilterViews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trackli_saved_views') || '[]')
    } catch { return [] }
  })
  const [showSaveViewModal, setShowSaveViewModal] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  
  // Task Templates
  const [taskTemplates, setTaskTemplates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trackli_task_templates') || '[]')
    } catch { return [] }
  })
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const welcomeProjectCreating = useRef(false)
    
  // Meeting Notes Import
  const [meetingNotesModalOpen, setMeetingNotesModalOpen] = useState(false)
  const [meetingNotesData, setMeetingNotesData] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    projectId: '',
  })
  const [extractedTasks, setExtractedTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [showExtractedTasks, setShowExtractedTasks] = useState(false)
  const [uploadedImage, setUploadedImage] = useState(null) // { base64, mediaType, preview }
  
  // Voice Input State
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef(null)
  
  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setVoiceSupported(!!SpeechRecognition)
  }, [])
  
  // Voice recognition handlers
  const startListening = (onTranscript, continuous = false) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Safari.')
      return
    }
    
    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = 'en-GB'
    
    recognition.onstart = () => {
      setIsListening(true)
    }
    
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onTranscript(transcript)
    }
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.')
      }
    }
    
    recognition.onend = () => {
      setIsListening(false)
    }
    
    recognitionRef.current = recognition
    recognition.start()
  }
  
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }
  
  const toggleVoiceInput = (onTranscript, continuous = false) => {
    if (isListening) {
      stopListening()
    } else {
      startListening(onTranscript, continuous)
    }
  }
  
  // Toast for undo actions
  const [toast, setToast] = useState(null)
  
  // Enhanced error state with retry capability
  const [errorToast, setErrorToast] = useState(null) // { message, retryAction, details }
  
  // Helper to show error with optional retry
  const showError = (message, retryAction = null, details = null) => {
    const userFriendlyMessage = message.includes('Failed to fetch') || message.includes('NetworkError')
      ? 'Network error - please check your connection'
      : message.includes('JWT') || message.includes('auth')
      ? 'Session expired - please refresh the page'
      : message.includes('duplicate') || message.includes('unique')
      ? 'This item already exists'
      : message.includes('permission') || message.includes('denied')
      ? 'You don\'t have permission to do this'
      : message
    setErrorToast({ message: userFriendlyMessage, retryAction, details })
  }
  
  // Confirm dialog state (replaces browser confirm())
  const [confirmDialog, setConfirmDialog] = useState(null) // { title, message, onConfirm, confirmLabel, confirmStyle, icon }
  
  // Bulk selection
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set())
  
  // Archive filter
  const [showArchived, setShowArchived] = useState(false)
  
  // Quick Add mode
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [quickAddProject, setQuickAddProject] = useState('')
  
  // Daily Planning mode
  const [planningModeOpen, setPlanningModeOpen] = useState(false)

  // Dark mode effect
  useEffect(() => {
    localStorage.setItem('trackli-dark-mode', darkMode)
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Mobile detection effect
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      // On Mac: require Cmd+Ctrl to avoid browser shortcut conflicts (⌘T opens new tab, etc.)
      // On Windows: require Ctrl+Alt
      const modifier = isMac ? (e.metaKey && e.ctrlKey) : (e.ctrlKey && e.altKey)
      
      // Cmd/Ctrl/Alt + K or S for search
      if (modifier && (e.key === 'k' || e.key === 's')) {
        e.preventDefault()
        setSearchModalOpen(true)
        return
      }
      
      // / for search (no modifier needed)
      if (e.key === '/') {
        e.preventDefault()
        setSearchModalOpen(true)
        return
      }
      
      // q for quick add (no modifier needed)
      if (e.key === 'q') {
        e.preventDefault()
        if (projects.length > 0) {
          setQuickAddProject(projects[0]?.id || '')
          setQuickAddOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + T for new Task
      if (modifier && e.key === 't') {
        e.preventDefault()
        if (projects.length > 0) {
          setEditingTask(null)
          setTaskModalOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + P for new Project
      if (modifier && e.key === 'p') {
        e.preventDefault()
        setEditingProject(null)
        setProjectModalOpen(true)
        return
      }
      
      // Cmd/Ctrl/Alt + N for Import Notes
      if (modifier && e.key === 'n') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setVoiceTranscript('')
          setMeetingNotesModalOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + V for Voice Input
      if (modifier && e.key === 'v') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '', notes: '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setVoiceTranscript(' ')  // Set to trigger voice mode
          setMeetingNotesModalOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + D for My Day view
      if (modifier && e.key === 'd') {
        e.preventDefault()
        setCurrentView('myday')
        return
      }
      
      // Cmd/Ctrl/Alt + B for Board view
      if (modifier && e.key === 'b') {
        e.preventDefault()
        setCurrentView('board')
        return
      }
      
      // Cmd/Ctrl/Alt + L for Calendar view
      if (modifier && e.key === 'l') {
        e.preventDefault()
        setCurrentView('calendar')
        return
      }
      
      // Cmd/Ctrl/Alt + A for All Tasks view
      if (modifier && e.key === 'a') {
        e.preventDefault()
        setCurrentView('tasks')
        return
      }
      
      // ? for keyboard shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setHelpModalTab('shortcuts')
        setHelpModalOpen(true)
        return
      }
      
      // Escape to exit bulk select mode
      if (e.key === 'Escape' && bulkSelectMode) {
        setBulkSelectMode(false)
        setSelectedTaskIds(new Set())
        return
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [projects, meetingNotesData, tasks])
  
  
  // Trigger view-specific tour when visiting a new view for the first time
  useEffect(() => {
    // Don't show view tours on mobile or if main onboarding is still showing
    if (isMobile || showOnboarding) return
    
    // Only show tours for non-board views (board has its own onboarding)
    const tourableViews = ['myday', 'calendar', 'tasks', 'projects', 'progress']
    
    if (tourableViews.includes(currentView) && !viewToursCompleted[currentView]) {
      // Small delay to let the view render first
      const timer = setTimeout(() => {
        setActiveViewTour(currentView)
        setViewTourStep(0)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentView, viewToursCompleted, isMobile, showOnboarding])
  
  // Handle completing a view tour
  const handleViewTourComplete = (view) => {
    const newCompleted = { ...viewToursCompleted, [view]: true }
    setViewToursCompleted(newCompleted)
    localStorage.setItem('trackli_view_tours_completed', JSON.stringify(newCompleted))
    setActiveViewTour(null)
    setViewTourStep(0)
  }
  
  // Create welcome project for new users
  const createWelcomeProject = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
      
      // Create the Getting Started project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: '🚀 Getting Started with Trackli',
          user_id: user.id,
        })
        .select()
        .single()
      
      if (projectError) {
        console.error('Project creation error:', projectError)
        throw projectError
      }
      
      // Create sample tasks
      const sampleTasks = [
        {
          title: '👋 Welcome! Click me to see task details',
          description: 'This is the task editor. Here you can:\n\n• Set due dates and start dates\n• Add time estimates\n• Assign to team members\n• Add subtasks\n• Attach files\n• Set up recurring schedules\n\nTry editing this task, then mark it complete!',
          status: 'todo',
          project_id: project.id,
          my_day_date: today,
          energy_level: 'low',
          time_estimate: 5,
        },
        {
          title: '☀️ Check out My Day view',
          description: 'My Day is your daily focus list. Tasks appear here if:\n\n• Their start date is today or earlier\n• You manually add them via the ☀️ icon\n\nTry switching to My Day view in the menu!',
          status: 'todo',
          project_id: project.id,
          start_date: today,
          energy_level: 'medium',
          time_estimate: 10,
        },
        {
          title: '🗓 Explore the Calendar view',
          description: 'The Calendar view lets you:\n\n• See tasks on their due dates\n• Drag tasks to reschedule them\n• Switch between daily, weekly, and monthly views\n\nThis task is due tomorrow!',
          status: 'todo',
          project_id: project.id,
          due_date: tomorrow,
          energy_level: 'medium',
          time_estimate: 15,
        },
        {
          title: '📝 Try the Notes feature for meetings',
          description: 'Click the Notes button in the header to:\n\n• Paste meeting notes\n• Use voice-to-text (speak your notes!)\n• AI extracts action items automatically\n\nPerfect for turning meetings into tasks!',
          status: 'todo',
          project_id: project.id,
          energy_level: 'high',
          time_estimate: 20,
        },
        {
          title: '⌨️ Learn keyboard shortcuts',
          description: 'Speed up your workflow with shortcuts:\n\n• ⌘/Ctrl + ⌃ + T — New task\n• ⌘/Ctrl + S — Save\n• Escape — Close modal\n• ? — Help menu\n\nClick the ? icon anytime for more!',
          status: 'backlog',
          project_id: project.id,
          due_date: nextWeek,
          energy_level: 'low',
          time_estimate: 10,
        },
        {
          title: '✅ Complete this task to see the celebration!',
          description: 'When you complete all your My Day tasks, you get a confetti celebration! 🎉\n\nTry completing this task by clicking the circle on the left.',
          status: 'todo',
          project_id: project.id,
          my_day_date: today,
          energy_level: 'low',
          time_estimate: 1,
        },
      ]
      
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .insert(sampleTasks)
        .select()
      
      if (tasksError) throw tasksError
      
      // Add subtasks to the first task to demonstrate the feature
      const welcomeTask = tasks.find(t => t.title.includes('Welcome!'))
      if (welcomeTask) {
        await supabase.from('subtasks').insert([
          { task_id: welcomeTask.id, title: 'Read this task description', completed: false, position: 0 },
          { task_id: welcomeTask.id, title: 'Check out the different views (My Day, Calendar, etc.)', completed: false, position: 1 },
          { task_id: welcomeTask.id, title: 'Complete a task to see it move to Done', completed: false, position: 2 },
        ])
      }
      
      // Refresh data to show the new project and tasks
      setShowWelcomeModal(true)
      await fetchData()
      
    } catch (err) {
      console.error('Error creating welcome project:', err)
    }
  }

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch all data in parallel with bulk queries (fixes N+1 query problem)
      // Include user check in parallel to avoid sequential delay
      const [projectsRes, tasksRes, membersRes, customersRes, attachmentsRes, dependenciesRes, userRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('project_members').select('project_id, name'),
        supabase.from('project_customers').select('project_id, name'),
        supabase.from('attachments').select('*'),
        supabase.from('task_dependencies').select('task_id, depends_on_id'),
        supabase.auth.getUser()
      ])
      
      if (projectsRes.error) throw projectsRes.error
      if (tasksRes.error) throw tasksRes.error
      
      // Group members and customers by project_id
      const membersByProject = {}
      const customersByProject = {}
      
      membersRes.data?.forEach(m => {
        if (!membersByProject[m.project_id]) membersByProject[m.project_id] = []
        membersByProject[m.project_id].push(m.name)
      })
      
      customersRes.data?.forEach(c => {
        if (!customersByProject[c.project_id]) customersByProject[c.project_id] = []
        customersByProject[c.project_id].push(c.name)
      })
      
      // Map projects with their relations
      const projectsWithRelations = projectsRes.data.map(project => ({
        ...project,
        members: membersByProject[project.id] || [],
        customers: customersByProject[project.id] || []
      }))
      
      // Group attachments and dependencies by task_id
      const attachmentsByTask = {}
      const dependenciesByTask = {}
      
      attachmentsRes.data?.forEach(att => {
        if (!attachmentsByTask[att.task_id]) attachmentsByTask[att.task_id] = []
        attachmentsByTask[att.task_id].push({
          ...att,
          file_url: supabase.storage.from('attachments').getPublicUrl(att.file_path).data.publicUrl
        })
      })
      
      dependenciesRes.data?.forEach(dep => {
        if (!dependenciesByTask[dep.task_id]) dependenciesByTask[dep.task_id] = []
        dependenciesByTask[dep.task_id].push(dep)
      })
      
      // Map tasks with their relations
      const tasksWithRelations = tasksRes.data.map(task => ({
        ...task,
        attachments: attachmentsByTask[task.id] || [],
        dependencies: dependenciesByTask[task.id] || []
      }))
      
      setProjects(projectsWithRelations)
      setTasks(tasksWithRelations)
      
      // Create welcome project for NEW users only (first time ever)
      // Check user metadata to see if they've already been welcomed
      const currentUser = userRes.data?.user
      const hasBeenWelcomed = currentUser?.user_metadata?.has_been_welcomed
      
      if (!hasBeenWelcomed && projectsWithRelations.length === 0 && tasksWithRelations.length === 0 && !welcomeProjectCreating.current) {
        welcomeProjectCreating.current = true
        await createWelcomeProject()
        
        // Mark user as welcomed so this never happens again
        await supabase.auth.updateUser({
          data: { has_been_welcomed: true }
        })
        
        return // fetchData will be called again after welcome project creation
      }
      
      // Auto-move backlog tasks to todo if start date is today or past (do this without blocking UI)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const tasksToMove = tasksWithRelations.filter(task => {
        if (task.status !== 'backlog') return false
        if (!task.start_date) return false
        const startDate = new Date(task.start_date)
        startDate.setHours(0, 0, 0, 0)
        return startDate <= today
      })
      
      // Update local state immediately, then sync to DB in background
      if (tasksToMove.length > 0) {
        const taskIdsToMove = tasksToMove.map(t => t.id)
        
        // Update UI immediately
        setTasks(prev => prev.map(task => 
          taskIdsToMove.includes(task.id) 
            ? { ...task, status: 'todo' } 
            : task
        ))
        
        // Sync to DB in background (don't await)
        supabase
          .from('tasks')
          .update({ status: 'todo' })
          .in('id', taskIdsToMove)
          .then(() => console.log('Auto-moved', taskIdsToMove.length, 'tasks to todo'))
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Meeting Notes Import Functions
  const extractActionItems = (notesText) => {
    const lines = notesText.split('\n')
    const actionItems = []
    
    // Try to find a Follow-Up table first
    const tableResult = extractFromFollowUpTable(notesText)
    if (tableResult.length > 0) {
      return tableResult
    }
    
    // Fall back to pattern matching
    return extractFromPatterns(lines)
  }
  
  const extractFromFollowUpTable = (notesText) => {
    const lines = notesText.split('\n')
    const actionItems = []
    
    let headerRowIndex = -1
    let columnIndices = { followUp: -1, owner: -1, dueDate: -1, status: -1 }
    let delimiter = '|'
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      
      if (line.includes('|') && (line.includes('follow') || line.includes('action') || line.includes('task'))) {
        const cells = lines[i].split('|').map(c => c.trim().toLowerCase())
        
        for (let j = 0; j < cells.length; j++) {
          const cell = cells[j]
          if (cell.includes('follow') || cell.includes('action') || cell.includes('task') || cell.includes('item')) {
            columnIndices.followUp = j
          } else if (cell.includes('owner') || cell.includes('assignee') || cell.includes('who') || cell.includes('responsible')) {
            columnIndices.owner = j
          } else if (cell.includes('due') || cell.includes('date') || cell.includes('when') || cell.includes('deadline')) {
            columnIndices.dueDate = j
          } else if (cell.includes('status') || cell.includes('state') || cell.includes('progress')) {
            columnIndices.status = j
          }
        }
        
        if (columnIndices.followUp !== -1) {
          headerRowIndex = i
          delimiter = '|'
          break
        }
      }
      
      if (line.includes('\t') && (line.includes('follow') || line.includes('action') || line.includes('task'))) {
        const cells = lines[i].split('\t').map(c => c.trim().toLowerCase())
        
        for (let j = 0; j < cells.length; j++) {
          const cell = cells[j]
          if (cell.includes('follow') || cell.includes('action') || cell.includes('task') || cell.includes('item')) {
            columnIndices.followUp = j
          } else if (cell.includes('owner') || cell.includes('assignee') || cell.includes('who')) {
            columnIndices.owner = j
          } else if (cell.includes('due') || cell.includes('date') || cell.includes('when')) {
            columnIndices.dueDate = j
          } else if (cell.includes('status') || cell.includes('state')) {
            columnIndices.status = j
          }
        }
        
        if (columnIndices.followUp !== -1) {
          headerRowIndex = i
          delimiter = '\t'
          break
        }
      }
    }
    
    if (headerRowIndex === -1 || columnIndices.followUp === -1) {
      return []
    }
    
    let startRow = headerRowIndex + 1
    if (startRow < lines.length && /^[\s|:-]+$/.test(lines[startRow].replace(/\t/g, ''))) {
      startRow++
    }
    
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (!line || (!line.includes(delimiter) && delimiter === '|') || 
          (delimiter === '\t' && !line.includes('\t') && line.split(/\s{2,}/).length < 2)) {
        if (actionItems.length > 0) break
        continue
      }
      
      const cells = delimiter === '|' 
        ? line.split('|').map(c => c.trim())
        : line.split('\t').map(c => c.trim())
      
      const followUp = cells[columnIndices.followUp] || ''
      const owner = columnIndices.owner !== -1 ? (cells[columnIndices.owner] || '') : ''
      const dueDateStr = columnIndices.dueDate !== -1 ? (cells[columnIndices.dueDate] || '') : ''
      const status = columnIndices.status !== -1 ? (cells[columnIndices.status] || '').toLowerCase() : ''
      
      if (!followUp || followUp.length < 3) continue
      if (status.includes('done') || status.includes('complete') || status.includes('closed')) continue
      
      let dueDate = meetingNotesData.date
      if (dueDateStr) {
        const parsedDate = parseDateString(dueDateStr)
        if (parsedDate) dueDate = parsedDate
      }
      
      const isCritical = /urgent|asap|critical|important|high/i.test(followUp) || 
                        /urgent|asap|critical|important|high/i.test(status)
      
      actionItems.push({
        id: `extracted-table-${i}`,
        title: followUp.charAt(0).toUpperCase() + followUp.slice(1),
        assignee: owner,
        dueDate: dueDate,
        selected: true,
        critical: isCritical,
      })
    }
    
    return actionItems
  }
  
  const parseDateString = (dateStr) => {
    if (!dateStr) return null
    
    const cleaned = dateStr.trim().toLowerCase()
    const today = new Date()
    
    // Detect if user's locale uses MM/DD (US) or DD/MM (most other countries)
    const isUSLocale = isUSDateFormat()
    
    if (cleaned === 'today' || cleaned === 'eod') {
      return today.toISOString().split('T')[0]
    }
    if (cleaned === 'tomorrow') {
      today.setDate(today.getDate() + 1)
      return today.toISOString().split('T')[0]
    }
    if (cleaned === 'asap') {
      return today.toISOString().split('T')[0]
    }
    
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const dayIndex = days.indexOf(cleaned)
    if (dayIndex !== -1) {
      let daysUntil = (dayIndex - today.getDay() + 7) % 7
      if (daysUntil === 0) daysUntil = 7
      today.setDate(today.getDate() + daysUntil)
      return today.toISOString().split('T')[0]
    }
    
    // Parse numeric dates based on locale
    let match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (match) {
      let day, month
      if (isUSLocale) {
        // US: MM/DD/YYYY
        month = parseInt(match[1]) - 1
        day = parseInt(match[2])
      } else {
        // UK/EU: DD/MM/YYYY
        day = parseInt(match[1])
        month = parseInt(match[2]) - 1
      }
      const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])
      const date = new Date(year, month, day)
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }
    
    // Short date without year
    match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/)
    if (match) {
      let day, month
      if (isUSLocale) {
        month = parseInt(match[1]) - 1
        day = parseInt(match[2])
      } else {
        day = parseInt(match[1])
        month = parseInt(match[2]) - 1
      }
      const date = new Date(today.getFullYear(), month, day)
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }
    
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    match = dateStr.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
    if (match) {
      const day = parseInt(match[1])
      const month = months.indexOf(match[2].toLowerCase())
      const date = new Date(today.getFullYear(), month, day)
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }
    match = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})/i)
    if (match) {
      const day = parseInt(match[2])
      const month = months.indexOf(match[1].toLowerCase())
      const date = new Date(today.getFullYear(), month, day)
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }
    
    return null
  }
  
  const extractFromPatterns = (lines) => {
    const actionItems = []
    
    const actionPatterns = [
      /^[-*•]\s*\[?\s*\]?\s*(.+)/i,
      /^(?:action|todo|task|to-do|to do)[:\s]+(.+)/i,
      /^(\d+[.)]\s*.+)/i,
      /(.+?)\s+(?:will|to|should|must|needs? to|has to)\s+(.+)/i,
      /(?:@|assigned to:?)\s*(\w+)\s*[-:]\s*(.+)/i,
      /^(?:ai|action item)[:\s]+(.+)/i,
      /^follow[ -]?up[:\s]+(.+)/i,
    ]
    
    const actionVerbs = /^(schedule|send|create|update|review|prepare|draft|complete|finish|follow|contact|call|email|write|set up|organize|coordinate|check|confirm|arrange|book|submit|share|distribute|circulate|research|investigate|look into|find|get|obtain|collect|gather|compile|analyze|assess|evaluate|implement|execute|deliver|present|discuss|meet|sync|align|escalate|resolve|fix|address)/i
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      let matched = false
      let taskTitle = ''
      let assignee = ''
      
      for (const pattern of actionPatterns) {
        const match = line.match(pattern)
        if (match) {
          if (pattern.toString().includes('will|to|should')) {
            assignee = match[1]?.trim() || ''
            taskTitle = `${assignee} ${match[2]?.trim() || ''}`.trim()
          } 
          else if (pattern.toString().includes('@|assigned')) {
            assignee = match[1]?.trim() || ''
            taskTitle = match[2]?.trim() || ''
          }
          else {
            taskTitle = match[1]?.trim() || ''
          }
          matched = true
          break
        }
      }
      
      if (!matched && actionVerbs.test(line)) {
        taskTitle = line
        matched = true
      }
      
      if (!matched && line.includes(':') && !line.startsWith('http')) {
        const parts = line.split(':')
        if (parts.length >= 2 && parts[0].length < 30) {
          const potentialAssignee = parts[0].trim()
          const potentialTask = parts.slice(1).join(':').trim()
          if (potentialTask.length > 5 && actionVerbs.test(potentialTask)) {
            assignee = potentialAssignee
            taskTitle = potentialTask
            matched = true
          }
        }
      }
      
      if (matched && taskTitle.length > 3) {
        taskTitle = taskTitle
          .replace(/^[-*•]\s*\[?\s*\]?\s*/, '')
          .replace(/^\d+[.)]\s*/, '')
          .replace(/^(?:action|todo|task|ai|action item|follow[ -]?up)[:\s]*/i, '')
          .trim()
        
        let dueDate = meetingNotesData.date
        const datePatterns = [
          /by\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
          /by\s+(\d{1,2}\/\d{1,2})/i,
          /due\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
          /(eod|end of day|eow|end of week|asap)/i,
        ]
        
        for (const datePattern of datePatterns) {
          const dateMatch = taskTitle.match(datePattern)
          if (dateMatch) {
            const hint = dateMatch[1].toLowerCase()
            const today = new Date()
            if (hint === 'today' || hint === 'eod' || hint === 'end of day') {
              dueDate = today.toISOString().split('T')[0]
            } else if (hint === 'tomorrow') {
              today.setDate(today.getDate() + 1)
              dueDate = today.toISOString().split('T')[0]
            } else if (hint === 'asap') {
              dueDate = today.toISOString().split('T')[0]
            } else if (hint === 'eow' || hint === 'end of week') {
              const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7
              today.setDate(today.getDate() + daysUntilFriday)
              dueDate = today.toISOString().split('T')[0]
            } else if (['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(hint)) {
              const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
              const targetDay = days.indexOf(hint)
              let daysUntil = (targetDay - today.getDay() + 7) % 7
              if (daysUntil === 0) daysUntil = 7
              today.setDate(today.getDate() + daysUntil)
              dueDate = today.toISOString().split('T')[0]
            }
            taskTitle = taskTitle.replace(datePattern, '').trim()
          }
        }
        
        if (taskTitle.length > 3) {
          actionItems.push({
            id: `extracted-${i}`,
            title: taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1),
            assignee: assignee,
            dueDate: dueDate,
            selected: true,
            critical: /urgent|asap|critical|important/i.test(taskTitle),
          })
        }
      }
    }
    
    return actionItems
  }
  
  const handleExtractTasks = async () => {
    if (!meetingNotesData.notes.trim() && !uploadedImage) return
    
    setIsExtracting(true)
    
    try {
      // If we have an uploaded image, use AI vision to extract tasks
      if (uploadedImage) {
        const response = await fetch('/api/extract-from-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: uploadedImage.base64,
            mediaType: uploadedImage.mediaType,
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to extract tasks from image')
        }
        
        const data = await response.json()
        const extracted = data.tasks.map((task, idx) => ({
          id: `img-${Date.now()}-${idx}`,
          title: task.title,
          assignee: task.assignee || '',
          dueDate: task.dueDate || meetingNotesData.date,
          critical: task.isCritical || false,
          selected: true,
        }))
        
        setExtractedTasks(extracted)
        setShowExtractedTasks(true)
      } else {
        // Use local text extraction
        setTimeout(() => {
          const extracted = extractActionItems(meetingNotesData.notes)
          setExtractedTasks(extracted)
          setShowExtractedTasks(true)
        }, 300)
      }
    } catch (error) {
      console.error('Extraction error:', error)
      setError(error.message)
    } finally {
      setIsExtracting(false)
    }
  }
  
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      console.log('No file selected')
      return
    }
    
    console.log('File selected:', file.name, file.type, file.size)
    
    // Use canvas to compress/resize large images
    const img = new Image()
    const reader = new FileReader()
    
    reader.onload = (event) => {
      img.onload = () => {
        // Max dimensions for the image
        const maxWidth = 2000
        const maxHeight = 2000
        let { width, height } = img
        
        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        
        // Convert to base64 with compression (0.8 quality)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const base64 = compressedDataUrl.split(',')[1]
        
        console.log('Compressed image size:', Math.round(base64.length * 0.75 / 1024), 'KB')
        
        setUploadedImage({
          base64,
          mediaType: 'image/jpeg',
          preview: compressedDataUrl,
          name: file.name || 'photo.jpg',
        })
        setError(null)
      }
      
      img.onerror = () => {
        console.error('Failed to load image')
        setError('Failed to load image')
      }
      
      img.src = event.target.result
    }
    
    reader.onerror = () => {
      console.error('FileReader error:', reader.error)
      setError('Failed to read image file')
    }
    
    reader.readAsDataURL(file)
  }
  
  const handleCreateExtractedTasks = async () => {
    const selectedTasks = extractedTasks.filter(t => t.selected)
    if (selectedTasks.length === 0) return
    
    setSaving(true)
    setError(null)
    
    try {
      const projectId = meetingNotesData.projectId || projects[0]?.id
      if (!projectId) throw new Error('Please select a project')
      
      const project = projects.find(p => p.id === projectId)
      const members = project?.members || []
      
      for (const task of selectedTasks) {
        let matchedAssignee = null
        if (task.assignee) {
          matchedAssignee = members.find(m => 
            m.toLowerCase().includes(task.assignee.toLowerCase()) ||
            task.assignee.toLowerCase().includes(m.toLowerCase().split(' ')[0])
          )
        }
        
        const taskData = {
          title: task.title,
          description: meetingNotesData.title ? `From meeting: ${meetingNotesData.title}` : '',
          project_id: projectId,
          status: 'todo',
          critical: task.critical,
          start_date: null,
          due_date: task.dueDate || null,
          assignee: matchedAssignee || task.assignee || null,
          time_estimate: null,
          energy_level: 'medium',
          category: 'meeting_followup',
          source: 'meeting',
          source_link: null,
          customer: null,
          notes: null,
        }
        
        const { error: insertError } = await supabase
          .from('tasks')
          .insert(taskData)
        
        if (insertError) throw insertError
      }
      
      await fetchData()
      
      setMeetingNotesModalOpen(false)
      setMeetingNotesData({ title: '', date: new Date().toISOString().split('T')[0], notes: '', projectId: '' })
      setExtractedTasks([])
      setShowExtractedTasks(false)
      setVoiceTranscript('')
      stopListening()
      
    } catch (err) {
      console.error('Error creating tasks:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  const updateExtractedTask = (taskId, field, value) => {
    setExtractedTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, [field]: value } : t
    ))
  }
  
  const removeExtractedTask = (taskId) => {
    setExtractedTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // Project CRUD
  const handleSaveProject = async (projectData) => {
    setSaving(true)
    setError(null)
    
    try {
      if (projectData.id) {
        const { error: updateError } = await supabase
          .from('projects')
          .update({ name: projectData.name })
          .eq('id', projectData.id)
        
        if (updateError) throw updateError

        await supabase.from('project_members').delete().eq('project_id', projectData.id)
        await supabase.from('project_customers').delete().eq('project_id', projectData.id)

        if (projectData.members.length > 0) {
          await supabase.from('project_members').insert(
            projectData.members.map(name => ({ project_id: projectData.id, name }))
          )
        }

        if (projectData.customers.length > 0) {
          await supabase.from('project_customers').insert(
            projectData.customers.map(name => ({ project_id: projectData.id, name }))
          )
        }
      } else {
        const { data: newProject, error: insertError } = await supabase
          .from('projects')
          .insert({ name: projectData.name, user_id: user.id })
          .select()
          .single()
        
        if (insertError) throw insertError

        if (projectData.members.length > 0) {
          await supabase.from('project_members').insert(
            projectData.members.map(name => ({ project_id: newProject.id, name }))
          )
        }

        if (projectData.customers.length > 0) {
          await supabase.from('project_customers').insert(
            projectData.customers.map(name => ({ project_id: newProject.id, name }))
          )
        }
      }

      await fetchData()
      
      // Show notification
      const isNew = !projectData.id
      showNotification(isNew ? "✓ Project created" : "✓ Project saved")
    } catch (err) {
      console.error('Error saving project:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  
  const handleDeleteProject = async (projectId) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId)
      if (error) throw error
      
      if (selectedProjectId === projectId) setSelectedProjectId('all')
      await fetchData()
    } catch (err) {
      console.error('Error deleting project:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  const handleArchiveProject = async (projectId) => {
    const project = projects.find(p => p.id === projectId)
    const action = project?.archived ? 'unarchive' : 'archive'
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ archived: !project?.archived })
        .eq('id', projectId)
      
      if (error) throw error
      
      setProjects(projects.map(p => p.id === projectId ? { ...p, archived: !p.archived } : p))
      // Show feedback via undo toast pattern
      setUndoToast({
        taskId: null,
        previousStatus: null,
        taskTitle: `Project ${action}d`,
      })
      setTimeout(() => setUndoToast(null), 3000)
    } catch (err) {
      console.error(`Error ${action}ing project:`, err)
      showError(err.message || `Failed to ${action} project`, null, `Project ${action} failed`)
    } finally {
      setSaving(false)
    }
  }
  
  // Bulk actions
  const handleBulkStatusChange = async (newStatus) => {
    if (selectedTaskIds.size === 0) return
    
    setSaving(true)
    try {
      const ids = Array.from(selectedTaskIds)
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .in('id', ids)
      
      if (error) throw error
      
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, status: newStatus } : t))
      setUndoToast({ taskId: null, previousStatus: null, taskTitle: `${ids.length} tasks moved to ${newStatus.replace('_', ' ')}` })
      setTimeout(() => setUndoToast(null), 3000)
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
    } catch (err) {
      console.error('Error bulk updating tasks:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return
    
    setConfirmDialog({
      title: 'Delete Tasks',
      message: `Are you sure you want to delete ${selectedTaskIds.size} selected task${selectedTaskIds.size === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmStyle: 'danger',
      icon: '🗑️',
      onConfirm: async () => {
        setSaving(true)
        try {
          const ids = Array.from(selectedTaskIds)
          const { error } = await supabase
            .from('tasks')
            .delete()
            .in('id', ids)
          
          if (error) throw error
          
          setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)))
          setUndoToast({ taskId: null, previousStatus: null, taskTitle: `${ids.length} tasks deleted` })
          setTimeout(() => setUndoToast(null), 3000)
          setBulkSelectMode(false)
          setSelectedTaskIds(new Set())
          setConfirmDialog(null)
        } catch (err) {
          console.error('Error bulk deleting tasks:', err)
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }
    })
  }

  const handleBulkMoveToProject = async (projectId) => {
    if (selectedTaskIds.size === 0 || !projectId) return
    
    setSaving(true)
    try {
      const ids = Array.from(selectedTaskIds)
      const { error } = await supabase
        .from('tasks')
        .update({ project_id: projectId })
        .in('id', ids)
      
      if (error) throw error
      
      const projectName = projects.find(p => p.id === projectId)?.name || 'project'
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, project_id: projectId } : t))
      setUndoToast({ taskId: null, previousStatus: null, taskTitle: `${ids.length} tasks moved to ${projectName}` })
      setTimeout(() => setUndoToast(null), 3000)
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
    } catch (err) {
      console.error('Error bulk moving tasks:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBulkAssign = async (assignee) => {
    if (selectedTaskIds.size === 0) return
    
    setSaving(true)
    try {
      const ids = Array.from(selectedTaskIds)
      const { error } = await supabase
        .from('tasks')
        .update({ assignee: assignee || null })
        .in('id', ids)
      
      if (error) throw error
      
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, assignee: assignee || null } : t))
      setUndoToast({ taskId: null, previousStatus: null, taskTitle: `${ids.length} tasks assigned to ${assignee || 'nobody'}` })
      setTimeout(() => setUndoToast(null), 3000)
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
    } catch (err) {
      console.error('Error bulk assigning tasks:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBulkToggleCritical = async () => {
    if (selectedTaskIds.size === 0) return
    
    setSaving(true)
    try {
      const ids = Array.from(selectedTaskIds)
      // Check if majority are critical - if so, unmark all; otherwise mark all
      const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id))
      const majorityCritical = selectedTasks.filter(t => t.critical).length > selectedTasks.length / 2
      const newCritical = !majorityCritical
      
      const { error } = await supabase
        .from('tasks')
        .update({ critical: newCritical })
        .in('id', ids)
      
      if (error) throw error
      
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, critical: newCritical } : t))
      setUndoToast({ taskId: null, previousStatus: null, taskTitle: `${ids.length} tasks ${newCritical ? 'marked critical' : 'unmarked'}` })
      setTimeout(() => setUndoToast(null), 3000)
      setBulkSelectMode(false)
      setSelectedTaskIds(new Set())
    } catch (err) {
      console.error('Error bulk toggling critical:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  const toggleTaskSelection = (taskId) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }
  
  const selectAllTasks = () => {
    setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)))
  }
  
  const deselectAllTasks = () => {
    setSelectedTaskIds(new Set())
  }

  // Task CRUD
  const handleSaveTask = async (taskData, newFiles = [], existingAttachments = []) => {
    setSaving(true)
    setError(null)
    
    try {
      let taskId = taskData.id

      if (taskId) {
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            title: taskData.title,
            description: taskData.description,
            project_id: taskData.project_id,
            status: taskData.status,
            critical: taskData.critical,
            start_date: taskData.start_date || null,
            start_time: taskData.start_time || null,
            end_time: taskData.end_time || null,
            due_date: taskData.due_date || null,
            assignee: taskData.assignee || null,
            time_estimate: taskData.time_estimate,
            energy_level: taskData.energy_level,
            category: taskData.category,
            source: taskData.source,
            source_link: taskData.source_link || null,
            customer: taskData.customer || null,
            notes: taskData.notes || null,
            recurrence_type: taskData.recurrence_type || null,
            recurrence_count: taskData.recurrence_count || 8,
            recurrence_end_date: taskData.recurrence_end_date || null,
            subtasks: taskData.subtasks || [],
            comments: taskData.comments || [],
          })
          .eq('id', taskId)
        
        if (updateError) throw updateError
        
        await supabase.from('task_dependencies').delete().eq('task_id', taskId)
        if (taskData.dependencies && taskData.dependencies.length > 0) {
          await supabase.from('task_dependencies').insert(
            taskData.dependencies.map(depId => ({ task_id: taskId, depends_on_id: depId }))
          )
        }

        const existingIds = existingAttachments.map(a => a.id)
        const { data: currentAttachments } = await supabase
          .from('attachments')
          .select('id, file_path')
          .eq('task_id', taskId)
        
        const removedAttachments = currentAttachments?.filter(a => !existingIds.includes(a.id)) || []
        
        for (const att of removedAttachments) {
          await supabase.storage.from('attachments').remove([att.file_path])
          await supabase.from('attachments').delete().eq('id', att.id)
        }
      } else {
        const { data: newTask, error: insertError } = await supabase
          .from('tasks')
          .insert({
            title: taskData.title,
            description: taskData.description,
            project_id: taskData.project_id,
            status: taskData.status,
            critical: taskData.critical,
            start_date: taskData.start_date || null,
            start_time: taskData.start_time || null,
            end_time: taskData.end_time || null,
            due_date: taskData.due_date || null,
            assignee: taskData.assignee || null,
            time_estimate: taskData.time_estimate,
            energy_level: taskData.energy_level,
            category: taskData.category,
            source: taskData.source,
            source_link: taskData.source_link || null,
            customer: taskData.customer || null,
            notes: taskData.notes || null,
            recurrence_type: taskData.recurrence_type || null,
            recurrence_count: taskData.recurrence_count || 8,
            recurrence_end_date: taskData.recurrence_end_date || null,
            subtasks: taskData.subtasks || [],
            comments: taskData.comments || [],
          })
          .select()
          .single()
        
        if (insertError) throw insertError
        taskId = newTask.id
        
        if (taskData.dependencies && taskData.dependencies.length > 0) {
          await supabase.from('task_dependencies').insert(
            taskData.dependencies.map(depId => ({ task_id: taskId, depends_on_id: depId }))
          )
        }
        
        // Create future occurrences for recurring tasks
        if (taskData.recurrence_type && taskData.start_date) {
          // Use user's settings: either count or end date
          const futureStartDates = taskData.recurrence_end_date
            ? generateFutureOccurrences(taskData.start_date, taskData.recurrence_type, 0, taskData.recurrence_end_date)
            : generateFutureOccurrences(taskData.start_date, taskData.recurrence_type, taskData.recurrence_count || 8)
          
          // Calculate due date offset if task has both start and due dates
          let dueDateOffset = null
          if (taskData.due_date && taskData.start_date) {
            dueDateOffset = new Date(taskData.due_date) - new Date(taskData.start_date)
          }
          
          const futureTasksToInsert = futureStartDates.map(futureStartDate => {
            let futureDueDate = null
            if (dueDateOffset !== null) {
              const dueDate = new Date(futureStartDate)
              dueDate.setTime(dueDate.getTime() + dueDateOffset)
              futureDueDate = dueDate.toISOString().split('T')[0]
            }
            
            return {
              title: taskData.title,
              description: taskData.description,
              project_id: taskData.project_id,
              status: 'backlog',
              critical: taskData.critical,
              start_date: futureStartDate,
              start_time: taskData.start_time || null,
              end_time: taskData.end_time || null,
              due_date: futureDueDate,
              assignee: taskData.assignee || null,
              time_estimate: taskData.time_estimate,
              energy_level: taskData.energy_level,
              category: taskData.category,
              source: taskData.source,
              source_link: taskData.source_link || null,
              customer: taskData.customer || null,
              notes: taskData.notes || null,
              recurrence_type: taskData.recurrence_type,
              recurrence_parent_id: taskId,
              subtasks: taskData.subtasks || [],
            }
          })
          
          if (futureTasksToInsert.length > 0) {
            const { error: recurError } = await supabase
              .from('tasks')
              .insert(futureTasksToInsert)
            
            if (recurError) console.error('Error creating future occurrences:', recurError)
          }
        }
      }

      for (const file of newFiles) {
        const filePath = `${user.id}/${taskId}/${Date.now()}_${file.name}`
        
        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file)
        
        if (uploadError) throw uploadError

        await supabase.from('attachments').insert({
          task_id: taskId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
        })
      }

      await fetchData()
      
      // Show notification
      const isNew = !taskData.id
      showNotification(isNew ? "✓ Task created" : "✓ Task saved")
    } catch (err) {
      console.error('Error saving task:', err)
      showError(
        err.message || 'Failed to save task',
        () => handleSaveTask(taskData, newFiles, existingAttachments),
        'Save failed'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (taskId, deleteAllRecurrences = false) => {
    const task = tasks.find(t => t.id === taskId)
    
    // Check if this is a recurring task and we haven't confirmed yet
    if (task && (task.recurrence_type || task.recurrence_parent_id) && !deleteAllRecurrences && !deleteRecurringConfirm) {
      // Show confirmation dialog
      setDeleteRecurringConfirm({
        taskId,
        title: task.title,
        parentId: task.recurrence_parent_id || task.id
      })
      return
    }
    
    setSaving(true)
    try {
      // If deleting all recurrences
      if (deleteAllRecurrences && task) {
        const parentId = task.recurrence_parent_id || task.id
        
        // Get all tasks in this recurrence series (including parent and all children)
        const tasksToDelete = tasks.filter(t => 
          t.id === parentId || t.recurrence_parent_id === parentId
        )
        
        // Delete attachments for all tasks
        for (const t of tasksToDelete) {
          const { data: attachments } = await supabase
            .from('attachments')
            .select('file_path')
            .eq('task_id', t.id)
          
          if (attachments?.length > 0) {
            await supabase.storage.from('attachments').remove(attachments.map(a => a.file_path))
          }
        }
        
        // Delete all tasks in the series
        const { error } = await supabase
          .from('tasks')
          .delete()
          .or(`id.eq.${parentId},recurrence_parent_id.eq.${parentId}`)
        
        if (error) throw error
        
        await fetchData()
        showNotification(`Deleted ${tasksToDelete.length} recurring tasks`)
      } else {
        // Just delete this single task
        const { data: attachments } = await supabase
          .from('attachments')
          .select('file_path')
          .eq('task_id', taskId)
        
        if (attachments?.length > 0) {
          await supabase.storage.from('attachments').remove(attachments.map(a => a.file_path))
        }

        const { error } = await supabase.from('tasks').delete().eq('id', taskId)
        if (error) throw error
        
        await fetchData()
        showNotification('Task deleted')
      }
    } catch (err) {
      console.error('Error deleting task:', err)
      showError(
        err.message || 'Failed to delete task',
        () => handleDeleteTask(taskId, deleteAllRecurrences),
        'Delete failed'
      )
    } finally {
      setSaving(false)
      setDeleteRecurringConfirm(null)
    }
  }

  // Quick Add - create task with just title and optional due date
  const handleQuickAdd = async (title, projectId, dueDate = null) => {
    if (!title.trim()) return
    
    const targetProject = projectId || projects[0]?.id
    if (!targetProject) return
    
    try {
      setSaving(true)
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          project_id: targetProject,
          status: 'backlog',
          due_date: dueDate,
          energy_level: 'medium',
          category: 'deliverable',
          source: 'ad_hoc'
        })
        .select()
        .single()
      
      if (error) throw error
      
      setTasks(prev => [...prev, { ...data, attachments: [], dependencies: [] }])
      setQuickAddTitle('')
      setQuickAddOpen(false)
    } catch (err) {
      console.error('Error creating task:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Update my_day_date for My Day feature
  const handleUpdateMyDayDate = async (taskId, myDayDate) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      const { error } = await supabase
        .from('tasks')
        .update({ my_day_date: myDayDate })
        .eq('id', taskId)
      
      if (error) throw error
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, my_day_date: myDayDate } : t
      ))
      
      // Show notification
      if (myDayDate && new Date(myDayDate).toDateString() === new Date().toDateString()) {
        showNotification(`☀️ Added "${task?.title}" to My Day`)
      }
    } catch (error) {
      console.error('Error updating my_day_date:', error)
    }
  }

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      
      // Note: Future recurring occurrences are pre-created when the task is saved,
      // so we don't need to create a new task here when marking done
      
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null
        })
        .eq('id', taskId)
      
      if (error) throw error
      
      const previousStatus = task?.status
      
      if (newStatus === 'done' && task?.recurrence_type) {
        await fetchData()
      } else {
        setTasks(tasks.map(t => t.id === taskId ? { 
          ...t, 
          status: newStatus,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null
        } : t))
      }
      
      // Show undo toast
      if (newStatus === 'done') {
        setUndoToast({
          taskId,
          previousStatus,
          taskTitle: task?.title,
        })
        // Auto-hide after 5 seconds
        setTimeout(() => setUndoToast(null), 5000)
      }
    } catch (err) {
      console.error('Error updating task status:', err)
      setError(err.message)
    }
  }
  
  // Quick set due date (for "Add to My Day" feature)
  const handleSetDueDate = async (taskId, dueDate) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ due_date: dueDate })
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, due_date: dueDate } : t))
    } catch (err) {
      console.error('Error setting due date:', err)
      setError(err.message)
    }
  }
  
  // Update task title (for inline editing)
  const handleUpdateTaskTitle = async (taskId, newTitle) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ title: newTitle })
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t))
    } catch (err) {
      console.error('Error updating task title:', err)
      setError(err.message)
    }
  }
  
  // Toggle task critical flag (for quick actions)
  const handleToggleCritical = async (taskId, critical) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ critical })
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, critical } : t))
      showNotification(critical ? "🚩 Marked as critical" : "✓ Critical flag removed")
    } catch (err) {
      console.error('Error toggling critical:', err)
      setError(err.message)
    }
  }
  
  // Calendar task update (for drag-drop scheduling)
  const handleCalendarTaskUpdate = async (taskId, updates) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, ...updates } : t))
    } catch (err) {
      console.error('Error updating task from calendar:', err)
      setError(err.message)
    }
  }

  const handleUndo = async () => {
    if (!undoToast) return
    try {
      await supabase.from('tasks').update({ status: undoToast.previousStatus }).eq('id', undoToast.taskId)
      setTasks(prev => prev.map(t => t.id === undoToast.taskId ? { ...t, status: undoToast.previousStatus } : t))
      setUndoToast(null)
    } catch (err) {
      console.error('Error undoing:', err)
      setError(err.message)
    }
  }

  // Drag and drop
  const handleDragStart = (e, task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }

  const handleDragOver = (e, columnId) => {
    e.preventDefault()
  }

  const handleDrop = (e, columnId) => {
    e.preventDefault()
    if (draggedTask && draggedTask.status !== columnId) {
      handleUpdateTaskStatus(draggedTask.id, columnId)
    }
    setDraggedTask(null)
  }

  // Filtering
  const allAssignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))]
  const allCustomers = [...new Set(tasks.map(t => t.customer).filter(Boolean))]
  
  // Check if any filters are active
  const hasActiveFilters = filterCritical || filterOverdue || filterBlocked || filterActive || filterBacklog || filterDueToday || filterMyDay || searchQuery.trim() || Object.keys(fieldFilters).length > 0
  
  // Clear all filters
  const clearFilters = () => {
    setFilterCritical(false)
    setFilterOverdue(false)
    setFilterBlocked(false)
    setFilterActive(false)
    setFilterBacklog(false)
    setFilterDueToday(false)
    setFilterMyDay(false)
    setSearchQuery('')
    setFieldFilters({})
    setPendingFilterField('')
  }
  
  // Saved Filter Views functions
  const saveCurrentView = (name) => {
    const view = {
      id: Date.now(),
      name,
      filters: {
        selectedProjectId,
        filterCritical,
        filterOverdue,
        filterBlocked,
        filterActive,
        filterBacklog,
        filterDueToday,
        filterMyDay,
        searchQuery,
        fieldFilters
      }
    }
    const updated = [...savedFilterViews, view]
    setSavedFilterViews(updated)
    localStorage.setItem('trackli_saved_views', JSON.stringify(updated))
    setShowSaveViewModal(false)
    setNewViewName('')
  }
  
  const applyFilterView = (view) => {
    setSelectedProjectId(view.filters.selectedProjectId || 'all')
    setFilterCritical(view.filters.filterCritical || false)
    setFilterOverdue(view.filters.filterOverdue || false)
    setFilterBlocked(view.filters.filterBlocked || false)
    setFilterActive(view.filters.filterActive || false)
    setFilterBacklog(view.filters.filterBacklog || false)
    setFilterDueToday(view.filters.filterDueToday || false)
    setFilterMyDay(view.filters.filterMyDay || false)
    setSearchQuery(view.filters.searchQuery || '')
    setFieldFilters(view.filters.fieldFilters || {})
  }
  
  const deleteFilterView = (viewId) => {
    const updated = savedFilterViews.filter(v => v.id !== viewId)
    setSavedFilterViews(updated)
    localStorage.setItem('trackli_saved_views', JSON.stringify(updated))
  }
  
  // Task Template functions
  const saveTaskTemplate = (template) => {
    const newTemplate = {
      id: Date.now(),
      name: template.name,
      title: template.title || '',
      description: template.description || '',
      project_id: template.project_id || '',
      category: template.category || 'deliverable',
      energy_level: template.energy_level || 'medium',
      time_estimate: template.time_estimate || '',
      source: template.source || 'ad_hoc',
      assignee: template.assignee || '',
      customer: template.customer || '',
      critical: template.critical || false,
      recurrence_type: template.recurrence_type || null,
      recurrence_count: template.recurrence_count || 8,
      subtasks: template.subtasks || [],
    }
    const updated = [...taskTemplates, newTemplate]
    setTaskTemplates(updated)
    localStorage.setItem('trackli_task_templates', JSON.stringify(updated))
    return newTemplate
  }
  
  const deleteTaskTemplate = (templateId) => {
    const updated = taskTemplates.filter(t => t.id !== templateId)
    setTaskTemplates(updated)
    localStorage.setItem('trackli_task_templates', JSON.stringify(updated))
  }

  const readyToStartCount = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    return isReadyToStart(t)
  }).length

  const filteredTasks = tasks.filter((t) => {
    // Hide tasks from archived projects (unless viewing archived projects)
    if (!showArchivedProjects && t.project_id) {
      const taskProject = projects.find(p => p.id === t.project_id)
      if (taskProject?.archived) return false
    }
    
    // Project filter
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    
    // Quick toggle filters
    if (filterCritical && !t.critical) return false
    if (filterOverdue && getDueDateStatus(t.due_date, t.status) !== 'overdue') return false
    if (filterBlocked && !isBlocked(t, tasks)) return false
    if (filterActive && !['todo', 'in_progress'].includes(t.status)) return false
    if (filterBacklog && t.status !== 'backlog') return false
    if (filterDueToday && getDueDateStatus(t.due_date, t.status) !== 'today') return false
    if (filterMyDay && !isInMyDay(t)) return false
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchesTitle = t.title?.toLowerCase().includes(query)
      const matchesDescription = t.description?.toLowerCase().includes(query)
      const matchesCustomer = t.customer?.toLowerCase().includes(query)
      const matchesAssignee = t.assignee?.toLowerCase().includes(query)
      const matchesProject = projects.find(p => p.id === t.project_id)?.name?.toLowerCase().includes(query)
      if (!matchesTitle && !matchesDescription && !matchesCustomer && !matchesAssignee && !matchesProject) return false
    }
    
    // Field filters (multiple)
    for (const [field, value] of Object.entries(fieldFilters)) {
      if (value === '__blank__') {
        // Filter for blank/empty values
        if (field === 'assignee' && t.assignee) return false
        if (field === 'customer' && t.customer) return false
        if (field === 'category' && t.category) return false
        if (field === 'energy_level' && t.energy_level) return false
        if (field === 'source' && t.source) return false
        if (field === 'due_date' && t.due_date) return false
      } else {
        // Filter for specific value
        if (field === 'assignee' && t.assignee !== value) return false
        if (field === 'customer' && t.customer !== value) return false
        if (field === 'category' && t.category !== value) return false
        if (field === 'energy_level' && t.energy_level !== value) return false
        if (field === 'source' && t.source !== value) return false
        if (field === 'due_date') {
          if (value === 'has_date' && !t.due_date) return false
        }
      }
    }
    
    // Legacy filters (if still used elsewhere)
    if (filterReadyToStart && !isReadyToStart(t)) return false
    if (filterTimeOperator !== 'all' && filterTimeValue) {
      const timeVal = parseInt(filterTimeValue)
      if (filterTimeOperator === 'lt' && (t.time_estimate || 0) >= timeVal) return false
      if (filterTimeOperator === 'gt' && (t.time_estimate || 0) <= timeVal) return false
    }
    return true
  })

  // Check if a task has a future start date (not ready to start yet)
  const hasFutureStartDate = (task) => {
    if (!task.start_date) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(task.start_date)
    start.setHours(0, 0, 0, 0)
    return start > today
  }

  // Sort tasks by priority: Critical > Due Date (soonest) > Energy Level > Created Date
  // For backlog: Future start date tasks go to the bottom
  const sortTasksByPriority = (tasks, isBacklog = false) => {
    const energyOrder = { high: 0, medium: 1, low: 2 }
    
    return [...tasks].sort((a, b) => {
      // For backlog: Push future start date tasks to the bottom
      if (isBacklog) {
        const aFuture = hasFutureStartDate(a)
        const bFuture = hasFutureStartDate(b)
        if (aFuture && !bFuture) return 1
        if (!aFuture && bFuture) return -1
      }
      
      // 1. Critical tasks first
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      
      // 2. Sort by due date (soonest first, no due date last)
      const aHasDue = !!a.due_date
      const bHasDue = !!b.due_date
      
      if (aHasDue && bHasDue) {
        const dateCompare = new Date(a.due_date) - new Date(b.due_date)
        if (dateCompare !== 0) return dateCompare
      } else if (aHasDue && !bHasDue) {
        return -1 // a has due date, b doesn't - a comes first
      } else if (!aHasDue && bHasDue) {
        return 1 // b has due date, a doesn't - b comes first
      }
      
      // 3. Sort by energy level (high > medium > low)
      const aEnergy = energyOrder[a.energy_level] ?? 1
      const bEnergy = energyOrder[b.energy_level] ?? 1
      if (aEnergy !== bEnergy) return aEnergy - bEnergy
      
      // 4. Sort by created date (oldest first)
      return new Date(a.created_at) - new Date(b.created_at)
    })
  }

  const getTasksByStatus = (status) => {
    const statusTasks = filteredTasks.filter((t) => t.status === status)
    
    // Done column: sort by completion date (most recent first)
    if (status === 'done') {
      return [...statusTasks].sort((a, b) => {
        const aCompleted = a.completed_at ? new Date(a.completed_at) : new Date(0)
        const bCompleted = b.completed_at ? new Date(b.completed_at) : new Date(0)
        return bCompleted - aCompleted // Descending (most recent first)
      })
    }
    
    // Other columns: use priority sorting
    return sortTasksByPriority(statusTasks, status === 'backlog')
  }

  // Stats
  const criticalCount = filteredTasks.filter((t) => t.critical && t.status !== 'done').length
  const overdueCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'overdue').length
  const dueTodayCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'today').length
  const blockedCount = filteredTasks.filter((t) => isBlocked(t, tasks) && t.status !== 'done').length
  const myDayCount = filteredTasks.filter((t) => isInMyDay(t)).length
  const totalEstimatedTime = filteredTasks.filter(t => t.status !== 'done').reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  
  // Streak calculation - days in a row with at least one completed task
  const calculateStreak = () => {
    const completedTasks = tasks.filter(t => t.status === 'done' && t.completed_at)
    if (completedTasks.length === 0) return 0
    
    // Group completions by date
    const completionDates = new Set(
      completedTasks.map(t => new Date(t.completed_at).toDateString())
    )
    
    // Count consecutive days going backwards from today
    let streak = 0
    let checkDate = new Date()
    checkDate.setHours(0, 0, 0, 0)
    
    while (completionDates.has(checkDate.toDateString())) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    }
    
    // If no completion today, check if yesterday had one (streak not broken yet)
    if (streak === 0) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      
      while (completionDates.has(yesterday.toDateString())) {
        streak++
        yesterday.setDate(yesterday.getDate() - 1)
      }
    }
    
    return streak
  }
  
  const currentStreak = calculateStreak()
  
  // Weekly stats
  const getWeeklyStats = () => {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    
    const completedThisWeek = tasks.filter(t => {
      if (t.status !== 'done' || !t.completed_at) return false
      const completedDate = new Date(t.completed_at)
      return completedDate >= weekAgo && completedDate <= now
    })
    
    return {
      count: completedThisWeek.length,
      time: completedThisWeek.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
    }
  }
  
  const weeklyStats = getWeeklyStats()
  
  // Today's progress
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completedToday = tasks.filter(t => 
    t.status === 'done' && 
    t.completed_at && 
    new Date(t.completed_at) >= todayStart
  ).length
  const todaysDueTasks = tasks.filter(t => 
    t.due_date === new Date().toISOString().split('T')[0] && 
    t.status !== 'done'
  ).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          {/* Animated Logo */}
          <div className="relative mb-6">
            <div className="w-20 h-20 mx-auto">
              <svg viewBox="0 0 56 56" fill="none" className="w-full h-full drop-shadow-xl">
                <defs>
                  <linearGradient id="loading-left" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4F46E5"/>
                    <stop offset="100%" stopColor="#7C3AED"/>
                  </linearGradient>
                  <linearGradient id="loading-right" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9333EA"/>
                    <stop offset="100%" stopColor="#EC4899"/>
                  </linearGradient>
                </defs>
                <path d="M6 18L28 6L28 38L6 26Z" fill="url(#loading-left)"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="url(#loading-right)"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="#DDD6FE"/>
                <path d="M18 20L25 27L38 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 animate-ping opacity-20" />
          </div>
          
          {/* Brand name */}
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Trackli
          </h1>
          
          {/* Loading text */}
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Loading your tasks...
          </p>
        </div>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={fetchData}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 transition-colors duration-200">
      {/* Offline Banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656m-7.072 7.072a9 9 0 010-12.728m3.536 3.536a4 4 0 010 5.656" />
            </svg>
            You're offline — changes won't sync until you reconnect
          </span>
        </div>
      )}
      
      {/* Enhanced Error Toast with Retry */}
      {errorToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 shadow-lg animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{errorToast.details || 'Error'}</p>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{errorToast.message}</p>
              {errorToast.retryAction && (
                <button
                  onClick={() => {
                    setErrorToast(null)
                    errorToast.retryAction()
                  }}
                  className="mt-2 px-3 py-1 bg-red-100 dark:bg-red-800/50 hover:bg-red-200 dark:hover:bg-red-800 text-red-700 dark:text-red-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
            <button onClick={() => setErrorToast(null)} className="p-2 sm:p-1 hover:bg-red-100 dark:hover:bg-red-800/50 rounded-lg transition-colors touch-manipulation">
              <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl px-4 py-3 shadow-lg flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <svg className="w-5 h-5 text-emerald-400 dark:text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">"{undoToast.taskTitle}" marked as done</span>
          <button
            onClick={handleUndo}
            className="px-3 py-1 bg-white/20 dark:bg-gray-900/20 hover:bg-white/30 dark:hover:bg-gray-900/30 rounded-lg text-sm font-semibold transition-colors"
          >
            Undo
          </button>
          <button
            onClick={() => setUndoToast(null)}
            className="p-2 sm:p-1 hover:bg-white/20 dark:hover:bg-gray-900/20 rounded-lg transition-colors touch-manipulation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 left-6 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5">
          {notification.type === 'success' ? (
            <svg className="w-5 h-5 text-emerald-400 dark:text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-blue-400 dark:text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="p-2 sm:p-1 hover:bg-white/20 dark:hover:bg-gray-900/20 rounded-lg transition-colors touch-manipulation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-40">
        {/* Main Header Row */}
        <div className="max-w-full mx-auto px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            {/* Left: Menu Button */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setNavMenuOpen(!navMenuOpen)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                  title="Menu"
                >
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                
                {/* Nav Dropdown Menu - Slide in drawer on mobile */}
                {navMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[999] bg-black/60 sm:bg-black/20 animate-fadeIn" onClick={() => setNavMenuOpen(false)} />
                    <div 
                      className="fixed sm:absolute top-0 sm:top-full left-0 h-screen sm:h-auto w-72 sm:w-56 sm:mt-2 sm:rounded-xl shadow-2xl border-r sm:border border-gray-200 dark:border-gray-700 py-2 z-[1000] animate-slideInFromLeft sm:animate-none overflow-y-auto"
                      style={{ backgroundColor: darkMode ? '#1f2937' : '#ffffff' }}
                    >
                      {/* Mobile header */}
                      <div className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">Menu</span>
                        <button
                          onClick={() => setNavMenuOpen(false)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg touch-manipulation"
                        >
                          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Views</div>
                      <button
                        onClick={() => { setCurrentView('myday'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'myday' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">☀️</span>
                        <span className="font-medium">My Day</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}D</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('board'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'board' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📋</span>
                        <span className="font-medium">Board</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}B</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('calendar'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">🗓</span>
                        <span className="font-medium">Calendar</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}L</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('tasks'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'tasks' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">🗃️</span>
                        <span className="font-medium">All Tasks</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}A</span>
                      </button>
                      
                      <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Manage</div>
                      <button
                        onClick={() => { setCurrentView('projects'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'projects' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📁</span>
                        <span className="font-medium">Projects</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('progress'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'progress' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📊</span>
                        <span className="font-medium">Progress</span>
                      </button>
                      
                      {/* Mobile-only options */}
                      <div className="sm:hidden">
                        <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                        <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Settings</div>
                        <button
                          onClick={() => { setDarkMode(!darkMode) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <span className="text-lg">{darkMode ? '☀️' : '🌙'}</span>
                          <span className="font-medium">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
                            setExtractedTasks([])
                            setShowExtractedTasks(false)
                            setMeetingNotesModalOpen(true)
                            setNavMenuOpen(false)
                          }}
                          disabled={projects.length === 0}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          <span className="text-lg">📝</span>
                          <span className="font-medium">Import Notes</span>
                        </button>
                        <button
                          onClick={() => { setFeedbackModalOpen(true); setNavMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 sm:hidden"
                        >
                          <span className="text-lg">💬</span>
                          <span className="font-medium">Send Feedback</span>
                        </button>
                        <button
                          onClick={() => { setSettingsModalOpen(true); setNavMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <span className="text-lg">⚙️</span>
                          <span className="font-medium">Settings</span>
                        </button>
                        <button
                          onClick={() => { signOut(); setNavMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <span className="text-lg">🚪</span>
                          <span className="font-medium">Sign Out</span>
                        </button>
                        {/* Bottom padding for safe area */}
                        <div className="h-8" />
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Current view indicator */}
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {currentView === 'myday' ? '☀️ My Day' : currentView === 'board' ? '📋 Board' : currentView === 'calendar' ? '🗓 Calendar' : currentView === 'tasks' ? '🗃️ All Tasks' : currentView === 'progress' ? '📊 Progress' : '📁 Projects'}
              </span>
            </div>
            
            {/* Center: Logo */}
            {/* Mobile: Small icon + name */}
            <div className="flex sm:hidden items-center gap-2">
              <div className="w-9 h-9">
                <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="mobile-left" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4F46E5"/>
                      <stop offset="100%" stopColor="#7C3AED"/>
                    </linearGradient>
                    <linearGradient id="mobile-right" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#9333EA"/>
                      <stop offset="100%" stopColor="#EC4899"/>
                    </linearGradient>
                  </defs>
                  <path d="M6 18L28 6L28 38L6 26Z" fill="url(#mobile-left)"/>
                  <path d="M28 6L50 18L50 46L28 38Z" fill="url(#mobile-right)"/>
                  <path d="M6 18L28 6L50 18L28 30Z" fill="#DDD6FE"/>
                  <path d="M18 20L25 27L38 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-base font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Trackli
              </span>
            </div>
            {/* Desktop: Centered logo */}
            <div className="absolute left-1/2 transform -translate-x-1/2 hidden xl:flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10">
                <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="desktop-left" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4F46E5"/>
                      <stop offset="100%" stopColor="#7C3AED"/>
                    </linearGradient>
                    <linearGradient id="desktop-right" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#9333EA"/>
                      <stop offset="100%" stopColor="#EC4899"/>
                    </linearGradient>
                  </defs>
                  <path d="M6 18L28 6L28 38L6 26Z" fill="url(#desktop-left)"/>
                  <path d="M28 6L50 18L50 46L28 38Z" fill="url(#desktop-right)"/>
                  <path d="M6 18L28 6L50 18L28 30Z" fill="#DDD6FE"/>
                  <path d="M18 20L25 27L38 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1 className="hidden sm:block text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Trackli
              </h1>
            </div>
            
            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Utility buttons - icon only */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
                title={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              
              {currentView === 'board' && (
                <button
                  onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedTaskIds(new Set()) }}
                  className={`hidden sm:block p-2 rounded-xl transition-colors ${bulkSelectMode ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                  title="Bulk select"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </button>
              )}
              
              <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
              
              {/* Action buttons */}
              <button
                onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
                className="hidden sm:flex px-2 sm:px-3 py-1.5 sm:py-2 bg-teal-500 text-white rounded-lg sm:rounded-xl hover:bg-teal-600 transition-colors text-sm font-medium items-center gap-1.5"
                title="⌘P"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline"><u>P</u>roject</span>
              </button>
              
              <button
                onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}
                disabled={projects.length === 0}
                className="hidden sm:flex px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg sm:rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium items-center gap-1.5 shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                title={`${shortcutModifier}T`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline"><u>T</u>ask</span>
              </button>
              
              <button
                onClick={() => {
                  setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
                  setExtractedTasks([])
                  setShowExtractedTasks(false)
                  setMeetingNotesModalOpen(true)
                }}
                disabled={projects.length === 0}
                className="hidden sm:flex px-3 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium items-center gap-1.5 disabled:opacity-50"
                title="Import Meeting Notes (⌘N)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Notes</span>
              </button>
              
              <button
                onClick={() => setHelpModalOpen(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
                title="Help Guide"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              {/* Admin Feedback Button - only visible to admin */}
              {user?.email === ADMIN_EMAIL && (
                <button
                  onClick={() => setAdminPanelOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
                  title="View Feedback"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </button>
              )}
              
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              
              <button
                onClick={signOut}
                className="hidden sm:block p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
                title="Sign Out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        {/* Unified Filter Bar - only on board view */}
        {currentView === 'board' && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-3 sm:px-6 py-2">
            {/* Mobile Filter Bar */}
            <div className="sm:hidden flex items-center gap-2">
              {/* Project dropdown */}
              <div className="relative flex-1">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full appearance-none pl-3 pr-7 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">📁 All Projects</option>
                  {projects.filter(p => !p.archived || showArchivedProjects).map((p) => (
                    <option key={p.id} value={p.id}>{p.archived ? '📦 ' : '📁 '}{p.name}</option>
                  ))}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {/* Filter button */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className={`relative p-2.5 rounded-xl border transition-all ${
                  hasActiveFilters
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {Object.keys(fieldFilters).length + (filterCritical ? 1 : 0) + (filterDueToday ? 1 : 0) + (filterOverdue ? 1 : 0) + (filterMyDay ? 1 : 0)}
                  </span>
                )}
              </button>
              
              {/* Search button */}
              <button
                onClick={() => setSearchModalOpen(true)}
                className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
            
            {/* Mobile Filter Sheet - Portal */}
            {mobileFiltersOpen && createPortal(
              <div className="sm:hidden fixed inset-0 z-[9999]">
                <div className="fixed inset-0 bg-black/50" onClick={() => setMobileFiltersOpen(false)} />
                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Filters</h3>
                    <button onClick={() => setMobileFiltersOpen(false)} className="p-2 text-gray-500 hover:text-gray-700">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Quick Filters */}
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Quick Filters</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFilterCritical(!filterCritical)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterCritical ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        🚩 Critical ({criticalCount})
                      </button>
                      <button
                        onClick={() => setFilterDueToday(!filterDueToday)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterDueToday ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        Today ({dueTodayCount})
                      </button>
                      <button
                        onClick={() => setFilterOverdue(!filterOverdue)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterOverdue ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        Overdue ({overdueCount})
                      </button>
                      <button
                        onClick={() => setFilterMyDay(!filterMyDay)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterMyDay ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        ☀️ My Day ({myDayCount})
                      </button>
                    </div>
                  </div>
                  
                  {/* Field Filters */}
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Filter by Field</p>
                    <div className="space-y-2">
                      {/* Assignee */}
                      <select
                        value={fieldFilters.assignee || ''}
                        onChange={(e) => setFieldFilters(e.target.value ? { ...fieldFilters, assignee: e.target.value } : (({ assignee, ...rest }) => rest)(fieldFilters))}
                        className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                      >
                        <option value="">Assignee: All</option>
                        <option value="__blank__">Assignee: (Blank)</option>
                        {[...new Set(tasks.map(t => t.assignee).filter(Boolean))].sort().map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      
                      {/* Customer */}
                      <select
                        value={fieldFilters.customer || ''}
                        onChange={(e) => setFieldFilters(e.target.value ? { ...fieldFilters, customer: e.target.value } : (({ customer, ...rest }) => rest)(fieldFilters))}
                        className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                      >
                        <option value="">Customer: All</option>
                        <option value="__blank__">Customer: (Blank)</option>
                        {[...new Set(tasks.map(t => t.customer).filter(Boolean))].sort().map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      
                      {/* Category */}
                      <select
                        value={fieldFilters.category || ''}
                        onChange={(e) => setFieldFilters(e.target.value ? { ...fieldFilters, category: e.target.value } : (({ category, ...rest }) => rest)(fieldFilters))}
                        className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                      >
                        <option value="">Category: All</option>
                        {CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      
                      {/* Effort */}
                      <select
                        value={fieldFilters.energy_level || ''}
                        onChange={(e) => setFieldFilters(e.target.value ? { ...fieldFilters, energy_level: e.target.value } : (({ energy_level, ...rest }) => rest)(fieldFilters))}
                        className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                      >
                        <option value="">Effort: All</option>
                        <option value="high">High Effort</option>
                        <option value="medium">Medium Effort</option>
                        <option value="low">Low Effort</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2">
                    {hasActiveFilters && (
                      <button
                        onClick={() => { clearFilters(); setMobileFiltersOpen(false); }}
                        className="flex-1 p-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      onClick={() => setMobileFiltersOpen(false)}
                      className="flex-1 p-3 bg-indigo-500 text-white rounded-xl text-sm font-medium"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            , document.body)}
            
            {/* Desktop Filter Bar */}
            <div className="hidden sm:flex items-center gap-2 sm:gap-3 min-w-max overflow-x-auto">
              {/* Project dropdown */}
              <div className="relative">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <option value="all">📁 All Projects</option>
                  {projects.filter(p => !p.archived || showArchivedProjects).map((p) => (
                    <option key={p.id} value={p.id}>{p.archived ? '📦 ' : '📁 '}{p.name}</option>
                  ))}
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
              
              {/* Quick Filters - compact pills */}
              <div className="flex items-center gap-1.5">
                {/* Critical */}
                <button
                  onClick={() => setFilterCritical(!filterCritical)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filterCritical
                      ? 'bg-red-500 text-white shadow-sm'
                      : criticalCount > 0 
                        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span>🚩</span>
                  <span className="hidden sm:inline">Critical</span>
                  {(filterCritical || criticalCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterCritical ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/50'}`}>{criticalCount}</span>
                  )}
                </button>
                
                {/* Due Today */}
                <button
                  onClick={() => setFilterDueToday(!filterDueToday)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filterDueToday
                      ? 'bg-orange-500 text-white shadow-sm'
                      : dueTodayCount > 0
                        ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span className="hidden sm:inline">Due Today</span>
                  <span className="sm:hidden">Today</span>
                  {(filterDueToday || dueTodayCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterDueToday ? 'bg-white/20' : 'bg-orange-100 dark:bg-orange-900/50'}`}>{dueTodayCount}</span>
                  )}
                </button>
                
                {/* Overdue */}
                <button
                  onClick={() => setFilterOverdue(!filterOverdue)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filterOverdue
                      ? 'bg-red-600 text-white shadow-sm'
                      : overdueCount > 0
                        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span>Overdue</span>
                  {(filterOverdue || overdueCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterOverdue ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/50'}`}>{overdueCount}</span>
                  )}
                </button>
                
                {/* My Day */}
                <button
                  onClick={() => setFilterMyDay(!filterMyDay)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filterMyDay
                      ? 'bg-amber-500 text-white shadow-sm'
                      : myDayCount > 0
                        ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span>☀️</span>
                  <span className="hidden sm:inline">My Day</span>
                  {(filterMyDay || myDayCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterMyDay ? 'bg-white/20' : 'bg-amber-100 dark:bg-amber-900/50'}`}>{myDayCount}</span>
                  )}
                </button>
              </div>
              
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
              
              {/* Field Filters */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.entries(fieldFilters).map(([field, value]) => {
                  const fieldLabels = { assignee: 'Assignee', customer: 'Customer', category: 'Category', energy_level: 'Effort', source: 'Source', due_date: 'Due Date' }
                  let displayValue = value
                  if (value === '__blank__') displayValue = '(Blank)'
                  else if (field === 'category') displayValue = CATEGORIES.find(c => c.id === value)?.label || value
                  else if (field === 'energy_level') displayValue = value === 'high' ? 'High' : value === 'medium' ? 'Medium' : 'Low'
                  else if (field === 'source') displayValue = SOURCES.find(s => s.id === value)?.label || value
                  else if (field === 'due_date' && value === 'has_date') displayValue = 'Has Date'
                  
                  return (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded text-xs font-medium"
                    >
                      {fieldLabels[field]}: {displayValue}
                      <button
                        onClick={() => {
                          const updated = { ...fieldFilters }
                          delete updated[field]
                          setFieldFilters(updated)
                        }}
                        className="ml-0.5 hover:text-indigo-900 dark:hover:text-indigo-100"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )
                })}
                
                {/* Add filter dropdown */}
                <div className="relative">
                  <select
                    value={pendingFilterField}
                    onChange={(e) => setPendingFilterField(e.target.value)}
                    className="appearance-none pl-2 pr-5 py-1 bg-transparent border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <option value="">+ Filter</option>
                    {!fieldFilters.assignee && <option value="assignee">Assignee</option>}
                    {!fieldFilters.customer && <option value="customer">Customer</option>}
                    {!fieldFilters.category && <option value="category">Category</option>}
                    {!fieldFilters.energy_level && <option value="energy_level">Effort</option>}
                    {!fieldFilters.source && <option value="source">Source</option>}
                    {!fieldFilters.due_date && <option value="due_date">Due Date</option>}
                  </select>
                  <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              <div className="flex-1" />
              
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-32 sm:w-40 pl-7 pr-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-transparent focus:bg-white dark:focus:bg-gray-700 transition-colors"
                />
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              {/* Clear All / Archived toggle */}
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </button>
                )}
                <label className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showArchivedProjects}
                    onChange={(e) => setShowArchivedProjects(e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Archived
                </label>
              </div>
              
              {/* Saved Views */}
              {savedFilterViews.length > 0 && (
                <div className="relative border-l border-gray-200 dark:border-gray-700 pl-2">
                  <select
                    onChange={(e) => {
                      const view = savedFilterViews.find(v => v.id === parseInt(e.target.value))
                      if (view) applyFilterView(view)
                      e.target.value = ''
                    }}
                    className="appearance-none pl-2 pr-5 py-1 bg-transparent border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600"
                  >
                    <option value="">📑 Views</option>
                    {savedFilterViews.map(view => (
                      <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                  </select>
                  <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              )}
              {hasActiveFilters && (
                <button
                  onClick={() => setShowSaveViewModal(true)}
                  className="p-2 sm:p-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 touch-manipulation"
                  title="Save current filters as a view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

                  {/* Empty State */}
      {projects.length === 0 && (
        <div className="max-w-md mx-auto mt-12 sm:mt-20 text-center px-6">
          <div className="w-24 h-24 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">Welcome to Trackli!</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base sm:text-base">Get started by creating your first project.</p>
          <button
            onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
            className="w-full sm:w-auto px-8 py-4 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25 text-lg sm:text-base active:scale-95"
          >
            Create Your First Project
          </button>
        </div>
      )}

      {/* Main Content */}
      {projects.length > 0 && (
        <>
          {/* Bulk Action Toolbar */}
          {bulkSelectMode && (
            <div className="sticky top-[73px] z-30 bg-indigo-600 dark:bg-indigo-700 border-b border-indigo-500">
              <div className="max-w-full mx-auto px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => { setBulkSelectMode(false); setSelectedTaskIds(new Set()) }}
                      className="p-1.5 hover:bg-indigo-500 rounded-lg transition-colors text-white"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <span className="text-white font-medium">
                      {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={selectAllTasks}
                      className="text-sm text-indigo-200 hover:text-white transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={deselectAllTasks}
                      className="text-sm text-indigo-200 hover:text-white transition-colors"
                    >
                      Deselect all
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => e.target.value && handleBulkStatusChange(e.target.value)}
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Status...</option>
                      <option value="backlog">Backlog</option>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <select
                      onChange={(e) => e.target.value && handleBulkMoveToProject(e.target.value)}
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Project...</option>
                      {projects.filter(p => !p.archived).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      onChange={(e) => handleBulkAssign(e.target.value)}
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent [&>option]:bg-gray-800 [&>option]:text-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Assign...</option>
                      <option value="">Unassign</option>
                      {allAssignees.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleBulkToggleCritical}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white rounded-lg text-sm font-medium transition-colors"
                      title="Toggle critical flag"
                    >
                      🚩 Critical
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {currentView === 'myday' && (
            <div key="myday" className="animate-fadeIn">
              <MyDayDashboard
                tasks={tasks.filter(t => !t.project_id || !projects.find(p => p.id === t.project_id)?.archived)}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                allTasks={tasks.filter(t => !t.project_id || !projects.find(p => p.id === t.project_id)?.archived)}
                onQuickStatusChange={handleUpdateTaskStatus}
                onUpdateMyDayDate={handleUpdateMyDayDate}
                showConfettiPref={showConfetti}
              />
            </div>
          )}
          
          {currentView === 'calendar' && (
            <div key="calendar" className="animate-fadeIn">
              <CalendarView
                tasks={tasks.filter(t => !t.project_id || !projects.find(p => p.id === t.project_id)?.archived)}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                onCreateTask={(prefill) => { setEditingTask(prefill); setTaskModalOpen(true) }}
                allTasks={tasks.filter(t => !t.project_id || !projects.find(p => p.id === t.project_id)?.archived)}
                onUpdateTask={handleCalendarTaskUpdate}
                onDeleteTask={handleDeleteTask}
                viewMode={calendarViewMode}
                setViewMode={setCalendarViewMode}
                onShowConfirm={setConfirmDialog}
              />
            </div>
          )}
          
          {currentView === 'tasks' && (
            <div key="tasks" className="animate-fadeIn h-[calc(100vh-140px)]">
              <TaskTableView
                tasks={tasks}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                allTasks={tasks}
              />
            </div>
          )}
          
          {currentView === 'projects' && (
            <main key="projects" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fadeIn">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">Projects</h2>
                <button
                  onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium flex items-center gap-2 text-sm sm:text-base"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Project
                </button>
              </div>
              
              {/* Active Projects */}
              <div className="mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 sm:mb-4">Active Projects ({projects.filter(p => !p.archived).length})</h3>
                <div className="space-y-3">
                  {projects.filter(p => !p.archived).map(project => {
                    const projectTasks = tasks.filter(t => t.project_id === project.id)
                    const doneTasks = projectTasks.filter(t => t.status === 'done').length
                    const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0
                    
                    return (
                      <div key={project.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                        {/* Mobile: Stack vertically, Desktop: Side by side */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between sm:justify-start gap-2">
                              <h4 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{project.name}</h4>
                              {/* Mobile: Edit button inline with title */}
                              <button
                                onClick={() => { setEditingProject(project); setProjectModalOpen(true) }}
                                className="sm:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-manipulation"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
                            {/* Stats row - wrap on mobile */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                              <span>{projectTasks.length} tasks</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{project.members?.length || 0} members</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{project.customers?.length || 0} customers</span>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-3 flex items-center gap-3">
                              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 text-right">{progress}%</span>
                            </div>
                          </div>
                          {/* Action buttons - full width on mobile */}
                          <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700">
                            <button
                              onClick={() => { setSelectedProjectId(project.id); setCurrentView('board') }}
                              className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors font-medium touch-manipulation"
                            >
                              View Board
                            </button>
                            {/* Desktop only: edit and archive buttons */}
                            <button
                              onClick={() => { setEditingProject(project); setProjectModalOpen(true) }}
                              className="hidden sm:block p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                const projectTasks = tasks.filter(t => t.project_id === project.id && t.status !== 'done')
                                setConfirmDialog({
                                  title: 'Archive Project',
                                  message: `Archive "${project.name}"?${projectTasks.length > 0 ? ` This will hide ${projectTasks.length} active task${projectTasks.length === 1 ? '' : 's'} from the board.` : ''} You can unarchive it later.`,
                                  confirmLabel: 'Archive',
                                  confirmStyle: 'warning',
                                  icon: '📦',
                                  onConfirm: () => handleArchiveProject(project.id)
                                })
                              }}
                              className="p-2 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors touch-manipulation"
                              title="Archive project"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {projects.filter(p => !p.archived).length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">📁</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">No active projects yet</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create your first project to organize your tasks</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Archived Projects */}
              {projects.filter(p => p.archived).length > 0 && (
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 sm:mb-4">Archived ({projects.filter(p => p.archived).length})</h3>
                  <div className="space-y-3">
                    {projects.filter(p => p.archived).map(project => {
                      const projectTasks = tasks.filter(t => t.project_id === project.id)
                      
                      return (
                        <div key={project.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 opacity-75">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">📦</span>
                                <h4 className="font-semibold text-gray-600 dark:text-gray-400 truncate">{project.name}</h4>
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 ml-7">{projectTasks.length} tasks</p>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200 dark:border-gray-700">
                              <button
                                onClick={() => handleArchiveProject(project.id)}
                                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors font-medium touch-manipulation"
                              >
                                Unarchive
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    title: 'Delete Project',
                                    message: `Delete "${project.name}" and all its tasks? This cannot be undone.`,
                                    confirmLabel: 'Delete Project',
                                    confirmStyle: 'danger',
                                    icon: '🗑️',
                                    onConfirm: () => {
                                      handleDeleteProject(project.id)
                                      setConfirmDialog(null)
                                    }
                                  })
                                }}
                                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors touch-manipulation"
                                title="Delete permanently"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </main>
          )}
          
          {currentView === 'progress' && (
            <main className="max-w-4xl mx-auto px-6 py-8 animate-fadeIn">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">📊 Progress Dashboard</h2>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🔥</span>
                    <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">{currentStreak}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Day Streak</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">✅</span>
                    <span className="text-3xl font-bold text-green-600 dark:text-green-400">{completedToday}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Completed Today</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🗓</span>
                    <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{weeklyStats.count}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This Week</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">⏱️</span>
                    <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">{formatTimeEstimate(weeklyStats.time) || '0h'}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Time This Week</p>
                </div>
              </div>
              
              {/* Weekly Activity Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Last 7 Days</h3>
                <div className="flex items-end justify-between gap-2 h-32">
                  {(() => {
                    const days = []
                    for (let i = 6; i >= 0; i--) {
                      const date = new Date()
                      date.setDate(date.getDate() - i)
                      date.setHours(0, 0, 0, 0)
                      const dateStr = date.toDateString()
                      const dayName = date.toLocaleDateString(undefined, { weekday: 'short' })
                      const count = tasks.filter(t => 
                        t.status === 'done' && 
                        t.completed_at && 
                        new Date(t.completed_at).toDateString() === dateStr
                      ).length
                      days.push({ dayName, count, isToday: i === 0 })
                    }
                    const maxCount = Math.max(...days.map(d => d.count), 1)
                    
                    return days.map((day, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                          <div 
                            className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                              day.isToday 
                                ? 'bg-gradient-to-t from-indigo-500 to-purple-500' 
                                : 'bg-indigo-200 dark:bg-indigo-800'
                            }`}
                            style={{ height: `${Math.max((day.count / maxCount) * 100, 8)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${
                          day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {day.dayName}
                        </span>
                        <span className={`text-xs ${
                          day.isToday ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {day.count}
                        </span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
              
              {/* Project Progress */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Project Progress</h3>
                <div className="space-y-4">
                  {projects.filter(p => !p.archived).map(project => {
                    const projectTasks = tasks.filter(t => t.project_id === project.id)
                    const doneTasks = projectTasks.filter(t => t.status === 'done').length
                    const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0
                    
                    return (
                      <div key={project.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{project.name}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">{doneTasks}/{projectTasks.length} tasks</span>
                        </div>
                        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Recent Completions */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Recently Completed</h3>
                <div className="space-y-3">
                  {tasks
                    .filter(t => t.status === 'done' && t.completed_at)
                    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
                    .slice(0, 10)
                    .map(task => {
                      const project = projects.find(p => p.id === task.project_id)
                      const completedDate = new Date(task.completed_at)
                      const isToday = completedDate.toDateString() === new Date().toDateString()
                      
                      return (
                        <div key={task.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <span className="text-green-500">✓</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-700 dark:text-gray-300 truncate">{task.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{project?.name}</p>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {isToday ? 'Today' : formatDate(task.completed_at)}
                          </span>
                        </div>
                      )
                    })
                  }
                  {tasks.filter(t => t.status === 'done').length === 0 && (
                    <div className="text-center py-10 sm:py-8">
                      <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl sm:text-xl">💪</span>
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 text-base sm:text-sm">No completed tasks yet</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Get started!</p>
                    </div>
                  )}
                </div>
              </div>
            </main>
          )}
          
          {currentView === 'board' && (
            <main className="flex-1 px-3 sm:px-6 py-4 sm:py-6 animate-fadeIn">
              {/* Inset board container */}
              <div className="bg-gray-50/80 dark:bg-gray-900/50 rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-inner p-3 sm:p-4">
                {/* Mobile Column Navigation - Swipe Style */}
                {isMobile && (
                  <div className="flex flex-col items-center mb-4">
                    {/* Main navigation row */}
                    <div className="flex items-center justify-between w-full">
                      <button
                        onClick={() => setMobileColumnIndex(Math.max(0, mobileColumnIndex - 1))}
                        disabled={mobileColumnIndex === 0}
                        className="p-2.5 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                      >
                        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      
                      {/* Current column display */}
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLUMNS[mobileColumnIndex].color }} />
                          <span className="text-lg font-semibold text-gray-800 dark:text-white">
                            {COLUMNS[mobileColumnIndex].title}
                          </span>
                          <span className="px-2 py-0.5 text-sm font-medium bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full shadow-sm">
                            {getTasksByStatus(COLUMNS[mobileColumnIndex].id).length}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setMobileColumnIndex(Math.min(COLUMNS.length - 1, mobileColumnIndex + 1))}
                        disabled={mobileColumnIndex === COLUMNS.length - 1}
                        className="p-2.5 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                      >
                        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Dot indicators */}
                    <div className="flex items-center gap-2 mt-3">
                      {COLUMNS.map((col, idx) => (
                        <button
                          key={col.id}
                          onClick={() => setMobileColumnIndex(idx)}
                          className={`transition-all duration-200 ${idx === mobileColumnIndex ? 'w-6 h-2 rounded-full' : 'w-2 h-2 rounded-full'}`}
                          style={{ backgroundColor: idx === mobileColumnIndex ? col.color : '#D1D5DB' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              
              {/* Desktop: All columns | Mobile: Single column */}
              <div className={isMobile ? '' : 'flex gap-3 sm:gap-4 lg:gap-6 overflow-x-auto overflow-y-visible pb-4 sm:pb-6 justify-center'}>
                {isMobile ? (
                  <Column
                    key={COLUMNS[mobileColumnIndex].id}
                    column={COLUMNS[mobileColumnIndex]}
                    tasks={getTasksByStatus(COLUMNS[mobileColumnIndex].id)}
                    projects={projects}
                    onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    showProject={selectedProjectId === 'all'}
                    allTasks={tasks}
                    onQuickComplete={handleUpdateTaskStatus}
                    onStatusChange={handleUpdateTaskStatus}
                    onSetDueDate={handleSetDueDate}
                    bulkSelectMode={bulkSelectMode}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelect={(taskId) => {
                      const newSet = new Set(selectedTaskIds)
                      if (newSet.has(taskId)) {
                        newSet.delete(taskId)
                      } else {
                        newSet.add(taskId)
                      }
                      setSelectedTaskIds(newSet)
                    }}
                    onAddTask={(status) => {
                      setEditingTask({ status })
                      setTaskModalOpen(true)
                    }}
                    onToggleMyDay={(taskId, addToMyDay) => {
                      const todayStr = new Date().toISOString().split('T')[0]
                      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
                      handleUpdateMyDayDate(taskId, addToMyDay ? todayStr : yesterdayStr)
                    }}
                    isMobileFullWidth={true}
                    draggedTask={draggedTask}
                    onUpdateTitle={handleUpdateTaskTitle}
                    onToggleCritical={handleToggleCritical}
                  />
                ) : (
                  COLUMNS.map((column) => (
                    <Column
                      key={column.id}
                      column={column}
                      tasks={getTasksByStatus(column.id)}
                      projects={projects}
                      onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      showProject={selectedProjectId === 'all'}
                      allTasks={tasks}
                      onQuickComplete={handleUpdateTaskStatus}
                      onStatusChange={handleUpdateTaskStatus}
                      onSetDueDate={handleSetDueDate}
                      bulkSelectMode={bulkSelectMode}
                      selectedTaskIds={selectedTaskIds}
                      onToggleSelect={(taskId) => {
                        const newSet = new Set(selectedTaskIds)
                        if (newSet.has(taskId)) {
                          newSet.delete(taskId)
                        } else {
                          newSet.add(taskId)
                        }
                        setSelectedTaskIds(newSet)
                      }}
                      onAddTask={(status) => {
                        setEditingTask({ status })
                        setTaskModalOpen(true)
                      }}
                      onToggleMyDay={(taskId, addToMyDay) => {
                        const todayStr = new Date().toISOString().split('T')[0]
                        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
                        handleUpdateMyDayDate(taskId, addToMyDay ? todayStr : yesterdayStr)
                      }}
                      draggedTask={draggedTask}
                      onUpdateTitle={handleUpdateTaskTitle}
                      onToggleCritical={handleToggleCritical}
                    />
                  ))
                )}
              </div>
              
              {/* Recently Completed Section */}
              <RecentlyCompleted 
                tasks={tasks.filter(t => t.status === 'done' && t.completed_at).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 5)}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                onUndoComplete={(taskId) => handleUpdateTaskStatus(taskId, 'todo')}
              />
              </div>
            </main>
          )}
        </>
      )}

      {/* Modals */}
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        task={editingTask?.id ? tasks.find(t => t.id === editingTask.id) || editingTask : editingTask}
        projects={projects}
        allTasks={tasks}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        loading={saving}
        templates={taskTemplates}
        onSaveTemplate={saveTaskTemplate}
        onDeleteTemplate={deleteTaskTemplate}
        onShowConfirm={setConfirmDialog}
      />
      
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => { setProjectModalOpen(false); setEditingProject(null) }}
        project={editingProject}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
        onArchive={handleArchiveProject}
        loading={saving}
        onShowConfirm={setConfirmDialog}
      />
      
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        tasks={tasks}
        projects={projects}
        onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
        allTasks={tasks}
      />
      

      
      {/* Welcome Modal for New Users */}
      {showWelcomeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <span className="text-3xl">🚀</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to Trackli!</h2>
              <p className="text-gray-600 dark:text-gray-400">We've created a starter project with sample tasks to help you learn the app.</p>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                <span className="text-xl">👆</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Click on any task</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Each task has tips on features to explore</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                <span className="text-xl">☀️</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Try My Day view</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Your daily focus list - some tasks are already there!</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-pink-50 dark:bg-pink-900/20 rounded-xl">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Complete tasks to see them move</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Complete all My Day tasks for a celebration!</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setShowWelcomeModal(false)}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Let's Go! 🎉
            </button>
          </div>
        </div>
      )}

      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => { setHelpModalOpen(false); setHelpModalTab('board') }}
        initialTab={helpModalTab}
        shortcutModifier={shortcutModifier}
      />
      
      {/* Generic Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => { confirmDialog?.onConfirm?.(); setConfirmDialog(null) }}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.confirmLabel}
        confirmStyle={confirmDialog?.confirmStyle}
        icon={confirmDialog?.icon}
        loading={saving}
      />
      
      {/* Delete Recurring Task Confirmation */}
      {deleteRecurringConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-xl">🔁</span>
              </div>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Delete Recurring Task</h3>
            </div>
            <p className={`mb-6 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              "{deleteRecurringConfirm.title}" is part of a recurring series. What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDeleteTask(deleteRecurringConfirm.taskId, false)}
                disabled={saving}
                className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
              >
                Delete only this occurrence
              </button>
              <button
                onClick={() => handleDeleteTask(deleteRecurringConfirm.taskId, true)}
                disabled={saving}
                className="w-full py-3 px-4 rounded-xl font-medium bg-red-500 hover:bg-red-600 text-white transition-all"
              >
                {saving ? 'Deleting...' : 'Delete all future occurrences'}
              </button>
              <button
                onClick={() => setDeleteRecurringConfirm(null)}
                disabled={saving}
                className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      
      {/* Onboarding Overlay - disabled on mobile */}
      {showOnboarding && currentView === 'board' && !isMobile && (
        <OnboardingOverlay
          step={onboardingStep}
          onNext={setOnboardingStep}
          onSkip={() => {
            setShowOnboarding(false)
            localStorage.setItem('trackli_onboarding_complete', 'true')
          }}
          onComplete={() => {
            setShowOnboarding(false)
            localStorage.setItem('trackli_onboarding_complete', 'true')
          }}
        />
      )}
      
      {/* View-specific Tours */}
      {activeViewTour && (
        <ViewTour
          view={activeViewTour}
          step={viewTourStep}
          onNext={setViewTourStep}
          onSkip={() => handleViewTourComplete(activeViewTour)}
          onComplete={() => handleViewTourComplete(activeViewTour)}
        />
      )}
      
      {/* Meeting Notes Import Modal */}
      <Modal 
        isOpen={meetingNotesModalOpen} 
        onClose={() => {
          setMeetingNotesModalOpen(false)
          stopListening()
          setVoiceTranscript('')
          setMeetingNotesData({ title: '', date: new Date().toISOString().split('T')[0], notes: '', projectId: projects[0]?.id || '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setUploadedImage(null)
        }} 
        title="Import Meeting Notes"
        wide
      >
        {!showExtractedTasks ? (
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste notes or upload a photo of your notes. We'll extract action items automatically.
            </p>
            
            {/* Image Upload Section */}
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-colors hover:border-indigo-300 dark:hover:border-indigo-600">
              {uploadedImage ? (
                <div className="space-y-3">
                  <div className="relative">
                    <img 
                      src={uploadedImage.preview} 
                      alt="Uploaded notes" 
                      className="w-full max-h-48 object-contain rounded-lg bg-gray-100 dark:bg-gray-800"
                    />
                    <button
                      onClick={() => setUploadedImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {uploadedImage.name} ready for extraction
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Upload photo of notes</span>
                    <p className="text-xs text-gray-400 mt-1">or take a photo on mobile</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-400"
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
              <span className="text-xs text-gray-400 dark:text-gray-500">or paste text notes</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
            </div>
            
            <div className="space-y-3 overflow-hidden">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={meetingNotesData.title}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                  placeholder="e.g., Weekly Team Sync"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div className="overflow-hidden">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Date</label>
                <div className="overflow-hidden">
                  <input
                    type="date"
                    value={meetingNotesData.date}
                    onChange={(e) => setMeetingNotesData({ ...meetingNotesData, date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    style={{ maxWidth: '100%', minWidth: 0, WebkitAppearance: 'none', boxSizing: 'border-box', width: '100%' }}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
                <select
                  value={meetingNotesData.projectId}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Notes</label>
              <textarea
                value={meetingNotesData.notes}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, notes: e.target.value })}
                placeholder={`Paste your meeting notes here...

Best format - Follow-Up table:
| Follow-Up | Owner | Due Date | Status |
| Review proposal | Sarah | 30/12 | Open |
| Send update email | John | Friday | Open |

Or we can extract from:
• Action items like 'John to send report by Friday'
• TODO: Review the proposal
• @Sarah: Update the timeline`}
                rows={12}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-sm"
              />
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {uploadedImage ? 'AI will analyze your image for tasks' : 'Tip: Follow-Up tables are extracted first'}
              </p>
              <button
                onClick={handleExtractTasks}
                disabled={(!meetingNotesData.notes.trim() && !uploadedImage) || isExtracting}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExtracting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Extracting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Extract Tasks
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800">
                  Found {extractedTasks.length} potential task{extractedTasks.length !== 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-gray-500">Review and edit before creating</p>
              </div>
              <button
                onClick={() => setShowExtractedTasks(false)}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                ← Back to Notes
              </button>
            </div>
            
            {extractedTasks.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-500">No action items found in your notes.</p>
                <p className="text-sm text-gray-400 mt-1">Try adding bullet points or phrases like "Action:", "TODO:", or "@name"</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {extractedTasks.map((task) => (
                  <div 
                    key={task.id}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      task.selected 
                        ? 'border-indigo-200 bg-indigo-50/50' 
                        : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={(e) => updateExtractedTask(task.id, 'selected', e.target.checked)}
                        className="mt-1 w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateExtractedTask(task.id, 'title', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-medium"
                        />
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Assignee:</span>
                            <input
                              type="text"
                              value={task.assignee || ''}
                              onChange={(e) => updateExtractedTask(task.id, 'assignee', e.target.value)}
                              placeholder="Unassigned"
                              className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-28 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Due:</span>
                            <input
                              type="date"
                              value={task.dueDate || ''}
                              onChange={(e) => updateExtractedTask(task.id, 'dueDate', e.target.value)}
                              className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                          </div>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={task.critical}
                              onChange={(e) => updateExtractedTask(task.id, 'critical', e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-red-600">Critical</span>
                          </label>
                        </div>
                      </div>
                      <button
                        onClick={() => removeExtractedTask(task.id)}
                        className="p-2 sm:p-1 text-gray-400 hover:text-red-500 transition-colors touch-manipulation"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                {extractedTasks.filter(t => t.selected).length} task{extractedTasks.filter(t => t.selected).length !== 1 ? 's' : ''} selected
              </p>
              <button
                onClick={handleCreateExtractedTasks}
                disabled={extractedTasks.filter(t => t.selected).length === 0 || saving}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Create {extractedTasks.filter(t => t.selected).length} Task{extractedTasks.filter(t => t.selected).length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
      
      {/* Toast for undo actions */}
      {toast && (
        <Toast
          message={toast.message}
          action={toast.action}
          actionLabel={toast.actionLabel}
          onClose={() => setToast(null)}
        />
      )}
      
      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setQuickAddOpen(false)}
          />
          <div className="relative z-10 bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:mx-4 p-4 pr-8 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Quick Add Task</h3>
              <button
                type="button"
                onClick={() => { setQuickAddOpen(false); setQuickAddTitle('') }}
                className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors touch-manipulation active:bg-gray-200 dark:active:bg-gray-700"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {(() => {
              const parsed = parseNaturalLanguageDate(quickAddTitle)
              return (
                <form onSubmit={(e) => {
                  e.preventDefault()
                  handleQuickAdd(parsed.cleanedText || quickAddTitle, quickAddProject, parsed.date)
                }}>
                  <div className="relative flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      placeholder='Try "Call mom tomorrow" or "Report due friday"'
                      autoFocus
                      className="flex-1 px-4 py-3 text-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {voiceSupported && (
                      <button
                        type="button"
                        onClick={() => toggleVoiceInput((text) => setQuickAddTitle(text))}
                        className={`p-3 rounded-xl transition-all ${
                          isListening 
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {isListening ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          )}
                        </svg>
                      </button>
                    )}
                  </div>
                  {isListening && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-sm text-red-500">Listening... speak now</span>
                    </div>
                  )}
                  
                  {/* Parsed date indicator */}
                  {parsed.date && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Due {formatDate(parsed.date)}
                      </span>
                      <span className="text-xs text-gray-400">(from "{parsed.matched}")</span>
                    </div>
                  )}
                  
                  {/* Quick date shortcuts */}
                  {!parsed.date && (
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                      <span className="text-xs text-gray-400 whitespace-nowrap">Due:</span>
                      {DATE_SHORTCUTS.map(shortcut => (
                        <button
                          key={shortcut.label}
                          type="button"
                          onClick={() => setQuickAddTitle(prev => `${prev} ${shortcut.label.toLowerCase()}`.trim())}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
                        >
                          {shortcut.label}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 mb-4">
                    <select
                      value={quickAddProject}
                      onChange={(e) => setQuickAddProject(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    >
                      {projects.filter(p => !p.archived).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        // Pass the entered data to the full task modal
                        const parsed = parseNaturalLanguageDate(quickAddTitle)
                        const prefillData = {
                          title: parsed.cleanedText || quickAddTitle,
                          project_id: quickAddProject,
                          due_date: parsed.date || null
                        }
                        // Close Quick Add first, then open Task Modal after a brief delay
                        setQuickAddOpen(false)
                        setQuickAddTitle('')
                        setTimeout(() => {
                          setEditingTask(prefillData)
                          setTaskModalOpen(true)
                        }, 100)
                      }}
                      className="px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors whitespace-nowrap"
                    >
                      More options
                    </button>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={!quickAddTitle.trim() || saving}
                    className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                  >
                    {saving ? 'Adding...' : 'Add Task'}
                  </button>
                </form>
      
              )
            })()}
            
            <p className="mt-3 text-xs text-center text-gray-400">Try "tomorrow", "next friday", "in 2 weeks"</p>
          </div>
        </div>
      )}
      
      {/* Save Filter View Modal */}
      {showSaveViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSaveViewModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Save Current View</h3>
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="View name (e.g., My Critical Tasks)"
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newViewName.trim()) {
                  saveCurrentView(newViewName.trim())
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveViewModal(false)}
                className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => newViewName.trim() && saveCurrentView(newViewName.trim())}
                disabled={!newViewName.trim()}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {savedFilterViews.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Existing views:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {savedFilterViews.map(view => (
                    <div key={view.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{view.name}</span>
                      <button
                        onClick={() => deleteFilterView(view.id)}
                        className="p-2 sm:p-1 text-gray-400 hover:text-red-500 transition-colors touch-manipulation"
                        title="Delete view"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Daily Planning Modal */}
      {planningModeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setPlanningModeOpen(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl sm:mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">☀️ Plan Your Day</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pick tasks to focus on today</p>
              </div>
              <button
                onClick={() => setPlanningModeOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Energy filter */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Energy:</span>
                {Object.entries(ENERGY_LEVELS).map(([key, style]) => (
                  <button
                    key={key}
                    onClick={() => setActiveFilters(prev => {
                      const withoutEnergy = prev.filter(f => f.type !== 'energy')
                      return prev.some(f => f.type === 'energy' && f.value === key)
                        ? withoutEnergy
                        : [...withoutEnergy, { type: 'energy', value: key }]
                    })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeFilters.some(f => f.type === 'energy' && f.value === key)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {style.icon} {style.label}
                  </button>
                ))}
              </div>
              
              {/* Backlog tasks to pick from */}
              <div className="space-y-2">
                {tasks
                  .filter(t => t.status === 'backlog' && !isBlocked(t, tasks))
                  .filter(t => !activeFilters.some(f => f.type === 'energy') || activeFilters.some(f => f.type === 'energy' && f.value === t.energy_level))
                  .sort((a, b) => {
                    if (a.critical && !b.critical) return -1
                    if (!a.critical && b.critical) return 1
                    if (a.due_date && !b.due_date) return -1
                    if (!a.due_date && b.due_date) return 1
                    return 0
                  })
                  .map(task => {
                    const project = projects.find(p => p.id === task.project_id)
                    const energyStyle = ENERGY_LEVELS[task.energy_level]
                    const isReady = isReadyToStart(task)
                    
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          task.critical
                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                            : isReady
                            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {task.critical && <span className="text-red-500">🚩</span>}
                            {isReady && <span className="text-green-500">✓</span>}
                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{project?.name}</span>
                            {task.time_estimate && (
                              <>
                                <span>•</span>
                                <span>{formatTimeEstimate(task.time_estimate)}</span>
                              </>
                            )}
                            <span className={`px-1.5 py-0.5 rounded ${energyStyle.color}`}>
                              {energyStyle.icon}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUpdateTaskStatus(task.id, 'todo')}
                          className="px-3 py-1.5 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap"
                        >
                          + Today
                        </button>
                      </div>
                    )
                  })
                }
                
                {tasks.filter(t => t.status === 'backlog' && !isBlocked(t, tasks)).length === 0 && (
                  <div className="text-center py-10 sm:py-8">
                    <div className="w-14 h-14 sm:w-12 sm:h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
                      <span className="text-2xl sm:text-xl">🎉</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 font-medium text-base sm:text-lg mb-1">Backlog is empty!</p>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">All tasks are either planned or done.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{tasks.filter(t => t.status === 'todo').length}</span> tasks in Todo
                </div>
                <button
                  onClick={() => {
                    setPlanningModeOpen(false)
                    setCurrentView('myday')
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium"
                >
                  View My Day →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Floating Action Button - Mobile only */}
      <button
        onClick={() => {
          if (projects.length > 0) {
            setQuickAddProject(projects[0]?.id || '')
            setQuickAddOpen(true)
          }
        }}
        className="sm:hidden fixed bottom-6 right-6 w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full shadow-lg shadow-indigo-500/40 flex items-center justify-center z-30 active:scale-95 transition-transform"
        disabled={projects.length === 0}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>
      
      {/* Floating Feedback Button - desktop only */}
      <button
        onClick={() => setFeedbackModalOpen(true)}
        className="hidden sm:flex fixed bottom-8 right-8 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 items-center gap-2 z-30 hover:bg-gray-50 dark:hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all"
        title="Send Feedback"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-medium">Feedback</span>
      </button>
      
      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        user={user}
      />
      
      {/* Admin Feedback Panel */}
      <AdminFeedbackPanel
        isOpen={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        userEmail={user?.email}
      />
      
      {/* Settings Modal */}
      {settingsModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setSettingsModalOpen(false); setShowDeleteConfirm(false); setDeleteConfirmText(''); setEditingDisplayName(false); setPasswordResetSent(false); } }}
        >
          <div 
            className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSettingsModalOpen(false); setShowDeleteConfirm(false); setDeleteConfirmText(''); setEditingDisplayName(false); setPasswordResetSent(false); } }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-inherit">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
              <button
                onClick={() => { setSettingsModalOpen(false); setShowDeleteConfirm(false); setDeleteConfirmText(''); setEditingDisplayName(false); setPasswordResetSent(false); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Profile Section */}
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Profile</h3>
                <div className={`p-4 rounded-xl space-y-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                      {(displayName || user?.user_metadata?.display_name || user?.email)?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.email}</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {user?.app_metadata?.provider === 'google' ? 'Google Account' : 'Email Account'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Display Name */}
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Display Name</label>
                    {editingDisplayName ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Enter display name"
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                          autoFocus
                        />
                        <button
                          onClick={handleSaveDisplayName}
                          disabled={savingProfile}
                          className="px-3 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
                        >
                          {savingProfile ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingDisplayName(false); setDisplayName(user?.user_metadata?.display_name || ''); }}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className={`${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {user?.user_metadata?.display_name || <span className="text-gray-400 italic">Not set</span>}
                        </span>
                        <button
                          onClick={() => { setDisplayName(user?.user_metadata?.display_name || ''); setEditingDisplayName(true); }}
                          className="text-indigo-500 hover:text-indigo-600 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Change Password - Only for email accounts */}
              {user?.app_metadata?.provider !== 'google' && (
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Password</h3>
                  <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    {passwordResetSent ? (
                      <div className="text-center">
                        <p className="text-green-500 text-sm mb-2">✓ Password reset email sent!</p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Check your inbox for a link to reset your password.</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Change Password</div>
                          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>We'll send a reset link to your email</div>
                        </div>
                        <button
                          onClick={handleSendPasswordReset}
                          disabled={sendingPasswordReset}
                          className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {sendingPasswordReset ? 'Sending...' : 'Send Link'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Preferences Section */}
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Preferences</h3>
                <div className={`p-4 rounded-xl space-y-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  {/* Default View */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Default view on login</span>
                    <select
                      value={defaultView}
                      onChange={(e) => handlePreferenceChange('trackli-default-view', e.target.value)}
                      className={`w-28 px-3 py-1.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="board">Board</option>
                      <option value="myday">My Day</option>
                      <option value="calendar">Calendar</option>
                      <option value="tasks">All Tasks</option>
                      <option value="projects">Projects</option>
                    </select>
                  </div>
                  
                  {/* Week Starts On */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Week starts on</span>
                    <select
                      value={weekStartsOn}
                      onChange={(e) => handlePreferenceChange('trackli-week-start', e.target.value)}
                      className={`w-28 px-3 py-1.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                    </select>
                  </div>
                  
                  {/* Show Confetti */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Show confetti on completion</span>
                    <button
                      onClick={() => handlePreferenceChange('trackli-show-confetti', showConfetti ? 'false' : 'true')}
                      className={`relative w-12 h-6 rounded-full transition-colors ${showConfetti ? 'bg-indigo-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showConfetti ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Data Section */}
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Data</h3>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Clear completed tasks</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Remove done tasks older than:</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={clearTasksAge}
                        onChange={(e) => setClearTasksAge(e.target.value)}
                        className={`px-2 py-1.5 rounded-lg border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      >
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                        <option value="60">60 days</option>
                        <option value="90">90 days</option>
                      </select>
                      <button
                        onClick={handleClearCompletedTasks}
                        disabled={clearingTasks}
                        className="px-3 py-1.5 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                      >
                        {clearingTasks ? '...' : 'Clear'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Support Section */}
              <div>
                <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Support</h3>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Need help?</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Get in touch with our support team</div>
                    </div>
                    <a
                      href="mailto:support@gettrackli.com"
                      className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors"
                    >
                      Contact Us
                    </a>
                  </div>
                </div>
              </div>
              
              {/* Danger Zone */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-red-500">Danger Zone</h3>
                <div className={`p-4 rounded-xl border-2 border-red-200 dark:border-red-800 ${darkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
                  {!showDeleteConfirm ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Delete Account</div>
                        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Permanently delete all your data</div>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                        ⚠️ This will permanently delete all your tasks, projects, and data. This cannot be undone.
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Type <span className="font-mono font-bold">DELETE</span> to confirm:
                      </div>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:ring-2 focus:ring-red-500 focus:border-transparent`}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                          className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleteConfirmText !== 'DELETE' || deleting}
                          className="flex-1 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deleting ? 'Deleting...' : 'Delete Everything'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
