import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { DEMO_PROJECTS, DEMO_TASKS, DEMO_USER, DEMO_MEETING_NOTES } from '../data/demoData'
// Lazy load confetti - only needed when completing tasks
const loadConfetti = () => import('canvas-confetti').then(m => m.default)

// Constants
const ENERGY_LEVELS = {
  high: { bg: '#FEE2E2', text: '#DC2626', icon: '▰▰▰', label: 'High Effort' },
  medium: { bg: '#FEF3C7', text: '#D97706', icon: '▰▰', label: 'Medium Effort' },
  low: { bg: '#D1FAE5', text: '#059669', icon: '▰', label: 'Low Effort' },
}

// Consistent Button Styles
const BTN = {
  // Base styles applied to all buttons
  base: 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  
  // Size variants
  sizes: {
    xs: 'px-2 py-1 text-xs rounded-lg gap-1',
    sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-xl gap-2',
  },
  
  // Color variants
  variants: {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700 focus:ring-indigo-500 shadow-sm hover:shadow',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
    danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 focus:ring-red-500 shadow-sm hover:shadow',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 focus:ring-amber-500 shadow-sm hover:shadow',
    success: 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700 focus:ring-green-500 shadow-sm hover:shadow',
    ghost: 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-400 dark:text-gray-300 dark:hover:bg-gray-700',
    outline: 'border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 focus:ring-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-900/20',
  },
}

// Helper to compose button classes
const btn = (variant = 'primary', size = 'md', extra = '') => 
  `${BTN.base} ${BTN.sizes[size]} ${BTN.variants[variant]} ${extra}`.trim()

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
  done: '#10B981',
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

// Toast Notification Icons
const ToastIcons = {
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
const ColumnEmptyIcons = {
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

// Toast Component for undo actions
const Toast = ({ message, action, actionLabel, onClose, duration = 5000, type = 'info' }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])
  
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl">
        {type === 'success' ? ToastIcons.success() : type === 'error' ? ToastIcons.error() : ToastIcons.info()}
        <span className="text-sm font-medium text-gray-900 dark:text-white">{message}</span>
        {action && (
          <button
            onClick={() => { action(); onClose(); }}
            className="px-3 py-1.5 text-sm font-semibold bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            {actionLabel || 'Undo'}
          </button>
        )}
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// PWA Install Prompt - encourages users to add to home screen
const PWAInstallPrompt = ({ onDismiss }) => {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed/standalone
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    setIsStandalone(standalone)
    if (standalone) return

    // Check if user previously installed
    if (localStorage.getItem('pwaInstalled') === 'true') return

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    setIsIOS(iOS)

    // Check if dismissed recently (within 7 days)
    const dismissed = localStorage.getItem('pwaPromptDismissed')
    if (dismissed) {
      const dismissedDate = new Date(dismissed)
      const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) return
    }

    // Check if user has enough engagement (at least 3 tasks created)
    const taskCount = parseInt(localStorage.getItem('taskCount') || '0')
    if (taskCount < 3) return

    // For non-iOS, listen for install prompt
    if (!iOS) {
      const handler = (e) => {
        e.preventDefault()
        setInstallPrompt(e)
        setShowPrompt(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    } else {
      // For iOS, show after delay if not in standalone
      const timer = setTimeout(() => setShowPrompt(true), 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') {
        localStorage.setItem('pwaInstalled', 'true')
        setShowPrompt(false)
      }
      setInstallPrompt(null)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('pwaPromptDismissed', new Date().toISOString())
    setShowPrompt(false)
    onDismiss?.()
  }

  if (!showPrompt || isStandalone) return null

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-slide-up">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 max-w-sm mx-auto sm:mx-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Get Trackli on your phone</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isIOS 
                ? "Add to home screen for quick access & notifications"
                : "Install for quick access & notifications"
              }
            </p>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {isIOS ? (
          <div className="mt-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-2">
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Tap <span className="inline-flex items-center"><svg className="w-4 h-4 mx-0.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg></span> Share then <strong>"Add to Home Screen"</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                Maybe later
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('pwaInstalled', 'true')
                  setShowPrompt(false)
                }}
                className="flex-1 px-3 py-2 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Maybe later
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 px-3 py-2 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
            >
              Install
            </button>
          </div>
        )}
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
    danger: 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white focus:ring-red-500 shadow-sm hover:shadow',
    warning: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white focus:ring-amber-500 shadow-sm hover:shadow',
    primary: 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white focus:ring-indigo-500 shadow-sm hover:shadow',
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
            className="px-4 py-2 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmButtonStyles[confirmStyle]} disabled:opacity-50`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Task Breakdown Modal - AI-powered subtask suggestions
