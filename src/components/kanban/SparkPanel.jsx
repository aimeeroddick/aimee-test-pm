import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import * as chrono from 'chrono-node'

// Track Spark query analytics - helps understand what's falling through to Claude
const trackSparkQuery = async (query, handler, success) => {
  try {
    // Log to console for immediate visibility
    console.log(`Spark Analytics: query="${query.substring(0, 50)}" handler=${handler} success=${success}`)
    
    // Store in Supabase for analysis
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await supabase.from('spark_analytics').insert({
        user_id: session.user.id,
        query_text: query.substring(0, 200), // Truncate for storage
        handler: handler, // 'local' or 'claude'
        success: success,
        created_at: new Date().toISOString()
      }).catch(() => {}) // Silently fail - analytics shouldn't break the app
    }
  } catch (e) {
    // Silently fail - don't let analytics break the user experience
  }
}

// Frontend query handler - handles simple queries without API calls
const handleLocalQuery = (input, tasks, projects, dateFormat) => {
  const query = input.toLowerCase().trim()
  const today = new Date().toISOString().split('T')[0]
  const isUSFormat = dateFormat === 'MM/DD/YYYY'
  
  // Get active tasks (not done)
  const activeTasks = tasks.filter(t => t.status !== 'done')
  
  // Helper to format task for display
  const formatTask = (task, index) => {
    const project = projects.find(p => p.id === task.project_id)
    return `${index + 1}. ${task.title} (${project?.name || 'Unknown'}) - ${task.status.replace('_', ' ')}`
  }
  
  // Helper to format results
  const formatResults = (matchingTasks, queryDescription) => {
    if (matchingTasks.length === 0) {
      return { response: `No tasks ${queryDescription}.`, tasks: [], handled: true }
    }
    
    const displayTasks = matchingTasks.slice(0, 5)
    const taskList = displayTasks.map((t, i) => formatTask(t, i)).join('\n')
    
    let response = `You have ${matchingTasks.length} task${matchingTasks.length === 1 ? '' : 's'} ${queryDescription}:`
    if (matchingTasks.length > 5) {
      response = `You have ${matchingTasks.length} tasks ${queryDescription}. Here are the first 5:`
    }
    response += `\n${taskList}`
    
    if (matchingTasks.length > 5) {
      response += `\n\nWould you like to see more or update any of these?`
    }
    
    return { response, tasks: matchingTasks, handled: true }
  }
  
  // Parse date from natural language using chrono
  const parseDate = (text) => {
    const referenceDate = new Date()
    const results = chrono.parse(text, referenceDate, { forwardDate: true })
    if (results.length > 0) {
      return results[0].start.date().toISOString().split('T')[0]
    }
    return null
  }
  
  // Common query starters - matches "what's", "show", "list", "give me", "any", "do I have", etc.
  const queryStarter = /^(what'?s?|show|list|give\s*me|any|do\s*i\s*have|are\s*there|get|find|display|view|see)\s*(my|the|all)?\s*/i
  
  // ==== DUE TODAY ====
  // "what's due today", "show tasks due today", "today's tasks", "tasks for today", "anything due today"
  if (/\b(due|for|tasks?)\s*today\b/i.test(query) || 
      /\btoday'?s\s*(tasks?|work|stuff|things)\b/i.test(query) ||
      /\b(anything|something|stuff|things)\s*(due|for)\s*today\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.due_date === today)
    return formatResults(matching, 'due today')
  }
  
  // ==== OVERDUE ====
  // "what's overdue", "overdue tasks", "past due", "late tasks", "missed deadlines"
  if (/\boverdue\b/i.test(query) || 
      /\bpast\s*due\b/i.test(query) ||
      /\blate\s*(tasks?)?\b/i.test(query) ||
      /\bmissed\s*(deadlines?|due\s*dates?)\b/i.test(query) ||
      /\bbehind\s*(schedule|on)?\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.due_date && t.due_date < today)
    return formatResults(matching, 'overdue')
  }
  
  // ==== DUE TOMORROW ====
  // "what's due tomorrow", "tomorrow's tasks", "tasks for tomorrow"
  if (/\b(due|for|tasks?)\s*tomorrow\b/i.test(query) || 
      /\btomorrow'?s\s*(tasks?|work|stuff|things)\b/i.test(query) ||
      /\b(anything|something)\s*(due|for)\s*tomorrow\b/i.test(query)) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const matching = activeTasks.filter(t => t.due_date === tomorrow)
    return formatResults(matching, 'due tomorrow')
  }
  
  // ==== DUE THIS WEEK ====
  // "what's due this week", "this week's tasks", "tasks for this week"
  if (/\b(due|for)?\s*(this\s*)?week\b/i.test(query) ||
      /\bweekly\s*(tasks?|work)\b/i.test(query) ||
      /\bthis\s*week'?s?\s*(tasks?|work|stuff)\b/i.test(query)) {
    const endOfWeek = new Date()
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
    const endDate = endOfWeek.toISOString().split('T')[0]
    const matching = activeTasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= endDate)
    return formatResults(matching, 'due this week')
  }
  
  // ==== DUE NEXT WEEK ====
  if (/\b(due|for)?\s*next\s*week\b/i.test(query) ||
      /\bnext\s*week'?s?\s*(tasks?|work|stuff)\b/i.test(query)) {
    const startOfNextWeek = new Date()
    startOfNextWeek.setDate(startOfNextWeek.getDate() + (7 - startOfNextWeek.getDay()) + 1)
    const endOfNextWeek = new Date(startOfNextWeek)
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 6)
    const startDate = startOfNextWeek.toISOString().split('T')[0]
    const endDate = endOfNextWeek.toISOString().split('T')[0]
    const matching = activeTasks.filter(t => t.due_date && t.due_date >= startDate && t.due_date <= endDate)
    return formatResults(matching, 'due next week')
  }
  
  // ==== DUE ON SPECIFIC DATE ====
  // "what's due Friday", "due on January 15", "tasks for Monday"
  const dueDateMatch = query.match(/\b(?:due|for)\s*(?:on)?\s*(.+)/i)
  if (dueDateMatch) {
    const dateStr = dueDateMatch[1].trim()
    // Skip if it matches already-handled patterns
    if (!/(today|tomorrow|this\s*week|next\s*week)$/i.test(dateStr)) {
      const parsedDate = parseDate(dateStr)
      if (parsedDate) {
        const matching = activeTasks.filter(t => t.due_date === parsedDate)
        const dateDisplay = new Date(parsedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        return formatResults(matching, `due on ${dateDisplay}`)
      }
    }
  }
  
  // ==== MY DAY ====
  // "what's in my day", "my day tasks", "show my day", "today's plan"
  if (/\b(in\s*)?(my\s*day)\b/i.test(query) ||
      /\bmy\s*day\s*(tasks?|list)?\b/i.test(query) ||
      /\b(today'?s?|daily)\s*(plan|focus|priorities)\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.my_day_date)
    return formatResults(matching, 'in My Day')
  }
  
  // ==== CRITICAL / URGENT ====
  // "what's critical", "urgent tasks", "high priority", "important tasks"
  if (/\b(critical|urgent)\b/i.test(query) ||
      /\bhigh\s*priority\b/i.test(query) ||
      /\bimportant\s*(tasks?)?\b/i.test(query) ||
      /\bpriority\s*(tasks?|items?)\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.critical)
    return formatResults(matching, 'marked as critical')
  }
  
  // ==== IN PROGRESS ====
  // "what am I working on", "in progress", "currently working", "active tasks"
  if (/\b(what('?s|\s*am\s*i)|show)\s*(working\s*on|in\s*progress)\b/i.test(query) ||
      /\bin\s*progress\b/i.test(query) ||
      /\bcurrently\s*(working|doing)\b/i.test(query) ||
      /\bactive\s*(tasks?|work)?\b/i.test(query) ||
      /\bstarted\s*(tasks?)?\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.status === 'in_progress')
    return formatResults(matching, 'in progress')
  }
  
  // ==== BACKLOG ====
  // "what's in backlog", "backlog tasks", "not started"
  if (/\b(in\s*)?backlog\b/i.test(query) ||
      /\bnot\s*started\b/i.test(query) ||
      /\bqueued\b/i.test(query) ||
      /\bwaiting\s*(to\s*start)?\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.status === 'backlog')
    return formatResults(matching, 'in backlog')
  }
  
  // ==== TODO ====
  // "what's todo", "to do list", "tasks to do"
  if (/\b(to\s*do|todo)\s*(list|tasks?)?\b/i.test(query) ||
      /\bready\s*to\s*(start|do)\b/i.test(query) ||
      /\bnot\s*yet\s*started\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.status === 'todo')
    return formatResults(matching, 'to do')
  }
  
  // ==== EFFORT LEVELS ====
  // "high effort tasks", "quick tasks", "easy tasks", "big tasks"
  const effortMatch = query.match(/\b(high|medium|low)\s*(effort|energy)\b/i)
  if (effortMatch) {
    const effort = effortMatch[1].toLowerCase()
    const matching = activeTasks.filter(t => t.energy_level === effort)
    return formatResults(matching, `with ${effort} effort`)
  }
  
  // Quick/easy = low effort
  if (/\b(quick|easy|simple|small|short)\s*(tasks?|ones?)?\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.energy_level === 'low')
    return formatResults(matching, 'that are quick (low effort)')
  }
  
  // Big/complex = high effort
  if (/\b(big|complex|difficult|hard|long)\s*(tasks?|ones?)?\b/i.test(query)) {
    const matching = activeTasks.filter(t => t.energy_level === 'high')
    return formatResults(matching, 'that are complex (high effort)')
  }
  
  // ==== TIME ESTIMATES ====
  // "tasks without time estimates", "no time estimate", "unestimated"
  if (/\b(without|no|missing|need)\s*(time)?\s*(estimate)?s?\b/i.test(query) ||
      /\bunestimated\b/i.test(query) ||
      /\bneed\s*(time)?\s*estimates?\b/i.test(query)) {
    const matching = activeTasks.filter(t => !t.time_estimate)
    return formatResults(matching, 'without time estimates')
  }
  
  // ==== PROJECT TASKS ====
  // "tasks in [project]", "[project] tasks", "show [project]"
  for (const project of projects) {
    const projectNameLower = project.name.toLowerCase()
    // Check if project name appears in query
    if (query.includes(projectNameLower)) {
      // Make sure it's a task query, not something else
      if (/\b(tasks?|show|list|what'?s?|in|for)\b/i.test(query)) {
        const matching = activeTasks.filter(t => t.project_id === project.id)
        return formatResults(matching, `in ${project.name}`)
      }
    }
  }
  
  // ==== ASSIGNED TO ====
  // "tasks assigned to Harry", "Harry's tasks", "my tasks", "assigned to me"
  if (/\b(assigned\s*to\s*me|my\s+tasks?)\b/i.test(query)) {
    // "my tasks" - would need userName, skip for now unless we have it
    // Fall through to Claude
  }
  
  const assigneeMatch = query.match(/\b(?:assigned\s*to|for)\s+([\w]+)/i) || 
                        query.match(/\b([\w]+)'?s\s+tasks?\b/i)
  if (assigneeMatch) {
    const name = assigneeMatch[1].toLowerCase()
    // Skip common words that aren't names
    if (!['my', 'the', 'all', 'any', 'some'].includes(name)) {
      const matching = activeTasks.filter(t => t.assignee && t.assignee.toLowerCase().includes(name))
      return formatResults(matching, `assigned to ${assigneeMatch[1]}`)
    }
  }
  
  // ==== ALL TASKS / EVERYTHING ====
  if (/\b(all|every)\s*(my\s*)?(tasks?|work|stuff)\b/i.test(query) ||
      /\beverything\b/i.test(query) ||
      /\bshow\s*(me\s*)?(all|everything)\b/i.test(query)) {
    return formatResults(activeTasks, 'active (not completed)')
  }
  
  // ==== HOW MANY / COUNT ====
  if (/\bhow\s*many\s*(tasks?)?\b/i.test(query) ||
      /\bcount\s*(of)?\s*(my)?\s*(tasks?)?\b/i.test(query) ||
      /\btask\s*count\b/i.test(query)) {
    const total = activeTasks.length
    const byStatus = {
      todo: activeTasks.filter(t => t.status === 'todo').length,
      in_progress: activeTasks.filter(t => t.status === 'in_progress').length,
      backlog: activeTasks.filter(t => t.status === 'backlog').length
    }
    const overdue = activeTasks.filter(t => t.due_date && t.due_date < today).length
    
    let response = `You have ${total} active tasks:\n`
    response += `• ${byStatus.in_progress} in progress\n`
    response += `• ${byStatus.todo} to do\n`
    response += `• ${byStatus.backlog} in backlog`
    if (overdue > 0) {
      response += `\n\n⚠️ ${overdue} ${overdue === 1 ? 'is' : 'are'} overdue!`
    }
    
    return { response, tasks: [], handled: true }
  }
  
  // No pattern matched - return null to fall back to Claude
  return null
}

// The Spark icon - Joyful Spark with gradient and accent dots
const SparkIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 56 56" fill="none">
    <defs>
      <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F97316"/>
        <stop offset="50%" stopColor="#EC4899"/>
        <stop offset="100%" stopColor="#F97316"/>
      </linearGradient>
    </defs>
    <path d="M28 4C28 4 30 18 32 22C34 26 48 28 48 28C48 28 34 30 32 34C30 38 28 52 28 52C28 52 26 38 24 34C22 30 8 28 8 28C8 28 22 26 24 22C26 18 28 4 28 4Z" fill="url(#sparkGradient)"/>
    <circle cx="44" cy="16" r="3" fill="#34D399"/>
    <circle cx="44" cy="44" r="2" fill="#06B6D4"/>
  </svg>
)

