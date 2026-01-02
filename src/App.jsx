import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import LandingPage from './components/LandingPage'
import PrivacyPolicy from './components/PrivacyPolicy'
import Terms from './components/Terms'
import UpdateNotification from './components/UpdateNotification'

// Lazy load heavy components
const KanbanBoard = lazy(() => import('./components/KanbanBoard'))
const OutlookAddin = lazy(() => import('./components/OutlookAddin'))

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
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route 
          path="/welcome" 
          element={
            <PublicRoute>
              <LandingPage />
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
