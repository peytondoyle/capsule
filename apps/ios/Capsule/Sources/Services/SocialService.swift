import Foundation

/// Service for social interactions (likes, favorites, comments)
@MainActor
final class SocialService: ObservableObject {
    static let shared = SocialService()

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Favorites (Private to user)

    /// Check if user has favorited a photo
    func isFavorited(photoId: UUID) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            let result: [FavoriteRecord] = try await SupabaseService.shared
                .from("favorites")
                .select()
                .eq("photo_id", value: photoId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value
            return !result.isEmpty
        } catch {
            print("[SocialService] Failed to check favorite: \(error)")
            return false
        }
    }

    /// Toggle favorite status
    func toggleFavorite(photoId: UUID) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            let isFav = await isFavorited(photoId: photoId)

            if isFav {
                // Remove favorite
                try await SupabaseService.shared
                    .from("favorites")
                    .delete()
                    .eq("photo_id", value: photoId.uuidString)
                    .eq("user_id", value: userId.uuidString)
                    .execute()
            } else {
                // Add favorite
                try await SupabaseService.shared
                    .from("favorites")
                    .insert(FavoriteRecord(userId: userId, photoId: photoId))
                    .execute()
            }
            return true
        } catch {
            self.error = error
            print("[SocialService] Failed to toggle favorite: \(error)")
            return false
        }
    }

    /// Get all user's favorited photo IDs for an album
    func fetchFavoritedPhotoIds(albumId: UUID) async -> Set<UUID> {
        guard let userId = AuthManager.shared.userId else { return [] }

        do {
            // Get favorites joined with photos to filter by album
            let result: [FavoriteWithPhoto] = try await SupabaseService.shared
                .from("favorites")
                .select("photo_id, photos!inner(album_id)")
                .eq("user_id", value: userId.uuidString)
                .eq("photos.album_id", value: albumId.uuidString)
                .execute()
                .value
            return Set(result.map { $0.photoId })
        } catch {
            print("[SocialService] Failed to fetch favorites: \(error)")
            return []
        }
    }

    // MARK: - Likes (Public)

    /// Check if user has liked a photo
    func isLiked(photoId: UUID) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            let result: [LikeRecord] = try await SupabaseService.shared
                .from("likes")
                .select()
                .eq("photo_id", value: photoId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value
            return !result.isEmpty
        } catch {
            print("[SocialService] Failed to check like: \(error)")
            return false
        }
    }

    /// Toggle like status
    func toggleLike(photoId: UUID) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            let liked = await isLiked(photoId: photoId)

            if liked {
                // Remove like
                try await SupabaseService.shared
                    .from("likes")
                    .delete()
                    .eq("photo_id", value: photoId.uuidString)
                    .eq("user_id", value: userId.uuidString)
                    .execute()
            } else {
                // Add like
                try await SupabaseService.shared
                    .from("likes")
                    .insert(LikeRecord(userId: userId, photoId: photoId))
                    .execute()
            }
            return true
        } catch {
            self.error = error
            print("[SocialService] Failed to toggle like: \(error)")
            return false
        }
    }

    /// Get like count for a photo
    func fetchLikeCount(photoId: UUID) async -> Int {
        do {
            let result: [LikeRecord] = try await SupabaseService.shared
                .from("likes")
                .select()
                .eq("photo_id", value: photoId.uuidString)
                .execute()
                .value
            return result.count
        } catch {
            print("[SocialService] Failed to fetch like count: \(error)")
            return 0
        }
    }

    /// Get likes with profile info for a photo
    func fetchLikes(photoId: UUID) async -> [Like] {
        do {
            let likes: [Like] = try await SupabaseService.shared
                .from("likes")
                .select("*, profiles(*)")
                .eq("photo_id", value: photoId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value
            return likes
        } catch {
            print("[SocialService] Failed to fetch likes: \(error)")
            return []
        }
    }

    // MARK: - Comments (Public)

    /// Fetch comments for a photo
    func fetchComments(photoId: UUID) async -> [Comment] {
        do {
            let comments: [Comment] = try await SupabaseService.shared
                .from("comments")
                .select("*, profiles(*)")
                .eq("photo_id", value: photoId.uuidString)
                .order("created_at", ascending: true)
                .execute()
                .value
            return comments
        } catch {
            print("[SocialService] Failed to fetch comments: \(error)")
            return []
        }
    }

    /// Get comment count for a photo
    func fetchCommentCount(photoId: UUID) async -> Int {
        do {
            let result: [CommentCountResult] = try await SupabaseService.shared
                .from("comments")
                .select("id")
                .eq("photo_id", value: photoId.uuidString)
                .execute()
                .value
            return result.count
        } catch {
            print("[SocialService] Failed to fetch comment count: \(error)")
            return 0
        }
    }

    /// Add a comment
    func addComment(photoId: UUID, content: String) async -> Comment? {
        guard let userId = AuthManager.shared.userId else { return nil }

        do {
            let request = CreateCommentRequest(photoId: photoId, userId: userId, content: content)
            let comment: Comment = try await SupabaseService.shared
                .from("comments")
                .insert(request)
                .select("*, profiles(*)")
                .single()
                .execute()
                .value
            return comment
        } catch {
            self.error = error
            print("[SocialService] Failed to add comment: \(error)")
            return nil
        }
    }

    /// Delete a comment (own comments only)
    func deleteComment(id: UUID) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("comments")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[SocialService] Failed to delete comment: \(error)")
            return false
        }
    }

    // MARK: - Batch Fetch

    /// Fetch user interactions for a photo (liked + favorited status)
    func fetchUserInteractions(photoId: UUID) async -> (liked: Bool, favorited: Bool) {
        async let liked = isLiked(photoId: photoId)
        async let favorited = isFavorited(photoId: photoId)
        return await (liked, favorited)
    }

    /// Fetch counts for a photo
    func fetchCounts(photoId: UUID) async -> (likes: Int, comments: Int) {
        async let likes = fetchLikeCount(photoId: photoId)
        async let comments = fetchCommentCount(photoId: photoId)
        return await (likes, comments)
    }
}

// MARK: - Internal Types

private struct FavoriteRecord: Codable {
    let userId: UUID
    let photoId: UUID

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case photoId = "photo_id"
    }
}

private struct LikeRecord: Codable {
    let userId: UUID
    let photoId: UUID

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case photoId = "photo_id"
    }
}

private struct FavoriteWithPhoto: Codable {
    let photoId: UUID

    enum CodingKeys: String, CodingKey {
        case photoId = "photo_id"
    }
}

private struct CommentCountResult: Codable {
    let id: UUID
}

private struct CreateCommentRequest: Codable {
    let photoId: UUID
    let userId: UUID
    let content: String

    enum CodingKeys: String, CodingKey {
        case photoId = "photo_id"
        case userId = "user_id"
        case content
    }
}