const TaskBreakdownModal = ({ isOpen, onClose, task, projectName, onAddSubtasks }) => {
  const [subtasks, setSubtasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState({})

  // Fetch suggestions when modal opens
  useEffect(() => {
    if (isOpen && task) {
      fetchSuggestions()
    }
  }, [isOpen, task])

  const fetchSuggestions = async () => {
    setLoading(true)
    setError(null)
    setSubtasks([])
    setSelected({})

    try {
      const response = await fetch('/api/break-down-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: task.title,
          taskDescription: task.description || '',
          projectName: projectName || ''
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get suggestions')
      }

      setSubtasks(data.subtasks || [])
      // Pre-select all by default
      const initialSelected = {}
      data.subtasks?.forEach((_, idx) => { initialSelected[idx] = true })
      setSelected(initialSelected)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSubtask = (idx) => {
    setSelected(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const handleAddSelected = () => {
    const selectedSubtasks = subtasks.filter((_, idx) => selected[idx])
    if (selectedSubtasks.length > 0) {
      onAddSubtasks(selectedSubtasks)
    }
    onClose()
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div 
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <span className="text-xl">✨</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Break Down Task</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[300px]">{task?.title}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Analyzing task...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl">
              <p className="font-medium">Unable to break down task</p>
              <p className="text-sm mt-1">{error}</p>
              <button 
                onClick={fetchSuggestions}
                className="mt-3 text-sm font-medium text-red-600 hover:text-red-700 underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && subtasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Select the subtasks you want to add:</p>
              {subtasks.map((subtask, idx) => (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    selected[idx] 
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-300 dark:border-purple-600' 
                      : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected[idx] || false}
                    onChange={() => toggleSubtask(idx)}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-gray-700 dark:text-gray-200">{subtask}</span>
                </label>
              ))}
            </div>
          )}

          {!loading && !error && subtasks.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No suggestions available for this task.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            ↻ Regenerate
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSelected}
              disabled={loading || selectedCount === 0}
              className="px-4 py-2 rounded-xl font-medium bg-purple-500 text-white hover:bg-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add {selectedCount > 0 ? `${selectedCount} Subtask${selectedCount > 1 ? 's' : ''}` : 'Selected'}
            </button>
          </div>
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
            <p className="text-gray-600 dark:text-gray-300">We really appreciate you taking the time to help us improve.</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Help us make Trackli better!</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Type</label>
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
                      <div className="text-xs text-gray-500 dark:text-gray-300">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Message</label>
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
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Screenshots (optional)</label>
                
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
                    <span className="text-sm text-gray-500 dark:text-gray-300">Add image or paste from clipboard</span>
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
                  className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
              <p className="text-sm text-gray-500 dark:text-gray-300">{feedback.length} total submissions</p>
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
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-300">
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
              <span className="text-gray-600 dark:text-gray-300">{shortcut.description}</span>
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
          <p className="text-sm text-gray-500 dark:text-gray-300">Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">?</kbd> anytime to see shortcuts</p>
        </div>
      </div>
    </div>
  )
}

// Empty State Component - Enhanced with illustrations and animations
// Greeting Icons for My Day
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
        <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20 ${fullScreenMobile ? 'pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-4 rounded-none sm:rounded-t-2xl' : 'rounded-t-2xl'}`}>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-3 -mr-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-300 touch-manipulation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 overscroll-contain">{children}</div>
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
            <p className="text-gray-500 dark:text-gray-300 text-sm mb-6">Email files can be opened in your email client</p>
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
            <p className="text-gray-500 dark:text-gray-300 text-sm mb-6">Preview not available for this file type</p>
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
      title: 'Welcome to Trackli!',
      description: 'This is your Summary Bar - click any stat to filter tasks. Use the My Day filter to see your daily focus, or filter by assignee, customer, category and more.',
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
      description: 'Each card shows key info at a glance. Look for the sun icon on cards in your My Day list! Hover to see details and attachments.',
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
      target: 'quick-add',
      title: 'Quick Add ⚡',
      description: `Press Q (or ${shortcut.replace('T', 'Q')}) for instant task creation! Type naturally like "Call mom tomorrow" and dates are parsed automatically. Includes voice input - just click the mic.`,
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
      description: 'Click the ? icon anytime to access the full help guide. You\'re all set!',
      position: 'bottom',
    },
  ]
  
  const currentStep = steps[step]
  if (!currentStep) return null
  
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col">
      {/* Dark overlay with spotlight cutout */}
      <div className="absolute inset-0 bg-black/60" onClick={onSkip} />
      
      {/* Tooltip - positioned based on step */}
      <div 
        className={`absolute z-[1001] max-w-sm animate-fadeIn ${
          step === 0 ? 'top-32 left-1/2 -translate-x-1/2' :
          step === 1 ? 'top-40 left-1/2 -translate-x-1/2' :
          step === 2 ? 'top-60 left-[340px]' :
          step === 3 ? 'top-24 left-8' :
          step === 4 ? 'top-20 right-[180px]' :
          step === 5 ? 'top-20 right-[100px]' :
          step === 6 ? 'top-20 right-[40px]' :
          'top-20 right-0'
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
          
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            {currentStep.title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300">
            {currentStep.description}
          </p>
        </div>
        
        {/* Arrow pointer */}
        <div className={`absolute w-4 h-4 bg-white dark:bg-gray-800 rotate-45 border-gray-200 dark:border-gray-700 ${
          currentStep.position === 'bottom' ? '-top-2 left-1/2 -translate-x-1/2 border-t border-l' :
          currentStep.position === 'top' ? '-bottom-2 left-1/2 -translate-x-1/2 border-b border-r' :
          currentStep.position === 'right' ? '-left-2 top-8 border-l border-b' :
          '-right-2 top-8 border-r border-t'
        }`} />
      </div>
      
      {/* Fixed bottom navigation - stays in one place */}
      <div className="fixed bottom-0 left-0 right-0 z-[1002] p-4 bg-gradient-to-t from-black/50 to-transparent">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={onSkip}
            className="px-4 py-2.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => onNext(step - 1)}
                className="px-5 py-2.5 bg-white/20 text-white rounded-xl font-medium hover:bg-white/30 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => step < steps.length - 1 ? onNext(step + 1) : onComplete()}
              className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-medium hover:bg-gray-100 transition-colors shadow-lg"
            >
              {step < steps.length - 1 ? 'Next' : 'Get Started!'}
            </button>
          </div>
        </div>
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

const ScheduleTaskAnimation = () => (
  <svg viewBox="0 0 280 140" className="w-full h-36 rounded-lg bg-gray-50 dark:bg-gray-700/50">
    <defs>
      <linearGradient id="calButtonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
    </defs>
    
    {/* Task card */}
    <rect x="15" y="20" width="120" height="50" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1" />
    <circle cx="32" cy="38" r="6" fill="#3B82F6" />
    <rect x="45" y="32" width="55" height="8" rx="2" fill="#374151" />
    <rect x="45" y="44" width="35" height="6" rx="2" fill="#9CA3AF" />
    
    {/* Calendar button on task - animated pulse */}
    <g>
      <rect x="105" y="30" width="24" height="24" rx="6" fill="#EEF2FF">
        <animate attributeName="fill" values="#EEF2FF;#C7D2FE;#EEF2FF" dur="2s" repeatCount="indefinite" />
      </rect>
      <text x="117" y="47" textAnchor="middle" fontSize="14">🗓</text>
      {/* Click indicator */}
      <circle cx="117" cy="42" r="12" fill="none" stroke="#6366F1" strokeWidth="2">
        <animate attributeName="r" values="12;18;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0;0" dur="2s" repeatCount="indefinite" />
      </circle>
    </g>
    
    {/* Arrow pointing to modal */}
    <path d="M140 45 L155 45" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" markerEnd="url(#arrowhead)">
      <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.7;1" />
    </path>
    
    {/* Schedule modal */}
    <g>
      <rect x="160" y="15" width="105" height="110" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
      </rect>
      <text x="212" y="35" textAnchor="middle" fontSize="8" fill="#374151" fontWeight="bold">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        Schedule Task
      </text>
      
      {/* Date field */}
      <text x="170" y="52" fontSize="7" fill="#6B7280">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        Date
      </text>
      <rect x="170" y="55" width="85" height="18" rx="4" fill="#F9FAFB" stroke="#E5E7EB">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
      </rect>
      <text x="180" y="67" fontSize="8" fill="#374151">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        02/01/2026
      </text>
      
      {/* Time field */}
      <text x="170" y="82" fontSize="7" fill="#6B7280">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        Time
      </text>
      <rect x="170" y="85" width="85" height="18" rx="4" fill="#F9FAFB" stroke="#E5E7EB">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
      </rect>
      <text x="180" y="97" fontSize="8" fill="#374151">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        09:00
      </text>
      
      {/* Schedule button */}
      <rect x="190" y="107" width="55" height="14" rx="4" fill="url(#calButtonGradient)">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
      </rect>
      <text x="217" y="117" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">
        <animate attributeName="opacity" values="0;0;1;1" dur="2s" repeatCount="indefinite" keyTimes="0;0.3;0.4;1" />
        Schedule
      </text>
    </g>
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
    <text x="200" y="38" textAnchor="end" fontSize="10" fill="#059669" fontWeight="bold">
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

// Custom Tour Icons
const TourIcons = {
  sun: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="10" fill="url(#sunGrad)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="24" y1="6" x2="24" y2="10" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 24 24)`} />
      ))}
    </svg>
  ),
  addTask: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="addGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="8" y="12" width="32" height="24" rx="4" fill="url(#addGrad)" />
      <line x1="24" y1="18" x2="24" y2="30" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <line x1="18" y1="24" x2="30" y2="24" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  chart: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <rect x="8" y="28" width="8" height="12" rx="2" fill="url(#chartGrad)" opacity="0.6" />
      <rect x="20" y="20" width="8" height="20" rx="2" fill="url(#chartGrad)" opacity="0.8" />
      <rect x="32" y="10" width="8" height="30" rx="2" fill="url(#chartGrad)" />
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="calGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="8" y="12" width="32" height="28" rx="4" fill="url(#calGrad)" />
      <rect x="8" y="12" width="32" height="8" rx="4" fill="#4F46E5" />
      <circle cx="14" cy="8" r="2" fill="#6366F1" />
      <circle cx="34" cy="8" r="2" fill="#6366F1" />
      <rect x="14" y="24" width="6" height="4" rx="1" fill="white" opacity="0.9" />
      <rect x="24" y="24" width="6" height="4" rx="1" fill="white" opacity="0.6" />
      <rect x="14" y="32" width="6" height="4" rx="1" fill="white" opacity="0.6" />
      <rect x="24" y="32" width="6" height="4" rx="1" fill="white" opacity="0.6" />
    </svg>
  ),
  sparkle: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path d="M24 4 L26 18 L40 20 L26 22 L24 36 L22 22 L8 20 L22 18 Z" fill="url(#sparkGrad)" />
      <circle cx="36" cy="10" r="3" fill="#C4B5FD" />
      <circle cx="12" cy="34" r="2" fill="#C4B5FD" />
    </svg>
  ),
  timer: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="26" r="16" fill="none" stroke="url(#timerGrad)" strokeWidth="4" />
      <circle cx="24" cy="26" r="12" fill="#EEF2FF" />
      <line x1="24" y1="26" x2="24" y2="18" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="26" x2="30" y2="26" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
      <rect x="20" y="4" width="8" height="4" rx="1" fill="#6366F1" />
    </svg>
  ),
  table: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="tableGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="36" height="32" rx="4" fill="url(#tableGrad)" />
      <rect x="6" y="8" width="36" height="8" rx="4" fill="#4F46E5" />
      <line x1="6" y1="22" x2="42" y2="22" stroke="white" strokeWidth="1" opacity="0.3" />
      <line x1="6" y1="30" x2="42" y2="30" stroke="white" strokeWidth="1" opacity="0.3" />
      <line x1="18" y1="16" x2="18" y2="40" stroke="white" strokeWidth="1" opacity="0.3" />
      <line x1="30" y1="16" x2="30" y2="40" stroke="white" strokeWidth="1" opacity="0.3" />
    </svg>
  ),
  importExport: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="importGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect x="10" y="8" width="28" height="32" rx="3" fill="url(#importGrad)" />
      <path d="M18 20 L24 26 L30 20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="24" y1="14" x2="24" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="32" x2="32" y2="32" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  folder: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="folderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path d="M6 14 L6 38 Q6 40 8 40 L40 40 Q42 40 42 38 L42 18 Q42 16 40 16 L24 16 L20 12 L8 12 Q6 12 6 14 Z" fill="url(#folderGrad)" />
      <rect x="6" y="16" width="36" height="2" fill="#D97706" opacity="0.3" />
    </svg>
  ),
  settings: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="settingsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9CA3AF" />
          <stop offset="100%" stopColor="#6B7280" />
        </linearGradient>
      </defs>
      <path d="M24 8 L27 10 L30 8 L32 11 L36 11 L36 15 L39 17 L37 20 L39 23 L36 25 L36 29 L32 29 L30 32 L27 30 L24 32 L21 30 L18 32 L16 29 L12 29 L12 25 L9 23 L11 20 L9 17 L12 15 L12 11 L16 11 L18 8 L21 10 Z" fill="url(#settingsGrad)" />
      <circle cx="24" cy="20" r="6" fill="white" />
      <circle cx="24" cy="20" r="3" fill="#6B7280" />
    </svg>
  ),
  chartUp: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="chartUpGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <polyline points="8,36 18,26 28,30 40,14" fill="none" stroke="url(#chartUpGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="36,12 42,12 42,18" fill="#6366F1" />
      <circle cx="8" cy="36" r="3" fill="#A5B4FC" />
      <circle cx="18" cy="26" r="3" fill="#A5B4FC" />
      <circle cx="28" cy="30" r="3" fill="#A5B4FC" />
      <circle cx="40" cy="14" r="3" fill="#6366F1" />
    </svg>
  ),
  trophy: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <defs>
        <linearGradient id="trophyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path d="M14 8 L34 8 L34 20 Q34 28 24 32 Q14 28 14 20 Z" fill="url(#trophyGrad)" />
      <path d="M14 12 L10 12 Q6 12 6 16 L6 18 Q6 22 10 22 L14 22" fill="none" stroke="#F59E0B" strokeWidth="3" />
      <path d="M34 12 L38 12 Q42 12 42 16 L42 18 Q42 22 38 22 L34 22" fill="none" stroke="#F59E0B" strokeWidth="3" />
      <rect x="20" y="32" width="8" height="4" fill="#D97706" />
      <rect x="16" y="36" width="16" height="4" rx="1" fill="#92400E" />
    </svg>
  ),
}

