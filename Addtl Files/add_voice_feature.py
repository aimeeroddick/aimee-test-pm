#!/usr/bin/env python3
"""
Add Voice-to-Tasks feature to Trackli
Version 2.3.18
"""

import os

file_path = '/Users/aimeeroddick/Desktop/Trackli/src/components/KanbanBoard.jsx'

# Read the file
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add state variables for voice input after the meeting notes state
voice_state = '''  const [showExtractedTasks, setShowExtractedTasks] = useState(false)
  
  // Voice Input State
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef(null)
  
  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setVoiceSupported(!!SpeechRecognition)
  }, [])
  
  // Voice recognition handlers
  const startListening = (onTranscript, continuous = false) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Safari.')
      return
    }
    
    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = 'en-GB'
    
    recognition.onstart = () => {
      setIsListening(true)
    }
    
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onTranscript(transcript)
    }
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.')
      }
    }
    
    recognition.onend = () => {
      setIsListening(false)
    }
    
    recognitionRef.current = recognition
    recognition.start()
  }
  
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }
  
  const toggleVoiceInput = (onTranscript, continuous = false) => {
    if (isListening) {
      stopListening()
    } else {
      startListening(onTranscript, continuous)
    }
  }'''

content = content.replace(
    '  const [showExtractedTasks, setShowExtractedTasks] = useState(false)',
    voice_state
)

# 2. Add mic button to Quick Add modal
quick_add_input_old = '''                  <input
                    type="text"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder='Try "Call mom tomorrow" or "Report due friday"'
                    autoFocus
                    className="w-full px-4 py-3 text-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-2"
                  />'''

quick_add_input_new = '''                  <div className="relative flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      placeholder='Try "Call mom tomorrow" or "Report due friday"'
                      autoFocus
                      className="flex-1 px-4 py-3 text-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {voiceSupported && (
                      <button
                        type="button"
                        onClick={() => toggleVoiceInput((text) => setQuickAddTitle(text))}
                        className={`p-3 rounded-xl transition-all ${
                          isListening 
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {isListening ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          )}
                        </svg>
                      </button>
                    )}
                  </div>
                  {isListening && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-sm text-red-500">Listening... speak now</span>
                    </div>
                  )}'''

content = content.replace(quick_add_input_old, quick_add_input_new)

# 3. Add voice input tab to Meeting Notes modal
meeting_notes_modal_old = '''      {/* Meeting Notes Import Modal */}
      <Modal 
        isOpen={meetingNotesModalOpen} 
        onClose={() => setMeetingNotesModalOpen(false)} 
        title="Import Meeting Notes"
        wide
      >
        {!showExtractedTasks ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Paste your meeting notes below. We'll extract action items and create tasks automatically.
            </p>'''

meeting_notes_modal_new = '''      {/* Meeting Notes Import Modal */}
      <Modal 
        isOpen={meetingNotesModalOpen} 
        onClose={() => {
          setMeetingNotesModalOpen(false)
          stopListening()
          setVoiceTranscript('')
        }} 
        title="Import Tasks"
        wide
      >
        {!showExtractedTasks ? (
          <div className="space-y-4">
            {/* Input Method Tabs */}
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <button
                onClick={() => setVoiceTranscript('')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  !voiceTranscript 
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Paste Notes
              </button>
              {voiceSupported && (
                <button
                  onClick={() => setVoiceTranscript(' ')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    voiceTranscript 
                      ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Voice Input
                </button>
              )}
            </div>
            
            {/* Voice Input Mode */}
            {voiceTranscript ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Context (optional)</label>
                    <input
                      type="text"
                      value={meetingNotesData.title}
                      onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                      placeholder="e.g., Planning session, Client call"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
                    <select
                      value={meetingNotesData.projectId}
                      onChange={(e) => setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Voice Recording Button */}
                <div className="flex flex-col items-center py-6">
                  <button
                    type="button"
                    onClick={() => toggleVoiceInput((text) => {
                      setVoiceTranscript(text)
                      setMeetingNotesData({ ...meetingNotesData, notes: text })
                    }, true)}
                    className={`w-20 h-20 rounded-full transition-all flex items-center justify-center ${
                      isListening 
                        ? 'bg-red-500 text-white animate-pulse shadow-xl shadow-red-500/40 scale-110' 
                        : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-105'
                    }`}
                  >
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isListening ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      )}
                    </svg>
                  </button>
                  <p className={`mt-4 text-sm font-medium ${isListening ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                    {isListening ? (
                      <span className="flex items-center gap-2">
                        <span className="flex h-2 w-2">
                          <span className="animate-ping absolute h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        Listening... tap to stop
                      </span>
                    ) : 'Tap to start dictating'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Try saying: "I need to call John tomorrow about the report, send email to Sarah by Friday"
                  </p>
                </div>
                
                {/* Transcription Preview */}
                {voiceTranscript.trim() && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Transcription
                      <span className="ml-2 text-xs text-gray-400 font-normal">(you can edit this)</span>
                    </label>
                    <textarea
                      value={meetingNotesData.notes}
                      onChange={(e) => {
                        setMeetingNotesData({ ...meetingNotesData, notes: e.target.value })
                        setVoiceTranscript(e.target.value)
                      }}
                      placeholder="Your transcription will appear here..."
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-gray-400">
                    We'll extract action items from your voice input
                  </p>
                  <button
                    onClick={handleExtractTasks}
                    disabled={!meetingNotesData.notes.trim() || isExtracting || isListening}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isExtracting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Extracting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Extract Tasks
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Original Paste Notes Mode */
              <>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste your meeting notes below. We'll extract action items and create tasks automatically.
            </p>'''

