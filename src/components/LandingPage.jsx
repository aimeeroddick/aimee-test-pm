import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'

// Custom Landing Page Icons
const LandingIcons = {
  target: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <circle cx="24" cy="24" r="18" fill="none" stroke="#EF4444" strokeWidth="3" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#EF4444" strokeWidth="3" />
      <circle cx="24" cy="24" r="6" fill="#EF4444" />
      <path d="M38 10 L30 18" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 6 L38 10 L42 6" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  money: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <rect x="4" y="12" width="32" height="20" rx="2" fill="#FCD34D" />
      <rect x="12" y="16" width="36" height="20" rx="2" fill="#F59E0B" />
      <circle cx="30" cy="26" r="6" fill="#FCD34D" />
      <text x="30" y="30" textAnchor="middle" fontSize="10" fill="#92400E" fontWeight="bold">$</text>
    </svg>
  ),
  refresh: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <path d="M24 8 A16 16 0 1 1 8 24" fill="none" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 8 L18 2 M24 8 L18 14" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <circle cx="24" cy="24" r="10" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="24" y1="6" x2="24" y2="10" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle} 24 24)`} />
      ))}
    </svg>
  ),
  home: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <path d="M8 22 L24 8 L40 22 L40 40 L8 40 Z" fill="#F97316" />
      <path d="M24 8 L8 22" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 8 L40 22" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="28" width="12" height="12" fill="#FED7AA" rx="1" />
    </svg>
  ),
  sparkles: () => (
    <svg viewBox="0 0 48 48" className="w-8 h-8">
      <path d="M24 4 L26 18 L40 20 L26 22 L24 36 L22 22 L8 20 L22 18 Z" fill="#A78BFA" />
      <path d="M36 8 L37 14 L43 15 L37 16 L36 22 L35 16 L29 15 L35 14 Z" fill="#C4B5FD" />
      <path d="M12 28 L13 32 L17 33 L13 34 L12 38 L11 34 L7 33 L11 32 Z" fill="#C4B5FD" />
    </svg>
  ),
  clipboard: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="10" y="8" width="28" height="36" rx="3" fill="#D4A574" />
      <rect x="14" y="4" width="20" height="8" rx="2" fill="#B8956E" />
      <rect x="14" y="16" width="20" height="24" rx="1" fill="#FDF6E9" />
      <line x1="17" y1="22" x2="31" y2="22" stroke="#D1D5DB" strokeWidth="2" />
      <line x1="17" y1="28" x2="28" y2="28" stroke="#D1D5DB" strokeWidth="2" />
      <line x1="17" y1="34" x2="31" y2="34" stroke="#D1D5DB" strokeWidth="2" />
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="6" y="10" width="36" height="32" rx="4" fill="#E5E7EB" />
      <rect x="6" y="10" width="36" height="10" rx="4" fill="#EF4444" />
      <text x="24" y="18" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">JUL</text>
      <rect x="12" y="24" width="24" height="14" rx="2" fill="white" />
      <text x="24" y="35" textAnchor="middle" fontSize="14" fill="#374151" fontWeight="bold">17</text>
    </svg>
  ),
}

