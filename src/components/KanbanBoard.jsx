import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

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
  { id: 'admin', label: 'Admin', color: '#6B7280' },
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

// Color palette for settings picker
const COLOR_PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', 
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#78716C', '#6B7280', '#64748B'
]

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

const getNextRecurrenceDate = (currentDate, recurrenceType) => {
  const date = new Date(currentDate)
  switch (recurrenceType) {
    case 'daily':
      date.setDate(date.getDate() + 1)
      break
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + 1)
      break
    default:
      return null
  }
  return date.toISOString().split('T')[0]
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const formatTimeEstimate = (minutes) => {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// Natural language date parser
const parseNaturalLanguageDate = (text) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
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
        <button onClick={onClose} className="p-1 hover:bg-white/20 dark:hover:bg-gray-900/20 rounded transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
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
  
  const shortcuts = [
    { keys: ['Q'], description: 'Quick add task' },
    { keys: ['⌘/Ctrl', 'T'], description: 'New task (full form)' },
    { keys: ['⌘/Ctrl', 'P'], description: 'New project' },
    { keys: ['⌘/Ctrl', 'S'], description: 'Search tasks' },
    { keys: ['/'], description: 'Quick search' },
    { keys: ['⌘/Ctrl', 'D'], description: 'My Day view' },
    { keys: ['⌘/Ctrl', 'B'], description: 'Board view' },
    { keys: ['⌘/Ctrl', 'L'], description: 'Calendar view' },
    { keys: ['⌘/Ctrl', 'N'], description: 'Import notes' },
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
const Modal = ({ isOpen, onClose, title, children, wide }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
const OnboardingOverlay = ({ step, onNext, onSkip, onComplete }) => {
  const steps = [
    {
      target: 'summary-bar',
      title: 'Welcome to Trackli! 👋',
      description: 'Let me show you around. This is your Summary Bar - click any stat to filter your tasks quickly.',
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
      description: 'Each card shows key info at a glance. The left border color indicates status. Hover to see more details!',
      position: 'right',
    },
    {
      target: 'add-task',
      title: 'Create Tasks',
      description: 'Click here or press ⌘T to create a new task. You can also press ⌘P for a new project.',
      position: 'bottom',
    },
    {
      target: 'settings',
      title: 'Settings',
      description: 'Customize your customers, assignees, and categories here. You can set colors for visual organization!',
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
          step === 3 ? 'top-20 right-32' :
          step === 4 ? 'top-20 right-48' :
          'top-20 right-32'
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

// Help Modal Component
const HelpModal = ({ isOpen, onClose, initialTab = 'board' }) => {
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
                      <div>📅 = Due date (red if overdue)</div>
                      <div>▶ = Start date</div>
                      <div>⏱ = Time estimate</div>
                    </div>
                  </div>
                </div>
              </section>
              
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">4</span>
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
                  Settings (⚙️)
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-2">Click the gear icon in the header to manage:</p>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>• <strong>Customers</strong> - Add customer names with custom colors</li>
                  <li>• <strong>Assignees</strong> - Team members who can be assigned tasks</li>
                  <li>• <strong>Categories</strong> - Task categories with colors (Meeting Follow-up, Email, etc.)</li>
                </ul>
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
                  <p>• Or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">⌘T</kbd> (Mac) / <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Ctrl+T</kbd> (Windows)</p>
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
            </div>
          )}
          
          {activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Keyboard Shortcuts</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">New Task</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘T</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">New Project</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘P</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">Import Tasks</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘N</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-gray-700 dark:text-gray-300">Quick Search</span>
                    <kbd className="px-3 py-1 bg-white dark:bg-gray-700 rounded-lg text-sm font-mono shadow-sm">⌘K</kbd>
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
                  <p>• <strong>Click task</strong> - Open task editor</p>
                  <p>• <strong>Click checkbox</strong> - Mark complete/incomplete</p>
                  <p>• <strong>Drag task</strong> - Move to different column</p>
                  <p>• <strong>Hover task</strong> - See details popup</p>
                </div>
              </section>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <p className="text-sm text-gray-500">Need more help? Contact support</p>
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
            <div className="p-8 text-center text-gray-400">
              <p>No tasks found matching "{searchQuery}"</p>
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

// Calendar View Component
const CalendarView = ({ tasks, projects, onEditTask, allTasks }) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startingDayOfWeek = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())
  
  const getTasksForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(t => t.due_date === dateStr)
  }
  
  const renderCalendarDays = () => {
    const days = []
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-28 bg-gray-50/50" />)
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
          onClick={() => setSelectedDate(isSelected ? null : dateStr)}
          className={`h-28 p-2 border-b border-r border-gray-100 cursor-pointer transition-all hover:bg-indigo-50/50 ${
            isToday ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : 
            isSelected ? 'bg-indigo-100' : 
            isPast ? 'bg-gray-50/30' : 'bg-white'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-semibold ${
              isToday ? 'text-indigo-600' : isPast ? 'text-gray-400' : 'text-gray-700'
            }`}>
              {day}
            </span>
            {dayTasks.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                overdueTasks.length > 0 ? 'bg-red-100 text-red-700' :
                criticalTasks.length > 0 ? 'bg-orange-100 text-orange-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {dayTasks.length}
              </span>
            )}
          </div>
          <div className="space-y-1 overflow-hidden">
            {dayTasks.slice(0, 3).map(task => {
              const project = projects.find(p => p.id === task.project_id)
              return (
                <div
                  key={task.id}
                  onClick={(e) => { e.stopPropagation(); onEditTask(task) }}
                  className={`text-xs px-2 py-1 rounded truncate cursor-pointer transition-all hover:ring-2 hover:ring-indigo-300 ${
                    task.status === 'done' ? 'bg-green-100 text-green-700 line-through' :
                    task.critical ? 'bg-red-100 text-red-700' :
                    isPast && !isToday ? 'bg-red-50 text-red-600' :
                    'bg-indigo-100 text-indigo-700'
                  }`}
                  title={task.title}
                >
                  {task.critical && '🚩 '}{task.title}
                </div>
              )
            })}
            {dayTasks.length > 3 && (
              <div className="text-xs text-gray-400 px-2">
                +{dayTasks.length - 3} more
              </div>
            )}
          </div>
        </div>
      )
    }
    
    return days
  }
  
  const selectedTasks = selectedDate ? tasks.filter(t => t.due_date === selectedDate) : []
  
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">
            {monthNames[month]} {year}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {tasks.filter(t => t.due_date && t.status !== 'done').length} tasks with due dates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {dayNames.map(day => (
            <div key={day} className="py-3 text-center text-sm font-semibold text-gray-600">
              {day}
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
            Tasks for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
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
      
      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-indigo-400" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>Overdue / Critical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-100" />
          <span>Completed</span>
        </div>
      </div>
    </div>
  )
}

// My Day Dashboard Component - Redesigned
const MyDayDashboard = ({ tasks, projects, onEditTask, onDragStart, allTasks, onQuickStatusChange }) => {
  const [selectedEnergy, setSelectedEnergy] = useState('all')
  const [availableTime, setAvailableTime] = useState('')
  const [expandedSection, setExpandedSection] = useState(null)
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingEmoji = hour < 12 ? '🌅' : hour < 17 ? '☀️' : '🌙'
  
  // Filter tasks for different sections
  const activeTasks = tasks.filter(t => t.status !== 'done')
  
  const overdueTasks = activeTasks.filter(t => getDueDateStatus(t.due_date, t.status) === 'overdue')
  const dueTodayTasks = activeTasks.filter(t => getDueDateStatus(t.due_date, t.status) === 'today')
  const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress')
  const readyToStartTasks = activeTasks.filter(t => isReadyToStart(t) && !isBlocked(t, allTasks))
  const blockedTasks = activeTasks.filter(t => isBlocked(t, allTasks))
  const criticalTasks = activeTasks.filter(t => t.critical && !overdueTasks.includes(t) && !dueTodayTasks.includes(t))
  
  // Focus Queue: Today's priority tasks + backlog suggestions
  const getFocusQueue = () => {
    // SECTION 1: Today's Tasks (in progress + due today + overdue) - always show these first
    let todaysTasks = [...inProgressTasks, ...dueTodayTasks, ...overdueTasks]
      .filter(t => !isBlocked(t, allTasks))
    todaysTasks = [...new Map(todaysTasks.map(t => [t.id, t])).values()]
    
    // SECTION 2: Backlog suggestions (ready to start tasks not due today)
    let backlogSuggestions = readyToStartTasks
      .filter(t => !isBlocked(t, allTasks))
      .filter(t => !dueTodayTasks.some(dt => dt.id === t.id))
      .filter(t => !inProgressTasks.some(ip => ip.id === t.id))
    
    // Apply energy filter to backlog suggestions only
    if (selectedEnergy !== 'all') {
      backlogSuggestions = backlogSuggestions.filter(t => t.energy_level === selectedEnergy)
    }
    
    // Apply time filter to backlog suggestions only
    if (availableTime) {
      const minutes = parseInt(availableTime)
      backlogSuggestions = backlogSuggestions.filter(t => !t.time_estimate || t.time_estimate <= minutes)
    }
    
    // Sort today's tasks: critical first, then by due date
    todaysTasks.sort((a, b) => {
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      // Overdue first
      const aOverdue = getDueDateStatus(a.due_date, a.status) === 'overdue'
      const bOverdue = getDueDateStatus(b.due_date, b.status) === 'overdue'
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date)
      return 0
    })
    
    // Sort backlog by critical, then time estimate (quick wins first)
    backlogSuggestions.sort((a, b) => {
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      return (a.time_estimate || 999) - (b.time_estimate || 999)
    })
    
    return {
      todaysTasks: todaysTasks.slice(0, 5),
      backlogSuggestions: backlogSuggestions.slice(0, 3)
    }
  }
  
  const focusQueue = getFocusQueue()
  
  // Calculate daily progress
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completedToday = tasks.filter(t => {
    if (t.status !== 'done' || !t.completed_at) return false
    return new Date(t.completed_at) >= todayStart
  })
  
  const totalTimeCompleted = completedToday.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  const totalTimeRemaining = [...dueTodayTasks, ...inProgressTasks].reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  
  // Progress calculation
  const totalTodayTasks = dueTodayTasks.length + completedToday.length
  const progressPercent = totalTodayTasks > 0 ? Math.round((completedToday.length / totalTodayTasks) * 100) : 0
  
  const TaskCard = ({ task, showStatus = false, compact = false }) => {
    const project = projects.find(p => p.id === task.project_id)
    const category = CATEGORIES.find(c => c.id === task.category)
    const energyStyle = ENERGY_LEVELS[task.energy_level]
    const dueDateStatus = getDueDateStatus(task.due_date, task.status)
    const blocked = isBlocked(task, allTasks)
    
    return (
      <div
        onClick={() => onEditTask(task)}
        className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
          blocked ? 'bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200' : 
          task.critical ? 'bg-gradient-to-br from-red-50 to-pink-50 border border-red-200' : 
          'bg-white border border-gray-100 hover:border-indigo-200'
        }`}
      >
        {/* Priority indicator bar */}
        <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${
          task.critical ? 'bg-red-400' : blocked ? 'bg-orange-400' : 'bg-indigo-400'
        }`} />
        
        <div className="flex items-start gap-3 pl-3">
          {/* Quick complete */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuickStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')
            }}
            className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              task.status === 'done' 
                ? 'bg-emerald-500 border-emerald-500 text-white scale-110' 
                : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50'
            }`}
          >
            {task.status === 'done' && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className={`font-medium leading-tight ${
                task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'
              }`}>
                {task.title}
              </h4>
              {task.due_date && (
                <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-lg ${
                  dueDateStatus === 'overdue' ? 'bg-red-100 text-red-700' :
                  dueDateStatus === 'today' ? 'bg-amber-100 text-amber-700' :
                  dueDateStatus === 'soon' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {dueDateStatus === 'overdue' && '⚠️ '}
                  {formatDate(task.due_date)}
                </span>
              )}
            </div>
            
            {/* Tags row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {blocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
                  🔒 Blocked
                </span>
              )}
              {task.critical && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                  🚩 Critical
                </span>
              )}
              {showStatus && (
                <span 
                  className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                  style={{ backgroundColor: COLUMN_COLORS[task.status] }}
                >
                  {COLUMNS.find(c => c.id === task.status)?.title}
                </span>
              )}
              {category && (
                <span 
                  className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: category.color }}
                >
                  {category.label}
                </span>
              )}
            </div>
            
            {/* Meta row */}
            {!compact && (
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                {project && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    {project.name}
                  </span>
                )}
                {task.time_estimate && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatTimeEstimate(task.time_estimate)}
                  </span>
                )}
                {energyStyle && (
                  <span 
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: energyStyle.bg, color: energyStyle.text }}
                  >
                    {energyStyle.icon} {task.energy_level}
                  </span>
                )}
                {task.assignee && (
                  <span className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-medium">
                      {task.assignee.charAt(0).toUpperCase()}
                    </div>
                    {task.assignee}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  const Section = ({ title, icon, tasks, color, gradient, showStatus = false, defaultExpanded = true }) => {
    const isExpanded = expandedSection === null ? defaultExpanded : expandedSection === title
    
    if (tasks.length === 0) return null
    
    return (
      <div className="mb-6">
        <button
          onClick={() => setExpandedSection(isExpanded ? (expandedSection === title ? null : title) : title)}
          className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${gradient} border border-transparent hover:shadow-md`}
        >
          <span className="text-2xl">{icon}</span>
          <div className="flex-1 text-left">
            <h3 className="font-bold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${color}`}>
            {tasks.length}
          </span>
          <svg 
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isExpanded && (
          <div className="mt-3 space-y-3 pl-4">
            {tasks.map(task => (
              <TaskCard key={task.id} task={task} showStatus={showStatus} />
            ))}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-10" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-yellow-200 to-orange-200 rounded-full blur-3xl opacity-30 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-200 to-indigo-200 rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative max-w-5xl mx-auto px-6 py-12">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-indigo-600 font-medium mb-2">
                {dayNames[today.getDay()]}, {monthNames[today.getMonth()]} {today.getDate()}
              </p>
              <h1 className="text-4xl font-black text-gray-900 mb-2">
                {greeting} {greetingEmoji}
              </h1>
              <p className="text-gray-500 text-lg">
                {activeTasks.length === 0 
                  ? "You're all caught up! Enjoy your day." 
                  : `You have ${activeTasks.length} active task${activeTasks.length !== 1 ? 's' : ''} to tackle.`
                }
              </p>
            </div>
            
            {/* Progress Ring */}
            <div className="relative">
              <ProgressRing progress={progressPercent} size={140} strokeWidth={10} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-gray-800">{progressPercent}%</span>
                <span className="text-xs text-gray-500">today</span>
              </div>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-800">{completedToday.length}</div>
                  <div className="text-sm text-gray-500">Done today</div>
                </div>
              </div>
              {totalTimeCompleted > 0 && (
                <div className="mt-3 text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full inline-block">
                  {formatTimeEstimate(totalTimeCompleted)} completed
                </div>
              )}
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-800">{dueTodayTasks.length}</div>
                  <div className="text-sm text-gray-500">Due today</div>
                </div>
              </div>
              {totalTimeRemaining > 0 && (
                <div className="mt-3 text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full inline-block">
                  {formatTimeEstimate(totalTimeRemaining)} remaining
                </div>
              )}
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-800">{inProgressTasks.length}</div>
                  <div className="text-sm text-gray-500">In progress</div>
                </div>
              </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  overdueTasks.length > 0 ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                  <svg className={`w-6 h-6 ${overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <div className={`text-2xl font-black ${overdueTasks.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {overdueTasks.length}
                  </div>
                  <div className="text-sm text-gray-500">Overdue</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Focus Queue */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-1">
            <div className="bg-white dark:bg-gray-900 rounded-[22px] p-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <span className="text-xl">✨</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-gray-100">Focus Queue</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Your priorities for today + quick wins from backlog</p>
                  </div>
                </div>
              </div>
              
              {/* Today's Tasks Section */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🎯</span>
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300">Today's Priority</h4>
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                    {focusQueue.todaysTasks.length} task{focusQueue.todaysTasks.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                {focusQueue.todaysTasks.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-3xl">✅</span>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">No urgent tasks! You're on top of things.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {focusQueue.todaysTasks.map((task, index) => (
                      <div key={task.id} className="relative">
                        {index === 0 && (
                          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                            <span className="text-white text-[10px] font-bold">1</span>
                          </div>
                        )}
                        <TaskCard task={task} showStatus={true} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Backlog Suggestions Section */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">Quick Wins from Backlog</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Energy suggestion based on time of day */}
                    {(() => {
                      const hour = new Date().getHours()
                      const suggestion = hour < 10 ? { level: 'high', text: 'Morning energy ⚡', icon: '⚡' } :
                                         hour < 14 ? { level: 'medium', text: 'Mid-day focus →', icon: '→' } :
                                         hour < 17 ? { level: 'low', text: 'Wind-down ○', icon: '○' } :
                                         { level: 'low', text: 'Evening 🌙', icon: '🌙' }
                      
                      return selectedEnergy === 'all' && (
                        <button
                          onClick={() => setSelectedEnergy(suggestion.level)}
                          className="flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all"
                        >
                          <span>{suggestion.icon}</span>
                          <span className="hidden sm:inline">{suggestion.text}</span>
                        </button>
                      )
                    })()}
                    <select
                      value={selectedEnergy}
                      onChange={(e) => setSelectedEnergy(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="all">Any energy</option>
                      <option value="high">⚡ High</option>
                      <option value="medium">→ Medium</option>
                      <option value="low">○ Low</option>
                    </select>
                    <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1">
                      <input
                        type="number"
                        value={availableTime}
                        onChange={(e) => setAvailableTime(e.target.value)}
                        placeholder="30"
                        className="w-12 px-1 py-0.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">mins</span>
                    </div>
                  </div>
                </div>
                
                {focusQueue.backlogSuggestions.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <span className="text-2xl">🌟</span>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                      {selectedEnergy !== 'all' || availableTime 
                        ? 'No matching tasks. Try adjusting filters.' 
                        : 'Backlog is clear! Add tasks to get suggestions.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {focusQueue.backlogSuggestions.map((task) => (
                      <TaskCard key={task.id} task={task} showStatus={true} compact />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Task Sections */}
        <Section 
          title="Overdue" 
          icon="🔴" 
          tasks={overdueTasks} 
          color="bg-red-100 text-red-700"
          gradient="bg-gradient-to-r from-red-50 to-pink-50"
        />
        
        <Section 
          title="Due Today" 
          icon="📅" 
          tasks={dueTodayTasks} 
          color="bg-amber-100 text-amber-700"
          gradient="bg-gradient-to-r from-amber-50 to-orange-50"
        />
        
        <Section 
          title="In Progress" 
          icon="🔄" 
          tasks={inProgressTasks} 
          color="bg-indigo-100 text-indigo-700"
          gradient="bg-gradient-to-r from-indigo-50 to-blue-50"
        />
        
        <Section 
          title="Ready to Start" 
          icon="🟢" 
          tasks={readyToStartTasks.filter(t => !dueTodayTasks.includes(t) && !inProgressTasks.includes(t))} 
          color="bg-emerald-100 text-emerald-700"
          gradient="bg-gradient-to-r from-emerald-50 to-teal-50"
          defaultExpanded={false}
        />
        
        {blockedTasks.length > 0 && (
          <Section 
            title="Blocked" 
            icon="🔒" 
            tasks={blockedTasks} 
            color="bg-orange-100 text-orange-700"
            gradient="bg-gradient-to-r from-orange-50 to-amber-50"
            showStatus={true}
            defaultExpanded={false}
          />
        )}
        
        {criticalTasks.length > 0 && (
          <Section 
            title="Other Critical" 
            icon="🚩" 
            tasks={criticalTasks} 
            color="bg-red-100 text-red-700"
            gradient="bg-gradient-to-r from-red-50 to-rose-50"
            showStatus={true}
            defaultExpanded={false}
          />
        )}
        
        {/* Empty state */}
        {activeTasks.length === 0 && (
          <div className="text-center py-16">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-100 via-teal-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
              <span className="text-6xl">🎊</span>
            </div>
            <h3 className="text-2xl font-black text-gray-800 mb-3">All clear!</h3>
            <p className="text-gray-500 text-lg max-w-md mx-auto">
              You have no active tasks. Time to add some or take a well-deserved break!
            </p>
          </div>
        )}
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
const TaskCard = ({ task, project, onEdit, onDragStart, showProject = true, allTasks = [], onQuickComplete, bulkSelectMode, isSelected, onToggleSelect, onStatusChange, onSetDueDate }) => {
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const dueDateStatus = getDueDateStatus(task.due_date, task.status)
  const blocked = isBlocked(task, allTasks)
  const recurrence = task.recurrence_type ? RECURRENCE_TYPES.find(r => r.id === task.recurrence_type) : null
  const isDone = task.status === 'done'
  const readyToStart = isReadyToStart(task)
  const category = CATEGORIES.find(c => c.id === task.category)
  const energyStyle = ENERGY_LEVELS[task.energy_level]
  
  const accentColor = blocked ? '#F97316' : task.critical ? '#EF4444' : readyToStart ? '#10B981' : COLUMN_COLORS[task.status]
  
  const hasExtraInfo = task.description || task.assignee || category || 
    (task.subtasks?.length > 0) || (task.attachments?.length > 0)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => bulkSelectMode ? onToggleSelect?.(task.id) : onEdit(task)}
      className={`task-card relative bg-white dark:bg-gray-800 rounded-lg p-2.5 shadow-sm border cursor-pointer transition-all group hover:z-[100] ${
        isSelected ? 'ring-2 ring-indigo-500 border-indigo-300' :
        blocked ? 'border-orange-200 dark:border-orange-800 hover:border-orange-300' :
        task.critical ? 'border-red-200 dark:border-red-800 hover:border-red-300' :
        readyToStart ? 'border-green-200 dark:border-green-800 hover:border-green-300' :
        'border-gray-100 dark:border-gray-700 hover:border-gray-200'
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      {/* Hover Popup Bubble */}
      {hasExtraInfo && (
        <div className="absolute left-full top-0 ml-2 z-[200] w-56 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
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
          {/* Subtasks Progress */}
          {task.subtasks?.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500">{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
            </div>
          )}
          {/* Attachments */}
          {task.attachments?.length > 0 && <div className="text-xs text-gray-500">📎 {task.attachments.length} attachment{task.attachments.length > 1 ? 's' : ''}</div>}
        </div>
      )}
      
      {/* Card Content */}
      <div className="flex items-start gap-2">
        {/* Checkbox + Effort Column */}
        <div className="flex flex-col items-center gap-1">
          {/* Checkbox */}
          {bulkSelectMode ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.id) }}
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300 dark:border-gray-500'}`}>
              {isSelected && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          ) : onQuickComplete && (
            <button onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, isDone ? 'todo' : 'done') }}
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-500 hover:border-emerald-400'}`}>
              {isDone && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          )}
          {/* Effort Indicator */}
          {energyStyle && (
            <span className="text-[10px] font-bold" style={{ color: energyStyle.text }} title={energyStyle.label}>{energyStyle.icon}</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-1">
            {blocked && <span title="Blocked" className="text-xs flex-shrink-0">🔒</span>}
            {task.critical && <span title="Critical" className="text-xs flex-shrink-0">🚩</span>}
            {recurrence && <span title={recurrence.label} className="text-xs flex-shrink-0">🔁</span>}
            <h4 className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2 leading-tight">{task.title}</h4>
          </div>
          
          {/* Dates & Effort Row */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
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
                <span>📅</span> {formatDate(task.due_date)}
              </span>
            )}
            {task.time_estimate && (
              <span className="flex items-center gap-0.5">
                <span>⏱</span> {formatTimeEstimate(task.time_estimate)}
              </span>
            )}
          </div>
          
          {/* Customer */}
          {task.customer && (
            <div className="mt-1.5">
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
          
          {/* Project at bottom */}
          {showProject && project && (
            <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{project.name}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Status Picker */}
      {onStatusChange && (
        <div className="sm:hidden mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          {showStatusPicker ? (
            <div className="flex gap-1">
              {COLUMNS.map(col => (
                <button key={col.id} onClick={(e) => { e.stopPropagation(); if (col.id !== task.status) onStatusChange(task.id, col.id); setShowStatusPicker(false) }}
                  className={`flex-1 py-1 rounded text-xs font-medium ${col.id === task.status ? 'bg-gray-200 dark:bg-gray-600' : 'bg-gray-100 dark:bg-gray-700'}`}
                  style={col.id === task.status ? { backgroundColor: col.color + '30', color: col.color } : {}}>
                  {col.id === 'backlog' ? '📥' : col.id === 'todo' ? '📋' : col.id === 'in_progress' ? '⏳' : '✅'}
                </button>
              ))}
            </div>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setShowStatusPicker(true) }} 
              className="w-full py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
              Move to...
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Column Component
const Column = ({ column, tasks, projects, onEditTask, onDragStart, onDragOver, onDrop, showProject, allTasks, onQuickComplete, onStatusChange, onSetDueDate, bulkSelectMode, selectedTaskIds, onToggleSelect }) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
  const criticalCount = tasks.filter(t => t.critical).length
  const readyCount = tasks.filter(t => isReadyToStart(t)).length
  
  const isDoneColumn = column.id === 'done'
  const displayTasks = isDoneColumn && !showAllDone 
    ? tasks.slice(0, DONE_DISPLAY_LIMIT) 
    : tasks
  const hiddenCount = isDoneColumn ? tasks.length - DONE_DISPLAY_LIMIT : 0
  
  return (
    <div
      className={`flex-shrink-0 w-[280px] sm:w-[320px] md:flex-1 md:min-w-[300px] md:max-w-[380px] bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl p-3 sm:p-4 transition-all overflow-visible ${
        isDragOver ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-900' : ''
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
      <div className="flex items-center gap-3 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">{column.title}</h3>
        <span className="ml-auto bg-white dark:bg-gray-700 px-2.5 py-0.5 rounded-full text-sm font-medium text-gray-500 dark:text-gray-300 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-4 ml-6 text-xs text-gray-400 dark:text-gray-500">
        <span>{column.subtitle}</span>
        {totalMinutes > 0 && <span>• {formatTimeEstimate(totalMinutes)}</span>}
        {criticalCount > 0 && <span className="text-red-500">• {criticalCount} critical</span>}
        {column.id === 'backlog' && readyCount > 0 && <span className="text-green-600 dark:text-green-400">• {readyCount} ready</span>}
      </div>
      
      <div className="space-y-3 overflow-visible">
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
      </div>
    </div>
  )
}

// Task Modal Component
const TaskModal = ({ isOpen, onClose, task, projects, allTasks, onSave, onDelete, loading }) => {
  const fileInputRef = useRef(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'backlog',
    critical: false,
    start_date: '',
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
    if (task) {
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
      })
      setAttachments(task.attachments || [])
      setSelectedDependencies(task.dependencies?.map(d => d.depends_on_id) || [])
      setUseCustomAssignee(isCustomAssignee)
      setCustomAssignee(isCustomAssignee ? task.assignee : '')
      setUseCustomCustomer(isCustomCustomer)
      setCustomCustomer(isCustomCustomer ? task.customer : '')
      setSubtasks(task.subtasks || [])
    } else {
      setFormData({
        title: '',
        description: '',
        project_id: projects[0]?.id || '',
        status: 'backlog',
        critical: false,
        start_date: '',
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
      })
      setAttachments([])
      setSelectedDependencies([])
      setUseCustomAssignee(false)
      setCustomAssignee('')
      setUseCustomCustomer(false)
      setCustomCustomer('')
      setSubtasks([])
    }
    setNewFiles([])
    setActiveTab('details')
    setUploadError('')
    setNewSubtaskTitle('')
  }, [task, projects, isOpen])
  
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
    <Modal isOpen={isOpen} onClose={onClose} title={task ? 'Edit Task' : 'New Task'} wide>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {[
            { id: 'details', label: 'Details' },
            { id: 'additional', label: 'Additional' },
            { id: 'subtasks', label: 'Subtasks' },
            { id: 'dependencies', label: 'Dependencies' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Add more context... (paste images here!)"
              />
              {pasteMessage && activeTab === 'details' && (
                <p className="text-sm text-green-600 mt-1">{pasteMessage}</p>
              )}
            </div>
            
            {/* Project & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project *</label>
                <select
                  required
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value, assignee: '', customer: '' })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
            <div className="grid grid-cols-2 gap-4">
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
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {Object.entries(ENERGY_LEVELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Start Date & Due Date side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
            </div>
            
            {/* Date shortcuts */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Due:</span>
              {DATE_SHORTCUTS.map(shortcut => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => setFormData({ ...formData, due_date: shortcut.getValue() })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    formData.due_date === shortcut.getValue()
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                >
                  {shortcut.label}
                </button>
              ))}
              {formData.due_date && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, due_date: '' })}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            
            {/* Critical Priority - compact inline */}
            <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={formData.critical}
                onChange={(e) => setFormData({ ...formData, critical: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🚩 Critical Priority</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">- needs immediate attention</span>
            </label>
            
            {/* Recurrence Toggle - compact like critical priority */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!formData.recurrence_type}
                  onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.checked ? 'weekly' : null })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🔁 Recurring Task</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">- recreates when completed</span>
              </label>
              
              {/* Recurrence options - shown when toggle is on */}
              {formData.recurrence_type && (
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                  <select
                    value={formData.recurrence_type || ''}
                    onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value || null })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    {RECURRENCE_TYPES.filter(t => t.id).map((type) => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                  {formData.recurrence_type && !formData.due_date && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      ⚠️ Set a due date to enable recurrence
                    </p>
                  )}
                </div>
              )}
            </div>
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
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Estimate</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={formData.time_estimate}
                  onChange={(e) => setFormData({ ...formData, time_estimate: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
            <div className="grid grid-cols-2 gap-4">
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
                    <div key={attachment.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">📄</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{attachment.file_name}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(attachment.file_size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={attachment.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                        >
                          ⬇️
                        </a>
                        <button
                          type="button"
                          onClick={() => removeExistingAttachment(attachment.id)}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500"
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
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">🔗</span>
                <div>
                  <h3 className="font-medium text-orange-800 dark:text-orange-300">Task Dependencies</h3>
                  <p className="text-sm text-orange-600 dark:text-orange-400">This task will be blocked until selected tasks are completed</p>
                </div>
              </div>
              
              {!formData.project_id ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">Select a project first to add dependencies</p>
              ) : availableDependencies.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No other tasks available to link as dependencies</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableDependencies.map((depTask) => {
                    const isSelected = selectedDependencies.includes(depTask.id)
                    return (
                      <label
                        key={depTask.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-orange-300 dark:border-orange-600 bg-orange-100 dark:bg-orange-900/40' 
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-200 dark:hover:border-orange-700'
                        }`}
                      >
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
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{depTask.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {COLUMNS.find(c => c.id === depTask.status)?.title}
                            {depTask.assignee && ` • ${depTask.assignee}`}
                          </p>
                        </div>
                        {depTask.critical && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 rounded-full">Critical</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
              
              {selectedDependencies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-700 dark:text-orange-400 font-medium">
                    ✓ {selectedDependencies.length} dependenc{selectedDependencies.length === 1 ? 'y' : 'ies'} selected - task will be blocked until complete
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex gap-3 pt-6 mt-6 border-t border-gray-100">
          {task && (
            <button
              type="button"
              onClick={() => { onDelete(task.id); onClose() }}
              disabled={loading}
              className="px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50"
          >
            {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Project Modal Component
const ProjectModal = ({ isOpen, onClose, project, onSave, onDelete, onArchive, loading }) => {
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="Enter project name"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team Members</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Customers/Clients</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomer())}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
                  if (confirm('Delete this project and all its tasks? This cannot be undone.')) {
                    onDelete(project.id)
                    onClose()
                  }
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
            {loading ? 'Saving...' : project ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Main KanbanBoard Component
export default function KanbanBoard() {
  const { user, signOut } = useAuth()
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [undoToast, setUndoToast] = useState(null) // { taskId, previousStatus, message }
  
  // View state
  const [currentView, setCurrentView] = useState('board') // 'board', 'myday', 'calendar', or 'projects'
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('trackli-dark-mode') === 'true'
    }
    return false
  })
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [helpModalTab, setHelpModalTab] = useState('board')
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('trackli_onboarding_complete')
  })
  const [onboardingStep, setOnboardingStep] = useState(0)
  
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [draggedTask, setDraggedTask] = useState(null)
  
  // Simple filters
  const [filterCritical, setFilterCritical] = useState(false)
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [filterBlocked, setFilterBlocked] = useState(false)
  const [filterActive, setFilterActive] = useState(false)
  const [filterBacklog, setFilterBacklog] = useState(false)
  const [filterDueToday, setFilterDueToday] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [filterReadyToStart, setFilterReadyToStart] = useState(false)
  const [filterTimeOperator, setFilterTimeOperator] = useState('all')
  const [filterTimeValue, setFilterTimeValue] = useState('')
  
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
  
  // Toast for undo actions
  const [toast, setToast] = useState(null)
  
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : (e.ctrlKey || e.altKey)
      
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
  }, [projects, meetingNotesData])

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (projectsError) throw projectsError

      const projectsWithRelations = await Promise.all(
        projectsData.map(async (project) => {
          const { data: members } = await supabase
            .from('project_members')
            .select('name')
            .eq('project_id', project.id)
          
          const { data: customers } = await supabase
            .from('project_customers')
            .select('name')
            .eq('project_id', project.id)
          
          return {
            ...project,
            members: members?.map(m => m.name) || [],
            customers: customers?.map(c => c.name) || [],
          }
        })
      )

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (tasksError) throw tasksError

      const tasksWithRelations = await Promise.all(
        tasksData.map(async (task) => {
          const { data: attachments } = await supabase
            .from('attachments')
            .select('*')
            .eq('task_id', task.id)
          
          const attachmentsWithUrls = attachments?.map(att => ({
            ...att,
            file_url: supabase.storage.from('attachments').getPublicUrl(att.file_path).data.publicUrl
          })) || []
          
          const { data: dependencies } = await supabase
            .from('task_dependencies')
            .select('depends_on_id')
            .eq('task_id', task.id)
          
          return { ...task, attachments: attachmentsWithUrls, dependencies: dependencies || [] }
        })
      )

      setProjects(projectsWithRelations)
      setTasks(tasksWithRelations)
      
      // Auto-move backlog tasks to todo if start date is today or past
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const tasksToMove = tasksWithRelations.filter(task => {
        if (task.status !== 'backlog') return false
        if (!task.start_date) return false
        const startDate = new Date(task.start_date)
        startDate.setHours(0, 0, 0, 0)
        return startDate <= today
      })
      
      for (const task of tasksToMove) {
        await supabase
          .from('tasks')
          .update({ status: 'todo' })
          .eq('id', task.id)
      }
      
      if (tasksToMove.length > 0) {
        const { data: updatedTasksData } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })
        
        const updatedTasksWithRelations = await Promise.all(
          updatedTasksData.map(async (task) => {
            const { data: attachments } = await supabase
              .from('attachments')
              .select('*')
              .eq('task_id', task.id)
            
            const attachmentsWithUrls = attachments?.map(att => ({
              ...att,
              file_url: supabase.storage.from('attachments').getPublicUrl(att.file_path).data.publicUrl
            })) || []
            
            const { data: dependencies } = await supabase
              .from('task_dependencies')
              .select('depends_on_id')
              .eq('task_id', task.id)
            
            return { ...task, attachments: attachmentsWithUrls, dependencies: dependencies || [] }
          })
        )
        setTasks(updatedTasksWithRelations)
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
    
    let match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (match) {
      const day = parseInt(match[1])
      const month = parseInt(match[2]) - 1
      const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])
      const date = new Date(year, month, day)
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }
    
    match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/)
    if (match) {
      const day = parseInt(match[1])
      const month = parseInt(match[2]) - 1
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
  
  const handleExtractTasks = () => {
    if (!meetingNotesData.notes.trim()) return
    
    setIsExtracting(true)
    
    setTimeout(() => {
      const extracted = extractActionItems(meetingNotesData.notes)
      setExtractedTasks(extracted)
      setShowExtractedTasks(true)
      setIsExtracting(false)
    }, 300)
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
      setError(err.message)
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
    if (!confirm(`Delete ${selectedTaskIds.size} selected tasks?`)) return
    
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
    } catch (err) {
      console.error('Error bulk deleting tasks:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
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
            subtasks: taskData.subtasks || [],
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
            subtasks: taskData.subtasks || [],
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
    } catch (err) {
      console.error('Error saving task:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (taskId) => {
    setSaving(true)
    try {
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
    } catch (err) {
      console.error('Error deleting task:', err)
      setError(err.message)
    } finally {
      setSaving(false)
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

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      
      if (newStatus === 'done' && task?.recurrence_type && task?.start_date) {
        const nextStartDate = getNextRecurrenceDate(task.start_date, task.recurrence_type)
        let nextDueDate = null
        
        if (task.due_date && nextStartDate) {
          const originalDiff = new Date(task.due_date) - new Date(task.start_date)
          const nextDue = new Date(nextStartDate)
          nextDue.setTime(nextDue.getTime() + originalDiff)
          nextDueDate = nextDue.toISOString().split('T')[0]
        }
        
        if (nextStartDate) {
          const { error: recurError } = await supabase
            .from('tasks')
            .insert({
              title: task.title,
              description: task.description,
              project_id: task.project_id,
              status: 'todo',
              critical: task.critical,
              start_date: nextStartDate,
              due_date: nextDueDate,
              assignee: task.assignee,
              time_estimate: task.time_estimate,
              energy_level: task.energy_level,
              category: task.category,
              source: task.source,
              source_link: task.source_link,
              customer: task.customer,
              notes: task.notes,
              recurrence_type: task.recurrence_type,
              recurrence_parent_id: task.recurrence_parent_id || task.id,
            })
          
          if (recurError) console.error('Error creating recurring task:', recurError)
        }
      }
      
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
  const hasActiveFilters = filterCritical || filterOverdue || filterBlocked || filterActive || filterBacklog || filterDueToday || searchQuery.trim()
  
  // Clear all filters
  const clearFilters = () => {
    setFilterCritical(false)
    setFilterOverdue(false)
    setFilterBlocked(false)
    setSearchQuery('')
  }

  const readyToStartCount = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    return isReadyToStart(t)
  }).length

  const filteredTasks = tasks.filter((t) => {
    // Project filter
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    
    // Quick toggle filters
    if (filterCritical && !t.critical) return false
    if (filterOverdue && getDueDateStatus(t.due_date, t.status) !== 'overdue') return false
    if (filterBlocked && !isBlocked(t, tasks)) return false
    if (filterActive && !['todo', 'in_progress'].includes(t.status)) return false
    if (filterBacklog && t.status !== 'backlog') return false
    if (filterDueToday && getDueDateStatus(t.due_date, t.status) !== 'today') return false
    
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
    
    // Legacy filters (if still used elsewhere)
    if (filterReadyToStart && !isReadyToStart(t)) return false
    if (filterTimeOperator !== 'all' && filterTimeValue) {
      const timeVal = parseInt(filterTimeValue)
      if (filterTimeOperator === 'lt' && (t.time_estimate || 0) >= timeVal) return false
      if (filterTimeOperator === 'gt' && (t.time_estimate || 0) <= timeVal) return false
    }
    return true
  })

  const getTasksByStatus = (status) => filteredTasks.filter((t) => t.status === status)

  // Stats
  const criticalCount = filteredTasks.filter((t) => t.critical && t.status !== 'done').length
  const overdueCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'overdue').length
  const dueTodayCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'today').length
  const blockedCount = filteredTasks.filter((t) => isBlocked(t, tasks) && t.status !== 'done').length
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        {/* Skeleton Header */}
        <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-40">
          <div className="max-w-full mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500" />
                <div>
                  <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mt-1 animate-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
                <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
        </header>
        
        {/* Skeleton Board */}
        <main className="max-w-full mx-auto px-6 py-6">
          <div className="flex gap-6 overflow-x-auto pb-6">
            <SkeletonColumn />
            <SkeletonColumn />
            <SkeletonColumn />
            <SkeletonColumn />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 transition-colors duration-200">
      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="p-1 hover:bg-white/20 dark:hover:bg-gray-900/20 rounded-lg transition-colors"
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
                    <div className="fixed sm:absolute top-0 sm:top-full left-0 h-full sm:h-auto w-72 sm:w-56 sm:mt-2 bg-white dark:bg-gray-800 sm:rounded-xl shadow-2xl border-r sm:border border-gray-200 dark:border-gray-700 py-2 z-[1000] animate-slideInFromLeft sm:animate-fadeInScale">
                      {/* Mobile header */}
                      <div className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">Menu</span>
                        <button
                          onClick={() => setNavMenuOpen(false)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
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
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">⌘D</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('board'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'board' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📋</span>
                        <span className="font-medium">Board</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">⌘B</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('calendar'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📆</span>
                        <span className="font-medium">Calendar</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">⌘L</span>
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
                          onClick={() => { signOut(); setNavMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <span className="text-lg">🚪</span>
                          <span className="font-medium">Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Current view indicator */}
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {currentView === 'myday' ? '☀️ My Day' : currentView === 'board' ? '📋 Board' : currentView === 'calendar' ? '📆 Calendar' : currentView === 'progress' ? '📊 Progress' : '📁 Projects'}
              </span>
            </div>
            
            {/* Center: Logo - hidden on smaller screens to prevent overlap */}
            <div className="absolute left-1/2 transform -translate-x-1/2 hidden xl:flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
                  className={`p-2 rounded-xl transition-colors ${bulkSelectMode ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-teal-500 text-white rounded-lg sm:rounded-xl hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-1.5"
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
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg sm:rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                title="⌘T"
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
                title="⌘N"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Import</span>
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
        
        {/* Filter Bar - only on board view */}
        {currentView === 'board' && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-3 sm:px-6 py-2.5 overflow-x-auto">
            <div className="flex items-center gap-2 sm:gap-3 min-w-max">
              {/* Project dropdown */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <option value="all">📁 All Projects</option>
                    {projects.filter(p => !p.archived || showArchivedProjects).map((p) => (
                      <option key={p.id} value={p.id}>{p.archived ? '📦 ' : '📁 '}{p.name}</option>
                    ))}
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <label className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={showArchivedProjects}
                    onChange={(e) => setShowArchivedProjects(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Archived
                </label>
              </div>
              
              
              
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors placeholder-gray-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              {/* Clear All Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Stats Bar - only show on board view */}
      {currentView === 'board' && (
        <div className="bg-white/60 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800 px-3 sm:px-6 py-2 sm:py-3 overflow-x-auto">
          <div className="max-w-full mx-auto flex items-center gap-2 sm:gap-3 text-sm min-w-max">
            {/* Active filter */}
            <button
              onClick={() => { setFilterActive(!filterActive); setFilterBacklog(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterActive
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>Active</span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-white/20">{filteredTasks.filter(t => ['todo', 'in_progress'].includes(t.status)).length}</span>
            </button>
            
            {/* Backlog filter */}
            <button
              onClick={() => { setFilterBacklog(!filterBacklog); setFilterActive(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterBacklog
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>Backlog</span>
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-white/20">{filteredTasks.filter(t => t.status === 'backlog').length}</span>
            </button>
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
            
            {/* Critical filter */}
            <button
              onClick={() => setFilterCritical(!filterCritical)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterCritical
                  ? 'bg-red-500 text-white'
                  : criticalCount > 0 
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}
            >
              <span>🚩 Critical</span>
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${filterCritical ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/50'}`}>{criticalCount}</span>
            </button>
            
            {/* Due Today filter */}
            <button
              onClick={() => setFilterDueToday(!filterDueToday)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterDueToday
                  ? 'bg-orange-500 text-white'
                  : dueTodayCount > 0
                    ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}
            >
              <span>Due Today</span>
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${filterDueToday ? 'bg-white/20' : 'bg-orange-100 dark:bg-orange-900/50'}`}>{dueTodayCount}</span>
            </button>
            
            {/* Overdue filter */}
            <button
              onClick={() => setFilterOverdue(!filterOverdue)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterOverdue
                  ? 'bg-red-600 text-white'
                  : overdueCount > 0
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
              }`}
            >
              <span>Overdue</span>
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${filterOverdue ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/50'}`}>{overdueCount}</span>
            </button>
            
            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilterActive(false)
                  setFilterBacklog(false)
                  setFilterCritical(false)
                  setFilterDueToday(false)
                  setFilterOverdue(false)
                  setFilterBlocked(false)
                  setFilterReadyToStart(false)
                  setSearchQuery('')
                }}
                className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Project Info - only show on board view */}
      {currentView === 'board' && selectedProjectId !== 'all' && (
        <div className="max-w-full mx-auto px-6 py-4">
          {projects.filter((p) => p.id === selectedProjectId).map((project) => (
            <div key={project.id} className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-100">
              <span className="font-medium text-gray-800">{project.name}</span>
              <span className="text-gray-400">•</span>
              <span className="text-sm text-gray-500">{project.members?.length || 0} members</span>
              <span className="text-gray-400">•</span>
              <span className="text-sm text-gray-500">{project.customers?.length || 0} customers</span>
              <button
                onClick={() => { setEditingProject(project); setProjectModalOpen(true) }}
                className="ml-2 p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="max-w-md mx-auto mt-20 text-center px-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Trackli!</h2>
          <p className="text-gray-500 mb-6">Get started by creating your first project.</p>
          <button
            onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25"
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
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent"
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
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent"
                      defaultValue=""
                    >
                      <option value="" disabled>Project...</option>
                      {projects.filter(p => !p.archived).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      onChange={(e) => handleBulkAssign(e.target.value)}
                      className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:ring-2 focus:ring-white/50 focus:border-transparent"
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
                tasks={tasks}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                onDragStart={handleDragStart}
                allTasks={tasks}
                onQuickStatusChange={handleUpdateTaskStatus}
              />
            </div>
          )}
          
          {currentView === 'calendar' && (
            <div key="calendar" className="animate-fadeIn">
              <CalendarView
                tasks={tasks}
                projects={projects}
                onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
                allTasks={tasks}
              />
            </div>
          )}
          
          {currentView === 'projects' && (
            <main key="projects" className="max-w-4xl mx-auto px-6 py-8 animate-fadeIn">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Projects</h2>
                <button
                  onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Project
                </button>
              </div>
              
              {/* Active Projects */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Active Projects ({projects.filter(p => !p.archived).length})</h3>
                <div className="space-y-3">
                  {projects.filter(p => !p.archived).map(project => {
                    const projectTasks = tasks.filter(t => t.project_id === project.id)
                    const doneTasks = projectTasks.filter(t => t.status === 'done').length
                    const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0
                    
                    return (
                      <div key={project.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">{project.name}</h4>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                              <span>{projectTasks.length} tasks</span>
                              <span>•</span>
                              <span>{project.members?.length || 0} members</span>
                              <span>•</span>
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
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12">{progress}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => { setSelectedProjectId(project.id); setCurrentView('board') }}
                              className="px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                            >
                              View Board
                            </button>
                            <button
                              onClick={() => { setEditingProject(project); setProjectModalOpen(true) }}
                              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleArchiveProject(project.id)}
                              className="p-2 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
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
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <p>No active projects yet</p>
                      <p className="text-sm mt-1">Create your first project to get started</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Archived Projects */}
              {projects.filter(p => p.archived).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Archived ({projects.filter(p => p.archived).length})</h3>
                  <div className="space-y-3">
                    {projects.filter(p => p.archived).map(project => {
                      const projectTasks = tasks.filter(t => t.project_id === project.id)
                      
                      return (
                        <div key={project.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 opacity-75">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">📦</span>
                                <h4 className="font-semibold text-gray-600 dark:text-gray-400">{project.name}</h4>
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">{projectTasks.length} tasks</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleArchiveProject(project.id)}
                                className="px-3 py-1.5 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                              >
                                Unarchive
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Delete this project and all its tasks? This cannot be undone.')) {
                                    handleDeleteProject(project.id)
                                  }
                                }}
                                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
            <main className="max-w-4xl mx-auto px-6 py-8">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">📊 Progress Dashboard</h2>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
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
                    <span className="text-2xl">📅</span>
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
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Last 7 Days</h3>
                <div className="flex items-end justify-between gap-2 h-32">
                  {(() => {
                    const days = []
                    for (let i = 6; i >= 0; i--) {
                      const date = new Date()
                      date.setDate(date.getDate() - i)
                      date.setHours(0, 0, 0, 0)
                      const dateStr = date.toDateString()
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
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
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
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
                    <p className="text-center py-8 text-gray-500 dark:text-gray-400">No completed tasks yet. Get started! 💪</p>
                  )}
                </div>
              </div>
            </main>
          )}
          
          {currentView === 'board' && (
            <main className="max-w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
              <div className="flex gap-3 sm:gap-6 overflow-x-auto overflow-y-visible pb-4 sm:pb-6 -mx-3 px-3 sm:mx-0 sm:px-0">
                {COLUMNS.map((column) => (
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
                    
                  />
                ))}
              </div>
            </main>
          )}
        </>
      )}

      {/* Modals */}
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        task={editingTask}
        projects={projects}
        allTasks={tasks}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        loading={saving}
      />
      
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => { setProjectModalOpen(false); setEditingProject(null) }}
        project={editingProject}
        onSave={handleSaveProject}
        onDelete={handleDeleteProject}
        onArchive={handleArchiveProject}
        loading={saving}
      />
      
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        tasks={tasks}
        projects={projects}
        onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
        allTasks={tasks}
      />
      

      
      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => { setHelpModalOpen(false); setHelpModalTab('board') }}
        initialTab={helpModalTab}
      />
      
      {/* Onboarding Overlay */}
      {showOnboarding && currentView === 'board' && (
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
      
      {/* Meeting Notes Import Modal */}
      <Modal 
        isOpen={meetingNotesModalOpen} 
        onClose={() => setMeetingNotesModalOpen(false)} 
        title="Import Meeting Notes"
        wide
      >
        {!showExtractedTasks ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Paste your meeting notes below. We'll extract action items and create tasks automatically.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={meetingNotesData.title}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                  placeholder="e.g., Weekly Team Sync"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Date</label>
                <input
                  type="date"
                  value={meetingNotesData.date}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={meetingNotesData.projectId}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Notes</label>
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
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-sm"
              />
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400">
                Tip: Follow-Up tables are extracted first, then we scan for action items
              </p>
              <button
                onClick={handleExtractTasks}
                disabled={!meetingNotesData.notes.trim() || isExtracting}
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
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setQuickAddOpen(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:mx-4 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Quick Add Task</h3>
              <button
                onClick={() => setQuickAddOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <input
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder='Try "Call mom tomorrow" or "Report due friday"'
                    autoFocus
                    className="w-full px-4 py-3 text-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-2"
                  />
                  
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
                        setQuickAddOpen(false)
                        setEditingTask(null)
                        setTaskModalOpen(true)
                      }}
                      className="px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
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
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p className="text-lg mb-2">🎉 Backlog is empty!</p>
                    <p className="text-sm">All tasks are either planned or done.</p>
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
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full shadow-lg shadow-indigo-500/40 flex items-center justify-center z-30 active:scale-95 transition-transform"
        disabled={projects.length === 0}
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>
    </div>
  )
}
