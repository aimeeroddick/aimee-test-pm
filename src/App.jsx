import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
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

// Lazy load heavy components
const KanbanBoard = lazy(() => import('./components/KanbanBoard'))
const LandingPage = lazy(() => import('./components/LandingPage'))
const OutlookAddin = lazy(() => import('./components/OutlookAddin'))

// Prefetch KanbanBoard in background after initial render
const prefetchKanbanBoard = () => import('./components/KanbanBoard')

// Loading spinner for lazy components
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-500">Loading...</p>
    </div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/welcome" replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  // If user is logged in, redirect to app
  if (user) {
    return <Navigate to="/app" replace />
  }

  return children
}

function App() {
  // Prefetch KanbanBoard after initial paint for faster navigation
  useEffect(() => {
    const timer = setTimeout(prefetchKanbanBoard, 1000)
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
              <Login />
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return user ? <Navigate to="/app" replace /> : <Navigate to="/welcome" replace />
}

export default App
