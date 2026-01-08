import { Link } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { track } from '@vercel/analytics'
import { supabase } from '../lib/supabase'
import { L } from '../lib/locale'
import { extractTasks } from '../utils/taskExtraction'

// ============================================================================
// CUSTOM SVG ICONS - No emojis, all custom vectors
// ============================================================================
const Icons = {
  // Feature icons
  sun: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="10" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line key={i} x1="24" y1="6" x2="24" y2="10" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle} 24 24)`} />
      ))}
    </svg>
  ),
  
  sparkles: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <path d="M24 4 L26 18 L40 20 L26 22 L24 36 L22 22 L8 20 L22 18 Z" fill="#A78BFA" />
      <path d="M36 8 L37 14 L43 15 L37 16 L36 22 L35 16 L29 15 L35 14 Z" fill="#C4B5FD" />
      <path d="M12 28 L13 32 L17 33 L13 34 L12 38 L11 34 L7 33 L11 32 Z" fill="#C4B5FD" />
    </svg>
  ),
  
  target: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#EF4444" strokeWidth="3" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#EF4444" strokeWidth="3" />
      <circle cx="24" cy="24" r="6" fill="#EF4444" />
      <path d="M38 10 L30 18" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 6 L38 10 L42 6" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  
  lightning: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  
  document: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  
  microphone: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  
  calendar: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  
  brain: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  ),
  
  check: ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  
  arrowRight: ({ className = "w-4 h-4" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  
  play: ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  
  refresh: ({ className = "w-4 h-4" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  
  mail: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  
  moon: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  
  smartphone: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  
  bell: ({ className = "w-4 h-4" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  
  x: ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  
  chevronDown: ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  
  user: ({ className = "w-3.5 h-3.5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  
  link: ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  
  // Notes to Tasks specific icon
  notesToTasks: ({ className = "w-12 h-12" }) => (
    <svg viewBox="0 0 64 64" className={className}>
      {/* Document base */}
      <rect x="8" y="4" width="32" height="40" rx="3" fill="#E0E7FF" stroke="#6366F1" strokeWidth="2" />
      {/* Document lines */}
      <line x1="14" y1="14" x2="34" y2="14" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="22" x2="30" y2="22" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="30" x2="34" y2="30" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
      {/* Arrow */}
      <path d="M42 24 L50 24" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" />
      <path d="M47 20 L51 24 L47 28" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Task cards */}
      <rect x="44" y="36" width="16" height="10" rx="2" fill="#10B981" />
      <path d="M48 41 L50 43 L54 39" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="44" y="48" width="16" height="10" rx="2" fill="#F59E0B" />
      <circle cx="52" cy="53" r="3" fill="white" opacity="0.5" />
      <rect x="44" y="24" width="16" height="10" rx="2" fill="#6366F1" />
      <path d="M48 29 L50 31 L54 27" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  
  // Outlook icon
  outlook: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
      <path d="M12 4L2 10V18L12 12L22 18V10L12 4Z" fill="#1490DF" />
      <ellipse cx="8" cy="12" rx="4" ry="5" fill="#28A8EA" />
      <text x="8" y="14.5" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">O</text>
    </svg>
  ),
  
  // Slack icon
  slack: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    </svg>
  ),
  
  // Google Calendar icon
  googleCalendar: ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#FFFFFF" stroke="#4285F4" strokeWidth="1.5" />
      <rect x="3" y="3" width="18" height="5" rx="2" fill="#4285F4" />
      <text x="12" y="16" textAnchor="middle" fontSize="8" fill="#EA4335" fontWeight="bold">31</text>
    </svg>
  ),

  // Pain point icons
  money: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <rect x="4" y="12" width="32" height="20" rx="2" fill="#FCD34D" />
      <rect x="12" y="16" width="36" height="20" rx="2" fill="#F59E0B" />
      <circle cx="30" cy="26" r="6" fill="#FCD34D" />
      <text x="30" y="30" textAnchor="middle" fontSize="10" fill="#92400E" fontWeight="bold">$</text>
    </svg>
  ),

  refreshCycle: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <path d="M24 8 A16 16 0 1 1 8 24" fill="none" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 8 L18 2 M24 8 L18 14" stroke="#6366F1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),

  home: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <path d="M8 22 L24 8 L40 22 L40 40 L8 40 Z" fill="#F97316" />
      <path d="M24 8 L8 22" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 8 L40 22" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="28" width="12" height="12" fill="#FED7AA" rx="1" />
    </svg>
  ),

  star: ({ className = "w-8 h-8" }) => (
    <svg viewBox="0 0 48 48" className={className}>
      <path d="M24 4 L28 18 L44 18 L32 28 L36 44 L24 34 L12 44 L16 28 L4 18 L20 18 Z" fill="#A78BFA" stroke="#8B5CF6" strokeWidth="2" />
    </svg>
  ),

  loader: ({ className = "w-5 h-5 animate-spin" }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
}

// ============================================================================
// ANIMATED SVG ILLUSTRATIONS
// ============================================================================

// Kanban Drag Animation
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
    
    <rect x="10" y="10" width="300" height="160" rx="12" fill="#F8FAFC" />
    
    {/* Column 1: To Do */}
    <rect x="20" y="20" width="85" height="140" rx="8" fill="#F1F5F9" />
    <rect x="25" y="25" width="75" height="20" rx="4" fill="#E2E8F0" />
    <text x="62" y="39" textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="bold">To Do</text>
    
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
    
    <rect x="218" y="50" width="69" height="45" rx="6" fill="white" filter="url(#cardShadow)" />
    <circle cx="230" cy="62" r="5" fill="#22C55E" />
    <path d="M227 62 L229 64 L233 60" stroke="white" strokeWidth="1.5" fill="none" />
    <rect x="240" y="58" width="40" height="6" rx="2" fill="#CBD5E1" />
    <rect x="240" y="68" width="30" height="4" rx="1" fill="#E2E8F0" />
  </svg>
)

// Notes to Tasks Animation
const NotesToTasksAnimation = () => (
  <svg viewBox="0 0 400 220" className="w-full h-56">
    <defs>
      <filter id="noteShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.1" />
      </filter>
      <linearGradient id="aiGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#EC4899" />
      </linearGradient>
    </defs>
    
    {/* Meeting notes document */}
    <g filter="url(#noteShadow)">
      <rect x="20" y="20" width="140" height="180" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1" />
      <rect x="20" y="20" width="140" height="30" rx="8" fill="#F9FAFB" />
      <text x="90" y="40" textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="600">Meeting Notes</text>
      
      {/* Note lines */}
      <rect x="32" y="60" width="80" height="6" rx="2" fill="#E5E7EB" />
      <rect x="32" y="74" width="110" height="6" rx="2" fill="#E5E7EB" />
      <rect x="32" y="88" width="95" height="6" rx="2" fill="#E5E7EB" />
      
      {/* Highlighted action items */}
      <rect x="32" y="108" width="116" height="18" rx="4" fill="#FEF3C7" />
      <text x="40" y="120" fontSize="8" fill="#92400E">→ Review proposal by Fri</text>
      
      <rect x="32" y="132" width="116" height="18" rx="4" fill="#DBEAFE" />
      <text x="40" y="144" fontSize="8" fill="#1E40AF">→ Send budget to Sarah</text>
      
      <rect x="32" y="156" width="116" height="18" rx="4" fill="#D1FAE5" />
      <text x="40" y="168" fontSize="8" fill="#065F46">→ Schedule team sync</text>
    </g>
    
    {/* AI processing indicator */}
    <g>
      <circle cx="200" cy="110" r="24" fill="url(#aiGlow)" opacity="0.15">
        <animate attributeName="r" values="24;28;24" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0.25;0.15" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="200" cy="110" r="16" fill="url(#aiGlow)" opacity="0.3" />
      <path d="M192 110 L200 102 L208 110 M192 110 L200 118 L208 110" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </path>
      
      {/* Animated arrows */}
      <g>
        <animate attributeName="opacity" values="0;1;1;0" dur="3s" repeatCount="indefinite" keyTimes="0;0.1;0.4;0.5" />
        <path d="M165 90 Q180 90 185 100" stroke="#8B5CF6" strokeWidth="2" fill="none" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 50;50 0" dur="0.8s" repeatCount="indefinite" />
        </path>
        <path d="M165 110 Q175 110 185 110" stroke="#8B5CF6" strokeWidth="2" fill="none" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 30;30 0" dur="0.8s" repeatCount="indefinite" />
        </path>
        <path d="M165 130 Q180 130 185 120" stroke="#8B5CF6" strokeWidth="2" fill="none" strokeLinecap="round">
          <animate attributeName="stroke-dasharray" values="0 50;50 0" dur="0.8s" repeatCount="indefinite" />
        </path>
      </g>
      
      <g>
        <animate attributeName="opacity" values="0;0;1;1;0" dur="3s" repeatCount="indefinite" keyTimes="0;0.4;0.5;0.9;1" />
        <path d="M215 100 Q220 90 235 90" stroke="#EC4899" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M215 110 Q225 110 235 110" stroke="#EC4899" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M215 120 Q220 130 235 130" stroke="#EC4899" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
    
    {/* Output task cards */}
    <g filter="url(#noteShadow)">
      <g>
        <animate attributeName="opacity" values="0;0;1;1" dur="3s" repeatCount="indefinite" keyTimes="0;0.5;0.65;1" />
        <animate attributeName="transform" values="translate(10,0);translate(10,0);translate(0,0);translate(0,0)" dur="3s" repeatCount="indefinite" keyTimes="0;0.5;0.65;1" />
        
        {/* Task 1 */}
        <rect x="240" y="30" width="140" height="50" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1" />
        <circle cx="258" cy="55" r="8" fill="#F59E0B" />
        <path d="M254 55 L257 58 L262 52" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="274" y="50" fontSize="9" fill="#374151" fontWeight="500">Review proposal</text>
        <text x="274" y="64" fontSize="8" fill="#9CA3AF">Due: Friday</text>
        
        {/* Task 2 */}
        <rect x="240" y="90" width="140" height="50" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1" />
        <circle cx="258" cy="115" r="8" fill="#3B82F6" />
        <path d="M254 115 L257 118 L262 112" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="274" y="110" fontSize="9" fill="#374151" fontWeight="500">Send budget</text>
        <text x="274" y="124" fontSize="8" fill="#9CA3AF">Assigned: Sarah</text>
        
        {/* Task 3 */}
        <rect x="240" y="150" width="140" height="50" rx="8" fill="white" stroke="#E5E7EB" strokeWidth="1" />
        <circle cx="258" cy="175" r="8" fill="#10B981" />
        <path d="M254 175 L257 178 L262 172" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="274" y="170" fontSize="9" fill="#374151" fontWeight="500">Schedule team sync</text>
        <text x="274" y="184" fontSize="8" fill="#9CA3AF">No date set</text>
      </g>
    </g>
  </svg>
)

// Calendar Animation
const CalendarAnimation = () => (
  <svg viewBox="0 0 320 200" className="w-full h-52">
    <defs>
      <linearGradient id="calGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    
    {/* Phase 1: Task being scheduled */}
    <g>
      <animate attributeName="opacity" values="1;1;0;0;0" dur="5s" repeatCount="indefinite" keyTimes="0;0.3;0.4;0.9;1" />
      
      <rect x="20" y="30" width="120" height="55" rx="8" fill="white" stroke="#E5E7EB" />
      <circle cx="38" cy="50" r="6" fill="#F59E0B" />
      <rect x="52" y="44" width="70" height="8" rx="2" fill="#374151" />
      <rect x="52" y="56" width="50" height="6" rx="2" fill="#9CA3AF" />
      
      <rect x="100" y="62" width="28" height="18" rx="4" fill="#FEF3C7">
        <animate attributeName="fill" values="#FEF3C7;#FDE68A;#FEF3C7" dur="1s" repeatCount="indefinite" />
      </rect>
      <Icons.calendar className="w-3 h-3 text-amber-600 absolute" style={{ transform: 'translate(108px, 67px)' }} />
      
      <circle cx="114" cy="71" r="10" fill="none" stroke="#F59E0B" strokeWidth="2">
        <animate attributeName="r" values="10;20;20" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0" dur="1.5s" repeatCount="indefinite" />
      </circle>
      
      <path d="M150 57 L170 57" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M167 53 L173 57 L167 61" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" />
      </path>
      
      <rect x="180" y="20" width="120" height="80" rx="8" fill="white" stroke="#E5E7EB" />
      <text x="240" y="38" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="bold">Schedule Task</text>
      <rect x="190" y="45" width="100" height="18" rx="4" fill="#FEF3C7" />
      <text x="240" y="57" textAnchor="middle" fontSize="8" fill="#92400E">Thu, Jan 2 • 9:00 AM</text>
      <rect x="210" y="70" width="60" height="20" rx="6" fill="url(#calGradient)" />
      <text x="240" y="84" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">Schedule</text>
    </g>
    
    {/* Phase 2: Full calendar view */}
    <g>
      <animate attributeName="opacity" values="0;0;1;1;1" dur="5s" repeatCount="indefinite" keyTimes="0;0.3;0.5;0.9;1" />
      
      <rect x="20" y="15" width="280" height="170" rx="10" fill="white" stroke="#E5E7EB" />
      <rect x="20" y="15" width="280" height="30" rx="10" fill="#FFFBEB" />
      <text x="160" y="35" textAnchor="middle" fontSize="11" fill="#92400E" fontWeight="bold">January 2026</text>
      
      <text x="45" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Mon</text>
      <text x="85" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Tue</text>
      <text x="125" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Wed</text>
      <text x="165" y="55" textAnchor="middle" fontSize="8" fill="#F59E0B" fontWeight="bold">Thu</text>
      <text x="205" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Fri</text>
      <text x="245" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Sat</text>
      <text x="280" y="55" textAnchor="middle" fontSize="8" fill="#9CA3AF">Sun</text>
      
      <line x1="30" y1="62" x2="290" y2="62" stroke="#F3F4F6" />
      
      <text x="125" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">1</text>
      <text x="165" y="72" textAnchor="middle" fontSize="9" fill="#F59E0B" fontWeight="bold">2</text>
      <text x="205" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">3</text>
      <text x="245" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">4</text>
      <text x="280" y="72" textAnchor="middle" fontSize="9" fill="#6B7280">5</text>
      
      <rect x="108" y="76" width="34" height="14" rx="3" fill="#DBEAFE" />
      <text x="125" y="86" textAnchor="middle" fontSize="6" fill="#1E40AF">Review</text>
      
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
      
      <rect x="188" y="76" width="34" height="14" rx="3" fill="#86EFAC" />
      <text x="205" y="86" textAnchor="middle" fontSize="6" fill="#166534">Deploy</text>
      
      <line x1="30" y1="115" x2="290" y2="115" stroke="#F3F4F6" />
      <text x="45" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">6</text>
      <text x="85" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">7</text>
      <text x="125" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">8</text>
      <text x="165" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">9</text>
      <text x="205" y="128" textAnchor="middle" fontSize="9" fill="#6B7280">10</text>
      
      <rect x="28" y="132" width="34" height="14" rx="3" fill="#FCA5A5" />
      <text x="45" y="142" textAnchor="middle" fontSize="6" fill="#991B1B">Sprint</text>
      <rect x="68" y="132" width="34" height="14" rx="3" fill="#93C5FD" />
      <text x="85" y="142" textAnchor="middle" fontSize="6" fill="#1E40AF">Design</text>
      <rect x="148" y="132" width="34" height="14" rx="3" fill="#FDE68A" />
      <text x="165" y="142" textAnchor="middle" fontSize="6" fill="#92400E">Plan</text>
      
      <line x1="30" y1="155" x2="290" y2="155" stroke="#F3F4F6" />
      <text x="45" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">13</text>
      <text x="85" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">14</text>
      <text x="125" y="168" textAnchor="middle" fontSize="9" fill="#6B7280">15</text>
    </g>
  </svg>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function LandingPageV2() {
  const [scrolled, setScrolled] = useState(false)
  const [notes, setNotes] = useState('')
  const [extractedTasks, setExtractedTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [waitlistModal, setWaitlistModal] = useState({ open: false, feature: '' })
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const [waitlistSuccess, setWaitlistSuccess] = useState(false)

  const handleExtract = useCallback(() => {
    if (!notes.trim()) return
    setIsExtracting(true)
    track('task_extractor_used', { source: 'landing_page' })
    
    setTimeout(() => {
      const tasks = extractTasks(notes)
      setExtractedTasks(tasks)
      setIsExtracting(false)
      track('tasks_extracted', { count: tasks.length, source: 'landing_page' })
    }, 500)
  }, [notes])

  const resetExtractor = useCallback(() => {
    setNotes('')
    setExtractedTasks([])
  }, [])

  const handleWaitlistSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!waitlistEmail.trim()) return
    
    setWaitlistSubmitting(true)
    
    try {
      track('waitlist_signup', { feature: waitlistModal.feature })
      
      const { error } = await supabase
        .from('waitlist')
        .insert([{ 
          email: waitlistEmail.trim().toLowerCase(),
          feature: waitlistModal.feature,
          created_at: new Date().toISOString()
        }])
      
      if (error) {
        if (error.code === '23505') {
          setWaitlistSuccess(true)
        } else {
          console.error('Waitlist error:', error)
          alert('Something went wrong. Please try again.')
        }
      } else {
        setWaitlistSuccess(true)
      }
    } catch (err) {
      console.error('Waitlist error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setWaitlistSubmitting(false)
    }
  }, [waitlistEmail, waitlistModal.feature])

  const closeWaitlistModal = useCallback(() => {
    setWaitlistModal({ open: false, feature: '' })
    setWaitlistEmail('')
    setWaitlistSuccess(false)
  }, [])

  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 50)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
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
            <a href="#integrations" className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">
              Integrations
            </a>
            <Link to="/login" className="text-gray-600 hover:text-gray-900 transition-colors">
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

      <main>
        {/* ================================================================ */}
        {/* HERO SECTION */}
        {/* ================================================================ */}
        <section className="pt-32 pb-20 px-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-indigo-200/40 via-purple-200/40 to-pink-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full text-sm font-medium text-indigo-700 mb-8">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Now in beta
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 tracking-tight">
              Task management that{' '}
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                just works
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
                Get Started Free
              </Link>
              <a
                href="#demo"
                className="px-8 py-4 bg-white text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <Icons.play className="w-5 h-5" />
                Watch Demo
              </a>
            </div>
          </div>

          {/* App Preview */}
          <div className="max-w-6xl mx-auto mt-16 px-4">
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
              <img 
                src="/screenshots/board.webp" 
                alt="Trackli Kanban Board"
                className="relative w-full rounded-2xl shadow-2xl"
                fetchpriority="high"
                decoding="async"
                width={1363}
                height={460}
              />
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* NOTES TO TASKS - HERO FEATURE */}
        {/* ================================================================ */}
        <section id="notes-to-tasks" className="py-24 px-6 bg-gradient-to-b from-white to-purple-50">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 rounded-full text-sm font-medium text-purple-700 mb-6">
                  <Icons.sparkles className="w-4 h-4" />
                  AI-Powered
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 tracking-tight">
                  Turn chaos into clarity.{' '}
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    Instantly.
                  </span>
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  Paste meeting notes, forward emails, upload photos of whiteboards, or just speak. 
                  Trackli's AI extracts action items with assignees and due dates automatically.
                </p>
                
                <div className="space-y-4 mb-8">
                  {[
                    { icon: Icons.document, text: 'Paste meeting notes or email threads' },
                    { icon: Icons.microphone, text: 'Voice-to-task on mobile' },
                    { icon: Icons.brain, text: 'AI identifies owners and deadlines' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 text-gray-700">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
                
                <a
                  href="#try-it"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all font-semibold shadow-lg shadow-purple-500/25"
                >
                  <Icons.lightning className="w-5 h-5" />
                  Try It Now
                </a>
              </div>
              
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <NotesToTasksAnimation />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TRY IT NOW - Interactive Extractor */}
        {/* ================================================================ */}
        <section id="try-it" className="py-20 px-6 bg-purple-50">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                See for yourself
              </h2>
              <p className="text-lg text-gray-600 max-w-xl mx-auto">
                Paste your meeting notes below. Watch them become tasks.
              </p>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-indigo-500/20 rounded-3xl blur-2xl" />
              
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                {extractedTasks.length === 0 ? (
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
                      className="w-full h-48 p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-gray-700 placeholder:text-gray-400"
                    />
                    <div className="mt-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                      <p className="text-sm text-gray-500 flex items-center gap-2">
                        <Icons.sparkles className="w-4 h-4 text-purple-500" />
                        Works with tables, bullet points, and natural language
                      </p>
                      <button
                        onClick={handleExtract}
                        disabled={!notes.trim() || isExtracting}
                        className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all font-semibold shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isExtracting ? (
                          <>
                            <Icons.loader className="w-5 h-5" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <Icons.lightning className="w-5 h-5" />
                            Extract Tasks
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                          <Icons.check className="w-4 h-4 text-green-600" />
                        </span>
                        Found {extractedTasks.length} task{extractedTasks.length !== 1 ? 's' : ''}!
                      </h3>
                      <button
                        onClick={resetExtractor}
                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                      >
                        <Icons.refresh className="w-4 h-4" />
                        Try again
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {extractedTasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="w-5 h-5 rounded border-2 border-purple-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900">{task.title}</p>
                            {(task.assignee || task.dueDate) && (
                              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
                                {task.assignee && (
                                  <span className="flex items-center gap-1">
                                    <Icons.user className="w-3.5 h-3.5" />
                                    {task.assignee}
                                  </span>
                                )}
                                {task.assignee && task.dueDate && <span className="mx-1">•</span>}
                                {task.dueDate && (
                                  <span className="flex items-center gap-1">
                                    <Icons.calendar className="w-3.5 h-3.5" />
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
          </div>
        </section>

        {/* ================================================================ */}
        {/* INTEGRATIONS SECTION */}
        {/* ================================================================ */}
        <section id="integrations" className="py-24 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
                Integrations
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Works where you work
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Turn emails and messages into tasks without leaving your inbox.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {/* Outlook Integration */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 rounded-xl bg-[#0078D4] flex items-center justify-center shadow-lg">
                    <Icons.outlook className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">Outlook Add-in</h3>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Available now
                    </span>
                  </div>
                </div>
                <p className="text-gray-600 mb-6">
                  Turn any email into a task with one click. AI reads the email and suggests action items with due dates. Works on desktop and web Outlook.
                </p>
                <ul className="space-y-2">
                  {['One-click task creation', 'AI extracts follow-ups', 'Link emails to existing tasks'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <Icons.check className="w-4 h-4 text-blue-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Slack Integration */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg border border-gray-100">
                    <Icons.slack className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">Slack App</h3>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Available now
                    </span>
                  </div>
                </div>
                <p className="text-gray-600 mb-6">
                  Create tasks from any Slack message with a shortcut. Never lose action items buried in conversations.
                </p>
                <ul className="space-y-2">
                  {['Message shortcut to create task', 'Original message link preserved', 'Channel context included'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <Icons.check className="w-4 h-4 text-purple-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Coming Soon */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Icons.calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">More integrations coming soon</h3>
                  <p className="text-sm text-gray-500">We're building the connections you need</p>
                </div>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { name: 'Google Calendar', icon: Icons.googleCalendar, status: 'In development' },
                  { name: 'Outlook Calendar', icon: Icons.outlook, status: 'In development' },
                  { name: 'Zapier', icon: Icons.link, status: 'Planned' },
                ].map((integration, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100">
                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                      <integration.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{integration.name}</p>
                      <p className="text-xs text-gray-500">{integration.status}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => setWaitlistModal({ open: true, feature: 'integrations' })}
                className="mt-6 w-full sm:w-auto px-6 py-3 bg-white text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all font-medium flex items-center justify-center gap-2"
              >
                <Icons.bell className="w-4 h-4" />
                Notify me when ready
              </button>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* MY DAY FEATURE */}
        {/* ================================================================ */}
        <section id="features" className="py-24 px-6 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full text-sm font-medium text-amber-700 mb-6">
                  <Icons.sun className="w-4 h-4" />
                  Daily Focus
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                  My Day: Your command center
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  Start each morning focused on what actually matters. Add tasks from any project, track your progress, and finish what you start.
                </p>
                
                {/* AI Plan My Day callout */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-5 mb-8 border border-purple-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Icons.sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">AI Plan My Day</h4>
                      <p className="text-sm text-gray-600">
                        Tell the AI how much time you have. It builds your perfect day based on priorities, due dates, and task effort.
                      </p>
                    </div>
                  </div>
                </div>
                
                <ul className="space-y-3">
                  {[
                    'Auto-populated with tasks due or starting today',
                    'Smart recommendations for overdue and quick wins',
                    'Visual progress tracking',
                    'Fresh start every day — clears at midnight',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-600">
                      <Icons.check className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 overflow-hidden">
                <img 
                  src="/screenshots/my-day.webp" 
                  alt="Trackli My Day View" 
                  className="w-full rounded-xl shadow-lg"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* KANBAN FEATURE */}
        {/* ================================================================ */}
        <section className="py-24 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="order-2 lg:order-1 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 flex items-center justify-center">
                <KanbanDragAnimation />
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
                  Visual Workflow
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                  Kanban boards that scale
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  Intuitive drag-and-drop boards that help you visualize your work. No artificial limits, no surprise paywalls.
                </p>
                <ul className="space-y-3">
                  {[
                    'Unlimited projects and boards',
                    `${L.Organized} workflow columns`,
                    'Subtasks, attachments, and due dates',
                    'Filter and search across everything',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-600">
                      <Icons.check className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* CALENDAR FEATURE */}
        {/* ================================================================ */}
        <section className="py-24 px-6 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3">
                  Time Awareness
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                  Schedule tasks on a calendar
                </h2>
                <p className="text-lg text-gray-600 mb-8">
                  See your tasks in a calendar view. Drag to schedule, set time estimates, and never miss a deadline again.
                </p>
                <ul className="space-y-3">
                  {[
                    'Day, week, and month views',
                    'Drag and drop scheduling',
                    'Time block resizing with live preview',
                    'Recurring tasks for routines',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-600">
                      <Icons.check className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 overflow-hidden">
                <CalendarAnimation />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* MORE FEATURES GRID */}
        {/* ================================================================ */}
        <section className="py-24 px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
                And more
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Features that save you time
              </h2>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Icons.microphone,
                  title: "Voice to Task",
                  description: "Speak your tasks on mobile. Perfect for capturing ideas on the go.",
                  bgColor: "bg-indigo-100",
                  textColor: "text-indigo-600"
                },
                {
                  icon: Icons.lightning,
                  title: "Quick Add",
                  description: "Press Q to add a task instantly. Type naturally, we'll figure it out.",
                  bgColor: "bg-amber-100",
                  textColor: "text-amber-600"
                },
                {
                  icon: Icons.brain,
                  title: "AI Subtasks",
                  description: "Stuck on a big task? Click the sparkle icon. AI suggests how to break it down.",
                  bgColor: "bg-purple-100",
                  textColor: "text-purple-600"
                },
                {
                  icon: Icons.document,
                  title: "Meeting Notes Import",
                  description: "Paste notes, upload photos, or forward emails. AI extracts action items.",
                  bgColor: "bg-green-100",
                  textColor: "text-green-600"
                },
                {
                  icon: Icons.moon,
                  title: "Dark Mode",
                  description: "Easy on the eyes for late night planning sessions.",
                  bgColor: "bg-gray-100",
                  textColor: "text-gray-600"
                },
                {
                  icon: Icons.smartphone,
                  title: "Mobile Optimized",
                  description: "Full-featured mobile experience. Manage tasks anywhere.",
                  bgColor: "bg-pink-100",
                  textColor: "text-pink-600"
                },
              ].map((feature) => (
                <div key={feature.title} className="bg-gray-50 rounded-xl p-6 border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all">
                  <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center ${feature.textColor} mb-4`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* WHY TRACKLI */}
        {/* ================================================================ */}
        <section className="py-24 px-6 bg-gray-50">
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
                  icon: Icons.target,
                  title: 'Depth without the learning curve',
                  subtitle: "Simple tools leave you wanting more. Powerful ones take weeks to learn.",
                  highlight: 'Trackli gives you both.',
                },
                {
                  icon: Icons.money,
                  title: 'Everything included from day one',
                  subtitle: 'Calendar view? Timeline? Premium only... elsewhere.',
                  highlight: 'Every feature, no paywalls.',
                },
                {
                  icon: Icons.refreshCycle,
                  title: 'Built to stick',
                  subtitle: '73% abandon their productivity app within 30 days.',
                  highlight: 'Intuitive from the first click.',
                },
                {
                  icon: Icons.sun,
                  title: 'Focus on what matters today',
                  subtitle: 'Most tools show everything, all the time.',
                  highlight: 'My Day keeps you focused.',
                },
                {
                  icon: Icons.home,
                  title: 'Works for work and life',
                  subtitle: 'Enterprise software for tracking groceries?',
                  highlight: 'Clean for personal, capable for work.',
                },
                {
                  icon: Icons.star,
                  title: 'A tool you actually enjoy',
                  subtitle: 'Cluttered interfaces. Outdated aesthetics.',
                  highlight: 'Modern design that stays out of your way.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 border border-gray-100"
                >
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
                    <card.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{card.title}</h3>
                  <p className="text-gray-500 text-sm mb-2">{card.subtitle}</p>
                  <p className="text-indigo-600 font-medium text-sm">{card.highlight}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* DEMO SECTION */}
        {/* ================================================================ */}
        <section id="demo" className="py-20 px-6 bg-white">
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

        {/* ================================================================ */}
        {/* FINAL CTA */}
        {/* ================================================================ */}
        <section className="py-24 px-6 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to get things done?
            </h2>
            <p className="text-lg text-white/80 mb-8">
              Start {L.organizing} your work today. Free during beta.
            </p>
            <Link
              to="/login?signup=true"
              className="inline-block px-8 py-4 bg-white text-indigo-600 rounded-xl hover:bg-gray-50 transition-all font-semibold shadow-xl hover:-translate-y-0.5"
            >
              Get Started Free
            </Link>
            <p className="mt-6 text-sm text-white/60">
              No credit card required
            </p>
          </div>
        </section>

        {/* ================================================================ */}
        {/* FAQ */}
        {/* ================================================================ */}
        <section className="py-20 px-6 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
            
            <div className="space-y-4">
              {[
                {
                  q: 'Is Trackli free?',
                  a: "Yes! Trackli is completely free to use during beta. We're focused on building the best task management experience first. Premium features for teams may be added in the future."
                },
                {
                  q: 'How does the Notes to Tasks feature work?',
                  a: `Paste your meeting notes, emails, or even attach an image of handwritten notes. Our AI ${L.analyze}s the content and automatically identifies action items, assignees, and due dates — turning chaos into ${L.organized} tasks in seconds.`
                },
                {
                  q: 'Can I use Trackli on mobile?',
                  a: "Absolutely! Trackli works great on mobile browsers. You can also install it as an app on your phone — just tap \"Add to Home Screen\" in your browser menu for quick access with voice-to-task support."
                },
                {
                  q: 'How do the Outlook and Slack integrations work?',
                  a: "The Outlook add-in lets you turn any email into a task with one click, right from your inbox. The Slack app lets you create tasks from any message using a shortcut. Both integrations preserve the original context so you never lose track of where tasks came from."
                },
                {
                  q: 'Is my data secure?',
                  a: "Yes. Your data is encrypted and stored securely. We use industry-standard security practices and never share your information with third parties. Your tasks and notes remain private to you."
                },
                {
                  q: 'Does Trackli integrate with my calendar?',
                  a: "Calendar integration is coming soon! You'll be able to see your tasks alongside calendar events and schedule tasks directly. Sign up for the waitlist to get notified when it's ready."
                },
              ].map((faq, i) => (
                <details key={i} className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                    {faq.q}
                    <Icons.chevronDown className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-6 pb-6 text-gray-600">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="py-12 px-6 border-t border-gray-200 bg-white">
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

      {/* ================================================================ */}
      {/* WAITLIST MODAL */}
      {/* ================================================================ */}
      {waitlistModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeWaitlistModal}>
          <div 
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!waitlistSuccess ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Get notified</h3>
                  <button onClick={closeWaitlistModal} className="text-gray-400 hover:text-gray-600">
                    <Icons.x className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-600 text-sm mb-4">
                  We'll send you one email when this feature launches. No spam, ever.
                </p>
                <form onSubmit={handleWaitlistSubmit}>
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all mb-4"
                  />
                  <button
                    type="submit"
                    disabled={waitlistSubmitting}
                    className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold disabled:opacity-50"
                  >
                    {waitlistSubmitting ? 'Adding...' : 'Notify me'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icons.check className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">You're on the list!</h3>
                <p className="text-gray-600 text-sm mb-4">
                  We'll let you know as soon as this feature is ready.
                </p>
                <button
                  onClick={closeWaitlistModal}
                  className="px-6 py-2 text-indigo-600 font-medium hover:text-indigo-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