// Header button component
export const SparkButton = ({ onClick }) => (
  <button
    onClick={onClick}
    className="hidden sm:flex p-1.5 bg-pink-50 hover:bg-pink-100 active:bg-pink-200 border border-pink-200 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-2"
    title="Spark AI Assistant (⌃⌘S)"
  >
    <svg className="w-7 h-7" viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id="sparkBtnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F97316"/>
          <stop offset="50%" stopColor="#EC4899"/>
          <stop offset="100%" stopColor="#F97316"/>
        </linearGradient>
      </defs>
      <path d="M28 4C28 4 30 18 32 22C34 26 48 28 48 28C48 28 34 30 32 34C30 38 28 52 28 52C28 52 26 38 24 34C22 30 8 28 8 28C8 28 22 26 24 22C26 18 28 4 28 4Z" fill="url(#sparkBtnGrad)"/>
      <circle cx="44" cy="16" r="3" fill="#34D399"/>
      <circle cx="44" cy="44" r="2" fill="#06B6D4"/>
    </svg>
  </button>
)

// Chat message bubble
const ChatMessage = ({ message, isUser }) => (
  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
    <div
      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-purple-600 text-white rounded-br-md'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
      }`}
    >
      {message}
    </div>
  </div>
)

// Loading indicator
const TypingIndicator = () => (
  <div className="flex justify-start mb-3">
    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-md">
      <div className="flex gap-1.5">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
)

// Main SparkPanel component
export default function SparkPanel({ 
  isOpen, 
  onClose, 
  tasks = [], 
  projects = [],
  userName = '',
  dateFormat = 'DD/MM/YYYY',
  onTaskCreated,
  onTaskUpdated,
  onTaskCompleted,
  onProjectCreated,
  onBulkUndo
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messagesRemaining, setMessagesRemaining] = useState(200)
  const [lastQueryResults, setLastQueryResults] = useState([]) // Store tasks from last query for follow-ups
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load message count from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sparkMessageCount')
    if (stored) {
      const { count, date } = JSON.parse(stored)
      const today = new Date().toDateString()
      if (date === today) {
        setMessagesRemaining(200 - count)
      } else {
        localStorage.setItem('sparkMessageCount', JSON.stringify({ count: 0, date: today }))
        setMessagesRemaining(200)
      }
    }
  }, [])

  // Load conversation history
  useEffect(() => {
    const stored = localStorage.getItem('sparkConversation')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setMessages(parsed)
      } catch (e) {
        console.error('Failed to parse spark conversation:', e)
      }
    }
  }, [])

  // Save conversation when it changes
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('sparkConversation', JSON.stringify(messages.slice(-20)))
    }
  }, [messages])

  // Build context for Claude
  const buildContext = useCallback(() => {
    const today = new Date().toISOString().split('T')[0]
    
    const taskSummary = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length,
      backlog: tasks.filter(t => t.status === 'backlog').length,
      overdue: tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length
    }

    const overdueTasks = tasks
      .filter(t => t.due_date && t.due_date < today && t.status !== 'done')
      .slice(0, 10)
      .map(t => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status }))

    const myDayTasks = tasks
      .filter(t => t.my_day_date === today)
      .map(t => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date }))

    const projectSummaries = projects.map(p => ({
      id: p.id,
      name: p.name,
      task_count: tasks.filter(t => t.project_id === p.id).length
    }))

    // Active tasks for update matching and queries (not done, not in archived projects)
    // Note: tasks are pre-filtered to exclude archived projects in KanbanBoard
    const activeTasks = tasks
      .filter(t => t.status !== 'done')
      .map(t => {
        const project = projects.find(p => p.id === t.project_id)
        return {
          id: t.id,
          title: t.title,
          project_name: project?.name || 'Unknown',
          due_date: t.due_date,
          start_date: t.start_date,
          status: t.status,
          energy_level: t.energy_level,
          time_estimate: t.time_estimate,
          critical: t.critical,
          my_day_date: t.my_day_date,
          assignee: t.assignee
        }
      })

    return { 
      projects: projectSummaries, 
      taskSummary,
      overdueTasks,
      myDayTasks,
      activeTasks,
      userName: userName || 'User',
      dateFormat: dateFormat
    }
  }, [tasks, projects, userName, dateFormat])

  // Send message to Spark
  const sendMessage = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    if (messagesRemaining <= 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "You've used all your Spark messages for today. They'll reset at midnight!"
      }])
      return
    }

    // Add user message
    const userMessage = { role: 'user', content: trimmedInput }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Try local query handling first (no API call needed)
      const localResult = handleLocalQuery(trimmedInput, tasks, projects, dateFormat)
      
      if (localResult) {
        // Local handler succeeded - instant response!
        console.log('Spark: Handled locally, no API call needed')
        // Track local success
        trackSparkQuery(trimmedInput, 'local', true)
        // Store tasks for follow-up actions ("move #2 to tomorrow")
        if (localResult.tasks && localResult.tasks.length > 0) {
          setLastQueryResults(localResult.tasks)
        }
        setMessages(prev => [...prev, { role: 'assistant', content: localResult.response }])
        setIsLoading(false)
        return
      }
      
      // Local handler couldn't handle it - fall back to Claude API
      console.log('Spark: Falling back to Claude API')
      // Track fallback to Claude
      trackSparkQuery(trimmedInput, 'claude', null) // null = pending
      
      // Update rate limit (only count API calls)
      const today = new Date().toDateString()
      const stored = localStorage.getItem('sparkMessageCount')
      let currentCount = 0
      if (stored) {
        const { count, date } = JSON.parse(stored)
        if (date === today) currentCount = count
      }
      localStorage.setItem('sparkMessageCount', JSON.stringify({ count: currentCount + 1, date: today }))
      setMessagesRemaining(prev => prev - 1)

      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spark-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({
            message: trimmedInput,
            context: buildContext(),
            conversationHistory: messages.slice(-10),
            lastQueryResults: lastQueryResults.slice(0, 10).map(t => ({
              id: t.id,
              title: t.title,
              position: lastQueryResults.indexOf(t) + 1 // 1-indexed for "#1", "#2" references
            }))
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Spark API error:', response.status, errorData)
        throw new Error(errorData.error || 'Failed to get response')
      }

      // Parse the JSON response (non-streaming)
      const data = await response.json()
      console.log('Spark raw response:', data)
      
      // Track Claude success
      trackSparkQuery(trimmedInput, 'claude', true)

      // Handle the response
      let displayMessage = data.response || data.error || "I didn't quite catch that."
      
      // If there's an action, execute it
      if (data.action) {
        console.log('Spark action:', JSON.stringify(data.action, null, 2))
        console.log('Task data:', JSON.stringify(data.action.task, null, 2))
        const result = await executeAction(data.action)
        
        // Handle result - could be boolean or { success, error }
        const success = typeof result === 'object' ? result.success : result
        const errorMsg = typeof result === 'object' ? result.error : null
        
        // Handle bulk undo
        if (result?.bulkUndo && onBulkUndo) {
          onBulkUndo(result.bulkUndo)
        }
        
        if (!success) {
          displayMessage = errorMsg || "Sorry, I couldn't complete that action. Could you try again?"
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: displayMessage }])

    } catch (error) {
      console.error('Spark error:', error)
      // Track Claude failure
      trackSparkQuery(trimmedInput, 'claude', false)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Oops, I'm having trouble connecting. Could you try again?"
      }])
    } finally {
      setIsLoading(false)
    }
  }

  // Execute an action from Claude
  const executeAction = async (action) => {
    console.log('executeAction called with:', action)
    
    try {
      if (action.type === 'create_task' && action.task) {
        if (onTaskCreated) {
          console.log('Spark: Calling onTaskCreated...')
          const result = await onTaskCreated(action.task)
          console.log('Spark: onTaskCreated returned:', result)
          // Handle both old boolean return and new object return
          if (typeof result === 'object') {
            return result // { success: boolean, error?: string }
          }
          return { success: result }
        }
      } else if (action.type === 'complete_task' && action.task_id) {
        if (onTaskCompleted) {
          return await onTaskCompleted(action.task_id)
        }
      } else if (action.type === 'update_task' && action.task_id) {
        if (onTaskUpdated) {
          return await onTaskUpdated(action.task_id, action.updates)
        }
      } else if (action.type === 'bulk_update_tasks' && action.task_ids && action.updates) {
        if (onTaskUpdated) {
          console.log('Spark: Bulk updating', action.task_ids.length, 'tasks')
          let successCount = 0
          let errors = []
          let previousStates = []
          
          for (const taskId of action.task_ids) {
            const result = await onTaskUpdated(taskId, action.updates, { skipUndo: true })
            if (result.success) {
              successCount++
              previousStates.push({ taskId, previousState: result.previousState, taskTitle: result.taskTitle })
            } else {
              errors.push(result.error)
            }
          }
          
          // Return bulk undo data for the parent to handle
          if (successCount === action.task_ids.length) {
            return { success: true, bulkUndo: { count: successCount, previousStates, updates: action.updates } }
          } else {
            return { success: false, error: `Updated ${successCount}/${action.task_ids.length} tasks. Errors: ${errors.join(', ')}`, bulkUndo: { count: successCount, previousStates, updates: action.updates } }
          }
        }
      } else if (action.type === 'create_project' && action.name) {
        if (onProjectCreated) {
          return await onProjectCreated({ name: action.name })
        }
      }
    } catch (e) {
      console.error('Action execution error:', e)
      return { success: false, error: 'An error occurred while executing the action' }
    }
    return { success: false, error: 'Unknown action type' }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearConversation = () => {
    setMessages([])
    localStorage.removeItem('sparkConversation')
  }

  const resetMessageLimit = () => {
    localStorage.removeItem('sparkMessageCount')
    setMessagesRemaining(200)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40 md:hidden"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed z-50 bg-white dark:bg-gray-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out
        inset-x-0 bottom-0 h-[70vh] rounded-t-2xl
        md:inset-auto md:right-4 md:top-20 md:bottom-4 md:w-96 md:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <div className="flex items-center gap-2">
            <SparkIcon className="w-6 h-6" />
            <span className="font-semibold text-gray-900 dark:text-white">Spark</span>
            <span 
              className="text-xs text-gray-500 cursor-pointer hover:text-purple-600" 
              onClick={resetMessageLimit}
              title="Click to reset limit (testing)"
            >{messagesRemaining} left today</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearConversation}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Clear conversation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
              <SparkIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Hi! I'm Spark, your task assistant.</p>
              <p className="text-xs mt-1">Try "Create a task to..." or "What's overdue?"</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg.content} isUser={msg.role === 'user'} />
          ))}
          
          {isLoading && <TypingIndicator />}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t dark:border-gray-700">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Spark anything..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="p-1.5 rounded-lg bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
