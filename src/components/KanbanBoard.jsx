import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { L } from '../lib/locale'
import { DEMO_PROJECTS, DEMO_TASKS, DEMO_USER, DEMO_MEETING_NOTES } from '../data/demoData'
import {
  ENERGY_LEVELS, BTN, btn, CATEGORIES, SOURCES, RECURRENCE_TYPES,
  COLUMN_COLORS, COLUMNS, DONE_DISPLAY_LIMIT, BACKLOG_DISPLAY_LIMIT,
  CUSTOMER_COLORS, PROJECT_COLORS, DEFAULT_PROJECT_COLOR, DATE_SHORTCUTS
} from './kanban/constants'
import {
  getCustomerColor, getDueDateStatus, isReadyToStart, isBlocked, isInMyDay,
  getNextRecurrenceDate, generateFutureOccurrences, getOccurrenceCount,
  formatDate, isUSDateFormat, formatTimeEstimate, parseFlexibleTime, parseNaturalLanguageDate, getDateLocale, formatDateForInput
} from './kanban/utils'
import { ToastIcons, ColumnEmptyIcons, TaskCardIcons } from './kanban/icons'
import { CalendarView, ProgressRing, CalendarSidebarTaskCard } from './kanban/views/CalendarView'
import { MyDayDashboard, MyDayTaskCard } from './kanban/views/MyDayDashboard'
import { TaskTableView } from './kanban/views/TaskTableView'
import TaskModal from './kanban/modals/TaskModal'
import ProjectModal from './kanban/modals/ProjectModal'
import WelcomeModal from './kanban/modals/WelcomeModal'
import { trackEvent } from '../utils/analytics'
import SparkPanel, { SparkButton } from './kanban/SparkPanel'
// Lazy load confetti - only needed when completing tasks
const loadConfetti = () => import('canvas-confetti').then(m => m.default)

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[310] p-4" onClick={onClose}>
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
const ADMIN_EMAILS = ['roddickaimee@gmail.com', 'aimee.roddick@spicymango.co.uk']