// Kanban Drag Animation - shows card moving between columns
const KanbanDragAnimation = () => (
  <svg viewBox="0 0 320 180" className="w-full h-48">
    <defs>
      <linearGradient id="kanbanHeader" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#6366F1" />
      </linearGradient>
      <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
      </filter>
    </defs>
    
    {/* Board background */}
    <rect x="10" y="10" width="300" height="160" rx="12" fill="#F8FAFC" />
    
    {/* Column 1: To Do */}
    <rect x="20" y="20" width="85" height="140" rx="8" fill="#F1F5F9" />
    <rect x="25" y="25" width="75" height="20" rx="4" fill="#E2E8F0" />
    <text x="62" y="39" textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="bold">To Do</text>
    
    {/* Static task in To Do */}
    <rect x="28" y="50" width="69" height="45" rx="6" fill="white" filter="url(#cardShadow)" />
    <circle cx="40" cy="62" r="5" fill="#94A3B8" />
    <rect x="50" y="58" width="40" height="6" rx="2" fill="#CBD5E1" />
    <rect x="50" y="68" width="30" height="4" rx="1" fill="#E2E8F0" />
    
    {/* Column 2: In Progress */}
    <rect x="115" y="20" width="85" height="140" rx="8" fill="#EEF2FF" />
    <rect x="120" y="25" width="75" height="20" rx="4" fill="#C7D2FE" />
    <text x="157" y="39" textAnchor="middle" fontSize="9" fill="#4F46E5" fontWeight="bold">In Progress</text>
    
    {/* Animated dragging card */}
    <g>
      {/* Card moving from To Do to In Progress */}
      <rect rx="6" fill="white" filter="url(#cardShadow)" width="69" height="45">
        <animate attributeName="x" values="28;28;75;118;118" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <animate attributeName="y" values="100;100;70;50;50" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <animate attributeName="opacity" values="1;1;0.9;1;1" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
      </rect>
      <circle r="5" fill="#6366F1">
        <animate attributeName="cx" values="40;40;87;130;130" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <animate attributeName="cy" values="112;112;82;62;62" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
      </circle>
      <rect rx="2" fill="#374151" width="40" height="6">
        <animate attributeName="x" values="50;50;97;140;140" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <animate attributeName="y" values="108;108;78;58;58" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
      </rect>
      <rect rx="1" fill="#9CA3AF" width="30" height="4">
        <animate attributeName="x" values="50;50;97;140;140" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <animate attributeName="y" values="118;118;88;68;68" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
      </rect>
      {/* Drag cursor indicator */}
      <g>
        <animate attributeName="opacity" values="0;1;1;0;0" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        <circle r="8" fill="#6366F1" opacity="0.2">
          <animate attributeName="cx" values="62;62;109;152;152" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
          <animate attributeName="cy" values="122;122;92;72;72" dur="3s" repeatCount="indefinite" keyTimes="0;0.2;0.5;0.8;1" />
        </circle>
      </g>
    </g>
    
    {/* Column 3: Done */}
    <rect x="210" y="20" width="85" height="140" rx="8" fill="#F0FDF4" />
    <rect x="215" y="25" width="75" height="20" rx="4" fill="#BBF7D0" />
    <text x="252" y="39" textAnchor="middle" fontSize="9" fill="#16A34A" fontWeight="bold">Done</text>
    
    {/* Completed task in Done */}
    <rect x="218" y="50" width="69" height="45" rx="6" fill="white" filter="url(#cardShadow)" />
    <circle cx="230" cy="62" r="5" fill="#22C55E" />
    <path d="M227 62 L229 64 L233 60" stroke="white" strokeWidth="1.5" fill="none" />
    <rect x="240" y="58" width="40" height="6" rx="2" fill="#CBD5E1" />
    <rect x="240" y="68" width="30" height="4" rx="1" fill="#E2E8F0" />
  </svg>
)

