import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  { id: 'meeting_followup', label: 'Meeting Follow-up' },
  { id: 'email', label: 'Email' },
  { id: 'deliverable', label: 'Deliverable' },
  { id: 'admin', label: 'Admin' },
  { id: 'review', label: 'Review/Approval' },
  { id: 'call', label: 'Call/Meeting' },
  { id: 'research', label: 'Research' },
]

// Modes from URL parameter
const MODE = {
  MYDAY: 'myday',
  EMAIL: 'email',
  FOLLOWUPS: 'followups',
  AGENDA: 'agenda',
  NOTES: 'notes',
}

// Tabs
const TAB = {
  MYDAY: 'myday',
  CREATE: 'create',
}

export default function OutlookAddin() {
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [officeReady, setOfficeReady] = useState(false)
  const [officeLoaded, setOfficeLoaded] = useState(false)
  
  // Current tab
  const [activeTab, setActiveTab] = useState(TAB.MYDAY)
  
  // Mode from URL (for create tab)
  const [mode, setMode] = useState(MODE.EMAIL)
  
  // Item data from Outlook
  const [itemData, setItemData] = useState({
    subject: '',
    sender: '',
    body: '',
    start: null,
    end: null,
    isAppointment: false,
  })
  
  // For follow-ups extraction
  const [extractedTasks, setExtractedTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [hasExtracted, setHasExtracted] = useState(false)
  
  // Expanded task in My Day
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'todo',
    critical: false,
    start_date: '',
    due_date: '',
    category: 'email',
    source: 'email',
    source_link: '',
    customer: '',
    notes: '',
  })

  // Get mode from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMode = params.get('mode')
    if (urlMode && Object.values(MODE).includes(urlMode)) {
      setMode(urlMode)
      if (urlMode === MODE.MYDAY) {
        setActiveTab(TAB.MYDAY)
      } else {
        setActiveTab(TAB.CREATE)
      }
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
      })
      
      const meetingDate = start ? new Date(start) : new Date()
      
      if (mode === MODE.AGENDA) {
        const agendaDue = new Date(meetingDate)
        agendaDue.setDate(agendaDue.getDate() - 1)
        setFormData(prev => ({
          ...prev,
          title: `Send Agenda: ${subject}`,
          category: 'meeting_followup',
          source: 'meeting',
          due_date: agendaDue.toISOString().split('T')[0],
        }))
      } else if (mode === MODE.NOTES) {
        setFormData(prev => ({
          ...prev,
          title: `Send Notes/Follow-ups: ${subject}`,
          category: 'meeting_followup',
          source: 'meeting',
          due_date: meetingDate.toISOString().split('T')[0],
        }))
      }
    } else {
      const subject = item.subject || ''
      const sender = item.from?.displayName || item.from?.emailAddress || ''
      const senderEmail = item.from?.emailAddress || ''
      
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
          })
          
          if (mode === MODE.EMAIL) {
            const bodyPreview = bodyText.substring(0, 1000)
            setFormData(prev => ({
              ...prev,
              title: subject,
              category: 'email',
              source: 'email',
              notes: `From: ${sender} <${senderEmail}>\n\n${bodyPreview}${bodyText.length > 1000 ? '\n\n[Truncated...]' : ''}`
            }))
          } else if (mode === MODE.FOLLOWUPS) {
            setFormData(prev => ({
              ...prev,
              category: 'meeting_followup',
              source: 'meeting',
            }))
          } else if (mode === MODE.AGENDA) {
            setFormData(prev => ({
              ...prev,
              title: `Send Agenda: ${subject}`,
              category: 'meeting_followup',
              source: 'email',
              due_date: new Date().toISOString().split('T')[0],
            }))
          } else if (mode === MODE.NOTES) {
            setFormData(prev => ({
              ...prev,
              title: `Send Notes/Follow-ups: ${subject}`,
              category: 'meeting_followup',
              source: 'email',
              due_date: new Date().toISOString().split('T')[0],
            }))
          }
        }
      })
      
      if (item.internetMessageId) {
        setFormData(prev => ({ ...prev, source_link: item.internetMessageId }))
      }
    }
  }

  // Check auth and load data
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        setUser(session.user)
        await loadData()
      }
      
      setLoading(false)
    }
    
    init()
  }, [])

  const loadData = async () => {
    // Load projects
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (projectsData && projectsData.length > 0) {
      const projectsWithCustomers = await Promise.all(
        projectsData.map(async (project) => {
          const { data: customers } = await supabase
            .from('project_customers')
            .select('name')
            .eq('project_id', project.id)
          
          return {
            ...project,
            customers: customers?.map(c => c.name) || [],
          }
        })
      )
      
      setProjects(projectsWithCustomers)
      setFormData(prev => ({ ...prev, project_id: projectsWithCustomers[0].id }))
    }

    // Load tasks for My Day
    await loadTasks()
  }

  const loadTasks = async () => {
    const today = new Date().toISOString().split('T')[0]
    
    // Get tasks that are in My Day OR due today
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*, projects(name, color)')
      .or(`my_day_date.eq.${today},due_date.eq.${today}`)
      .neq('status', 'done')
      .order('critical', { ascending: false })
      .order('due_date', { ascending: true })
    
    if (!tasksError && tasksData) {
      setTasks(tasksData)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    
    try {
      const { error: insertError } = await supabase
        .from('tasks')
        .insert({
          title: formData.title,
          description: formData.description,
          project_id: formData.project_id,
          status: formData.status,
          critical: formData.critical,
          start_date: formData.start_date || null,
          due_date: formData.due_date || null,
          category: formData.category,
          source: formData.source || 'email',
          source_link: formData.source_link || null,
          customer: formData.customer || null,
          notes: formData.notes || null,
          energy_level: 'medium',
        })
      
      if (insertError) throw insertError
      
      setSuccess(true)
      await loadTasks() // Refresh tasks
      
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
        // Remove from list with animation
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
      await loadTasks()
    }
  }

  // Extract follow-ups from email body
  const handleExtractFollowUps = () => {
    if (!itemData.body) return
    
    setIsExtracting(true)
    
    setTimeout(() => {
      const extracted = extractActionItems(itemData.body)
      setExtractedTasks(extracted)
      setHasExtracted(true)
      setIsExtracting(false)
    }, 300)
  }
  
  // Action item extraction (same logic as main app)
  const extractActionItems = (notesText) => {
    const tableResult = extractFromFollowUpTable(notesText)
    if (tableResult.length > 0) return tableResult
    return extractFromPatterns(notesText.split('\n'))
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
          delimiter = '|'
          break
        }
      }
      
      if (line.includes('\t') && (line.includes('follow') || line.includes('action') || line.includes('task'))) {
        const cells = lines[i].split('\t').map(c => c.trim().toLowerCase())
        
        for (let j = 0; j < cells.length; j++) {
          const cell = cells[j]
          if (cell.includes('follow') || cell.includes('action') || cell.includes('task')) {
            columnIndices.followUp = j
          } else if (cell.includes('owner') || cell.includes('assignee')) {
            columnIndices.owner = j
          } else if (cell.includes('due') || cell.includes('date')) {
            columnIndices.dueDate = j
          } else if (cell.includes('status')) {
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
    
    if (headerRowIndex === -1 || columnIndices.followUp === -1) return []
    
    let startRow = headerRowIndex + 1
    if (startRow < lines.length && /^[\s|:-]+$/.test(lines[startRow].replace(/\t/g, ''))) {
      startRow++
    }
    
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || (!line.includes(delimiter) && delimiter === '|')) {
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
      
      const isCritical = /urgent|asap|critical|important|high/i.test(followUp) ||
                       /urgent|asap|critical|important|high/i.test(status)
      
      actionItems.push({
        id: `extracted-table-${i}`,
        title: followUp.charAt(0).toUpperCase() + followUp.slice(1),
        assignee: owner,
        dueDate: new Date().toISOString().split('T')[0],
        selected: true,
        critical: isCritical,
      })
    }
    
    return actionItems
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
          } else if (pattern.toString().includes('@|assigned')) {
            assignee = match[1]?.trim() || ''
            taskTitle = match[2]?.trim() || ''
          } else {
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
      
      if (matched && taskTitle.length > 3) {
        taskTitle = taskTitle
          .replace(/^[-*•]\s*\[?\s*\]?\s*/, '')
          .replace(/^\d+[.)]\s*/, '')
          .replace(/^(?:action|todo|task|ai|action item|follow[ -]?up)[:\s]*/i, '')
          .trim()
        
        if (taskTitle.length > 3) {
          actionItems.push({
            id: `extracted-${i}`,
            title: taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1),
            assignee: assignee,
            dueDate: new Date().toISOString().split('T')[0],
            selected: true,
            critical: /urgent|asap|critical|important/i.test(taskTitle),
          })
        }
      }
    }
    
    return actionItems
  }
  
  // Create extracted tasks
  const handleCreateExtractedTasks = async () => {
    const selectedTasks = extractedTasks.filter(t => t.selected)
    if (selectedTasks.length === 0) return
    
    setSaving(true)
    setError(null)
    
    try {
      for (const task of selectedTasks) {
        const { error: insertError } = await supabase
          .from('tasks')
          .insert({
            title: task.title,
            description: itemData.subject ? `From: ${itemData.subject}` : '',
            project_id: formData.project_id,
            status: 'todo',
            critical: task.critical,
            start_date: null,
            due_date: task.dueDate || null,
            assignee: task.assignee || null,
            category: 'meeting_followup',
            source: 'meeting',
            source_link: formData.source_link || null,
            customer: formData.customer || null,
            notes: null,
            energy_level: 'medium',
          })
        
        if (insertError) throw insertError
      }
      
      setSuccess(true)
      await loadTasks()
      
    } catch (err) {
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

  const handleCreateAnother = () => {
    setSuccess(false)
    setHasExtracted(false)
    setExtractedTasks([])
    setFormData(prev => ({
      ...prev,
      title: '',
      description: '',
      critical: false,
      start_date: '',
      due_date: '',
      customer: '',
      notes: '',
    }))
  }

  const selectedProject = projects.find(p => p.id === formData.project_id)
  
  // Format date for display
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

  // Get today's date formatted
  const getTodayFormatted = () => {
    return new Date().toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    })
  }

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
        <p className="text-sm text-gray-500 mb-4 text-center">Sign in to view and create tasks</p>
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

  // Success state (for create tab)
  if (success && activeTab === TAB.CREATE) {
    const taskCount = mode === MODE.FOLLOWUPS ? extractedTasks.filter(t => t.selected).length : 1
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {taskCount > 1 ? `${taskCount} Tasks Created!` : 'Task Created!'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">Added to Trackli</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => { setActiveTab(TAB.MYDAY); setSuccess(false) }}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-medium text-sm"
            >
              View My Day
            </button>
            <button
              onClick={handleCreateAnother}
              className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Separate My Day tasks and Due Today tasks
  const today = new Date().toISOString().split('T')[0]
  const myDayTasks = tasks.filter(t => t.my_day_date === today)
  const dueTodayTasks = tasks.filter(t => t.due_date === today && t.my_day_date !== today)

  // Main app with tabs
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col">
      {/* Header with tabs */}
      <div className="bg-white border-b border-gray-200 px-4 pt-3 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="font-bold text-gray-800">Trackli</span>
        </div>
        
        {/* Tab navigation */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab(TAB.MYDAY)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === TAB.MYDAY
                ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            My Day
          </button>
          <button
            onClick={() => setActiveTab(TAB.CREATE)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === TAB.CREATE
                ? 'bg-gradient-to-br from-slate-50 to-indigo-50 text-indigo-600 border-t border-l border-r border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === TAB.MYDAY ? (
          /* My Day Tab */
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-800">My Day</h2>
              <p className="text-sm text-gray-500">{getTodayFormatted()}</p>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 mb-1">No tasks for today</p>
                <p className="text-sm text-gray-400">Add tasks to My Day in Trackli</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* My Day Tasks */}
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

                {/* Due Today Tasks (not in My Day) */}
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

            {/* Refresh button */}
            <button
              onClick={loadTasks}
              className="mt-4 w-full py-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        ) : (
          /* Create Tab */
          <div className="p-4">
            {/* Mode selector if not from URL */}
            {!new URLSearchParams(window.location.search).get('mode') && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Create task from...</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: MODE.EMAIL, label: 'Email', icon: '✉️' },
                    { id: MODE.FOLLOWUPS, label: 'Follow-ups', icon: '📋' },
                    { id: MODE.AGENDA, label: 'Send Agenda', icon: '📄' },
                    { id: MODE.NOTES, label: 'Send Notes', icon: '📝' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`p-2 rounded-lg text-sm font-medium transition-all ${
                        mode === m.id
                          ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                          : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                      }`}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-ups extraction mode */}
            {mode === MODE.FOLLOWUPS ? (
              <div>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                  </div>
                )}
                
                <div className="bg-white rounded-xl p-4 mb-4 shadow-sm">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Add tasks to project</label>
                  <select
                    value={formData.project_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                {!hasExtracted ? (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-600 mb-4">
                      Click below to scan for follow-up items.
                    </p>
                    <button
                      onClick={handleExtractFollowUps}
                      disabled={isExtracting || !itemData.body}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isExtracting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Scanning...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Extract Follow-ups
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    {extractedTasks.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-gray-500 mb-2">No follow-up items found.</p>
                        <p className="text-sm text-gray-400">Try an email with action items.</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-700 mb-3">
                          Found {extractedTasks.length} follow-up{extractedTasks.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                          {extractedTasks.map((task) => (
                            <div 
                              key={task.id}
                              className={`p-3 rounded-lg border ${
                                task.selected ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-100 opacity-60'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={task.selected}
                                  onChange={(e) => updateExtractedTask(task.id, 'selected', e.target.checked)}
                                  className="mt-1 w-4 h-4 rounded border-gray-300 text-indigo-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) => updateExtractedTask(task.id, 'title', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                                  />
                                </div>
                                <button
                                  onClick={() => removeExtractedTask(task.id)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <button
                          onClick={handleCreateExtractedTasks}
                          disabled={extractedTasks.filter(t => t.selected).length === 0 || saving}
                          className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
                        >
                          {saving ? 'Creating...' : `Create ${extractedTasks.filter(t => t.selected).length} Task(s)`}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Standard task form */
              <div>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
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
                      onChange={(e) => setFormData(prev => ({ ...prev, project_id: e.target.value, customer: '' }))}
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

                  <button
                    type="submit"
                    disabled={saving || !formData.title || !formData.project_id}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium text-sm disabled:opacity-50"
                  >
                    {saving ? 'Creating...' : 'Create Task'}
                  </button>
                </form>
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
        {/* Checkbox */}
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

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {task.critical && <span className="text-red-500 mr-1">🚩</span>}
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {task.projects?.name && (
              <span 
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ 
                  backgroundColor: `${task.projects.color}20`,
                  color: task.projects.color 
                }}
              >
                {task.projects.name}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {formatDate(task.due_date)}
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <svg 
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
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
              
              {task.assignee && (
                <span className="text-xs text-gray-400">
                  👤 {task.assignee}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
