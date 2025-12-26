import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Constants
const ENERGY_LEVELS = {
  high: { bg: '#FEF3C7', text: '#92400E', icon: '⚡', label: 'High Energy' },
  medium: { bg: '#E0E7FF', text: '#3730A3', icon: '→', label: 'Medium Energy' },
  low: { bg: '#F0FDF4', text: '#166534', icon: '○', label: 'Low Energy' },
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
  backlog: '#8B5CF6',
  todo: '#6366F1',
  in_progress: '#14B8A6',
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
    { keys: ['⌘/Ctrl', 'N'], description: 'New task' },
    { keys: ['⌘/Ctrl', 'P'], description: 'New project' },
    { keys: ['⌘/Ctrl', 'S'], description: 'Search tasks' },
    { keys: ['/'], description: 'Quick search' },
    { keys: ['⌘/Ctrl', 'D'], description: 'My Day view' },
    { keys: ['⌘/Ctrl', 'B'], description: 'Board view' },
    { keys: ['⌘/Ctrl', 'L'], description: 'Calendar view' },
    { keys: ['⌘/Ctrl', 'M'], description: 'Meeting notes' },
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

// Empty State Component
const EmptyState = ({ icon, title, description, action, actionLabel }) => (
  <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">{title}</h3>
    <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">{description}</p>
    {action && (
      <button
        onClick={action}
        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/25"
      >
        {actionLabel}
      </button>
    )}
  </div>
)

// Modal Component
const Modal = ({ isOpen, onClose, title, children, wide }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
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
  
  // Suggested tasks based on energy and time
  const getSuggestedTasks = () => {
    let candidates = [...inProgressTasks, ...dueTodayTasks, ...readyToStartTasks]
      .filter(t => !isBlocked(t, allTasks))
    
    candidates = [...new Map(candidates.map(t => [t.id, t])).values()]
    
    if (selectedEnergy !== 'all') {
      candidates = candidates.filter(t => t.energy_level === selectedEnergy)
    }
    
    if (availableTime) {
      const minutes = parseInt(availableTime)
      candidates = candidates.filter(t => !t.time_estimate || t.time_estimate <= minutes)
    }
    
    candidates.sort((a, b) => {
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      if (a.due_date && b.due_date) {
        return new Date(a.due_date) - new Date(b.due_date)
      }
      return (a.time_estimate || 999) - (b.time_estimate || 999)
    })
    
    return candidates.slice(0, 5)
  }
  
  const suggestedTasks = getSuggestedTasks()
  
  // Calculate daily progress
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completedToday = tasks.filter(t => {
    if (t.status !== 'done') return false
    const updatedAt = new Date(t.updated_at || t.created_at)
    return updatedAt >= todayStart
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
        {/* Smart Suggestions */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-1">
            <div className="bg-white rounded-[22px] p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <span className="text-xl">✨</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Focus Queue</h3>
                    <p className="text-sm text-gray-500">AI-suggested tasks based on your priorities</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedEnergy}
                    onChange={(e) => setSelectedEnergy(e.target.value)}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="all">Any energy</option>
                    <option value="high">⚡ High</option>
                    <option value="medium">→ Medium</option>
                    <option value="low">○ Low</option>
                  </select>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-sm text-gray-500">I have</span>
                    <input
                      type="number"
                      value={availableTime}
                      onChange={(e) => setAvailableTime(e.target.value)}
                      placeholder="30"
                      className="w-14 px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
                    />
                    <span className="text-sm text-gray-500">mins</span>
                  </div>
                </div>
              </div>
              
              {suggestedTasks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mx-auto mb-4">
                    <span className="text-4xl">🎉</span>
                  </div>
                  <h4 className="text-lg font-bold text-gray-800 mb-2">You're all caught up!</h4>
                  <p className="text-gray-500">No matching tasks right now. Time for a break?</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestedTasks.map((task, index) => (
                    <div key={task.id} className="relative">
                      {index === 0 && (
                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">1</span>
                        </div>
                      )}
                      <TaskCard task={task} showStatus={true} />
                    </div>
                  ))}
                </div>
              )}
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
const TaskCard = ({ task, project, onEdit, onDragStart, showProject = true, allTasks = [], onQuickComplete, bulkSelectMode, isSelected, onToggleSelect }) => {
  const dueDateStatus = getDueDateStatus(task.due_date, task.status)
  const energyStyle = ENERGY_LEVELS[task.energy_level]
  const category = CATEGORIES.find(c => c.id === task.category)
  const source = SOURCES.find(s => s.id === task.source)
  const readyToStart = isReadyToStart(task)
  const blocked = isBlocked(task, allTasks)
  const recurrence = task.recurrence_type ? RECURRENCE_TYPES.find(r => r.id === task.recurrence_type) : null
  const isDone = task.status === 'done'
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => bulkSelectMode ? onToggleSelect?.(task.id) : onEdit(task)}
      className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-all group ${
        isSelected
          ? 'ring-2 ring-indigo-500 border-indigo-300 dark:border-indigo-600'
          : blocked
          ? 'border-orange-200 dark:border-orange-800 hover:border-orange-300 ring-1 ring-orange-100 dark:ring-orange-900 opacity-75'
          : task.critical 
          ? 'border-red-200 dark:border-red-800 hover:border-red-300 ring-1 ring-red-100 dark:ring-red-900' 
          : readyToStart
          ? 'border-green-200 dark:border-green-800 hover:border-green-300'
          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      }`}
      style={{ borderLeftWidth: '4px', borderLeftColor: blocked ? '#F97316' : task.critical ? '#EF4444' : readyToStart ? '#10B981' : (category?.color || COLUMN_COLORS[task.status]) }}
    >
      {/* Quick Complete Checkbox or Bulk Select */}
      <div className="flex items-start gap-3">
        {bulkSelectMode ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect?.(task.id)
            }}
            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              isSelected
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
            }`}
          >
            {isSelected && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ) : onQuickComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuickComplete(task.id, isDone ? 'todo' : 'done')
            }}
            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              isDone
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            }`}
            title={isDone ? 'Mark as not done' : 'Mark as done'}
          >
            {isDone && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}
        <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {blocked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Blocked
          </span>
        )}
        {task.critical && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
            <svg className="w-3 h-3" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Critical
          </span>
        )}
        {recurrence && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {recurrence.label}
          </span>
        )}
        {readyToStart && !blocked && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Ready
          </span>
        )}
        {category && (
          <span 
            className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
            style={{ backgroundColor: category.color }}
          >
            {category.label}
          </span>
        )}
      </div>
      
      <h4 className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
        {task.title}
      </h4>
      
      {task.customer && (
        <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mb-2">
          {task.customer}
        </p>
      )}
      
      {task.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{task.description}</p>
      )}
      
      {/* Subtasks Progress */}
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length} subtasks</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      <div className="flex items-center gap-3 mb-3 text-xs">
        {task.time_estimate && (
          <span className="flex items-center gap-1 text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatTimeEstimate(task.time_estimate)}
          </span>
        )}
        {energyStyle && (
          <span 
            className="flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: energyStyle.bg, color: energyStyle.text }}
          >
            {energyStyle.icon} {task.energy_level}
          </span>
        )}
        {source && (
          <span className="text-gray-400" title={source.label}>
            {source.icon}
          </span>
        )}
        {task.attachments?.length > 0 && (
          <span className="text-gray-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {task.attachments.length}
          </span>
        )}
      </div>
      
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {task.assignee && (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white bg-purple-500">
                {task.assignee.charAt(0).toUpperCase()}
              </div>
              <span className="text-gray-600 text-xs">{task.assignee}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {task.start_date && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
              readyToStart ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'
            }`}>
              <span>Start:</span>
              {formatDate(task.start_date)}
            </div>
          )}
          {task.due_date && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              dueDateStatus === 'overdue'
                ? 'bg-red-50 text-red-700'
                : dueDateStatus === 'today'
                ? 'bg-orange-50 text-orange-700'
                : dueDateStatus === 'soon'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-gray-50 text-gray-600'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(task.due_date)}
              {dueDateStatus === 'overdue' && ' (overdue)'}
              {dueDateStatus === 'today' && ' (today)'}
            </div>
          )}
        </div>
      </div>
      
      {showProject && project && (
        <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-700">
          <span className="text-xs text-gray-400">{project.name}</span>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

// Column Component
const Column = ({ column, tasks, projects, onEditTask, onDragStart, onDragOver, onDrop, showProject, allTasks, onQuickComplete }) => {
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
      className={`flex-1 min-w-[300px] max-w-[380px] bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl p-4 transition-all ${
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
      
      <div className="space-y-3">
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
            { id: 'subtasks', label: 'Subtasks' },
            { id: 'planning', label: 'Planning' },
            { id: 'recurring', label: 'Recurring & Deps' },
            { id: 'notes', label: 'Notes & Files' },
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
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-700">Priority</p>
                <p className="text-sm text-gray-500">Flag this task if it needs immediate attention</p>
              </div>
              <CriticalToggle 
                checked={formData.critical} 
                onChange={(val) => setFormData({ ...formData, critical: val })}
              />
            </div>
            
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
                <select
                  required
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value, assignee: '', customer: '' })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer/Client</label>
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
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      placeholder="Customer name"
                    />
                    <button
                      type="button"
                      onClick={() => { setUseCustomCustomer(false); setCustomCustomer('') }}
                      className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  {SOURCES.map((src) => (
                    <option key={src.id} value={src.id}>{src.icon} {src.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Link</label>
              <input
                type="text"
                value={formData.source_link}
                onChange={(e) => setFormData({ ...formData, source_link: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="URL or reference to the source"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter name"
                  />
                  <button
                    type="button"
                    onClick={() => { setUseCustomAssignee(false); setCustomAssignee('') }}
                    className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    ✕
                  </button>
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
        
        {activeTab === 'planning' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Energy Level Required</label>
                <select
                  value={formData.energy_level}
                  onChange={(e) => setFormData({ ...formData, energy_level: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                >
                  {Object.entries(ENERGY_LEVELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon} {val.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank if ready to start anytime</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Estimate (minutes)</label>
              <input
                type="number"
                min="0"
                step="5"
                value={formData.time_estimate}
                onChange={(e) => setFormData({ ...formData, time_estimate: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="e.g., 30, 60, 120"
              />
              {formData.time_estimate && (
                <p className="text-xs text-gray-400 mt-1">({formatTimeEstimate(parseInt(formData.time_estimate))})</p>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'recurring' && (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <h3 className="font-medium text-blue-800">Recurrence</h3>
              </div>
              <p className="text-sm text-blue-600 mb-4">When this task is marked as done, it will automatically create a new instance.</p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Repeat</label>
                <select
                  value={formData.recurrence_type || ''}
                  onChange={(e) => setFormData({ ...formData, recurrence_type: e.target.value || null })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                >
                  {RECURRENCE_TYPES.map((type) => (
                    <option key={type.id || 'none'} value={type.id || ''}>{type.label}</option>
                  ))}
                </select>
                {formData.recurrence_type && formData.start_date && (
                  <p className="text-xs text-blue-600 mt-2">
                    Next occurrence will start on: {formatDate(getNextRecurrenceDate(formData.start_date, formData.recurrence_type))}
                  </p>
                )}
                {formData.recurrence_type && !formData.start_date && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Set a start date in the Planning tab to enable recurrence
                  </p>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-orange-50 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <h3 className="font-medium text-orange-800">Dependencies</h3>
              </div>
              <p className="text-sm text-orange-600 mb-4">This task will be blocked until all dependencies are completed.</p>
              
              {!formData.project_id ? (
                <p className="text-sm text-gray-500 italic">Select a project first to add dependencies</p>
              ) : availableDependencies.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No other tasks available to link as dependencies</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableDependencies.map((depTask) => {
                    const isSelected = selectedDependencies.includes(depTask.id)
                    return (
                      <label
                        key={depTask.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-orange-300 bg-orange-100' 
                            : 'border-gray-200 bg-white hover:border-orange-200'
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
                          className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{depTask.title}</p>
                          <p className="text-xs text-gray-500">
                            {COLUMNS.find(c => c.id === depTask.status)?.title}
                            {depTask.assignee && ` • ${depTask.assignee}`}
                          </p>
                        </div>
                        {depTask.critical && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Critical</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
              
              {selectedDependencies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-orange-200">
                  <p className="text-sm text-orange-700 font-medium">
                    {selectedDependencies.length} dependenc{selectedDependencies.length === 1 ? 'y' : 'ies'} selected
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onPaste={handlePaste}
                rows={6}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                placeholder="Running notes, context, updates... (paste images here!)"
              />
              {pasteMessage && activeTab === 'notes' && (
                <p className="text-sm text-green-600 mt-1">{pasteMessage}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Click to upload files'}
                </button>
                <p className="text-xs text-gray-400 mt-1">Max 10MB per file</p>
              </div>
              
              {uploadError && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {uploadError}
                </div>
              )}
              
              {(attachments.length > 0 || newFiles.length > 0) && (
                <div className="mt-4 space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">{attachment.file_name}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(attachment.file_size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={attachment.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                        <button
                          type="button"
                          onClick={() => removeExistingAttachment(attachment.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {newFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-700">{file.name}</p>
                          <p className="text-xs text-green-600">New • {formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeNewFile(index)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [draggedTask, setDraggedTask] = useState(null)
  
  // Unified filters: array of {type: 'assignee'|'customer'|'critical'|'status', value: string}
  const [activeFilters, setActiveFilters] = useState([])
  const [filterType, setFilterType] = useState('') // For the "add filter" UI
  
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
  
  // Keyboard shortcuts modal
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  
  // Bulk selection
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set())
  
  // Archive filter
  const [showArchived, setShowArchived] = useState(false)

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
      
      // Cmd/Ctrl/Alt + P for Projects view
      if (modifier && e.key === 'p') {
        e.preventDefault()
        setCurrentView('projects')
        return
      }
      
      // ? for keyboard shortcuts help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShortcutsModalOpen(true)
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
        .update({ status: newStatus })
        .eq('id', taskId)
      
      if (error) throw error
      
      const previousStatus = task?.status
      
      if (newStatus === 'done' && task?.recurrence_type) {
        await fetchData()
      } else {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
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
  
  // Helper to get active filter value by type
  const getFilterValue = (type) => activeFilters.find(f => f.type === type)?.value
  
  // Helper to add a filter
  const addFilter = (type, value) => {
    // Remove existing filter of same type, then add new one
    setActiveFilters(prev => [...prev.filter(f => f.type !== type), { type, value }])
    setFilterType('')
  }
  
  // Helper to remove a filter
  const removeFilter = (type) => {
    setActiveFilters(prev => prev.filter(f => f.type !== type))
  }
  
  // Get filter options based on selected type
  const getFilterOptions = (type) => {
    switch (type) {
      case 'assignee': return allAssignees.map(a => ({ value: a, label: a }))
      case 'customer': return allCustomers.map(c => ({ value: c, label: c }))
      case 'critical': return [
        { value: 'critical', label: '🚩 Critical Only' },
        { value: 'regular', label: 'Regular Only' }
      ]
      case 'status': return [
        { value: 'backlog', label: 'Backlog' },
        { value: 'todo', label: 'To Do' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'done', label: 'Done' }
      ]
      default: return []
    }
  }
  
  // Filter type labels
  const filterTypeLabels = {
    assignee: 'Assignee',
    customer: 'Customer', 
    critical: 'Priority',
    status: 'Status'
  }

  const readyToStartCount = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    const assigneeFilter = getFilterValue('assignee')
    const customerFilter = getFilterValue('customer')
    const criticalFilter = getFilterValue('critical')
    const statusFilter = getFilterValue('status')
    if (assigneeFilter && t.assignee !== assigneeFilter) return false
    if (customerFilter && t.customer !== customerFilter) return false
    if (criticalFilter === 'critical' && !t.critical) return false
    if (criticalFilter === 'regular' && t.critical) return false
    if (statusFilter && t.status !== statusFilter) return false
    if (filterTimeOperator !== 'all' && filterTimeValue) {
      const timeVal = parseInt(filterTimeValue)
      if (filterTimeOperator === 'lt' && (t.time_estimate || 0) >= timeVal) return false
      if (filterTimeOperator === 'gt' && (t.time_estimate || 0) <= timeVal) return false
    }
    return isReadyToStart(t)
  }).length

  const filteredTasks = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    const assigneeFilter = getFilterValue('assignee')
    const customerFilter = getFilterValue('customer')
    const criticalFilter = getFilterValue('critical')
    const statusFilter = getFilterValue('status')
    if (assigneeFilter && t.assignee !== assigneeFilter) return false
    if (customerFilter && t.customer !== customerFilter) return false
    if (criticalFilter === 'critical' && !t.critical) return false
    if (criticalFilter === 'regular' && t.critical) return false
    if (statusFilter && t.status !== statusFilter) return false
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
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Clickable Logo with Nav Menu */}
              <div className="relative">
                <button
                  onClick={() => setNavMenuOpen(!navMenuOpen)}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                      Trackli
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {currentView === 'myday' ? '☀️ My Day' : currentView === 'board' ? '📋 Board' : currentView === 'calendar' ? '📆 Calendar' : '📁 Projects'}
                    </p>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${navMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Nav Dropdown Menu */}
                {navMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNavMenuOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Views</div>
                      <button
                        onClick={() => { setCurrentView('myday'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${currentView === 'myday' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">☀️</span>
                        <span className="font-medium">My Day</span>
                        <span className="ml-auto text-xs text-gray-400">⌘D</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('board'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${currentView === 'board' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📋</span>
                        <span className="font-medium">Board</span>
                        <span className="ml-auto text-xs text-gray-400">⌘B</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('calendar'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${currentView === 'calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📆</span>
                        <span className="font-medium">Calendar</span>
                        <span className="ml-auto text-xs text-gray-400">⌘L</span>
                      </button>
                      
                      <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Manage</div>
                      <button
                        onClick={() => { setCurrentView('projects'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${currentView === 'projects' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        <span className="text-lg">📁</span>
                        <span className="font-medium">Projects</span>
                        <span className="ml-auto text-xs text-gray-400">⌘P</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Search Button */}
              <button
                onClick={() => setSearchModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
                title="⌘/Ctrl+S or /"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span><span className="underline">S</span>earch</span>
                <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">/</kbd>
              </button>
              
              {/* Dark Mode Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
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
              
              {/* Keyboard Shortcuts */}
              <button
                onClick={() => setShortcutsModalOpen(true)}
                className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-all"
                title="Keyboard shortcuts (?)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              {/* Bulk Select Toggle */}
              {currentView === 'board' && (
                <button
                  onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedTaskIds(new Set()) }}
                  className={`p-2 border rounded-xl transition-all ${
                    bulkSelectMode
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  title="Bulk select tasks"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </button>
              )}
              
              {currentView === 'board' && (
                <>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    >
                      <option value="all">All Projects</option>
                      {projects.filter(p => !p.archived || showArchivedProjects).map((p) => (
                        <option key={p.id} value={p.id}>{p.archived ? '📦 ' : ''}{p.name}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showArchivedProjects}
                        onChange={(e) => setShowArchivedProjects(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Archived
                    </label>
                  </div>
                  
                  {/* Unified Filter UI */}
                  <div className="flex items-center gap-2">
                    {/* Active filter chips */}
                    {activeFilters.map(filter => (
                      <span 
                        key={filter.type}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm"
                      >
                        <span className="text-indigo-500 dark:text-indigo-400 text-xs">{filterTypeLabels[filter.type]}:</span>
                        <span className="font-medium">{filter.value === 'critical' ? '🚩 Critical' : filter.value === 'regular' ? 'Regular' : filter.value}</span>
                        <button 
                          onClick={() => removeFilter(filter.type)}
                          className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    
                    {/* Add filter dropdown */}
                    <div className="flex items-center gap-1">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="">+ Add filter</option>
                        {!getFilterValue('assignee') && allAssignees.length > 0 && <option value="assignee">Assignee</option>}
                        {!getFilterValue('customer') && allCustomers.length > 0 && <option value="customer">Customer</option>}
                        {!getFilterValue('critical') && <option value="critical">Priority</option>}
                        {!getFilterValue('status') && <option value="status">Status</option>}
                      </select>
                      
                      {filterType && (
                        <select
                          value=""
                          onChange={(e) => e.target.value && addFilter(filterType, e.target.value)}
                          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          autoFocus
                        >
                          <option value="">Select {filterTypeLabels[filterType]}...</option>
                          {getFilterOptions(filterType).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    
                    {activeFilters.length > 0 && (
                      <button
                        onClick={() => setActiveFilters([])}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </>
              )}
              
              <button
                onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}
                disabled={projects.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                title="⌘/Ctrl+T"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>New <span className="underline">T</span>ask</span>
              </button>
              
              <button
                onClick={() => {
                  setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
                  setExtractedTasks([])
                  setShowExtractedTasks(false)
                  setMeetingNotesModalOpen(true)
                }}
                disabled={projects.length === 0}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="⌘/Ctrl+N"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Import <span className="underline">N</span>otes</span>
              </button>
              
              <button
                onClick={signOut}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar - only show on board view */}
      {currentView === 'board' && (
        <div className="bg-white/60 border-b border-gray-100 px-6 py-3">
          <div className="max-w-full mx-auto flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Active:</span>
              <span className="font-semibold text-gray-800">{filteredTasks.filter(t => t.status !== 'done').length} tasks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Total time:</span>
              <span className="font-semibold text-gray-800">{formatTimeEstimate(totalEstimatedTime) || '0h'}</span>
            </div>
            
            {readyToStartCount > 0 && (
              <button
                onClick={() => setFilterReadyToStart(!filterReadyToStart)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all ${
                  filterReadyToStart ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{readyToStartCount} ready in backlog</span>
                {filterReadyToStart && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            )}
            
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-50 rounded-lg">
                <span className="text-red-600 font-medium">🚩 {criticalCount} critical</span>
              </div>
            )}
            {dueTodayCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 rounded-lg">
                <span className="text-orange-600 font-medium">{dueTodayCount} due today</span>
              </div>
            )}
            {overdueCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-50 rounded-lg">
                <span className="text-red-600 font-medium">{overdueCount} overdue</span>
              </div>
            )}
            {blockedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 rounded-lg">
                <span className="text-orange-600 font-medium">🔒 {blockedCount} blocked</span>
              </div>
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
            <MyDayDashboard
              tasks={tasks}
              projects={projects}
              onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
              onDragStart={handleDragStart}
              allTasks={tasks}
              onQuickStatusChange={handleUpdateTaskStatus}
            />
          )}
          
          {currentView === 'calendar' && (
            <CalendarView
              tasks={tasks}
              projects={projects}
              onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
              allTasks={tasks}
            />
          )}
          
          {currentView === 'projects' && (
            <main className="max-w-4xl mx-auto px-6 py-8">
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
          
          {currentView === 'board' && (
            <main className="max-w-full mx-auto px-6 py-6">
              <div className="flex gap-6 overflow-x-auto pb-6">
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
      
      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  )
}
