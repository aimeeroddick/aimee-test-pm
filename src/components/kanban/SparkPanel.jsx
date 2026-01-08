import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

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
  onTaskCreated,
  onTaskUpdated,
  onTaskCompleted,
  onProjectCreated 
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messagesRemaining, setMessagesRemaining] = useState(50)
  
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
        setMessagesRemaining(50 - count)
      } else {
        localStorage.setItem('sparkMessageCount', JSON.stringify({ count: 0, date: today }))
        setMessagesRemaining(50)
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

    return { 
      projects: projectSummaries, 
      taskSummary, 
      overdueTasks, 
      myDayTasks,
      userName: userName || 'User'
    }
  }, [tasks, projects, userName])

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

    // Update rate limit
    const today = new Date().toDateString()
    const stored = localStorage.getItem('sparkMessageCount')
    let currentCount = 0
    if (stored) {
      const { count, date } = JSON.parse(stored)
      if (date === today) currentCount = count
    }
    localStorage.setItem('sparkMessageCount', JSON.stringify({ count: currentCount + 1, date: today }))
    setMessagesRemaining(prev => prev - 1)

    try {
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
            conversationHistory: messages.slice(-10)
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
      console.log('Spark response:', data)

      // Handle the response
      let displayMessage = data.response || data.error || "I didn't quite catch that."
      
      // If there's an action, execute it
      if (data.action) {
        console.log('Executing action:', data.action)
        const success = await executeAction(data.action)
        
        if (!success) {
          displayMessage = "Sorry, I couldn't complete that action. Could you try again?"
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: displayMessage }])

    } catch (error) {
      console.error('Spark error:', error)
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
          return await onTaskCreated(action.task)
        }
      } else if (action.type === 'complete_task' && action.task_id) {
        if (onTaskCompleted) {
          return await onTaskCompleted(action.task_id)
        }
      } else if (action.type === 'update_task' && action.task_id) {
        if (onTaskUpdated) {
          return await onTaskUpdated(action.task_id, action.updates)
        }
      } else if (action.type === 'create_project' && action.name) {
        if (onProjectCreated) {
          return await onProjectCreated({ name: action.name })
        }
      }
    } catch (e) {
      console.error('Action execution error:', e)
      return false
    }
    return false
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
            <span className="text-xs text-gray-500">{messagesRemaining} left today</span>
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
