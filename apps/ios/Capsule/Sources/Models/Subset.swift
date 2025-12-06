import Foundation

/// Type of subset
enum SubsetType: String, Codable {
    case `internal`     // Global organization, not shareable
    case shareable      // Can be shared via link
    case personal       // User-specific, not visible to others
}

/// Subset (view) of photos within an album
struct Subset: Codable, Identifiable, Equatable {
    let id: UUID
    let albumId: UUID
    let ownerId: UUID?  // nil for global subsets
    let subsetType: SubsetType
    var name: String
    var photoIds: [UUID]
    var shareToken: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case ownerId = "owner_id"
        case subsetType = "subset_type"
        case name
        case photoIds = "photo_ids"
        case shareToken = "share_token"
        case createdAt = "created_at"
    }

    /// Whether this is a personal (user-only) subset
    var isPersonal: Bool {
        subsetType == .personal
    }

    /// Whether this subset can be shared via link
    var isShareable: Bool {
        subsetType == .shareable
    }
}
