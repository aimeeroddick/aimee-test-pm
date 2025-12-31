import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Trackli
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">
              Features
            </a>
            <a href="#pricing" className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">
              Pricing
            </a>
            <Link
              to="/login"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-medium shadow-lg shadow-indigo-500/25"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Background gradient blob */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-indigo-200/40 via-purple-200/40 to-pink-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full text-sm font-medium text-indigo-700 mb-8 animate-fadeIn">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Now in beta — Join the waitlist
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
            Task management that{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              just <span className="italic">works</span>
            </span>
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
            Tired of tools that are either too simple or overwhelmingly complex? 
            Trackli is the sweet spot: powerful enough for real work, simple enough to actually use.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fadeIn" style={{ animationDelay: '0.3s' }}>
            <Link
              to="/login"
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-xl shadow-indigo-500/25 hover:-translate-y-0.5"
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
        <div className="max-w-5xl mx-auto mt-16 animate-fadeIn" style={{ animationDelay: '0.4s' }}>
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
                    <h3 className="text-lg font-semibold text-gray-900">Website Redesign</h3>
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
                icon: '🎯',
                title: 'Too simple, then too complex',
                problem: "Trello's great until you need more. Asana's powerful but takes weeks to learn.",
                solution: 'Trackli gives you depth without the steep curve.',
              },
              {
                icon: '💸',
                title: 'Paywalled basics',
                problem: 'Calendar view? That\'ll cost you. Timeline? Premium only.',
                solution: 'Every view, every feature — included from day one.',
              },
              {
                icon: '🔄',
                title: 'Tool fatigue is real',
                problem: '73% abandon their productivity app within 30 days.',
                solution: 'Trackli is built to stick — intuitive from the first click.',
              },
              {
                icon: '☀️',
                title: 'No daily focus',
                problem: 'Most tools show everything, all the time.',
                solution: 'My Day view helps you focus on what matters right now.',
              },
              {
                icon: '🏠',
                title: 'Work tools feel like work',
                problem: 'Enterprise software for tracking groceries?',
                solution: 'Clean enough for personal life, capable enough for work.',
              },
              {
                icon: '✨',
                title: 'Generic, forgettable design',
                problem: 'Cluttered interfaces. Outdated aesthetics.',
                solution: 'A tool you actually enjoy opening.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-100"
              >
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl mb-4">
                  {card.icon}
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
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                My Day: Your daily command center
              </h3>
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
                      <span className={task.done ? 'text-gray-400 line-through' : 'text-gray-700'}>
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
                <div className="text-6xl mb-4">📋</div>
                <p className="font-medium text-gray-600">Drag, drop, done</p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3">
                Visual Workflow
              </p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Kanban boards that scale with you
              </h3>
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
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Calendar integration that makes sense
              </h3>
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
                <div className="text-6xl mb-4">📅</div>
                <p className="font-medium text-gray-600">Tasks meet calendar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wide mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Simple, honest pricing
            </h2>
            <p className="text-lg text-gray-600">
              No hidden fees. No feature paywalls. Start free, upgrade when you're ready.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Free</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-gray-500 mb-8 pb-8 border-b border-gray-100">
                Perfect for personal use and trying Trackli out.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Up to 3 projects',
                  'All views (Kanban, Calendar, List)',
                  'My Day daily planning',
                  'Subtasks and attachments',
                  'Mobile responsive',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-600">
                    <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className="block w-full py-3 text-center border-2 border-gray-200 text-gray-700 rounded-xl hover:border-gray-300 transition-all font-semibold"
              >
                Get Started
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-indigo-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold rounded-full">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pro</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-gray-900">$8</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-gray-500 mb-8 pb-8 border-b border-gray-100">
                For power users and small teams who need more.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Unlimited projects',
                  'Everything in Free',
                  'Recurring tasks',
                  'Custom templates',
                  'CSV import/export',
                  'Priority support',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-gray-600">
                    <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className="block w-full py-3 text-center bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-lg shadow-indigo-500/25"
              >
                Get Early Access
              </Link>
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
            Join the waitlist for early access. Be among the first to experience task management that actually works.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              alert("Thanks! We'll be in touch soon.")
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              placeholder="Enter your email"
              required
              className="flex-1 px-5 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all font-semibold shadow-lg shadow-indigo-500/25 whitespace-nowrap"
            >
              Join Waitlist
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Trackli
            </span>
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">Privacy</a>
            <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">Terms</a>
            <a href="#" className="text-gray-500 hover:text-gray-700 transition-colors">Contact</a>
          </div>
          <p className="text-gray-400 text-sm">© 2025 Trackli. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
