'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Camera, Lock, Users, Cloud } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading, initialize, signInWithGoogle, signInWithApple } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (user && !isLoading) {
      router.push('/albums')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (user) {
    return null // Redirecting...
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2">
          <Camera className="h-8 w-8 text-blue-600" />
          <span className="text-xl font-bold">Capsule</span>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Share photos, keep memories
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Full-resolution photo sharing without storage limits. Your photos stay in your cloud.
          </p>

          {/* Auth Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button
              onClick={signInWithApple}
              className="flex items-center justify-center gap-3 px-6 py-3 bg-black text-white rounded-lg shadow-sm hover:bg-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>

            <button
              onClick={signInWithGoogle}
              className="flex items-center justify-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-3 gap-8 text-left">
            <div className="p-6 bg-white rounded-xl shadow-sm">
              <Cloud className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Your Storage</h3>
              <p className="text-gray-600 text-sm">
                Photos stay in your iCloud Drive. No extra subscriptions.
              </p>
            </div>
            <div className="p-6 bg-white rounded-xl shadow-sm">
              <Users className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Easy Sharing</h3>
              <p className="text-gray-600 text-sm">
                Invite family and friends with a simple link.
              </p>
            </div>
            <div className="p-6 bg-white rounded-xl shadow-sm">
              <Lock className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Full Control</h3>
              <p className="text-gray-600 text-sm">
                Manage permissions and organize your way.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-500 text-sm">
        <p>Download the iOS app for the full experience</p>
      </footer>
    </div>
  )
}