// View-Specific Tour Component
const ViewTour = ({ view, step, onNext, onSkip, onComplete }) => {
  const tourContent = {
    myday: [
      {
        title: 'Welcome to My Day!',
        description: 'This is your personal daily focus list. Plan what to work on today without cluttering your board view.',
        iconComponent: 'sun',
      },
      {
        title: 'Add Tasks to My Day',
        description: 'Tasks with today\'s start date appear automatically. Click the sun button on any recommended task to add it to your day!',
        iconComponent: 'addTask',
        animation: 'addToMyDay',
      },
      {
        title: 'Track Your Progress',
        description: 'Watch your progress bar fill up as you complete tasks. Finish everything for a confetti celebration!',
        iconComponent: 'chart',
        animation: 'progressBar',
      },
    ],
    calendar: [
      {
        title: 'Welcome to Calendar!',
        description: 'View your scheduled tasks visually. Switch between daily, weekly, and monthly views using the buttons at the top.',
        iconComponent: 'calendar',
      },
      {
        title: 'Schedule a Task',
        description: 'Click the calendar button on any task to set a date and time. The task will appear on the calendar.',
        iconComponent: 'sparkle',
        animation: 'dragToCalendar',
      },
      {
        title: 'Task Duration',
        description: 'Set the Time Estimate on a task to control how tall it appears on the calendar. Click any task to edit its details.',
        iconComponent: 'timer',
      },
    ],
    tasks: [
      {
        title: 'All Tasks View',
        description: 'See every task in a powerful table format. Click any column header to sort, or use the Filters button to narrow down results.',
        iconComponent: 'table',
      },
      {
        title: 'Import & Export CSV',
        description: 'Export tasks for reporting, or import to bulk create/edit. Use * in the ID column to create new tasks, or include existing IDs to update them.',
        iconComponent: 'importExport',
      },
    ],
    projects: [
      {
        title: 'Projects View',
        description: 'Organize your work into projects. Each project gets its own color that appears on task cards throughout the app.',
        iconComponent: 'folder',
      },
      {
        title: 'Manage Projects',
        description: 'Create new projects, edit details, or archive completed ones. Archived projects hide their tasks from the main board.',
        iconComponent: 'settings',
      },
    ],
    progress: [
      {
        title: 'Progress View',
        description: 'Track your productivity across all projects. See completion rates, task counts, and how you\'re doing over time.',
        iconComponent: 'chartUp',
      },
      {
        title: 'Completion Insights',
        description: 'The charts show your completed vs. remaining tasks. Use this to identify bottlenecks and celebrate wins!',
        iconComponent: 'trophy',
      },
    ],
  }

  // Animation component mapping
  const animations = {
    addToMyDay: AddToMyDayAnimation,
    dragToCalendar: ScheduleTaskAnimation,
    resizeTask: ResizeTaskAnimation,
    progressBar: ProgressBarAnimation,
  }

  const steps = tourContent[view] || []
  const currentStep = steps[step]
  if (!currentStep) return null

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onSkip} />
      
      {/* Tour card - centered */}
      <div className="flex-1 flex items-center justify-center p-4 pb-24">
        <div className="relative z-[1001] max-w-md w-full animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 text-white">
              <div className="mb-3">
                  {currentStep.iconComponent && TourIcons[currentStep.iconComponent] 
                    ? TourIcons[currentStep.iconComponent]() 
                    : <span className="text-4xl">{currentStep.icon}</span>}
                </div>
              <h3 className="text-xl font-semibold">{currentStep.title}</h3>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                {currentStep.description}
              </p>
              
              {/* Animation if available */}
              {currentStep.animation && animations[currentStep.animation] && (
                <div className="mb-4">
                  {(() => {
                    const AnimationComponent = animations[currentStep.animation]
                    return <AnimationComponent />
                  })()}
                </div>
              )}
              
              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2">
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
            </div>
          </div>
        </div>
      </div>
      
      {/* Fixed bottom navigation - stays in one place */}
      <div className="fixed bottom-0 left-0 right-0 z-[1002] p-4 bg-gradient-to-t from-black/30 to-transparent">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={onSkip}
            className="px-4 py-2.5 text-sm text-white/80 hover:text-white transition-colors"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => onNext(step - 1)}
                className="px-5 py-2.5 bg-white/20 text-white rounded-xl font-medium hover:bg-white/30 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => step < steps.length - 1 ? onNext(step + 1) : onComplete()}
              className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-medium hover:bg-gray-100 transition-colors shadow-lg"
            >
              {step < steps.length - 1 ? 'Next' : 'Got it!'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Help Modal Tab Icons
const HelpTabIcons = {
  tasks: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#10B981" />
      <path d="M7 12 L10 15 L17 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  board: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#6366F1" />
      <rect x="4" y="6" width="4" height="12" rx="1" fill="white" opacity="0.9" />
      <rect x="10" y="6" width="4" height="8" rx="1" fill="white" opacity="0.7" />
      <rect x="16" y="6" width="4" height="5" rx="1" fill="white" opacity="0.5" />
    </svg>
  ),
  myday: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="12" y1="3" x2="12" y2="5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 12 12)`} />
      ))}
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#6366F1" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#4F46E5" />
      <circle cx="7" cy="3" r="1.5" fill="#6366F1" />
      <circle cx="17" cy="3" r="1.5" fill="#6366F1" />
      <rect x="6" y="12" width="3" height="2" rx="0.5" fill="white" opacity="0.9" />
      <rect x="10.5" y="12" width="3" height="2" rx="0.5" fill="white" opacity="0.6" />
      <rect x="6" y="16" width="3" height="2" rx="0.5" fill="white" opacity="0.6" />
    </svg>
  ),
  alltasks: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#6366F1" />
      <line x1="5" y1="8" x2="19" y2="8" stroke="white" strokeWidth="1.5" opacity="0.8" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="white" strokeWidth="1.5" opacity="0.6" />
      <line x1="5" y1="16" x2="19" y2="16" stroke="white" strokeWidth="1.5" opacity="0.4" />
    </svg>
  ),
  shortcuts: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="#6B7280" />
      <rect x="4" y="8" width="3" height="2" rx="0.5" fill="white" opacity="0.8" />
      <rect x="8" y="8" width="3" height="2" rx="0.5" fill="white" opacity="0.8" />
      <rect x="12" y="8" width="3" height="2" rx="0.5" fill="white" opacity="0.8" />
      <rect x="16" y="8" width="4" height="2" rx="0.5" fill="white" opacity="0.8" />
      <rect x="4" y="11" width="4" height="2" rx="0.5" fill="white" opacity="0.6" />
      <rect x="9" y="11" width="6" height="2" rx="0.5" fill="white" opacity="0.6" />
      <rect x="16" y="11" width="4" height="2" rx="0.5" fill="white" opacity="0.6" />
      <rect x="6" y="14" width="12" height="2" rx="0.5" fill="white" opacity="0.4" />
    </svg>
  ),
}

