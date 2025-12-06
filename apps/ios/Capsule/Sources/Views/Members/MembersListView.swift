import SwiftUI

struct MembersListView: View {
    let album: Album

    @StateObject private var memberService = MemberService.shared
    @State private var members: [AlbumMemberWithProfile] = []
    @State private var joinRequests: [JoinRequestWithProfile] = []
    @State private var currentUserRole: AlbumRole?
    @State private var isLoading = true
    @State private var showInviteSheet = false
    @State private var memberToEdit: AlbumMemberWithProfile?

    var body: some View {
        List {
            // Pending join requests (only for co-managers+)
            if currentUserRole?.canManageMembers == true && !joinRequests.isEmpty {
                Section("Pending Requests") {
                    ForEach(joinRequests) { request in
                        JoinRequestRow(
                            request: request,
                            onApprove: { await approveRequest(request) },
                            onReject: { await rejectRequest(request) }
                        )
                    }
                }
            }

            // Current members
            Section("Members (\(members.count))") {
                ForEach(members) { member in
                    MemberRow(
                        member: member,
                        isCurrentUser: member.member.userId == AuthManager.shared.userId,
                        canEdit: currentUserRole?.canManageMembers == true && member.member.role != .owner
                    )
                    .onTapGesture {
                        if currentUserRole?.canManageMembers == true && member.member.role != .owner {
                            memberToEdit = member
                        }
                    }
                }
            }
        }
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if currentUserRole?.canManageMembers == true {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showInviteSheet = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showInviteSheet) {
            InviteSheet(album: album)
        }
        .sheet(item: $memberToEdit) { member in
            EditMemberSheet(
                member: member,
                albumId: album.id,
                onUpdate: { await loadData() }
            )
        }
        .overlay {
            if isLoading {
                ProgressView()
            }
        }
        .task {
            await loadData()
        }
        .refreshable {
            await loadData()
        }
    }

    private func loadData() async {
        isLoading = true
        async let membersTask = memberService.fetchMembers(albumId: album.id)
        async let requestsTask = memberService.fetchJoinRequests(albumId: album.id)
        async let roleTask = memberService.getCurrentUserRole(albumId: album.id)

        members = await membersTask
        joinRequests = await requestsTask
        currentUserRole = await roleTask
        isLoading = false
    }

    private func approveRequest(_ request: JoinRequestWithProfile) async {
        if await memberService.handleJoinRequest(requestId: request.id, approve: true) {
            await loadData()
        }
    }

    private func rejectRequest(_ request: JoinRequestWithProfile) async {
        if await memberService.handleJoinRequest(requestId: request.id, approve: false) {
            await loadData()
        }
    }
}

// MARK: - Member Row

struct MemberRow: View {
    let member: AlbumMemberWithProfile
    let isCurrentUser: Bool
    let canEdit: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(Color.accentColor.opacity(0.2))
                .frame(width: 44, height: 44)
                .overlay {
                    Text(member.profile.displayName?.prefix(1).uppercased() ?? "?")
                        .font(.headline)
                        .foregroundStyle(.tint)
                }

            // Name and role
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(member.profile.displayName ?? "Unknown")
                        .font(.body)

                    if isCurrentUser {
                        Text("(you)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(member.member.role.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if canEdit {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Join Request Row

struct JoinRequestRow: View {
    let request: JoinRequestWithProfile
    let onApprove: () async -> Void
    let onReject: () async -> Void

    @State private var isProcessing = false

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.orange.opacity(0.2))
                .frame(width: 44, height: 44)
                .overlay {
                    Text(request.profile.displayName?.prefix(1).uppercased() ?? "?")
                        .font(.headline)
                        .foregroundStyle(.orange)
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(request.profile.displayName ?? "Unknown")
                    .font(.body)

                Text("Wants to join")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isProcessing {
                ProgressView()
            } else {
                HStack(spacing: 8) {
                    Button {
                        Task {
                            isProcessing = true
                            await onReject()
                            isProcessing = false
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.red)
                            .font(.title2)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Task {
                            isProcessing = true
                            await onApprove()
                            isProcessing = false
                        }
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .font(.title2)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Edit Member Sheet

struct EditMemberSheet: View {
    let member: AlbumMemberWithProfile
    let albumId: UUID
    let onUpdate: () async -> Void

    @StateObject private var memberService = MemberService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var selectedRole: AlbumRole
    @State private var showRemoveConfirmation = false
    @State private var isProcessing = false

    init(member: AlbumMemberWithProfile, albumId: UUID, onUpdate: @escaping () async -> Void) {
        self.member = member
        self.albumId = albumId
        self.onUpdate = onUpdate
        _selectedRole = State(initialValue: member.member.role)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color.accentColor.opacity(0.2))
                            .frame(width: 60, height: 60)
                            .overlay {
                                Text(member.profile.displayName?.prefix(1).uppercased() ?? "?")
                                    .font(.title2.bold())
                                    .foregroundStyle(.tint)
                            }

                        VStack(alignment: .leading) {
                            Text(member.profile.displayName ?? "Unknown")
                                .font(.headline)
                            Text("Joined \(member.member.joinedAt.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Role") {
                    Picker("Role", selection: $selectedRole) {
                        ForEach([AlbumRole.coManager, .contributor, .viewer], id: \.self) { role in
                            Text(role.displayName).tag(role)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()

                    Text(selectedRole.description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button(role: .destructive) {
                        showRemoveConfirmation = true
                    } label: {
                        Label("Remove from Album", systemImage: "person.badge.minus")
                    }
                }
            }
            .navigationTitle("Edit Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveRole() }
                    }
                    .disabled(selectedRole == member.member.role || isProcessing)
                }
            }
            .confirmationDialog("Remove Member", isPresented: $showRemoveConfirmation) {
                Button("Remove", role: .destructive) {
                    Task { await removeMember() }
                }
            } message: {
                Text("Remove \(member.profile.displayName ?? "this member") from the album? They can rejoin if invited again.")
            }
            .overlay {
                if isProcessing {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView()
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    private func saveRole() async {
        isProcessing = true
        if await memberService.updateMemberRole(albumId: albumId, userId: member.member.userId, newRole: selectedRole) {
            await onUpdate()
            dismiss()
        }
        isProcessing = false
    }

    private func removeMember() async {
        isProcessing = true
        if await memberService.removeMember(albumId: albumId, userId: member.member.userId) {
            await onUpdate()
            dismiss()
        }
        isProcessing = false
    }
}

#Preview {
    NavigationStack {
        MembersListView(album: Album(
            id: UUID(),
            ownerId: UUID(),
            title: "Test Album",
            description: nil,
            coverPhotoId: nil,
            privacyMode: .inviteOnly,
            createdAt: .now,
            updatedAt: .now
        ))
    }
}
