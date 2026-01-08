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
    {/* Main 4-point star with gradient */}
    <path d="M28 4C28 4 30 18 32 22C34 26 48 28 48 28C48 28 34 30 32 34C30 38 28 52 28 52C28 52 26 38 24 34C22 30 8 28 8 28C8 28 22 26 24 22C26 18 28 4 28 4Z" fill="url(#sparkGradient)"/>
    {/* Accent dots */}
    <circle cx="44" cy="16" r="3" fill="#34D399"/>
    <circle cx="44" cy="44" r="2" fill="#06B6D4"/>
  </svg>
)

// Header button component - Option H: Soft pink background, icon only
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

// Individual chat message bubble
const ChatMessage = ({ message, isUser }) => (
  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
    <div
      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-purple-600 text-white rounded-br-md'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
      }`}
    >
      {message}
    </div>
  </div>
)

// Loading indicator while Spark is "thinking"
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
  onTaskCreated,
  onTaskUpdated,
  onTaskCompleted,
  onProjectCreated 
}) {
  // State for managing the chat
  const [messages, setMessages] = useState([]) // Chat history
  const [input, setInput] = useState('') // Current input field value
  const [isLoading, setIsLoading] = useState(false) // Is Spark responding?
  const [streamingMessage, setStreamingMessage] = useState('') // Current streaming response
  const [messagesRemaining, setMessagesRemaining] = useState(50) // Rate limit counter
  
  // Ref to scroll to bottom of chat
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessage])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load message count from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sparkMessageCount')
    if (stored) {
      const { count, date } = JSON.parse(stored)
      const today = new Date().toDateString()
      if (date === today) {
        setMessagesRemaining(50 - count)
      } else {
        // Reset for new day
        localStorage.setItem('sparkMessageCount', JSON.stringify({ count: 0, date: today }))
        setMessagesRemaining(50)
      }
    }
  }, [])

  // Load conversation history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sparkConversation')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setMessages(parsed)
        }
      } catch (e) {
        console.error('Failed to parse spark conversation:', e)
      }
    }
  }, [])

  // Save conversation to localStorage when it changes
  useEffect(() => {
    if (messages.length > 0) {
      // Keep only last 20 messages to avoid localStorage limits
      const toStore = messages.slice(-20)
      localStorage.setItem('sparkConversation', JSON.stringify(toStore))
    }
  }, [messages])

  // Build context object to send to Edge Function
  // This gives Claude information about the user's tasks/projects
  const buildContext = useCallback(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    
    // Count tasks by status
    const taskSummary = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      done: tasks.filter(t => t.status === 'done').length,
      backlog: tasks.filter(t => t.status === 'backlog').length,
      overdue: tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length
    }

    // Get overdue tasks
    const overdueTasks = tasks
      .filter(t => t.due_date && t.due_date < today && t.status !== 'done')
      .slice(0, 10)
      .map(t => ({ 
        id: t.id, 
        title: t.title, 
        due_date: t.due_date,
        status: t.status,
        project_name: projects.find(p => p.id === t.project_id)?.name
      }))

    // Get My Day tasks
    const myDayTasks = tasks
      .filter(t => t.my_day_date === today)
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due_date: t.due_date,
        project_name: projects.find(p => p.id === t.project_id)?.name
      }))

    // Get recent tasks (last 20 by updated_at)
    const recentTasks = [...tasks]
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 20)
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due_date: t.due_date,
        project_name: projects.find(p => p.id === t.project_id)?.name
      }))

    // Project summaries
    const projectSummaries = projects.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      task_count: tasks.filter(t => t.project_id === p.id).length
    }))

    return {
      projects: projectSummaries,
      taskSummary,
      overdueTasks,
      myDayTasks,
      recentTasks
    }
  }, [tasks, projects])

  // Send a message to Spark
  const sendMessage = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    // Check rate limit
    if (messagesRemaining <= 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "You've used all your Spark messages for today. They'll reset at midnight!"
      }])
      return
    }

    // Add user message to chat
    const userMessage = { role: 'user', content: trimmedInput }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingMessage('')

    // Update rate limit counter
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
      // Get Supabase session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      // Call our Edge Function
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
            conversationHistory: messages.slice(-10) // Send last 10 messages for context
          })
        }
      )

      if (!response.ok) {
        throw new Error('Failed to get response from Spark')
      }

      // Handle streaming response
      // The response body is a ReadableStream that we read chunk by chunk
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Decode the chunk and parse SSE events
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          // Claude streams data as Server-Sent Events (SSE)
          // Each event looks like: "data: {...json...}"
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              
              // Handle different event types from Claude's streaming API
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || ''
                fullResponse += text
                // Hide ACTION from streaming display - show everything before "ACTION:"
                const displayText = fullResponse.split('ACTION:')[0].trim()
                setStreamingMessage(displayText)
              }
            } catch (e) {
              // Not all lines are valid JSON, that's okay
            }
          }
        }
      }

      // Streaming complete - add the full response to messages
      if (fullResponse) {
        // Check if there's an action to execute
        // Match ACTION: followed by JSON (handles multi-line by being more flexible)
        const actionIndex = fullResponse.indexOf('ACTION:')
        let displayMessage = fullResponse
        let actionSucceeded = true
        
        if (actionIndex !== -1) {
          const jsonStart = fullResponse.indexOf('{', actionIndex)
          if (jsonStart !== -1) {
            // Find the matching closing brace
            let braceCount = 0
            let jsonEnd = jsonStart
            for (let i = jsonStart; i < fullResponse.length; i++) {
              if (fullResponse[i] === '{') braceCount++
              if (fullResponse[i] === '}') braceCount--
              if (braceCount === 0) {
                jsonEnd = i + 1
                break
              }
            }
            
            const jsonStr = fullResponse.slice(jsonStart, jsonEnd)
            
            // Check if JSON looks complete (braces balanced)
            if (braceCount !== 0) {
              console.error('Incomplete JSON (braces not balanced):', jsonStr)
              actionSucceeded = false
            } else {
              try {
                const action = JSON.parse(jsonStr)
                console.log('Executing action:', action)
                await executeAction(action)
              } catch (e) {
                console.error('Failed to parse action JSON:', e, jsonStr)
                actionSucceeded = false
              }
            }
            
            // Remove ACTION and everything after from displayed message
            displayMessage = fullResponse.slice(0, actionIndex).trim()
          }
        }

        // If action failed, append error message
        if (actionIndex !== -1 && !actionSucceeded) {
          displayMessage = "Sorry, I tried to do that but something went wrong. Could you try again?"
        }

        if (displayMessage) {
          setMessages(prev => [...prev, { role: 'assistant', content: displayMessage }])
        }
      }

    } catch (error) {
      console.error('Spark error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Oops, I'm having trouble connecting. Could you try again in a moment?"
      }])
    } finally {
      setIsLoading(false)
      setStreamingMessage('')
    }
  }

  // Execute an action returned by Claude (create task, complete task, etc.)
  const executeAction = async (action) => {
    console.log('Executing action:', action)
    
    switch (action.action) {
      case 'create_task':
        if (onTaskCreated && action.data) {
          await onTaskCreated(action.data)
        }
        break
      case 'complete_task':
        if (onTaskCompleted && action.data?.task_id) {
          await onTaskCompleted(action.data.task_id)
        }
        break
      case 'update_task':
        if (onTaskUpdated && action.data?.task_id) {
          await onTaskUpdated(action.data.task_id, action.data.updates)
        }
        break
      case 'create_project':
        if (onProjectCreated && action.data) {
          await onProjectCreated(action.data)
        }
        break
      // Add more actions as needed
      default:
        console.log('Unknown action:', action.action)
    }
  }

  // Handle Enter key to send message
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Clear conversation history
  const clearConversation = () => {
    setMessages([])
    localStorage.removeItem('sparkConversation')
  }

  // Don't render anything if panel is closed
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop - click to close */}
      <div 
        className="fixed inset-0 bg-black/20 z-40 md:hidden"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className={`
        fixed z-50 bg-white dark:bg-gray-800 shadow-2xl
        flex flex-col
        transition-transform duration-300 ease-out
        
        /* Mobile: bottom sheet */
        inset-x-0 bottom-0 h-[85vh] rounded-t-2xl
        
        /* Desktop: right panel */
        md:inset-y-0 md:right-0 md:left-auto md:w-80 md:h-full md:rounded-none
        
        ${isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <SparkIcon className="w-6 h-6" />
            <span className="font-semibold text-gray-900 dark:text-white">Spark</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Messages remaining indicator */}
            <span className="text-xs text-gray-400">{messagesRemaining} left today</span>
            {/* Clear conversation button */}
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Clear conversation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Welcome message if no messages yet */}
          {messages.length === 0 && !streamingMessage && (
            <div className="text-center py-8">
              <SparkIcon className="w-12 h-12 mx-auto mb-3" />
              <p className="text-gray-900 dark:text-white font-medium mb-1">Hey! I'm Spark!</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">How can I help?</p>
              
              {/* Quick action suggestions */}
              <div className="mt-6 space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Try asking</p>
                {[
                  "What's overdue?",
                  "Add a task to call the bank tomorrow",
                  "Plan my day for 4 hours"
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(suggestion)
                      inputRef.current?.focus()
                    }}
                    className="block w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg.content} isUser={msg.role === 'user'} />
          ))}

          {/* Streaming message (appears as it's being generated) */}
          {streamingMessage && (
            <ChatMessage message={streamingMessage} isUser={false} />
          )}

          {/* Typing indicator while waiting for response to start */}
          {isLoading && !streamingMessage && <TypingIndicator />}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Spark anything..."
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
