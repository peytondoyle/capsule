'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Camera, Lock, Users, Cloud, Mail } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading, initialize, signInWithGoogle, signInWithEmail } = useAuthStore()
  const [email, setEmail] = useState('')
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setIsSending(true)
    setEmailError(null)

    const result = await signInWithEmail(email.trim())

    if (result.success) {
      setEmailSent(true)
    } else {
      setEmailError(result.error || 'Failed to send email')
    }

    setIsSending(false)
  }

  if (user) {
    return null // Redirecting...
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2">
          <Camera className="h-8 w-8 text-blue-600" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Capsule</span>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Share photos, keep memories
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
            Full-resolution photo sharing without storage limits. Your photos stay in your cloud.
          </p>

          {/* Auth Buttons */}
          <div className="flex flex-col gap-4 justify-center items-center mb-16 max-w-sm mx-auto">
            {emailSent ? (
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg w-full">
                <Mail className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Check your email</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  We sent a sign-in link to <strong>{email}</strong>
                </p>
                <button
                  onClick={() => { setEmailSent(false); setEmail(''); }}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  Use a different email
                </button>
              </div>
            ) : showEmailInput ? (
              <form onSubmit={handleEmailSubmit} className="w-full space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  disabled={isSending}
                />
                {emailError && (
                  <p className="text-red-500 text-sm">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={isSending || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Mail className="h-5 w-5" />
                  {isSending ? 'Sending...' : 'Send sign-in link'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmailInput(false)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Back to sign-in options
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={signInWithGoogle}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
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

                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                  <span className="text-sm text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                </div>

                <button
                  onClick={() => setShowEmailInput(true)}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Mail className="h-5 w-5" />
                  Continue with Email
                </button>
              </>
            )}
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-3 gap-8 text-left">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Cloud className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Your Storage</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Photos stay in your iCloud Drive. No extra subscriptions.
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Users className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Easy Sharing</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Invite family and friends with a simple link.
              </p>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Lock className="h-10 w-10 text-blue-600 mb-4" />
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Full Control</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Manage permissions and organize your way.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
        <p>Download the iOS app for the full experience</p>
      </footer>
    </div>
  )
}
