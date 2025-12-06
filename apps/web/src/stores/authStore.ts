import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
}

interface AuthState {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  error: string | null
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  initialize: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string) => Promise<{ success: boolean; error?: string }>
  verifyOtp: (email: string, token: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  initialize: async () => {
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      set({ user, isLoading: false })

      if (user) {
        const { data: profile } = await supabase
          .schema('capsule')
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        set({ profile })
      }
    } catch {
      set({ isLoading: false })
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null
      set({ user })

      if (user) {
        const { data: profile } = await supabase
          .schema('capsule')
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        set({ profile })
      } else {
        set({ profile: null })
      }
    })
  },

  signInWithGoogle: async () => {
    const supabase = createClient()
    set({ error: null })

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      set({ error: error.message })
    }
  },

  signInWithEmail: async (email: string) => {
    const supabase = createClient()
    set({ error: null })

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      set({ error: error.message })
      return { success: false, error: error.message }
    }

    return { success: true }
  },

  verifyOtp: async (email: string, token: string) => {
    const supabase = createClient()
    set({ error: null })

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      set({ error: error.message })
      return { success: false, error: error.message }
    }

    return { success: true }
  },

  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))
