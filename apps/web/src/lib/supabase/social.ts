import { createClient } from './client'

export interface Comment {
  id: string
  photo_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

export interface Like {
  user_id: string
  photo_id: string
  created_at: string
  profiles?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
}

// MARK: - Favorites (Private)

export async function isFavorited(photoId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .schema('capsule')
    .from('favorites')
    .select('photo_id')
    .eq('photo_id', photoId)
    .eq('user_id', user.id)
    .maybeSingle()

  return !!data
}

export async function toggleFavorite(photoId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const favorited = await isFavorited(photoId)

  if (favorited) {
    const { error } = await supabase
      .schema('capsule')
      .from('favorites')
      .delete()
      .eq('photo_id', photoId)
      .eq('user_id', user.id)
    return !error
  } else {
    const { error } = await supabase
      .schema('capsule')
      .from('favorites')
      .insert({ photo_id: photoId, user_id: user.id })
    return !error
  }
}

// MARK: - Likes (Public)

export async function isLiked(photoId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .schema('capsule')
    .from('likes')
    .select('photo_id')
    .eq('photo_id', photoId)
    .eq('user_id', user.id)
    .maybeSingle()

  return !!data
}

export async function toggleLike(photoId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const liked = await isLiked(photoId)

  if (liked) {
    const { error } = await supabase
      .schema('capsule')
      .from('likes')
      .delete()
      .eq('photo_id', photoId)
      .eq('user_id', user.id)
    return !error
  } else {
    const { error } = await supabase
      .schema('capsule')
      .from('likes')
      .insert({ photo_id: photoId, user_id: user.id })
    return !error
  }
}

export async function fetchLikeCount(photoId: string): Promise<number> {
  const supabase = createClient()

  const { count } = await supabase
    .schema('capsule')
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('photo_id', photoId)

  return count ?? 0
}

export async function fetchLikes(photoId: string): Promise<Like[]> {
  const supabase = createClient()

  const { data } = await supabase
    .schema('capsule')
    .from('likes')
    .select('*, profiles(*)')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: false })

  return (data as Like[]) ?? []
}

// MARK: - Comments (Public)

export async function fetchComments(photoId: string): Promise<Comment[]> {
  const supabase = createClient()

  const { data } = await supabase
    .schema('capsule')
    .from('comments')
    .select('*, profiles(*)')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true })

  return (data as Comment[]) ?? []
}

export async function fetchCommentCount(photoId: string): Promise<number> {
  const supabase = createClient()

  const { count } = await supabase
    .schema('capsule')
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('photo_id', photoId)

  return count ?? 0
}

export async function addComment(photoId: string, content: string): Promise<Comment | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .schema('capsule')
    .from('comments')
    .insert({ photo_id: photoId, user_id: user.id, content })
    .select('*, profiles(*)')
    .single()

  if (error) {
    console.error('Failed to add comment:', error)
    return null
  }

  return data as Comment
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase
    .schema('capsule')
    .from('comments')
    .delete()
    .eq('id', commentId)

  return !error
}

// MARK: - Batch Fetch

export async function fetchPhotoInteractions(photoId: string) {
  const [liked, favorited, likeCount, commentCount] = await Promise.all([
    isLiked(photoId),
    isFavorited(photoId),
    fetchLikeCount(photoId),
    fetchCommentCount(photoId),
  ])

  return { liked, favorited, likeCount, commentCount }
}