// Navigation Menu Icons
const MenuIcons = {
  myday: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="12" y1="3" x2="12" y2="5" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 12 12)`} />
      ))}
    </svg>
  ),
  board: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#D4A574" />
      <rect x="3" y="2" width="10" height="4" rx="1" fill="#B8956E" />
      <rect x="4" y="8" width="16" height="11" rx="1" fill="#FDF6E9" />
      <line x1="7" y1="11" x2="17" y2="11" stroke="#E5E7EB" strokeWidth="1.5" />
      <line x1="7" y1="14" x2="14" y2="14" stroke="#E5E7EB" strokeWidth="1.5" />
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#FEE2E2" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#EF4444" />
      <circle cx="7" cy="3" r="1.5" fill="#DC2626" />
      <circle cx="17" cy="3" r="1.5" fill="#DC2626" />
      <rect x="6" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="10.5" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="6" y="16" width="3" height="2" rx="0.5" fill="#FCA5A5" />
    </svg>
  ),
  alltasks: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#818CF8" />
      <rect x="2" y="3" width="20" height="5" rx="2" fill="#6366F1" />
      <line x1="5" y1="11" x2="19" y2="11" stroke="white" strokeWidth="1.5" opacity="0.6" />
      <line x1="5" y1="15" x2="19" y2="15" stroke="white" strokeWidth="1.5" opacity="0.4" />
    </svg>
  ),
  projects: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M3 7 L3 19 Q3 20 4 20 L20 20 Q21 20 21 19 L21 9 Q21 8 20 8 L12 8 L10 6 L4 6 Q3 6 3 7 Z" fill="#9CA3AF" />
      <rect x="3" y="8" width="18" height="1" fill="#6B7280" opacity="0.3" />
    </svg>
  ),
  progress: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="4" y="14" width="4" height="6" rx="1" fill="#EF4444" />
      <rect x="10" y="10" width="4" height="10" rx="1" fill="#F59E0B" />
      <rect x="16" y="6" width="4" height="14" rx="1" fill="#10B981" />
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
  // Progress Dashboard icons
  fire: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <defs>
        <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#DC2626" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FCD34D" />
        </linearGradient>
      </defs>
      <path d="M12 2 C12 2 8 6 8 10 C8 11 8.5 12 9 12.5 C8.5 11 9 9 12 7 C15 9 15.5 11 15 12.5 C15.5 12 16 11 16 10 C16 6 12 2 12 2 Z M12 22 C8 22 5 19 5 15 C5 11 8 8 12 8 C16 8 19 11 19 15 C19 19 16 22 12 22 Z" fill="url(#fireGrad)" />
    </svg>
  ),
  checkSquare: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#22C55E" />
      <path d="M7 12 L10 15 L17 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  calendarWeek: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#FEE2E2" />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#EF4444" />
      <circle cx="7" cy="3" r="1.5" fill="#DC2626" />
      <circle cx="17" cy="3" r="1.5" fill="#DC2626" />
      <rect x="6" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="10.5" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="15" y="12" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="6" y="16" width="3" height="2" rx="0.5" fill="#FCA5A5" />
      <rect x="10.5" y="16" width="3" height="2" rx="0.5" fill="#FCA5A5" />
    </svg>
  ),
  stopwatch: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <circle cx="12" cy="13" r="9" fill="#E9D5FF" stroke="#A855F7" strokeWidth="2" />
      <circle cx="12" cy="13" r="6" fill="white" />
      <line x1="12" y1="13" x2="12" y2="9" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="13" x2="15" y2="13" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="10" y="1" width="4" height="3" rx="1" fill="#A855F7" />
      <circle cx="12" cy="13" r="1" fill="#7C3AED" />
    </svg>
  ),
  chartBar: () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x="4" y="14" width="4" height="6" rx="1" fill="#EF4444" />
      <rect x="10" y="10" width="4" height="10" rx="1" fill="#F59E0B" />
      <rect x="16" y="6" width="4" height="14" rx="1" fill="#10B981" />
    </svg>
  ),
  // Settings menu icons
  sun: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="12" y1="2" x2="12" y2="4" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 12 12)`} />
      ))}
    </svg>
  ),
  moon: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#FCD34D" />
    </svg>
  ),
  importNotes: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
      <line x1="8" y1="7" x2="16" y2="7" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="16" y2="11" stroke="#FCD34D" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="15" x2="13" y2="15" stroke="#FCD34D" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  feedback: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <circle cx="8" cy="12" r="1" fill="#3B82F6" />
      <circle cx="12" cy="12" r="1" fill="#3B82F6" />
      <circle cx="16" cy="12" r="1" fill="#3B82F6" />
    </svg>
  ),
  settingsGear: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <circle cx="12" cy="12" r="3" fill="#9CA3AF" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="#6B7280" strokeWidth="1.5" />
    </svg>
  ),
  signOut: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
      <polyline points="16 17 21 12 16 7" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

