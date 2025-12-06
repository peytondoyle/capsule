'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import { X, Heart, Star, MessageCircle, Download, Send, Trash2 } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
import {
  fetchPhotoInteractions,
  toggleLike,
  toggleFavorite,
  fetchComments,
  addComment,
  deleteComment,
  type Comment,
} from '@/lib/supabase/social'
import { useAuthStore } from '@/stores/authStore'

interface Photo {
  id: string
  thumbnail_path: string
  original_uri: string
  width: number | null
  height: number | null
  file_size_bytes: number | null
  created_at: string | null
}

interface PhotoModalProps {
  photo: Photo
  thumbnailUrl: string
  onClose: () => void
}

export default function PhotoModal({ photo, thumbnailUrl, onClose }: PhotoModalProps) {
  const { user } = useAuthStore()
  const [isLiked, setIsLiked] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [isSendingComment, setIsSendingComment] = useState(false)
  const commentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInteractions()
  }, [photo.id])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const loadInteractions = async () => {
    const data = await fetchPhotoInteractions(photo.id)
    setIsLiked(data.liked)
    setIsFavorited(data.favorited)
    setLikeCount(data.likeCount)
    setCommentCount(data.commentCount)
  }

  const handleLike = async () => {
    // Optimistic update
    setIsLiked(!isLiked)
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1)

    const success = await toggleLike(photo.id)
    if (!success) {
      // Revert on failure
      setIsLiked(isLiked)
      setLikeCount(likeCount)
    }
  }

  const handleFavorite = async () => {
    // Optimistic update
    setIsFavorited(!isFavorited)

    const success = await toggleFavorite(photo.id)
    if (!success) {
      // Revert on failure
      setIsFavorited(isFavorited)
    }
  }

  const handleToggleComments = async () => {
    if (!showComments) {
      setShowComments(true)
      setIsLoadingComments(true)
      const data = await fetchComments(photo.id)
      setComments(data)
      setIsLoadingComments(false)
      setTimeout(() => commentInputRef.current?.focus(), 100)
    } else {
      setShowComments(false)
    }
  }

  const handleSendComment = async () => {
    const text = newComment.trim()
    if (!text) return

    setIsSendingComment(true)
    setNewComment('')

    const comment = await addComment(photo.id, text)
    if (comment) {
      setComments([...comments, comment])
      setCommentCount(commentCount + 1)
    }

    setIsSendingComment(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    const success = await deleteComment(commentId)
    if (success) {
      setComments(comments.filter(c => c.id !== commentId))
      setCommentCount(Math.max(0, commentCount - 1))
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString()
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex" onClick={onClose}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white z-10"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Main content */}
      <div
        className="flex-1 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-4xl max-h-[90vh] relative">
          <Image
            src={thumbnailUrl}
            alt=""
            width={photo.width || 1200}
            height={photo.height || 800}
            className="max-h-[75vh] w-auto object-contain"
          />

          {/* Action bar */}
          <div className="mt-4 flex items-center gap-6">
            {/* Like */}
            <button
              onClick={handleLike}
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <Heart
                className={`h-6 w-6 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
              />
              {likeCount > 0 && <span className="text-sm">{likeCount}</span>}
            </button>

            {/* Favorite */}
            <button
              onClick={handleFavorite}
              className="text-white/80 hover:text-white transition-colors"
            >
              <Star
                className={`h-6 w-6 ${isFavorited ? 'fill-yellow-400 text-yellow-400' : ''}`}
              />
            </button>

            {/* Comments */}
            <button
              onClick={handleToggleComments}
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <MessageCircle className={`h-6 w-6 ${showComments ? 'fill-white' : ''}`} />
              {commentCount > 0 && <span className="text-sm">{commentCount}</span>}
            </button>

            <div className="flex-1" />

            {/* Metadata */}
            <span className="text-white/60 text-sm">
              {photo.width && photo.height && `${photo.width} × ${photo.height}`}
            </span>
            {photo.file_size_bytes && (
              <span className="text-white/60 text-sm">
                {formatFileSize(photo.file_size_bytes)}
              </span>
            )}

            {/* Download */}
            <a
              href={photo.original_uri}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-white/80 hover:text-white text-sm"
            >
              <Download className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>

      {/* Comments panel */}
      {showComments && (
        <div
          className="w-80 bg-white flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b font-semibold">
            Comments ({commentCount})
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoadingComments ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No comments yet. Be the first!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="group">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                      {(comment.profiles?.display_name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {comment.profiles?.display_name || 'User'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatRelativeTime(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 break-words">
                        {comment.content}
                      </p>
                    </div>
                    {comment.user_id === user?.id && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-2">
              <input
                ref={commentInputRef}
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSendingComment}
              />
              <button
                onClick={handleSendComment}
                disabled={!newComment.trim() || isSendingComment}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
