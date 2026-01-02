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

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

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
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
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
            Now in beta — Try it free
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
              Get Early Access
            </Link>
            <a
              href="#features"
              className="px-8 py-4 bg-white text-gray-700 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all font-semibold"
            >
              See How It Works
            </a>
          </div>
        </div>

        {/* App Preview */}
        <div className="max-w-5xl mx-auto mt-16">
          <div className="bg-gray-100 rounded-2xl p-4 sm:p-6 shadow-2xl">
            <div className="bg-white rounded-xl overflow-hidden shadow-lg">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              
              {/* App content mockup */}
              <div className="flex min-h-[300px] sm:min-h-[400px]">
                {/* Sidebar */}
                <div className="hidden sm:block w-52 bg-gray-50 border-r border-gray-100 p-4">
                  <div className="space-y-1">
                    {[
                      { name: 'My Day', color: 'bg-amber-500' },
                      { name: 'Work Projects', color: 'bg-indigo-500', active: true },
                      { name: 'Personal', color: 'bg-pink-500' },
                      { name: 'Calendar', color: 'bg-gray-300' },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                          item.active ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-600'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded ${item.color}`} />
                        {item.name}
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Main content */}
                <div className="flex-1 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-lg font-semibold text-gray-900">Website Redesign</div>
                  </div>
                  
                  {/* Kanban columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { 
                        name: 'To Do', 
                        count: 3,
                        tasks: [
                          { title: 'Research competitor sites', tag: 'High', tagColor: 'bg-red-100 text-red-700' },
                          { title: 'Draft wireframes', tag: 'Design', tagColor: 'bg-purple-100 text-purple-700' },
                        ]
                      },
                      { 
                        name: 'In Progress', 
                        count: 2,
                        tasks: [
                          { title: 'Set up dev environment', tag: 'Dev', tagColor: 'bg-blue-100 text-blue-700' },
                        ]
                      },
                      { 
                        name: 'Done', 
                        count: 4,
                        tasks: [
                          { title: 'Define project scope', tag: 'Planning', tagColor: 'bg-green-100 text-green-700' },
                        ]
                      },
                    ].map((column) => (
                      <div key={column.name} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {column.name}
                          </span>
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                            {column.count}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {column.tasks.map((task, i) => (
                            <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                              <p className="text-sm font-medium text-gray-800 mb-2">{task.title}</p>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${task.tagColor}`}>
                                {task.tag}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              Sound Familiar?
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              The productivity tool paradox
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Most task managers either leave you wanting more, or overwhelm you with features you'll never use.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                iconComponent: 'target',
                title: 'Too simple, then too complex',
                problem: "Simple tools leave you wanting more. Powerful ones take weeks to learn.",
                solution: 'Trackli gives you depth without the steep curve.',
              },
              {
                iconComponent: 'money',
                title: 'Paywalled basics',
                problem: 'Calendar view? That\'ll cost you. Timeline? Premium only.',
                solution: 'Every view, every feature — included from day one.',
              },
              {
                iconComponent: 'refresh',
                title: 'Tool fatigue is real',
                problem: '73% abandon their productivity app within 30 days.',
                solution: 'Trackli is built to stick — intuitive from the first click.',
              },
              {
                iconComponent: 'sun',
                title: 'No daily focus',
                problem: 'Most tools show everything, all the time.',
                solution: 'My Day view helps you focus on what matters right now.',
              },
              {
                iconComponent: 'home',
                title: 'Work tools feel like work',
                problem: 'Enterprise software for tracking groceries?',
                solution: 'Clean enough for personal life, capable enough for work.',
              },
              {
                iconComponent: 'sparkles',
                title: 'Generic, forgettable design',
                problem: 'Cluttered interfaces. Outdated aesthetics.',
                solution: 'A tool you actually enjoy opening.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-100"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  {card.iconComponent && LandingIcons[card.iconComponent] ? LandingIcons[card.iconComponent]() : card.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{card.title}</h3>
                <p className="text-gray-500 line-through text-sm mb-2">{card.problem}</p>
                <p className="text-indigo-600 font-medium text-sm">{card.solution}</p>
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
                Start each day with a clear view of what matters. Drag tasks from any project into today's focus, track your progress, and actually finish what you start.
              </p>
              <ul className="space-y-3">
                {[
                  'Pull tasks from any project into your day',
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
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8">
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-semibold text-gray-900">Today, December 31</h4>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="w-3/5 h-full bg-green-500 rounded-full" />
                    </div>
                    3/5 complete
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { title: 'Review quarterly report', done: true },
                    { title: 'Send client proposal', done: true },
                    { title: 'Team standup meeting', done: true },
                    { title: 'Update project timeline', done: false },
                    { title: 'Prepare presentation slides', done: false },
                  ].map((task) => (
                    <div
                      key={task.title}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        task.done ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        task.done ? 'bg-green-500 border-green-500' : 'border-gray-300'
                      }`}>
                        {task.done && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={task.done ? 'text-gray-500 line-through' : 'text-gray-700'}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Kanban */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            <div className="order-2 lg:order-1 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                {LandingIcons.clipboard()}
                <p className="font-medium text-gray-600 mt-4">Drag, drop, done</p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
                Visual Workflow
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Kanban boards that scale with you
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Intuitive drag-and-drop boards that work for solo projects and team collaboration alike. No artificial limits, no surprise paywalls.
              </p>
              <ul className="space-y-3">
                {[
                  'Unlimited projects and boards',
                  'Custom columns and workflows',
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
                Calendar integration that makes sense
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                See your tasks alongside your schedule. No more double-booking yourself or missing deadlines buried in a backlog.
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
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                {LandingIcons.calendar()}
                <p className="font-medium text-gray-600 mt-4">Tasks meet calendar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section - TODO: Add back when pricing is finalized */}

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Ready to get things done?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Start organizing your work today. Free to use, no credit card required.
          </p>
          <Link
            to="/login?signup=true"
            className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-transform duration-200 font-semibold shadow-xl shadow-indigo-500/25 hover:-translate-y-0.5"
          >
            Get Started Free
          </Link>
        </div>
      </section>

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
          <p className="text-gray-400 text-sm">© 2025 Trackli. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
