import Foundation

/// Service for album CRUD operations
@MainActor
final class AlbumService: ObservableObject {
    static let shared = AlbumService()

    @Published var albums: [Album] = []
    @Published var coverPhotoUrls: [UUID: URL] = [:]
    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Fetch Albums

    /// Fetch all albums the current user is a member of
    func fetchUserAlbums() async {
        guard let userId = AuthManager.shared.userId else { return }

        isLoading = true
        error = nil

        do {
            // First get album IDs from membership
            let memberships: [AlbumMember] = try await SupabaseService.shared
                .from("album_members")
                .select()
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            let albumIds = memberships.map { $0.albumId.uuidString }

            guard !albumIds.isEmpty else {
                albums = []
                isLoading = false
                return
            }

            // Then fetch the albums with cover photo paths
            let fetchedAlbums: [AlbumWithCoverPhoto] = try await SupabaseService.shared
                .from("albums")
                .select("*, cover_photo:photos!cover_photo_id(thumbnail_path)")
                .in("id", values: albumIds)
                .order("updated_at", ascending: false)
                .execute()
                .value

            // Extract albums and build cover photo URL map
            albums = fetchedAlbums.map { $0.toAlbum() }
            coverPhotoUrls = [:]
            for albumWithCover in fetchedAlbums {
                if let coverPhoto = albumWithCover.coverPhoto,
                   let url = URL(string: "\(Config.supabaseURL)/storage/v1/object/public/capsule-thumbnails/\(coverPhoto.thumbnailPath)") {
                    coverPhotoUrls[albumWithCover.id] = url
                }
            }
        } catch {
            self.error = error
            print("[AlbumService] Failed to fetch albums: \(error)")
        }

        isLoading = false
    }

    /// Fetch a single album by ID
    func fetchAlbum(id: UUID) async -> Album? {
        do {
            let album: Album = try await SupabaseService.shared
                .from("albums")
                .select()
                .eq("id", value: id.uuidString)
                .single()
                .execute()
                .value
            return album
        } catch {
            print("[AlbumService] Failed to fetch album \(id): \(error)")
            return nil
        }
    }

    // MARK: - Create Album

    /// Create a new album
    func createAlbum(
        title: String,
        description: String? = nil,
        privacyMode: AlbumPrivacyMode = .inviteOnly
    ) async -> Album? {
        guard let userId = AuthManager.shared.userId else { return nil }

        do {
            let newAlbum = CreateAlbumRequest(
                ownerId: userId,
                title: title,
                description: description,
                privacyMode: privacyMode
            )

            let created: Album = try await SupabaseService.shared
                .from("albums")
                .insert(newAlbum)
                .select()
                .single()
                .execute()
                .value

            // Add to local list
            albums.insert(created, at: 0)

            return created
        } catch {
            self.error = error
            print("[AlbumService] Failed to create album: \(error)")
            return nil
        }
    }

    // MARK: - Update Album

    /// Update an existing album
    func updateAlbum(_ album: Album) async -> Bool {
        do {
            let updateRequest = UpdateAlbumRequest(
                title: album.title,
                description: album.description,
                privacyMode: album.privacyMode,
                coverPhotoId: album.coverPhotoId
            )

            try await SupabaseService.shared
                .from("albums")
                .update(updateRequest)
                .eq("id", value: album.id.uuidString)
                .execute()

            // Update local list
            if let index = albums.firstIndex(where: { $0.id == album.id }) {
                albums[index] = album
            }

            return true
        } catch {
            self.error = error
            print("[AlbumService] Failed to update album: \(error)")
            return false
        }
    }

    // MARK: - Delete Album

    /// Delete an album (owner only)
    func deleteAlbum(id: UUID) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("albums")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()

            // Remove from local list
            albums.removeAll { $0.id == id }

            return true
        } catch {
            self.error = error
            print("[AlbumService] Failed to delete album: \(error)")
            return false
        }
    }
}

// MARK: - Request Types

private struct CreateAlbumRequest: Encodable {
    let ownerId: UUID
    let title: String
    let description: String?
    let privacyMode: AlbumPrivacyMode

    enum CodingKeys: String, CodingKey {
        case ownerId = "owner_id"
        case title
        case description
        case privacyMode = "privacy_mode"
    }
}

private struct UpdateAlbumRequest: Encodable {
    let title: String
    let description: String?
    let privacyMode: AlbumPrivacyMode
    let coverPhotoId: UUID?

    enum CodingKeys: String, CodingKey {
        case title
        case description
        case privacyMode = "privacy_mode"
        case coverPhotoId = "cover_photo_id"
    }
}

// MARK: - Response Types for Joins

private struct AlbumWithCoverPhoto: Decodable {
    let id: UUID
    let ownerId: UUID
    let title: String
    let description: String?
    let coverPhotoId: UUID?
    let privacyMode: AlbumPrivacyMode
    let createdAt: Date
    let updatedAt: Date
    let coverPhoto: CoverPhotoPath?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId = "owner_id"
        case title
        case description
        case coverPhotoId = "cover_photo_id"
        case privacyMode = "privacy_mode"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case coverPhoto = "cover_photo"
    }

    func toAlbum() -> Album {
        Album(
            id: id,
            ownerId: ownerId,
            title: title,
            description: description,
            coverPhotoId: coverPhotoId,
            privacyMode: privacyMode,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

private struct CoverPhotoPath: Decodable {
    let thumbnailPath: String

    enum CodingKeys: String, CodingKey {
        case thumbnailPath = "thumbnail_path"
    }
}
