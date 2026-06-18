import Foundation

/// Service for profile operations
@MainActor
final class ProfileService: ObservableObject {
    static let shared = ProfileService()

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Update Profile

    /// Update display name
    func updateDisplayName(_ name: String) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            try await SupabaseService.shared
                .from("profiles")
                .update(["display_name": name])
                .eq("id", value: userId.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[ProfileService] Failed to update display name: \(error)")
            return false
        }
    }

    /// Update avatar URL
    func updateAvatarUrl(_ url: String?) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            let updateData: [String: String?] = ["avatar_url": url]
            try await SupabaseService.shared
                .from("profiles")
                .update(updateData)
                .eq("id", value: userId.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[ProfileService] Failed to update avatar: \(error)")
            return false
        }
    }

    // MARK: - Favorites

    /// Fetch all favorited photos for current user
    func fetchFavoritePhotos() async -> [Photo] {
        guard let userId = AuthManager.shared.userId else { return [] }

        do {
            // Get favorite photo IDs first
            let favorites: [FavoriteWithPhoto] = try await SupabaseService.shared
                .from("favorites")
                .select("photo_id, photos(*)")
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value

            return favorites.compactMap { $0.photo }
        } catch {
            print("[ProfileService] Failed to fetch favorites: \(error)")
            return []
        }
    }
}

// MARK: - Helper Types

private struct FavoriteWithPhoto: Codable {
    let photoId: UUID
    let photo: Photo?

    enum CodingKeys: String, CodingKey {
        case photoId = "photo_id"
        case photo = "photos"
    }
}