const AdminFeedbackPanel = ({ isOpen, onClose, userEmail, userId, onTaskCreated, projects = [] }) => {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, new, read, resolved, converted
  const [converting, setConverting] = useState(null) // Track which item is being converted
  
  // Hardcoded project for feedback tasks
  const FEEDBACK_PROJECT_NAME = 'Feedback'
  
  const isAdmin = ADMIN_EMAILS.includes(userEmail)
  
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
  
  // Convert feedback to a backlog task
  const convertToTask = async (item) => {
    console.log('Converting to task:', item)
    
    // Find the Feedback project
    const feedbackProject = projects.find(p => p.name === FEEDBACK_PROJECT_NAME)
    if (!feedbackProject) {
      alert(`Project "${FEEDBACK_PROJECT_NAME}" not found. Please create it first.`)
      return
    }
    
    setConverting(item.id)
    
    try {
      // Create title: "[Type]: Summary"
      const typeLabels = { bug: 'Bug', suggestion: 'Suggestion', question: 'Question', other: 'Feedback' }
      const typeLabel = typeLabels[item.type] || 'Feedback'
      const firstLine = item.message.split('\n')[0].slice(0, 100)
      const title = `${typeLabel}: ${firstLine}${item.message.length > 100 ? '...' : ''}`
      
      // Create task in backlog - must include project_id for RLS
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title,
          description: `**From:** ${item.user_email || 'Anonymous'}\n**Page:** ${item.page || 'N/A'}\n**Date:** ${new Date(item.created_at).toLocaleDateString(getDateLocale())}\n\n---\n\n${item.message}`,
          status: 'backlog',
          project_id: feedbackProject.id,
          critical: false,
          time_estimate: 0,
          energy_level: 'medium',
          category: null,
          source: 'feedback',
          subtasks: [],
          comments: [],
        })
        .select()
        .single()
      
      if (taskError) throw taskError
      
      // Link existing feedback images as task attachments
      // Images are already in Supabase storage - just create attachment records
      if (item.images && item.images.length > 0 && taskData) {
        console.log('Linking images:', item.images)
        
        for (let i = 0; i < item.images.length; i++) {
          const imageUrl = item.images[i]
          
          try {
            // Extract file path from the Supabase URL
            // URL format: https://xxx.supabase.co/storage/v1/object/public/attachments/feedback/...
            const urlParts = imageUrl.split('/storage/v1/object/public/attachments/')
            if (urlParts.length === 2) {
              const filePath = urlParts[1]
              console.log('Extracted file path:', filePath)
              
              // Create attachment record pointing to existing file
              const { error: attachError } = await supabase.from('attachments').insert({
                task_id: taskData.id,
                file_path: filePath,
                file_name: `screenshot-${i + 1}.jpg`,
              })
              
              if (attachError) {
                console.error('Attachment record error:', attachError)
              } else {
                console.log('Attachment linked successfully')
              }
            } else {
              console.error('Could not parse image URL:', imageUrl)
            }
          } catch (imgErr) {
            console.error('Error linking image:', imgErr)
          }
        }
      }
      
      // Update feedback status to converted
      await supabase
        .from('feedback')
        .update({ status: 'converted', task_id: taskData.id })
        .eq('id', item.id)
      
      setFeedback(prev => prev.map(f => f.id === item.id ? { ...f, status: 'converted', task_id: taskData.id } : f))
      
      // Notify parent to refresh tasks
      if (onTaskCreated) onTaskCreated()
      
      alert('Task created in Backlog!')
      
    } catch (err) {
      console.error('Error converting to task:', err)
      alert('Error creating task: ' + err.message)
    } finally {
      setConverting(null)
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
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    converted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
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
          
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            {['all', 'new', 'read', 'resolved', 'converted'].map(f => (
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
            
            {/* Show which project tasks go to */}
            <div className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              Tasks → <span className="font-medium text-purple-600 dark:text-purple-400">{FEEDBACK_PROJECT_NAME}</span> project
            </div>
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
            <div className="space-y-3 sm:space-y-4">
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
                        <span>{new Date(item.created_at).toLocaleDateString(getDateLocale())} {new Date(item.created_at).toLocaleTimeString()}</span>
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
                      {item.status !== 'converted' && (
                        <button
                          onClick={() => convertToTask(item)}
                          disabled={converting === item.id}
                          className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Convert to backlog task"
                        >
                          {converting === item.id ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
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
          className="group px-5 sm:px-6 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 active:translate-y-0"
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
      <text x="108" y="56" textAnchor="middle" fontSize="10" fill="#F59E0B">✦</text>
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
    <text x="210" y="26" textAnchor="middle" fontSize="10" fill="#D97706" fontWeight="bold">✦ My Day</text>
    
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
        title: 'Plan My Day',
        description: 'Click the Plan My Day button to get an AI-prioritised task list based on your available time. Critical and overdue tasks are suggested first!',
        iconComponent: 'sparkle',
      },
      {
        title: 'Add Tasks to My Day',
        description: 'Tasks with today\'s start date or due date appear automatically. Click the sun button on any recommended task to add it manually.',
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
        description: `${L.Organize} your work into projects. Each project gets its own ${L.color} that appears on task cards throughout the app.`,
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
            <div className="bg-purple-600 p-6 text-white">
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
  pending: () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <rect x="2" y="3" width="20" height="18" rx="2" fill="#F59E0B" />
      <path d="M8 9 L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 13 L14 13" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <circle cx="6" cy="9" r="1.5" fill="white" />
      <circle cx="6" cy="13" r="1.5" fill="white" opacity="0.7" />
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
    { id: 'tasks', label: 'Tasks', icon: () => HelpTabIcons.tasks(), color: 'from-pink-500 to-rose-500' },
    { id: 'board', label: 'Board', icon: () => HelpTabIcons.board(), color: 'from-orange-500 to-amber-500' },
    { id: 'myday', label: 'My Day', icon: () => HelpTabIcons.myday(), color: 'from-yellow-500 to-orange-500' },
    { id: 'calendar', label: 'Calendar', icon: () => HelpTabIcons.calendar(), color: 'from-green-500 to-emerald-500' },
    { id: 'alltasks', label: 'All Tasks', icon: () => HelpTabIcons.alltasks(), color: 'from-blue-500 to-cyan-500' },
    { id: 'pending', label: 'Pending', icon: () => HelpTabIcons.pending(), color: 'from-amber-500 to-yellow-500' },
    { id: 'shortcuts', label: 'Shortcuts', icon: () => HelpTabIcons.shortcuts(), color: 'from-purple-500 to-orange-500' },
  ]
  
  const SectionCard = ({ index, title, children, icon }) => {
    const color = rainbowColors[index % rainbowColors.length]
    return (
      <section className={`rounded-xl sm:rounded-2xl border-l-4 ${color.border} ${color.bg} p-3 sm:p-5 transition-all hover:shadow-md`}>
        <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl ${color.numBg} flex items-center justify-center ${color.text} font-bold text-xs sm:text-sm shadow-sm`}>
            {icon || index + 1}
          </span>
          <span>{title}</span>
        </h3>
        {children}
      </section>
    )
  }
  
  const KeyboardShortcut = ({ label, keys, icon }) => (
    <div className="flex items-center justify-between p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group">
      <span className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {label}
      </span>
      <div className="flex gap-1 items-center">
        {Array.isArray(keys) ? keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            <kbd className="px-3 py-1.5 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-600 dark:to-gray-700 rounded-lg text-sm font-mono shadow-sm border border-gray-300 dark:border-gray-500 group-hover:from-indigo-100 group-hover:to-indigo-200 dark:group-hover:from-indigo-800 dark:group-hover:to-indigo-900 transition-all">{key}</kbd>
            {i < keys.length - 1 && <span className="text-gray-400 text-xs mx-1">or</span>}
          </span>
        )) : (
          <kbd className="px-3 py-1.5 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-600 dark:to-gray-700 rounded-lg text-sm font-mono shadow-sm border border-gray-300 dark:border-gray-500 group-hover:from-indigo-100 group-hover:to-indigo-200 dark:group-hover:from-indigo-800 dark:group-hover:to-indigo-900 transition-all">{keys}</kbd>
        )}
      </div>
    </div>
  )
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        
        {/* Rainbow gradient bar at top */}
        <div className="h-1.5 bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500" />
        
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center text-white text-lg sm:text-2xl shadow-lg shadow-purple-500/30">
                📚
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
                  Help Guide
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Master your productivity with Trackli</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all hover:rotate-90 duration-200"
            >
              <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="px-4 sm:px-6 pb-3 sm:pb-4">
          <div className="flex gap-2 p-1.5 bg-gray-100/80 dark:bg-gray-800/80 rounded-2xl overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60'
                }`}
              >
                <span className="text-lg">{tab.icon()}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 overflow-y-auto max-h-[calc(85vh-200px)] sm:max-h-[calc(90vh-280px)]">
          <div className="space-y-3 sm:space-y-4">
            
            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <>
                <SectionCard index={0} title="Creating Tasks">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>• Click the <span className="px-2 py-1 bg-purple-600 text-white rounded-lg text-sm font-medium">+ Task</span> button in the header</p>
                    <p>• Or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">{shortcutModifier}T</kbd></p>
                    <p>• Or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">Q</kbd> for Quick Add with voice support!</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={1} title="Task Fields">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Title *', desc: 'The task name (required)' },
                      { name: 'Project *', desc: 'Which project this belongs to' },
                      { name: 'Start Date', desc: 'When to start working on it' },
                      { name: 'Due Date', desc: 'Deadline for completion' },
                      { name: 'Time Estimate', desc: 'How long it will take' },
                      { name: 'Effort Level', desc: 'Low / Medium / High effort' },
                      { name: 'Customer', desc: 'Client/customer for the task' },
                      { name: 'Assignee', desc: "Who's responsible" },
                      { name: 'Category', desc: 'Type of work' },
                      { name: 'Critical', desc: 'Flag as high priority', icon: 'flag' },
                    ].map((field, i) => (
                      <div key={i} className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                        <p className="font-semibold text-gray-700 dark:text-gray-200">{field.name}</p>
                        <p className="text-sm text-gray-500">{field.desc}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="Completing Tasks">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>• <strong>Hover</strong> over a task and click the <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-sm">✓ Done</span> button</p>
                    <p>• Or <strong>drag</strong> the task to the "Done" column</p>
                    <p>• Or open the task and change its status</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="Dependencies (Blocking)">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>• In the task editor, use "Blocked By" to select tasks that must be completed first</p>
                    <p className="flex items-center gap-1">• Blocked tasks show with {TaskCardIcons.lock("w-4 h-4 inline")} and an orange border</p>
                    <p>• When the blocking task is completed, the blocked task becomes "ready to start"</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={4} title="Recurring Tasks">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>• Set a recurrence pattern: Daily, Weekly, Bi-weekly, Monthly</p>
                    <p>• When completed, a new instance is automatically created</p>
                    <p className="flex items-center gap-1">• Recurring tasks show {TaskCardIcons.repeat("w-4 h-4 inline")} on the card</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={5} title="Attachments">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Adding Attachments:</p>
                      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <p>• Open a task and go to the Details tab</p>
                        <p>• Drag & drop files or click "Choose files"</p>
                        <p>• Supports images, PDFs, documents, and more</p>
                      </div>
                    </div>
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Viewing Attachments:</p>
                      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <p>• Click any attachment to open the viewer</p>
                        <p>• PDFs display inline with page navigation</p>
                        <p>• Use ← → arrow keys to navigate</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Tasks with attachments show a paperclip icon with count</p>
                  </div>
                </SectionCard>
              </>
            )}
            
            {/* Board Tab */}
            {activeTab === 'board' && (
              <>
                <SectionCard index={0} title="Kanban Columns">
                  <p className="text-gray-800 dark:text-gray-300 mb-3">Tasks flow through four columns representing their status:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-xl border-l-4 border-gray-400 bg-gray-100 dark:bg-gray-800">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">Backlog</span>
                      <p className="text-xs text-gray-700">Future work</p>
                    </div>
                    <div className="p-3 rounded-xl border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/30">
                      <span className="font-semibold text-blue-700 dark:text-blue-300">To Do</span>
                      <p className="text-xs text-gray-700">Ready to start</p>
                    </div>
                    <div className="p-3 rounded-xl border-l-4 border-pink-500 bg-pink-50 dark:bg-pink-900/30">
                      <span className="font-semibold text-pink-700 dark:text-pink-300">In Progress</span>
                      <p className="text-xs text-gray-700">Active work</p>
                    </div>
                    <div className="p-3 rounded-xl border-l-4 border-slate-500 bg-slate-100 dark:bg-slate-800">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Done</span>
                      <p className="text-xs text-gray-700">Completed</p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700">
                    <p className="text-sm text-indigo-700 dark:text-indigo-300"><strong>👆 Drag & Drop:</strong> Drag any task card between columns to change its status instantly.</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={1} title="Task Card Quick Actions">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Click Actions:</p>
                      <div className="space-y-1 text-sm text-gray-800 dark:text-gray-300">
                        <p>• <strong>Click card</strong> – Open task to edit all details</p>
                        <p>• <strong>Click checkbox</strong> – Mark complete/incomplete</p>
                        <p>• <strong>Double-click title</strong> – Edit title inline (desktop)</p>
                      </div>
                    </div>
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Hover Actions (Desktop):</p>
                      <p className="text-sm text-gray-700 mb-2">Hover over a card to reveal quick action buttons:</p>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span className="px-2.5 py-1.5 bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 rounded-lg font-medium">▶ Start</span>
                        <span className="px-2.5 py-1.5 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 rounded-lg font-medium">✓ Done</span>
                        <span className="px-2.5 py-1.5 bg-gradient-to-r from-red-100 to-orange-100 text-red-700 rounded-lg font-medium flex items-center gap-1">{TaskCardIcons.flag("w-4 h-4")} Critical</span>
                        <span className="px-2.5 py-1.5 bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 rounded-lg font-medium flex items-center gap-1">{TaskCardIcons.sun("w-4 h-4")} My Day</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="Task Card Indicators">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Left Border {L.Colors}:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-2"><div className="w-1 h-6 rounded bg-red-500"></div><span>Red = Overdue or Critical</span></div>
                        <div className="flex items-center gap-2"><div className="w-1 h-6 rounded bg-orange-500"></div><span>Orange = Blocked or Due Today</span></div>
                        <div className="flex items-center gap-2"><div className="w-1 h-6 rounded bg-green-500"></div><span>Green = Ready to Start</span></div>
                        <div className="flex items-center gap-2"><div className="w-1 h-6 rounded bg-blue-500"></div><span>Blue/Pink/Gray = Column status</span></div>
                      </div>
                    </div>
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Icons & Badges:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-800 dark:text-gray-300">
                        <div className="flex items-center gap-1">{TaskCardIcons.flag("w-4 h-4")} = Critical/Flagged</div>
                        <div className="flex items-center gap-1">{TaskCardIcons.lock("w-4 h-4")} = Blocked by another task</div>
                        <div className="flex items-center gap-1">{TaskCardIcons.repeat("w-4 h-4")} = Recurring task</div>
                        <div className="flex items-center gap-1">{TaskCardIcons.sun("w-4 h-4")} = In My Day</div>
                        <div>▶ = Start date</div>
                        <div>🗓 = Due date</div>
                        <div className="flex items-center gap-1">{TaskCardIcons.timer("w-4 h-4")} = Time estimate</div>
                        <div>📎 = Has attachments</div>
                      </div>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="Filtering & Search">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Summary Bar (Quick Filters):</p>
                      <p className="text-sm text-gray-700 mb-2">Click any stat in the summary bar to filter:</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-1"><span className="text-red-600 font-medium flex items-center gap-1">{TaskCardIcons.flag("w-4 h-4")} Critical</span> – Flagged tasks</div>
                        <div><span className="text-orange-600 font-medium">Due Today</span> – Due today</div>
                        <div><span className="text-red-600 font-medium">Overdue</span> – Past due date</div>
                        <div className="flex items-center gap-1"><span className="text-amber-600 font-medium flex items-center gap-1">{TaskCardIcons.sun("w-4 h-4")} My Day</span> – Daily focus tasks</div>
                      </div>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700">
                      <p className="font-semibold text-indigo-700 dark:text-indigo-300 mb-1">🔍 Quick Search</p>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400">Press <kbd className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-800 rounded text-xs font-mono">/</kbd> to search tasks by title, description, assignee, or customer.</p>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}
            
            {/* My Day Tab */}
            {activeTab === 'myday' && (
              <>
                <SectionCard index={0} title="What is My Day?" icon={TaskCardIcons.sun("w-4 h-4")}>
                  <p className="text-gray-800 dark:text-gray-300">My Day is your personal daily focus list. It helps you plan what to work on today without cluttering your board view.</p>
                </SectionCard>
                
                <SectionCard index={1} title="Plan My Day">
                  <div className="space-y-3">
                    <p className="text-gray-800 dark:text-gray-300">Click the <span className="font-semibold text-indigo-600 dark:text-indigo-400">Plan My Day</span> button to get an intelligent task plan based on your available time.</p>
                    <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700">
                      <p className="font-semibold text-indigo-600 dark:text-indigo-400 mb-2">How it works:</p>
                      <ul className="text-sm text-gray-800 dark:text-gray-300 space-y-1">
                        <li>1. Enter how much time you have available</li>
                        <li>2. Get a prioritised list of tasks that fit your time</li>
                        <li>3. Rearrange or remove tasks as needed</li>
                        <li>4. Accept to set your day</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 rounded-xl border border-amber-200 dark:border-amber-700">
                      <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">Priority order:</p>
                      <p className="text-sm text-gray-800 dark:text-gray-300">Critical tasks, overdue items, and tasks due today are prioritised first. Tasks with no dates appear last.</p>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="How Tasks Appear in My Day">
                  <div className="space-y-3">
                    <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl border border-green-200 dark:border-green-700">
                      <p className="font-semibold text-green-600 dark:text-green-400 mb-1">Auto-included:</p>
                      <p className="text-sm text-gray-800 dark:text-gray-300">Tasks with a start date of today or earlier automatically appear in My Day</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-xl border border-blue-200 dark:border-blue-700">
                      <p className="font-semibold text-blue-600 dark:text-blue-400 mb-1">Manually added:</p>
                      <p className="text-sm text-gray-800 dark:text-gray-300">Click the sun button on any task in Recommendations to add it to your focus list</p>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="Sun Icon on Cards">
                  <div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 rounded-xl border border-amber-200 dark:border-amber-700">
                    <p className="text-gray-700 dark:text-gray-300">Tasks in your My Day list show a sun icon on their card in the board view. This helps you quickly identify your daily focus tasks while browsing the board.</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={4} title="Recommendations & All Tasks">
                  <p className="text-gray-800 dark:text-gray-300 mb-3">The Recommendations section shows tasks organized by urgency:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl"><span className="font-semibold text-red-600">🔴 Overdue</span><p className="text-sm text-gray-700">Past due date</p></div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl"><span className="font-semibold text-orange-600">🟠 Due Today</span><p className="text-sm text-gray-700">Due today</p></div>
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl"><span className="font-semibold text-yellow-600">🟡 Due Soon</span><p className="text-sm text-gray-700">Due in next 3 days</p></div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl"><span className="font-semibold text-green-600">🟢 Quick Wins</span><p className="text-sm text-gray-700">Low effort tasks</p></div>
                  </div>
                </SectionCard>
                
                <SectionCard index={5} title="Daily Reset">
                  <p className="text-gray-800 dark:text-gray-300">Manually added tasks clear from My Day at midnight, giving you a fresh start each day.</p>
                </SectionCard>
              </>
            )}
            
            {/* Calendar Tab */}
            {activeTab === 'calendar' && (
              <>
                <SectionCard index={0} title="Calendar View" icon="🗓">
                  <p className="text-gray-800 dark:text-gray-300">Schedule tasks on your calendar with start times and durations. Access via the menu or press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">{shortcutModifier}L</kbd>.</p>
                </SectionCard>
                
                <SectionCard index={1} title="View Modes">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl text-center backdrop-blur-sm">
                      <span className="text-3xl">📅</span>
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Daily</p>
                      <p className="text-xs text-gray-700">Single day view</p>
                    </div>
                    <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl text-center backdrop-blur-sm">
                      <span className="text-3xl">📆</span>
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Weekly</p>
                      <p className="text-xs text-gray-700">7-day overview</p>
                    </div>
                    <div className="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl text-center backdrop-blur-sm">
                      <span className="text-3xl">🗓️</span>
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mt-2">Monthly</p>
                      <p className="text-xs text-gray-700">Full month grid</p>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="Scheduling Tasks">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Click the Calendar Button:</p>
                      <p className="text-sm text-gray-700">Click the 🗓 button on any task to schedule it.</p>
                    </div>
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Task Duration:</p>
                      <p className="text-sm text-gray-700">Set the Time Estimate to control how tall tasks appear on the calendar.</p>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="Quick Actions">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-xl text-center">
                      <span className="text-xl">▶</span>
                      <p className="text-gray-800 dark:text-gray-300 text-xs mt-1">Start task</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl text-center">
                      <span className="text-xl">✓</span>
                      <p className="text-gray-800 dark:text-gray-300 text-xs mt-1">Mark done</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 rounded-xl text-center">
                      <span className="text-xl">✕</span>
                      <p className="text-gray-800 dark:text-gray-300 text-xs mt-1">Remove</p>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}
            
            {/* All Tasks Tab */}
            {activeTab === 'alltasks' && (
              <>
                <SectionCard index={0} title="All Tasks View" icon="🗃️">
                  <p className="text-gray-800 dark:text-gray-300">Access all your tasks in a powerful table format. Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">{shortcutModifier}A</kbd>.</p>
                </SectionCard>
                
                <SectionCard index={1} title="Sorting">
                  <p className="text-gray-800 dark:text-gray-300">Click any column header to sort. Click again to reverse order.</p>
                </SectionCard>
                
                <SectionCard index={2} title="Filtering">
                  <div className="space-y-2 text-gray-800 dark:text-gray-300">
                    <p>• Click <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-medium">Filters</span> to show filter inputs</p>
                    <p>• Type to filter any column</p>
                    <p>• Click <span className="text-red-600 font-medium">Clear Filters</span> to reset</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="Export to CSV" icon="📤">
                  <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl border border-green-200 dark:border-green-700">
                    <p className="text-gray-700 dark:text-gray-300">Click <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">Export CSV</span> to download your tasks.</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={4} title="Import from CSV" icon="📥">
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-xl border border-blue-200 dark:border-blue-700">
                    <p className="text-gray-700 dark:text-gray-300">Click <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">Import CSV</span> to bulk create tasks.</p>
                  </div>
                </SectionCard>
              </>
            )}
            
            {/* Pending Tab */}
            {activeTab === 'pending' && (
              <>
                <SectionCard index={0} title="What is Pending?">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>Pending is your inbox for tasks from external sources. Tasks arrive here from:</p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                        <p className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email</p>
                        <p className="text-sm">Forward emails to your Trackli address</p>
                      </div>
                      <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                        <p className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> Slack</p>
                        <p className="text-sm">Use /trackli commands</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={1} title="Where to Find Pending">
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /><circle cx="18" cy="5" r="3" fill="currentColor" /></svg> Header Badge</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Look for the amber badge with count in the top navigation. Click it for a quick dropdown preview of pending tasks.</p>
                    </div>
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl backdrop-blur-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg> Board View</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">The full Pending Review section appears above your kanban columns. Expand it to see all pending tasks with full editing options.</p>
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="Reviewing Tasks">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>• <strong>Checkbox</strong> — Select tasks you want to keep</p>
                    <p>• <strong>Expand arrow</strong> — Show more fields (effort, time, customer)</p>
                    <p>• <strong>Project dropdown</strong> — Assign to a project (required to approve)</p>
                    <p>• <strong>X button</strong> — Remove unwanted tasks</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={3} title="AI Extraction">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>The AI automatically extracts task details from your messages:</p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[
                        { field: 'Title', example: 'Clear task name' },
                        { field: 'Due Date', example: '"by Friday", "tomorrow"' },
                        { field: 'Time', example: '"9:30-10:30am"' },
                        { field: 'Estimate', example: '"30 mins", "2 hours"' },
                        { field: 'Priority', example: '"urgent", "ASAP"' },
                        { field: 'Customer', example: 'Client names' },
                      ].map((item, i) => (
                        <div key={i} className="p-2 bg-white/60 dark:bg-gray-800/60 rounded-lg">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{item.field}</span>
                          <span className="text-sm text-gray-500 ml-2">{item.example}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
                
                <SectionCard index={4} title="Task Routing">
                  <div className="space-y-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <p className="font-semibold text-green-700 dark:text-green-300">✓ Project Matched</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Task goes directly to your board</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                      <p className="font-semibold text-amber-700 dark:text-amber-300">? No Project Match</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Task arrives in Pending for you to assign</p>
                    </div>
                    <p className="text-sm text-gray-500">Tip: Mention your project name in Slack commands to route tasks directly!</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={5} title="Approving Tasks">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>1. <strong>Select</strong> the tasks you want (checkbox)</p>
                    <p>2. <strong>Assign</strong> a project to each task</p>
                    <p>3. Click <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">Create Tasks</span></p>
                    <p className="text-sm text-gray-500 mt-2">Tasks due {'>'} 7 days out go to Backlog, others go to To Do.</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={6} title="Email Setup">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>Find your unique email address in <strong>Settings → Integrations</strong></p>
                    <p>Forward any email to create tasks from action items.</p>
                    <p className="text-sm">Tip: Add a note at the top like "Add to Demo project, urgent" to help the AI categorise tasks.</p>
                  </div>
                </SectionCard>
                
                <SectionCard index={7} title="Slack Setup">
                  <div className="space-y-2 text-gray-600 dark:text-gray-300">
                    <p>Connect Slack in <strong>Settings → Integrations</strong></p>
                    <p>Then use these commands anywhere in Slack:</p>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      <div className="p-2 bg-white/60 dark:bg-gray-800/60 rounded-lg font-mono text-sm">/trackli Buy milk tomorrow</div>
                      <div className="p-2 bg-white/60 dark:bg-gray-800/60 rounded-lg font-mono text-sm">/trackli today</div>
                      <div className="p-2 bg-white/60 dark:bg-gray-800/60 rounded-lg font-mono text-sm">/trackli summary</div>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}
            
            {/* Shortcuts Tab */}
            {activeTab === 'shortcuts' && (
              <>
                <SectionCard index={0} title="Navigation Shortcuts" icon="🧭">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <KeyboardShortcut label="My Day View" keys={`${shortcutModifier}D`} icon={TaskCardIcons.sun("w-4 h-4")} />
                    <KeyboardShortcut label="Board View" keys={`${shortcutModifier}B`} icon="📋" />
                    <KeyboardShortcut label="Calendar View" keys={`${shortcutModifier}L`} icon="🗓" />
                    <KeyboardShortcut label="All Tasks View" keys={`${shortcutModifier}A`} icon="🗃️" />
                    <KeyboardShortcut label="Quick Search" keys="/" icon="🔍" />
                  </div>
                </SectionCard>
                
                <SectionCard index={1} title="Action Shortcuts" icon="⚡">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <KeyboardShortcut label="New Task" keys={`${shortcutModifier}T`} icon="✨" />
                    <KeyboardShortcut label="New Project" keys={`${shortcutModifier}P`} icon="📁" />
                    <KeyboardShortcut label="Import Notes" keys={`${shortcutModifier}N`} icon="📝" />
                    <KeyboardShortcut label="Quick Add Task" keys={['Q', `${shortcutModifier}Q`]} icon="⚡" />
                    <KeyboardShortcut label="Help / Shortcuts" keys="?" icon="❓" />
                    <KeyboardShortcut label="Close Modal" keys="Esc" icon="✕" />
                  </div>
                </SectionCard>
                
                <SectionCard index={2} title="Quick Actions" icon="🖱️">
                  <div className="space-y-2 text-gray-800 dark:text-gray-300">
                    <p>• <strong>Click task</strong> – Open task editor</p>
                    <p>• <strong>Click checkbox</strong> – Mark complete/incomplete</p>
                    <p>• <strong>Drag task</strong> – Move between columns on board</p>
                    <p>• <strong>Hover task</strong> – See quick action buttons (desktop)</p>
                  </div>
                </SectionCard>
              </>
            )}
            
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-850 dark:to-gray-800 flex justify-between items-center gap-2">
          <p className="text-sm text-gray-700">
            Need more help? <a href="mailto:support@gettrackli.com" className="text-indigo-500 hover:text-indigo-600 hover:underline font-medium">Contact support</a>
          </p>
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg sm:rounded-xl font-medium text-sm sm:text-base transition-all hover:shadow-lg"
          >
            Got it! ✨
          </button>
        </div>
      </div>
    </div>
  )
}

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
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Search Input */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
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
              className="flex-1 text-lg outline-none placeholder-gray-400 bg-transparent text-gray-900 dark:text-white"
            />
            <button
              onClick={onClose}
              onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
              className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <kbd className="hidden md:block px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded">ESC</kbd>
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
              <p className="text-sm text-gray-400 dark:text-gray-300 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
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
                    className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div 
                        className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: COLUMN_COLORS[task.status] }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-800 dark:text-white truncate">{task.title}</h4>
                          {task.critical && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Critical</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                          <span>{project?.name}</span>
                          {category && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="hidden sm:inline" style={{ color: category.color }}>{category.label}</span>
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
const TaskCard = ({ task, project, onEdit, onDragStart, showProject = true, allTasks = [], onQuickComplete, bulkSelectMode, isSelected, onToggleSelect, onStatusChange, onSetDueDate, onToggleMyDay, isDragging, anyDragging, onUpdateTitle, onToggleCritical, onBreakdown, isMobile }) => {
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
    if (isMobile || bulkSelectMode || !onUpdateTitle) return
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
  
  const hasExtraInfo = task.description || task.assignee || task.notes ||
    (task.subtasks?.length > 0) || (task.attachments?.length > 0) || (task.dependencies?.length > 0)

  return (
    <div
      draggable={!isMobile}
      onDragStart={handleCardDragStart}
      onDragEnd={handleCardDragEnd}
      onClick={handleCardClick}
      className={`task-card relative rounded-lg p-2 sm:p-2.5 shadow-sm border cursor-pointer transition-all duration-200 group hover:z-[100] ${
        isDragging ? 'opacity-30 scale-95 ring-2 ring-dashed ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'hover:-translate-y-1 hover:shadow-md'
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
      {/* Hover Popup Bubble - Hidden on mobile, during drag, and for done tasks */}
      {hasExtraInfo && !anyDragging && !isDone && (
        <div className={`hidden md:block absolute top-0 z-[200] w-52 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none ${
          task.status === 'done' ? 'right-full mr-2' : 'left-full ml-2'
        }`}>
          <div className="space-y-2">
            {/* Description */}
            {task.description && (
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3">{task.description}</p>
            )}
            
            {/* Assignee */}
            {task.assignee && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                  {task.assignee.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300">{task.assignee}</span>
              </div>
            )}
            
            {/* Subtasks Progress */}
            {task.subtasks?.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Subtasks</span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
              </div>
            )}
            
            {/* Attachments & Notes - compact row */}
            {(task.attachments?.length > 0 || task.notes) && (
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                {task.attachments?.length > 0 && (
                  <span>📎 {task.attachments.length}</span>
                )}
                {task.notes && (
                  <span>📝 Notes</span>
                )}
              </div>
            )}
            
            {/* Blocking Tasks */}
            {task.dependencies?.length > 0 && (() => {
              const blockingTasks = task.dependencies
                .map(dep => allTasks.find(t => t.id === dep.depends_on_id))
                .filter(t => t && t.status !== 'done')
              if (blockingTasks.length === 0) return null
              return (
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-[10px] font-medium text-red-600 dark:text-red-400 mb-0.5">🚫 Blocked by:</p>
                  {blockingTasks.slice(0, 2).map(t => (
                    <p key={t.id} className="text-[10px] text-red-500 dark:text-red-400 truncate">• {t.title}</p>
                  ))}
                  {blockingTasks.length > 2 && (
                    <p className="text-[10px] text-red-400">+{blockingTasks.length - 2} more</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
      
      {/* Card Content */}
      <div className={`flex flex-col ${bulkSelectMode ? 'pl-5' : ''}`}>
        {/* Bulk select checkbox */}
        {bulkSelectMode && (
          <div className="absolute top-2 left-1.5 z-10">
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
              <span title="In My Day" className="flex-shrink-0">{TaskCardIcons.sun("w-3.5 h-3.5")}</span>
            )}
            {isOverdue && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-red-100 dark:bg-red-500/80 text-red-700 dark:text-white flex-shrink-0">OVERDUE</span>}
            {isDueToday && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-100 dark:bg-amber-500/80 text-amber-700 dark:text-white flex-shrink-0">TODAY</span>}
            {blocked && <span title="Blocked" className="flex-shrink-0">{TaskCardIcons.lock()}</span>}
            {task.critical && <span title="Critical" className="flex-shrink-0">{TaskCardIcons.flag()}</span>}
            {recurrence && <span title={recurrence.label} className="flex-shrink-0">{TaskCardIcons.repeat()}</span>}
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
                onClick={(e) => onUpdateTitle && !isMobile && e.stopPropagation()}
                onDoubleClick={!isMobile ? handleTitleDoubleClick : undefined}
                className={`flex-1 text-xs font-medium line-clamp-2 leading-tight ${
                  isOverdue ? 'text-red-700 dark:text-red-200 group-hover:text-red-800 dark:group-hover:text-red-100' :
                  isDueToday ? 'text-amber-700 dark:text-amber-200 group-hover:text-amber-800 dark:group-hover:text-amber-100' :
                  'text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                } ${onUpdateTitle && !isMobile ? 'cursor-text' : ''}`}
                title={onUpdateTitle && !isMobile ? 'Double-click to edit' : ''}
              >{task.title}</h4>
            )}
          </div>
          
          {/* Dates & Effort Row */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-[10px] text-gray-600 dark:text-gray-300">
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
            {task.time_estimate > 0 && (
              <span className="flex items-center gap-0.5">
                {TaskCardIcons.timer("w-3 h-3")} {formatTimeEstimate(task.time_estimate)}
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
          
          {/* Project and Customer at bottom - hidden on mobile */}
          {showProject && project && (
            <div className="hidden sm:block mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-500 dark:text-gray-300">
                {project.name}{task.customer && ` • ${task.customer}`}
              </span>
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
      
      {/* Quick Actions - floating bubble above card on hover (desktop only) */}
      {!isDragging && (
      <div className="hidden md:flex absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-95 group-hover:scale-100 z-10">
        <div className="flex items-center bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-full shadow-md border border-gray-200/50 dark:border-gray-600/50 px-1 py-0.5">
          {/* Start button - show if not in progress and not done */}
          {!isInProgress && !isDone && onQuickComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id, 'in_progress') }}
              className="p-1 text-gray-400 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-full transition-colors"
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
              className={`p-1 rounded-full transition-colors ${
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
          
          {/* Toggle Critical - not for done tasks */}
          {onToggleCritical && !isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCritical(task.id, !task.critical) }}
              className={`p-1 rounded-full transition-colors ${
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
          
          {/* Toggle My Day - show for non-done tasks */}
          {onToggleMyDay && !isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleMyDay(task.id, !inMyDay) }}
              className={`p-1 rounded-full transition-colors ${
                inMyDay 
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/30' 
                  : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30'
              }`}
              title={inMyDay ? 'Remove from My Day' : 'Add to My Day'}
            >
              <svg className="w-3.5 h-3.5" fill={inMyDay ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>
          )}
          
          {/* AI Break Down Task */}
          {onBreakdown && !isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onBreakdown(task) }}
              className="p-1 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-full transition-colors"
              title="Break down into subtasks"
            >
              <span className="text-xs">✨</span>
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

// Column Component
const Column = ({ column, tasks, projects, onEditTask, onDragStart, onDragOver, onDrop, showProject, allTasks, onQuickComplete, onStatusChange, onSetDueDate, bulkSelectMode, selectedTaskIds, onToggleSelect, onAddTask, onToggleMyDay, isMobileFullWidth, draggedTask, onUpdateTitle, onToggleCritical, onBreakdown }) => {
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
      className={`${isMobileFullWidth ? 'w-full' : 'flex-1 min-w-[200px] sm:min-w-[240px] max-w-[350px]'} bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl p-3 sm:p-4 transition-all duration-200 overflow-visible ${
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
      <div className={`${isMobileFullWidth ? 'hidden' : 'flex'} items-center gap-2 mb-4 ml-6 text-xs text-gray-500 dark:text-gray-300 min-h-[16px]`}>
        {totalMinutes > 0 && <span>{formatTimeEstimate(totalMinutes)}</span>}
        {column.id !== 'done' && criticalCount > 0 && <span className="text-red-500">{criticalCount} critical</span>}
        {column.id === 'backlog' && readyCount > 0 && <span className="text-green-600 dark:text-green-400">{readyCount} ready</span>}
      </div>
      
      <div className="space-y-2 overflow-visible">
        {displayTasks.length === 0 && !isDragOver && (
          <div className="py-6 sm:py-8 text-center">
            <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3 sm:mb-2 opacity-60">
              {ColumnEmptyIcons[column.id]()}
            </div>
            <p className="text-sm sm:text-xs text-gray-400 dark:text-gray-300 px-4">
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
            anyDragging={!!draggedTask}
            onUpdateTitle={onUpdateTitle}
            onToggleCritical={onToggleCritical}
            onBreakdown={onBreakdown}
            isMobile={isMobileFullWidth}
          />
        ))}
        
        {isDoneColumn && hiddenCount > 0 && !showAllDone && (
          <button
            onClick={() => setShowAllDone(true)}
            className="w-full py-3 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all"
          >
            View all {tasks.length} completed tasks →
          </button>
        )}
        
        {isDoneColumn && showAllDone && tasks.length > DONE_DISPLAY_LIMIT && (
          <button
            onClick={() => setShowAllDone(false)}
            className="w-full py-3 text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 font-medium bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            Show less ↑
          </button>
        )}
        
        {isBacklogColumn && hiddenCount > 0 && !showAllBacklog && (
          <button
            onClick={() => setShowAllBacklog(true)}
            className="w-full py-3 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all"
          >
            View all {tasks.length} backlog tasks →
          </button>
        )}
        
        {isBacklogColumn && showAllBacklog && tasks.length > BACKLOG_DISPLAY_LIMIT && (
          <button
            onClick={() => setShowAllBacklog(false)}
            className="w-full py-3 text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 font-medium bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
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
export default function KanbanBoard({ demoMode = false }) {
  const { user: authUser, signOut, profile, updateProfile, uploadAvatar } = useAuth()
  const navigate = useNavigate()
  
  // Use demo user if in demo mode, otherwise use authenticated user
  const user = demoMode ? DEMO_USER : authUser
  
  // Detect OS for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const shortcutModifier = isMac ? '⌘⌃' : 'Ctrl+Alt+'
  
  // Detect Electron for macOS traffic light spacing
  const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
  
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [undoToast, setUndoToast] = useState(null) // { taskId, previousStatus, message }
  const [notification, setNotification] = useState(null) // { message, type: 'success' | 'info' }
  const [breakdownTask, setBreakdownTask] = useState(null) // Task to break down with AI
  const [showWelcomeModal, setShowWelcomeModal] = useState(false) // First-time profile setup
  
  // Show welcome modal for new users without a profile
  // Only show if user is logged in AND has confirmed email
  useEffect(() => {
    if (!demoMode && user && user.email_confirmed_at && !loading && profile === null) {
      setShowWelcomeModal(true)
    } else {
      setShowWelcomeModal(false)
    }
  }, [demoMode, user, loading, profile])
  
  // Handle welcome modal completion
  const handleWelcomeComplete = async (profileData) => {
    const { error } = await updateProfile(profileData)
    if (!error) {
      setShowWelcomeModal(false)
    }
  }

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
  
  // Fetch Slack connection status
  const fetchSlackConnection = async () => {
    if (!user?.id) return
    setSlackLoading(true)
    try {
      const { data, error } = await supabase
        .from('slack_connections')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (!error && data) {
        setSlackConnection(data)
      }
    } catch (err) {
      console.error('Error fetching Slack connection:', err)
    }
    setSlackLoading(false)
  }

  // Disconnect Slack
  const handleDisconnectSlack = async () => {
    if (!slackConnection) return
    setSlackLoading(true)
    try {
      const { error } = await supabase
        .from('slack_connections')
        .delete()
        .eq('user_id', user.id)
      if (!error) {
        setSlackConnection(null)
        setSlackSuccess('Slack disconnected successfully')
        setTimeout(() => setSlackSuccess(''), 3000)
      } else {
        throw error
      }
    } catch (err) {
      console.error('Error disconnecting Slack:', err)
      setSlackError('Failed to disconnect Slack')
      setTimeout(() => setSlackError(''), 3000)
    }
    setSlackLoading(false)
  }

  // Connect to Slack - OAuth URL
  const getSlackOAuthUrl = () => {
    const clientId = '27424537124.10220987954279'
    const redirectUri = 'https://quzfljuvpvevvvdnsktd.supabase.co/functions/v1/slack-oauth'
    const scopes = 'chat:write,commands,users:read,im:write'
    const state = user?.id || ''
    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
  }

  // Handle saving display name
  const handleSaveDisplayName = async () => {
    setSavingProfile(true)
    try {
      const { error } = await updateProfile({ display_name: displayName })
      if (error) throw error
      setEditingDisplayName(false)
      showNotification('Display name saved')
    } catch (err) {
      console.error('Error saving display name:', err)
      setError('Failed to save display name')
    }
    setSavingProfile(false)
  }
  
  // Handle avatar upload from settings
  const avatarInputRef = useRef(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showNotification('Please select an image file', 'error')
      return
    }
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showNotification('Image must be less than 2MB', 'error')
      return
    }
    
    setUploadingAvatar(true)
    try {
      const { error } = await uploadAvatar(file)
      if (error) throw error
      showNotification('Profile photo updated')
    } catch (err) {
      console.error('Error uploading avatar:', err)
      showNotification('Failed to upload photo', 'error')
    }
    setUploadingAvatar(false)
    // Clear the input so the same file can be selected again
    if (avatarInputRef.current) avatarInputRef.current.value = ''
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
  const handlePreferenceChange = async (key, value) => {
    localStorage.setItem(key, value)
    if (key === 'trackli-default-view') setDefaultView(value)
    if (key === 'trackli-week-start') setWeekStartsOn(value)
    if (key === 'trackli-date-format') {
      setDateFormat(value)
      // Sync to profiles for Slack/Email integrations
      if (user?.id) {
        try {
          await supabase
            .from('profiles')
            .update({ date_format: value })
            .eq('id', user.id)
        } catch (err) {
          console.log('Could not sync date format:', err)
        }
      }
    }
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
  const [mobilePendingSheetOpen, setMobilePendingSheetOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [pendingEmailTasks, setPendingEmailTasks] = useState([])
  const [pendingEmailCount, setPendingEmailCount] = useState(0)
  const [pendingReviewExpanded, setPendingReviewExpanded] = useState(true)
  const [pendingDropdownOpen, setPendingDropdownOpen] = useState(false)
  const [uncheckedConfirmOpen, setUncheckedConfirmOpen] = useState(false)
  const [pendingBulkAction, setPendingBulkAction] = useState(null) // stores { tasksToApprove, uncheckedTasks }
  const [approvingTaskId, setApprovingTaskId] = useState(null)
  const [selectedPendingIds, setSelectedPendingIds] = useState(new Set())
  const [expandedPendingIds, setExpandedPendingIds] = useState(new Set())
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [slackConnection, setSlackConnection] = useState(null)
  const [slackLoading, setSlackLoading] = useState(false)
  const [slackError, setSlackError] = useState('')
  const [slackSuccess, setSlackSuccess] = useState('')
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
  const [dateFormat, setDateFormat] = useState(() => localStorage.getItem('trackli-date-format') || 'auto')
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
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
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
  const [filterDueThisWeek, setFilterDueThisWeek] = useState(false)
  const [filterMyDay, setFilterMyDay] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Field filters - supports multiple (e.g., { assignee: 'John', customer: 'Acme' })
  const [fieldFilters, setFieldFilters] = useState({})
  const [pendingFilterField, setPendingFilterField] = useState('')
  const [pendingFilterOperator, setPendingFilterOperator] = useState('')
  
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
  
  
  // Meeting Notes Import
  const [meetingNotesModalOpen, setMeetingNotesModalOpen] = useState(false)
  
  // Spark AI Assistant
  const [sparkPanelOpen, setSparkPanelOpen] = useState(false)
  const [meetingNotesData, setMeetingNotesData] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    projectId: '', // Empty by default - user must select
  })
  const [showMeetingNotesProjectError, setShowMeetingNotesProjectError] = useState(false)
  const [extractedTasks, setExtractedTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [showExtractedTasks, setShowExtractedTasks] = useState(false)
  const [uploadedImage, setUploadedImage] = useState(null) // { base64, mediaType, preview }
  
  // Voice Input State
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef(null)
  const projectDropdownRef = useRef(null)
  
  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setVoiceSupported(!!SpeechRecognition)
  }, [])

  // Click outside handler for project dropdown (Windows PWA fix)
  useEffect(() => {
    if (!projectDropdownOpen) return
    const handleClickOutside = (e) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target)) {
        setProjectDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [projectDropdownOpen])

  
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
      
      // Cmd/Ctrl/Alt + K for search
      if (modifier && e.key === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
        return
      }
      
      // Cmd/Ctrl/Alt + S for Spark AI assistant
      if (modifier && e.key === 's') {
        e.preventDefault()
        setSparkPanelOpen(true)
        return
      }
      
      // / for search (no modifier needed)
      if (e.key === '/') {
        e.preventDefault()
        setSearchModalOpen(true)
        return
      }
      
      // q for quick add (no modifier needed) OR Cmd/Ctrl/Alt + Q
      if (e.key === 'q' || (modifier && e.key === 'q')) {
        e.preventDefault()
        if (projects.length > 0) {
          setQuickAddProject('')
          setQuickAddOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + T for new Task
      if (modifier && e.key === 't') {
        e.preventDefault()
        if (projects.length > 0) {
          setEditingTask(selectedProjectId !== 'all' ? { project_id: selectedProjectId } : null)
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
          setMeetingNotesData({ ...meetingNotesData, projectId: '' }) // Don't auto-select
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setShowMeetingNotesProjectError(false)
          setVoiceTranscript('')
          setMeetingNotesModalOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + V for Voice Input
      if (modifier && e.key === 'v') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: '', notes: '' }) // Don't auto-select
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setShowMeetingNotesProjectError(false)
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
  
  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0)
    if (currentView) {
      trackEvent('view_changed', { view: currentView })
    }
  }, [currentView])
  
  // Handle completing a view tour
  const handleViewTourComplete = (view) => {
    const newCompleted = { ...viewToursCompleted, [view]: true }
    setViewToursCompleted(newCompleted)
    localStorage.setItem('trackli_view_tours_completed', JSON.stringify(newCompleted))
    setActiveViewTour(null)
    setViewTourStep(0)
  }
  
  // Fetch data on mount
  useEffect(() => {
    fetchData()
    fetchPendingEmailTasks()
  }, [])

  // Supabase Realtime subscription for tasks
  // Automatically updates UI when tasks are created/updated/deleted from any source
  useEffect(() => {
    if (demoMode || !user?.id) return

    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Task inserted', payload.new.id)
          setTasks(prev => {
            // Avoid duplicates (in case optimistic update already added it)
            if (prev.some(t => t.id === payload.new.id)) return prev
            return [...prev, { ...payload.new, attachments: [], dependencies: [] }]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Task updated', payload.new.id)
          setTasks(prev => prev.map(t => 
            t.id === payload.new.id 
              ? { ...t, ...payload.new }
              : t
          ))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Task deleted', payload.old.id)
          setTasks(prev => prev.filter(t => t.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        console.log('Realtime tasks subscription:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode, user?.id])

  // Supabase Realtime subscription for projects
  useEffect(() => {
    if (demoMode || !user?.id) return

    const channel = supabase
      .channel('projects-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Project inserted', payload.new.id)
          setProjects(prev => {
            if (prev.some(p => p.id === payload.new.id)) return prev
            return [...prev, { ...payload.new, members: [], customers: [] }]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Project updated', payload.new.id)
          setProjects(prev => prev.map(p => 
            p.id === payload.new.id 
              ? { ...p, ...payload.new }
              : p
          ))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Project deleted', payload.old.id)
          setProjects(prev => prev.filter(p => p.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        console.log('Realtime projects subscription:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode, user?.id])

  // Supabase Realtime subscription for pending email tasks
  useEffect(() => {
    if (demoMode || !user?.id) return

    const channel = supabase
      .channel('pending-email-tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pending_email_tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Pending email task inserted', payload.new.id)
          setPendingEmailTasks(prev => {
            if (prev.some(t => t.id === payload.new.id)) return prev
            return [payload.new, ...prev] // Newest first
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pending_email_tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Pending email task updated', payload.new.id)
          setPendingEmailTasks(prev => prev.map(t => 
            t.id === payload.new.id 
              ? { ...t, ...payload.new }
              : t
          ))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'pending_email_tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Realtime: Pending email task deleted', payload.old.id)
          setPendingEmailTasks(prev => prev.filter(t => t.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        console.log('Realtime pending email tasks subscription:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [demoMode, user?.id])

  // Handle URL parameters (Slack callback, task deep link)
  const handleUrlParams = useCallback(async () => {
    if (demoMode) return
    
    const params = new URLSearchParams(window.location.search)
    
    // Check for Slack callback params
    const slackStatus = params.get('slack')
    if (slackStatus === 'success') {
      setSlackSuccess('Slack connected successfully!')
      setSettingsModalOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
      return
    } else if (slackStatus === 'error') {
      setSlackError(params.get('message') || 'Failed to connect Slack')
      setSettingsModalOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    
    // Handle task deep link
    const taskId = params.get('task')
    if (taskId) {
      const { data: task, error } = await supabase
        .from('tasks')
        .select('*, project:projects(name, user_id)')
        .eq('id', taskId)
        .single()
      
      if (!error && task && task.project?.user_id === user.id) {
        setSelectedTask(task)
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [demoMode, user?.id])
  
  // Check URL params on mount and when app regains focus (for PWA deep links)
  useEffect(() => {
    handleUrlParams()
    
    const handleFocus = () => handleUrlParams()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleUrlParams()
    }
    
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [handleUrlParams])
  
  // Fetch Slack connection on mount
  useEffect(() => {
    if (demoMode) return
    
    const fetchSlackConnection = async () => {
      const { data, error } = await supabase
        .from('slack_connections')
        .select('*')
        .eq('user_id', user.id)
        .single()
      
      if (!error && data) {
        setSlackConnection(data)
      }
    }
    fetchSlackConnection()
  }, [demoMode])

  // Refresh pending tasks periodically (every 60 seconds)
  useEffect(() => {
    if (demoMode) return
    const interval = setInterval(fetchPendingEmailTasks, 60000)
    return () => clearInterval(interval)
  }, [demoMode])

  
  // Fetch pending email tasks
  const fetchPendingEmailTasks = async () => {
    if (demoMode) return
    try {
      const { data, error } = await supabase
        .from('pending_tasks')
        .select('*, email_sources(id, subject, from_address, body_text, body_html)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Fetch email attachments for each email source
      const emailSourceIds = [...new Set(data?.map(t => t.email_source_id).filter(Boolean))]
      let emailAttachments = {}
      if (emailSourceIds.length > 0) {
        const { data: attData } = await supabase
          .from('email_attachments')
          .select('*')
          .in('email_source_id', emailSourceIds)
        
        // Group by email_source_id
        attData?.forEach(att => {
          if (!emailAttachments[att.email_source_id]) emailAttachments[att.email_source_id] = []
          emailAttachments[att.email_source_id].push(att)
        })
      }
      
      // Attach email attachments to each pending task
      const enrichedData = (data || []).map(t => ({
        ...t,
        email_attachments: emailAttachments[t.email_source_id] || []
      }))
      
      setPendingEmailTasks(enrichedData)
      setPendingEmailCount(enrichedData.length)
      // Auto-select high confidence, critical, and Slack tasks, including newly arrived ones
      setSelectedPendingIds(prev => {
        const autoSelectTasks = new Set(
          (enrichedData || []).filter(t => 
            (t.ai_confidence || 0) >= 0.7 || t.critical || t.source === 'slack'
          ).map(t => t.id)
        )
        
        if (prev.size === 0) {
          // Initial load - select all auto-select tasks
          return autoSelectTasks
        }
        
        // Keep existing selections, remove invalid, and ADD newly arrived auto-select tasks
        const validIds = new Set((enrichedData || []).map(t => t.id))
        const existingValid = new Set([...prev].filter(id => validIds.has(id)))
        
        // Find new tasks that weren't in prev
        const previousIds = prev
        const newAutoSelect = [...autoSelectTasks].filter(id => !previousIds.has(id))
        
        // Merge: existing valid selections + new auto-select tasks
        return new Set([...existingValid, ...newAutoSelect])
      })
    } catch (err) {
      console.error('Error fetching pending email tasks:', err)
    }
  }

  // Determine target column based on due date
  const getTargetColumn = (dueDate, isCritical) => {
    if (isCritical) return 'todo'
    if (!dueDate) return 'backlog'
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    
    const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
    
    if (daysUntilDue <= 7) return 'todo'
    return 'backlog'
  }

  // Approve pending email task
  const handleApprovePendingTask = async (pendingTask, projectId) => {
    if (!projectId) {
      alert('Please select a project first')
      return
    }
    
    setApprovingTaskId(pendingTask.id)
    
    try {
      const targetColumn = getTargetColumn(pendingTask.due_date, pendingTask.critical)
      
      // Create the actual task
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: pendingTask.title,
          description: pendingTask.description,
          due_date: pendingTask.due_date,
          start_date: pendingTask.start_date,
          assignee: pendingTask.assignee_text,
          project_id: projectId,
          status: targetColumn,
          critical: pendingTask.critical || false,
          energy_level: pendingTask.energy_level || 'medium',
          time_estimate: pendingTask.time_estimate || 0,
          customer: pendingTask.customer || null,
          subtasks: [],
          comments: []
        })
        .select()
        .single()
      
      if (taskError) throw taskError
      
      // Update pending task status
      await supabase
        .from('pending_tasks')
        .update({ status: 'approved' })
        .eq('id', pendingTask.id)
      
      // Refresh data
      await fetchData()
      await fetchPendingEmailTasks()
      
    } catch (err) {
      console.error('Error approving pending task:', err)
      alert('Failed to create task: ' + err.message)
    } finally {
      setApprovingTaskId(null)
    }
  }

  // Reject pending email task
  const handleRejectPendingTask = async (pendingTaskId) => {
    try {
      await supabase
        .from('pending_tasks')
        .update({ status: 'rejected' })
        .eq('id', pendingTaskId)
      
      setSelectedPendingIds(prev => {
        const next = new Set(prev)
        next.delete(pendingTaskId)
        return next
      })
      await fetchPendingEmailTasks()
    } catch (err) {
      console.error('Error rejecting pending task:', err)
    }
  }

  // Bulk approve selected pending tasks
  const handleBulkApprovePendingTasks = async (removeUnchecked = false) => {
    // Prevent double-clicks
    if (approvingTaskId === 'bulk') return
    
    const tasksToApprove = pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id)
    const uncheckedTasks = pendingEmailTasks.filter(t => !selectedPendingIds.has(t.id))
    
    if (tasksToApprove.length === 0) {
      alert('Please select tasks and ensure they have projects assigned')
      return
    }
    
    // If there are unchecked tasks and we haven't decided yet, show confirmation
    if (uncheckedTasks.length > 0 && !pendingBulkAction) {
      setPendingBulkAction({ tasksToApprove, uncheckedTasks })
      setUncheckedConfirmOpen(true)
      return
    }
    
    setApprovingTaskId('bulk')
    
    try {
      // Create all tasks and handle attachments
      const createdTaskIds = []
      
      for (const task of tasksToApprove) {
        const targetColumn = getTargetColumn(task.due_date, task.critical)
        
        // Auto-set effort based on time estimate
        let energyLevel = task.energy_level || 'medium'
        if (task.time_estimate) {
          if (task.time_estimate <= 30) energyLevel = 'low'
          else if (task.time_estimate <= 120) energyLevel = 'medium'
          else energyLevel = 'high'
        }
        
        // Build notes with full email body
        let notes = ''
        if (task.email_sources) {
          notes = `📧 **Email from:** ${task.email_sources.from_address || 'Unknown'}\n**Subject:** ${task.email_sources.subject || '(no subject)'}\n\n---\n\n${task.email_sources.body_text || task.email_sources.body_html || '(no body)'}`
        }
        
        // Insert task
        const { data: newTask, error: insertError } = await supabase
          .from('tasks')
          .insert({
            title: task.title,
            description: task.description || null,
            notes: notes || null,
            due_date: task.due_date,
            start_date: task.start_date,
            assignee: task.assignee_text,
            project_id: task.project_id,
            status: targetColumn,
            critical: task.critical || false,
            energy_level: energyLevel,
            time_estimate: task.time_estimate || 0,
            customer: task.customer || null,
            subtasks: [],
            comments: []
          })
          .select()
          .single()
        
        if (insertError) {
          console.error('Error creating task:', insertError)
          continue
        }
        
        createdTaskIds.push(newTask.id)
        
        // Copy email attachments to task
        if (task.email_attachments && task.email_attachments.length > 0) {
          for (const att of task.email_attachments) {
            try {
              // Copy file in storage to task attachments folder
              const newPath = `${newTask.id}/${att.file_name}`
              const { error: copyError } = await supabase.storage
                .from('attachments')
                .copy(att.file_path, newPath)
              
              if (!copyError) {
                // Create attachment record
                await supabase.from('attachments').insert({
                  task_id: newTask.id,
                  file_name: att.file_name,
                  file_path: newPath,
                  file_size: att.file_size,
                  file_type: att.file_type
                })
              } else {
                console.error('Error copying attachment:', copyError)
              }
            } catch (attErr) {
              console.error('Error processing attachment:', attErr)
            }
          }
        }
      }
      
      // Update all pending tasks to approved
      const pendingIds = tasksToApprove.map(t => t.id)
      await supabase
        .from('pending_tasks')
        .update({ status: 'approved' })
        .in('id', pendingIds)
      
      // Log analytics for AI extraction accuracy
      try {
        const analyticsRows = []
        for (const task of tasksToApprove) {
          const original = task.ai_original_values || {}
          const fields = [
            { name: 'title', ai: original.title, final: task.title },
            { name: 'due_date', ai: original.due_date, final: task.due_date },
            { name: 'assignee', ai: original.assignee_text, final: task.assignee_text },
            { name: 'customer', ai: original.customer, final: task.customer },
            { name: 'energy_level', ai: original.energy_level, final: task.energy_level },
            { name: 'critical', ai: String(original.critical || false), final: String(task.critical || false) },
            { name: 'time_estimate', ai: String(original.time_estimate || ''), final: String(task.time_estimate || '') },
            { name: 'project_id', ai: original.project_name, final: task.project_id }
          ]
          for (const f of fields) {
            if (f.ai !== undefined || f.final !== undefined) {
              analyticsRows.push({
                user_id: user.id,
                pending_task_id: task.id,
                email_source_id: task.email_source_id,
                field_name: f.name,
                ai_value: f.ai || null,
                final_value: f.final || null,
                was_changed: f.ai !== f.final
              })
            }
          }
        }
        if (analyticsRows.length > 0) {
          await supabase.from('email_extraction_analytics').insert(analyticsRows)
        }
      } catch (analyticsErr) {
        console.warn('Analytics logging failed (non-critical):', analyticsErr)
      }
      
      // If user chose to remove unchecked tasks, mark them as rejected
      if (removeUnchecked && uncheckedTasks.length > 0) {
        const uncheckedIds = uncheckedTasks.map(t => t.id)
        await supabase
          .from('pending_tasks')
          .update({ status: 'rejected' })
          .in('id', uncheckedIds)
      }
      
      // Refresh once at the end
      await fetchData()
      await fetchPendingEmailTasks()
      // Clear selections and pending action for fresh start
      setSelectedPendingIds(new Set())
      setPendingBulkAction(null)
      // Close dropdown after successful create
      setPendingDropdownOpen(false)
      
    } catch (err) {
      console.error('Error bulk approving tasks:', err)
      alert('Failed to create some tasks: ' + err.message)
    } finally {
      setApprovingTaskId(null)
    }
  }

  // Toggle pending task selection
  const togglePendingTaskSelection = (taskId) => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // Update pending task field
  const handleUpdatePendingTask = async (taskId, field, value) => {
    try {
      let updates = { [field]: value }
      
      // Auto-set effort when time estimate changes
      if (field === 'time_estimate' && value) {
        const mins = parseInt(value)
        if (mins <= 30) updates.energy_level = 'low'
        else if (mins <= 120) updates.energy_level = 'medium'
        else updates.energy_level = 'high'
      }
      
      await supabase
        .from('pending_tasks')
        .update(updates)
        .eq('id', taskId)
      
      setPendingEmailTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, ...updates } : t
      ))
    } catch (err) {
      console.error('Error updating pending task:', err)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    // If in demo mode, load demo data instead of fetching from database
    if (demoMode) {
      const projectsWithRelations = DEMO_PROJECTS.map(project => ({
        ...project,
        members: project.team_members || [],
        customers: project.customers || []
      }))
      
      const tasksWithRelations = DEMO_TASKS.map(task => ({
        ...task,
        attachments: [],
        dependencies: []
      }))
      
      setProjects(projectsWithRelations)
      setTasks(tasksWithRelations)
      setLoading(false)
      return
    }
    
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
    
    // Check user's explicit preference first, then fall back to browser detection
    const dateFormatPref = typeof localStorage !== 'undefined' ? localStorage.getItem('trackli-date-format') : null
    const isUSLocale = (dateFormatPref && dateFormatPref.includes('MM/DD')) || 
                       ((!dateFormatPref || dateFormatPref === 'auto') && isUSDateFormat())
    
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
        month = parseInt(match[1])
        day = parseInt(match[2])
      } else {
        // UK/EU: DD/MM/YYYY
        day = parseInt(match[1])
        month = parseInt(match[2])
      }
      const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])
      // Validate date
      const date = new Date(year, month - 1, day)
      if (!isNaN(date.getTime()) && date.getDate() === day) {
        // Format directly to avoid timezone issues
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
    
    // Short date without year
    match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/)
    if (match) {
      let day, month
      if (isUSLocale) {
        month = parseInt(match[1])
        day = parseInt(match[2])
      } else {
        day = parseInt(match[1])
        month = parseInt(match[2])
      }
      const year = today.getFullYear()
      // Validate date
      const date = new Date(year, month - 1, day)
      if (!isNaN(date.getTime()) && date.getDate() === day) {
        // Format directly to avoid timezone issues
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
    
    // Month name mappings (both short and full)
    const monthsShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    const monthsFull = ['january','february','march','april','may','june','july','august','september','october','november','december']
    
    // Helper to get month index from name (short or full)
    const getMonthIndex = (monthStr) => {
      const lower = monthStr.toLowerCase()
      let idx = monthsShort.indexOf(lower.substring(0, 3))
      if (idx === -1) idx = monthsFull.indexOf(lower)
      return idx
    }
    
    // Match "7 January" or "7 Jan" (day first)
    match = dateStr.match(/(\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
    if (match) {
      const day = parseInt(match[1])
      const month = getMonthIndex(match[2])
      if (month !== -1) {
        const year = today.getFullYear()
        const date = new Date(year, month, day)
        if (!isNaN(date.getTime()) && date.getDate() === day) {
          return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
      }
    }
    // Match "January 7" or "Jan 7" (month first)
    match = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})/i)
    if (match) {
      const day = parseInt(match[2])
      const month = getMonthIndex(match[1])
      if (month !== -1) {
        const year = today.getFullYear()
        const date = new Date(year, month, day)
        if (!isNaN(date.getTime()) && date.getDate() === day) {
          return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
      }
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
            // After matching bullet/numbered list, check for "Name to verb" pattern within
            const nameToPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+to\s+(.+)/i
            const nameToMatch = taskTitle.match(nameToPattern)
            if (nameToMatch) {
              assignee = nameToMatch[1].trim()
              // Keep the full task title including assignee name for context
            }
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
          .replace(/^(?:action|todo|task|action item|follow[ -]?up)[:\s]*/i, '')
          .replace(/^ai[:\s]+/i, '') // Separate AI prefix - must have colon or space after
          .trim()
        
        let dueDate = meetingNotesData.date
        
        // Check user's date format preference
        const dateFormatPref = typeof localStorage !== 'undefined' ? localStorage.getItem('trackli-date-format') : null
        const isUSLocale = (dateFormatPref && dateFormatPref.includes('MM/DD')) || 
                           ((!dateFormatPref || dateFormatPref === 'auto') && isUSDateFormat())
        
        const datePatterns = [
          /by\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
          /by\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
          /on\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
          /due\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
          /due\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
          /(eod|end of day|eow|end of week|asap)/i,
          /\s(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*$/i, // Date at end of string like "send notes 10/10"
          /by\s+((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{1,2})\b/i, // "by January 9"
          /by\s+(\d{1,2}\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/i, // "by 9 January"
          /[\u2013\u2014-]\s*(\d{1,2}\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s*$/i, // "- 7 January" at end
          /\s((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{1,2})\s*$/i, // "January 8" at end
          /\s(\d{1,2}\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s*$/i, // "7 January" at end
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
            } else if (/\d{1,2}\/\d{1,2}/.test(hint)) {
              // Numeric date like 10/01 or 10/01/2026
              const parts = hint.split('/')
              let day, month, year = today.getFullYear()
              if (isUSLocale) {
                month = parseInt(parts[0])
                day = parseInt(parts[1])
              } else {
                day = parseInt(parts[0])
                month = parseInt(parts[1])
              }
              if (parts[2]) {
                year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])
              }
              // Validate date
              const parsedDate = new Date(year, month - 1, day)
              if (!isNaN(parsedDate.getTime()) && parsedDate.getDate() === day) {
                // Format directly to avoid timezone issues
                dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              }
            } else if (/\d{1,2}\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(hint)) {
              // Month name date like "7 January" or "7 Jan" (day first)
              const monthsShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
              const monthMatch = hint.match(/(\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
              if (monthMatch) {
                const day = parseInt(monthMatch[1])
                const monthStr = monthMatch[2].toLowerCase()
                const month = monthsShort.indexOf(monthStr.substring(0, 3))
                if (month !== -1) {
                  const year = today.getFullYear()
                  const parsedDate = new Date(year, month, day)
                  if (!isNaN(parsedDate.getTime()) && parsedDate.getDate() === day) {
                    dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  }
                }
              }
            } else if (/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{1,2}/i.test(hint)) {
              // Month name date like "January 9" or "Jan 9" (month first)
              const monthsShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
              const monthMatch = hint.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})/i)
              if (monthMatch) {
                const monthStr = monthMatch[1].toLowerCase()
                const day = parseInt(monthMatch[2])
                const month = monthsShort.indexOf(monthStr.substring(0, 3))
                if (month !== -1) {
                  const year = today.getFullYear()
                  const parsedDate = new Date(year, month, day)
                  if (!isNaN(parsedDate.getTime()) && parsedDate.getDate() === day) {
                    dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  }
                }
              }
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
    
    // Validate project selection
    if (!meetingNotesData.projectId) {
      setShowMeetingNotesProjectError(true)
      return
    }
    setShowMeetingNotesProjectError(false)
    
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
          confidence: task.confidence || 0.7,
          selected: (task.confidence || 0.7) >= 0.7, // Auto-select high confidence tasks
        }))
        
        setExtractedTasks(extracted)
        setShowExtractedTasks(true)
      } else {
        // Use AI-powered extraction via Edge Function
        const selectedProject = projects.find(p => p.id === meetingNotesData.projectId)
        const projectMembers = selectedProject?.members || []
        
        const response = await fetch('https://quzfljuvpvevvvdnsktd.supabase.co/functions/v1/extract-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: meetingNotesData.notes,
            title: meetingNotesData.title,
            date: meetingNotesData.date,
            members: projectMembers,
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to extract tasks')
        }
        
        const data = await response.json()
        
        if (data.tasks && data.tasks.length > 0) {
          setExtractedTasks(data.tasks)
          setShowExtractedTasks(true)
        } else {
          // No tasks found
          setExtractedTasks([])
          setShowExtractedTasks(true)
        }
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
      return
    }
    
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
        
        // Determine status: to-do if due within 2 days, otherwise backlog
        let status = 'backlog'
        if (task.dueDate) {
          const dueDate = new Date(task.dueDate + 'T23:59:59')
          const today = new Date()
          const twoDaysFromNow = new Date(today)
          twoDaysFromNow.setDate(today.getDate() + 2)
          if (dueDate <= twoDaysFromNow) {
            status = 'todo'
          }
        }
        
        const taskData = {
          title: task.title,
          description: meetingNotesData.title ? `From meeting: ${meetingNotesData.title}` : '',
          project_id: projectId,
          status: status,
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
      
      trackEvent('ai_notes_used', { task_count: selectedTasks.length })
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
          .update({ name: projectData.name, color: projectData.color })
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
          .insert({ name: projectData.name, color: projectData.color, user_id: user.id })
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

  // Add customer to project
  const handleAddCustomerToProject = async (projectId, customerName) => {
    if (!projectId || !customerName.trim()) return null
    
    try {
      // Check if customer already exists in this project
      const project = projects.find(p => p.id === projectId)
      if (project?.customers?.includes(customerName.trim())) {
        return customerName.trim() // Already exists, just return it
      }
      
      // Insert into database
      const { error } = await supabase
        .from('project_customers')
        .insert({ project_id: projectId, name: customerName.trim() })
      
      if (error) throw error
      
      // Update local state
      setProjects(projects.map(p => 
        p.id === projectId 
          ? { ...p, customers: [...(p.customers || []), customerName.trim()] }
          : p
      ))
      
      return customerName.trim()
    } catch (err) {
      console.error('Error adding customer:', err)
      return null
    }
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
        trackEvent('task_created', { source: taskData.source || 'manual' })
        
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

      // Optimistic update for instant UI feedback
      const isNew = !taskData.id
      if (isNew && taskId) {
        // New task - add to state
        setTasks(prev => [...prev, { ...taskData, id: taskId, attachments: [], dependencies: [] }])
      } else if (taskId) {
        // Updated task - update in state
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...taskData } : t))
      }
      
      // Show notification
      showNotification(isNew ? "✓ Task created" : "✓ Task saved")
      
      // Track task count for PWA install prompt
      if (isNew) {
        const currentCount = parseInt(localStorage.getItem('taskCount') || '0')
        localStorage.setItem('taskCount', (currentCount + 1).toString())
      }
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
        
        setTasks(prev => prev.filter(t => t.id !== parentId && t.recurrence_parent_id !== parentId))
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
        
        setTasks(prev => prev.filter(t => t.id !== taskId))
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
    if (!title.trim() || !projectId) return
    
    const targetProject = projectId
    if (!targetProject) return
    
    // Determine status and start_date based on due date
    const today = new Date().toISOString().split('T')[0]
    const hasDate = !!dueDate
    const status = hasDate ? 'todo' : 'backlog'
    const startDate = dueDate || null
    
    try {
      setSaving(true)
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          project_id: targetProject,
          status: status,
          start_date: startDate,
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
      const today = new Date().toISOString().split('T')[0]
      
      // If removing from My Day, track the removal date
      // If adding to My Day, clear the removal tracking
      const updateData = myDayDate 
        ? { my_day_date: myDayDate, removed_from_myday_at: null }
        : { my_day_date: null, removed_from_myday_at: today }
      
      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
      
      if (error) throw error
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, ...updateData } : t
      ))
      
      // Show notification and track
      if (myDayDate && new Date(myDayDate).toDateString() === new Date().toDateString()) {
        showNotification(`Added "${task?.title}" to My Day`)
        trackEvent('my_day_task_added')
      } else if (!myDayDate) {
        showNotification(`Removed "${task?.title}" from My Day`)
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
        trackEvent('task_completed', { had_subtasks: (task?.subtasks?.length || 0) > 0 })
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
      showNotification(critical ? "Marked as critical" : "Critical flag removed")
    } catch (err) {
      console.error('Error toggling critical:', err)
      setError(err.message)
    }
  }

  // Add subtasks from AI breakdown
  const handleAddBreakdownSubtasks = async (subtaskTitles) => {
    if (!breakdownTask) return
    
    try {
      const existingSubtasks = breakdownTask.subtasks || []
      const newSubtasks = subtaskTitles.map(title => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title,
        completed: false,
        due_date: null
      }))
      const allSubtasks = [...existingSubtasks, ...newSubtasks]
      
      const { error } = await supabase
        .from('tasks')
        .update({ subtasks: allSubtasks })
        .eq('id', breakdownTask.id)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === breakdownTask.id ? { ...t, subtasks: allSubtasks } : t))
      showNotification(`✨ Added ${newSubtasks.length} subtask${newSubtasks.length > 1 ? 's' : ''}`)
      trackEvent('ai_breakdown_used', { subtask_count: newSubtasks.length })
    } catch (err) {
      console.error('Error adding subtasks:', err)
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

  const handleToggleSubtask = async (taskId, subtaskId, completed) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task || !task.subtasks) return
      
      const updatedSubtasks = task.subtasks.map(s =>
        s.id === subtaskId ? { ...s, completed } : s
      )
      
      const { error } = await supabase
        .from('tasks')
        .update({ subtasks: updatedSubtasks })
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, subtasks: updatedSubtasks } : t))
    } catch (err) {
      console.error('Error toggling subtask:', err)
      setError(err.message)
    }
  }

  const handleUndo = async () => {
    if (!undoToast) return
    try {
      // Support both old format (previousStatus) and new format (previousState)
      if (undoToast.previousState) {
        // New format: revert to full previous state
        const { id, created_at, user_id, ...revertFields } = undoToast.previousState
        await supabase.from('tasks').update(revertFields).eq('id', undoToast.taskId)
        setTasks(prev => prev.map(t => t.id === undoToast.taskId ? { ...t, ...revertFields } : t))
      } else if (undoToast.previousStatus) {
        // Old format: just revert status
        await supabase.from('tasks').update({ status: undoToast.previousStatus }).eq('id', undoToast.taskId)
        setTasks(prev => prev.map(t => t.id === undoToast.taskId ? { ...t, status: undoToast.previousStatus } : t))
      }
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
  const hasActiveFilters = filterCritical || filterOverdue || filterBlocked || filterActive || filterBacklog || filterDueToday || filterDueThisWeek || filterMyDay || searchQuery.trim() || Object.keys(fieldFilters).length > 0
  
  // Clear all filters
  const clearFilters = () => {
    setFilterCritical(false)
    setFilterOverdue(false)
    setFilterBlocked(false)
    setFilterActive(false)
    setFilterBacklog(false)
    setFilterDueToday(false)
    setFilterDueThisWeek(false)
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
    if (filterDueThisWeek) {
      if (!t.due_date || t.status === 'done') return false
      const dueDate = new Date(t.due_date)
      const today = new Date()
      const endOfWeek = new Date(today)
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
      endOfWeek.setHours(23, 59, 59, 999)
      today.setHours(0, 0, 0, 0)
      if (dueDate < today || dueDate > endOfWeek) return false
    }
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
          else if (value.startsWith('=') || value.startsWith('<') || value.startsWith('>')) {
            const op = value[0]
            const dateStr = value.slice(1)
            const filterDate = new Date(dateStr)
            const taskDate = t.due_date ? new Date(t.due_date) : null
            if (!taskDate) return false
            // Normalize to compare just dates
            filterDate.setHours(0,0,0,0)
            taskDate.setHours(0,0,0,0)
            if (op === '=' && taskDate.getTime() !== filterDate.getTime()) return false
            if (op === '<' && taskDate >= filterDate) return false
            if (op === '>' && taskDate <= filterDate) return false
          }
        }
        if (field === 'start_date') {
          if (value === '__blank__' && t.start_date) return false
          if (value === 'has_date' && !t.start_date) return false
          else if (value.startsWith('=') || value.startsWith('<') || value.startsWith('>')) {
            const op = value[0]
            const dateStr = value.slice(1)
            const filterDate = new Date(dateStr)
            const taskDate = t.start_date ? new Date(t.start_date) : null
            if (!taskDate) return false
            filterDate.setHours(0,0,0,0)
            taskDate.setHours(0,0,0,0)
            if (op === '=' && taskDate.getTime() !== filterDate.getTime()) return false
            if (op === '<' && taskDate >= filterDate) return false
            if (op === '>' && taskDate <= filterDate) return false
          }
        }
        if (field === 'time_estimate') {
          if (value === '__blank__' && t.time_estimate) return false
          else if (value.startsWith('=') || value.startsWith('<') || value.startsWith('>')) {
            const op = value[0]
            const filterVal = parseInt(value.slice(1))
            const taskVal = t.time_estimate || 0
            if (op === '=' && taskVal !== filterVal) return false
            if (op === '<' && taskVal >= filterVal) return false
            if (op === '>' && taskVal <= filterVal) return false
          }
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

  // Sort tasks by priority for board columns (Backlog, To Do, In Progress)
  // Sort order: Due Date (earliest) → Critical → Start Date → Created Date
  // Tasks without due dates fall back to start date, then created date
  const sortTasksByPriority = (tasks) => {
    return [...tasks].sort((a, b) => {
      const aHasDue = !!a.due_date
      const bHasDue = !!b.due_date
      const aHasStart = !!a.start_date
      const bHasStart = !!b.start_date

      // Tasks with due dates come before tasks without
      if (aHasDue && !bHasDue) return -1
      if (!aHasDue && bHasDue) return 1

      // Both have due dates
      if (aHasDue && bHasDue) {
        // 1. Sort by due date (earliest first)
        const dueDateCompare = new Date(a.due_date) - new Date(b.due_date)
        if (dueDateCompare !== 0) return dueDateCompare

        // 2. Same due date: critical first
        if (a.critical && !b.critical) return -1
        if (!a.critical && b.critical) return 1

        // 3. Same due date, same critical: sort by start date
        if (aHasStart && bHasStart) {
          const startDateCompare = new Date(a.start_date) - new Date(b.start_date)
          if (startDateCompare !== 0) return startDateCompare
        } else if (aHasStart && !bHasStart) {
          return -1
        } else if (!aHasStart && bHasStart) {
          return 1
        }

        // 4. Final tiebreaker: created date (oldest first)
        return new Date(a.created_at) - new Date(b.created_at)
      }

      // Neither has due date - fall back to start date logic
      // Tasks with start dates come before tasks without
      if (aHasStart && !bHasStart) return -1
      if (!aHasStart && bHasStart) return 1

      // Both have start dates (but no due dates)
      if (aHasStart && bHasStart) {
        // 1. Sort by start date (earliest first)
        const startDateCompare = new Date(a.start_date) - new Date(b.start_date)
        if (startDateCompare !== 0) return startDateCompare

        // 2. Same start date: critical first
        if (a.critical && !b.critical) return -1
        if (!a.critical && b.critical) return 1

        // 3. Final tiebreaker: created date (oldest first)
        return new Date(a.created_at) - new Date(b.created_at)
      }

      // Neither has due date nor start date
      // 1. Critical first
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1

      // 2. Created date (oldest first)
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
    return sortTasksByPriority(statusTasks)
  }

  // Stats
  const criticalCount = filteredTasks.filter((t) => t.critical && t.status !== 'done').length
  const overdueCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'overdue').length
  const dueTodayCount = filteredTasks.filter((t) => getDueDateStatus(t.due_date, t.status) === 'today').length
  const blockedCount = filteredTasks.filter((t) => isBlocked(t, tasks) && t.status !== 'done').length
  const myDayCount = filteredTasks.filter((t) => isInMyDay(t)).length
  const dueThisWeekCount = filteredTasks.filter((t) => {
    if (!t.due_date || t.status === 'done') return false
    const due = new Date(t.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(today)
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
    endOfWeek.setHours(23, 59, 59, 999)
    return due >= today && due <= endOfWeek
  }).length
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
                    <stop offset="0%" stopColor="#7C3AED"/>
                    <stop offset="100%" stopColor="#9333EA"/>
                  </linearGradient>
                  <linearGradient id="loading-right" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EA580C"/>
                    <stop offset="100%" stopColor="#F97316"/>
                  </linearGradient>
                </defs>
                <path d="M6 18L28 6L28 38L6 26Z" fill="url(#loading-left)"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="url(#loading-right)"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="#E9D5FF"/>
                <path d="M18 19L25 26L36 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-orange-500 animate-ping opacity-20" />
          </div>
          
          {/* Brand name */}
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-purple-500 to-orange-500 bg-clip-text text-transparent mb-2">
            Trackli
          </h1>
          
          {/* Loading text */}
          <p className="text-gray-500 dark:text-gray-300 text-sm">
            Loading your tasks...
          </p>
        </div>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={fetchData}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 transition-colors duration-200 flex flex-col overflow-x-hidden">
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
      
      {/* Demo Mode Banner */}
      {demoMode && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-purple-600 text-white px-4 py-2.5 text-center text-sm font-medium shadow-lg">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              You're exploring Trackli in demo mode — changes won't be saved
            </span>
            <a
              href="/login?signup=true"
              className="px-4 py-1.5 bg-white text-indigo-600 rounded-lg font-semibold hover:bg-indigo-50 transition-colors text-sm"
            >
              Sign Up Free
            </a>
          </div>
        </div>
      )}
      
      {/* Enhanced Error Toast with Retry */}
      {errorToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-2xl p-4 shadow-xl animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            {ToastIcons.error()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{errorToast.details || 'Error'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{errorToast.message}</p>
              {errorToast.retryAction && (
                <button
                  onClick={() => {
                    setErrorToast(null)
                    errorToast.retryAction()
                  }}
                  className="mt-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Try Again
                </button>
              )}
            </div>
            <button onClick={() => setErrorToast(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
          {ToastIcons.success()}
          <span className="text-sm font-medium text-gray-900 dark:text-white">"{undoToast.taskTitle}" marked as done</span>
          <button
            onClick={handleUndo}
            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          >
            Undo
          </button>
          <button
            onClick={() => setUndoToast(null)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 left-6 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
          {notification.type === 'success' ? ToastIcons.success() : ToastIcons.info()}
          <span className="text-sm font-medium text-gray-900 dark:text-white">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-40 pt-[env(safe-area-inset-top)] overflow-visible ${isElectron && isMac ? 'pl-16' : ''} ${demoMode ? 'mt-10 sm:mt-11' : ''}`}>
        {/* Main Header Row */}
        <div className="max-w-full mx-auto pl-3 pr-4 sm:px-6 pt-3 pb-2 sm:py-3 relative overflow-visible">
          <div className="grid grid-cols-2 items-center overflow-visible">
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
                      <div className="sm:hidden flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-gray-100 dark:border-gray-700">
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
                      
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">Views</div>
                      <button
                        onClick={() => { setCurrentView('myday'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'myday' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.myday()}
                        <span className="font-medium">My Day</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}D</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('board'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'board' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.board()}
                        <span className="font-medium">Board</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}B</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('calendar'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.calendar()}
                        <span className="font-medium">Calendar</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}L</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('tasks'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'tasks' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.alltasks()}
                        <span className="font-medium">All Tasks</span>
                        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{shortcutModifier}A</span>
                      </button>
                      
                      <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">Manage</div>
                      <button
                        onClick={() => { setCurrentView('projects'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'projects' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.projects()}
                        <span className="font-medium">Projects</span>
                      </button>
                      <button
                        onClick={() => { setCurrentView('progress'); setNavMenuOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${currentView === 'progress' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {MenuIcons.progress()}
                        <span className="font-medium">Dashboard</span>
                      </button>
                      
                      {/* Settings section */}
                      <div >
                        <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                        <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">Settings</div>
                        <button
                          onClick={() => { setDarkMode(!darkMode) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {darkMode ? MenuIcons.sun() : MenuIcons.moon()}
                          <span className="font-medium">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setMeetingNotesData({ ...meetingNotesData, projectId: '' }) // Don't auto-select
                            setExtractedTasks([])
                            setShowExtractedTasks(false)
                            setShowMeetingNotesProjectError(false)
                            setMeetingNotesModalOpen(true)
                            setNavMenuOpen(false)
                          }}
                          disabled={projects.length === 0}
                          className="sm:hidden w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          {MenuIcons.importNotes()}
                          <span className="font-medium">Import Notes</span>
                        </button>
                        <button
                          onClick={() => { setFeedbackModalOpen(true); setNavMenuOpen(false) }}
                          className="sm:hidden w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {MenuIcons.feedback()}
                          <span className="font-medium">Send Feedback</span>
                        </button>
                        <button
                          onClick={() => { setSettingsModalOpen(true); setNavMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {MenuIcons.settingsGear()}
                          <span className="font-medium">Settings</span>
                        </button>
                        <button
                          onClick={async () => { 
                            setNavMenuOpen(false)
                            await signOut()
                            window.location.href = '/welcome'
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          {MenuIcons.signOut()}
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
              <span className="text-sm text-gray-500 dark:text-gray-300 hidden sm:flex items-center gap-1.5">
                {currentView === 'myday' && <>{MenuIcons.myday()} My Day</>}
                {currentView === 'board' && <>{MenuIcons.board()} Board</>}
                {currentView === 'calendar' && <>{MenuIcons.calendar()} Calendar</>}
                {currentView === 'tasks' && <>{MenuIcons.alltasks()} All Tasks</>}
                {currentView === 'progress' && <>{MenuIcons.progress()} Dashboard</>}
                {currentView === 'projects' && <>{MenuIcons.projects()} Projects</>}
              </span>
              
              {/* Logo - shows in left section on smaller screens */}
              <div className="flex xl:hidden items-center gap-2">
                <div className="w-8 h-8">
                  <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                    <defs>
                      <linearGradient id="logo-left" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7C3AED"/>
                        <stop offset="100%" stopColor="#9333EA"/>
                      </linearGradient>
                      <linearGradient id="logo-right" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#EA580C"/>
                        <stop offset="100%" stopColor="#F97316"/>
                      </linearGradient>
                    </defs>
                    <path d="M6 18L28 6L28 38L6 26Z" fill="url(#logo-left)"/>
                    <path d="M28 6L50 18L50 46L28 38Z" fill="url(#logo-right)"/>
                    <path d="M6 18L28 6L50 18L28 30Z" fill="#E9D5FF"/>
                    <path d="M18 19L25 26L36 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2 justify-self-end overflow-visible">
              {/* Utility buttons - icon only */}
              
              
              {currentView === 'board' && (
                <button
                  onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedTaskIds(new Set()) }}
                  className={`hidden sm:block p-2 rounded-xl transition-colors ${bulkSelectMode ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-300'}`}
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
                className="hidden sm:flex px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg sm:rounded-xl hover:from-teal-600 hover:to-emerald-600 active:from-teal-700 active:to-emerald-700 transition-all text-sm font-medium items-center gap-1.5 shadow-lg shadow-teal-500/25 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                title={`${shortcutModifier}P`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline"><u>P</u>roject</span>
              </button>
              
              <button
                onClick={() => { setEditingTask(selectedProjectId !== 'all' ? { project_id: selectedProjectId } : null); setTaskModalOpen(true) }}
                disabled={projects.length === 0}
                className="hidden sm:flex px-2 sm:px-3 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg sm:rounded-xl transition-all text-sm font-medium items-center gap-1.5 shadow-lg shadow-purple-500/25 hover:shadow-xl disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                title={`${shortcutModifier}T`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="hidden sm:inline"><u>T</u>ask</span>
              </button>
              
              <button
                onClick={() => {
                  if (projects.length > 0) {
                    setQuickAddProject('')
                    setQuickAddOpen(true)
                  }
                }}
                disabled={projects.length === 0}
                className="hidden sm:flex px-2 py-1.5 sm:py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg sm:rounded-xl hover:from-cyan-600 hover:to-blue-600 active:from-cyan-700 active:to-blue-700 transition-all text-sm font-medium items-center gap-1.5 shadow-lg shadow-cyan-500/25 hover:shadow-xl disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                title={`Quick Add (Q or ${shortcutModifier}Q) - with voice support`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="hidden lg:inline"><u>Q</u>uick</span>
              </button>
              
              <button
                onClick={() => {
                  setMeetingNotesData({ ...meetingNotesData, projectId: '' }) // Don't auto-select
                  setExtractedTasks([])
                  setShowExtractedTasks(false)
                  setShowMeetingNotesProjectError(false)
                  setMeetingNotesModalOpen(true)
                }}
                disabled={projects.length === 0}
                className="hidden sm:flex px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 active:from-amber-700 active:to-orange-700 transition-all text-sm font-medium items-center gap-1.5 shadow-lg shadow-amber-500/25 hover:shadow-xl disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                title={`Import Meeting Notes (${shortcutModifier}N)`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline"><u>N</u>otes</span>
              </button>
              
              {/* Spark AI Assistant */}
              <SparkButton onClick={() => setSparkPanelOpen(true)} />
              
              {/* Pending Email Tasks Badge + Dropdown */}
              {pendingEmailCount > 0 && (
                <div className="relative overflow-visible">
                  <button
                    type="button"
                    onClick={() => {
                      // On mobile, open bottom sheet
                      if (window.innerWidth < 640) {
                        setMobilePendingSheetOpen(true)
                      } else {
                        setPendingDropdownOpen(!pendingDropdownOpen)
                      }
                    }}
                    onTouchEnd={(e) => {
                      // Handle touch on mobile
                      if (window.innerWidth < 640) {
                        e.preventDefault()
                        setMobilePendingSheetOpen(true)
                      }
                    }}
                    className="relative overflow-visible p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors text-amber-600 dark:text-amber-400 cursor-pointer"
                    title={`${pendingEmailCount} pending email task${pendingEmailCount !== 1 ? 's' : ''} to review`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="absolute top-0 right-0 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse pointer-events-none">
                      {pendingEmailCount > 9 ? '9+' : pendingEmailCount}
                    </span>
                  </button>
                  
                  {/* Dropdown Panel - desktop only */}
                  {pendingDropdownOpen && (
                    <>
                      <div className="hidden sm:block fixed inset-0 z-40" onClick={() => setPendingDropdownOpen(false)} />
                      <div className="hidden sm:block absolute right-0 top-full mt-2 w-[600px] max-w-[90vw] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200/50 dark:border-amber-800/50">
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-semibold">{pendingEmailTasks.length} pending</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              {pendingEmailTasks.filter(t => selectedPendingIds.has(t.id)).length} selected
                            </span>
                            <button
                              onClick={async () => {
                                await handleBulkApprovePendingTasks()
                                if (pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id).length > 0) {
                                  setPendingDropdownOpen(false)
                                }
                              }}
                              disabled={approvingTaskId === 'bulk' || pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id).length === 0}
                              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                              {approvingTaskId === 'bulk' ? (
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              )}
                              Create Tasks
                            </button>
                          </div>
                        </div>
                        
                        {/* Task List */}
                        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                          {pendingEmailTasks.map(task => {
                            const isSelected = selectedPendingIds.has(task.id)
                            const isExpanded = expandedPendingIds.has(task.id)
                            const isLowConfidence = task.ai_confidence && task.ai_confidence < 0.7
                            const selectedProject = projects.find(p => p.id === task.project_id)
                            const projectCustomers = selectedProject?.customers || []
                            return (
                              <div key={task.id} className={`transition-colors ${isSelected ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/50 opacity-60'}`}>
                                {/* Main Row */}
                                <div className="flex items-center gap-2 px-4 py-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => togglePendingTaskSelection(task.id)}
                                    className="w-4 h-4 rounded border-amber-400 dark:border-amber-600 text-amber-500 focus:ring-amber-500"
                                  />
                                  <button
                                    onClick={() => setExpandedPendingIds(prev => {
                                      const next = new Set(prev)
                                      if (next.has(task.id)) next.delete(task.id)
                                      else next.add(task.id)
                                      return next
                                    })}
                                    className="p-0.5 text-gray-400 hover:text-amber-500 transition-colors"
                                  >
                                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) => handleUpdatePendingTask(task.id, 'title', e.target.value)}
                                    className="flex-1 min-w-0 text-sm font-medium text-gray-800 dark:text-gray-200 bg-transparent border-none p-0 focus:ring-0 truncate"
                                  />
                                  {isLowConfidence && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 font-medium">?</span>
                                  )}
                                  {task.critical && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 font-medium">!</span>
                                  )}
                                  <div className="relative w-32">
                                    <input
                                      type="date"
                                      value={task.due_date || ''}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'due_date', e.target.value || null)}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <div className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer">
                                      {task.due_date ? formatDate(task.due_date) : <span className="text-gray-400">Due date</span>}
                                    </div>
                                  </div>
                                  <input
                                    type="text"
                                    value={task.assignee_text || ''}
                                    onChange={(e) => handleUpdatePendingTask(task.id, 'assignee_text', e.target.value || null)}
                                    placeholder="@who"
                                    className="w-20 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500"
                                  />
                                  <select
                                    value={task.project_id || ''}
                                    onChange={(e) => handleUpdatePendingTask(task.id, 'project_id', e.target.value || null)}
                                    className={`w-28 text-xs px-2 py-1 border rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 ${!task.project_id ? 'border-red-400' : 'border-gray-200 dark:border-gray-600'}`}
                                  >
                                    <option value="">Project *</option>
                                    {projects.filter(p => !p.archived).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleRejectPendingTask(task.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                                {/* Expanded Row */}
                                {isExpanded && (
                                  <div className="flex items-center gap-3 px-4 py-2 pl-12 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-1">
                                      <label className="text-[10px] text-gray-500 uppercase">Start</label>
                                      <input
                                        type="text"
                                        value={task.start_date || ''}
                                        onChange={(e) => handleUpdatePendingTask(task.id, 'start_date', e.target.value || null)}
                                        placeholder="YYYY-MM-DD"
                                        className="w-24 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <label className="text-[10px] text-gray-500 uppercase">Effort</label>
                                      <select
                                        value={task.energy_level || 'medium'}
                                        onChange={(e) => handleUpdatePendingTask(task.id, 'energy_level', e.target.value)}
                                        className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                      </select>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <label className="text-[10px] text-gray-500 uppercase">Time</label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={task.time_estimate || ''}
                                        onChange={(e) => handleUpdatePendingTask(task.id, 'time_estimate', e.target.value ? parseInt(e.target.value) : null)}
                                        placeholder="mins"
                                        className="w-14 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <label className="text-[10px] text-gray-500 uppercase">Customer</label>
                                      <input
                                        type="text"
                                        list={`customers-${task.id}`}
                                        value={task.customer || ''}
                                        onChange={(e) => handleUpdatePendingTask(task.id, 'customer', e.target.value || null)}
                                        placeholder="Type or select..."
                                        className="w-28 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      />
                                      <datalist id={`customers-${task.id}`}>
                                        {projectCustomers.map(c => (
                                          <option key={c} value={c} />
                                        ))}
                                      </datalist>
                                    </div>
                                    <label className="flex items-center gap-1 text-xs cursor-pointer ml-auto">
                                      <input
                                        type="checkbox"
                                        checked={task.critical || false}
                                        onChange={(e) => handleUpdatePendingTask(task.id, 'critical', e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-red-400 text-red-500 focus:ring-red-500"
                                      />
                                      <span className="text-red-600 dark:text-red-400 font-medium">Critical</span>
                                    </label>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        
                        {/* Footer link to Board */}
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => { setCurrentView('board'); setPendingReviewExpanded(true); setPendingDropdownOpen(false); }}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                          >
                            View on Board →
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              <button
                onClick={() => setHelpModalOpen(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-300"
                title="Help Guide"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              {/* Admin Feedback Button - only visible to admin */}
              {ADMIN_EMAILS.includes(user?.email) && (
                <button
                  onClick={() => setAdminPanelOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-300"
                  title="View Feedback"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </button>
              )}
              
              
              
              
            </div>
          </div>
          
          {/* Centered Logo - only visible on wide screens (xl+), absolutely positioned */}
          <div className="hidden xl:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 pointer-events-none">
            <div className="w-10 h-10">
              <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                <defs>
                  <linearGradient id="center-logo-left" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7C3AED"/>
                    <stop offset="100%" stopColor="#9333EA"/>
                  </linearGradient>
                  <linearGradient id="center-logo-right" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EA580C"/>
                    <stop offset="100%" stopColor="#F97316"/>
                  </linearGradient>
                </defs>
                <path d="M6 18L28 6L28 38L6 26Z" fill="url(#center-logo-left)"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="url(#center-logo-right)"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="#E9D5FF"/>
                <path d="M18 19L25 26L36 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-purple-500 to-orange-500 bg-clip-text text-transparent">
              Trackli
            </h1>
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
                    <button 
                      onClick={() => setMobileFiltersOpen(false)} 
                      onTouchEnd={(e) => { e.preventDefault(); setMobileFiltersOpen(false); }}
                      className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Quick Filters */}
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-2">Quick Filters</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFilterCritical(!filterCritical)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterCritical ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span className="flex items-center gap-1">{TaskCardIcons.flag("w-3.5 h-3.5")} Critical ({criticalCount})</span>
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
                        onClick={() => setFilterDueThisWeek(!filterDueThisWeek)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterDueThisWeek ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        This Week ({dueThisWeekCount})
                      </button>
                      <button
                        onClick={() => setFilterMyDay(!filterMyDay)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium transition-all ${
                          filterMyDay ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span className="flex items-center gap-1">{TaskCardIcons.sun("w-3.5 h-3.5")} My Day ({myDayCount})</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Field Filters */}
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-2">Filter by Field</p>
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
                      
                      {/* Due Date */}
                      <div className="space-y-2">
                        <select
                          value={fieldFilters.due_date?.startsWith('=') || fieldFilters.due_date?.startsWith('<') || fieldFilters.due_date?.startsWith('>') ? fieldFilters.due_date[0] : fieldFilters.due_date || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '' || val === 'has_date' || val === '__blank__') {
                              setFieldFilters(val ? { ...fieldFilters, due_date: val } : (({ due_date, ...rest }) => rest)(fieldFilters))
                            } else {
                              // Operator selected, show date picker
                              setFieldFilters({ ...fieldFilters, due_date: val + new Date().toISOString().split('T')[0] })
                            }
                          }}
                          className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                        >
                          <option value="">Due Date: All</option>
                          <option value="has_date">Has Due Date</option>
                          <option value="__blank__">No Due Date</option>
                          <option value="=">On specific date...</option>
                          <option value="<">Before date...</option>
                          <option value=">">After date...</option>
                        </select>
                        {fieldFilters.due_date && (fieldFilters.due_date.startsWith('=') || fieldFilters.due_date.startsWith('<') || fieldFilters.due_date.startsWith('>')) && (
                          <input
                            type="date"
                            value={fieldFilters.due_date.slice(1)}
                            onChange={(e) => setFieldFilters({ ...fieldFilters, due_date: fieldFilters.due_date[0] + e.target.value })}
                            className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                          />
                        )}
                      </div>
                      
                      {/* Start Date */}
                      <div className="space-y-2">
                        <select
                          value={fieldFilters.start_date?.startsWith('=') || fieldFilters.start_date?.startsWith('<') || fieldFilters.start_date?.startsWith('>') ? fieldFilters.start_date[0] : fieldFilters.start_date || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '' || val === 'has_date' || val === '__blank__') {
                              setFieldFilters(val ? { ...fieldFilters, start_date: val } : (({ start_date, ...rest }) => rest)(fieldFilters))
                            } else {
                              setFieldFilters({ ...fieldFilters, start_date: val + new Date().toISOString().split('T')[0] })
                            }
                          }}
                          className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                        >
                          <option value="">Start Date: All</option>
                          <option value="has_date">Has Start Date</option>
                          <option value="__blank__">No Start Date</option>
                          <option value="=">On specific date...</option>
                          <option value="<">Before date...</option>
                          <option value=">">After date...</option>
                        </select>
                        {fieldFilters.start_date && (fieldFilters.start_date.startsWith('=') || fieldFilters.start_date.startsWith('<') || fieldFilters.start_date.startsWith('>')) && (
                          <input
                            type="date"
                            value={fieldFilters.start_date.slice(1)}
                            onChange={(e) => setFieldFilters({ ...fieldFilters, start_date: fieldFilters.start_date[0] + e.target.value })}
                            className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                          />
                        )}
                      </div>
                      
                      {/* Time Estimate */}
                      <div className="space-y-2">
                        <select
                          value={fieldFilters.time_estimate?.startsWith('=') || fieldFilters.time_estimate?.startsWith('<') || fieldFilters.time_estimate?.startsWith('>') ? fieldFilters.time_estimate[0] : fieldFilters.time_estimate || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '' || val === '__blank__') {
                              setFieldFilters(val ? { ...fieldFilters, time_estimate: val } : (({ time_estimate, ...rest }) => rest)(fieldFilters))
                            } else if (['=', '<', '>'].includes(val)) {
                              setFieldFilters({ ...fieldFilters, time_estimate: val + '30' })
                            } else {
                              setFieldFilters({ ...fieldFilters, time_estimate: val })
                            }
                          }}
                          className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                        >
                          <option value="">Time Estimate: All</option>
                          <option value="__blank__">No Estimate</option>
                          <option value="=">Exactly...</option>
                          <option value="<">Less than...</option>
                          <option value=">">More than...</option>
                        </select>
                        {fieldFilters.time_estimate && (fieldFilters.time_estimate.startsWith('=') || fieldFilters.time_estimate.startsWith('<') || fieldFilters.time_estimate.startsWith('>')) && (
                          <select
                            value={fieldFilters.time_estimate.slice(1)}
                            onChange={(e) => setFieldFilters({ ...fieldFilters, time_estimate: fieldFilters.time_estimate[0] + e.target.value })}
                            className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 border-0"
                          >
                            <option value="15">15 minutes</option>
                            <option value="30">30 minutes</option>
                            <option value="45">45 minutes</option>
                            <option value="60">1 hour</option>
                            <option value="90">1.5 hours</option>
                            <option value="120">2 hours</option>
                            <option value="180">3 hours</option>
                            <option value="240">4 hours</option>
                            <option value="480">8 hours</option>
                          </select>
                        )}
                      </div>
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
            <div className="hidden sm:flex items-center gap-2 sm:gap-3 min-w-max">
              {/* Project dropdown - custom component for colors */}
              <div className="relative z-50" ref={projectDropdownRef}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setProjectDropdownOpen(!projectDropdownOpen); }}
                  className="flex items-center gap-2 pl-3 pr-7 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
                >
                  {selectedProjectId === 'all' ? (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#9CA3AF">
                        <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.586a1 1 0 01-.707-.293L10.293 5.293A1 1 0 009.586 5H5a2 2 0 00-2 2z" />
                      </svg>
                      <span>All Projects</span>
                    </>
                  ) : (() => {
                    const p = projects.find(proj => proj.id === selectedProjectId)
                    return p ? (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={p.color || DEFAULT_PROJECT_COLOR}>
                          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.586a1 1 0 01-.707-.293L10.293 5.293A1 1 0 009.586 5H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="truncate max-w-[120px]">{p.name}</span>
                      </>
                    ) : 'Select Project'
                  })()}
                </button>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                
                {/* Dropdown menu */}
                {projectDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setSelectedProjectId('all'); setProjectDropdownOpen(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedProjectId === 'all' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200'}`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#9CA3AF">
                          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.586a1 1 0 01-.707-.293L10.293 5.293A1 1 0 009.586 5H5a2 2 0 00-2 2z" />
                        </svg>
                        All Projects
                        {selectedProjectId === 'all' && <svg className="w-4 h-4 ml-auto text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      {projects.filter(p => !p.archived || showArchivedProjects).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedProjectId(p.id); setProjectDropdownOpen(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedProjectId === p.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-200'}`}
                        >
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill={p.archived ? '#9CA3AF' : (p.color || DEFAULT_PROJECT_COLOR)}>
                            <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.586a1 1 0 01-.707-.293L10.293 5.293A1 1 0 009.586 5H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="truncate">{p.name}</span>
                          {selectedProjectId === p.id && <svg className="w-4 h-4 ml-auto flex-shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      ))}
                    </div>
                )}
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
                        : 'text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  {TaskCardIcons.flag("w-4 h-4")}
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
                        : 'text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400'
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
                        : 'text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span>Overdue</span>
                  {(filterOverdue || overdueCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterOverdue ? 'bg-white/20' : 'bg-red-100 dark:bg-red-900/50'}`}>{overdueCount}</span>
                  )}
                </button>
                
                {/* This Week */}
                <button
                  onClick={() => setFilterDueThisWeek(!filterDueThisWeek)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    filterDueThisWeek
                      ? 'bg-blue-500 text-white shadow-sm'
                      : dueThisWeekCount > 0
                        ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                        : 'text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  <span className="hidden sm:inline">This Week</span>
                  <span className="sm:hidden">Week</span>
                  {(filterDueThisWeek || dueThisWeekCount > 0) && (
                    <span className={`ml-0.5 px-1 py-0.5 text-[10px] rounded ${filterDueThisWeek ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/50'}`}>{dueThisWeekCount}</span>
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
                        : 'text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                >
                  {TaskCardIcons.sun("w-4 h-4")}
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
                  const fieldLabels = { assignee: 'Assignee', customer: 'Customer', energy_level: 'Effort', due_date: 'Due Date', start_date: 'Start Date', time_estimate: 'Time Est.' }
                  let displayValue = value
                  if (value === '__blank__') displayValue = '(Blank)'
                  else if (field === 'category') displayValue = CATEGORIES.find(c => c.id === value)?.label || value
                  else if (field === 'energy_level') displayValue = value === 'high' ? 'High' : value === 'medium' ? 'Medium' : 'Low'
                  else if (field === 'source') displayValue = SOURCES.find(s => s.id === value)?.label || value
                  else if (field === 'due_date' && value === 'has_date') displayValue = 'Has Date'
                  else if (field === 'due_date' && (value.startsWith('=') || value.startsWith('<') || value.startsWith('>'))) {
                    const op = value[0]
                    const dateStr = value.slice(1)
                    const date = new Date(dateStr)
                    const formatted = date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' })
                    displayValue = `${op === '=' ? '=' : op === '<' ? 'before' : 'after'} ${formatted}`
                  }
                  else if (field === 'start_date' && value === 'has_date') displayValue = 'Has Date'
                  else if (field === 'start_date' && (value.startsWith('=') || value.startsWith('<') || value.startsWith('>'))) {
                    const op = value[0]
                    const dateStr = value.slice(1)
                    const date = new Date(dateStr)
                    const formatted = date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' })
                    displayValue = `${op === '=' ? '=' : op === '<' ? 'before' : 'after'} ${formatted}`
                  }
                  else if (field === 'time_estimate' && (value.startsWith('=') || value.startsWith('<') || value.startsWith('>'))) {
                    const op = value[0]
                    const mins = parseInt(value.slice(1))
                    let timeStr = mins >= 60 ? `${mins / 60}h` : `${mins}m`
                    displayValue = `${op} ${timeStr}`
                  }
                  else if (field === 'time_estimate') {
                    const mins = parseInt(value)
                    if (!isNaN(mins)) {
                      if (mins >= 60) displayValue = `${mins / 60}h`
                      else displayValue = `${mins}m`
                    }
                  }
                  
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
                    className="appearance-none pl-2 pr-5 py-1 bg-transparent border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <option value="">+ Filter</option>
                    {!fieldFilters.assignee && <option value="assignee">Assignee</option>}
                    {!fieldFilters.customer && <option value="customer">Customer</option>}
                    {!fieldFilters.energy_level && <option value="energy_level">Effort</option>}
                    {!fieldFilters.due_date && <option value="due_date">Due Date</option>}
                    {!fieldFilters.start_date && <option value="start_date">Start Date</option>}
                    {!fieldFilters.time_estimate && <option value="time_estimate">Time Estimate</option>}
                  </select>
                  <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                
                {/* Value selector - appears when field is selected */}
                {pendingFilterField && !pendingFilterOperator && (
                  <div className="flex items-center gap-1">
                    {/* Simple fields - direct value selection */}
                    {['assignee', 'customer', 'energy_level'].includes(pendingFilterField) && (
                      <div className="relative">
                        <select
                          autoFocus
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setFieldFilters({ ...fieldFilters, [pendingFilterField]: e.target.value })
                              setPendingFilterField('')
                            }
                          }}
                          className="appearance-none pl-2 pr-5 py-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded text-xs text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent cursor-pointer transition-colors"
                        >
                          <option value="">Select {pendingFilterField.charAt(0).toUpperCase() + pendingFilterField.slice(1)}...</option>
                          <option value="__blank__">(Blank)</option>
                          {pendingFilterField === 'assignee' && [...new Set(tasks.filter(t => {
                            const proj = projects.find(p => p.id === t.project_id)
                            return proj && (!proj.archived || showArchivedProjects)
                          }).map(t => t.assignee).filter(Boolean))].sort().map(a => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                          {pendingFilterField === 'customer' && [...new Set(tasks.filter(t => {
                            const proj = projects.find(p => p.id === t.project_id)
                            return proj && (!proj.archived || showArchivedProjects)
                          }).map(t => t.customer).filter(Boolean))].sort().map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {pendingFilterField === 'energy_level' && (
                            <>
                              <option value="high">High Effort</option>
                              <option value="medium">Medium Effort</option>
                              <option value="low">Low Effort</option>
                            </>
                          )}
                        </select>
                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    )}
                    
                    {/* Date and time fields - operator selection first */}
                    {['due_date', 'start_date', 'time_estimate'].includes(pendingFilterField) && (
                      <div className="relative">
                        <select
                          autoFocus
                          value=""
                          onChange={(e) => {
                            if (e.target.value === '__blank__' || e.target.value === 'has_date') {
                              setFieldFilters({ ...fieldFilters, [pendingFilterField]: e.target.value })
                              setPendingFilterField('')
                            } else if (e.target.value) {
                              setPendingFilterOperator(e.target.value)
                            }
                          }}
                          className="appearance-none pl-2 pr-5 py-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded text-xs text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent cursor-pointer transition-colors"
                        >
                          <option value="">Select condition...</option>
                          <option value="__blank__">(Blank)</option>
                          {(pendingFilterField === 'due_date' || pendingFilterField === 'start_date') && (
                            <option value="has_date">Has Date</option>
                          )}
                          <option value="=">= Equals</option>
                          <option value="<">&lt; Before{pendingFilterField === 'time_estimate' ? ' / Less than' : ''}</option>
                          <option value=">">&gt; After{pendingFilterField === 'time_estimate' ? ' / More than' : ''}</option>
                        </select>
                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    )}
                    
                    <button
                      onClick={() => setPendingFilterField('')}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                
                {/* Date input - appears after operator selected for date fields */}
                {pendingFilterField && pendingFilterOperator && (pendingFilterField === 'due_date' || pendingFilterField === 'start_date') && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      {pendingFilterField === 'due_date' ? 'Due' : 'Start'} {pendingFilterOperator === '=' ? '=' : pendingFilterOperator === '<' ? 'before' : 'after'}
                    </span>
                    <input
                      type="date"
                      autoFocus
                      onChange={(e) => {
                        if (e.target.value) {
                          setFieldFilters({ ...fieldFilters, [pendingFilterField]: `${pendingFilterOperator}${e.target.value}` })
                          setPendingFilterField('')
                          setPendingFilterOperator('')
                        }
                      }}
                      className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded text-xs text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => { setPendingFilterField(''); setPendingFilterOperator(''); }}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                
                {/* Time input - appears after operator selected for time estimate */}
                {pendingFilterField === 'time_estimate' && pendingFilterOperator && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      Time {pendingFilterOperator === '=' ? '=' : pendingFilterOperator === '<' ? '<' : '>'}
                    </span>
                    <input
                      type="number"
                      autoFocus
                      placeholder="mins"
                      min="1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value) {
                          setFieldFilters({ ...fieldFilters, [pendingFilterField]: `${pendingFilterOperator}${e.target.value}` })
                          setPendingFilterField('')
                          setPendingFilterOperator('')
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value) {
                          setFieldFilters({ ...fieldFilters, [pendingFilterField]: `${pendingFilterOperator}${e.target.value}` })
                          setPendingFilterField('')
                          setPendingFilterOperator('')
                        }
                      }}
                      className="w-16 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 rounded text-xs text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <span className="text-xs text-gray-500">min</span>
                    <button
                      onClick={() => { setPendingFilterField(''); setPendingFilterOperator(''); }}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
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
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </button>
                )}
                <label className="hidden sm:flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-300 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
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
                    className="appearance-none pl-2 pr-5 py-1 bg-transparent border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600"
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
          <div className="w-24 h-24 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">Welcome to Trackli!</h2>
          <p className="text-gray-500 dark:text-gray-300 mb-8 text-base sm:text-base">Get started by creating your first project.</p>
          <button
            onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
            className="w-full sm:w-auto px-8 py-4 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all font-medium shadow-lg shadow-purple-500/25 text-lg sm:text-base active:scale-95"
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
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 border border-white/30 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                      title="Toggle critical flag">
                      {TaskCardIcons.flag("w-4 h-4")} Critical
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
                onToggleSubtask={handleToggleSubtask}
                displayName={profile?.display_name}
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
                  className="px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all font-medium flex items-center gap-2 text-sm sm:text-base"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Project
                </button>
              </div>
              
              {/* Active Projects */}
              <div className="mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider mb-3 sm:mb-4">Active Projects ({projects.filter(p => !p.archived).length})</h3>
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
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill={project.color || DEFAULT_PROJECT_COLOR}>
                                  <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6.586a1 1 0 01-.707-.293L10.293 5.293A1 1 0 009.586 5H5a2 2 0 00-2 2z" />
                                </svg>
                                <h4 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{project.name}</h4>
                              </div>
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
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-500 dark:text-gray-300">
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
                                  className="h-full bg-purple-600 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-300 w-10 text-right">{progress}%</span>
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
                      <p className="text-sm text-gray-400 dark:text-gray-300 mt-1">Create your first project to organize your tasks</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Archived Projects */}
              {projects.filter(p => p.archived).length > 0 && (
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider mb-3 sm:mb-4">Archived ({projects.filter(p => p.archived).length})</h3>
                  <div className="space-y-3">
                    {projects.filter(p => p.archived).map(project => {
                      const projectTasks = tasks.filter(t => t.project_id === project.id)
                      
                      return (
                        <div key={project.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 opacity-75">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">📦</span>
                                <h4 className="font-semibold text-gray-600 dark:text-gray-300 truncate">{project.name}</h4>
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1 ml-7">{projectTasks.length} tasks</p>
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
            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fadeIn w-full overflow-hidden">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 sm:mb-6 flex items-center gap-2">{MenuIcons.chartBar()} Dashboard</h2>
              
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
                {/* Day Streak */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1 sm:mb-2">
                    {MenuIcons.fire()}
                    <span className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{currentStreak}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">Day Streak</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1 hidden sm:block">Consecutive days completing tasks</p>
                </div>
                
                {/* On-Time Completion Rate */}
                {(() => {
                  const completedWithDue = tasks.filter(t => t.status === 'done' && t.due_date && t.completed_at)
                  const onTime = completedWithDue.filter(t => {
                    const dueDate = new Date(t.due_date)
                    dueDate.setHours(23, 59, 59, 999)
                    const completedDate = new Date(t.completed_at)
                    return completedDate <= dueDate
                  })
                  const onTimePercent = completedWithDue.length > 0 ? Math.round((onTime.length / completedWithDue.length) * 100) : 0
                  return (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1 sm:mb-2">
                        <span className="text-lg sm:text-xl">✅</span>
                        <span className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{onTimePercent}%</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">On-Time Rate</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1 hidden sm:block">{onTime.length}/{completedWithDue.length} completed before due</p>
                    </div>
                  )
                })()}
                
                {/* My Day Cleared Rate */}
                {(() => {
                  // Check last 30 days for days where user had My Day tasks and cleared them all
                  const last30Days = []
                  for (let i = 0; i < 30; i++) {
                    const date = new Date()
                    date.setDate(date.getDate() - i)
                    date.setHours(0, 0, 0, 0)
                    const dateStr = date.toISOString().split('T')[0]
                    
                    // Tasks that were in My Day for this date
                    const myDayTasks = tasks.filter(t => t.my_day_date === dateStr)
                    if (myDayTasks.length > 0) {
                      const allCompleted = myDayTasks.every(t => t.status === 'done')
                      last30Days.push({ date: dateStr, cleared: allCompleted, count: myDayTasks.length })
                    }
                  }
                  const daysWithMyDay = last30Days.length
                  const daysCleared = last30Days.filter(d => d.cleared).length
                  const clearedPercent = daysWithMyDay > 0 ? Math.round((daysCleared / daysWithMyDay) * 100) : 0
                  return (
                    <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                      <div className="flex items-center gap-2 mb-1 sm:mb-2">
                        <span className="text-lg sm:text-xl">☀️</span>
                        <span className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{clearedPercent}%</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-300">My Day Cleared</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1 hidden sm:block">{daysCleared}/{daysWithMyDay} days (last 30 days)</p>
                    </div>
                  )
                })()}
              </div>
              
              {/* Task Summary - Clickable Cards */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 sm:mb-4">Tasks Needing Attention</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                  {/* Due Today */}
                  {(() => {
                    const dueTodayTasks = filteredTasks.filter(t => t.status !== 'done' && getDueDateStatus(t.due_date, t.status) === 'today')
                    const dueTodayHours = dueTodayTasks.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
                    return (
                      <button
                        onClick={() => { clearFilters(); setCurrentView('board'); setTimeout(() => setFilterDueToday(true), 0); }}
                        className="p-2 sm:p-4 rounded-xl border-2 border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 hover:border-orange-400 dark:hover:border-orange-500 transition-all text-left group"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <span className="text-lg sm:text-2xl">📅</span>
                          <span className="text-xl sm:text-2xl font-bold text-orange-600 dark:text-orange-400">{dueTodayTasks.length}</span>
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200">Due Today</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{formatTimeEstimate(dueTodayHours) || '0h'} estimated</p>
                      </button>
                    )
                  })()}
                  
                  {/* Overdue */}
                  {(() => {
                    const overdueTasks = filteredTasks.filter(t => t.status !== 'done' && getDueDateStatus(t.due_date, t.status) === 'overdue')
                    const overdueHours = overdueTasks.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
                    return (
                      <button
                        onClick={() => { clearFilters(); setCurrentView('board'); setTimeout(() => setFilterOverdue(true), 0); }}
                        className="p-2 sm:p-4 rounded-xl border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:border-red-400 dark:hover:border-red-500 transition-all text-left group"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <span className="text-lg sm:text-2xl">⚠️</span>
                          <span className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{overdueTasks.length}</span>
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200">Overdue</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{formatTimeEstimate(overdueHours) || '0h'} estimated</p>
                      </button>
                    )
                  })()}
                  
                  {/* Due This Week */}
                  {(() => {
                    const today = new Date()
                    const endOfWeek = new Date(today)
                    endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
                    endOfWeek.setHours(23, 59, 59, 999)
                    today.setHours(0, 0, 0, 0)
                    const dueThisWeekTasks = filteredTasks.filter(t => {
                      if (t.status === 'done' || !t.due_date) return false
                      const dueDate = new Date(t.due_date)
                      return dueDate >= today && dueDate <= endOfWeek
                    })
                    const dueThisWeekHours = dueThisWeekTasks.reduce((sum, t) => sum + (t.time_estimate || 0), 0)
                    return (
                      <button
                        onClick={() => { clearFilters(); setCurrentView('board'); setTimeout(() => setFilterDueThisWeek(true), 0); }}
                        className="p-2 sm:p-4 rounded-xl border-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-left group col-span-2 sm:col-span-1"
                      >
                        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                          <span className="text-lg sm:text-2xl">📆</span>
                          <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{dueThisWeekTasks.length}</span>
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200">Due This Week</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{formatTimeEstimate(dueThisWeekHours) || '0h'} estimated</p>
                      </button>
                    )
                  })()}
                </div>
              </div>
              
              {/* Weekly Activity Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 sm:mb-4">Last 7 Days</h3>
                <div className="flex items-end justify-between gap-1 sm:gap-2 h-24 sm:h-32">
                  {(() => {
                    const days = []
                    for (let i = 6; i >= 0; i--) {
                      const date = new Date()
                      date.setDate(date.getDate() - i)
                      date.setHours(0, 0, 0, 0)
                      const dateStr = date.toDateString()
                      const dayName = date.toLocaleDateString(getDateLocale(), { weekday: 'short' })
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
                                ? 'bg-purple-600' 
                                : 'bg-indigo-200 dark:bg-indigo-800'
                            }`}
                            style={{ height: `${Math.max((day.count / maxCount) * 100, 8)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${
                          day.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-300'
                        }`}>
                          {day.dayName}
                        </span>
                        <span className={`text-xs ${
                          day.isToday ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-400 dark:text-gray-300'
                        }`}>
                          {day.count}
                        </span>
                      </div>
                    ))
                  })()}
                </div>
              </div>
              
              {/* Project Progress */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Project Progress</h3>
                <div className="space-y-3 sm:space-y-4">
                  {projects.filter(p => !p.archived).map(project => {
                    const projectTasks = tasks.filter(t => t.project_id === project.id)
                    const doneTasks = projectTasks.filter(t => t.status === 'done').length
                    const progress = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 100) : 0
                    
                    return (
                      <div key={project.id}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{project.name}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-300">{doneTasks}/{projectTasks.length} tasks</span>
                        </div>
                        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-600 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Recent Completions */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3 sm:mb-4">Recently Completed</h3>
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
                            <p className="text-xs text-gray-500 dark:text-gray-300">{project?.name}</p>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-300 whitespace-nowrap">
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
                      <p className="text-gray-500 dark:text-gray-300 text-base sm:text-sm">No completed tasks yet</p>
                      <p className="text-gray-400 dark:text-gray-300 text-sm mt-1">Get started!</p>
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
              
              {/* Pending Email Tasks - Clean Inline Review */}
              {pendingEmailTasks.length > 0 && (
                <div data-pending-section className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200/50 dark:border-amber-800/50 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200/50 dark:border-amber-800/50">
                    <button
                      onClick={() => setPendingReviewExpanded(!pendingReviewExpanded)}
                      className="flex items-center gap-2 text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-semibold">{pendingEmailTasks.length} pending</span>
                      <svg className={`w-4 h-4 transition-transform ${pendingReviewExpanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {pendingReviewExpanded && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {pendingEmailTasks.filter(t => selectedPendingIds.has(t.id)).length} selected
                        </span>
                        <button
                          onClick={handleBulkApprovePendingTasks}
                          disabled={approvingTaskId === 'bulk' || pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id).length === 0}
                          className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                          {approvingTaskId === 'bulk' ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          )}
                          Create Tasks
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Task List */}
                  {pendingReviewExpanded && (
                    <div className="divide-y divide-amber-200/30 dark:divide-amber-800/30">
                      {pendingEmailTasks.map(task => {
                        const isSelected = selectedPendingIds.has(task.id)
                        const isExpanded = expandedPendingIds.has(task.id)
                        const isLowConfidence = task.ai_confidence && task.ai_confidence < 0.7
                        return (
                          <div 
                            key={task.id}
                            className={`transition-colors ${isSelected ? 'bg-white/50 dark:bg-gray-900/30' : 'opacity-50'}`}
                          >
                            {/* Main Row */}
                            <div className="flex items-center gap-3 px-4 py-2">
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePendingTaskSelection(task.id)}
                                className="w-4 h-4 rounded border-amber-400 dark:border-amber-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                              />
                              
                              {/* Expand toggle */}
                              <button
                                onClick={() => setExpandedPendingIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(task.id)) next.delete(task.id)
                                  else next.add(task.id)
                                  return next
                                })}
                                className="p-0.5 text-amber-500 hover:text-amber-600 dark:text-amber-400 transition-colors"
                                title={isExpanded ? 'Collapse' : 'More options'}
                              >
                                <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              
                              {/* Title */}
                              <input
                                type="text"
                                value={task.title}
                                onChange={(e) => handleUpdatePendingTask(task.id, 'title', e.target.value)}
                                className="flex-1 min-w-0 text-sm font-medium text-gray-800 dark:text-gray-200 bg-transparent border-none p-0 focus:ring-0 truncate"
                              />
                              
                              {/* Unsure badge */}
                              {isLowConfidence && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 font-medium">?</span>
                              )}
                              
                              {/* Due Date - formatted display with hidden date picker */}
                              <div className="relative w-32">
                                <input
                                  type="date"
                                  value={task.due_date || ''}
                                  onChange={(e) => handleUpdatePendingTask(task.id, 'due_date', e.target.value || null)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <div className="text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 cursor-pointer">
                                  {task.due_date ? formatDate(task.due_date) : <span className="text-gray-400">Due date</span>}
                                </div>
                              </div>
                              
                              {/* Assignee */}
                              <input
                                type="text"
                                value={task.assignee_text || ''}
                                onChange={(e) => handleUpdatePendingTask(task.id, 'assignee_text', e.target.value || null)}
                                placeholder="@who"
                                className="w-20 text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 placeholder:text-gray-400"
                              />
                              
                              {/* Project */}
                              <select
                                value={task.project_id || ''}
                                onChange={(e) => handleUpdatePendingTask(task.id, 'project_id', e.target.value || null)}
                                className={`w-32 text-xs px-2 py-1 border rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 ${
                                  !task.project_id ? 'border-red-400 dark:border-red-600' : 'border-amber-200 dark:border-amber-700'
                                }`}
                              >
                                <option value="">Project *</option>
                                {projects.filter(p => !p.archived).map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              
                              {/* Remove */}
                              <button
                                onClick={() => handleRejectPendingTask(task.id)}
                                className="p-1 text-amber-400 hover:text-red-500 dark:text-amber-500 dark:hover:text-red-400 transition-colors"
                                title="Remove"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            
                            {/* Expanded Row - Additional Fields */}
                            {isExpanded && (() => {
                              const selectedProject = projects.find(p => p.id === task.project_id)
                              const projectCustomers = selectedProject?.customers || []
                              return (
                                <div className="flex items-center gap-3 px-4 py-2 pl-14 bg-amber-50/50 dark:bg-amber-900/10 border-t border-amber-200/20 dark:border-amber-800/20">
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Start</label>
                                    <input
                                      type="text"
                                      value={task.start_date || ''}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'start_date', e.target.value || null)}
                                      placeholder="YYYY-MM-DD"
                                      className="w-28 text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 placeholder:text-gray-400"
                                    />
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Effort</label>
                                    <select
                                      value={task.energy_level || 'medium'}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'energy_level', e.target.value)}
                                      className="text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500"
                                    >
                                      <option value="low">Low</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">High</option>
                                    </select>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={task.time_estimate || ''}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'time_estimate', e.target.value ? parseInt(e.target.value) : null)}
                                      placeholder="mins"
                                      className="w-16 text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 placeholder:text-gray-400"
                                    />
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customer</label>
                                    <input
                                      type="text"
                                      list={`board-customers-${task.id}`}
                                      value={task.customer || ''}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'customer', e.target.value || null)}
                                      placeholder="Type or select..."
                                      className="w-28 text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-500 placeholder:text-gray-400"
                                    />
                                    <datalist id={`board-customers-${task.id}`}>
                                      {projectCustomers.map(c => (
                                        <option key={c} value={c} />
                                      ))}
                                    </datalist>
                                  </div>
                                  
                                  <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
                                    <input
                                      type="checkbox"
                                      checked={task.critical || false}
                                      onChange={(e) => handleUpdatePendingTask(task.id, 'critical', e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-red-400 dark:border-red-600 text-red-500 focus:ring-red-500"
                                    />
                                    <span className="text-red-600 dark:text-red-400 font-medium">Critical</span>
                                  </label>
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                      setEditingTask({ status, ...(selectedProjectId !== 'all' ? { project_id: selectedProjectId } : {}) })
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
                    onBreakdown={setBreakdownTask}
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
                        setEditingTask({ status, ...(selectedProjectId !== 'all' ? { project_id: selectedProjectId } : {}) })
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
                      onBreakdown={setBreakdownTask}
                    />
                  ))
                )}
              </div>
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
        onShowConfirm={setConfirmDialog}
        onAddCustomer={handleAddCustomerToProject}
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
        user={user}
      />
      
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        tasks={tasks}
        projects={projects}
        onEditTask={(task) => { setEditingTask(task); setTaskModalOpen(true) }}
        allTasks={tasks}
      />
      

      
      {/* Welcome Modal for Profile Setup */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onComplete={handleWelcomeComplete}
        onUploadAvatar={uploadAvatar}
        initialEmail={user?.email}
      />

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
      
      {/* AI Task Breakdown Modal */}
      <TaskBreakdownModal
        isOpen={!!breakdownTask}
        onClose={() => setBreakdownTask(null)}
        task={breakdownTask}
        projectName={projects.find(p => p.id === breakdownTask?.project_id)?.name}
        onAddSubtasks={handleAddBreakdownSubtasks}
      />
      
      {/* Delete Recurring Task Confirmation */}
      {deleteRecurringConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                {TaskCardIcons.repeat("w-6 h-6")}
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
          setMeetingNotesData({ title: '', date: new Date().toISOString().split('T')[0], notes: '', projectId: '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setShowMeetingNotesProjectError(false)
          setUploadedImage(null)
        }} 
        title="Import Meeting Notes"
        wide
        fullScreenMobile
      >
        {!showExtractedTasks ? (
          <div className="flex flex-col space-y-3 pb-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            
            {/* Image Upload Section */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Upload Photo</label>
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-3 transition-colors hover:border-indigo-300 dark:hover:border-indigo-600 bg-gray-50/50 dark:bg-gray-800/50">
                {uploadedImage ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <img 
                        src={uploadedImage.preview} 
                        alt="Uploaded notes" 
                        className="w-full max-h-32 object-contain rounded-lg bg-gray-100 dark:bg-gray-800"
                      />
                      <button
                        onClick={() => setUploadedImage(null)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {uploadedImage.name} ready
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="block w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 cursor-pointer dark:file:bg-indigo-600 dark:file:hover:bg-indigo-500"
                      />
                      <p className="text-[10px] text-gray-400 mt-0.5">Take a photo of handwritten notes on mobile</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">or paste text</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>
            </div>
            
            {/* Meeting Title & Date - stack on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Meeting Title</label>
                <input
                  type="text"
                  value={meetingNotesData.title}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                  placeholder="e.g., Weekly Sync"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={meetingNotesData.date}
                    onChange={(e) => setMeetingNotesData({ ...meetingNotesData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm opacity-0 absolute inset-0 cursor-pointer"
                  />
                  <div className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl text-sm text-center">
                    {meetingNotesData.date ? formatDate(meetingNotesData.date) : 'Select date'}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Project */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Project *</label>
              <div className="flex items-center gap-2">
                <select
                  value={meetingNotesData.projectId}
                  onChange={(e) => {
                    setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })
                    if (e.target.value) setShowMeetingNotesProjectError(false)
                  }}
                  className={`flex-1 px-3 py-2 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm appearance-none cursor-pointer ${
                    showMeetingNotesProjectError && !meetingNotesData.projectId
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-2 border-red-500 ring-2 ring-red-500/20'
                      : meetingNotesData.projectId 
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 border-l-4 border-l-red-400 dark:border-l-red-500'
                  }`}
                >
                  <option value="">Select a project...</option>
                  {projects.filter(p => !p.archived).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {showMeetingNotesProjectError && !meetingNotesData.projectId && (
                  <span className="text-xs text-red-500 font-medium">Required</span>
                )}
              </div>
            </div>
            
            {/* Meeting Notes */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Meeting Notes</label>
              <textarea
                value={meetingNotesData.notes}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, notes: e.target.value })}
                placeholder={`Paste your meeting notes or email thread here...

Best format - Follow-Up table:
| Follow-Up | Owner | Due Date |
| Review proposal | Sarah | 30/12 |

Or we can extract from:
• Action items like 'John to send report by Friday'
• Email requests like 'Can you send me the report?'
• TODO: Review the proposal`}
                className="min-h-[100px] sm:min-h-[180px] w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-xs leading-relaxed resize-y"
              />
            </div>
            
            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 sm:pt-1">
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center sm:text-left">
                {uploadedImage ? 'AI will analyze your image for tasks' : 'Tip: Follow-Up tables are extracted first'}
              </p>
              <button
                onClick={handleExtractTasks}
                disabled={(!meetingNotesData.notes.trim() && !uploadedImage) || isExtracting}
                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
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
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-indigo-600 dark:text-indigo-400">
                  Found {extractedTasks.length} potential task{extractedTasks.length !== 1 ? 's' : ''}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Review and edit before creating</p>
              </div>
              <button
                onClick={() => setShowExtractedTasks(false)}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium self-end sm:self-auto"
              >
                ← Back to Notes
              </button>
            </div>
            
            {extractedTasks.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">No action items found in your notes.</p>
                <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-1">Try adding bullet points or phrases like "Action:", "TODO:", or "@name"</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3 max-h-[50vh] sm:max-h-96 overflow-y-auto -mx-1 px-1">
                {extractedTasks.map((task) => (
                  <div 
                    key={task.id}
                    className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${
                      task.selected 
                        ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' 
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={(e) => updateExtractedTask(task.id, 'selected', e.target.checked)}
                        className="mt-1.5 sm:mt-1 w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateExtractedTask(task.id, 'title', e.target.value)}
                          className="w-full px-2.5 sm:px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-medium"
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-16 sm:w-auto">Assignee:</span>
                            <input
                              type="text"
                              value={task.assignee || ''}
                              onChange={(e) => updateExtractedTask(task.id, 'assignee', e.target.value)}
                              placeholder="Unassigned"
                              className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-xs flex-1 sm:w-28 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-16 sm:w-auto">Due:</span>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={task.dueDate ? formatDateForInput(task.dueDate) : ''}
                                onChange={(e) => {
                                  // Just store the raw value while typing - don't parse yet
                                  updateExtractedTask(task.id, 'dueDate', e.target.value)
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value.trim()
                                  if (!val) {
                                    updateExtractedTask(task.id, 'dueDate', null)
                                    return
                                  }
                                  // Only parse on blur
                                  const parsed = parseNaturalLanguageDate(val)
                                  if (parsed.date) {
                                    updateExtractedTask(task.id, 'dueDate', parsed.date)
                                  }
                                }}
                                placeholder="DD/MM/YYYY"
                                className="px-2 py-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-l-lg text-xs w-24 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              />
                              <div className="relative flex items-center justify-center px-2 border border-l-0 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-r-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                                <input
                                  type="date"
                                  value={task.dueDate || ''}
                                  onChange={(e) => updateExtractedTask(task.id, 'dueDate', e.target.value)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto sm:ml-0">
                            <input
                              type="checkbox"
                              checked={task.critical}
                              onChange={(e) => updateExtractedTask(task.id, 'critical', e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-red-600 dark:text-red-400">Critical</span>
                          </label>
                          {task.confidence && task.confidence < 0.7 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" title="Low confidence - review carefully">
                              Unsure
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeExtractedTask(task.id)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors touch-manipulation flex-shrink-0 -mr-1"
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
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 sm:pt-4 mt-1 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {extractedTasks.filter(t => t.selected).length} task{extractedTasks.filter(t => t.selected).length !== 1 ? 's' : ''} selected
              </p>
              <button
                onClick={handleCreateExtractedTasks}
                disabled={extractedTasks.filter(t => t.selected).length === 0 || saving}
                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all font-medium shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
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
      
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
      
      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setQuickAddOpen(false)}
          />
          <div className="relative z-10 bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md sm:mx-4 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Quick Add Task</h3>
              <button
                type="button"
                onClick={() => { setQuickAddOpen(false); setQuickAddTitle('') }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
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
                }} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Task</label>
                    <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      placeholder='e.g., "Call mom tomorrow" or "Report due friday"'
                      autoFocus
                      className="flex-1 px-3 py-2.5 text-base border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                    {voiceSupported && (
                      <button
                        type="button"
                        onClick={() => toggleVoiceInput((text) => setQuickAddTitle(text))}
                        className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${
                          isListening 
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {isListening ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          )}
                        </svg>
                      </button>
                    )}
                    </div>
                  </div>
                  {isListening && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-xs text-red-500">Listening... speak now</span>
                    </div>
                  )}
                  
                  {/* Parsed date indicator */}
                  {parsed.date && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Due {formatDate(parsed.date)}
                      </span>
                      <span className="text-[10px] text-gray-400">(from "{parsed.matched}")</span>
                    </div>
                  )}
                  
                  {/* Quick date shortcuts */}
                  {!parsed.date && (
                    <div>
                      <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Due Date</label>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {DATE_SHORTCUTS.map(shortcut => (
                        <button
                          key={shortcut.label}
                          type="button"
                          onClick={() => setQuickAddTitle(prev => `${prev} ${shortcut.label.toLowerCase()}`.trim())}
                          className="px-2.5 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                        >
                          {shortcut.label}
                        </button>
                      ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Project <span className="text-red-500">*</span></label>
                    <select
                      value={quickAddProject}
                      onChange={(e) => setQuickAddProject(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:border-transparent transition-all ${
                        !quickAddProject 
                          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 focus:ring-red-500' 
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500'
                      }`}
                    >
                      <option value="">Select project...</option>
                      {projects.filter(p => !p.archived).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = parseNaturalLanguageDate(quickAddTitle)
                        const prefillData = {
                          title: parsed.cleanedText || quickAddTitle,
                          project_id: quickAddProject,
                          due_date: parsed.date || null
                        }
                        setEditingTask(prefillData)
                        setTaskModalOpen(true)
                        setQuickAddOpen(false)
                        setQuickAddTitle('')
                      }}
                      className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      Full editor
                    </button>
                    <button
                      type="submit"
                      disabled={!quickAddTitle.trim() || !quickAddProject || saving}
                      className="flex-1 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Adding...' : 'Add Task'}
                    </button>
                  </div>
                </form>
      
              )
            })()}
            
            <p className="mt-3 text-[10px] text-center text-gray-400 dark:text-gray-500">Try "tomorrow", "next friday", "in 2 weeks"</p>
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
                className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
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
                <p className="text-xs text-gray-500 dark:text-gray-300 mb-2">Existing views:</p>
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
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">{TaskCardIcons.sun("w-6 h-6")} Plan Your Day</h3>
                <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Pick tasks to focus on today</p>
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
                <span className="text-sm text-gray-500 dark:text-gray-300 whitespace-nowrap">Energy:</span>
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
                            {task.critical && <span className="text-red-500">{TaskCardIcons.flag("w-3.5 h-3.5")}</span>}
                            {isReady && <span className="text-green-500">✓</span>}
                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-300">
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
                    <p className="text-gray-400 dark:text-gray-300 text-sm">All tasks are either planned or done.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-300">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{tasks.filter(t => t.status === 'todo').length}</span> tasks in Todo
                </div>
                <button
                  onClick={() => {
                    setPlanningModeOpen(false)
                    setCurrentView('myday')
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all font-medium"
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
            setQuickAddProject('')
            setQuickAddOpen(true)
          }
        }}
        className="sm:hidden fixed bottom-6 right-6 w-12 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg shadow-purple-500/40 flex items-center justify-center z-30 active:scale-95 transition-transform"
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
      
      {/* Unchecked Tasks Confirmation Modal */}
      {uncheckedConfirmOpen && pendingBulkAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Unchecked Tasks</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              You have <span className="font-semibold">{pendingBulkAction.uncheckedTasks.length}</span> unchecked task{pendingBulkAction.uncheckedTasks.length !== 1 ? 's' : ''}. What would you like to do with them?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setUncheckedConfirmOpen(false)
                  handleBulkApprovePendingTasks(false)
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors"
              >
                Keep for Later
              </button>
              <button
                onClick={() => {
                  setUncheckedConfirmOpen(false)
                  handleBulkApprovePendingTasks(true)
                }}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Admin Feedback Panel */}
      <AdminFeedbackPanel
        isOpen={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        userEmail={user?.email}
        userId={user?.id}
        onTaskCreated={fetchData}
        projects={projects}
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
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
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
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile
                </h3>
                <div className={`p-4 rounded-xl space-y-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar with upload button */}
                    <div className="relative group">
                      {profile?.avatar_url ? (
                        <img 
                          src={profile.avatar_url} 
                          alt="Profile" 
                          className="w-14 h-14 rounded-full object-cover border-2 border-indigo-200 dark:border-indigo-700"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-orange-500 flex items-center justify-center text-white font-bold text-xl">
                          {(profile?.display_name || user?.email)?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute inset-0 w-14 h-14 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        {uploadingAvatar ? (
                          <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {profile?.display_name || 'No name set'}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user?.email}</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {user?.app_metadata?.provider === 'google' ? 'Google Account' : 'Email Account'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Display Name */}
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Display Name</label>
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
                          onClick={() => { setEditingDisplayName(false); setDisplayName(profile?.display_name || ''); }}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className={`${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {profile?.display_name || <span className="text-gray-400 italic">Not set</span>}
                        </span>
                        <button
                          onClick={() => { setDisplayName(profile?.display_name || ''); setEditingDisplayName(true); }}
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
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Password
                  </h3>
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
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Preferences
                </h3>
                <div className={`p-4 rounded-xl space-y-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  {/* Default View */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Default view on login</span>
                    <select
                      value={defaultView}
                      onChange={(e) => handlePreferenceChange('trackli-default-view', e.target.value)}
                      className={`w-28 px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                      className={`w-28 px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${showConfetti ? 'bg-indigo-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${showConfetti ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Email to Tasks Section */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email to Tasks
                </h3>
                <div className={`p-4 rounded-xl space-y-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div>
                    <div className={`text-sm font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Your Trackli Email Address</div>
                    <div className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Forward emails here to create tasks automatically</div>
                  </div>
                  {profile?.inbound_email_token ? (
                    <div className="flex items-center gap-2">
                      <code className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono truncate ${darkMode ? 'bg-gray-800 text-indigo-400' : 'bg-white text-indigo-600 border border-gray-200'}`}>
                        tasks+{profile.inbound_email_token}@inbound.gettrackli.com
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`tasks+${profile.inbound_email_token}@inbound.gettrackli.com`)
                          // Show brief feedback
                          const btn = document.activeElement
                          const originalText = btn.innerHTML
                          btn.innerHTML = '✓'
                          setTimeout(() => { btn.innerHTML = originalText }, 1500)
                        }}
                        className="px-3 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors shrink-0"
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Email address not yet generated. Contact support.
                    </div>
                  )}
                </div>
              </div>
              
              {/* Region & Language Section */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Region & Language
                </h3>
                <div className={`p-4 rounded-xl space-y-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  {/* Date Format */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Date format</span>
                    <select
                      value={dateFormat}
                      onChange={(e) => handlePreferenceChange('trackli-date-format', e.target.value)}
                      className={`w-36 px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="DD/MM/YYYY">15/01 (DD/MM)</option>
                      <option value="MM/DD/YYYY">01/15 (MM/DD)</option>
                    </select>
                  </div>
                  
                  {/* Timezone info */}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Timezone</span>
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Integrations Section */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Integrations
                </h3>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  {/* Slack */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#4A154B] rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                        </svg>
                      </div>
                      <div>
                        <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Slack</div>
                        {slackConnection ? (
                          <div className={`text-xs ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                            Connected to {slackConnection.slack_team_name}
                          </div>
                        ) : (
                          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Create tasks via /trackli command
                          </div>
                        )}
                      </div>
                    </div>
                    {slackConnection ? (
                      <button
                        onClick={handleDisconnectSlack}
                        disabled={slackLoading}
                        className="px-3 py-1.5 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                      >
                        {slackLoading ? '...' : 'Disconnect'}
                      </button>
                    ) : (
                      <a
                        href={`https://slack.com/oauth/v2/authorize?client_id=27424537124.10220987954279&scope=chat:write,commands,users:read,im:write&redirect_uri=${encodeURIComponent('https://quzfljuvpvevvvdnsktd.supabase.co/functions/v1/slack-oauth')}&state=${user?.id}`}
                        className="px-3 py-1.5 bg-[#4A154B] text-white text-sm font-medium rounded-lg hover:bg-[#3e1240] transition-colors"
                      >
                        Connect
                      </a>
                    )}
                  </div>
                  {slackSuccess && (
                    <div className="mt-3 text-sm text-green-600 dark:text-green-400">
                      ✓ {slackSuccess}
                    </div>
                  )}
                  {slackError && (
                    <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                      ✗ {slackError}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Data Section */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  Data
                </h3>
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
                        className={`px-2 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
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
                        className="px-3 py-1.5 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 active:bg-gray-700 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        {clearingTasks ? '...' : 'Clear'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Support Section */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-3 text-indigo-600/80 dark:text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Support
                </h3>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Need help?</div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Get in touch with our support team</div>
                    </div>
                    <a
                      href="mailto:support@gettrackli.com"
                      className="px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap"
                    >
                      Contact
                    </a>
                  </div>
                </div>
              </div>
              
              {/* Danger Zone */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-3 text-red-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Danger Zone
                </h3>
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
      
      {/* Mobile Pending Tasks Sheet - renders on all views */}
      {mobilePendingSheetOpen && createPortal(
        <div className="sm:hidden fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobilePendingSheetOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200/50 dark:border-amber-800/50">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-lg font-semibold">{pendingEmailTasks.length} Pending Tasks</span>
              </div>
              <button 
                onClick={() => setMobilePendingSheetOpen(false)}
                onTouchEnd={(e) => { e.preventDefault(); setMobilePendingSheetOpen(false); }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Selection bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-amber-50/50 dark:bg-amber-900/20 border-b border-amber-200/30 dark:border-amber-800/30">
              <span className="text-sm text-amber-600 dark:text-amber-400">
                {pendingEmailTasks.filter(t => selectedPendingIds.has(t.id)).length} selected
              </span>
              <button
                onClick={async () => {
                  await handleBulkApprovePendingTasks()
                  if (pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id).length > 0) {
                    setMobilePendingSheetOpen(false)
                  }
                }}
                disabled={approvingTaskId === 'bulk' || pendingEmailTasks.filter(t => selectedPendingIds.has(t.id) && t.project_id).length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {approvingTaskId === 'bulk' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                )}
                Create Tasks
              </button>
            </div>
            
            {/* Task List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {pendingEmailTasks.map(task => {
                const isSelected = selectedPendingIds.has(task.id)
                const isExpanded = expandedPendingIds.has(task.id)
                const selectedProject = projects.find(p => p.id === task.project_id)
                const projectCustomers = selectedProject?.customers || []
                return (
                  <div key={task.id} className={`${isSelected ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/50 opacity-70'}`}>
                    <div className="flex items-start gap-3 p-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePendingTaskSelection(task.id)}
                        className="mt-1 w-5 h-5 rounded border-amber-400 dark:border-amber-600 text-amber-500 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => setExpandedPendingIds(prev => {
                          const next = new Set(prev)
                          if (next.has(task.id)) next.delete(task.id)
                          else next.add(task.id)
                          return next
                        })}
                        className="mt-1 p-1 text-gray-400 hover:text-amber-500 transition-colors"
                      >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => handleUpdatePendingTask(task.id, 'title', e.target.value)}
                          className="w-full text-base font-medium text-gray-800 dark:text-gray-200 bg-transparent border-none p-0 focus:ring-0"
                        />
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <input
                            type="date"
                            value={task.due_date || ''}
                            onChange={(e) => handleUpdatePendingTask(task.id, 'due_date', e.target.value || null)}
                            className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          />
                          <select
                            value={task.project_id || ''}
                            onChange={(e) => handleUpdatePendingTask(task.id, 'project_id', e.target.value || null)}
                            className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          >
                            <option value="">Project *</option>
                            {projects.filter(p => !p.archived).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {task.critical && <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded font-medium">!</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePendingTask(task.id)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Expanded fields */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 bg-amber-50/30 dark:bg-gray-900/30">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1.5 block">Start Date</label>
                            <input
                              type="date"
                              value={task.start_date || ''}
                              onChange={(e) => handleUpdatePendingTask(task.id, 'start_date', e.target.value || null)}
                              style={{ height: '40px', minHeight: '40px', maxHeight: '40px' }}
                              className="w-full text-sm px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 appearance-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1.5 block">Effort</label>
                            <select
                              value={task.energy_level || 'medium'}
                              onChange={(e) => handleUpdatePendingTask(task.id, 'energy_level', e.target.value)}
                              style={{ height: '40px' }}
                              className="w-full text-sm px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1.5 block">Time (mins)</label>
                            <input
                              type="number"
                              min="0"
                              value={task.time_estimate || ''}
                              onChange={(e) => handleUpdatePendingTask(task.id, 'time_estimate', e.target.value ? parseInt(e.target.value) : null)}
                              placeholder="mins"
                              style={{ height: '40px' }}
                              className="w-full text-sm px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1.5 block">Customer</label>
                            <input
                              type="text"
                              list={`mobile-customers-${task.id}`}
                              value={task.customer || ''}
                              onChange={(e) => handleUpdatePendingTask(task.id, 'customer', e.target.value || null)}
                              placeholder="Select..."
                              style={{ height: '40px' }}
                              className="w-full text-sm px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            />
                            <datalist id={`mobile-customers-${task.id}`}>
                              {projectCustomers.map(c => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1.5 block">Assignee</label>
                          <input
                            type="text"
                            value={task.assignee_text || ''}
                            onChange={(e) => handleUpdatePendingTask(task.id, 'assignee_text', e.target.value || null)}
                            placeholder="@who"
                            style={{ height: '40px' }}
                            className="w-full text-sm px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={task.critical || false}
                            onChange={(e) => handleUpdatePendingTask(task.id, 'critical', e.target.checked)}
                            className="w-5 h-5 rounded border-red-400 text-red-500 focus:ring-red-500"
                          />
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">Mark as Critical</span>
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => { setCurrentView('board'); setPendingReviewExpanded(true); setMobilePendingSheetOpen(false); }}
                className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
              >
                View on Board →
              </button>
            </div>
          </div>
        </div>
      , document.body)}
      
      {/* Spark AI Assistant Panel */}
      <SparkPanel
        isOpen={sparkPanelOpen}
        onClose={() => setSparkPanelOpen(false)}
        tasks={tasks}
        projects={projects.filter(p => !p.archived)}
        userName={profile?.display_name || user?.email?.split('@')[0] || ''}
        dateFormat={dateFormat}
        onTaskCreated={async (taskData) => {
          // Create task via Spark - aligned with email extraction pattern
          // Claude returns project_name (text), we match it to project_id here
          console.log('Spark task:', taskData.title, '| project_name:', taskData.project_name)
          
          const activeProjects = projects.filter(p => !p.archived)
          
          try {
            // Match project_name to project_id (same logic as inbound-email)
            let projectId = null
            const projectName = taskData.project_name
            
            if (projectName) {
              const searchName = projectName.toLowerCase().trim()
              
              // Try exact match first
              const exactMatch = activeProjects.find(p => p.name.toLowerCase() === searchName)
              if (exactMatch) {
                projectId = exactMatch.id
              } else {
                // Try partial match
                const partialMatch = activeProjects.find(p => {
                  const pNameLower = p.name.toLowerCase()
                  return pNameLower.includes(searchName) || searchName.includes(pNameLower)
                })
                if (partialMatch) projectId = partialMatch.id
              }
            }
            
            // If no project specified or found, return error with project list
            if (!projectId) {
              const projectList = activeProjects.map(p => p.name).join(', ')
              console.log('Spark: Project not found, returning error')
              return { 
                success: false, 
                error: `I couldn't find that project. Please choose from your active projects: ${projectList}` 
              }
            }
            
            console.log('Spark: Matched to project:', activeProjects.find(p => p.id === projectId)?.name)
            
            // Build task matching email extraction schema
            const insertData = {
              title: taskData.title?.trim() || 'New task',
              description: taskData.description || null,
              project_id: projectId,
              status: taskData.status || 'todo',
              due_date: taskData.due_date || null,
              start_date: taskData.start_date || taskData.due_date || null,
              start_time: taskData.start_time || null,
              end_time: taskData.end_time || null,
              time_estimate: taskData.time_estimate || null,
              assignee: taskData.assignee || null,
              critical: taskData.critical || false,
              energy_level: taskData.energy_level || 'medium',
              customer: taskData.customer || null,
              category: 'deliverable',
              source: 'spark'
            }
            console.log('Spark inserting task:', JSON.stringify(insertData, null, 2))
            
            const { data, error } = await supabase
              .from('tasks')
              .insert(insertData)
              .select()
              .single()

            console.log('Spark insert result:', { data, error })
            console.log('Spark: data exists?', !!data, 'error exists?', !!error)

            if (error) {
              console.error('Spark task error:', error)
              setToast({ message: `Failed to create task: ${error.message}`, type: 'error' })
              return false
            }
            
            if (!data) {
              console.error('Spark: No data returned from insert')
              setToast({ message: 'Failed to create task: No data returned', type: 'error' })
              return false
            }
            
            try {
              // Optimistic update for immediate feedback
              // Realtime subscription will handle any edge cases
              setTasks(prev => {
                // Avoid duplicates (realtime might also add it)
                if (prev.some(t => t.id === data.id)) return prev
                return [...prev, { ...data, attachments: [], dependencies: [] }]
              })
              
              setToast({ message: `Created: ${data.title}`, type: 'success' })
              return { success: true }
            } catch (stateError) {
              console.error('Spark: Error updating state:', stateError)
              return { success: false, error: 'Failed to update task list' }
            }
          } catch (e) {
            console.error('Spark exception:', e)
            setToast({ message: 'Failed to create task', type: 'error' })
            return { success: false, error: 'Something went wrong creating the task' }
          }
        }}
        onTaskUpdated={async (taskId, updates) => {
          try {
            const task = tasks.find(t => t.id === taskId)
            if (!task) return { success: false, error: 'Task not found' }
            
            // Store previous state for undo
            const previousState = { ...task }
            
            // Convert project_name to project_id if provided
            const dbUpdates = { ...updates }
            if (updates.project_name) {
              const project = projects.find(p => 
                p.name.toLowerCase() === updates.project_name.toLowerCase()
              )
              if (project) {
                dbUpdates.project_id = project.id
                delete dbUpdates.project_name
              } else {
                return { success: false, error: `Project "${updates.project_name}" not found` }
              }
            }
            
            const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId)
            if (error) throw error
            
            // Optimistic update
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...dbUpdates } : t))
            
            // Show undo toast
            setUndoToast({
              taskId,
              previousState,
              taskTitle: task.title,
              updateType: Object.keys(updates)[0] // e.g., 'due_date', 'status'
            })
            setTimeout(() => setUndoToast(null), 5000)
            
            return { success: true }
          } catch (err) {
            console.error('Error updating task:', err)
            return { success: false, error: err.message }
          }
        }}
        onTaskCompleted={async (taskId) => {
          const { error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId)
          if (!error) {
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t))
            setToast({ message: 'Task completed!', type: 'success' })
            return true
          }
          return false
        }}
        onProjectCreated={async (projectData) => {
          try {
            const { data, error } = await supabase
              .from('projects')
              .insert({ 
                name: projectData.name, 
                color: projectData.color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
                user_id: user.id 
              })
              .select()
              .single()
            if (error) {
              console.error('Spark project creation error:', error)
              setToast({ message: 'Failed to create project', type: 'error' })
              return false
            }
            if (data) {
              setProjects(prev => [...prev, data])
              setToast({ message: 'Project created by Spark!', type: 'success' })
              return true
            }
          } catch (e) {
            console.error('Spark project creation exception:', e)
            setToast({ message: 'Failed to create project', type: 'error' })
            return false
          }
          return false
        }}
      />
      
      {/* Footer */}
      <footer className="mt-auto py-4 px-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <a href="https://gettrackli.com" target="_blank" rel="noopener noreferrer" className="font-bold text-gray-700 dark:text-gray-300 hover:text-indigo-500 transition-colors">Trackli</a>
          <span className="hidden sm:inline text-gray-400 dark:text-gray-500 italic">Task management that sparks joy</span>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
          <Link to="/privacy" className="hover:text-indigo-500 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-indigo-500 transition-colors">Terms</Link>
          <a href="mailto:support@gettrackli.com" className="hover:text-indigo-500 transition-colors">Contact</a>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
          <span className="text-gray-400 dark:text-gray-500">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
    </PullToRefresh>
  )
}
