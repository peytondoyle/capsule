import Foundation

/// Service for managing notifications
@MainActor
final class NotificationService: ObservableObject {
    static let shared = NotificationService()

    @Published var notifications: [AppNotification] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Fetch Notifications

    /// Fetch all notifications for current user
    func fetchNotifications() async {
        guard let userId = AuthManager.shared.userId else { return }

        isLoading = notifications.isEmpty

        do {
            let fetched: [AppNotification] = try await SupabaseService.shared
                .from("notifications")
                .select()
                .eq("user_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .limit(50)
                .execute()
                .value

            notifications = fetched
            unreadCount = fetched.filter { !$0.isRead }.count
        } catch {
            self.error = error
            print("[NotificationService] Failed to fetch notifications: \(error)")
        }

        isLoading = false
    }

    /// Fetch unread count only
    func fetchUnreadCount() async {
        guard let userId = AuthManager.shared.userId else { return }

        do {
            let fetched: [AppNotification] = try await SupabaseService.shared
                .from("notifications")
                .select("id")
                .eq("user_id", value: userId.uuidString)
                .eq("is_read", value: false)
                .execute()
                .value

            unreadCount = fetched.count
        } catch {
            print("[NotificationService] Failed to fetch unread count: \(error)")
        }
    }

    // MARK: - Mark as Read

    /// Mark a single notification as read
    func markAsRead(id: UUID) async {
        do {
            try await SupabaseService.shared
                .from("notifications")
                .update(["is_read": true])
                .eq("id", value: id.uuidString)
                .execute()

            if let index = notifications.firstIndex(where: { $0.id == id }) {
                notifications[index].isRead = true
                unreadCount = max(0, unreadCount - 1)
            }
        } catch {
            print("[NotificationService] Failed to mark as read: \(error)")
        }
    }

    /// Mark all notifications as read
    func markAllAsRead() async {
        guard let userId = AuthManager.shared.userId else { return }

        do {
            try await SupabaseService.shared
                .from("notifications")
                .update(["is_read": true])
                .eq("user_id", value: userId.uuidString)
                .eq("is_read", value: false)
                .execute()

            for i in notifications.indices {
                notifications[i].isRead = true
            }
            unreadCount = 0
        } catch {
            print("[NotificationService] Failed to mark all as read: \(error)")
        }
    }

    // MARK: - Delete Notification

    /// Delete a notification
    func deleteNotification(id: UUID) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("notifications")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()

            if let index = notifications.firstIndex(where: { $0.id == id }) {
                let wasUnread = !notifications[index].isRead
                notifications.remove(at: index)
                if wasUnread {
                    unreadCount = max(0, unreadCount - 1)
                }
            }
            return true
        } catch {
            self.error = error
            print("[NotificationService] Failed to delete notification: \(error)")
            return false
        }
    }

    /// Clear all notifications
    func clearAll() async {
        guard let userId = AuthManager.shared.userId else { return }

        do {
            try await SupabaseService.shared
                .from("notifications")
                .delete()
                .eq("user_id", value: userId.uuidString)
                .execute()

            notifications.removeAll()
            unreadCount = 0
        } catch {
            self.error = error
            print("[NotificationService] Failed to clear notifications: \(error)")
        }
    }
}
