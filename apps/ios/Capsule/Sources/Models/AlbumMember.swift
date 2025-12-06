import Foundation

/// Role within an album
enum AlbumRole: String, Codable, CaseIterable, Comparable {
    case owner
    case coManager = "co_manager"
    case contributor
    case viewer

    var displayName: String {
        switch self {
        case .owner: return "Owner"
        case .coManager: return "Co-Manager"
        case .contributor: return "Contributor"
        case .viewer: return "Viewer"
        }
    }

    var description: String {
        switch self {
        case .owner:
            return "Full control over the album"
        case .coManager:
            return "Can manage members and content"
        case .contributor:
            return "Can upload and download photos"
        case .viewer:
            return "Can only view and download photos"
        }
    }

    /// Roles sorted by permission level (owner highest)
    private var permissionLevel: Int {
        switch self {
        case .owner: return 4
        case .coManager: return 3
        case .contributor: return 2
        case .viewer: return 1
        }
    }

    static func < (lhs: AlbumRole, rhs: AlbumRole) -> Bool {
        lhs.permissionLevel < rhs.permissionLevel
    }

    var canUpload: Bool {
        self >= .contributor
    }

    var canManageMembers: Bool {
        self >= .coManager
    }

    var canModifyAlbum: Bool {
        self >= .coManager
    }

    var canHidePhotos: Bool {
        self == .owner
    }

    var canDeleteAlbum: Bool {
        self == .owner
    }
}

/// Notification preference for album updates
enum NotificationPreference: String, Codable, CaseIterable {
    case full
    case digest
    case none

    var displayName: String {
        switch self {
        case .full: return "All Updates"
        case .digest: return "Daily Digest"
        case .none: return "None"
        }
    }
}

/// Album membership record
struct AlbumMember: Codable, Identifiable, Equatable {
    let albumId: UUID
    let userId: UUID
    var role: AlbumRole
    var notificationPreference: NotificationPreference
    let joinedAt: Date

    var id: String { "\(albumId)-\(userId)" }

    enum CodingKeys: String, CodingKey {
        case albumId = "album_id"
        case userId = "user_id"
        case role
        case notificationPreference = "notification_preference"
        case joinedAt = "joined_at"
    }
}

/// Album member with profile info
struct AlbumMemberWithProfile: Identifiable, Equatable {
    let member: AlbumMember
    let profile: Profile

    var id: String { member.id }
}
