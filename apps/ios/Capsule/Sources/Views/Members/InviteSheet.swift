import SwiftUI

struct InviteSheet: View {
    let album: Album

    @StateObject private var inviteService = InviteService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var defaultRole: AlbumRole = .contributor
    @State private var requiresApproval = false
    @State private var expiresOption: ExpiresOption = .never
    @State private var isCreating = false
    @State private var createdInvite: AlbumInvite?
    @State private var inviteURL: URL?

    enum ExpiresOption: String, CaseIterable {
        case never = "Never"
        case oneDay = "1 Day"
        case oneWeek = "1 Week"
        case oneMonth = "1 Month"

        var timeInterval: TimeInterval? {
            switch self {
            case .never: return nil
            case .oneDay: return 86400
            case .oneWeek: return 604800
            case .oneMonth: return 2592000
            }
        }
    }

    var body: some View {
        NavigationStack {
            if let inviteURL {
                // Show created invite
                inviteCreatedView(url: inviteURL)
            } else {
                // Create invite form
                createInviteForm
            }
        }
    }

    private var createInviteForm: some View {
        Form {
            Section {
                Text("Create an invite link to share with others. Anyone with the link can join your album.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Default Role") {
                Picker("Role for new members", selection: $defaultRole) {
                    Text("Contributor").tag(AlbumRole.contributor)
                    Text("Viewer").tag(AlbumRole.viewer)
                }
                .pickerStyle(.inline)
                .labelsHidden()

                Text(defaultRole.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Options") {
                Toggle("Require approval", isOn: $requiresApproval)

                Picker("Link expires", selection: $expiresOption) {
                    ForEach(ExpiresOption.allCases, id: \.self) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
            }

            if requiresApproval {
                Section {
                    Label("You'll be notified when someone wants to join and can approve or reject them.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Invite Members")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }

            ToolbarItem(placement: .confirmationAction) {
                Button("Create Link") {
                    Task { await createInvite() }
                }
                .disabled(isCreating)
            }
        }
        .overlay {
            if isCreating {
                Color.black.opacity(0.2)
                    .ignoresSafeArea()
                ProgressView("Creating...")
                    .padding()
                    .background(.regularMaterial)
                    .cornerRadius(12)
            }
        }
    }

    private func inviteCreatedView(url: URL) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.green)

            Text("Invite Link Created!")
                .font(.title2.bold())

            VStack(spacing: 8) {
                Text(url.absoluteString)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(8)

                if let expiresAt = createdInvite?.expiresAt {
                    Text("Expires \(expiresAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal)

            Spacer()

            VStack(spacing: 12) {
                ShareLink(item: url) {
                    Label("Share Link", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    UIPasteboard.general.url = url
                } label: {
                    Label("Copy to Clipboard", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)

                Button("Done") {
                    dismiss()
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .navigationTitle("Invite Link")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    private func createInvite() async {
        isCreating = true

        if let invite = await inviteService.createInvite(
            albumId: album.id,
            defaultRole: defaultRole,
            requiresApproval: requiresApproval,
            expiresIn: expiresOption.timeInterval
        ) {
            createdInvite = invite
            inviteURL = inviteService.getInviteURL(token: invite.inviteToken)
        }

        isCreating = false
    }
}

#Preview {
    InviteSheet(album: Album(
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
