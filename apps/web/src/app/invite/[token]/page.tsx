'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { Camera, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'

type InviteStatus = 'loading' | 'valid' | 'expired' | 'not_found' | 'already_member' | 'joining' | 'joined' | 'pending_approval' | 'error'

interface InviteData {
  albumId: string
  albumTitle: string
  defaultRole: string
  requiresApproval: boolean
  expiresAt: string | null
}

export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const { user, isLoading: authLoading, initialize } = useAuthStore()
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (!authLoading) {
      validateInvite()
    }
  }, [authLoading, token])

  const validateInvite = async () => {
    const supabase = createClient()

    try {
      // Fetch invite with album details
      const { data: inviteData, error: inviteError } = await supabase
        .schema('capsule')
        .from('album_invites')
        .select(`
          id,
          album_id,
          default_role,
          requires_approval,
          expires_at,
          albums (
            title
          )
        `)
        .eq('invite_token', token)
        .single()

      if (inviteError || !inviteData) {
        setStatus('not_found')
        return
      }

      // Check if expired
      if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
        setStatus('expired')
        return
      }

      // Check if user is already a member
      if (user) {
        const { data: membership } = await supabase
          .schema('capsule')
          .from('album_members')
          .select('album_id')
          .eq('album_id', inviteData.album_id)
          .eq('user_id', user.id)
          .single()

        if (membership) {
          setStatus('already_member')
          setInvite({
            albumId: inviteData.album_id,
            albumTitle: (inviteData.albums as any)?.title || 'Album',
            defaultRole: inviteData.default_role,
            requiresApproval: inviteData.requires_approval ?? false,
            expiresAt: inviteData.expires_at,
          })
          return
        }
      }

      setInvite({
        albumId: inviteData.album_id,
        albumTitle: (inviteData.albums as any)?.title || 'Album',
        defaultRole: inviteData.default_role,
        requiresApproval: inviteData.requires_approval ?? false,
        expiresAt: inviteData.expires_at,
      })
      setStatus('valid')

    } catch (err) {
      console.error('Error validating invite:', err)
      setStatus('error')
      setError('Something went wrong')
    }
  }

  const acceptInvite = async () => {
    if (!user || !invite) return

    setStatus('joining')
    const supabase = createClient()

    try {
      if (invite.requiresApproval) {
        // Create join request
        const { error: requestError } = await supabase
          .schema('capsule')
          .from('join_requests')
          .insert({
            album_id: invite.albumId,
            user_id: user.id,
          })

        if (requestError) throw requestError
        setStatus('pending_approval')

      } else {
        // Join directly
        const { error: memberError } = await supabase
          .schema('capsule')
          .from('album_members')
          .insert({
            album_id: invite.albumId,
            user_id: user.id,
            role: invite.defaultRole,
          })

        if (memberError) throw memberError
        setStatus('joined')
      }

    } catch (err: any) {
      console.error('Error accepting invite:', err)
      setStatus('error')
      setError(err.message || 'Failed to join album')
    }
  }

  const goToAlbum = () => {
    if (invite) {
      router.push(`/album/${invite.albumId}`)
    }
  }

  const goToAlbums = () => {
    router.push('/albums')
  }

  // Loading state
  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading invite...</p>
        </div>
      </div>
    )
  }

  // Not signed in - show sign in prompt
  if (!user && status !== 'not_found' && status !== 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Camera className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">You&apos;re Invited!</h1>
          {invite && (
            <p className="text-gray-600 mb-6">
              Join <span className="font-semibold">{invite.albumTitle}</span> on Capsule
            </p>
          )}
          <p className="text-gray-500 mb-8">Sign in to accept this invitation</p>
          <button
            onClick={() => router.push(`/?redirect=/invite/${token}`)}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">

        {/* Not Found */}
        {status === 'not_found' && (
          <>
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Invite Not Found</h1>
            <p className="text-gray-600 mb-6">
              This invite link doesn&apos;t exist or has been revoked.
            </p>
            <button
              onClick={goToAlbums}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Go to My Albums
            </button>
          </>
        )}

        {/* Expired */}
        {status === 'expired' && (
          <>
            <Clock className="h-16 w-16 text-orange-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Invite Expired</h1>
            <p className="text-gray-600 mb-6">
              This invite link has expired. Ask the album owner for a new one.
            </p>
            <button
              onClick={goToAlbums}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Go to My Albums
            </button>
          </>
        )}

        {/* Already a Member */}
        {status === 'already_member' && invite && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Already a Member</h1>
            <p className="text-gray-600 mb-6">
              You&apos;re already a member of <span className="font-semibold">{invite.albumTitle}</span>
            </p>
            <button
              onClick={goToAlbum}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Open Album
            </button>
          </>
        )}

        {/* Valid Invite */}
        {status === 'valid' && invite && (
          <>
            <Camera className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">You&apos;re Invited!</h1>
            <p className="text-gray-600 mb-2">
              Join <span className="font-semibold">{invite.albumTitle}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              You&apos;ll be added as a {invite.defaultRole.replace('_', ' ')}
            </p>
            {invite.requiresApproval && (
              <p className="text-sm text-orange-600 mb-4">
                Your request will need to be approved by the album owner
              </p>
            )}
            <button
              onClick={acceptInvite}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {invite.requiresApproval ? 'Request to Join' : 'Accept Invite'}
            </button>
          </>
        )}

        {/* Joining */}
        {status === 'joining' && (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Joining...</h1>
          </>
        )}

        {/* Joined Successfully */}
        {status === 'joined' && invite && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">You&apos;re In!</h1>
            <p className="text-gray-600 mb-6">
              Welcome to <span className="font-semibold">{invite.albumTitle}</span>
            </p>
            <button
              onClick={goToAlbum}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Open Album
            </button>
          </>
        )}

        {/* Pending Approval */}
        {status === 'pending_approval' && invite && (
          <>
            <Clock className="h-16 w-16 text-orange-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Request Sent!</h1>
            <p className="text-gray-600 mb-6">
              Your request to join <span className="font-semibold">{invite.albumTitle}</span> has been sent. You&apos;ll be notified when it&apos;s approved.
            </p>
            <button
              onClick={goToAlbums}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Go to My Albums
            </button>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Something Went Wrong</h1>
            <p className="text-gray-600 mb-6">{error || 'Please try again later'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
