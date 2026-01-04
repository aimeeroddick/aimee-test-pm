// Shared constants for Kanban components

export const ENERGY_LEVELS = {
  high: { bg: '#FEE2E2', text: '#DC2626', icon: '▰▰▰', label: 'High Effort' },
  medium: { bg: '#FEF3C7', text: '#D97706', icon: '▰▰', label: 'Medium Effort' },
  low: { bg: '#D1FAE5', text: '#059669', icon: '▰', label: 'Low Effort' },
}

// Consistent Button Styles
export const BTN = {
  base: 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  sizes: {
    xs: 'px-2 py-1 text-xs rounded-lg gap-1',
    sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-xl gap-2',
  },
  variants: {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600 active:bg-indigo-700 focus:ring-indigo-500 shadow-sm hover:shadow',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
    danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 focus:ring-red-500 shadow-sm hover:shadow',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 focus:ring-amber-500 shadow-sm hover:shadow',
    success: 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700 focus:ring-green-500 shadow-sm hover:shadow',
    ghost: 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-400 dark:text-gray-300 dark:hover:bg-gray-700',
    outline: 'border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 focus:ring-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-900/20',
  },
}

// Helper to compose button classes
export const btn = (variant = 'primary', size = 'md', extra = '') =>
  `${BTN.base} ${BTN.sizes[size]} ${BTN.variants[variant]} ${extra}`.trim()

export const CATEGORIES = [
  { id: 'meeting_followup', label: 'Meeting Follow-up', color: '#8B5CF6' },
  { id: 'email', label: 'Email', color: '#3B82F6' },
  { id: 'deliverable', label: 'Deliverable', color: '#10B981' },
  { id: 'admin', label: 'Admin', color: '#4B5563' },
  { id: 'review', label: 'Review/Approval', color: '#F59E0B' },
  { id: 'call', label: 'Call/Meeting', color: '#EC4899' },
  { id: 'research', label: 'Research', color: '#14B8A6' },
]

export const SOURCES = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'meeting', label: 'Meeting', icon: '👥' },
  { id: 'slack', label: 'Slack/Teams', icon: '💬' },
  { id: 'ad_hoc', label: 'Ad-hoc', icon: '💡' },
  { id: 'project_plan', label: 'Project Plan', icon: '📋' },
  { id: 'client_request', label: 'Client Request', icon: '🎯' },
]

export const RECURRENCE_TYPES = [
  { id: null, label: 'No recurrence' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Bi-weekly (every 2 weeks)' },
  { id: 'monthly', label: 'Monthly' },
]

export const COLUMN_COLORS = {
  backlog: '#9CA3AF',
  todo: '#3B82F6',
  in_progress: '#EC4899',
  blocked: '#EF4444',
  done: '#10B981',
}

export const COLUMNS = [
  { id: 'backlog', title: 'Backlog', subtitle: 'Future work', color: COLUMN_COLORS.backlog },
  { id: 'todo', title: 'To Do', subtitle: 'Ready to start', color: COLUMN_COLORS.todo },
  { id: 'in_progress', title: 'In Progress', subtitle: 'Active work', color: COLUMN_COLORS.in_progress },
  { id: 'done', title: 'Done', subtitle: 'Completed', color: COLUMN_COLORS.done },
]

export const DONE_DISPLAY_LIMIT = 5
export const BACKLOG_DISPLAY_LIMIT = 10

// Customer colors for auto-assignment
export const CUSTOMER_COLORS = [
  { bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
  { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD' },
  { bg: '#D1FAE5', text: '#059669', border: '#6EE7B7' },
  { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' },
  { bg: '#FCE7F3', text: '#DB2777', border: '#F9A8D4' },
  { bg: '#E0E7FF', text: '#4F46E5', border: '#A5B4FC' },
  { bg: '#CCFBF1', text: '#0D9488', border: '#5EEAD4' },
  { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
  { bg: '#F3E8FF', text: '#9333EA', border: '#D8B4FE' },
  { bg: '#CFFAFE', text: '#0891B2', border: '#67E8F9' },
]

// Project folder colors
export const PROJECT_COLORS = [
  { id: 'amber', color: '#F59E0B', label: 'Amber' },
  { id: 'orange', color: '#F97316', label: 'Orange' },
  { id: 'red', color: '#EF4444', label: 'Red' },
  { id: 'pink', color: '#EC4899', label: 'Pink' },
  { id: 'purple', color: '#A855F7', label: 'Purple' },
  { id: 'indigo', color: '#6366F1', label: 'Indigo' },
  { id: 'blue', color: '#3B82F6', label: 'Blue' },
  { id: 'cyan', color: '#06B6D4', label: 'Cyan' },
  { id: 'teal', color: '#14B8A6', label: 'Teal' },
  { id: 'green', color: '#22C55E', label: 'Green' },
]

export const DEFAULT_PROJECT_COLOR = '#F59E0B' // Amber

// Smart date shortcuts for UI
export const DATE_SHORTCUTS = [
  { label: 'Today', getValue: () => new Date().toISOString().split('T')[0] },
  { label: 'Tomorrow', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] } },
  { label: 'Next Week', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] } },
  { label: 'Next Month', getValue: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0] } },
]
