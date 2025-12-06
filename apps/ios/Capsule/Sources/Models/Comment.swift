import Foundation

/// Comment on a photo
struct Comment: Codable, Identifiable, Equatable {
    let id: UUID
    let photoId: UUID
    let userId: UUID
    let content: String
    let createdAt: Date
    let updatedAt: Date

    /// Profile data from join (optional)
    var profile: Profile?

    enum CodingKeys: String, CodingKey {
        case id
        case photoId = "photo_id"
        case userId = "user_id"
        case content
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case profile = "profiles"
    }
}

/// Like on a photo (for fetching who liked)
struct Like: Codable, Equatable {
    var id: UUID { userId }
    let userId: UUID
    let photoId: UUID
    let createdAt: Date

    /// Profile data from join (optional)
    var profile: Profile?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case photoId = "photo_id"
        case createdAt = "created_at"
        case profile = "profiles"
    }
}

extension Like: Identifiable {}
