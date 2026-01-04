import { useState, useMemo } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'
import { COLUMNS, COLUMN_COLORS, CATEGORIES, SOURCES, ENERGY_LEVELS } from '../constants'
import { getDueDateStatus, isBlocked, formatDate, formatTimeEstimate } from '../utils'


const TaskTableView = ({ tasks, projects, onEditTask, allTasks }) => {
  const { user } = useAuth()
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState('desc')
  const [columnFilters, setColumnFilters] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  
  // Get unique values for filter dropdowns
  const getUniqueValues = (field) => {
    const values = tasks.map(t => {
      if (field === 'project') return projects.find(p => p.id === t.project_id)?.name
      if (field === 'category') return CATEGORIES.find(c => c.id === t.category)?.label
      if (field === 'source') return SOURCES.find(s => s.id === t.source)?.label
      return t[field]
    }).filter(Boolean)
    return [...new Set(values)].sort()
  }
  
  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }
  
  // Filter tasks (memoized for performance)
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      for (const [field, value] of Object.entries(columnFilters)) {
        if (!value) continue
        
        let taskValue
        if (field === 'project') {
          taskValue = projects.find(p => p.id === task.project_id)?.name || ''
        } else if (field === 'category') {
          taskValue = CATEGORIES.find(c => c.id === task.category)?.label || ''
        } else if (field === 'source') {
          taskValue = SOURCES.find(s => s.id === task.source)?.label || ''
        } else {
          taskValue = task[field] || ''
        }
        
        if (value === '__blank__' && taskValue) return false
        if (value !== '__blank__' && String(taskValue).toLowerCase() !== String(value).toLowerCase()) return false
      }
      return true
    })
  }, [tasks, columnFilters, projects])
  
  // Sort tasks (memoized for performance)
  const sortedTasks = useMemo(() => [...filteredTasks].sort((a, b) => {
    let aVal, bVal
    
    if (sortField === 'project') {
      aVal = projects.find(p => p.id === a.project_id)?.name || ''
      bVal = projects.find(p => p.id === b.project_id)?.name || ''
    } else if (sortField === 'category') {
      aVal = CATEGORIES.find(c => c.id === a.category)?.label || ''
      bVal = CATEGORIES.find(c => c.id === b.category)?.label || ''
    } else {
      aVal = a[sortField] ?? ''
      bVal = b[sortField] ?? ''
    }
    
    // Handle dates
    if (sortField.includes('date') || sortField === 'created_at') {
      aVal = aVal ? new Date(aVal).getTime() : 0
      bVal = bVal ? new Date(bVal).getTime() : 0
    }
    
    // Handle booleans
    if (typeof aVal === 'boolean') aVal = aVal ? 1 : 0
    if (typeof bVal === 'boolean') bVal = bVal ? 1 : 0
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  }), [filteredTasks, sortField, sortDirection, projects])
  
  // Export to CSV
  const exportToCSV = () => {
    const headers = ['ID', 'Title', 'Project', 'Project Archived', 'Status', 'Critical', 'Due Date', 'Start Date', 'Assignee', 'Customer', 'Category', 'Effort', 'Source', 'Time Estimate', 'Description', 'Created']
    const rows = sortedTasks.map(t => {
      const taskProject = projects.find(p => p.id === t.project_id)
      return [
        t.id || '',
        t.title || '',
        taskProject?.name || '',
        taskProject?.archived ? 'Yes' : 'No',
        t.status || '',
        t.critical ? 'Yes' : 'No',
      t.due_date || '',
      t.start_date || '',
      t.assignee || '',
      t.customer || '',
      CATEGORIES.find(c => c.id === t.category)?.label || '',
      t.energy_level || '',
      SOURCES.find(s => s.id === t.source)?.label || '',
      t.time_estimate ? `${t.time_estimate}m` : '',
      (t.description || '').replace(/[\n\r,]/g, ' '),
      t.created_at ? new Date(t.created_at).toLocaleDateString() : ''
      ]
    })
    
    const csvContent = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `trackli-tasks-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }
  
  // Download blank CSV template
  const downloadTemplate = () => {
    const headers = ['ID', 'Title', 'Project', 'Status', 'Critical', 'Due Date', 'Start Date', 'Assignee', 'Customer', 'Category', 'Effort', 'Source', 'Time Estimate', 'Description']
    // Add example row with * for new task
    const exampleRow = ['*', 'Example Task', projects[0]?.name || 'Project Name', 'todo', 'No', '', '', '', '', '', '', '', '30m', 'Task description here']
    
    const csvContent = [headers, exampleRow].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'trackli-template.csv'
    link.click()
  }
  
  // Import CSV
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)
  
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setImporting(true)
    setImportResult(null)
    
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        setImportResult({ error: 'CSV must have a header row and at least one data row' })
        setImporting(false)
        return
      }
      
      // Parse header
      const parseCSVLine = (line) => {
        const result = []
        let current = ''
        let inQuotes = false
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }
      
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
      const idIndex = headers.indexOf('id')
      const titleIndex = headers.indexOf('title')
      const projectIndex = headers.indexOf('project')
      const statusIndex = headers.indexOf('status')
      const criticalIndex = headers.indexOf('critical')
      const dueDateIndex = headers.indexOf('due date')
      const startDateIndex = headers.indexOf('start date')
      const assigneeIndex = headers.indexOf('assignee')
      const customerIndex = headers.indexOf('customer')
      const categoryIndex = headers.indexOf('category')
      const effortIndex = headers.indexOf('effort')
      const sourceIndex = headers.indexOf('source')
      const timeEstimateIndex = headers.indexOf('time estimate')
      const descriptionIndex = headers.indexOf('description')
      
      if (titleIndex === -1) {
        setImportResult({ error: 'CSV must have a Title column' })
        setImporting(false)
        return
      }
      
      let created = 0
      let updated = 0
      let errors = []
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])
        if (values.length === 0 || values.every(v => !v)) continue // Skip empty rows
        
        const id = idIndex >= 0 ? values[idIndex] : ''
        const title = titleIndex >= 0 ? values[titleIndex] : ''
        
        if (!title) {
          errors.push(`Row ${i + 1}: Missing title`)
          continue
        }
        
        // Find project by name
        const projectName = projectIndex >= 0 ? values[projectIndex] : ''
        const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        
        // Find category by label
        const categoryLabel = categoryIndex >= 0 ? values[categoryIndex] : ''
        const category = CATEGORIES.find(c => c.label.toLowerCase() === categoryLabel.toLowerCase())
        
        // Find source by label
        const sourceLabel = sourceIndex >= 0 ? values[sourceIndex] : ''
        const source = SOURCES.find(s => s.label.toLowerCase() === sourceLabel.toLowerCase())
        
        // Parse status
        const statusRaw = statusIndex >= 0 ? values[statusIndex]?.toLowerCase() : 'todo'
        const statusMap = { 'backlog': 'backlog', 'to do': 'todo', 'todo': 'todo', 'in progress': 'in_progress', 'in_progress': 'in_progress', 'done': 'done' }
        const status = statusMap[statusRaw] || 'todo'
        
        // Parse critical
        const criticalRaw = criticalIndex >= 0 ? values[criticalIndex]?.toLowerCase() : ''
        const critical = criticalRaw === 'yes' || criticalRaw === 'true' || criticalRaw === '1'
        
        // Parse time estimate (remove 'm' suffix if present)
        const timeEstimateRaw = timeEstimateIndex >= 0 ? values[timeEstimateIndex] : ''
        const timeEstimate = timeEstimateRaw ? parseInt(timeEstimateRaw.replace(/m$/i, '')) || null : null
        // Parse date from various formats to YYYY-MM-DD
        const parseDate = (dateStr) => {
          if (!dateStr) return null
          // Already in YYYY-MM-DD format
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
          
          // Detect locale for date parsing
          const isUSLocale = isUSDateFormat()
          
          const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (match) {
            let day, month
            if (isUSLocale) {
              // US: MM/DD/YYYY
              month = match[1].padStart(2, '0')
              day = match[2].padStart(2, '0')
            } else {
              // UK/EU: DD/MM/YYYY
              day = match[1].padStart(2, '0')
              month = match[2].padStart(2, '0')
            }
            return `${match[3]}-${month}-${day}`
          }
          return null
        }
        
        // Build task data
        const taskData = {
          title,
          project_id: project?.id || null,
          status,
          critical,
          due_date: parseDate(dueDateIndex >= 0 ? values[dueDateIndex] : null),
          start_date: parseDate(startDateIndex >= 0 ? values[startDateIndex] : null),
          assignee: assigneeIndex >= 0 ? values[assigneeIndex] || null : null,
          customer: customerIndex >= 0 ? values[customerIndex] || null : null,
          category: category?.id || null,
          energy_level: effortIndex >= 0 && values[effortIndex] ? values[effortIndex].toLowerCase() : null,
          source: source?.id || null,
          time_estimate: timeEstimate,
          description: descriptionIndex >= 0 ? values[descriptionIndex] || null : null,
        }
        
        try {
          if (!id || id === '*') {
            // Create new task
            const { error } = await supabase.from('tasks').insert(taskData)
            if (error) throw error
            created++
          } else {
            // Update existing task
            const { error } = await supabase.from('tasks').update(taskData).eq('id', id)
            if (error) throw error
            updated++
          }
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err.message}`)
        }
      }
      
      setImportResult({ created, updated, errors })
      
      // Refresh tasks
      if (created > 0 || updated > 0) {
        const { data } = await supabase.from('tasks').select('*, dependencies:task_dependencies!task_dependencies_task_id_fkey(depends_on_id)').eq('user_id', user.id).order('created_at', { ascending: false })
        if (data) {
          // This will trigger a re-render - we need to call the parent's refresh
          window.location.reload() // Simple approach - reload to refresh all data
        }
      }
    } catch (err) {
      setImportResult({ error: `Failed to parse CSV: ${err.message}` })
    }
    
    setImporting(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  
  // Column definitions
  const columns = [
    { key: 'title', label: 'Title', width: 'min-w-[200px]' },
    { key: 'project', label: 'Project', width: 'min-w-[120px]' },
    { key: 'status', label: 'Status', width: 'min-w-[100px]' },
    { key: 'critical', label: 'Critical', width: 'min-w-[80px]' },
    { key: 'due_date', label: 'Due Date', width: 'min-w-[100px]' },
    { key: 'start_date', label: 'Start Date', width: 'min-w-[100px]' },
    { key: 'assignee', label: 'Assignee', width: 'min-w-[120px]' },
    { key: 'customer', label: 'Customer', width: 'min-w-[120px]' },
    { key: 'energy_level', label: 'Effort', width: 'min-w-[100px]' },
    { key: 'time_estimate', label: 'Est. Time', width: 'min-w-[90px]' },
    { key: 'created_at', label: 'Created', width: 'min-w-[100px]' },
  ]
  
  const getCellValue = (task, key) => {
    switch (key) {
      case 'project':
        return projects.find(p => p.id === task.project_id)?.name || '-'
      case 'status':
        return { backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[task.status] || task.status
      case 'critical':
        return task.critical ? 'Yes' : '-'
      case 'due_date':
      case 'start_date':
        return task[key] ? formatDate(task[key]) : '-'
      case 'energy_level':
        return { high: 'High', medium: 'Medium', low: 'Low' }[task.energy_level] || '-'
      case 'time_estimate':
        return task.time_estimate ? formatTimeEstimate(task.time_estimate) : '-'
      case 'created_at':
        return task.created_at ? new Date(task.created_at).toLocaleDateString() : '-'
      default:
        return task[key] || '-'
    }
  }
  
  const getStatusColor = (status) => {
    const colors = {
      backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
      in_progress: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
      done: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">All Tasks</h2>
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs sm:text-sm text-gray-600 dark:text-gray-300">
            {sortedTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showFilters || Object.values(columnFilters).some(v => v)
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="hidden sm:inline">Filters</span>
            {Object.values(columnFilters).some(v => v) && (
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            )}
          </button>
          
          {/* Clear filters - show when active */}
          {Object.values(columnFilters).some(v => v) && (
            <button
              onClick={() => setColumnFilters({})}
              className="px-2 py-1.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
          
          {/* Divider - desktop only */}
          <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700" />
          
          {/* Export button */}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900/70 rounded-lg text-sm font-medium transition-colors"
            title="Export CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          
          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Import CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import'}</span>
          </button>
          
          {/* Template button - desktop only */}
          <button
            onClick={downloadTemplate}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            title="Download CSV template"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Template
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
        </div>
      </div>
      
      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setImportResult(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
              {importResult.error ? 'Import Error' : 'Import Complete'}
            </h3>
            {importResult.error ? (
              <p className="text-red-600 dark:text-red-400">{importResult.error}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-green-600">{importResult.created}</span> tasks created
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-blue-600">{importResult.updated}</span> tasks updated
                </p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">Errors:</p>
                    <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>...and {importResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setImportResult(null)}
              className="mt-4 w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`${col.width} px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider`}
                >
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    {col.label}
                    {sortField === col.key && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="bg-gray-100 dark:bg-gray-800/50">
                {columns.map(col => (
                  <th key={`filter-${col.key}`} className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                    {['title', 'time_estimate', 'created_at'].includes(col.key) ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <select
                        value={columnFilters[col.key] || ''}
                        onChange={(e) => setColumnFilters({ ...columnFilters, [col.key]: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">All</option>
                        <option value="__blank__">(Blank)</option>
                        {col.key === 'status' && (
                          <>
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </>
                        )}
                        {col.key === 'critical' && (
                          <>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </>
                        )}
                        {col.key === 'energy_level' && (
                          <>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </>
                        )}
                        {['project', 'assignee', 'customer', 'category', 'source'].includes(col.key) && 
                          getUniqueValues(col.key).map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))
                        }
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedTasks.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center mb-4">
                      <span className="text-2xl">🔍</span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">No tasks found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-300 mt-1">Try adjusting your filters or search terms</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedTasks.map((task, index) => {
                const taskProject = projects.find(p => p.id === task.project_id)
                const isArchived = taskProject?.archived
                const isEvenRow = index % 2 === 0
                return (
                <tr
                  key={task.id}
                  onClick={() => onEditTask(task)}
                  className={`cursor-pointer transition-all duration-150 ${isArchived ? 'opacity-60' : ''} ${
                    isEvenRow 
                      ? 'bg-white dark:bg-gray-900' 
                      : 'bg-gray-50/50 dark:bg-gray-800/30'
                  } hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:shadow-sm`}
                >
                  {columns.map(col => (
                    <td key={`${task.id}-${col.key}`} className="px-4 py-3 text-sm">
                      {col.key === 'title' ? (
                        <div className="flex items-center gap-2">
                          {task.critical && <span className="text-red-500">🚨</span>}
                          {isArchived && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300">Archived</span>}
                          <span className={`font-medium truncate max-w-[250px] ${isArchived ? 'text-gray-500 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>{task.title}</span>
                        </div>
                      ) : col.key === 'status' ? (
                        <span className={`text-sm font-medium ${
                          task.status === 'done' ? 'text-green-600 dark:text-green-400' :
                          task.status === 'in_progress' ? 'text-pink-600 dark:text-pink-400' :
                          task.status === 'todo' ? 'text-blue-600 dark:text-blue-400' :
                          'text-gray-500 dark:text-gray-400'
                        }`}>
                          {getCellValue(task, col.key)}
                        </span>
                      ) : col.key === 'critical' ? (
                        <span className={task.critical ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}>
                          {getCellValue(task, col.key)}
                        </span>
                      ) : col.key === 'energy_level' ? (
                        <span className={`text-sm ${
                          task.energy_level === 'high' ? 'text-red-600 dark:text-red-400 font-medium' :
                          task.energy_level === 'medium' ? 'text-amber-600 dark:text-amber-400' :
                          task.energy_level === 'low' ? 'text-green-600 dark:text-green-400' :
                          'text-gray-400 dark:text-gray-500'
                        }`}>
                          {getCellValue(task, col.key)}
                        </span>
                      ) : (
                        <span className={getCellValue(task, col.key) === '-' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}>
                          {getCellValue(task, col.key)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Critical Toggle Component


export { TaskTableView }
