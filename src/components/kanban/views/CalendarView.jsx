import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { COLUMN_COLORS, CATEGORIES, ENERGY_LEVELS, btn, COLUMNS } from '../constants'
import { formatDate, formatTimeEstimate, parseFlexibleTime, getDueDateStatus, isBlocked } from '../utils'
import { TaskCardIcons } from '../icons'


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
      className={`relative p-2.5 rounded-lg border shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${
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
            {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500 dark:text-gray-300">
            {task.time_estimate && <span className="flex items-center gap-0.5">{TaskCardIcons.timer("w-3 h-3")}{formatTimeEstimate(task.time_estimate)}</span>}
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
  const [resizePreviewHeight, setResizePreviewHeight] = useState(null) // Preview height in pixels during resize
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
      // Update preview height based on drag distance
      const deltaY = e.clientY - resizingTask.startY
      const slotsDelta = Math.round(deltaY / 32)
      const newDuration = Math.max(15, resizingTask.originalDuration + (slotsDelta * 30))
      const heightSlots = Math.ceil(newDuration / 30)
      setResizePreviewHeight(heightSlots * 32 - 2)
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
    // Get task from state OR from dataTransfer (backup if dragEnd fires first)
    let taskToSchedule = draggedTask
    if (!taskToSchedule && e?.dataTransfer) {
      const taskId = e.dataTransfer.getData('text/plain')
      taskToSchedule = allTasks.find(t => t.id === taskId)
    }
    
    if (!taskToSchedule || !onUpdateTask) {
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
    const duration = task.time_estimate || 30
    const heightSlots = Math.ceil(duration / 30)
    setResizePreviewHeight(heightSlots * 32 - 2) // Set initial height immediately
    setResizingTask({
      task,
      startY: e.clientY,
      originalDuration: duration
    })
  }
  
  // Handle resize move
  const handleResizeMove = (e) => {
    if (!resizingTask) return
    e.preventDefault()
    
    const deltaY = e.clientY - resizingTask.startY
    // Each 32px = 30 minutes in daily view
    const slotsDelta = Math.round(deltaY / 32)
    const newDuration = Math.max(15, resizingTask.originalDuration + (slotsDelta * 30))
    const heightSlots = Math.ceil(newDuration / 30)
    setResizePreviewHeight(heightSlots * 32 - 2)
  }
  
  // Handle resize end
  const handleResizeEnd = async (e) => {
    if (!resizingTask || !onUpdateTask) {
      setResizingTask(null)
      setResizePreviewHeight(null)
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
      
      await onUpdateTask(resizingTask.task.id, {
        time_estimate: newDuration,
        end_time: newEndTime
      })
    }
    
    setResizingTask(null)
    setResizePreviewHeight(null)
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
              isToday ? 'text-indigo-600 dark:text-indigo-400' : isPast ? 'text-gray-400 dark:text-gray-300' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {day}
            </span>
            {dayTasks.length > 0 && (
              <span className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-full ${
                overdueTasks.length > 0 ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                criticalTasks.length > 0 ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' :
                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
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
                  {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
                </div>
              )
            })}
            {dayTasks.length > 2 && (
              <div className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-300 px-1.5 sm:px-2">
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
          className={`p-2.5 rounded-lg border shadow-sm transition-all duration-200 select-none ${
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
              {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500 dark:text-gray-300">
              {task.time_estimate && <span className="flex items-center gap-0.5">{TaskCardIcons.timer("w-3 h-3")}{formatTimeEstimate(task.time_estimate)}</span>}
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
            {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
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
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1.5">
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
                    {isHour && <span className="text-[10px] text-gray-500 dark:text-gray-300">{label}</span>}
                  </div>
                ))}
              </div>
              
              {/* Day column */}
              <div className="relative">
                {/* Resize preview ghost - rendered at column level to avoid overflow issues */}
                {resizingTask && resizePreviewHeight && (() => {
                  const taskStartTime = resizingTask.task.start_time
                  if (!taskStartTime) return null
                  const [h, m] = taskStartTime.split(':').map(Number)
                  const startMinutes = h * 60 + m
                  const topPosition = (startMinutes / 30) * 32
                  return (
                    <div 
                      className="absolute left-1 right-1 bg-indigo-300/50 dark:bg-indigo-500/50 border-2 border-dashed border-indigo-500 dark:border-indigo-400 rounded pointer-events-none z-50"
                      style={{ top: `${topPosition}px`, height: `${resizePreviewHeight}px` }}
                    >
                      <div className="absolute bottom-1 right-1 text-[9px] font-bold text-indigo-700 dark:text-indigo-200 bg-white/90 dark:bg-gray-800/90 px-1.5 py-0.5 rounded shadow">
                        {Math.round((resizePreviewHeight + 2) / 32 * 30)}m
                      </div>
                    </div>
                  )
                })()}
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
                        const originalHeight = heightSlots * 32 - 2
                        return (
                          <div
                            key={task.id}
                            className="absolute left-1 right-1"
                            style={{ top: '1px' }}
                          >
                            {/* Actual task */}
                            <div
                              draggable={!resizingTask}
                              onDragStart={(e) => !resizingTask && handleDragStart(e, task)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                              onDoubleClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                              className={`relative px-2 py-0.5 rounded text-xs font-medium cursor-grab active:cursor-grabbing shadow-sm transition-all hover:shadow-md z-10 overflow-hidden group ${
                                task.status === 'done' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 line-through' :
                                task.critical ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                                `${projectColor.bg} ${projectColor.text}`
                              } ${isOverlapping ? 'ring-2 ring-orange-400 dark:ring-orange-500' : ''}`}
                              style={{ height: `${originalHeight}px` }}
                              title={`${task.title}${task.start_time ? ` (${formatTimeDisplay(task.start_time)}${task.end_time ? ' - ' + formatTimeDisplay(task.end_time) : ''})` : ''}${isOverlapping ? ' ⚠️ Overlaps with another task' : ''}`}
                            >
                            <div className="flex items-start justify-between gap-1">
                              <div className="truncate text-[11px]">
                                {isOverlapping && <span title="Time conflict">⚠️ </span>}
                                {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
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
                            {TaskCardIcons.calendar("w-5 h-5")} Schedule Tasks
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-300 mb-4 flex items-center gap-1 flex-wrap">Click {TaskCardIcons.calendar("w-3.5 h-3.5 inline")} to set date & time{isToday ? ' • Auto-adds to My Day' : ''}</p>
            
            <div className="max-h-[600px] overflow-y-auto pr-1">
              {totalSchedulable === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-300 text-center py-8">All caught up!</p>
              ) : (
                <>
                  <Section title="My Day" icon={TaskCardIcons.sun("w-3.5 h-3.5")} tasks={schedulable.myDay} highlight="amber" />
                  <Section title="In Progress" icon={TaskCardIcons.inProgress("w-3.5 h-3.5")} tasks={schedulable.inProgress} highlight="pink" />
                  <Section title="To Do" icon={TaskCardIcons.todo("w-3.5 h-3.5")} tasks={schedulable.todo} highlight="blue" />
                  <Section title="Backlog" icon={TaskCardIcons.backlog("w-3.5 h-3.5")} tasks={schedulable.backlog} highlight="gray" />
                  <Section title="Overdue" icon={TaskCardIcons.overdue("w-3.5 h-3.5")} tasks={schedulable.overdue} highlight="red" />
                  <Section title="Due Today" icon={TaskCardIcons.dueToday("w-3.5 h-3.5")} tasks={schedulable.dueToday} highlight="orange" />
                  <Section title="Due Soon" icon={TaskCardIcons.dueSoon("w-3.5 h-3.5")} tasks={schedulable.dueSoon} highlight="yellow" />
                  <Section title="Quick Wins" icon={TaskCardIcons.quickWins("w-3.5 h-3.5")} tasks={schedulable.quickWins} highlight="green" />
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
                <span className="text-xs text-gray-500 dark:text-gray-300">{dayNames[date.getDay()]}</span>
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
                  {isHour && <span className="text-[9px] text-gray-500 dark:text-gray-300">{label}</span>}
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
                                <span className="truncate">{task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")}</>}{task.title}</span>
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
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300 mt-0.5 sm:mt-1">
              {tasks.filter(t => (t.due_date || t.start_date) && t.status !== 'done').length} tasks scheduled
            </p>
          </div>
          
          {/* Navigation - always visible */}
          <div className="flex items-center gap-1 sm:gap-2 relative z-10 bg-white dark:bg-gray-900 pl-2">
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
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextPeriod}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors touch-manipulation"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === 'weekly' 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === 'monthly' 
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300'
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
                <div key={day} className="py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300">
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">
            Tasks for {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-300 text-sm">No tasks due on this date</p>
          ) : (
            <div className="space-y-3">
              {selectedTasks.map(task => {
                const project = projects.find(p => p.id === task.project_id)
                const category = CATEGORIES.find(c => c.id === task.category)
                return (
                  <div
                    key={task.id}
                    onClick={() => onEditTask(task)}
                    className={`p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all ${
                      task.status === 'done' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                      task.critical ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                      'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
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
                          {task.critical && <>{TaskCardIcons.flag("w-3 h-3 inline mr-0.5")} </>}{task.title}
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
          <div className="mt-6 flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-gray-500 dark:text-gray-300">
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
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs">📌</span>
              <span>Drag tasks to reschedule</span>
            </div>
          </div>
        </>
      )}
      
      {/* Legend - Day/Week Views */}
      {(viewMode === 'daily' || viewMode === 'weekly') && (
        <div className="mt-6 flex items-center flex-wrap gap-4 sm:gap-6 text-sm text-gray-500 dark:text-gray-300">
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
          <div className="hidden sm:flex items-center gap-2">
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
            <p className="text-xs text-gray-500 dark:text-gray-300 mb-3 line-clamp-2">{taskToSchedule.title}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 opacity-0 absolute inset-0 cursor-pointer"
                    style={{ fontSize: '16px' }}
                  />
                  <div className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-center">
                    {scheduleDate ? formatDate(scheduleDate) : 'Select date'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Time</label>
                <input
                  type="text"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  onBlur={(e) => {
                    const parsed = parseFlexibleTime(e.target.value)
                    if (parsed) setScheduleTime(parsed)
                  }}
                  placeholder="e.g. 9am, 230pm, 14:30"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setTaskToSchedule(null)}
                  className="flex-1 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
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


export { CalendarView, ProgressRing, CalendarSidebarTaskCard }
