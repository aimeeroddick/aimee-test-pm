#!/usr/bin/env python3
"""
Script to update TaskModal to remove tabs and make sections collapsible.
This makes targeted replacements to avoid syntax errors.
"""

import re

# Read the file
with open('src/components/KanbanBoard.jsx', 'r') as f:
    content = f.read()

# 1. Remove the tab bar (replace with simpler header)
old_tab_bar = '''<form onSubmit={handleSubmit}>
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
          {[
            { id: 'details', label: 'Details', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
            { id: 'additional', label: 'More', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
            { id: 'subtasks', label: 'Subtasks', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
            { id: 'dependencies', label: 'Deps', labelFull: 'Dependencies', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> },
            { id: 'activity', label: 'Activity', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.id 
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : ''}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.labelFull || tab.label}</span>
            </button>
          ))}
        </div>
        
        {activeTab === 'details' && (
          <div className="space-y-3">'''

new_form_start = '''<form onSubmit={handleSubmit}>
        {/* Core Fields - Always Visible */}
        <div className="space-y-3">'''

content = content.replace(old_tab_bar, new_form_start)
print("✓ Removed tab bar")

# 2. Find and remove the closing of the details conditional before subtasks
# The pattern is: </div>\n        )}\n        \n        {activeTab === 'subtasks'
old_details_close = '''          </div>
        )}
        
        {activeTab === 'subtasks' && ('''

new_details_to_subtasks = '''          </div>
          
          {/* ═══════════ Collapsible Sections ═══════════ */}
          
          {/* Subtasks Section */}
          <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, subtasks: !prev.subtasks }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subtasks</span>
                {subtasks.length > 0 && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{subtasks.filter(s => s.completed).length}/{subtasks.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedSections.subtasks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.subtasks && ('''

content = content.replace(old_details_close, new_details_to_subtasks)
print("✓ Added subtasks collapsible header")

# 3. Close subtasks section and start More section
old_subtasks_to_more = '''            </div>
          </div>
        )}
        
        {activeTab === 'additional' && (
          <div className="space-y-4">
            {/* Time Estimate & Assignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Estimate</label>'''

new_subtasks_to_more = '''            </div>
          </div>
            )}
          </div>
          
          {/* More Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, more: !prev.more }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">More Options</span>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedSections.more ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.more && (
              <div className="p-4 space-y-4">
            {/* Category & Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>'''

content = content.replace(old_subtasks_to_more, new_subtasks_to_more)
print("✓ Added More section header (removed Time Estimate & Assignee)")

# 4. Close More section and start Dependencies
old_more_to_deps = '''          </div>
        )}
        
        {activeTab === 'dependencies' && (
          <div className="space-y-4">
            {/* Header */}'''

new_more_to_deps = '''              </div>
            )}
          </div>
          
          {/* Dependencies Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, dependencies: !prev.dependencies }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dependencies</span>
                {selectedDependencies.length > 0 && <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">{selectedDependencies.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedSections.dependencies ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.dependencies && (
              <div className="p-4 space-y-4">'''

content = content.replace(old_more_to_deps, new_more_to_deps)
print("✓ Added Dependencies collapsible header")

# 5. Close Dependencies section and start Activity
old_deps_to_activity = '''          </div>
        )}
        
        {activeTab === 'activity' && (
          <div className="space-y-4">'''

new_deps_to_activity = '''              </div>
            )}
          </div>
          
          {/* Activity Section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedSections(prev => ({ ...prev, activity: !prev.activity }))}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activity</span>
                {comments.length > 0 && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">{comments.length}</span>}
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedSections.activity ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedSections.activity && (
              <div className="p-4 space-y-4">'''

content = content.replace(old_deps_to_activity, new_deps_to_activity)
print("✓ Added Activity collapsible header")

# 6. Close Activity section before the form buttons
old_activity_end = '''              )}
            </div>
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 sm:gap-3 pt-6 mt-6 border-t border-gray-100 dark:border-gray-700">'''

new_activity_end = '''              )}
            </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 sm:gap-3 pt-6 mt-6 border-t border-gray-100 dark:border-gray-700">'''

content = content.replace(old_activity_end, new_activity_end)
print("✓ Closed Activity section properly")

# 7. Add expandedSections state
old_state = '''const [activeTab, setActiveTab] = useState('details')'''
new_state = '''const [activeTab, setActiveTab] = useState('details')
  const [expandedSections, setExpandedSections] = useState({})'''

content = content.replace(old_state, new_state)
print("✓ Added expandedSections state")

# Write the file
with open('src/components/KanbanBoard.jsx', 'w') as f:
    f.write(content)

print("\n✅ All replacements complete!")
print("Run 'npm run build' to verify syntax")
