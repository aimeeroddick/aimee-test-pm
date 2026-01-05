import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(false)

  // Fetch user profile from profiles table
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      // PGRST116 = no rows found (new user, no profile yet)
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error)
        return null
      }
      return data
    } catch (err) {
      console.error('Error fetching profile:', err)
      return null
    }
  }

  // Create or update user profile
  const updateProfile = async (updates) => {
    if (!user) return { error: new Error('No user logged in') }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          ...updates,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single()
      
      if (error) throw error
      setProfile(data)
      return { data, error: null }
    } catch (err) {
      console.error('Error updating profile:', err)
      return { data: null, error: err }
    }
  }

  // Upload avatar to Supabase storage
  const uploadAvatar = async (file) => {
    if (!user) return { error: new Error('No user logged in') }
    
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with avatar URL
      const { data, error } = await updateProfile({ avatar_url: publicUrl })
      if (error) throw error

      return { url: publicUrl, error: null }
    } catch (err) {
      console.error('Error uploading avatar:', err)
      return { url: null, error: err }
    }
  }

  useEffect(() => {
    // Check if demo mode was set in URL
    if (window.location.pathname === '/demo') {
      setDemoMode(true)
      setLoading(false)
      return
    }

    // Safety timeout - never stay loading forever
    const timeout = setTimeout(() => {
      console.warn('Auth loading timeout - forcing complete')
      setLoading(false)
    }, 5000)

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      
      if (currentUser) {
        // Fetch profile but don't block on it
        fetchProfile(currentUser.id).then(profileData => {
          setProfile(profileData)
        })
      }
      
      clearTimeout(timeout)
      setLoading(false)
    }).catch(err => {
      console.error('Auth session error:', err)
      clearTimeout(timeout)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      
      if (currentUser) {
        // Fetch profile in background, don't block
        fetchProfile(currentUser.id).then(profileData => {
          setProfile(profileData)
        })
      } else {
        setProfile(null)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const enterDemoMode = () => {
    setDemoMode(true)
  }

  const exitDemoMode = () => {
    setDemoMode(false)
  }

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  const signOut = async () => {
    setProfile(null)
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { data, error }
  }

  const resendConfirmation = async (email) => {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    })
    return { data, error }
  }

  const verifyOtp = async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email,
      token: token,
      type: 'signup',
    })
    return { data, error }
  }

  const value = {
    user,
    profile,
    loading,
    demoMode,
    enterDemoMode,
    exitDemoMode,
    signUp,
    signIn,
    signOut,
    resetPassword,
    resendConfirmation,
    verifyOtp,
    updateProfile,
    uploadAvatar,
    fetchProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
