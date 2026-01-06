// Shared utility functions for Kanban components
import { CUSTOMER_COLORS } from './constants'

// Get customer color based on name hash
export const getCustomerColor = (customerName) => {
  if (!customerName) return null
  let hash = 0
  for (let i = 0; i < customerName.length; i++) {
    hash = customerName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CUSTOMER_COLORS[Math.abs(hash) % CUSTOMER_COLORS.length]
}

// Get due date status
export const getDueDateStatus = (dueDate, status) => {
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

// Check if task is ready to start
export const isReadyToStart = (task) => {
  if (task.status !== 'backlog') return false
  if (!task.start_date) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(task.start_date)
  start.setHours(0, 0, 0, 0)
  return start <= today
}

// Check if task is blocked by dependencies
export const isBlocked = (task, allTasks) => {
  if (!task.dependencies || task.dependencies.length === 0) return false
  if (task.status === 'done') return false
  
  return task.dependencies.some(dep => {
    const depTask = allTasks.find(t => t.id === dep.depends_on_id)
    return depTask && depTask.status !== 'done'
  })
}

// Check if task is in My Day
export const isInMyDay = (task) => {
  if (task.status === 'done') return false
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check if user manually removed from My Day today
  if (task.removed_from_myday_at) {
    const removedDate = new Date(task.removed_from_myday_at)
    removedDate.setHours(0, 0, 0, 0)
    if (removedDate.getTime() === today.getTime()) {
      // User removed it today - don't auto-add back
      return false
    }
  }
  
  // Explicitly added to My Day today
  if (task.my_day_date) {
    const myDayDate = new Date(task.my_day_date)
    myDayDate.setHours(0, 0, 0, 0)
    if (myDayDate < today) return false
    if (myDayDate.getTime() === today.getTime()) return true
  }
  
  // Auto-add: Start date is today or in the past
  if (task.start_date) {
    const startDate = new Date(task.start_date)
    startDate.setHours(0, 0, 0, 0)
    if (startDate <= today) return true
  }
  
  // Auto-add: Due date is today or in the past (overdue)
  if (task.due_date) {
    const dueDate = new Date(task.due_date)
    dueDate.setHours(0, 0, 0, 0)
    if (dueDate <= today) return true
  }
  
  return false
}

// Calculate next recurrence date
export const getNextRecurrenceDate = (originalStartDate, recurrenceType) => {
  if (!originalStartDate || !recurrenceType) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let nextDate = new Date(originalStartDate)
  nextDate.setHours(0, 0, 0, 0)
  
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
  
  let iterations = 0
  const maxIterations = 365
  
  while (nextDate <= today && iterations < maxIterations) {
    addInterval(nextDate)
    iterations++
  }
  
  return nextDate.toISOString().split('T')[0]
}

// Generate future occurrence dates
export const generateFutureOccurrences = (startDate, recurrenceType, count, endDate = null) => {
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
  
  const maxIterations = endDate ? 365 : count
  let iterations = 0
  
  while (iterations < maxIterations) {
    addInterval(currentDate)
    if (endDateTime && currentDate > endDateTime) break
    occurrences.push(currentDate.toISOString().split('T')[0])
    iterations++
    if (!endDate && iterations >= count) break
  }
  
  return occurrences
}

// Get occurrence count based on recurrence type
export const getOccurrenceCount = (recurrenceType) => {
  switch (recurrenceType) {
    case 'daily': return 14
    case 'weekly': return 8
    case 'biweekly': return 6
    case 'monthly': return 6
    default: return 0
  }
}

// Format date for display
export const formatDate = (dateString, format) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  
  // If format not passed, read from localStorage
  const effectiveFormat = format ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('trackli-date-format') : 'auto') ?? 'auto'
  
  if (effectiveFormat === 'DD/MM/YYYY') {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } else if (effectiveFormat === 'MM/DD/YYYY') {
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  }
  // Auto: use browser locale
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Get the locale string for toLocaleDateString based on user preference
export const getDateLocale = () => {
  const format = typeof localStorage !== 'undefined' ? localStorage.getItem('trackli-date-format') : 'auto'
  if (format === 'DD/MM/YYYY') return 'en-GB'
  if (format === 'MM/DD/YYYY') return 'en-US'
  return undefined // auto-detect
}

// Detect if user's locale uses MM/DD (US) or DD/MM
export const isUSDateFormat = () => {
  const testDate = new Date(2000, 0, 15)
  const formatted = testDate.toLocaleDateString()
  const firstNum = parseInt(formatted.split(/[\/\-\.]/)[0])
  return firstNum === 1
}

// Format time estimate
export const formatTimeEstimate = (minutes) => {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Flexible time parser
export const parseFlexibleTime = (input) => {
  if (!input) return ''
  
  let str = input.toString().trim().toLowerCase()
  
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }
  
  const isPM = /pm|p\.m\.|p$/.test(str)
  const isAM = /am|a\.m\.|a$/.test(str)
  
  str = str.replace(/\s*(am|pm|a\.m\.|p\.m\.|a|p)\s*/gi, '').trim()
  
  let hours = 0
  let minutes = 0
  
  if (str.includes(':')) {
    const parts = str.split(':')
    hours = parseInt(parts[0]) || 0
    minutes = parseInt(parts[1]) || 0
  } else if (str.length === 1 || str.length === 2) {
    hours = parseInt(str) || 0
    minutes = 0
  } else if (str.length === 3) {
    hours = parseInt(str[0]) || 0
    minutes = parseInt(str.slice(1)) || 0
  } else if (str.length === 4) {
    hours = parseInt(str.slice(0, 2)) || 0
    minutes = parseInt(str.slice(2)) || 0
  } else {
    return ''
  }
  
  if (isPM && hours < 12) {
    hours += 12
  } else if (isAM && hours === 12) {
    hours = 0
  }
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return ''
  }
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// Natural language date parser
export const parseNaturalLanguageDate = (text) => {
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
      case 'T':
      case 'D':
        d.setDate(d.getDate() + offset)
        break
      case 'W':
        d.setDate(d.getDate() + (offset * 7))
        break
      case 'M':
        d.setMonth(d.getMonth() + offset)
        break
    }
    
    return {
      date: d.toISOString().split('T')[0],
      cleanedText: '',
      matched: text.trim()
    }
  }
  
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
  
  const patterns = [
    { regex: /\b(today)\b/i, fn: () => new Date(today) },
    { regex: /\b(tomorrow)\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d } },
    { regex: /\b(yesterday)\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() - 1); return d } },
    { regex: /\b(next\s+)?(monday)\b/i, fn: (m) => getNextDayOfWeek(1, m[1]) },
    { regex: /\b(next\s+)?(tuesday)\b/i, fn: (m) => getNextDayOfWeek(2, m[1]) },
    { regex: /\b(next\s+)?(wednesday)\b/i, fn: (m) => getNextDayOfWeek(3, m[1]) },
    { regex: /\b(next\s+)?(thursday)\b/i, fn: (m) => getNextDayOfWeek(4, m[1]) },
    { regex: /\b(next\s+)?(friday)\b/i, fn: (m) => getNextDayOfWeek(5, m[1]) },
    { regex: /\b(next\s+)?(saturday)\b/i, fn: (m) => getNextDayOfWeek(6, m[1]) },
    { regex: /\b(next\s+)?(sunday)\b/i, fn: (m) => getNextDayOfWeek(0, m[1]) },
    { regex: /\bin\s+(\d+)\s+days?\b/i, fn: (m) => { const d = new Date(today); d.setDate(d.getDate() + parseInt(m[1])); return d } },
    { regex: /\bin\s+(\d+)\s+weeks?\b/i, fn: (m) => { const d = new Date(today); d.setDate(d.getDate() + parseInt(m[1]) * 7); return d } },
    { regex: /\bin\s+(\d+)\s+months?\b/i, fn: (m) => { const d = new Date(today); d.setMonth(d.getMonth() + parseInt(m[1])); return d } },
    { regex: /\bnext\s+week\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + 7); return d } },
    { regex: /\bnext\s+month\b/i, fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1); return d } },
    { regex: /\bend\s+of\s+week\b/i, fn: () => { const d = new Date(today); d.setDate(d.getDate() + (5 - d.getDay())); return d } },
    { regex: /\bend\s+of\s+month\b/i, fn: () => { const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return d } },
  ]
  
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
  
  // Parse numeric dates
  // Check user's explicit preference first, then fall back to browser detection
  const dateFormatPref = typeof localStorage !== 'undefined' ? localStorage.getItem('trackli-date-format') : null
  // Use includes for more robust matching
  const isUSLocale = (dateFormatPref && dateFormatPref.includes('MM/DD')) || 
                     ((!dateFormatPref || dateFormatPref === 'auto') && isUSDateFormat())
  
  
  // Full date with year
  let numericMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (numericMatch) {
    let day, month
    if (isUSLocale) {
      month = parseInt(numericMatch[1])
      day = parseInt(numericMatch[2])
    } else {
      day = parseInt(numericMatch[1])
      month = parseInt(numericMatch[2])
    }
    const year = numericMatch[3].length === 2 ? 2000 + parseInt(numericMatch[3]) : parseInt(numericMatch[3])
    // Validate the date
    const d = new Date(year, month - 1, day)
    if (!isNaN(d.getTime()) && d.getDate() === day) {
      // Format directly to avoid timezone issues with toISOString()
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return {
        date: dateStr,
        cleanedText: '',
        matched: text.trim()
      }
    }
  }
  
  // Short date without year
  numericMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (numericMatch) {
    let day, month
    if (isUSLocale) {
      month = parseInt(numericMatch[1])
      day = parseInt(numericMatch[2])
    } else {
      day = parseInt(numericMatch[1])
      month = parseInt(numericMatch[2])
    }
    let year = today.getFullYear()
    // Validate and check if date is in past
    const d = new Date(year, month - 1, day)
    if (d < today) {
      year = year + 1
    }
    if (!isNaN(d.getTime()) && d.getDate() === day) {
      // Format directly to avoid timezone issues
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return {
        date: dateStr,
        cleanedText: '',
        matched: text.trim()
      }
    }
  }
  
  return { date: null, cleanedText: text, matched: null }
}
