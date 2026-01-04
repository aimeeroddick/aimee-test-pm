import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BetaTester = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    useCase: '',
    experience: '',
    availability: '',
    device: '',
    comments: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showDemos, setShowDemos] = useState(false)

  const useCases = [
    { id: 'personal', label: '🏠 Personal Task Management', description: 'Day-to-day personal tasks, errands, goals' },
    { id: 'professional', label: '💼 Professional Task Management', description: 'Work tasks, meetings, deadlines' },
    { id: 'project', label: '📊 Project Management', description: 'Managing projects, teams, deliverables' }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: submitError } = await supabase
        .from('beta_testers')
        .insert([{
          name: formData.name,
          email: formData.email,
          use_case: formData.useCase,
          experience: formData.experience,
          availability: formData.availability,
          device: formData.device,
          comments: formData.comments,
          created_at: new Date().toISOString()
        }])

      if (submitError) throw submitError
      setSubmitted(true)
    } catch (err) {
      console.error('Error submitting:', err)
      setError('Something went wrong. Please try again or email hello@gettrackli.com')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-12">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Thank You! 🎉</h1>
            <p className="text-lg text-gray-600 mb-6">
              We've received your application to become a Trackli beta tester. We'll be in touch within 48 hours with next steps.
            </p>
            <p className="text-gray-500 mb-8">
              In the meantime, feel free to explore the demos or check out Trackli!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowDemos(true)}
                className="px-6 py-3 bg-indigo-100 text-indigo-700 rounded-xl font-semibold hover:bg-indigo-200 transition-colors"
              >
                Watch Demos
              </button>
              <Link
                to="/login"
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all"
              >
                Try Trackli Now
              </Link>
            </div>
          </div>
        </div>

        {/* Demo Modal */}
        {showDemos && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowDemos(false)}>
            <div className="relative w-full max-w-5xl h-[80vh] bg-white rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowDemos(false)}
                className="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <iframe 
                className="arcade-collection" 
                src="https://app.arcade.software/share/collections/jpzeHWwB0yHCXy2MJxEK?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true&force_no_header=true" 
                title="Trackli Demos" 
                frameBorder="0" 
                loading="lazy" 
                webkitallowfullscreen="true"
                mozallowfullscreen="true"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation allow-popups" 
                allow="clipboard-write" 
                style={{ width: '100%', height: '100%', colorScheme: 'light' }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="Trackli" className="h-8 w-8" />
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Trackli</span>
          </Link>
          <Link 
            to="/login"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Sign In →
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 pt-8 pb-12 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 rounded-full text-sm font-medium mb-6">
            <span className="animate-pulse">🔥</span>
            <span>Limited Beta Spots Available</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Help Shape the Future of{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Task Management</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Trackli is a powerful task management app built for productivity. We're looking for beta testers to help us make it even better — and we'll compensate you for your time.
          </p>
          <button
            onClick={() => setShowDemos(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all border border-indigo-100"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Watch the Demos
          </button>
        </div>
      </section>

      {/* What We're Looking For */}
      <section className="px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-4">Who We're Looking For</h2>
          <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
            We need 10-12 dedicated testers across three categories. Each tester will use Trackli as their primary task management tool for 1-2 weeks.
          </p>
          
          <div className="grid sm:grid-cols-3 gap-6">
            {useCases.map((useCase, index) => (
              <div 
                key={useCase.id}
                className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:border-indigo-200 hover:shadow-xl transition-all"
              >
                <div className="text-4xl mb-4">{useCase.label.split(' ')[0]}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{useCase.label.slice(2)}</h3>
                <p className="text-gray-600 text-sm mb-4">{useCase.description}</p>
                <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                  3-4 spots available
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What You'll Get */}
      <section className="px-4 py-12 bg-gradient-to-r from-indigo-500 to-purple-600">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">What's In It For You?</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="font-semibold mb-2">Compensation</h3>
              <p className="text-indigo-100 text-sm">Get paid for your valuable feedback and time</p>
            </div>
            <div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎁</span>
              </div>
              <h3 className="font-semibold mb-2">Early Access</h3>
              <p className="text-indigo-100 text-sm">Be the first to try new features before anyone else</p>
            </div>
            <div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-semibold mb-2">Shape the Product</h3>
              <p className="text-indigo-100 text-sm">Your feedback directly influences what we build</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sign Up Form */}
      <section className="px-4 py-16" id="signup">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 text-center">Become a Beta Tester</h2>
            <p className="text-gray-600 text-center mb-8">Fill out the form below and we'll be in touch!</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">How would you use Trackli? *</label>
                <div className="grid gap-3">
                  {useCases.map((useCase) => (
                    <label
                      key={useCase.id}
                      className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        formData.useCase === useCase.id 
                          ? 'border-indigo-500 bg-indigo-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="useCase"
                        value={useCase.id}
                        checked={formData.useCase === useCase.id}
                        onChange={(e) => setFormData({ ...formData, useCase: e.target.value })}
                        className="w-4 h-4 text-indigo-600"
                        required
                      />
                      <div>
                        <div className="font-medium text-gray-900">{useCase.label}</div>
                        <div className="text-sm text-gray-500">{useCase.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What task management tools have you used before?
                </label>
                <input
                  type="text"
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="e.g., Todoist, Asana, Notion, pen & paper..."
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Availability *</label>
                  <select
                    required
                    value={formData.availability}
                    onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select...</option>
                    <option value="1-week">1 week</option>
                    <option value="2-weeks">2 weeks</option>
                    <option value="flexible">Flexible / longer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Device *</label>
                  <select
                    required
                    value={formData.device}
                    onChange={(e) => setFormData({ ...formData, device: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select...</option>
                    <option value="desktop">Desktop / Laptop</option>
                    <option value="mobile">Mobile (iPhone/Android)</option>
                    <option value="both">Both equally</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Anything else you'd like us to know?
                </label>
                <textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  placeholder="Your experience, expectations, or questions..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold text-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  'Apply to Be a Beta Tester'
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-8 border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/logo.svg" alt="Trackli" className="h-6 w-6" />
            <span className="font-bold text-gray-900">Trackli</span>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Questions? Email us at{' '}
            <a href="mailto:hello@gettrackli.com" className="text-indigo-600 hover:underline">
              hello@gettrackli.com
            </a>
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <Link to="/privacy" className="hover:text-indigo-600">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-indigo-600">Terms of Service</Link>
          </div>
        </div>
      </footer>

      {/* Demo Modal */}
      {showDemos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowDemos(false)}>
          <div className="relative w-full max-w-5xl h-[80vh] bg-white rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowDemos(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <iframe 
              className="arcade-collection" 
              src="https://app.arcade.software/share/collections/jpzeHWwB0yHCXy2MJxEK?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true&force_no_header=true" 
              title="Trackli Demos" 
              frameBorder="0" 
              loading="lazy" 
              webkitallowfullscreen="true"
              mozallowfullscreen="true"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation allow-popups" 
              allow="clipboard-write" 
              style={{ width: '100%', height: '100%', colorScheme: 'light' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default BetaTester
