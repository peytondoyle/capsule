import Foundation

/// Privacy mode for albums
enum AlbumPrivacyMode: String, Codable, CaseIterable {
    case inviteOnly = "invite_only"
    case linkAccessible = "link_accessible"
    case publicUnlisted = "public_unlisted"

    var displayName: String {
        switch self {
        case .inviteOnly: return "Invite Only"
        case .linkAccessible: return "Anyone with Link"
        case .publicUnlisted: return "Public (Unlisted)"
        }
    }

    var description: String {
        switch self {
        case .inviteOnly:
            return "Only people you specifically invite can join"
        case .linkAccessible:
            return "Anyone with the link can view and join"
        case .publicUnlisted:
            return "Publicly visible but not searchable"
        }
    }
}

/// Album model
struct Album: Codable, Identifiable, Equatable, Hashable {
    let id: UUID
    let ownerId: UUID
    var title: String
    var description: String?
    var coverPhotoId: UUID?
    var privacyMode: AlbumPrivacyMode
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case ownerId = "owner_id"
        case title
        case description
        case coverPhotoId = "cover_photo_id"
        case privacyMode = "privacy_mode"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// Album with additional computed data
struct AlbumWithDetails: Identifiable, Equatable {
    let album: Album
    let photoCount: Int
    let memberCount: Int
    let coverPhotoThumbnailUrl: URL?
    let userRole: AlbumRole?

    var id: UUID { album.id }
}

/// Extension to generate cover photo URL
extension Album {
    /// Get cover photo thumbnail URL if cover photo exists
    func coverPhotoUrl(thumbnailPath: String?) -> URL? {
        guard let path = thumbnailPath else { return nil }
        return URL(string: "\(Config.supabaseURL)/storage/v1/object/public/capsule-thumbnails/\(path)")
    }
}