content = content.replace(meeting_notes_modal_old, meeting_notes_modal_new)

# 4. Close the conditional for paste mode
textarea_section_old = '''            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400">
                Tip: Follow-Up tables are extracted first, then we scan for action items
              </p>
              <button
                onClick={handleExtractTasks}
                disabled={!meetingNotesData.notes.trim() || isExtracting}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExtracting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Extracting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Extract Tasks
                  </>
                )}
              </button>
            </div>
          </div>
        ) : ('''

textarea_section_new = '''            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Tip: Follow-Up tables are extracted first, then we scan for action items
              </p>
              <button
                onClick={handleExtractTasks}
                disabled={!meetingNotesData.notes.trim() || isExtracting}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExtracting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Extracting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Extract Tasks
                  </>
                )}
              </button>
            </div>
              </>
            )}
          </div>
        ) : ('''

content = content.replace(textarea_section_old, textarea_section_new)

# 5. Add keyboard shortcut for voice input
keyboard_shortcuts_old = '''    { keys: [modifier, 'N'], description: 'Import notes' },'''
keyboard_shortcuts_new = '''    { keys: [modifier, 'N'], description: 'Import notes' },
    { keys: [modifier, 'V'], description: 'Voice input' },'''

content = content.replace(keyboard_shortcuts_old, keyboard_shortcuts_new)

# 6. Add keyboard shortcut handler for voice input
shortcut_handler_old = '''      // Cmd/Ctrl/Alt + N for Import Notes
      if (modifier && e.key === 'n') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setMeetingNotesModalOpen(true)
        }
        return
      }'''

shortcut_handler_new = '''      // Cmd/Ctrl/Alt + N for Import Notes
      if (modifier && e.key === 'n') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setVoiceTranscript('')
          setMeetingNotesModalOpen(true)
        }
        return
      }
      
      // Cmd/Ctrl/Alt + V for Voice Input
      if (modifier && e.key === 'v') {
        e.preventDefault()
        if (projects.length > 0) {
          setMeetingNotesData({ ...meetingNotesData, projectId: projects[0]?.id || '', notes: '' })
          setExtractedTasks([])
          setShowExtractedTasks(false)
          setVoiceTranscript(' ')  // Set to trigger voice mode
          setMeetingNotesModalOpen(true)
        }
        return
      }'''

content = content.replace(shortcut_handler_old, shortcut_handler_new)

# 7. Add dark mode styles to the original meeting notes inputs
meeting_notes_textarea_old = '''            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Notes</label>
              <textarea
                value={meetingNotesData.notes}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, notes: e.target.value })}
                placeholder={`Paste your meeting notes here...

Best format - Follow-Up table:
| Follow-Up | Owner | Due Date | Status |
| Review proposal | Sarah | 30/12 | Open |
| Send update email | John | Friday | Open |

Or we can extract from:
• Action items like 'John to send report by Friday'
• TODO: Review the proposal
• @Sarah: Update the timeline`}
                rows={12}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-sm"
              />
            </div>'''

meeting_notes_textarea_new = '''            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Notes</label>
              <textarea
                value={meetingNotesData.notes}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, notes: e.target.value })}
                placeholder={`Paste your meeting notes here...

Best format - Follow-Up table:
| Follow-Up | Owner | Due Date | Status |
| Review proposal | Sarah | 30/12 | Open |
| Send update email | John | Friday | Open |

Or we can extract from:
• Action items like 'John to send report by Friday'
• TODO: Review the proposal
• @Sarah: Update the timeline`}
                rows={12}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono text-sm"
              />
            </div>'''

content = content.replace(meeting_notes_textarea_old, meeting_notes_textarea_new)

# 8. Add dark mode to meeting title input
meeting_title_input_old = '''              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={meetingNotesData.title}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                  placeholder="e.g., Weekly Team Sync"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>'''

meeting_title_input_new = '''              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={meetingNotesData.title}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, title: e.target.value })}
                  placeholder="e.g., Weekly Team Sync"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>'''

content = content.replace(meeting_title_input_old, meeting_title_input_new)

# 9. Add dark mode to meeting date input
meeting_date_input_old = '''              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Date</label>
                <input
                  type="date"
                  value={meetingNotesData.date}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>'''

meeting_date_input_new = '''              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meeting Date</label>
                <input
                  type="date"
                  value={meetingNotesData.date}
                  onChange={(e) => setMeetingNotesData({ ...meetingNotesData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>'''

content = content.replace(meeting_date_input_old, meeting_date_input_new)

# 10. Add dark mode to project select in meeting notes
project_select_old = '''            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={meetingNotesData.projectId}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>'''

project_select_new = '''            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
              <select
                value={meetingNotesData.projectId}
                onChange={(e) => setMeetingNotesData({ ...meetingNotesData, projectId: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>'''

content = content.replace(project_select_old, project_select_new)

# 11. Reset voice state when closing meeting notes modal
close_modal_old = '''      setMeetingNotesModalOpen(false)
      setMeetingNotesData({ title: '', date: new Date().toISOString().split('T')[0], notes: '', projectId: '' })
      setExtractedTasks([])
      setShowExtractedTasks(false)'''

close_modal_new = '''      setMeetingNotesModalOpen(false)
      setMeetingNotesData({ title: '', date: new Date().toISOString().split('T')[0], notes: '', projectId: '' })
      setExtractedTasks([])
      setShowExtractedTasks(false)
      setVoiceTranscript('')
      stopListening()'''

content = content.replace(close_modal_old, close_modal_new)

# Write the modified content
with open(file_path, 'w') as f:
    f.write(content)

print("Voice input feature added successfully!")
print(f"File updated: {file_path}")
