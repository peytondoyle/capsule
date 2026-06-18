import Foundation

/// Service for managing activity feed
@MainActor
final class ActivityService: ObservableObject {
    static let shared = ActivityService()

    /// All activities across user's albums
    @Published var activities: [ActivityWithActor] = []

    /// Activities grouped by time
    @Published var groupedActivities: [(ActivityTimeGroup, [ActivityWithActor])] = []

    /// Activity counts per album (for badges)
    @Published var albumActivityCounts: [UUID: Int] = [:]

    /// Last activity per album
    @Published var lastAlbumActivity: [UUID: ActivityWithActor] = [:]

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Fetch All Activities

    /// Fetch all activities for current user (across all their albums)
    func fetchActivities(limit: Int = 50) async {
        isLoading = activities.isEmpty

        do {
            let fetched: [ActivityWithActor] = try await SupabaseService.shared
                .from("activity_feed")
                .select()
                .order("created_at", ascending: false)
                .limit(limit)
                .execute()
                .value

            activities = fetched
            groupedActivities = fetched.groupedByTime()

            // Update album activity counts
            updateAlbumMetadata(from: fetched)
        } catch {
            self.error = error
            print("[ActivityService] Failed to fetch activities: \(error)")
        }

        isLoading = false
    }

    // MARK: - Fetch Album Activities

    /// Fetch activities for a specific album
    func fetchAlbumActivities(albumId: UUID, limit: Int = 100) async -> [ActivityWithActor] {
        do {
            let fetched: [ActivityWithActor] = try await SupabaseService.shared
                .from("activity_feed")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .order("created_at", ascending: false)
                .limit(limit)
                .execute()
                .value

            return fetched
        } catch {
            print("[ActivityService] Failed to fetch album activities: \(error)")
            return []
        }
    }

    // MARK: - Fetch Recent Activity Counts

    /// Fetch activity counts for multiple albums (for badges) and last activity for time-based grouping
    /// Counts are based on activities in the last 24 hours, last activity is all-time
    func fetchRecentActivityCounts(albumIds: [UUID]) async {
        guard !albumIds.isEmpty else { return }

        let oneDayAgo = Date().addingTimeInterval(-24 * 60 * 60)
        let isoDate = ISO8601DateFormatter().string(from: oneDayAgo)

        do {
            // Fetch activities from last 24 hours for badge counts
            let recentFetched: [ActivityWithActor] = try await SupabaseService.shared
                .from("activity_feed")
                .select()
                .in("album_id", values: albumIds.map { $0.uuidString })
                .gt("created_at", value: isoDate)
                .order("created_at", ascending: false)
                .execute()
                .value

            // Count per album (recent only)
            var counts: [UUID: Int] = [:]
            var lastActivities: [UUID: ActivityWithActor] = [:]

            for activity in recentFetched {
                counts[activity.albumId, default: 0] += 1
                if lastActivities[activity.albumId] == nil {
                    lastActivities[activity.albumId] = activity
                }
            }

            albumActivityCounts = counts

            // Also fetch last activity for albums that didn't have recent activity
            // This is needed for time-based grouping
            let albumsWithoutRecentActivity = albumIds.filter { lastActivities[$0] == nil }

            if !albumsWithoutRecentActivity.isEmpty {
                // Fetch one activity per album for those without recent activity
                let allFetched: [ActivityWithActor] = try await SupabaseService.shared
                    .from("activity_feed")
                    .select()
                    .in("album_id", values: albumsWithoutRecentActivity.map { $0.uuidString })
                    .order("created_at", ascending: false)
                    .execute()
                    .value

                // Only keep first (most recent) per album
                for activity in allFetched {
                    if lastActivities[activity.albumId] == nil {
                        lastActivities[activity.albumId] = activity
                    }
                }
            }

            lastAlbumActivity = lastActivities
        } catch {
            print("[ActivityService] Failed to fetch activity counts: \(error)")
        }
    }

    /// Fetch last activity for each of the user's albums
    func fetchLastActivities(albumIds: [UUID]) async {
        guard !albumIds.isEmpty else { return }

        do {
            // Fetch most recent activity per album
            var lastActivities: [UUID: ActivityWithActor] = [:]

            for albumId in albumIds {
                let fetched: [ActivityWithActor] = try await SupabaseService.shared
                    .from("activity_feed")
                    .select()
                    .eq("album_id", value: albumId.uuidString)
                    .order("created_at", ascending: false)
                    .limit(1)
                    .execute()
                    .value

                if let first = fetched.first {
                    lastActivities[albumId] = first
                }
            }

            lastAlbumActivity = lastActivities
        } catch {
            print("[ActivityService] Failed to fetch last activities: \(error)")
        }
    }

    // MARK: - Activity for Specific Album

    /// Get cached activity count for an album
    func activityCount(for albumId: UUID) -> Int {
        albumActivityCounts[albumId] ?? 0
    }

    /// Get cached last activity for an album
    func lastActivity(for albumId: UUID) -> ActivityWithActor? {
        lastAlbumActivity[albumId]
    }

    // MARK: - Helper Methods

    private func updateAlbumMetadata(from activities: [ActivityWithActor]) {
        var counts: [UUID: Int] = [:]
        var lastActivities: [UUID: ActivityWithActor] = [:]

        let oneDayAgo = Date().addingTimeInterval(-24 * 60 * 60)

        for activity in activities {
            // Only count recent activities for badges
            if activity.createdAt > oneDayAgo {
                counts[activity.albumId, default: 0] += 1
            }

            // Track most recent activity per album
            if lastActivities[activity.albumId] == nil {
                lastActivities[activity.albumId] = activity
            }
        }

        albumActivityCounts = counts
        lastAlbumActivity.merge(lastActivities) { _, new in new }
    }

    /// Clear cached data
    func clearCache() {
        activities = []
        groupedActivities = []
        albumActivityCounts = [:]
        lastAlbumActivity = [:]
    }
}

// MARK: - Relative Time Formatting

extension ActivityWithActor {
    /// Returns a human-readable relative time string
    var relativeTime: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }

    /// Returns a more detailed relative time for recent activities
    var detailedRelativeTime: String {
        let now = Date()
        let seconds = now.timeIntervalSince(createdAt)

        if seconds < 60 {
            return "Just now"
        } else if seconds < 3600 {
            let minutes = Int(seconds / 60)
            return "\(minutes)m ago"
        } else if seconds < 86400 {
            let hours = Int(seconds / 3600)
            return "\(hours)h ago"
        } else if seconds < 604800 {
            let days = Int(seconds / 86400)
            return "\(days)d ago"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "MMM d"
            return formatter.string(from: createdAt)
        }
    }
}
