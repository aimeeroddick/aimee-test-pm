import { useState, useEffect } from 'react'
import { PROJECT_COLORS, DEFAULT_PROJECT_COLOR, btn } from '../constants'
import { L } from '../../../lib/locale'

const ProjectModal = ({ isOpen, onClose, project, onSave, onDelete, onArchive, loading, onShowConfirm, user }) => {
  const [formData, setFormData] = useState({ name: '', color: DEFAULT_PROJECT_COLOR, members: [], customers: [] })
  const [newMember, setNewMember] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  
  useEffect(() => {
    if (project) {
      setFormData({ 
        name: project.name,
        color: project.color || DEFAULT_PROJECT_COLOR,
        members: [...(project.members || [])],
        customers: [...(project.customers || [])],
      })
    } else {
      setFormData({ name: '', color: DEFAULT_PROJECT_COLOR, members: [], customers: [] })
    }
    setNewMember('')
    setNewCustomer('')
  }, [project, isOpen])
  
  // Ctrl/Cmd + S to save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && isOpen) {
        e.preventDefault()
        document.querySelector('form')?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
  
  const addMember = () => {
    if (newMember.trim() && !formData.members.includes(newMember.trim())) {
      setFormData({ ...formData, members: [...formData.members, newMember.trim()] })
      setNewMember('')
    }
  }
  
  const removeMember = (member) => {
    setFormData({ ...formData, members: formData.members.filter((m) => m !== member) })
  }
  
  const addJustMe = () => {
    const myName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Me'
    if (!formData.members.includes(myName)) {
      setFormData({ ...formData, members: [...formData.members, myName] })
    }
  }
  
  const addCustomer = () => {
    if (newCustomer.trim() && !formData.customers.includes(newCustomer.trim())) {
      setFormData({ ...formData, customers: [...formData.customers, newCustomer.trim()] })
      setNewCustomer('')
    }
  }
  
  const removeCustomer = (customer) => {
    setFormData({ ...formData, customers: formData.customers.filter((c) => c !== customer) })
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSave({ ...formData, id: project?.id })
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project ? 'Edit Project' : 'New Project'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Project Name *</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="Enter project name"
          />
        </div>
        
        <div>
          <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Project {L.Color}</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFormData({ ...formData, color: c.color })}
                className={`w-8 h-8 rounded-lg transition-all ${formData.color === c.color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c.color }}
                title={c.label}
              />
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Team Members</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMember())}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="Add team member"
            />
            <button type="button" onClick={addMember} className="px-3 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm">
              Add
            </button>
            <button type="button" onClick={addJustMe} className="px-3 py-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium">
              Just Me
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.members.map((member) => (
              <span key={member} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                {member}
                <button type="button" onClick={() => removeMember(member)} className="hover:text-indigo-900">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-semibold text-indigo-600/80 dark:text-indigo-400 uppercase tracking-wider mb-1.5">Customers/Clients</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newCustomer}
              onChange={(e) => setNewCustomer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomer())}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="Add customer/client"
            />
            <button type="button" onClick={addCustomer} className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.customers.map((customer) => (
              <span key={customer} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-sm">
                {customer}
                <button type="button" onClick={() => removeCustomer(customer)} className="hover:text-purple-900">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex gap-3 pt-4">
          {project && (
            <>
              <button
                type="button"
                onClick={() => {
                  onShowConfirm({
                    title: 'Delete Project',
                    message: `Delete "${project.name}" and all its tasks? This cannot be undone.`,
                    confirmLabel: 'Delete Project',
                    confirmStyle: 'danger',
                    icon: '🗑️',
                    onConfirm: () => {
                      onDelete(project.id)
                      onClose()
                    }
                  })
                }}
                disabled={loading}
                className="px-4 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => { onArchive(project.id); onClose() }}
                disabled={loading}
                className="px-4 py-2.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors disabled:opacity-50"
              >
                {project.archived ? 'Unarchive' : 'Archive'}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 active:bg-indigo-700 transition-all font-medium disabled:opacity-50 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {loading ? 'Saving...' : project ? <><u>S</u>ave Changes</> : <><u>S</u>ave Project</>}
          </button>
        </div>
      </form>
      
    </Modal>
  )
}


// Main KanbanBoard Component

export default ProjectModal
