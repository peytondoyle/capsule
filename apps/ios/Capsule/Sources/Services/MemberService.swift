import Foundation

/// Service for managing album members
@MainActor
final class MemberService: ObservableObject {
    static let shared = MemberService()

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Fetch Members

    /// Fetch all members of an album with their profiles
    func fetchMembers(albumId: UUID) async -> [AlbumMemberWithProfile] {
        do {
            // Fetch members
            let members: [AlbumMember] = try await SupabaseService.shared
                .from("album_members")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .order("joined_at", ascending: true)
                .execute()
                .value

            // Fetch profiles for all members
            let userIds = members.map { $0.userId.uuidString }

            guard !userIds.isEmpty else { return [] }

            let profiles: [Profile] = try await SupabaseService.shared
                .from("profiles")
                .select()
                .in("id", values: userIds)
                .execute()
                .value

            // Combine members with profiles
            let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

            return members.compactMap { member in
                guard let profile = profileMap[member.userId] else { return nil }
                return AlbumMemberWithProfile(member: member, profile: profile)
            }

        } catch {
            print("[MemberService] Failed to fetch members: \(error)")
            return []
        }
    }

    /// Get current user's role in an album
    func getCurrentUserRole(albumId: UUID) async -> AlbumRole? {
        guard let userId = AuthManager.shared.userId else { return nil }

        do {
            let member: AlbumMember = try await SupabaseService.shared
                .from("album_members")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value
            return member.role
        } catch {
            return nil
        }
    }

    // MARK: - Update Member

    /// Update a member's role
    func updateMemberRole(albumId: UUID, userId: UUID, newRole: AlbumRole) async -> Bool {
        isLoading = true
        error = nil

        do {
            try await SupabaseService.shared
                .from("album_members")
                .update(["role": newRole.rawValue])
                .eq("album_id", value: albumId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()

            isLoading = false
            return true
        } catch {
            self.error = error
            print("[MemberService] Failed to update member role: \(error)")
            isLoading = false
            return false
        }
    }

    /// Update notification preference
    func updateNotificationPreference(
        albumId: UUID,
        preference: NotificationPreference
    ) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        do {
            try await SupabaseService.shared
                .from("album_members")
                .update(["notification_preference": preference.rawValue])
                .eq("album_id", value: albumId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[MemberService] Failed to update notification preference: \(error)")
            return false
        }
    }

    // MARK: - Remove Member

    /// Remove a member from an album
    func removeMember(albumId: UUID, userId: UUID) async -> Bool {
        isLoading = true
        error = nil

        do {
            try await SupabaseService.shared
                .from("album_members")
                .delete()
                .eq("album_id", value: albumId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()

            isLoading = false
            return true
        } catch {
            self.error = error
            print("[MemberService] Failed to remove member: \(error)")
            isLoading = false
            return false
        }
    }

    /// Leave an album (current user)
    func leaveAlbum(albumId: UUID) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }
        return await removeMember(albumId: albumId, userId: userId)
    }

    // MARK: - Join Requests

    /// Fetch pending join requests for an album
    func fetchJoinRequests(albumId: UUID) async -> [JoinRequestWithProfile] {
        do {
            let requests: [JoinRequest] = try await SupabaseService.shared
                .from("join_requests")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .eq("status", value: "pending")
                .order("created_at", ascending: true)
                .execute()
                .value

            let userIds = requests.map { $0.userId.uuidString }

            guard !userIds.isEmpty else { return [] }

            let profiles: [Profile] = try await SupabaseService.shared
                .from("profiles")
                .select()
                .in("id", values: userIds)
                .execute()
                .value

            let profileMap = Dictionary(uniqueKeysWithValues: profiles.map { ($0.id, $0) })

            return requests.compactMap { request in
                guard let profile = profileMap[request.userId] else { return nil }
                return JoinRequestWithProfile(request: request, profile: profile)
            }

        } catch {
            print("[MemberService] Failed to fetch join requests: \(error)")
            return []
        }
    }

    /// Approve or reject a join request
    func handleJoinRequest(requestId: UUID, approve: Bool, role: AlbumRole = .contributor) async -> Bool {
        guard let userId = AuthManager.shared.userId else { return false }

        isLoading = true
        error = nil

        do {
            // First get the request
            let request: JoinRequest = try await SupabaseService.shared
                .from("join_requests")
                .select()
                .eq("id", value: requestId.uuidString)
                .single()
                .execute()
                .value

            // Update request status
            try await SupabaseService.shared
                .from("join_requests")
                .update([
                    "status": approve ? "approved" : "rejected",
                    "reviewed_by": userId.uuidString,
                    "reviewed_at": ISO8601DateFormatter().string(from: Date())
                ])
                .eq("id", value: requestId.uuidString)
                .execute()

            // If approved, add as member
            if approve {
                let memberRequest = [
                    "album_id": request.albumId.uuidString,
                    "user_id": request.userId.uuidString,
                    "role": role.rawValue
                ]

                try await SupabaseService.shared
                    .from("album_members")
                    .insert(memberRequest)
                    .execute()
            }

            isLoading = false
            return true

        } catch {
            self.error = error
            print("[MemberService] Failed to handle join request: \(error)")
            isLoading = false
            return false
        }
    }
}

// MARK: - Models

struct JoinRequest: Codable, Identifiable {
    let id: UUID
    let albumId: UUID
    let userId: UUID
    let status: String
    let reviewedBy: UUID?
    let createdAt: Date
    let reviewedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case userId = "user_id"
        case status
        case reviewedBy = "reviewed_by"
        case createdAt = "created_at"
        case reviewedAt = "reviewed_at"
    }
}

struct JoinRequestWithProfile: Identifiable {
    let request: JoinRequest
    let profile: Profile

    var id: UUID { request.id }
}
