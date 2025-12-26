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

export default function OutlookAddin() {
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [officeReady, setOfficeReady] = useState(false)
  const [officeLoaded, setOfficeLoaded] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project_id: '',
    status: 'backlog',
    critical: false,
    due_date: '',
    category: 'email',
    source: 'email',
    source_link: '',
    customer: '',
    notes: '',
    sender: '',
  })

  // Dynamically load Office.js
  useEffect(() => {
    const loadOfficeJs = () => {
      // Check if already loaded
      if (typeof Office !== 'undefined') {
        setOfficeLoaded(true)
        return
      }
      
      const script = document.createElement('script')
      script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'
      script.onload = () => setOfficeLoaded(true)
      script.onerror = () => setOfficeLoaded(true) // Continue anyway for standalone testing
      document.head.appendChild(script)
    }
    
    loadOfficeJs()
  }, [])

  // Initialize Office.js and get email data
  useEffect(() => {
    if (!officeLoaded) return
    
    const initOffice = () => {
      if (typeof Office !== 'undefined' && Office.onReady) {
        Office.onReady((info) => {
          setOfficeReady(true)
          
          if (info.host === Office.HostType.Outlook) {
            const item = Office.context.mailbox.item
            if (item) {
              // Get email subject
              const subject = item.subject || ''
              
              // Get sender
              const sender = item.from?.displayName || item.from?.emailAddress || ''
              const senderEmail = item.from?.emailAddress || ''
              
              // Get email body
              item.body.getAsync(Office.CoercionType.Text, (result) => {
                if (result.status === Office.AsyncResultStatus.Succeeded) {
                  const bodyText = result.value || ''
                  const bodyPreview = bodyText.substring(0, 1000)
                  
                  setFormData(prev => ({
                    ...prev,
                    title: subject,
                    sender: sender,
                    notes: `From: ${sender} <${senderEmail}>\n\n${bodyPreview}${bodyText.length > 1000 ? '\n\n[Truncated...]' : ''}`
                  }))
                }
              })
              
              // Try to get internet message ID for linking back
              if (item.internetMessageId) {
                setFormData(prev => ({
                  ...prev,
                  source_link: item.internetMessageId
                }))
              }
            }
          }
        })
      } else {
        // Office.js not available - we're in standalone mode (for testing)
        setOfficeReady(true)
      }
    }
    
    initOffice()
  }, [officeLoaded])

  // Check auth and load projects
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        setUser(session.user)
        
        const { data: projectsData } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })
        
        // Also fetch customers for each project
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
      }
      
      setLoading(false)
    }
    
    init()
  }, [])

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
          due_date: formData.due_date || null,
          category: formData.category,
          source: 'email',
          source_link: formData.source_link || null,
          customer: formData.customer || null,
          notes: formData.notes || null,
          energy_level: 'medium',
        })
      
      if (insertError) throw insertError
      
      setSuccess(true)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAnother = () => {
    setSuccess(false)
    setFormData(prev => ({
      ...prev,
      title: '',
      description: '',
      critical: false,
      due_date: '',
      customer: '',
      notes: '',
    }))
  }

  const selectedProject = projects.find(p => p.id === formData.project_id)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Login form
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
        <div className="max-w-sm mx-auto pt-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Trackli</h1>
            <p className="text-sm text-gray-500">Track. Manage. Deliver.</p>
          </div>
          <p className="text-sm text-gray-500 mb-4">Sign in to create tasks</p>

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
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 font-medium disabled:opacity-50"
              >
                {saving ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
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
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Task Created!</h2>
          <p className="text-gray-500 mb-6">Your task has been added to the board.</p>
          <button
            onClick={handleCreateAnother}
            className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 font-medium"
          >
            Create Another Task
          </button>
        </div>
      </div>
    )
  }

  // Task form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-gray-800">Create Task from Email</h1>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Task title"
            />
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
            <select
              required
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value, customer: '' })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Customer */}
          {selectedProject?.customers?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              <select
                value={formData.customer}
                onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">No customer</option>
                {selectedProject.customers.map((cust) => (
                  <option key={cust} value={cust}>{cust}</option>
                ))}
              </select>
            </div>
          )}

          {/* Category & Status Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Critical Toggle */}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, critical: !formData.critical })}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              formData.critical 
                ? 'bg-red-50 border-red-300 text-red-700' 
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <svg 
              className={`w-5 h-5 ${formData.critical ? 'text-red-500' : 'text-gray-400'}`} 
              fill={formData.critical ? 'currentColor' : 'none'} 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            <span className="font-medium">{formData.critical ? 'Critical' : 'Mark as Critical'}</span>
          </button>

          {/* Notes (shows email content) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (from email)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
              placeholder="Email content will appear here..."
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !formData.title || !formData.project_id}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating Task...' : 'Create Task'}
          </button>
        </form>
      </div>
    </div>
  )
}
