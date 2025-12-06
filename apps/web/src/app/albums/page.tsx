'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { Camera, Plus, Lock, Link as LinkIcon, Globe, LogOut } from 'lucide-react'
import type { Database } from '@/types/database'

type Album = Database['capsule']['Tables']['albums']['Row']

export default function AlbumsPage() {
  const router = useRouter()
  const { user, profile, isLoading: authLoading, initialize, signOut } = useAuthStore()
  const [albums, setAlbums] = useState<Album[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (user) {
      fetchAlbums()
    }
  }, [user])

  const fetchAlbums = async () => {
    const supabase = createClient()

    // Get albums user is a member of
    const { data: memberships } = await supabase
      .schema('capsule')
      .from('album_members')
      .select('album_id')
      .eq('user_id', user!.id)

    if (!memberships?.length) {
      setAlbums([])
      setIsLoading(false)
      return
    }

    const albumIds = memberships.map(m => m.album_id)

    const { data: albums } = await supabase
      .schema('capsule')
      .from('albums')
      .select('*')
      .in('id', albumIds)
      .order('updated_at', { ascending: false })

    setAlbums(albums || [])
    setIsLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-bold">Capsule</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{profile?.display_name || user.email}</span>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Your Albums</h1>
          <p className="text-sm text-gray-500">
            Create albums in the iOS app
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : albums.length === 0 ? (
          <div className="text-center py-20">
            <Camera className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No albums yet</h2>
            <p className="text-gray-500 mb-6">
              You haven&apos;t been added to any albums.
              <br />
              Ask someone to invite you, or create albums in the iOS app.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((album) => (
              <Link
                key={album.id}
                href={`/album/${album.id}`}
                className="block bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                  <Camera className="h-12 w-12 text-gray-300" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-1">{album.title}</h3>
                  {album.description && (
                    <p className="text-gray-500 text-sm line-clamp-2 mb-2">
                      {album.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {album.privacy_mode === 'invite_only' && (
                      <>
                        <Lock className="h-3 w-3" />
                        <span>Invite Only</span>
                      </>
                    )}
                    {album.privacy_mode === 'link_accessible' && (
                      <>
                        <LinkIcon className="h-3 w-3" />
                        <span>Link Accessible</span>
                      </>
                    )}
                    {album.privacy_mode === 'public_unlisted' && (
                      <>
                        <Globe className="h-3 w-3" />
                        <span>Public</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
