// Task extraction utilities - moved outside React component for performance

const isUSDateFormat = () => {
  try {
    const formatted = new Date(2000, 0, 15).toLocaleDateString()
    return formatted.startsWith('1')
  } catch {
    return false
  }
}

export const parseDateString = (dateStr) => {
  if (!dateStr) return null
  
  const cleaned = dateStr.trim().toLowerCase()
  const today = new Date()
  const isUS = isUSDateFormat()
  
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
  
  // Parse numeric dates
  let match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (match) {
    let day, month
    if (isUS) {
      month = parseInt(match[1]) - 1
      day = parseInt(match[2])
    } else {
      day = parseInt(match[1])
      month = parseInt(match[2]) - 1
    }
    const year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])
    const date = new Date(year, month, day)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  }
  
  // Short date without year
  match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?!\d)/)
  if (match) {
    let day, month
    if (isUS) {
      month = parseInt(match[1]) - 1
      day = parseInt(match[2])
    } else {
      day = parseInt(match[1])
      month = parseInt(match[2]) - 1
    }
    const date = new Date(today.getFullYear(), month, day)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  }
  
  // Month names
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  match = dateStr.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
  if (match) {
    const day = parseInt(match[1])
    const month = months.indexOf(match[2].toLowerCase())
    const date = new Date(today.getFullYear(), month, day)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  }
  match = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})/i)
  if (match) {
    const day = parseInt(match[2])
    const month = months.indexOf(match[1].toLowerCase())
    const date = new Date(today.getFullYear(), month, day)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  }
  
  return dateStr // Return original if can't parse
}

const extractFromFollowUpTable = (notesText) => {
  const lines = notesText.split('\n')
  const actionItems = []
  
  let headerRowIndex = -1
  let columnIndices = { followUp: -1, owner: -1, dueDate: -1, status: -1 }
  let delimiter = '|'
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    
    // Check for pipe-delimited table
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
    
    // Check for tab-delimited table
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
    
    let dueDate = dueDateStr ? parseDateString(dueDateStr) : ''
    
    const isCritical = /urgent|asap|critical|important|high/i.test(followUp) ||
                      /urgent|asap|critical|important|high/i.test(status)
    
    actionItems.push({
      id: `extracted-table-${i}`,
      title: followUp.charAt(0).toUpperCase() + followUp.slice(1),
      assignee: owner,
      dueDate: dueDate,
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
        } 
        else if (pattern.toString().includes('@|assigned')) {
          assignee = match[1]?.trim() || ''
          taskTitle = match[2]?.trim() || ''
        }
        else {
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
        .replace(/^(?:action|todo|task|ai|action item|follow[ -]?up)[:\s]*/i, '')
        .trim()
      
      let dueDate = ''
      const datePatterns = [
        /by\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /by\s+(\d{1,2}\/\d{1,2})/i,
        /due\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(eod|end of day|eow|end of week|asap)/i,
      ]
      
      for (const datePattern of datePatterns) {
        const dateMatch = taskTitle.match(datePattern)
        if (dateMatch) {
          dueDate = parseDateString(dateMatch[1])
          taskTitle = taskTitle.replace(datePattern, '').trim()
        }
      }
      
      if (taskTitle.length > 3) {
        actionItems.push({
          id: `extracted-${i}`,
          title: taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1),
          assignee: assignee,
          dueDate: dueDate,
          critical: /urgent|asap|critical|important/i.test(taskTitle),
        })
      }
    }
  }
  
  return actionItems
}

export const extractTasks = (text) => {
  // Try table format first
  const tableResult = extractFromFollowUpTable(text)
  if (tableResult.length > 0) {
    return tableResult
  }
  
  // Fall back to pattern matching
  return extractFromPatterns(text.split('\n'))
}