// Calendar Animation - shows task scheduling then calendar with tasks
const CalendarAnimation = () => (
  <svg viewBox="0 0 320 200" className="w-full h-52">
    <defs>
      <linearGradient id="calGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    
    {/* Phase 1: Task being scheduled (fades out) */}
    <g>
      <animate attributeName="opacity" values="1;1;0;0;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.3;0.4;0.9;1" />
      
      {/* Task card */}
      <rect x="20" y="30" width="120" height="55" rx="8" fill="white" stroke="#E5E7EB" />
      <circle cx="38" cy="50" r="6" fill="#F59E0B" />
      <rect x="52" y="44" width="70" height="8" rx="2" fill="#374151" />
      <rect x="52" y="56" width="50" height="6" rx="2" fill="#9CA3AF" />
      
      {/* Calendar button pulse */}
      <rect x="100" y="62" width="28" height="18" rx="4" fill="#FEF3C7">
        <animate attributeName="fill" values="#FEF3C7;#FDE68A;#FEF3C7" dur="1s" repeatCount="indefinite" />
      </rect>
      <text x="114" y="74" textAnchor="middle" fontSize="10" fill="#D97706">🗓</text>
      
      {/* Click ripple */}
      <circle cx="114" cy="71" r="10" fill="none" stroke="#F59E0B" strokeWidth="2">
        <animate attributeName="r" values="10;20;20" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0" dur="1.5s" repeatCount="indefinite" />
      </circle>
      
      {/* Arrow */}
      <path d="M150 57 L170 57" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M167 53 L173 57 L167 61" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" />
      </path>
      
      {/* Mini schedule modal */}
      <rect x="180" y="20" width="120" height="80" rx="8" fill="white" stroke="#E5E7EB" />
      <text x="240" y="38" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="bold">Schedule Task</text>
      <rect x="190" y="45" width="100" height="18" rx="4" fill="#FEF3C7" />
      <text x="240" y="57" textAnchor="middle" fontSize="8" fill="#92400E">Thu, Jan 2 • 9:00 AM</text>
      <rect x="210" y="70" width="60" height="20" rx="6" fill="url(#calGradient)" />
      <text x="240" y="84" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">Schedule</text>
    </g>
    
    {/* Phase 2: Full calendar view (fades in) */}
    <g>
      <animate attributeName="opacity" values="0;0;1;1;1" dur="5s" repeatCount="indefinite" keyTimes="0;0.3;0.5;0.9;1" />
      
      {/* Calendar container */}
      <rect x="20" y="15" width="280" height="170" rx="10" fill="white" stroke="#E5E7EB" />
      
      {/* Calendar header */}
      <rect x="20" y="15" width="280" height="30" rx="10" fill="#FFFBEB" />
      <text x="160" y="35" textAnchor="middle" fontSize="11" fill="#92400E" fontWeight="bold">January 2026</text>
      
      {/* Day headers */}
      <text x="45" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Mon</text>
      <text x="85" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Tue</text>
      <text x="125" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Wed</text>
      <text x="165" y="55" textAnchor="middle" fontSize="8" fill="#F59E0B" fontWeight="bold">Thu</text>
      <text x="205" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Fri</text>
      <text x="245" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Sat</text>
      <text x="280" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Sun</text>
      
      {/* Calendar grid - Week 1 */}
      <line x1="30" y1="62" x2="290" y2="62" stroke="#F3F4F6" />
      
      {/* Date numbers */}
      <text x="125" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">1</text>
      <text x="165" y="72" textAnchor="middle" fontSize="9" fill="#F59E0B" fontWeight="bold">2</text>
      <text x="205" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">3</text>
      <text x="245" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">4</text>
      <text x="280" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">5</text>
      
      {/* Task on Wed 1st */}
      <rect x="108" y="76" width="34" height="14" rx="3" fill="#DBEAFE" />
      <text x="125" y="86" textAnchor="middle" fontSize="6" fill="#1E40AF">Review</text>
      
      {/* Tasks on Thu 2nd (today - highlighted) */}
      <rect x="145" y="62" width="40" height="50" rx="0" fill="#FEF3C7" opacity="0.3" />
      <rect x="148" y="76" width="34" height="14" rx="3" fill="#F59E0B">
        <animate attributeName="opacity" values="0;0;1;1" dur="5s" repeatCount="indefinite" keyTimes="0;0.4;0.6;1" />
      </rect>
      <text x="165" y="86" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">
        <animate attributeName="opacity" values="0;0;1;1" dur="5s" repeatCount="indefinite" keyTimes="0;0.4;0.6;1" />
        9:00 AM
      </text>
      <rect x="148" y="93" width="34" height="14" rx="3" fill="#A78BFA" />
      <text x="165" y="103" textAnchor="middle" fontSize="6" fill="white">Meeting</text>
      
      {/* Task on Fri 3rd */}
      <rect x="188" y="76" width="34" height="14" rx="3" fill="#86EFAC" />
      <text x="205" y="86" textAnchor="middle" fontSize="6" fill="#166534">Deploy</text>
      
      {/* Week 2 row */}
      <line x1="30" y1="115" x2="290" y2="115" stroke="#F3F4F6" />
      <text x="45" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">6</text>
      <text x="85" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">7</text>
      <text x="125" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">8</text>
      <text x="165" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">9</text>
      <text x="205" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">10</text>
      
      {/* Tasks in week 2 */}
      <rect x="28" y="132" width="34" height="14" rx="3" fill="#FCA5A5" />
      <text x="45" y="142" textAnchor="middle" fontSize="6" fill="#991B1B">Sprint</text>
      <rect x="68" y="132" width="34" height="14" rx="3" fill="#93C5FD" />
      <text x="85" y="142" textAnchor="middle" fontSize="6" fill="#1E40AF">Design</text>
      <rect x="148" y="132" width="34" height="14" rx="3" fill="#FDE68A" />
      <text x="165" y="142" textAnchor="middle" fontSize="6" fill="#92400E">Plan</text>
      
      {/* Week 3 row */}
      <line x1="30" y1="155" x2="290" y2="155" stroke="#F3F4F6" />
      <text x="45" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">13</text>
      <text x="85" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">14</text>
      <text x="125" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">15</text>
    </g>
  </svg>
)

