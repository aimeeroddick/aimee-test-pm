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

const COLUMN_COLORS = {
  backlog: '#8B5CF6',
  todo: '#6366F1',
  in_progress: '#14B8A6',
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

// Modal Component
const Modal = ({ isOpen, onClose, title, children, wide }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative bg-white rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
const TaskCard = ({ task, project, onEdit, onDragStart, showProject = true }) => {
  const dueDateStatus = getDueDateStatus(task.due_date, task.status)
  const energyStyle = ENERGY_LEVELS[task.energy_level]
  const category = CATEGORIES.find(c => c.id === task.category)
  const source = SOURCES.find(s => s.id === task.source)
  const readyToStart = isReadyToStart(task)
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onEdit(task)}
      className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-all group ${
        task.critical 
          ? 'border-red-200 hover:border-red-300 ring-1 ring-red-100' 
          : readyToStart
          ? 'border-green-200 hover:border-green-300'
          : 'border-gray-100 hover:border-gray-200'
      }`}
      style={{ borderLeftWidth: '4px', borderLeftColor: task.critical ? '#EF4444' : readyToStart ? '#10B981' : (category?.color || COLUMN_COLORS[task.status]) }}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {task.critical && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
            <svg className="w-3 h-3" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Critical
          </span>
        )}
        {readyToStart && (
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
      
      <h4 className="font-medium text-gray-800 group-hover:text-indigo-600 transition-colors mb-1">
        {task.title}
      </h4>
      
      {task.customer && (
        <p className="text-sm text-purple-600 font-medium mb-2">
          {task.customer}
        </p>
      )}
      
      {task.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{task.description}</p>
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
        <div className="mt-3 pt-3 border-t border-gray-50">
          <span className="text-xs text-gray-400">{project.name}</span>
        </div>
      )}
    </div>
  )
}

// Column Component
const Column = ({ column, tasks, projects, onEditTask, onDragStart, onDragOver, onDrop, showProject }) => {
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
      className={`flex-1 min-w-[300px] max-w-[380px] bg-gray-50/80 rounded-2xl p-4 transition-all ${
        isDragOver ? 'ring-2 ring-indigo-400 ring-offset-2' : ''
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
        <h3 className="font-semibold text-gray-700">{column.title}</h3>
        <span className="ml-auto bg-white px-2.5 py-0.5 rounded-full text-sm font-medium text-gray-500 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-4 ml-6 text-xs text-gray-400">
        <span>{column.subtitle}</span>
        {totalMinutes > 0 && <span>• {formatTimeEstimate(totalMinutes)}</span>}
        {criticalCount > 0 && <span className="text-red-500">• {criticalCount} critical</span>}
        {column.id === 'backlog' && readyCount > 0 && <span className="text-green-600">• {readyCount} ready</span>}
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
const TaskModal = ({ isOpen, onClose, task, projects, onSave, onDelete, loading }) => {
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
  })
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
  
  // Handle pasting images into description or notes
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          // Generate a name for the pasted image
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
      })
      setAttachments(task.attachments || [])
      setUseCustomAssignee(isCustomAssignee)
      setCustomAssignee(isCustomAssignee ? task.assignee : '')
      setUseCustomCustomer(isCustomCustomer)
      setCustomCustomer(isCustomCustomer ? task.customer : '')
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
      })
      setAttachments([])
      setUseCustomAssignee(false)
      setCustomAssignee('')
      setUseCustomCustomer(false)
      setCustomCustomer('')
    }
    setNewFiles([])
    setActiveTab('details')
    setUploadError('')
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
    }, newFiles, attachments)
    onClose()
  }
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task ? 'Edit Task' : 'New Task'} wide>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'details', label: 'Details' },
            { id: 'planning', label: 'Planning' },
            { id: 'notes', label: 'Notes & Attachments' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="What needs to be done?"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                onPaste={handlePaste}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
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
const ProjectModal = ({ isOpen, onClose, project, onSave, onDelete, loading }) => {
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
            <button
              type="button"
              onClick={() => { onDelete(project.id); onClose() }}
              disabled={loading}
              className="px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
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
  
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [draggedTask, setDraggedTask] = useState(null)
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterCustomer, setFilterCustomer] = useState('all')
  const [filterCritical, setFilterCritical] = useState('all')
  const [filterReadyToStart, setFilterReadyToStart] = useState(false)
  const [filterTimeOperator, setFilterTimeOperator] = useState('all')
  const [filterTimeValue, setFilterTimeValue] = useState('')

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch projects with members and customers
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (projectsError) throw projectsError

      // Fetch members and customers for each project
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

      // Fetch tasks with attachments
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (tasksError) throw tasksError

      // Fetch attachments for each task
      const tasksWithAttachments = await Promise.all(
        tasksData.map(async (task) => {
          const { data: attachments } = await supabase
            .from('attachments')
            .select('*')
            .eq('task_id', task.id)
          
          // Get public URLs for attachments
          const attachmentsWithUrls = attachments?.map(att => ({
            ...att,
            file_url: supabase.storage.from('attachments').getPublicUrl(att.file_path).data.publicUrl
          })) || []
          
          return { ...task, attachments: attachmentsWithUrls }
        })
      )

      setProjects(projectsWithRelations)
      setTasks(tasksWithAttachments)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Project CRUD
  const handleSaveProject = async (projectData) => {
    setSaving(true)
    setError(null)
    
    try {
      if (projectData.id) {
        // Update existing project
        const { error: updateError } = await supabase
          .from('projects')
          .update({ name: projectData.name })
          .eq('id', projectData.id)
        
        if (updateError) throw updateError

        // Delete existing members and customers, then re-add
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
        // Create new project
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
    if (!confirm('Delete this project and all its tasks?')) return
    
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

  // Task CRUD
  const handleSaveTask = async (taskData, newFiles = [], existingAttachments = []) => {
    setSaving(true)
    setError(null)
    
    try {
      let taskId = taskData.id

      if (taskId) {
        // Update existing task
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
          })
          .eq('id', taskId)
        
        if (updateError) throw updateError

        // Handle removed attachments
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
        // Create new task
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
          })
          .select()
          .single()
        
        if (insertError) throw insertError
        taskId = newTask.id
      }

      // Upload new files
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
      // Delete attachments from storage
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
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId)
      
      if (error) throw error
      
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    } catch (err) {
      console.error('Error updating task status:', err)
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

  const readyToStartCount = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false
    if (filterCustomer !== 'all' && t.customer !== filterCustomer) return false
    if (filterCritical === 'critical' && !t.critical) return false
    if (filterCritical === 'regular' && t.critical) return false
    if (filterTimeOperator !== 'all' && filterTimeValue) {
      const timeVal = parseInt(filterTimeValue)
      if (filterTimeOperator === 'lt' && (t.time_estimate || 0) >= timeVal) return false
      if (filterTimeOperator === 'gt' && (t.time_estimate || 0) <= timeVal) return false
    }
    return isReadyToStart(t)
  }).length

  const filteredTasks = tasks.filter((t) => {
    if (selectedProjectId !== 'all' && t.project_id !== selectedProjectId) return false
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false
    if (filterCustomer !== 'all' && t.customer !== filterCustomer) return false
    if (filterCritical === 'critical' && !t.critical) return false
    if (filterCritical === 'regular' && t.critical) return false
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
  const totalEstimatedTime = filteredTasks.filter(t => t.status !== 'done').reduce((sum, t) => sum + (t.time_estimate || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your projects...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
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

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Aimee Test PM
                </h1>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              
              <select
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="all">All Customers</option>
                {allCustomers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="all">All Assignees</option>
                {allAssignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              
              <select
                value={filterCritical}
                onChange={(e) => setFilterCritical(e.target.value)}
                className={`px-4 py-2 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                  filterCritical === 'critical' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200'
                }`}
              >
                <option value="all">All Tasks</option>
                <option value="critical">🚩 Critical Only</option>
                <option value="regular">Regular Only</option>
              </select>
              
              {/* Time Estimate Filter */}
              <div className="flex items-center gap-1">
                <select
                  value={filterTimeOperator}
                  onChange={(e) => setFilterTimeOperator(e.target.value)}
                  className={`px-3 py-2 border rounded-l-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                    filterTimeOperator !== 'all' && filterTimeValue ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-gray-200'
                  }`}
                >
                  <option value="all">Time</option>
                  <option value="lt">&lt;</option>
                  <option value="gt">&gt;</option>
                </select>
                {filterTimeOperator !== 'all' && (
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="0"
                      value={filterTimeValue}
                      onChange={(e) => setFilterTimeValue(e.target.value)}
                      placeholder="mins"
                      className="w-20 px-3 py-2 border-y border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                    <button
                      onClick={() => { setFilterTimeOperator('all'); setFilterTimeValue('') }}
                      className="px-2 py-2 border border-l-0 border-gray-200 rounded-r-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              
              <button
                onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
                className="px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Project
              </button>
              
              <button
                onClick={() => { setEditingTask(null); setTaskModalOpen(true) }}
                disabled={projects.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Task
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

      {/* Stats Bar */}
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
        </div>
      </div>

      {/* Project Info */}
      {selectedProjectId !== 'all' && (
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Aimee Test PM!</h2>
          <p className="text-gray-500 mb-6">Get started by creating your first project.</p>
          <button
            onClick={() => { setEditingProject(null); setProjectModalOpen(true) }}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25"
          >
            Create Your First Project
          </button>
        </div>
      )}

      {/* Board */}
      {projects.length > 0 && (
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
              />
            ))}
          </div>
        </main>
      )}

      {/* Modals */}
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null) }}
        task={editingTask}
        projects={projects}
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
        loading={saving}
      />
    </div>
  )
}
