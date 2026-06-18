import Foundation

/// Types of activity events
enum ActivityEventType: String, Codable, CaseIterable {
    case photosAdded = "photos_added"
    case memberJoined = "member_joined"
    case memberLeft = "member_left"
    case photoLiked = "photo_liked"
    case photoUnliked = "photo_unliked"
    case commentAdded = "comment_added"
    case albumCreated = "album_created"
    case albumUpdated = "album_updated"

    var icon: String {
        switch self {
        case .photosAdded: return "photo.fill"
        case .memberJoined: return "person.badge.plus"
        case .memberLeft: return "person.badge.minus"
        case .photoLiked: return "heart.fill"
        case .photoUnliked: return "heart"
        case .commentAdded: return "bubble.left.fill"
        case .albumCreated: return "folder.badge.plus"
        case .albumUpdated: return "pencil"
        }
    }

    /// Returns a human-readable description for the activity
    func description(actorName: String, metadata: ActivityMetadata?) -> String {
        switch self {
        case .photosAdded:
            let count = metadata?.count ?? 1
            return "\(actorName) added \(count) photo\(count == 1 ? "" : "s")"
        case .memberJoined:
            return "\(actorName) joined"
        case .memberLeft:
            return "\(actorName) left"
        case .photoLiked:
            return "\(actorName) liked a photo"
        case .photoUnliked:
            return "\(actorName) unliked a photo"
        case .commentAdded:
            return "\(actorName) commented"
        case .albumCreated:
            return "\(actorName) created this album"
        case .albumUpdated:
            return "\(actorName) updated the album"
        }
    }
}

/// Metadata stored with activity events
struct ActivityMetadata: Codable {
    var count: Int?
    var photoIds: [UUID]?
    var thumbnailPath: String?
    var memberName: String?
    var role: String?
    var photoId: UUID?
    var commentPreview: String?

    enum CodingKeys: String, CodingKey {
        case count
        case photoIds = "photo_ids"
        case thumbnailPath = "thumbnail_path"
        case memberName = "member_name"
        case role
        case photoId = "photo_id"
        case commentPreview = "comment_preview"
    }
}

/// Activity event model
struct Activity: Codable, Identifiable, Equatable {
    let id: UUID
    let albumId: UUID
    let actorId: UUID
    let eventType: ActivityEventType
    let targetId: UUID?
    let metadata: ActivityMetadata?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case actorId = "actor_id"
        case eventType = "event_type"
        case targetId = "target_id"
        case metadata
        case createdAt = "created_at"
    }

    static func == (lhs: Activity, rhs: Activity) -> Bool {
        lhs.id == rhs.id
    }
}

/// Activity with actor profile details (from activity_feed view)
struct ActivityWithActor: Codable, Identifiable, Equatable {
    let id: UUID
    let albumId: UUID
    let actorId: UUID
    let eventType: ActivityEventType
    let targetId: UUID?
    let metadata: ActivityMetadata?
    let createdAt: Date
    let actorName: String?
    let actorAvatar: String?
    let albumTitle: String?

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case actorId = "actor_id"
        case eventType = "event_type"
        case targetId = "target_id"
        case metadata
        case createdAt = "created_at"
        case actorName = "actor_name"
        case actorAvatar = "actor_avatar"
        case albumTitle = "album_title"
    }

    static func == (lhs: ActivityWithActor, rhs: ActivityWithActor) -> Bool {
        lhs.id == rhs.id
    }

    /// Human-readable description
    var description: String {
        eventType.description(actorName: actorName ?? "Someone", metadata: metadata)
    }

    /// Get thumbnail URL if available
    var thumbnailUrl: URL? {
        guard let path = metadata?.thumbnailPath else { return nil }
        return URL(string: "\(Config.supabaseURL)/storage/v1/object/public/capsule-thumbnails/\(path)")
    }

    /// Avatar URL
    var avatarUrl: URL? {
        guard let urlString = actorAvatar else { return nil }
        return URL(string: urlString)
    }
}

/// Time-based grouping for activities
enum ActivityTimeGroup: String, CaseIterable {
    case today = "Today"
    case yesterday = "Yesterday"
    case thisWeek = "This Week"
    case lastWeek = "Last Week"
    case thisMonth = "This Month"
    case older = "Older"

    static func group(for date: Date) -> ActivityTimeGroup {
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDateInToday(date) {
            return .today
        } else if calendar.isDateInYesterday(date) {
            return .yesterday
        } else if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
                  date > weekAgo {
            return .thisWeek
        } else if let twoWeeksAgo = calendar.date(byAdding: .day, value: -14, to: now),
                  date > twoWeeksAgo {
            return .lastWeek
        } else if let monthAgo = calendar.date(byAdding: .month, value: -1, to: now),
                  date > monthAgo {
            return .thisMonth
        } else {
            return .older
        }
    }
}

/// Extension to group activities by time
extension Array where Element == ActivityWithActor {
    func groupedByTime() -> [(ActivityTimeGroup, [ActivityWithActor])] {
        let grouped = Dictionary(grouping: self) { activity in
            ActivityTimeGroup.group(for: activity.createdAt)
        }

        return ActivityTimeGroup.allCases.compactMap { group in
            guard let activities = grouped[group], !activities.isEmpty else { return nil }
            return (group, activities.sorted { $0.createdAt > $1.createdAt })
        }
    }
}
