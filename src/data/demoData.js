// Demo data for Try Demo mode
// This data is used when users click "Try Demo" without signing up

const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
const nextWeek = new Date(today)
nextWeek.setDate(nextWeek.getDate() + 7)
const yesterday = new Date(today)
yesterday.setDate(yesterday.getDate() - 1)
const lastWeek = new Date(today)
lastWeek.setDate(lastWeek.getDate() - 7)

const formatDate = (date) => date.toISOString().split('T')[0]

export const DEMO_USER = {
  id: 'demo-user-id',
  email: 'demo@trackli.app',
  user_metadata: {
    display_name: 'Demo User'
  }
}

export const DEMO_PROJECTS = [
  {
    id: 'demo-project-1',
    name: 'Product Launch Q1',
    user_id: 'demo-user-id',
    created_at: lastWeek.toISOString(),
    archived: false,
    team_members: ['Sarah', 'Mike', 'Alex'],
    customers: ['Acme Corp']
  },
  {
    id: 'demo-project-2', 
    name: 'Marketing Campaign',
    user_id: 'demo-user-id',
    created_at: lastWeek.toISOString(),
    archived: false,
    team_members: ['Emma', 'James'],
    customers: []
  }
]

export const DEMO_TASKS = [
  // Product Launch - Backlog
  {
    id: 'demo-task-1',
    title: 'Research competitor pricing',
    description: 'Analyze pricing strategies of top 5 competitors',
    status: 'backlog',
    priority: 'medium',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: null,
    assignee: null,
    created_at: lastWeek.toISOString(),
    subtasks: [],
    energy: 'medium',
    time_estimate: '2h',
    category: 'deliverable'
  },
  {
    id: 'demo-task-2',
    title: 'Draft press release',
    description: '',
    status: 'backlog',
    priority: 'low',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: null,
    assignee: 'Emma',
    created_at: lastWeek.toISOString(),
    subtasks: [],
    energy: 'high',
    time_estimate: '3h'
  },
  
  // Product Launch - To Do
  {
    id: 'demo-task-3',
    title: 'Finalize launch date with stakeholders',
    description: 'Need confirmation from marketing and sales leads',
    status: 'todo',
    priority: 'high',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(tomorrow),
    assignee: 'Sarah',
    created_at: yesterday.toISOString(),
    subtasks: [
      { id: 'st-1', text: 'Send calendar invite', completed: true },
      { id: 'st-2', text: 'Prepare agenda', completed: true },
      { id: 'st-3', text: 'Get final sign-off', completed: false }
    ],
    energy: 'low',
    category: 'meeting_followup'
  },
  {
    id: 'demo-task-4',
    title: 'Review product demo script',
    description: '',
    status: 'todo',
    priority: 'medium',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(nextWeek),
    assignee: 'Mike',
    created_at: yesterday.toISOString(),
    subtasks: [],
    energy: 'medium',
    time_estimate: '1h'
  },
  {
    id: 'demo-task-5',
    title: 'Order swag for launch event',
    description: 'T-shirts, stickers, and notebooks with new branding',
    status: 'todo',
    priority: 'low',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(nextWeek),
    assignee: null,
    created_at: today.toISOString(),
    subtasks: [],
    category: 'admin'
  },
  
  // Product Launch - In Progress
  {
    id: 'demo-task-6',
    title: 'Update landing page copy',
    description: 'Align messaging with new value proposition',
    status: 'inprogress',
    priority: 'critical',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(today),
    assignee: 'Alex',
    created_at: lastWeek.toISOString(),
    subtasks: [
      { id: 'st-4', text: 'Write hero section', completed: true },
      { id: 'st-5', text: 'Update features list', completed: true },
      { id: 'st-6', text: 'Add testimonials', completed: false },
      { id: 'st-7', text: 'Review with team', completed: false }
    ],
    energy: 'high',
    time_estimate: '4h',
    category: 'deliverable'
  },
  {
    id: 'demo-task-7',
    title: 'Set up analytics tracking',
    description: 'Implement event tracking for launch metrics',
    status: 'inprogress',
    priority: 'high',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(tomorrow),
    assignee: 'Mike',
    created_at: yesterday.toISOString(),
    subtasks: [],
    energy: 'medium',
    time_estimate: '2h'
  },
  
  // Product Launch - Review
  {
    id: 'demo-task-8',
    title: 'Final pricing approval',
    description: 'Awaiting sign-off from finance',
    status: 'review',
    priority: 'critical',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(today),
    assignee: 'Sarah',
    created_at: lastWeek.toISOString(),
    subtasks: [],
    category: 'review'
  },
  
  // Product Launch - Done
  {
    id: 'demo-task-9',
    title: 'Design new logo variations',
    description: 'Created 3 variations for different use cases',
    status: 'done',
    priority: 'high',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(yesterday),
    assignee: 'Alex',
    created_at: lastWeek.toISOString(),
    completed_at: yesterday.toISOString(),
    subtasks: [],
    category: 'deliverable'
  },
  {
    id: 'demo-task-10',
    title: 'Competitor analysis report',
    description: 'Comprehensive analysis of market landscape',
    status: 'done',
    priority: 'medium',
    project_id: 'demo-project-1',
    user_id: 'demo-user-id',
    due_date: formatDate(lastWeek),
    assignee: 'Sarah',
    created_at: lastWeek.toISOString(),
    completed_at: lastWeek.toISOString(),
    subtasks: [],
    category: 'deliverable'
  },
  
  // Marketing Campaign - Various statuses
  {
    id: 'demo-task-11',
    title: 'Write blog post about new features',
    description: 'Highlight top 5 features with screenshots',
    status: 'todo',
    priority: 'medium',
    project_id: 'demo-project-2',
    user_id: 'demo-user-id',
    due_date: formatDate(nextWeek),
    assignee: 'Emma',
    created_at: yesterday.toISOString(),
    subtasks: [],
    energy: 'high',
    time_estimate: '3h',
    category: 'deliverable'
  },
  {
    id: 'demo-task-12',
    title: 'Schedule social media posts',
    description: 'Prepare content for Twitter, LinkedIn, and Instagram',
    status: 'inprogress',
    priority: 'high',
    project_id: 'demo-project-2',
    user_id: 'demo-user-id',
    due_date: formatDate(tomorrow),
    assignee: 'James',
    created_at: yesterday.toISOString(),
    subtasks: [
      { id: 'st-8', text: 'Twitter thread', completed: true },
      { id: 'st-9', text: 'LinkedIn article', completed: false },
      { id: 'st-10', text: 'Instagram carousel', completed: false }
    ],
    energy: 'medium',
    category: 'deliverable'
  },
  {
    id: 'demo-task-13',
    title: 'Email newsletter draft',
    description: 'Announcement email to existing customers',
    status: 'review',
    priority: 'high',
    project_id: 'demo-project-2',
    user_id: 'demo-user-id',
    due_date: formatDate(today),
    assignee: 'Emma',
    created_at: lastWeek.toISOString(),
    subtasks: [],
    category: 'email'
  },
  {
    id: 'demo-task-14',
    title: 'Create launch video script',
    description: '',
    status: 'done',
    priority: 'medium',
    project_id: 'demo-project-2',
    user_id: 'demo-user-id',
    due_date: formatDate(yesterday),
    assignee: 'James',
    created_at: lastWeek.toISOString(),
    completed_at: yesterday.toISOString(),
    subtasks: [],
    category: 'deliverable'
  }
]

// Sample meeting notes that can be used to demo the import feature
export const DEMO_MEETING_NOTES = `Weekly Product Sync - Jan 3rd

Attendees: Sarah, Mike, Alex, Emma

| Follow-Up | Owner | Due Date |
| Review landing page draft | Alex | Monday |
| Send analytics requirements | Mike | Tomorrow |
| Schedule customer interviews | Sarah | Next week |
| Update project timeline | Emma | Friday |

Discussion Notes:
- Launch date confirmed for Jan 15th
- Need to finalize pricing by end of week
- Marketing materials 80% complete
- TODO: Book conference room for launch day
- Action: Mike to set up monitoring dashboards
`

export const DEMO_USER_SETTINGS = {
  theme: 'system',
  defaultView: 'board',
  showCompletedTasks: true,
  weekStartsOn: 'monday'
}
