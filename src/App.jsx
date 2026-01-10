import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { useAuth } from './contexts/AuthContext'
import PrivacyPolicy from './components/PrivacyPolicy'
import Terms from './components/Terms'
import BetaTester from './components/BetaTester'
import UpdateNotification from './components/UpdateNotification'

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation()
  
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  
  return null
}

// Lazy load components for better code splitting
const Login = lazy(() => import('./components/Login'))
const KanbanBoard = lazy(() => import('./components/KanbanBoard'))
const LandingPage = lazy(() => import('./components/LandingPage'))
const OutlookAddin = lazy(() => import('./components/OutlookAddin'))

// Prefetch KanbanBoard in background after initial render
const prefetchKanbanBoard = () => import('./components/KanbanBoard')

// Loading spinner for lazy components - Trackli branded
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
    <div className="text-center">
      {/* Animated Logo */}
      <div className="relative mb-6">
        <img src="/logo.png" alt="trackli" className="w-20 h-20 mx-auto drop-shadow-xl" />
        {/* Pulse ring */}
        <div className="absolute inset-0 w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-orange-500 animate-ping opacity-20" />
      </div>
      
      {/* Brand name */}
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2" style={{ fontFamily: 'Rubik, sans-serif' }}>
        trackli
      </h1>
      
      {/* Loading text */}
      <p className="text-gray-500 dark:text-gray-300 text-sm">
        Loading your tasks...
      </p>
    </div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <Navigate to="/welcome" replace />
  }

  // Block users who haven't confirmed their email
  if (!user.email_confirmed_at) {
    return <Navigate to="/login?unconfirmed=true" replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) {
    return <LoadingSpinner />
  }

  // If user is logged in AND email is confirmed, redirect to app
  if (user && user.email_confirmed_at) {
    return <Navigate to="/app" replace />
  }

  return children
}

function App() {
  // Prefetch KanbanBoard after page is idle - don't compete with initial load
  useEffect(() => {
    const timer = setTimeout(prefetchKanbanBoard, 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public routes */}
        <Route 
          path="/welcome" 
          element={
            <PublicRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <LandingPage />
              </Suspense>
            </PublicRoute>
          } 
        />
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Login />
              </Suspense>
            </PublicRoute>
          } 
        />
        
        {/* Demo mode route (no auth required) */}
        <Route
          path="/demo"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <KanbanBoard demoMode={true} />
            </Suspense>
          }
        />
        
        {/* Protected app route */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <KanbanBoard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        
        {/* Outlook add-in (doesn't need auth redirect logic) */}
        <Route 
          path="/outlook-addin" 
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <OutlookAddin />
            </Suspense>
          } 
        />
        
        {/* Legal pages (public, no auth needed) */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/beta" element={<BetaTester />} />
        
        {/* Root redirect based on auth status */}
        <Route path="/" element={<RootRedirect />} />
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
      <SpeedInsights />
      <UpdateNotification />
    </>
  )
}

function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  return user ? <Navigate to="/app" replace /> : <Navigate to="/welcome" replace />
}

export default App
