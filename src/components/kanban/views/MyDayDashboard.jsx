import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ENERGY_LEVELS } from '../constants'
import { getDueDateStatus, isBlocked, formatDate } from '../utils'
import { TaskCardIcons, MenuIcons } from '../icons'
import { GreetingIcon, EmptyState } from '../ui/EmptyState'

// Lazy load confetti - only needed when completing tasks
const loadConfetti = () => import('canvas-confetti').then(m => m.default)

// Get estimated minutes for a task
const getTaskMinutes = (task) => {
  if (task.time_estimate) return task.time_estimate
  // Default based on energy level
  switch (task.energy_level) {
    case 'high': return 240 // 4 hours
    case 'medium': return 120 // 2 hours
    case 'low': return 30 // 30 minutes
    default: return 60 // 1 hour default
  }
}

// Calculate priority score for a task (higher = more urgent)
const getTaskPriorityScore = (task) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
  
  const dueDate = task.due_date ? new Date(task.due_date) : null
  const startDate = task.start_date ? new Date(task.start_date) : null
  if (dueDate) dueDate.setHours(0, 0, 0, 0)
  if (startDate) startDate.setHours(0, 0, 0, 0)
  
  const isOverdue = dueDate && dueDate < today
  const isDueToday = dueDate && dueDate.getTime() === today.getTime()
  const isDueSoon = dueDate && dueDate > today && dueDate <= endOfWeek
  const isDueAfterWeek = dueDate && dueDate > endOfWeek
  const hasStartedOrPast = startDate && startDate <= today
  const startsThisWeek = startDate && startDate > today && startDate <= endOfWeek
  
  let score = 0
  
  if (task.critical) {
    if (isOverdue) score = 110 // Critical + overdue (highest)
    else if (hasStartedOrPast && isDueToday) score = 100 // Critical + started + due today
    else if (hasStartedOrPast && isDueSoon) score = 90 // Critical + started + due soon
    else if (isDueToday) score = 80 // Critical + due today
    else if (isDueSoon) score = 70 // Critical + due soon
    else if (hasStartedOrPast) score = 60 // Critical + started
    else score = 50 // Critical without dates
  } else {
    if (isOverdue) score = 45 // Overdue
    else if (hasStartedOrPast && isDueToday) score = 40 // Started + due today
    else if (hasStartedOrPast && isDueSoon) score = 35 // Started + due soon
    else if (isDueToday) score = 30 // Due today
    else if (isDueSoon) score = 25 // Due this week
    else if (startsThisWeek) score = 20 // Starts this week
    else if (isDueAfterWeek) score = 15 // Due after this week
    else if (hasStartedOrPast) score = 10 // Started but no due date
    else score = 5 // No dates
  }
  
  return score
}

