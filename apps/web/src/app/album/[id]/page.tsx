'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { Camera, ArrowLeft, Upload } from 'lucide-react'
import type { Database } from '@/types/database'
import PhotoModal from '@/components/PhotoModal'

type Album = Database['capsule']['Tables']['albums']['Row']
type Photo = Database['capsule']['Tables']['photos']['Row']

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export default function AlbumPage() {
  const router = useRouter()
  const params = useParams()
  const albumId = params.id as string

  const { user, isLoading: authLoading, initialize } = useAuthStore()
  const [album, setAlbum] = useState<Album | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (user && albumId) {
      fetchAlbum()
      fetchPhotos()
    }
  }, [user, albumId])

  const fetchAlbum = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .schema('capsule')
      .from('albums')
      .select('*')
      .eq('id', albumId)
      .single()

    if (data) {
      setAlbum(data)
    }
  }

  const fetchPhotos = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .schema('capsule')
      .from('photos')
      .select('*')
      .eq('album_id', albumId)
      .order('created_at', { ascending: false })

    setPhotos(data || [])
    setIsLoading(false)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !user) return

    setIsUploading(true)
    setUploadProgress(0)

    const supabase = createClient()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const photoId = crypto.randomUUID()
      const thumbnailPath = `${albumId}/${photoId}.jpg`

      try {
        // Upload to temp bucket
        const { error: uploadError } = await supabase.storage
          .from('capsule-temp-uploads')
          .upload(`${user.id}/${photoId}/${file.name}`, file)

        if (uploadError) throw uploadError

        // Get the URL
        const { data: urlData } = supabase.storage
          .from('capsule-temp-uploads')
          .getPublicUrl(`${user.id}/${photoId}/${file.name}`)

        // Create thumbnail (using the same file for now - server should resize)
        // In production, you'd want to resize client-side or use an edge function
        const { error: thumbError } = await supabase.storage
          .from('capsule-thumbnails')
          .upload(thumbnailPath, file, { contentType: 'image/jpeg' })

        if (thumbError) throw thumbError

        // Create photo record
        const { data: photo, error: insertError } = await supabase
          .schema('capsule')
          .from('photos')
          .insert({
            id: photoId,
            album_id: albumId,
            uploader_id: user.id,
            original_uri: urlData.publicUrl,
            original_storage_type: 'temp_bucket',
            thumbnail_path: thumbnailPath,
            media_type: 'photo',
            file_size_bytes: file.size,
          })
          .select()
          .single()

        if (insertError) throw insertError

        if (photo) {
          setPhotos(prev => [photo, ...prev])
        }
      } catch (error) {
        console.error('Upload failed:', error)
      }

      setUploadProgress(((i + 1) / files.length) * 100)
    }

    setIsUploading(false)
    setUploadProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getThumbnailUrl = (photo: Photo) => {
    return `${SUPABASE_URL}/storage/v1/object/public/capsule-thumbnails/${photo.thumbnail_path}`
  }

  if (authLoading || !user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/albums"
              className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">{album?.title || 'Album'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? `${Math.round(uploadProgress)}%` : 'Upload'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {photos.length === 0 ? (
          <div className="text-center py-20">
            <Camera className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No photos yet</h2>
            <p className="text-gray-500 mb-6">
              Upload photos to start building this album
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="h-5 w-5" />
              Upload Photos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="aspect-square relative overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
              >
                <Image
                  src={getThumbnailUrl(photo)}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          thumbnailUrl={getThumbnailUrl(selectedPhoto)}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  )
}
