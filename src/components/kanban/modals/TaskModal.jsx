import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import Modal from '../ui/Modal'
import AttachmentViewer from '../ui/AttachmentViewer'
import { 
  CATEGORIES, SOURCES, ENERGY_LEVELS, RECURRENCE_TYPES, 
  DATE_SHORTCUTS, btn, COLUMN_COLORS, COLUMNS 
} from '../constants'
import { 
  formatDate, parseNaturalLanguageDate, parseFlexibleTime, getDateLocale, formatDateForInput,
  getOccurrenceCount, getCustomerColor, isBlocked, getDueDateStatus, formatTimeEstimate
} from '../utils'
import { TaskCardIcons } from '../icons'

const TaskModal = ({ isOpen, onClose, task, projects, allTasks, onSave, onDelete, loading, onShowConfirm, onAddCustomer }) => {
  const fileInputRef = useRef(null)
  const startDateRef = useRef(null)
  const dueDateRef = useRef(null)
  
  const [formReady, setFormReady] = useState(true)
  const [showProjectError, setShowProjectError] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingStartDate, setEditingStartDate] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)
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
  const [expandedSections, setExpandedSections] = useState({})
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [useCustomAssignee, setUseCustomAssignee] = useState(false)
  const [customAssignee, setCustomAssignee] = useState('')
  const [useCustomCustomer, setUseCustomCustomer] = useState(false)
  const [customCustomer, setCustomCustomer] = useState('')
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
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
    
    // Reset error state on open
    setShowProjectError(false)
    
    if (task?.id) {
      const project = projects.find((p) => p.id === task.project_id)
      const isCustomAssignee = project && !project.members?.includes(task.assignee) && task.assignee
      const isCustomCustomer = project && !project.customers?.includes(task.customer) && task.customer
      
      // Clear times if start_date is in the past (no longer relevant for scheduling)
      const startDateInPast = task.start_date && new Date(task.start_date + 'T23:59:59') < new Date()
      
      setFormData({
        title: task.title || '',
        description: task.description || '',
        project_id: task.project_id || '',
        status: task.status || 'backlog',
        critical: task.critical || false,
        start_date: task.start_date || '',
        start_time: startDateInPast ? '' : (task.start_time || ''),
        end_time: startDateInPast ? '' : (task.end_time || ''),
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
      // Auto-expand notes/attachments section if task has attachments or notes
      if ((task.attachments && task.attachments.length > 0) || task.notes) {
        setExpandedSections(prev => ({ ...prev, more: true }))
      }
      setSelectedDependencies(task.dependencies?.map(d => d.depends_on_id) || [])
      setUseCustomAssignee(isCustomAssignee)
      setCustomAssignee(isCustomAssignee ? task.assignee : '')
      setUseCustomCustomer(isCustomCustomer)
      setCustomCustomer(isCustomCustomer ? task.customer : '')
      setSubtasks(task.subtasks || [])
      // Auto-expand subtasks section if task has subtasks
      if (task.subtasks && task.subtasks.length > 0) {
        setExpandedSections(prev => ({ ...prev, subtasks: true }))
      }
      setComments(task.comments || [])
    } else {
      // New task - may have prefilled data from calendar double-click
      // Calculate time_estimate if start_time and end_time are provided
      let timeEstimate = ''
      if (task?.start_time && task?.end_time) {
        const [startH, startM] = task.start_time.split(':').map(Number)
        const [endH, endM] = task.end_time.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM
        if (endMinutes > startMinutes) {
          timeEstimate = endMinutes - startMinutes
        }
      }
      
      setFormData({
        title: task?.title || '',
        description: '',
        project_id: task?.project_id || '',
        status: task?.status || 'backlog',
        critical: false,
        start_date: task?.start_date || '',
        start_time: task?.start_time || '',
        end_time: task?.end_time || '',
        due_date: task?.due_date || '',
        assignee: '',
        time_estimate: timeEstimate,
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
      setIsAddingNewCustomer(false)
      setNewCustomerName('')
      setSubtasks([])
      setComments([])
    }
    setNewFiles([])
    setActiveTab('details')
    setUploadError('')
    setNewSubtaskTitle('')
    setNewCommentText('')
    // Mark form as ready after initialization
    setFormReady(true)
  }, [task?.id, task?.title, task?.project_id, isOpen])
  
  // Reset initialization tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = null
      setFormReady(false)
    }
  }, [isOpen])
  
  const selectedProject = projects.find((p) => p.id === formData.project_id)
  
  // Check if due date is overdue
  const isOverdue = formData.due_date && new Date(formData.due_date + 'T23:59:59') < new Date()
  
  // Format date for display in user's locale
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr + 'T00:00:00')
      return date.toLocaleDateString(getDateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return dateStr
    }
  }
  
  // Get date placeholder based on user's format preference
  const getDatePlaceholder = (includeHint = false) => {
    const locale = getDateLocale()
    let format = 'DD/MM/YYYY'
    if (locale === 'en-US') format = 'MM/DD/YYYY'
    else if (locale === undefined) {
      // Auto-detect from browser
      const testDate = new Date(2000, 0, 15)
      const formatted = testDate.toLocaleDateString()
      const firstNum = parseInt(formatted.split(/[\/\-\.]/)[0])
      format = firstNum === 1 ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
    }
    return includeHint ? `${format} or 'tomorrow'` : format
  }
  
  // Show time fields only if start_date is within 1 day in past, today, or future
  const showTimeFields = (() => {
    if (!formData.start_date) return false
    const startDate = new Date(formData.start_date + 'T00:00:00')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    return startDate >= yesterday
  })()
  
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
  
  // Extracted save logic so it can be called directly or after confirmation
  const performSave = async () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Require project for new tasks
    if (!formData.project_id) {
      setShowProjectError(true)
      return
    }
    
    // Soft validation: warn if no due date set
    if (!formData.due_date && onShowConfirm) {
      onShowConfirm({
        title: 'No Due Date Set',
        message: 'Adding a due date helps keep your tasks organised. Continue without a due date?',
        confirmLabel: 'Continue Anyway',
        confirmStyle: 'warning',
        icon: '📅',
        onConfirm: performSave
      })
      return
    }
    
    await performSave()
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
        {/* Status & Project - unified control bar */}
        <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          {/* Status - contained segmented control */}
          <div className="inline-flex items-center bg-gray-50 dark:bg-gray-800/50 rounded-lg p-1 gap-0.5">
            {COLUMNS.map((col) => {
              const isSelected = formData.status === col.id
              const getIcon = () => {
                switch(col.id) {
                  case 'backlog':
                    return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  case 'todo':
                    return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" strokeWidth={2} /></svg>
                  case 'in_progress':
                    return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="16 8" /></svg>
                  case 'done':
                    return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  default: return null
                }
              }
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: col.id })}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isSelected
                      ? 'shadow-sm ring-1 ring-inset'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                  style={isSelected ? { 
                    color: col.color, 
                    backgroundColor: col.color + '18',
                    '--tw-ring-color': col.color + '40'
                  } : {}}
                  title={col.title}
                >
                  {getIcon()}
                  <span className={isSelected ? '' : 'hidden sm:inline'}>{col.title}</span>
                </button>
              )
            })}
          </div>
          {/* Project - clean chip */}
          <div className="flex items-center gap-2">
          <select
          required
          value={formData.project_id}
          onChange={(e) => {
            setFormData({ ...formData, project_id: e.target.value, assignee: '', customer: '' })
          if (e.target.value) setShowProjectError(false)
          }}
          className={`text-xs font-medium pl-2.5 pr-6 py-1.5 rounded-md border cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/30 appearance-none bg-no-repeat bg-[length:16px] bg-[center_right_4px] ${
            showProjectError && !formData.project_id
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-500 ring-2 ring-red-500/30'
              : formData.project_id 
                ? 'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 border-l-4 border-l-red-400 dark:border-l-red-500'
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${showProjectError && !formData.project_id ? '%23EF4444' : formData.project_id ? 'white' : '%236B7280'}'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")` }}
          >
              <option value="">Project *</option>
              {projects.filter(p => !p.archived).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {showProjectError && !formData.project_id && (
              <span className="text-xs text-red-500 font-medium">Required</span>
            )}
          </div>
        </div>
        
        {/* ═══════ CORE FIELDS ═══════ */}
        {true && (
          <div className="space-y-2">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.title ? 'border-l-4 border-l-red-400 dark:border-l-red-500' : ''}`}
                placeholder="What needs to be done?"
              />
            </div>
            
            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onPaste={handlePaste}
                rows={2}
                className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${!formData.description ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                placeholder="Add more context... (paste images here!)"
              />
              {pasteMessage && activeTab === 'details' && (
                <p className="text-sm text-green-600 mt-1">{pasteMessage}</p>
              )}
            </div>
            
            {/* Customer & Effort Level - side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Customer/Client</label>
                {isAddingNewCustomer ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newCustomerName.trim()) {
                          e.preventDefault()
                          const savedName = await onAddCustomer(formData.project_id, newCustomerName)
                          if (savedName) {
                            setFormData({ ...formData, customer: savedName })
                            setIsAddingNewCustomer(false)
                            setNewCustomerName('')
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="New customer name"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (newCustomerName.trim()) {
                          const savedName = await onAddCustomer(formData.project_id, newCustomerName)
                          if (savedName) {
                            setFormData({ ...formData, customer: savedName })
                            setIsAddingNewCustomer(false)
                            setNewCustomerName('')
                          }
                        }
                      }}
                      className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingNewCustomer(false); setNewCustomerName('') }}
                      className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : !useCustomCustomer ? (
                  <select
                    value={formData.customer}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setUseCustomCustomer(true)
                        setFormData({ ...formData, customer: '' })
                      } else if (e.target.value === '__add_new__') {
                        setIsAddingNewCustomer(true)
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
                    <option value="__other__">Other (one-time name)</option>
                    <option value="__add_new__">+ Add new customer</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customCustomer}
                      onChange={(e) => setCustomCustomer(e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Customer name (one-time)"
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
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Effort Level</label>
                <div className="flex gap-1.5">
                  {Object.entries(ENERGY_LEVELS).map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormData({ ...formData, energy_level: key })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        formData.energy_level === key
                          ? 'ring-2 ring-offset-1 ring-indigo-500'
                          : 'hover:opacity-80'
                      }`}
                      style={{ backgroundColor: val.bg, color: val.text }}
                    >
                      {val.icon} {val.label.replace(' Effort', '')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Time Estimate - Quick Input */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Time Estimate</label>
              <div className="flex gap-2 items-center">
                <div className="flex gap-1">
                  {[
                    { label: '15m', mins: 15 },
                    { label: '30m', mins: 30 },
                    { label: '1h', mins: 60 },
                    { label: '2h', mins: 120 },
                    { label: '4h', mins: 240 },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        const updates = { time_estimate: String(opt.mins) }
                        if (formData.start_time) {
                          const [hours, mins] = formData.start_time.split(':').map(Number)
                          const startMinutes = hours * 60 + mins
                          const endMinutes = startMinutes + opt.mins
                          const endHours = Math.floor(endMinutes / 60)
                          const endMins = endMinutes % 60
                          updates.end_time = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`
                        }
                        setFormData({ ...formData, ...updates })
                      }}
                      className={`px-2 py-1 text-xs font-medium rounded-lg transition-all ${
                        formData.time_estimate === String(opt.mins)
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={formData.time_estimate}
                  onChange={(e) => {
                    const newEstimate = e.target.value
                    const updates = { time_estimate: newEstimate }
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
                  className="w-20 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="mins"
                />
                {formData.time_estimate && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimeEstimate(parseInt(formData.time_estimate))}
                  </span>
                )}
                {formData.time_estimate && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, time_estimate: '' })}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            {/* Start Date & Due Date side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Start Date</label>
                <div className="flex gap-1 mb-1.5">
                  {[
                    { label: 'T', title: 'Today', days: 0 },
                    { label: '+1', title: 'Tomorrow', days: 1 },
                    { label: 'W', title: 'Next Week', days: 7 },
                    { label: 'M', title: 'Next Month', days: 30 },
                  ].map(opt => {
                    const d = new Date(); d.setDate(d.getDate() + opt.days);
                    const dateStr = d.toISOString().split('T')[0];
                    const isActive = formData.start_date === dateStr;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormData({ ...formData, start_date: dateStr })}
                        title={opt.title}
                        className={`px-2 py-1 text-xs font-medium rounded-lg transition-all ${
                          isActive
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  {formData.start_date && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, start_date: '' })}
                      title="Clear"
                      className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="relative flex">
                  <input
                    type="text"
                    value={editingStartDate ? formData.start_date : formatDateForInput(formData.start_date)}
                    onFocus={() => setEditingStartDate(true)}
                    onChange={(e) => {
                      const val = e.target.value
                      setFormData({ ...formData, start_date: val })
                    }}
                    onBlur={(e) => {
                      setEditingStartDate(false)
                      const val = e.target.value.trim()
                      if (!val) return
                      const parsed = parseNaturalLanguageDate(val)
                      if (parsed.date) setFormData({ ...formData, start_date: parsed.date })
                    }}
                    placeholder={getDatePlaceholder()}
                    className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-l-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm ${!formData.start_date ? 'border-l-4 border-l-amber-300 dark:border-l-amber-500' : ''}`}
                  />
                  <div className="relative flex items-center justify-center px-3 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-xl bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <input
                      ref={startDateRef}
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                {formData.start_date && (
                  <p className="text-xs mt-1 text-gray-400">
                    {formatDateForDisplay(formData.start_date)}
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${isOverdue ? 'text-red-500' : 'text-indigo-600/80 dark:text-indigo-400'}`}>Due Date</label>
                  {isOverdue && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">OVERDUE</span>
                  )}
                </div>
                <div className="flex gap-1 mb-1.5">
                  {[
                    { label: 'T', title: 'Today', days: 0 },
                    { label: '+1', title: 'Tomorrow', days: 1 },
                    { label: 'W', title: 'Next Week', days: 7 },
                    { label: 'M', title: 'Next Month', days: 30 },
                  ].map(opt => {
                    const d = new Date(); d.setDate(d.getDate() + opt.days);
                    const dateStr = d.toISOString().split('T')[0];
                    const isActive = formData.due_date === dateStr;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormData({ ...formData, due_date: dateStr })}
                        title={opt.title}
                        className={`px-2 py-1 text-xs font-medium rounded-lg transition-all ${
                          isActive
                            ? 'bg-indigo-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  {formData.due_date && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, due_date: '' })}
                      title="Clear"
                      className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="relative flex">
                  <input
                  type="text"
                  value={editingDueDate ? formData.due_date : formatDateForInput(formData.due_date)}
                  onFocus={() => setEditingDueDate(true)}
                  onChange={(e) => {
                  const val = e.target.value
                    setFormData({ ...formData, due_date: val })
                  }}
                  onBlur={(e) => {
                  setEditingDueDate(false)
                  const val = e.target.value.trim()
                  if (!val) return
                    const parsed = parseNaturalLanguageDate(val)
                    if (parsed.date) setFormData({ ...formData, due_date: parsed.date })
                  }}
                  placeholder={getDatePlaceholder(true)}
                  className={`w-full px-3 py-2 border rounded-l-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-sm ${
                  isOverdue 
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' 
                  : !formData.due_date
                        ? 'border-gray-200 dark:border-gray-700 border-l-4 border-l-amber-300 dark:border-l-amber-500 text-gray-900 dark:text-gray-100'
                          : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  />
                  <div
                    className={`relative flex items-center justify-center px-3 border border-l-0 rounded-r-xl cursor-pointer transition-colors ${
                    isOverdue
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}>
                    <input
                      ref={dueDateRef}
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <svg className={`w-4 h-4 ${isOverdue ? 'text-red-500' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                {formData.due_date && (
                  <p className={`text-xs mt-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                    {formatDateForDisplay(formData.due_date)}
                  </p>
                )}
              </div>
            </div>
            
            {/* Start Time & End Time side by side - only show if start_date is recent/future */}
            {showTimeFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Start Time</label>
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
                <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">End Time</label>
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
            )}
            
            {/* Critical & Recurring - compact toggles */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, critical: !formData.critical })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.critical
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-2 ring-red-300 dark:ring-red-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
>
                {TaskCardIcons.flag("w-4 h-4")} Critical
              </button>
              
              <button
                type="button"
                onClick={() => setFormData({ ...formData, recurrence_type: formData.recurrence_type ? null : 'weekly' })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.recurrence_type
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-2 ring-blue-300 dark:ring-blue-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
>
                {TaskCardIcons.repeat("w-4 h-4")} Recurring
              </button>
            </div>
            
            {/* Recurrence options - shown when toggle is on */}
            {formData.recurrence_type && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Repeat</label>
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
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Occurrences</label>
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
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Or until date</label>
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
        
        {/* ═══════ SUBTASKS ═══════ */}
          <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, subtasks: !prev.subtasks }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">☑️</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subtasks</span>
                {subtasks.length > 0 && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{subtasks.filter(s => s.completed).length}/{subtasks.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedSections.subtasks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          <div className={`grid transition-all duration-200 ease-out ${expandedSections.subtasks ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
          <div className="p-4 space-y-4">
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
                      setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false, due_date: null }])
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
                      setSubtasks([...subtasks, { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false, due_date: null }])
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
                        subtask.completed ? 'text-gray-400 dark:text-gray-300 line-through' : 'text-gray-800 dark:text-gray-200'
                      }`}>
                        {subtask.title}
                      </span>
                      {/* Subtask due date */}
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={subtask.due_date || ''}
                          onChange={(e) => {
                            setSubtasks(subtasks.map(s =>
                              s.id === subtask.id ? { ...s, due_date: e.target.value || null } : s
                            ))
                          }}
                          className={`w-28 px-2 py-1 text-xs border rounded-lg transition-all ${
                            subtask.due_date 
                              ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                              : 'border-gray-200 dark:border-gray-600 bg-transparent text-gray-400 dark:text-gray-500'
                          } focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                          title="Set due date for this subtask"
                        />
                        {subtask.due_date && (
                          <button
                            type="button"
                            onClick={() => setSubtasks(subtasks.map(s =>
                              s.id === subtask.id ? { ...s, due_date: null } : s
                            ))}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="Clear date"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
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
          </div>
          </div>
          </div>
          
          {/* ═══════ NOTES & ATTACHMENTS ═══════ */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, more: !prev.more }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📝</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes & Attachments</span>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedSections.more ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          <div className={`grid transition-all duration-200 ease-out ${expandedSections.more ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Notes</label>
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
              <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Attachments</label>
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
                <p className="text-xs text-gray-400 dark:text-gray-300 mt-2">Max 10MB • Paste images with ⌘V</p>
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
          </div>
          </div>
          </div>
          
          {/* ═══════ DEPENDENCIES ═══════ */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, dependencies: !prev.dependencies }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🔗</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dependencies</span>
                {selectedDependencies.length > 0 && <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">{selectedDependencies.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedSections.dependencies ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          <div className={`grid transition-all duration-200 ease-out ${expandedSections.dependencies ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-200">Blocked by</h3>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">This task won't start until these are done</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-300">Select a project first</p>
              </div>
            ) : availableDependencies.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-300">No other tasks to link</p>
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
                            'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                          }`}>
                            {COLUMNS.find(c => c.id === depTask.status)?.title}
                          </span>
                          {depTask.critical && (
                            <span className="text-red-500 dark:text-red-400">{TaskCardIcons.flag("w-3 h-3")}</span>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          </div>
          </div>
          </div>
          
          {/* ═══════ ACTIVITY ═══════ */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, activity: !prev.activity }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">💬</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activity</span>
                {comments.length > 0 && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">{comments.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedSections.activity ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          <div className={`grid transition-all duration-200 ease-out ${expandedSections.activity ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
          <div className="p-4 space-y-4">
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
                  <span className="text-xs text-gray-400 dark:text-gray-300">({comments.length})</span>
                )}
              </h3>
              
              {comments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-300">
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
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              <span className="text-gray-400 dark:text-gray-300">{item.icon || '•'}</span> {item.text}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">
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
          </div>
          </div>
          </div>
          
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
          
          <div className="flex-1" />
          
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded-xl transition-all text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 active:from-indigo-700 active:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl disabled:opacity-50 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
                className="px-4 py-2 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(task.id)
                  setShowDeleteConfirm(false)
                  onClose()
                }}
                className="px-4 py-2 rounded-xl font-medium bg-red-500 hover:bg-red-600 active:bg-red-700 text-white transition-all shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
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

export default TaskModal
