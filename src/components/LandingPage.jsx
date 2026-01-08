import { Link } from 'react-router-dom'
import { useState, useCallback, useEffect, useRef } from 'react'
import { track } from '@vercel/analytics'
import { extractTasks } from '../utils/taskExtraction'

export default function LandingPage() {
  // Task extraction demo state
  const [demoNotes, setDemoNotes] = useState('')
  const [demoTasks, setDemoTasks] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [hasExtracted, setHasExtracted] = useState(false)
  
  // Lazy load Arcade demo
  const [showArcade, setShowArcade] = useState(false)
  const arcadeRef = useRef(null)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowArcade(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' } // Load 200px before it comes into view
    )
    
    if (arcadeRef.current) {
      observer.observe(arcadeRef.current)
    }
    
    return () => observer.disconnect()
  }, [])

  const handleExtract = useCallback(async () => {
    if (!demoNotes.trim()) return
    
    setIsExtracting(true)
    track('landing_demo_extract')
    
    // Simulate a brief delay for effect
    await new Promise(resolve => setTimeout(resolve, 800))
    
    const extracted = extractTasks(demoNotes)
    setDemoTasks(extracted)
    setHasExtracted(true)
    setIsExtracting(false)
  }, [demoNotes])

  return (
    <div className="min-h-screen bg-white">
      {/* CSS Animations - desktop only for performance */}
      <style>{`
        @media (min-width: 768px) and (prefers-reduced-motion: no-preference) {
          @keyframes gradient-shift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient-desktop {
            background: linear-gradient(135deg, #7C3AED, #A855F7, #EC4899, #F97316, #FBBF24, #34D399, #06B6D4, #7C3AED);
            background-size: 400% 400%;
            animation: gradient-shift 15s ease infinite;
          }
          @keyframes blob {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -20px) scale(1.05); }
            66% { transform: translate(-20px, 20px) scale(0.95); }
          }
          .animate-blob { animation: blob 8s ease-in-out infinite; }
          .animate-blob-2 { animation: blob 10s ease-in-out infinite reverse; animation-delay: -2s; }
          .animate-blob-3 { animation: blob 12s ease-in-out infinite; animation-delay: -4s; }
          .animate-blob-4 { animation: blob 9s ease-in-out infinite; animation-delay: -3s; }
          @keyframes gentle-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          .animate-float { animation: gentle-float 6s ease-in-out infinite; }
          .animate-float-2 { animation: gentle-float 7s ease-in-out infinite; animation-delay: -2s; }
          .animate-float-3 { animation: gentle-float 5s ease-in-out infinite; animation-delay: -4s; }
        }
        
        /* Mobile: static gradient, no animations */
        .gradient-hero {
          background: linear-gradient(135deg, #7C3AED 0%, #A855F7 25%, #EC4899 50%, #F97316 75%, #FBBF24 100%);
        }
        @media (min-width: 768px) and (prefers-reduced-motion: no-preference) {
          .gradient-hero {
            background: linear-gradient(135deg, #7C3AED, #A855F7, #EC4899, #F97316, #FBBF24, #34D399, #06B6D4, #7C3AED);
            background-size: 400% 400%;
            animation: gradient-shift 15s ease infinite;
          }
        }
        
        /* Glass card - blur only on desktop */
        .glass-card {
          background: rgba(255, 255, 255, 0.95);
        }
        @media (min-width: 768px) {
          .glass-card {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
          }
        }
      `}</style>

      {/* Navigation - with PWA safe area support */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-3 md:py-4" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}>
        <div className="max-w-6xl mx-auto">
          <div className="glass-card rounded-2xl px-4 md:px-6 py-3 flex justify-between items-center shadow-lg shadow-black/5">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 md:w-9 md:h-9">
                <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="nav-left" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7C3AED"/>
                      <stop offset="100%" stopColor="#9333EA"/>
                    </linearGradient>
                    <linearGradient id="nav-right" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#EA580C"/>
                      <stop offset="100%" stopColor="#F97316"/>
                    </linearGradient>
                  </defs>
                  <path d="M6 18L28 6L28 38L6 26Z" fill="url(#nav-left)"/>
                  <path d="M28 6L50 18L50 46L28 38Z" fill="url(#nav-right)"/>
                  <path d="M6 18L28 6L50 18L28 30Z" fill="#E9D5FF"/>
                  <path d="M18 19L25 26L36 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-lg md:text-xl font-bold bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">Trackli</span>
            </Link>
            <div className="flex items-center gap-2 md:gap-4">
              <a href="#features" className="hidden sm:block text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">Features</a>
              <a href="#demo" className="hidden sm:block text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">Demo</a>
              <Link to="/login" className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">Sign In</Link>
              <Link to="/login?signup=true" className="px-4 md:px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen gradient-hero relative flex items-center justify-center overflow-hidden pt-20">
        {/* Floating blobs - desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute -top-32 -left-32 w-96 h-96 bg-white/20 rounded-full blur-3xl"></div>
          <div className="animate-blob-2 absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-white/15 rounded-full blur-3xl"></div>
          <div className="animate-blob-3 absolute top-1/4 right-1/4 w-64 h-64 bg-white/10 rounded-full blur-2xl"></div>
          <div className="animate-blob-4 absolute bottom-1/3 left-1/4 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
        </div>
        
        {/* Hero content */}
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 md:backdrop-blur-sm text-white rounded-full text-sm font-medium mb-6 border border-white/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Now in Beta
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 drop-shadow-lg">
            Task management<br/>that sparks joy
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-white/90 mb-8 md:mb-10 max-w-2xl mx-auto">
            Finally, a way to organise your work that doesn't feel like work.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
            <Link to="/login?signup=true" className="px-6 md:px-8 py-3 md:py-4 bg-white text-gray-900 rounded-2xl font-semibold text-base md:text-lg shadow-2xl hover:shadow-3xl transition-all hover:-translate-y-1">
              Start for free
            </Link>
            <a href="#demo" className="px-6 md:px-8 py-3 md:py-4 bg-white/20 text-white rounded-2xl font-semibold text-base md:text-lg border border-white/30 hover:bg-white/30 transition-all flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Watch demo
            </a>
          </div>
        </div>
        
        {/* Scroll indicator - desktop only */}
        <div className="hidden md:block absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center pt-2">
            <div className="w-1.5 h-3 bg-white/70 rounded-full animate-bounce"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-32 relative overflow-hidden bg-gray-50">
        {/* Subtle gradient blobs - desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute top-20 -left-20 w-72 h-72 bg-purple-200/40 rounded-full blur-3xl"></div>
          <div className="animate-blob-2 absolute bottom-20 -right-20 w-80 h-80 bg-orange-200/40 rounded-full blur-3xl"></div>
          <div className="animate-blob-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl"></div>
        </div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Everything clicks into place
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Simple tools that adapt to how you actually work
            </p>
          </div>
          
          {/* Feature cards */}
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            <div className="md:animate-float glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-xl shadow-purple-500/10 border border-gray-100 md:border-white/50">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 shadow-lg shadow-purple-500/30">
                <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">Kanban boards</h3>
              <p className="text-gray-600 text-sm md:text-base">Drag, drop, done. See your progress at a glance and move tasks with satisfying ease.</p>
            </div>
            
            <div className="md:animate-float-2 glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-xl shadow-orange-500/10 border border-gray-100 md:border-white/50">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 shadow-lg shadow-orange-500/30">
                <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">My Day</h3>
              <p className="text-gray-600 text-sm md:text-base">Start each morning with a clean slate. Pick your priorities, ignore the rest.</p>
            </div>
            
            <div className="md:animate-float-3 glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-xl shadow-teal-500/10 border border-gray-100 md:border-white/50">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 shadow-lg shadow-teal-500/30">
                <svg className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">Calendar view</h3>
              <p className="text-gray-600 text-sm md:text-base">See your deadlines coming. Plan ahead without the spreadsheet anxiety.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Try It Section - Interactive Demo */}
      <section id="try-it" className="py-16 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-orange-50"></div>
        {/* Blobs - desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute -top-20 right-1/4 w-64 h-64 bg-purple-200/50 rounded-full blur-3xl"></div>
          <div className="animate-blob-2 absolute -bottom-20 left-1/4 w-72 h-72 bg-orange-200/50 rounded-full blur-3xl"></div>
        </div>
        
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-8 md:mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-4 md:mb-6">
              <span>✨</span> AI-Powered
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Meeting notes → tasks in seconds
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Paste your messy meeting notes, and we'll pull out the action items automatically.
            </p>
          </div>
          
          {/* Interactive Demo */}
          <div className="max-w-4xl mx-auto">
            <div className="glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-2xl border border-gray-100 md:border-white/50">
              <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                {/* Input side */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Paste your notes</label>
                  <textarea 
                    value={demoNotes}
                    onChange={(e) => setDemoNotes(e.target.value)}
                    className="w-full h-40 md:h-48 px-4 py-3 border border-gray-200 rounded-xl md:rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-sm bg-white text-gray-900"
                    placeholder={`Team sync - 7th Jan

Sarah to follow up with the client by Friday.
Mike will prepare the Q2 report by next week.
Everyone needs to review the proposal before Monday.`}
                  />
                  <button 
                    onClick={handleExtract}
                    disabled={isExtracting || !demoNotes.trim()}
                    className="mt-4 w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isExtracting ? (
                      <>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Extracting...
                      </>
                    ) : (
                      'Extract Tasks ✨'
                    )}
                  </button>
                </div>
                
                {/* Output side */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Extracted tasks</label>
                  <div className="h-40 md:h-48 overflow-y-auto border border-gray-200 rounded-xl md:rounded-2xl p-4 bg-gray-50">
                    {!hasExtracted ? (
                      <p className="text-gray-400 text-sm text-center mt-12 md:mt-16">Your extracted tasks will appear here</p>
                    ) : demoTasks.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center mt-12 md:mt-16">No action items found. Try notes with phrases like "Sarah to follow up" or "Mike will prepare"</p>
                    ) : (
                      <div className="space-y-2">
                        {demoTasks.map((task, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100">
                            <div className="w-5 h-5 rounded-full border-2 border-purple-500 flex-shrink-0"></div>
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-800 text-sm block truncate">{task.title}</span>
                            </div>
                            {task.assignee && (
                              <span className="text-xs text-gray-400 flex-shrink-0">{task.assignee}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-gray-500 text-center">
                    <Link to="/login?signup=true" className="text-purple-600 hover:text-purple-700 font-medium">Sign up</Link> to save these tasks to your board
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-16 md:py-32 relative overflow-hidden bg-white">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Works where you work
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Connect Trackli to the tools you already use
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6 md:gap-8 max-w-3xl mx-auto">
            {/* Email to Tasks */}
            <div className="glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 md:border-white/50 text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 md:mb-6 bg-orange-50 rounded-xl md:rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 md:w-8 md:h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Email to Tasks</h3>
              <p className="text-gray-600 text-sm md:text-base mb-4">Forward any email to your personal Trackli address. Task created, inbox cleared.</p>
              <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Available now</span>
            </div>
            
            {/* Slack integration */}
            <div className="glass-card rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 md:border-white/50 text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 md:mb-6 bg-purple-50 rounded-xl md:rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 md:w-10 md:h-10" viewBox="0 0 24 24">
                  <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
                  <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
                  <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
                  <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Slack Integration</h3>
              <p className="text-gray-600 text-sm md:text-base mb-4">Create tasks from messages, get reminders in Slack</p>
              <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Available now</span>
            </div>
          </div>
        </div>
      </section>

      {/* Video Demo Section - Lazy loaded */}
      <section id="demo" className="py-16 md:py-32 relative overflow-hidden bg-gray-50">
        {/* Blobs - desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute top-0 left-1/4 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl"></div>
          <div className="animate-blob-2 absolute bottom-0 right-1/4 w-80 h-80 bg-orange-200/30 rounded-full blur-3xl"></div>
        </div>
        
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <div className="text-center mb-8 md:mb-10">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              See Trackli in action
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-xl mx-auto">
              Take a 2-minute tour of the key features — boards, My Day, calendar, and more.
            </p>
          </div>
          
          <div ref={arcadeRef} className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gray-100">
            {showArcade ? (
              <div style={{ position: 'relative', paddingBottom: 'calc(58.947368% + 41px)', height: 0, width: '100%' }}>
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
            ) : (
              <div className="aspect-video flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <p className="text-gray-500">Loading demo...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-32 gradient-hero relative overflow-hidden">
        {/* Blobs - desktop only */}
        <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute -top-32 -left-32 w-96 h-96 bg-white/20 rounded-full blur-3xl"></div>
          <div className="animate-blob-2 absolute -bottom-32 -right-32 w-96 h-96 bg-white/15 rounded-full blur-3xl"></div>
        </div>
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-full text-sm font-medium mb-6 border border-white/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Beta
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6 drop-shadow-lg">
            Ready to feel organised?
          </h2>
          <p className="text-lg md:text-xl text-white/90 mb-8 md:mb-10">
            Free while in beta. No credit card required.
          </p>
          <Link to="/login?signup=true" className="inline-block px-8 md:px-10 py-4 md:py-5 bg-white text-gray-900 rounded-2xl font-bold text-base md:text-lg shadow-2xl hover:-translate-y-1 transition-all">
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 md:py-12 bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8">
                <svg viewBox="0 0 56 56" fill="none" className="w-full h-full">
                  <path d="M6 18L28 6L28 38L6 26Z" fill="#A78BFA"/>
                  <path d="M28 6L50 18L50 46L28 38Z" fill="#FB923C"/>
                  <path d="M6 18L28 6L50 18L28 30Z" fill="#E9D5FF"/>
                  <path d="M18 19L25 26L36 14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-lg font-bold text-white">Trackli</span>
            </div>
            <div className="flex gap-6 md:gap-8 text-gray-400 text-sm">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
              <a href="mailto:hello@gettrackli.com" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-gray-500 text-sm">© {new Date().getFullYear()} Trackli</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
