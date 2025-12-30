#!/usr/bin/env python3
"""Apply drag/click fix to KanbanBoard.jsx"""

import re

file_path = 'src/components/KanbanBoard.jsx'

with open(file_path, 'r') as f:
    content = f.read()

# Fix 1: Add isDraggingRef to MyDayDashboard
content = content.replace(
    'const prevActiveCountRef = useRef(null)\n  \n  const today = new Date()',
    'const prevActiveCountRef = useRef(null)\n  const isDraggingRef = useRef(false)\n  \n  const today = new Date()'
)

# Fix 2: Add isDraggingRef to CalendarView
content = content.replace(
    'const calendarScrollRef = useRef(null)\n  \n  // Generate consistent color',
    'const calendarScrollRef = useRef(null)\n  const isDraggingRef = useRef(false)\n  \n  // Generate consistent color'
)

# Fix 3: Update CalendarView handleDragStart
old_drag_start = '''  // Handle drag start
  const handleDragStart = (e, task) => {
    console.log('Drag started:', task.title, task.id)
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }'''

new_drag_start = '''  // Handle drag start
  const handleDragStart = (e, task) => {
    isDraggingRef.current = true
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggedTask(null)
    // Small delay to prevent click from firing after drag
    setTimeout(() => { isDraggingRef.current = false }, 100)
  }
  
  // Handle task click (only if not dragging)
  const handleTaskClick = (task) => {
    if (!isDraggingRef.current && !resizingTask) {
      onEditTask(task)
    }
  }'''

content = content.replace(old_drag_start, new_drag_start)

# Fix 4: Update MyDay TaskCard drag handling
old_myday_card = '''    return (
      <div
        draggable={!isCompleted}
        onDragStart={(e) => {
          e.dataTransfer.setData('taskId', task.id)
          onDragStart && onDragStart(e, task)
        }}
        onClick={() => onEditTask(task)}
        className={`group relative p-4 rounded-xl cursor-grab active:cursor-grabbing select-none transition-all duration-200 hover:shadow-md ${
          isCompleted 
            ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60' 
            : blocked 
              ? 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800' 
              : task.critical 
                ? 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800' 
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuickStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')
            }}'''

new_myday_card = '''    return (
      <div
        draggable={!isCompleted}
        onDragStart={(e) => {
          isDraggingRef.current = true
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('taskId', task.id)
          onDragStart && onDragStart(e, task)
        }}
        onDragEnd={() => {
          setTimeout(() => { isDraggingRef.current = false }, 100)
        }}
        onClick={() => {
          if (!isDraggingRef.current) {
            onEditTask(task)
          }
        }}
        className={`group relative p-4 rounded-xl cursor-grab active:cursor-grabbing select-none transition-all duration-200 hover:shadow-md ${
          isCompleted 
            ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60' 
            : blocked 
              ? 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-800' 
              : task.critical 
                ? 'bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800' 
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuickStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')
            }}'''

content = content.replace(old_myday_card, new_myday_card)

# Fix 5: Update Calendar daily view task - change cursor-pointer to cursor-grab and add handlers
content = content.replace(
    'onDragStart={(e) => !resizingTask && handleDragStart(e, task)}\n                            onClick={() => !resizingTask && onEditTask(task)}\n                            className={`absolute left-1 right-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer shadow-sm',
    'onDragStart={(e) => !resizingTask && handleDragStart(e, task)}\n                            onDragEnd={handleDragEnd}\n                            onClick={() => handleTaskClick(task)}\n                            className={`absolute left-1 right-1 px-2 py-0.5 rounded text-xs font-medium cursor-grab active:cursor-grabbing shadow-sm'
)

# Fix 6: Update Calendar weekly view task
content = content.replace(
    'onDragStart={(e) => handleDragStart(e, task)}\n                              onClick={() => onEditTask(task)}\n                              className={`absolute left-0.5 right-0.5 px-1 rounded text-[9px] font-medium cursor-pointer shadow-sm',
    'onDragStart={(e) => handleDragStart(e, task)}\n                              onDragEnd={handleDragEnd}\n                              onClick={() => handleTaskClick(task)}\n                              className={`absolute left-0.5 right-0.5 px-1 rounded text-[9px] font-medium cursor-grab active:cursor-grabbing shadow-sm'
)

# Fix 7: Update Calendar monthly view task
content = content.replace(
    'onDragStart={(e) => handleDragStart(e, task)}\n                  onClick={(e) => { e.stopPropagation(); onEditTask(task) }}\n                  className={`text-xs px-2 py-1 rounded truncate cursor-pointer transition-all',
    'onDragStart={(e) => handleDragStart(e, task)}\n                  onDragEnd={handleDragEnd}\n                  onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}\n                  className={`text-xs px-2 py-1 rounded truncate cursor-grab active:cursor-grabbing transition-all'
)

# Fix 8: Update Calendar sidebar TaskCard and handleTaskTap
old_task_tap = '''    const handleTaskTap = (e, task) => {
      // Check if on mobile (no drag support)
      const isMobile = window.matchMedia('(max-width: 1024px)').matches
      if (isMobile) {
        e.stopPropagation()
        // Toggle selection
        if (selectedTaskForScheduling?.id === task.id) {
          setSelectedTaskForScheduling(null)
        } else {
          setSelectedTaskForScheduling(task)
        }
      } else {
        onEditTask(task)
      }
    }
    
    const TaskCard = ({ task, highlight }) => {
      const isSelected = selectedTaskForScheduling?.id === task.id
      return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, task)}
        onClick={(e) => handleTaskTap(e, task)}
        className={`p-2.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:shadow-md select-none ${'''

new_task_tap = '''    const handleTaskTap = (e, task) => {
      // Check if on mobile (no drag support)
      const isMobile = window.matchMedia('(max-width: 1024px)').matches
      if (isMobile) {
        e.stopPropagation()
        // Toggle selection
        if (selectedTaskForScheduling?.id === task.id) {
          setSelectedTaskForScheduling(null)
        } else {
          setSelectedTaskForScheduling(task)
        }
      } else if (!isDraggingRef.current) {
        onEditTask(task)
      }
    }
    
    const TaskCard = ({ task, highlight }) => {
      const isSelected = selectedTaskForScheduling?.id === task.id
      return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, task)}
        onDragEnd={handleDragEnd}
        onClick={(e) => handleTaskTap(e, task)}
        className={`p-2.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all hover:shadow-md select-none ${'''

content = content.replace(old_task_tap, new_task_tap)

with open(file_path, 'w') as f:
    f.write(content)

print("Drag fix applied successfully!")
