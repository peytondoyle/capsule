import Foundation

/// Service for managing photo subsets/collections within albums
@MainActor
final class SubsetService: ObservableObject {
    static let shared = SubsetService()

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Fetch Subsets

    /// Fetch all subsets for an album (visible to current user)
    func fetchSubsets(albumId: UUID) async -> [Subset] {
        guard let userId = AuthManager.shared.userId else { return [] }

        do {
            // Fetch global subsets and user's personal subsets
            let subsets: [Subset] = try await SupabaseService.shared
                .from("subsets")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .or("owner_id.is.null,owner_id.eq.\(userId.uuidString)")
                .order("created_at", ascending: false)
                .execute()
                .value

            return subsets
        } catch {
            print("[SubsetService] Failed to fetch subsets: \(error)")
            return []
        }
    }

    // MARK: - Create Subset

    /// Create a new subset
    func createSubset(
        albumId: UUID,
        name: String,
        photoIds: [UUID],
        type: SubsetType = .internal,
        isPersonal: Bool = false
    ) async -> Subset? {
        guard let userId = AuthManager.shared.userId else { return nil }

        isLoading = true
        error = nil

        do {
            let request = CreateSubsetRequest(
                albumId: albumId,
                ownerId: isPersonal ? userId : nil,
                subsetType: type,
                name: name,
                photoIds: photoIds,
                shareToken: type == .shareable ? generateShareToken() : nil
            )

            let subset: Subset = try await SupabaseService.shared
                .from("subsets")
                .insert(request)
                .select()
                .single()
                .execute()
                .value

            isLoading = false
            return subset
        } catch {
            self.error = error
            print("[SubsetService] Failed to create subset: \(error)")
            isLoading = false
            return nil
        }
    }

    // MARK: - Update Subset

    /// Update subset name
    func updateSubsetName(id: UUID, name: String) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("subsets")
                .update(["name": name])
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[SubsetService] Failed to update subset name: \(error)")
            return false
        }
    }

    /// Update subset photos
    func updateSubsetPhotos(id: UUID, photoIds: [UUID]) async -> Bool {
        do {
            let photoIdStrings = photoIds.map { $0.uuidString }
            try await SupabaseService.shared
                .from("subsets")
                .update(["photo_ids": photoIdStrings])
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[SubsetService] Failed to update subset photos: \(error)")
            return false
        }
    }

    /// Add photos to subset
    func addPhotosToSubset(id: UUID, photoIds: [UUID], existingPhotoIds: [UUID]) async -> Bool {
        let combined = existingPhotoIds + photoIds.filter { !existingPhotoIds.contains($0) }
        return await updateSubsetPhotos(id: id, photoIds: combined)
    }

    /// Remove photos from subset
    func removePhotosFromSubset(id: UUID, photoIds: Set<UUID>, existingPhotoIds: [UUID]) async -> Bool {
        let filtered = existingPhotoIds.filter { !photoIds.contains($0) }
        return await updateSubsetPhotos(id: id, photoIds: filtered)
    }

    // MARK: - Delete Subset

    /// Delete a subset
    func deleteSubset(id: UUID) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("subsets")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[SubsetService] Failed to delete subset: \(error)")
            return false
        }
    }

    // MARK: - Share Token

    /// Get shareable URL for a subset
    func getShareURL(token: String) -> URL {
        URL(string: "\(Config.webAppURL)/collection/\(token)")!
    }

    /// Fetch a subset by share token (for viewing shared collections)
    func fetchByShareToken(_ token: String) async -> Subset? {
        do {
            let subset: Subset = try await SupabaseService.shared
                .from("subsets")
                .select()
                .eq("share_token", value: token)
                .single()
                .execute()
                .value
            return subset
        } catch {
            print("[SubsetService] Failed to fetch subset by token: \(error)")
            return nil
        }
    }

    // MARK: - Helpers

    private func generateShareToken() -> String {
        let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<12).map { _ in characters.randomElement()! })
    }
}

// MARK: - Request Types

private struct CreateSubsetRequest: Encodable {
    let albumId: UUID
    let ownerId: UUID?
    let subsetType: SubsetType
    let name: String
    let photoIds: [UUID]
    let shareToken: String?

    enum CodingKeys: String, CodingKey {
        case albumId = "album_id"
        case ownerId = "owner_id"
        case subsetType = "subset_type"
        case name
        case photoIds = "photo_ids"
        case shareToken = "share_token"
    }
}