// GitHub Release URLs - Update these when you publish releases
const DOWNLOAD_URLS = {
  mac: 'https://github.com/aimeeroddick/aimee-test-pm/releases/latest/download/Trackli.dmg',
  windows: 'https://github.com/aimeeroddick/aimee-test-pm/releases/latest/download/Trackli-Setup.exe',
}

// Download Buttons Component with OS Detection
const DownloadButtons = () => {
  const [detectedOS, setDetectedOS] = useState('mac')
  
  useEffect(() => {
    // Detect OS from user agent
    const userAgent = window.navigator.userAgent.toLowerCase()
    if (userAgent.includes('win')) {
      setDetectedOS('windows')
    } else if (userAgent.includes('mac')) {
      setDetectedOS('mac')
    }
    // Default to mac for other OS (Linux users can use web version)
  }, [])
  
  const primaryOS = detectedOS
  const secondaryOS = detectedOS === 'mac' ? 'windows' : 'mac'
  
  const osConfig = {
    mac: {
      name: 'macOS',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      ),
      downloadUrl: DOWNLOAD_URLS.mac,
      fileName: 'Trackli.dmg'
    },
    windows: {
      name: 'Windows',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .09v6.81l-6-1.15V13zm17 .25V22l-10-1.91V13.1l10 .15z"/>
        </svg>
      ),
      downloadUrl: DOWNLOAD_URLS.windows,
      fileName: 'Trackli-Setup.exe'
    }
  }
  
  const primary = osConfig[primaryOS]
  const secondary = osConfig[secondaryOS]
  
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      {/* Primary Download Button */}
      <a
        href={primary.downloadUrl}
        className="group flex items-center gap-3 px-8 py-4 bg-white text-gray-900 rounded-xl font-semibold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
      >
        {primary.icon}
        <span>Download for {primary.name}</span>
        <svg className="w-4 h-4 text-gray-400 group-hover:translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </a>
      
      {/* Secondary Download Link */}
      <a
        href={secondary.downloadUrl}
        className="flex items-center gap-2 px-6 py-3 text-gray-300 hover:text-white transition-colors"
      >
        {secondary.icon}
        <span>Download for {secondary.name}</span>
      </a>
    </div>
  )
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [notes, setNotes] = useState('')
  const [extractedTasks, setExtractedTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)

  // Full task extraction logic (copied from KanbanBoard)
  const isUSDateFormat = () => {
    try {
      const formatted = new Date(2000, 0, 15).toLocaleDateString()
      return formatted.startsWith('1')
    } catch {
      return false
    }
  }

  const parseDateString = (dateStr) => {
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

  const extractTasks = (text) => {
    // Try table format first
    const tableResult = extractFromFollowUpTable(text)
    if (tableResult.length > 0) {
      return tableResult
    }
    
    // Fall back to pattern matching
    return extractFromPatterns(text.split('\n'))
  }

  const handleExtract = () => {
    if (!notes.trim()) return
    setIsExtracting(true)
    
    setTimeout(() => {
      const tasks = extractTasks(notes)
      setExtractedTasks(tasks)
      setIsExtracting(false)
    }, 500)
  }

  const resetExtractor = () => {
    setNotes('')
    setExtractedTasks([])
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 pt-[env(safe-area-inset-top)] ${
        scrolled ? 'bg-white/90 backdrop-blur-lg shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-14 sm:h-14">
              <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                <defs>
                  <linearGradient id="landing-header-left" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4F46E5"/>
                    <stop offset="100%" stopColor="#7C3AED"/>
                  </linearGradient>
                  <linearGradient id="landing-header-right" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9333EA"/>
                    <stop offset="100%" stopColor="#EC4899"/>
                  </linearGradient>
                </defs>
                <path d="M6 18L28 6L28 38L6 26Z" fill="url(#landing-header-left)"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="url(#landing-header-right)"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="#DDD6FE"/>
                <path d="M18 20L25 27L38 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Trackli
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">
              Features
            </a>
            <Link
              to="/login"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/login?signup=true"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-transform duration-200 font-medium shadow-lg shadow-indigo-500/25"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main>
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background gradient blob */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-indigo-200/40 via-purple-200/40 to-pink-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full text-sm font-medium text-indigo-700 mb-8">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Now in beta
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Task management that{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              just <span className="italic">works</span>
            </span>
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Tired of tools that are either too simple or overwhelmingly complex? 
            Trackli is the sweet spot: powerful enough for real work, simple enough to actually use.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login?signup=true"
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-transform duration-200 font-semibold shadow-xl shadow-indigo-500/25 hover:-translate-y-0.5"
            >
              Get Started
            </Link>
            <a
              href="#try-it"
              className="px-8 py-4 bg-white text-indigo-600 rounded-xl border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Try It Now
            </a>
            <a
              href="#demo"
              className="px-8 py-4 bg-white text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all font-semibold flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Demo
            </a>
          </div>
        </div>

        {/* App Preview */}
        <div className="max-w-6xl mx-auto mt-16 px-4">
          <div className="relative">
            {/* Gradient glow behind screenshot */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
            
            {/* Screenshot */}
            <img 
              src="/screenshots/board.png" 
              alt="Trackli Kanban Board" 
              className="relative w-full rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Try It Now Section - Interactive Extractor */}
      <section id="try-it" className="py-20 px-6 bg-gradient-to-b from-white to-indigo-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              AI-Powered Productivity
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Paste your notes. Get tasks.
            </h2>
            <p className="text-lg text-gray-600 max-w-xl mx-auto">
              Meeting notes, emails, whatever — paste it below and watch the magic happen.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
            
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              {extractedTasks.length === 0 ? (
                // Input state
                <div className="p-6">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={`Paste your meeting notes or email here...

Examples we can extract from:
• Follow-up tables from Teams/Outlook
• "John to send the report by Friday"
• Action items and bullet points
• @sarah: Review the proposal`}
                    className="w-full h-48 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-700 placeholder:text-gray-400"
                  />
                  <div className="mt-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <p className="text-sm text-gray-500">
                      ✨ Works with tables, bullet points, and natural language
                    </p>
                    <button
                      onClick={handleExtract}
                      disabled={!notes.trim() || isExtracting}
                      className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isExtracting ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Extracting...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Extract Tasks
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                // Results state
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      Found {extractedTasks.length} task{extractedTasks.length !== 1 ? 's' : ''}!
                    </h3>
                    <button
                      onClick={resetExtractor}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Try again
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {extractedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
                      >
                        <div className="w-5 h-5 rounded border-2 border-indigo-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{task.title}</p>
                          {(task.assignee || task.dueDate) && (
                            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                              {task.assignee && (
                                <span className="flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  {task.assignee}
                                </span>
                              )}
                              {task.assignee && task.dueDate && <span className="mx-1">•</span>}
                              {task.dueDate && (
                                <span className="flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {task.dueDate}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-center text-gray-600 mb-4">
                      Want to save these tasks and track them?
                    </p>
                    <Link
                      to="/login?signup=true"
                      className="block w-full px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-lg shadow-indigo-500/25 text-center"
                    >
                      Save to Trackli — Free
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <p className="text-center text-sm text-gray-500 mt-6">
            Built by a PM, for PMs and busy professionals
          </p>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              Why Trackli?
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Built different, on purpose
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We designed Trackli to solve the problems we kept running into with other tools.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                iconComponent: 'target',
                title: 'Depth without the learning curve',
                subtitle: "Simple tools leave you wanting more. Powerful ones take weeks to learn.",
                highlight: 'Trackli gives you both.',
              },
              {
                iconComponent: 'money',
                title: 'Everything included from day one',
                subtitle: 'Calendar view? Timeline? Premium only... elsewhere.',
                highlight: 'Every feature, no paywalls.',
              },
              {
                iconComponent: 'refresh',
                title: 'Built to stick',
                subtitle: '73% abandon their productivity app within 30 days.',
                highlight: 'Intuitive from the first click.',
              },
              {
                iconComponent: 'sun',
                title: 'Focus on what matters today',
                subtitle: 'Most tools show everything, all the time.',
                highlight: 'My Day keeps you focused.',
              },
              {
                iconComponent: 'home',
                title: 'Works for work and life',
                subtitle: 'Enterprise software for tracking groceries?',
                highlight: 'Clean for personal, capable for work.',
              },
              {
                iconComponent: 'sparkles',
                title: 'A tool you actually enjoy',
                subtitle: 'Cluttered interfaces. Outdated aesthetics.',
                highlight: 'Modern design that stays out of your way.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-100"
              >
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
                  {card.iconComponent && LandingIcons[card.iconComponent] ? LandingIcons[card.iconComponent]() : card.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{card.title}</h3>
                <p className="text-gray-500 text-sm mb-2">{card.subtitle}</p>
                <p className="text-indigo-600 font-medium text-sm">{card.highlight}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need, nothing you don't
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Powerful task management that respects your time and attention.
            </p>
          </div>

          {/* Feature 1: My Day */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <p className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-3">
                Daily Focus
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                My Day: Your daily command center
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Start each day with a clear view of what matters. Add tasks from any project to today's focus, track your progress, and actually finish what you start.
              </p>
              <ul className="space-y-3">
                {[
                  'Add tasks from any project to your day',
                  'Visual progress tracking',
                  'Keyboard shortcuts for power users',
                  'Satisfying completion animations',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-600">
                    <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 overflow-hidden">
              <img 
                src="/screenshots/my-day.png" 
                alt="Trackli My Day View" 
                className="w-full rounded-xl shadow-lg"
              />
            </div>
          </div>

          {/* Feature 2: Kanban */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            <div className="order-2 lg:order-1 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 flex items-center justify-center">
              <KanbanDragAnimation />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
                Visual Workflow
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Kanban boards that scale with you
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Intuitive drag-and-drop boards that help you visualize your work. No artificial limits, no surprise paywalls.
              </p>
              <ul className="space-y-3">
                {[
                  'Unlimited projects and boards',
                  'Organized workflow columns',
                  'Subtasks, attachments, and due dates',
                  'Filter and search across everything',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-600">
                    <svg className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature 3: Calendar */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3">
                Time Awareness
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Schedule tasks on a calendar
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                See your tasks in a calendar view. Drag to schedule, set time estimates, and never miss a deadline again.
              </p>
              <ul className="space-y-3">
                {[
                  'Calendar view included free',
                  'Recurring tasks for routines',
                  'Time estimates and tracking',
                  'Import and export via CSV',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-600">
                    <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 overflow-hidden">
              <img 
                src="/screenshots/calendar.png" 
                alt="Trackli Calendar View" 
                className="w-full rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* More Features Grid */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              And so much more
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Features that save you time
            </h2>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ),
                title: "Voice to Task",
                description: "Speak your tasks on mobile. Perfect for capturing ideas on the go.",
                bgColor: "bg-indigo-100",
                textColor: "text-indigo-600"
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: "Quick Add",
                description: "Add tasks in seconds with smart parsing. Type naturally, we'll figure it out.",
                bgColor: "bg-amber-100",
                textColor: "text-amber-600"
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: "AI Task Breakdown",
                description: "Stuck on a big task? AI suggests subtasks to break it into manageable pieces.",
                bgColor: "bg-purple-100",
                textColor: "text-purple-600"
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: "Meeting Notes Import",
                description: "Paste meeting notes or emails, extract action items automatically.",
                bgColor: "bg-green-100",
                textColor: "text-green-600"
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ),
                title: "Dark Mode",
                description: "Easy on the eyes for late night planning sessions.",
                bgColor: "bg-gray-100",
                textColor: "text-gray-600"
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                ),
                title: "Mobile Optimized",
                description: "Full-featured mobile experience. Manage tasks anywhere.",
                bgColor: "bg-pink-100",
                textColor: "text-pink-600"
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center ${feature.textColor} mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
              Coming Soon
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Even more on the way
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We're building the integrations and features you've been asking for.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Calendar Integration</h3>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Connect Google Calendar or Outlook. See your meetings and tasks together, block time for deep work.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                In development
              </span>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Email to Task</h3>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Forward any email to your Trackli inbox and it becomes a task. Simple as that.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                In development
              </span>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">AI Weekly Summary</h3>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Get an AI-generated status report based on your completed tasks. Perfect for standups.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
                Planned
              </span>
            </div>
            
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Zapier Integration</h3>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Connect Trackli to 5,000+ apps. Automate task creation from Slack, Salesforce, and more.
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                Planned
              </span>
            </div>
          </div>
          
          <p className="text-center text-gray-500 text-sm mt-8">
            Have a feature request? <a href="mailto:hello@gettrackli.com" className="text-indigo-600 hover:text-indigo-700 font-medium">Let us know</a>
          </p>
        </div>
      </section>

      {/* Pricing Section - TODO: Add back when pricing is finalized */}

      {/* Interactive Demo Section */}
      <section id="demo" className="py-16 px-6 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
      <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
      Interactive Tour
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
      See Trackli in Action
      </h2>
      <p className="text-gray-600 max-w-xl mx-auto">
      Take a 2-minute tour of the key features — boards, My Day, calendar, and more.
      </p>
      </div>
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
      <div style={{ position: 'relative', paddingBottom: 'calc(58.947368% + 41px)', height: '0px', width: '100%' }}>
      <iframe 
      src="https://demo.arcade.software/Sy0Ssp9rMh2oc9q50W6K?embed&embed_mobile=tab&embed_desktop=inline&show_copy_link=true"
      title="Trackli Product Tour"
      frameBorder="0"
      loading="lazy"
      webkitallowfullscreen="true"
      mozallowfullscreen="true"
      allowFullScreen
      allow="clipboard-write"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', colorScheme: 'light' }}
      />
      </div>
      </div>
      </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Ready to get things done?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Start organizing your work today. No credit card required.
          </p>
          <Link
            to="/login?signup=true"
            className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-transform duration-200 font-semibold shadow-xl shadow-indigo-500/25 hover:-translate-y-0.5"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Download Desktop App Section - TEMPORARILY HIDDEN
      <section id="download" className="py-20 px-6 bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-indigo-300 text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Desktop App
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Take Trackli everywhere
          </h2>
          <p className="text-lg text-gray-300 mb-10 max-w-2xl mx-auto">
            Download the desktop app for a faster, native experience. 
            Works offline and syncs automatically when you're back online.
          </p>
          
          <DownloadButtons />
          
          <p className="mt-8 text-sm text-gray-500">
            Also available on the web at{' '}
            <a href="https://gettrackli.com" className="text-indigo-400 hover:text-indigo-300">gettrackli.com</a>
          </p>
        </div>
      </section>
      */}

      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8">
              <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                <defs>
                  <linearGradient id="landing-footer-left" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4F46E5"/>
                    <stop offset="100%" stopColor="#7C3AED"/>
                  </linearGradient>
                  <linearGradient id="landing-footer-right" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9333EA"/>
                    <stop offset="100%" stopColor="#EC4899"/>
                  </linearGradient>
                </defs>
                <path d="M6 18L28 6L28 38L6 26Z" fill="url(#landing-footer-left)"/>
                <path d="M28 6L50 18L50 46L28 38Z" fill="url(#landing-footer-right)"/>
                <path d="M6 18L28 6L50 18L28 30Z" fill="#DDD6FE"/>
                <path d="M18 20L25 27L38 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Trackli
            </span>
          </div>
          <div className="flex gap-8">
            <Link to="/privacy" className="text-gray-500 hover:text-gray-700 transition-colors">Privacy</Link>
            <Link to="/terms" className="text-gray-500 hover:text-gray-700 transition-colors">Terms</Link>
            <a href="mailto:support@gettrackli.com" className="text-gray-500 hover:text-gray-700 transition-colors">Contact</a>
          </div>
          <p className="text-gray-400 text-sm">© {new Date().getFullYear()} Trackli. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
