import Foundation

/// Service for managing album invites
@MainActor
final class InviteService: ObservableObject {
    static let shared = InviteService()

    @Published var isLoading = false
    @Published var error: Error?

    private init() {}

    // MARK: - Create Invite

    /// Create a new invite link for an album
    func createInvite(
        albumId: UUID,
        defaultRole: AlbumRole = .contributor,
        requiresApproval: Bool = false,
        expiresIn: TimeInterval? = nil // nil = never expires
    ) async -> AlbumInvite? {
        guard let userId = AuthManager.shared.userId else { return nil }

        isLoading = true
        error = nil

        do {
            let token = generateInviteToken()
            let expiresAt = expiresIn.map { Date().addingTimeInterval($0) }

            let request = CreateInviteRequest(
                albumId: albumId,
                inviteToken: token,
                defaultRole: defaultRole,
                requiresApproval: requiresApproval,
                expiresAt: expiresAt,
                createdBy: userId
            )

            let invite: AlbumInvite = try await SupabaseService.shared
                .from("album_invites")
                .insert(request)
                .select()
                .single()
                .execute()
                .value

            isLoading = false
            return invite

        } catch {
            self.error = error
            print("[InviteService] Failed to create invite: \(error)")
            isLoading = false
            return nil
        }
    }

    // MARK: - Get Invite URL

    /// Generate a shareable invite URL
    func getInviteURL(token: String) -> URL {
        // Use web URL for sharing (works on all platforms)
        URL(string: "\(Config.webAppURL)/invite/\(token)")!
    }

    /// Generate a deep link URL for the iOS app
    func getDeepLinkURL(token: String) -> URL {
        URL(string: "\(Config.urlScheme)://invite/\(token)")!
    }

    // MARK: - Fetch Invites

    /// Fetch all invites for an album
    func fetchInvites(albumId: UUID) async -> [AlbumInvite] {
        do {
            let invites: [AlbumInvite] = try await SupabaseService.shared
                .from("album_invites")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value
            return invites
        } catch {
            print("[InviteService] Failed to fetch invites: \(error)")
            return []
        }
    }

    // MARK: - Accept Invite

    /// Accept an invite and join the album
    func acceptInvite(token: String) async -> AcceptInviteResult {
        guard let userId = AuthManager.shared.userId else {
            return .error("Not signed in")
        }

        isLoading = true
        error = nil

        do {
            // 1. Fetch the invite
            let invite: AlbumInvite = try await SupabaseService.shared
                .from("album_invites")
                .select()
                .eq("invite_token", value: token)
                .single()
                .execute()
                .value

            // 2. Check if expired
            if let expiresAt = invite.expiresAt, expiresAt < Date() {
                isLoading = false
                return .expired
            }

            // 3. Check if already a member
            let existingMembers: [AlbumMember] = try await SupabaseService.shared
                .from("album_members")
                .select()
                .eq("album_id", value: invite.albumId.uuidString)
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            if !existingMembers.isEmpty {
                isLoading = false
                return .alreadyMember(invite.albumId)
            }

            // 4. Check if requires approval
            if invite.requiresApproval {
                // Create join request
                let request = CreateJoinRequest(
                    albumId: invite.albumId,
                    userId: userId
                )

                try await SupabaseService.shared
                    .from("join_requests")
                    .insert(request)
                    .execute()

                isLoading = false
                return .pendingApproval
            }

            // 5. Add as member directly
            let memberRequest = CreateMemberRequest(
                albumId: invite.albumId,
                userId: userId,
                role: invite.defaultRole
            )

            try await SupabaseService.shared
                .from("album_members")
                .insert(memberRequest)
                .execute()

            isLoading = false
            return .joined(invite.albumId)

        } catch {
            self.error = error
            print("[InviteService] Failed to accept invite: \(error)")
            isLoading = false
            return .error(error.localizedDescription)
        }
    }

    // MARK: - Delete Invite

    /// Delete/revoke an invite
    func deleteInvite(id: UUID) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("album_invites")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[InviteService] Failed to delete invite: \(error)")
            return false
        }
    }

    // MARK: - Helpers

    private func generateInviteToken() -> String {
        // Generate a URL-safe random token
        let characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return String((0..<12).map { _ in characters.randomElement()! })
    }
}

// MARK: - Models

struct AlbumInvite: Codable, Identifiable {
    let id: UUID
    let albumId: UUID
    let inviteToken: String
    let defaultRole: AlbumRole
    let requiresApproval: Bool
    let expiresAt: Date?
    let createdBy: UUID
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case inviteToken = "invite_token"
        case defaultRole = "default_role"
        case requiresApproval = "requires_approval"
        case expiresAt = "expires_at"
        case createdBy = "created_by"
        case createdAt = "created_at"
    }
}

enum AcceptInviteResult {
    case joined(UUID) // Album ID
    case alreadyMember(UUID)
    case pendingApproval
    case expired
    case error(String)
}

// MARK: - Request Types

private struct CreateInviteRequest: Encodable {
    let albumId: UUID
    let inviteToken: String
    let defaultRole: AlbumRole
    let requiresApproval: Bool
    let expiresAt: Date?
    let createdBy: UUID

    enum CodingKeys: String, CodingKey {
        case albumId = "album_id"
        case inviteToken = "invite_token"
        case defaultRole = "default_role"
        case requiresApproval = "requires_approval"
        case expiresAt = "expires_at"
        case createdBy = "created_by"
    }
}

private struct CreateJoinRequest: Encodable {
    let albumId: UUID
    let userId: UUID

    enum CodingKeys: String, CodingKey {
        case albumId = "album_id"
        case userId = "user_id"
    }
}

private struct CreateMemberRequest: Encodable {
    let albumId: UUID
    let userId: UUID
    let role: AlbumRole

    enum CodingKeys: String, CodingKey {
        case albumId = "album_id"
        case userId = "user_id"
        case role
    }
}