// Help Modal Component
const HelpModal = ({ isOpen, onClose, initialTab = 'tasks', shortcutModifier = '⌘⌃' }) => {
// Redesigned Help Modal Component - Colourful Polished LGBTQ Vibes
const HelpModal = ({ isOpen, onClose, initialTab = 'tasks', shortcutModifier = '⌘⌃' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])
  
  if (!isOpen) return null
  
  const rainbowColors = [
    { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-l-red-500', text: 'text-red-600 dark:text-red-400', numBg: 'bg-red-100 dark:bg-red-900/50' },
    { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-l-orange-500', text: 'text-orange-600 dark:text-orange-400', numBg: 'bg-orange-100 dark:bg-orange-900/50' },
    { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-l-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', numBg: 'bg-yellow-100 dark:bg-yellow-900/50' },
    { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-l-green-500', text: 'text-green-600 dark:text-green-400', numBg: 'bg-green-100 dark:bg-green-900/50' },
    { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-l-blue-500', text: 'text-blue-600 dark:text-blue-400', numBg: 'bg-blue-100 dark:bg-blue-900/50' },
    { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', numBg: 'bg-purple-100 dark:bg-purple-900/50' },
    { bg: 'bg-pink-50 dark:bg-pink-900/20', border: 'border-l-pink-500', text: 'text-pink-600 dark:text-pink-400', numBg: 'bg-pink-100 dark:bg-pink-900/50' },
  ]
  
  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: '✨', color: 'from-pink-500 to-rose-500' },
    { id: 'board', label: 'Board', icon: '📋', color: 'from-orange-500 to-amber-500' },
    { id: 'myday', label: 'My Day', icon: '☀️', color: 'from-yellow-500 to-orange-500' },
    { id: 'calendar', label: 'Calendar', icon: '🗓', color: 'from-green-500 to-emerald-500' },
    { id: 'alltasks', label: 'All Tasks', icon: '🗃️', color: 'from-blue-500 to-cyan-500' },
    { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️', color: 'from-purple-500 to-indigo-500' },
  ]
