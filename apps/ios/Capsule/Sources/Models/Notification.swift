import Foundation

/// Types of notifications
enum NotificationType: String, Codable {
    case photoUploaded = "photo_uploaded"
    case memberJoined = "member_joined"
    case joinRequest = "join_request"
    case albumModified = "album_modified"
    case subsetCreated = "subset_created"
    case photoHidden = "photo_hidden"

    var icon: String {
        switch self {
        case .photoUploaded: return "photo.badge.plus"
        case .memberJoined: return "person.badge.plus"
        case .joinRequest: return "person.crop.circle.badge.questionmark"
        case .albumModified: return "pencil"
        case .subsetCreated: return "rectangle.stack.badge.plus"
        case .photoHidden: return "eye.slash"
        }
    }

    var title: String {
        switch self {
        case .photoUploaded: return "New Photo"
        case .memberJoined: return "New Member"
        case .joinRequest: return "Join Request"
        case .albumModified: return "Album Updated"
        case .subsetCreated: return "New Collection"
        case .photoHidden: return "Photo Hidden"
        }
    }
}

/// Notification payload structure
struct NotificationPayload: Codable {
    var uploaderName: String?
    var memberName: String?
    var photoCount: Int?
    var albumName: String?

    enum CodingKeys: String, CodingKey {
        case uploaderName = "uploader_name"
        case memberName = "member_name"
        case photoCount = "photo_count"
        case albumName = "album_name"
    }
}

/// App notification
struct AppNotification: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    let albumId: UUID?
    let notificationType: NotificationType
    let payload: NotificationPayload?
    var isRead: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case albumId = "album_id"
        case notificationType = "notification_type"
        case payload
        case isRead = "is_read"
        case createdAt = "created_at"
    }

    var description: String {
        switch notificationType {
        case .photoUploaded:
            let name = payload?.uploaderName ?? "Someone"
            let count = payload?.photoCount ?? 1
            return "\(name) added \(count) photo\(count == 1 ? "" : "s")"
        case .memberJoined:
            let name = payload?.memberName ?? "Someone"
            return "\(name) joined the album"
        case .joinRequest:
            let name = payload?.memberName ?? "Someone"
            return "\(name) wants to join"
        case .albumModified:
            return "Album settings were updated"
        case .subsetCreated:
            return "A new collection was created"
        case .photoHidden:
            return "A photo was hidden from the album"
        }
    }
}