// Plan My Day Modal
const PlanMyDayModal = ({ isOpen, onClose, allTasks, projects, onAcceptPlan }) => {
  const [availableMinutes, setAvailableMinutes] = useState(240) // 4 hours default
  const [suggestedTasks, setSuggestedTasks] = useState([])
  const [step, setStep] = useState(1) // 1 = input time, 2 = review plan
  
  // Get all eligible tasks (not done, not already in my day today)
  const eligibleTasks = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    
    return allTasks.filter(task => {
      if (task.status === 'done') return false
      // Don't include tasks already explicitly in My Day today
      if (task.my_day_date === todayStr) return false
      // Don't include tasks from archived projects
      const project = projects.find(p => p.id === task.project_id)
      if (project?.archived) return false
      return true
    })
  }, [allTasks, projects])
  
  const generatePlan = () => {
    // Sort tasks by priority score
    const sorted = [...eligibleTasks].sort((a, b) => getTaskPriorityScore(b) - getTaskPriorityScore(a))
    
    // Pick tasks that fit within available time
    let remainingMinutes = availableMinutes
    const selected = []
    
    for (const task of sorted) {
      const taskMins = getTaskMinutes(task)
      if (taskMins <= remainingMinutes) {
        selected.push({ ...task, estimatedMinutes: taskMins })
        remainingMinutes -= taskMins
      }
      // Stop if we've filled the time or have enough tasks
      if (remainingMinutes <= 0 || selected.length >= 10) break
    }
    
    setSuggestedTasks(selected)
    setStep(2)
  }
  
  const moveTask = (index, direction) => {
    const newTasks = [...suggestedTasks]
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= newTasks.length) return
    [newTasks[index], newTasks[newIndex]] = [newTasks[newIndex], newTasks[index]]
    setSuggestedTasks(newTasks)
  }
  
  const removeTask = (index) => {
    setSuggestedTasks(prev => prev.filter((_, i) => i !== index))
  }
  
  const totalMinutes = suggestedTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
  
  const formatTime = (mins) => {
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remaining = mins % 60
      return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
    }
    return `${mins}m`
  }
  
  const handleAccept = () => {
    onAcceptPlan(suggestedTasks.map(t => t.id))
    onClose()
    setStep(1)
    setSuggestedTasks([])
  }
  
  const handleClose = () => {
    onClose()
    setStep(1)
    setSuggestedTasks([])
  }
  
  if (!isOpen) return null
  
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Plan My Day</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {step === 1 ? 'How much time do you have?' : 'Review your suggested plan'}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 1 ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Available time today
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[60, 120, 240, 480].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setAvailableMinutes(mins)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        availableMinutes === mins
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {formatTime(mins)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={availableMinutes}
                    onChange={(e) => setAvailableMinutes(Math.max(15, parseInt(e.target.value) || 0))}
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                    min="15"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">minutes</span>
                </div>
              </div>
              
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                <h4 className="text-sm font-medium text-indigo-900 dark:text-indigo-300 mb-2">How it works</h4>
                <ul className="text-xs text-indigo-700 dark:text-indigo-400 space-y-1">
                  <li>• Prioritizes critical and overdue tasks first</li>
                  <li>• Considers start dates and due dates</li>
                  <li>• Estimates time based on your effort levels</li>
                  <li>• You can rearrange or remove tasks before accepting</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestedTasks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No tasks found to suggest.</p>
                  <button onClick={() => setStep(1)} className="mt-2 text-indigo-600 dark:text-indigo-400 text-sm hover:underline">
                    Try with more time
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                    <span>{suggestedTasks.length} tasks</span>
                    <span className={totalMinutes > availableMinutes ? 'text-red-500' : ''}>
                      {formatTime(totalMinutes)} / {formatTime(availableMinutes)}
                    </span>
                  </div>
                  {suggestedTasks.map((task, index) => {
                    const project = projects.find(p => p.id === task.project_id)
                    return (
                      <div
                        key={task.id}
                        className={`p-3 rounded-xl border transition-all ${
                          task.critical
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => moveTask(index, -1)}
                              disabled={index === 0}
                              className={`p-0.5 rounded ${index === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 hover:text-indigo-500'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => moveTask(index, 1)}
                              disabled={index === suggestedTasks.length - 1}
                              className={`p-0.5 rounded ${index === suggestedTasks.length - 1 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 hover:text-indigo-500'}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {task.critical && <span className="text-red-500">{TaskCardIcons.flag('w-3.5 h-3.5')}</span>}
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {project && <span>{project.name}</span>}
                              {task.due_date && (
                                <span className={getDueDateStatus(task.due_date, task.status) === 'overdue' ? 'text-red-500' : ''}>
                                  Due {formatDate(task.due_date)}
                                </span>
                              )}
                              <span>~{formatTime(task.estimatedMinutes)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeTask(index)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {step === 1 ? (
            <button
              onClick={generatePlan}
              disabled={availableMinutes < 15}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50"
            >
              Generate Plan
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleAccept}
                disabled={suggestedTasks.length === 0}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50"
              >
                Add to My Day ({suggestedTasks.length})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}


const MyDayTaskCard = ({ task, project, showRemove = false, isCompleted = false, blocked, dueDateStatus, energyStyle, onEditTask, onQuickStatusChange, onRemoveFromMyDay, onAddToMyDay, showReorder = false, isFirst = false, isLast = false, onMoveUp, onMoveDown }) => {
  return (
    <div
      onClick={() => onEditTask(task)}
      className={`group relative p-4 rounded-xl shadow-sm select-none transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${
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
        {/* Reorder arrows */}
        {showReorder && !isCompleted && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp?.() }}
              disabled={isFirst}
              className={`p-0.5 rounded transition-colors ${
                isFirst 
                  ? 'text-gray-200 dark:text-gray-700 cursor-not-allowed' 
                  : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
              }`}
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown?.() }}
              disabled={isLast}
              className={`p-0.5 rounded transition-colors ${
                isLast 
                  ? 'text-gray-200 dark:text-gray-700 cursor-not-allowed' 
                  : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
              }`}
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
        
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
              isCompleted ? 'text-gray-400 dark:text-gray-300 line-through' : 'text-gray-800 dark:text-gray-100'
            }`}>
              {task.critical && !isCompleted && <span className="mr-1">{TaskCardIcons.flag("w-3.5 h-3.5")}</span>}
              {blocked && !isCompleted && <span className="mr-1">{TaskCardIcons.lock("w-3.5 h-3.5")}</span>}
              {task.title}
            </h4>
            
            {/* Add to My Day button - shown in Recommendations */}
            {onAddToMyDay && !isCompleted && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  // Use currentTarget to check if already handled by touch
                  if (e.currentTarget.dataset.touchHandled) {
                    delete e.currentTarget.dataset.touchHandled
                    return
                  }
                  onAddToMyDay(task.id)
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  e.currentTarget.dataset.touchHandled = 'true'
                  onAddToMyDay(task.id)
                }}
                className="p-2.5 sm:p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 active:bg-amber-200 dark:active:bg-amber-800/40 transition-all touch-manipulation text-amber-500 hover:text-amber-600 dark:text-amber-400"
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
                className="p-2 sm:p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 sm:bg-transparent sm:dark:bg-transparent sm:opacity-0 sm:group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all touch-manipulation"
                title="Remove from My Day"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {project && (
              <span className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-1">
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
              <span className="text-xs text-gray-500 dark:text-gray-300">
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
const MyDayDashboard = ({ tasks, projects, onEditTask, allTasks, onQuickStatusChange, onUpdateMyDayDate, showConfettiPref, onToggleSubtask, displayName }) => {
  const [expandedSection, setExpandedSection] = useState('overdue')
  const [confettiShown, setConfettiShown] = useState(false)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const prevActiveCountRef = useRef(null)
  
  // Custom order for My Day tasks (stored in localStorage)
  const [customOrder, setCustomOrder] = useState(() => {
    try {
      const stored = localStorage.getItem('trackli-myday-order')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingWithName = displayName ? `${greeting}, ${displayName}` : greeting

  // Compute subtasks due today from all tasks
  const subtasksDueToday = useMemo(() => {
    const result = []
    tasks.forEach(task => {
      if (!task.subtasks || task.status === 'done') return
      task.subtasks.forEach(subtask => {
        if (subtask.due_date === todayStr && !subtask.completed) {
          result.push({
            ...subtask,
            parentTask: task,
            parentProject: projects.find(p => p.id === task.project_id)
          })
        }
      })
    })
    return result
  }, [tasks, projects, todayStr])

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
  
  // Sort My Day tasks - use custom order if available, otherwise default sort
  const sortedMyDayActive = useMemo(() => {
    const sorted = [...myDayActive]
    
    // If we have a custom order, use it
    if (customOrder.length > 0) {
      sorted.sort((a, b) => {
        const aIndex = customOrder.indexOf(a.id)
        const bIndex = customOrder.indexOf(b.id)
        // Tasks in custom order come first, in their custom order
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        // Fall through to default sort for tasks not in custom order
        return 0
      })
    } else {
      // Default sort: by start_date > time > status > created_at
      sorted.sort((a, b) => {
        const aHasDate = !!a.start_date
        const bHasDate = !!b.start_date
        
        if (aHasDate && !bHasDate) return -1
        if (!aHasDate && bHasDate) return 1
        
        if (aHasDate && bHasDate) {
          const dateDiff = new Date(a.start_date) - new Date(b.start_date)
          if (dateDiff !== 0) return dateDiff
          
          const aTime = a.start_time || a.end_time
          const bTime = b.start_time || b.end_time
          if (aTime && !bTime) return -1
          if (!aTime && bTime) return 1
          if (aTime && bTime) {
            const timeDiff = aTime.localeCompare(bTime)
            if (timeDiff !== 0) return timeDiff
          }
        }
        
        const statusOrder = { 'in_progress': 0, 'todo': 1, 'backlog': 2 }
        const aStatus = statusOrder[a.status] ?? 3
        const bStatus = statusOrder[b.status] ?? 3
        if (aStatus !== bStatus) return aStatus - bStatus
        
        return new Date(a.created_at) - new Date(b.created_at)
      })
    }
    return sorted
  }, [myDayActive, customOrder])
  
  // Handle moving task up/down in the list
  const handleMoveTask = (taskId, direction) => {
    const currentList = sortedMyDayActive.map(t => t.id)
    const currentIndex = currentList.indexOf(taskId)
    if (currentIndex === -1) return
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= currentList.length) return
    
    // Swap positions
    const newOrder = [...currentList]
    ;[newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]]
    
    setCustomOrder(newOrder)
    localStorage.setItem('trackli-myday-order', JSON.stringify(newOrder))
  }
  
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
  
  const handleAcceptPlan = (taskIds) => {
    // Add all selected tasks to My Day
    taskIds.forEach(taskId => {
      onUpdateMyDayDate(taskId, todayStr)
    })
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
            <GreetingIcon hour={hour} /> {greetingWithName}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-300 mt-0.5 sm:mt-1">
            {dayNames[today.getDay()]}, {monthNames[today.getMonth()]} {today.getDate()}
          </p>
        </div>
        
        {/* Plan My Day Button */}
        <button
          onClick={() => setPlanModalOpen(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="hidden sm:inline">Plan My Day</span>
          <span className="sm:hidden">Plan</span>
        </button>
      </div>
      
      {myDayTasks.length > 0 && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Today's Progress</span>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">
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
            <div className="flex justify-between mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-300">
              <span>~{Math.round(totalMyDayTime / 60)}h remaining</span>
              <span>~{Math.round(completedTime / 60)}h completed</span>
            </div>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            {MenuIcons.myday()}
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">My Day</h2>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">({sortedMyDayActive.length} active)</span>
          </div>
          
          <div
            className="min-h-[150px] sm:min-h-[200px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 transition-all"
          >
            {sortedMyDayActive.length === 0 && myDayCompleted.length === 0 ? (
              <EmptyState
                icon="sun"
                title="Your day is wide open"
                description="Click the sun button on recommended tasks below to add them here, or create tasks with today's start date."
                variant="default"
              />
            ) : (
              <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                {sortedMyDayActive.map((task, index) => {
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
                      showReorder={sortedMyDayActive.length > 1}
                      isFirst={index === 0}
                      isLast={index === sortedMyDayActive.length - 1}
                      onMoveUp={() => handleMoveTask(task.id, 'up')}
                      onMoveDown={() => handleMoveTask(task.id, 'down')}
                    />
                  )
                })}
                
                {/* Subtasks Due Today */}
                {subtasksDueToday.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-3 sm:pt-4 pb-2">
                      <div className="flex-1 h-px bg-purple-200 dark:bg-purple-800" />
                      <span className="text-[10px] sm:text-xs text-purple-500 dark:text-purple-400 font-medium">✨ Subtasks for today ({subtasksDueToday.length})</span>
                      <div className="flex-1 h-px bg-purple-200 dark:bg-purple-800" />
                    </div>
                    {subtasksDueToday.map(subtask => (
                      <div
                        key={`${subtask.parentTask.id}-${subtask.id}`}
                        className="flex items-center gap-3 p-2 sm:p-3 ml-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700 transition-all"
                      >
                        <button
                          onClick={() => onToggleSubtask(subtask.parentTask.id, subtask.id, true)}
                          className="w-5 h-5 rounded-full border-2 border-purple-300 dark:border-purple-600 hover:border-purple-500 hover:bg-purple-100 dark:hover:bg-purple-800 flex items-center justify-center transition-all flex-shrink-0"
                          title="Mark complete"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{subtask.title}</p>
                          <p className="text-[10px] text-purple-600 dark:text-purple-400 truncate">
                            ↳ {subtask.parentTask.title}
                            {subtask.parentProject && ` • ${subtask.parentProject.name}`}
                          </p>
                        </div>
                        <button
                          onClick={() => onEditTask(subtask.parentTask)}
                          className="p-1.5 text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-800 rounded-lg transition-colors flex-shrink-0"
                          title="Open parent task"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </>
                )}
                
                {myDayCompleted.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-3 sm:pt-4 pb-2">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-300">Completed today ({myDayCompleted.length})</span>
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
            {MenuIcons.lightbulb()}
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Recommendations</h2>
          </div>
          
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300 mb-3 sm:mb-4">
            Click the sun button on any task to add it to your focus list
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
              color="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300"
              tasks={backlogTasks}
            />
            
            {overdueTasks.length === 0 && dueTodayTasks.length === 0 && dueSoonTasks.length === 0 && quickWinTasks.length === 0 && inProgressTasks.length === 0 && todoTasks.length === 0 && backlogTasks.length === 0 && (
              <EmptyState
                icon="celebrate"
                title="You're all caught up!"
                description="No tasks need your attention right now. Enjoy the moment or create something new."
                variant="celebrate"
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Plan My Day Modal */}
      <PlanMyDayModal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        allTasks={allTasks}
        projects={projects}
        onAcceptPlan={handleAcceptPlan}
      />
    </div>
  )
}

// Task Table View Component


export { MyDayDashboard, MyDayTaskCard }
