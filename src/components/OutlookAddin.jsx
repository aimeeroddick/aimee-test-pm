import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Tabs for navigation
const TAB = {
  MYDAY: 'myday',
  CREATE: 'create',
  UPDATE: 'update',
  LINKED: 'linked',
}

export default function OutlookAddin() {
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [officeReady, setOfficeReady] = useState(false)
  const [officeLoaded, setOfficeLoaded] = useState(false)
  
  // Current tab
  const [activeTab, setActiveTab] = useState(TAB.MYDAY)
  
  // Linked task (for calendar events)
  const [linkedTask, setLinkedTask] = useState(null)
  const [linkMode, setLinkMode] = useState('create') // 'create' or 'existing'
  
  // Item data from Outlook
  const [itemData, setItemData] = useState({
    subject: '',
    sender: '',
    body: '',
    start: null,
    end: null,
    isAppointment: false,
    messageId: '',
    itemId: '', // Unique ID for calendar events
  })
  
  // Create form
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'todo',
    critical: false,
    due_date: '',
  })
  
  // Update mode
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [noteText, setNoteText] = useState('')
  
  // Expanded task in My Day
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  // Get mode from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMode = params.get('mode')
    if (urlMode === 'myday') {
      setActiveTab(TAB.MYDAY)
    } else if (urlMode === 'create') {
      setActiveTab(TAB.CREATE)
    } else if (urlMode === 'update') {
      setActiveTab(TAB.UPDATE)
    }
  }, [])

  // Dynamically load Office.js
  useEffect(() => {
    const loadOfficeJs = () => {
      if (typeof Office !== 'undefined') {
        setOfficeLoaded(true)
        return
      }
      
      const script = document.createElement('script')
      script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'
      script.onload = () => setOfficeLoaded(true)
      script.onerror = () => setOfficeLoaded(true)
      document.head.appendChild(script)
    }
    
    loadOfficeJs()
  }, [])

  // Initialize Office.js and get item data
  useEffect(() => {
    if (!officeLoaded) return
    
    const initOffice = () => {
      if (typeof Office !== 'undefined' && Office.onReady) {
        Office.onReady((info) => {
          setOfficeReady(true)
          
          if (info.host === Office.HostType.Outlook) {
            const item = Office.context.mailbox.item
            if (item) {
              extractItemData(item)
            }
          }
        })
      } else {
        setOfficeReady(true)
      }
    }
    
    initOffice()
  }, [officeLoaded])
  
  // Extract data from the current item (email or appointment)
  const extractItemData = (item) => {
    const itemType = item.itemType
    const isAppointment = itemType === Office.MailboxEnums?.ItemType?.Appointment
    
    // Get the unique item ID
    const itemId = item.itemId || ''
    
    if (isAppointment) {
      const subject = item.subject || ''
      const start = item.start
      const end = item.end
      
      setItemData({
        subject,
        sender: '',
        body: '',
        start,
        end,
        isAppointment: true,
        messageId: '',
        itemId,
      })
      
      // Pre-fill create form with meeting time
      setFormData(prev => ({
        ...prev,
        title: subject,
        due_date: start ? new Date(start).toISOString().split('T')[0] : '',
      }))
    } else {
      const subject = item.subject || ''
      const sender = item.from?.displayName || item.from?.emailAddress || ''
      const senderEmail = item.from?.emailAddress || ''
      const messageId = item.internetMessageId || ''
      
      item.body.getAsync(Office.CoercionType.Text, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          const bodyText = result.value || ''
          
          setItemData({
            subject,
            sender,
            body: bodyText,
            start: null,
            end: null,
            isAppointment: false,
            messageId,
            itemId,
          })
          
          // Pre-fill create form
          setFormData(prev => ({
            ...prev,
            title: subject,
            description: `From: ${sender} <${senderEmail}>`,
          }))
        }
      })
    }
  }

  // Check for linked task when item data changes (calendar events)
  useEffect(() => {
    if (user && itemData.itemId && itemData.isAppointment) {
      checkForLinkedTask(itemData.itemId)
    }
  }, [user, itemData.itemId, itemData.isAppointment])

  // Check if there's a task linked to this calendar event
  const checkForLinkedTask = async (eventId) => {
    if (!eventId) return
    
    try {
      const { data: taskData, error: queryError } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('calendar_event_id', eventId)
        .single()
      
      if (taskData && !queryError) {
        setLinkedTask(taskData)
        // Auto-switch to linked view if we found a linked task
        setActiveTab(TAB.LINKED)
      } else {
        setLinkedTask(null)
      }
    } catch (err) {
      // No linked task found, that's ok
      setLinkedTask(null)
    }
  }

  // Check auth and load data
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setUser(session.user)
          await loadData()
        }
      } catch (err) {
        console.error('Init error:', err)
      }
      
      setLoading(false)
    }
    
    init()
  }, [])

  // Reload data when tab changes
  useEffect(() => {
    if (user && activeTab === TAB.MYDAY) {
      loadMyDayTasks()
    } else if (user && (activeTab === TAB.UPDATE || activeTab === TAB.CREATE)) {
      loadAllTasks()
    }
  }, [activeTab, user])

  const loadData = async () => {
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (projectsData && projectsData.length > 0) {
      setProjects(projectsData)
      setFormData(prev => ({ ...prev, project_id: projectsData[0].id }))
    }

    await loadMyDayTasks()
    await loadAllTasks()
  }

  const loadMyDayTasks = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      const { data: tasksData, error: queryError } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .or(`my_day_date.eq.${today},due_date.eq.${today}`)
        .neq('status', 'done')
        .order('critical', { ascending: false })
        .order('due_date', { ascending: true })
      
      if (!queryError && tasksData) {
        setTasks(tasksData)
      }
    } catch (err) {
      console.error('loadMyDayTasks error:', err)
    }
  }

  const loadAllTasks = async () => {
    try {
      const { data: tasksData, error: queryError } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .neq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(100)
      
      if (!queryError && tasksData) {
        setAllTasks(tasksData)
      }
    } catch (err) {
      console.error('loadAllTasks error:', err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    
    const form = new FormData(e.target)
    const email = form.get('email')
    const password = form.get('password')
    
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (authError) {
      setError(authError.message)
      setSaving(false)
      return
    }
    
    setUser(data.user)
    await loadData()
    setSaving(false)
  }

  // Create new task (with optional calendar link)
  const handleCreateTask = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    
    try {
      let notes = ''
      if (itemData.isAppointment) {
        notes = `Meeting: ${itemData.subject}\nDate: ${itemData.start ? new Date(itemData.start).toLocaleString() : 'N/A'}`
      } else {
        const bodyPreview = itemData.body?.substring(0, 500) || ''
        notes = `Email from: ${itemData.sender}\nSubject: ${itemData.subject}\n\n${bodyPreview}${itemData.body?.length > 500 ? '...' : ''}`
      }
      
      const taskData = {
        title: formData.title,
        description: formData.description,
        project_id: formData.project_id,
        status: formData.status,
        critical: formData.critical,
        due_date: formData.due_date || null,
        source: itemData.isAppointment ? 'meeting' : 'email',
        source_link: itemData.messageId || null,
        notes: notes,
        energy_level: 'medium',
      }
      
      // Link to calendar event if it's an appointment
      if (itemData.isAppointment && itemData.itemId) {
        taskData.calendar_event_id = itemData.itemId
        // Also set start/end times from the meeting
        if (itemData.start) {
          taskData.start_time = new Date(itemData.start).toTimeString().slice(0, 5)
        }
        if (itemData.end) {
          taskData.end_time = new Date(itemData.end).toTimeString().slice(0, 5)
        }
      }
      
      const { data: newTask, error: insertError } = await supabase
        .from('tasks')
        .insert(taskData)
        .select('*, projects(name)')
        .single()
      
      if (insertError) throw insertError
      
      // Set as linked task if calendar event
      if (itemData.isAppointment && newTask) {
        setLinkedTask(newTask)
      }
      
      setSuccess(true)
      await loadMyDayTasks()
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Link existing task to calendar event
  const handleLinkTask = async (task) => {
    if (!itemData.itemId || !itemData.isAppointment) return
    
    setSaving(true)
    setError(null)
    
    try {
      const updateData = {
        calendar_event_id: itemData.itemId,
        updated_at: new Date().toISOString(),
      }
      
      // Also update times from meeting
      if (itemData.start) {
        updateData.start_time = new Date(itemData.start).toTimeString().slice(0, 5)
        updateData.due_date = new Date(itemData.start).toISOString().split('T')[0]
      }
      if (itemData.end) {
        updateData.end_time = new Date(itemData.end).toTimeString().slice(0, 5)
      }
      
      const { data: updatedTask, error: updateError } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id)
        .select('*, projects(name)')
        .single()
      
      if (updateError) throw updateError
      
      setLinkedTask(updatedTask)
      setActiveTab(TAB.LINKED)
      setSelectedTask(null)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Mark linked task as done
  const handleMarkDone = async () => {
    if (!linkedTask) return
    
    setSaving(true)
    
    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: 'done',
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkedTask.id)
      
      if (updateError) throw updateError
      
      setLinkedTask({ ...linkedTask, status: 'done' })
      setSuccess(true)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Unlink task from calendar event
  const handleUnlink = async () => {
    if (!linkedTask) return
    
    setSaving(true)
    
    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          calendar_event_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkedTask.id)
      
      if (updateError) throw updateError
      
      setLinkedTask(null)
      setActiveTab(TAB.CREATE)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Update existing task with note
  const handleUpdateTask = async () => {
    if (!selectedTask) return
    
    setSaving(true)
    setError(null)
    
    try {
      const timestamp = new Date().toLocaleString()
      let newNote = `\n\n--- ${timestamp} ---\n`
      
      if (itemData.isAppointment) {
        newNote += `📅 Meeting: ${itemData.subject}\n`
      } else {
        newNote += `📧 Email from: ${itemData.sender}\nSubject: ${itemData.subject}\n`
      }
      
      if (noteText.trim()) {
        newNote += `\n${noteText.trim()}`
      }
      
      const updatedNotes = (selectedTask.notes || '') + newNote
      
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTask.id)
      
      if (updateError) throw updateError
      
      setSuccess(true)
      setSelectedTask(null)
      setNoteText('')
      await loadMyDayTasks()
      await loadAllTasks()
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  
  // Toggle task completion
  const handleToggleComplete = async (task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id)
    
    if (!error) {
      if (newStatus === 'done') {
        setTasks(prev => prev.filter(t => t.id !== task.id))
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
      }
    }
  }

  // Toggle My Day
  const handleToggleMyDay = async (task) => {
    const today = new Date().toISOString().split('T')[0]
    const isInMyDay = task.my_day_date === today
    const newMyDayDate = isInMyDay ? null : today
    
    const { error } = await supabase
      .from('tasks')
      .update({ my_day_date: newMyDayDate })
      .eq('id', task.id)
    
    if (!error) {
      await loadMyDayTasks()
    }
  }

  const handleReset = () => {
    setSuccess(false)
    setSelectedTask(null)
    setNoteText('')
    setFormData(prev => ({
      ...prev,
      title: itemData.subject || '',
      description: itemData.sender ? `From: ${itemData.sender}` : '',
      critical: false,
      due_date: '',
    }))
  }
  
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Today'
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'
    
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    return timeStr.slice(0, 5)
  }

  const getTodayFormatted = () => {
    return new Date().toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    })
  }
  
  const filteredTasks = searchQuery.trim() 
    ? allTasks.filter(t => 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.projects?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allTasks.slice(0, 10)

  // Loading state
  if (loading || !officeReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  // Login form
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
        <div className="text-center mb-6 pt-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">Trackli</h1>
          <p className="text-sm text-gray-500">Track. Manage. Deliver.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm disabled:opacity-50"
            >
              {saving ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {linkedTask?.status === 'done' ? 'Task Completed!' : activeTab === TAB.UPDATE ? 'Task Updated!' : 'Task Created!'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {linkedTask?.status === 'done' ? 'Marked as done in Trackli' : activeTab === TAB.UPDATE ? 'Note added successfully' : 'Added to Trackli'}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => { setActiveTab(TAB.MYDAY); setSuccess(false) }}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-medium text-sm"
            >
              View My Day
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const myDayTasks = tasks.filter(t => t.my_day_date === today)
  const dueTodayTasks = tasks.filter(t => t.due_date === today && t.my_day_date !== today)

  // Main app with tabs
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 pt-3 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="font-bold text-gray-800 text-sm">Trackli</span>
        </div>
        
        {/* Tab navigation */}
        <div className="flex flex-wrap">
          <button
            onClick={() => setActiveTab(TAB.MYDAY)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === TAB.MYDAY
                ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            My Day
          </button>
          
          {/* Show Linked tab when there's a linked task or viewing calendar event */}
          {(linkedTask || itemData.isAppointment) && (
            <button
              onClick={() => setActiveTab(TAB.LINKED)}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                activeTab === TAB.LINKED
                  ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {linkedTask ? 'Linked' : 'Link'}
              {linkedTask && <span className="ml-1 w-2 h-2 rounded-full bg-green-500"></span>}
            </button>
          )}
          
          <button
            onClick={() => setActiveTab(TAB.CREATE)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === TAB.CREATE
                ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </button>
          <button
            onClick={() => setActiveTab(TAB.UPDATE)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === TAB.UPDATE
                ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Update
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        
        {/* LINKED TAB - For calendar events */}
        {activeTab === TAB.LINKED && (
          <div className="p-4">
            {/* Meeting context */}
            {itemData.subject && itemData.isAppointment && (
              <div className="mb-4 p-3 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Meeting</span>
                  {itemData.start && (
                    <span className="text-gray-400">
                      • {new Date(itemData.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {itemData.end && ` - ${new Date(itemData.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800">{itemData.subject}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            {linkedTask ? (
              /* Show linked task with actions */
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-sm font-medium text-green-700">Linked Task</span>
                </div>
                
                <div className={`p-4 rounded-xl border-2 ${linkedTask.status === 'done' ? 'bg-gray-50 border-gray-200' : 'bg-indigo-50 border-indigo-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      linkedTask.status === 'done' 
                        ? 'bg-green-500 border-green-500' 
                        : 'border-gray-300'
                    }`}>
                      {linkedTask.status === 'done' && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${linkedTask.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {linkedTask.critical && <span className="text-red-500 mr-1">🚩</span>}
                        {linkedTask.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {linkedTask.projects?.name && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                            {linkedTask.projects.name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{linkedTask.status.replace('_', ' ')}</span>
                        {linkedTask.start_time && (
                          <span className="text-xs text-gray-400">
                            {formatTime(linkedTask.start_time)}
                            {linkedTask.end_time && ` - ${formatTime(linkedTask.end_time)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {linkedTask.status !== 'done' ? (
                  <button
                    onClick={handleMarkDone}
                    disabled={saving}
                    className="mt-4 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {saving ? 'Marking...' : 'Mark as Done'}
                  </button>
                ) : (
                  <div className="mt-4 p-3 bg-green-50 rounded-xl text-center">
                    <p className="text-sm text-green-700 font-medium">✓ Task completed</p>
                  </div>
                )}
                
                <button
                  onClick={handleUnlink}
                  disabled={saving}
                  className="mt-2 w-full py-2 text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  Unlink from this meeting
                </button>
              </div>
            ) : (
              /* No linked task - show options to create or link */
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <p className="text-sm text-gray-600 mb-4">No task linked to this meeting yet.</p>
                  
                  {/* Toggle between create and link existing */}
                  <div className="flex rounded-lg bg-gray-100 p-1 mb-4">
                    <button
                      onClick={() => setLinkMode('create')}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                        linkMode === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Create New
                    </button>
                    <button
                      onClick={() => setLinkMode('existing')}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                        linkMode === 'existing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Link Existing
                    </button>
                  </div>

                  {linkMode === 'create' ? (
                    <form onSubmit={handleCreateTask} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                        <input
                          type="text"
                          required
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                        <select
                          value={formData.project_id}
                          onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={saving || !formData.title || !formData.project_id}
                        className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm disabled:opacity-50"
                      >
                        {saving ? 'Creating...' : 'Create & Link Task'}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      />
                      
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {filteredTasks.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No tasks found</p>
                        ) : (
                          filteredTasks.map(task => (
                            <button
                              key={task.id}
                              onClick={() => handleLinkTask(task)}
                              disabled={saving}
                              className="w-full p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left disabled:opacity-50"
                            >
                              <p className="text-sm font-medium text-gray-800 truncate">
                                {task.critical && <span className="text-red-500 mr-1">🚩</span>}
                                {task.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {task.projects?.name && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                                    {task.projects.name}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MY DAY TAB */}
        {activeTab === TAB.MYDAY && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-800">My Day</h2>
              <p className="text-sm text-gray-500">{getTodayFormatted()}</p>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm mb-1">No tasks for today</p>
                <p className="text-xs text-gray-400">Add tasks to My Day in Trackli</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myDayTasks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">My Day</span>
                      <span className="text-xs text-gray-400">({myDayTasks.length})</span>
                    </div>
                    <div className="space-y-2">
                      {myDayTasks.map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          expanded={expandedTaskId === task.id}
                          onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                          onToggleComplete={handleToggleComplete}
                          onToggleMyDay={handleToggleMyDay}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {dueTodayTasks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Due Today</span>
                      <span className="text-xs text-gray-400">({dueTodayTasks.length})</span>
                    </div>
                    <div className="space-y-2">
                      {dueTodayTasks.map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          expanded={expandedTaskId === task.id}
                          onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                          onToggleComplete={handleToggleComplete}
                          onToggleMyDay={handleToggleMyDay}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={loadMyDayTasks}
              className="mt-4 w-full py-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        )}
        
        {/* CREATE TAB */}
        {activeTab === TAB.CREATE && (
          <div className="p-4">
            {itemData.subject && (
              <div className="mb-4 p-3 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  {itemData.isAppointment ? (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Meeting</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email from {itemData.sender}</>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">{itemData.subject}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  placeholder="What needs to be done?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.critical}
                    onChange={(e) => setFormData(prev => ({ ...prev, critical: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">🚩 Critical Task</span>
                </label>
              </div>

              {itemData.isAppointment && (
                <p className="text-xs text-gray-500 bg-indigo-50 p-2 rounded-lg">
                  📅 This task will be linked to this calendar event
                </p>
              )}

              <button
                type="submit"
                disabled={saving || !formData.title || !formData.project_id}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm disabled:opacity-50"
              >
                {saving ? 'Creating...' : itemData.isAppointment ? 'Create & Link Task' : 'Create Task'}
              </button>
            </form>
          </div>
        )}
        
        {/* UPDATE TAB */}
        {activeTab === TAB.UPDATE && (
          <div className="p-4">
            {itemData.subject && (
              <div className="mb-4 p-3 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  {itemData.isAppointment ? (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Meeting</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email from {itemData.sender}</>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">{itemData.subject}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            {!selectedTask ? (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select a task to update</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm mb-3"
                />
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredTasks.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No tasks found</p>
                  ) : (
                    filteredTasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="w-full p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
                      >
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {task.critical && <span className="text-red-500 mr-1">🚩</span>}
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.projects?.name && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                              {task.projects.name}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{task.status.replace('_', ' ')}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-800">Adding note to:</p>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="text-xs text-indigo-600 hover:text-indigo-700"
                  >
                    Change
                  </button>
                </div>
                
                <div className="p-3 bg-indigo-50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-indigo-900">
                    {selectedTask.critical && <span className="text-red-500 mr-1">🚩</span>}
                    {selectedTask.title}
                  </p>
                  {selectedTask.projects?.name && (
                    <span className="text-xs text-indigo-600">{selectedTask.projects.name}</span>
                  )}
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Add a note (optional)</label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add any additional context..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-none"
                  />
                </div>
                
                <p className="text-xs text-gray-500 mb-4">
                  The {itemData.isAppointment ? 'meeting' : 'email'} details will be automatically attached.
                </p>
                
                <button
                  onClick={handleUpdateTask}
                  disabled={saving}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update Task'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Task Card Component
function TaskCard({ task, expanded, onToggleExpand, onToggleComplete, onToggleMyDay, formatDate }) {
  const today = new Date().toISOString().split('T')[0]
  const isInMyDay = task.my_day_date === today
  const isOverdue = task.due_date && task.due_date < today
  
  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border transition-all ${
        task.critical ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'
      }`}
    >
      <div 
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(task) }}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.status === 'done' 
              ? 'bg-green-500 border-green-500 text-white' 
              : 'border-gray-300 hover:border-indigo-500'
          }`}
        >
          {task.status === 'done' && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {task.critical && <span className="text-red-500 mr-1">🚩</span>}
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {task.projects?.name && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                {task.projects.name}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {formatDate(task.due_date)}
              </span>
            )}
            {task.calendar_event_id && (
              <span className="text-xs text-green-500" title="Linked to calendar">
                📅
              </span>
            )}
          </div>
        </div>

        <svg 
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100">
          <div className="pt-2 space-y-2">
            {task.description && (
              <p className="text-xs text-gray-500">{task.description}</p>
            )}
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleMyDay(task)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                  isInMyDay 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                {isInMyDay ? 'In My Day' : 'Add to My Day'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
