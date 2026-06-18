import SwiftUI

// MARK: - Lab Album Settings View

/// Modern settings sheet with blur material background and section cards.
/// Features rounded top sheet, drag indicator, and generous spacing.

struct LabAlbumSettingsView: View {
    let album: MockAlbum

    @Environment(\.dismiss) private var dismiss
    @State private var title: String = ""
    @State private var privacy: String = "Private"
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LabTokens.Spacing.lg) {
                    // Cover Photo Section
                    coverPhotoSection

                    // Details Section
                    detailsSection

                    // Privacy Section
                    privacySection

                    // Members Section
                    membersSection

                    // Danger Zone
                    dangerZoneSection
                }
                .padding(LabTokens.Spacing.md)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Album Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        // Save changes
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                title = album.title
                privacy = album.privacy
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(LabTokens.Radius.xxl)
        .confirmationDialog(
            "Delete Album?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                // Delete album
                dismiss()
            }
        } message: {
            Text("This will permanently delete all \(album.photoCount) photos. This action cannot be undone.")
        }
    }

    // MARK: - Cover Photo Section

    private var coverPhotoSection: some View {
        SettingsCard(title: "Cover Photo", icon: "photo") {
            VStack(spacing: LabTokens.Spacing.sm) {
                // Cover preview
                AsyncImage(url: URL(string: album.coverUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        LabTokens.Colors.primaryGradient
                    }
                }
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: LabTokens.Radius.md))

                // Change button
                Button {
                    // Change cover
                } label: {
                    Label("Change Cover", systemImage: "photo.badge.plus")
                        .labFont(.pill)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LabTokens.Spacing.sm)
                        .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: LabTokens.Radius.md))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        SettingsCard(title: "Details", icon: "doc.text") {
            VStack(spacing: LabTokens.Spacing.sm) {
                // Title field
                VStack(alignment: .leading, spacing: LabTokens.Spacing.xxs) {
                    Text("Title")
                        .labFont(.caption)
                        .foregroundStyle(.secondary)

                    TextField("Album Title", text: $title)
                        .labFont(.body)
                        .padding(LabTokens.Spacing.sm)
                        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: LabTokens.Radius.sm))
                }

                // Date info (read-only)
                HStack {
                    VStack(alignment: .leading, spacing: LabTokens.Spacing.xxs) {
                        Text("Date Range")
                            .labFont(.caption)
                            .foregroundStyle(.secondary)

                        Text(album.dateRange)
                            .labFont(.body)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: LabTokens.Spacing.xxs) {
                        Text("Photos")
                            .labFont(.caption)
                            .foregroundStyle(.secondary)

                        Text("\(album.photoCount)")
                            .labFont(.body)
                    }
                }
                .padding(.top, LabTokens.Spacing.xs)
            }
        }
    }

    // MARK: - Privacy Section

    private var privacySection: some View {
        SettingsCard(title: "Privacy", icon: "lock") {
            VStack(spacing: LabTokens.Spacing.xs) {
                PrivacyOption(
                    title: "Private",
                    description: "Only you can see this album",
                    icon: "lock.fill",
                    isSelected: privacy == "Private"
                ) {
                    privacy = "Private"
                }

                PrivacyOption(
                    title: "Invite Only",
                    description: "Only invited members can see",
                    icon: "person.2.fill",
                    isSelected: privacy == "Invite Only"
                ) {
                    privacy = "Invite Only"
                }

                PrivacyOption(
                    title: "Link Sharing",
                    description: "Anyone with the link can view",
                    icon: "link",
                    isSelected: privacy == "Link Sharing"
                ) {
                    privacy = "Link Sharing"
                }
            }
        }
    }

    // MARK: - Members Section

    private var membersSection: some View {
        SettingsCard(title: "Members", icon: "person.3") {
            VStack(spacing: LabTokens.Spacing.sm) {
                ForEach(MockMember.samples) { member in
                    LabMemberRow(member: member)
                }

                // Invite button
                Button {
                    // Invite member
                } label: {
                    Label("Invite Member", systemImage: "plus.circle")
                        .labFont(.pill)
                        .foregroundStyle(LabTokens.Colors.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LabTokens.Spacing.sm)
                        .background(LabTokens.Colors.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: LabTokens.Radius.md))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Danger Zone

    private var dangerZoneSection: some View {
        SettingsCard(title: "Danger Zone", icon: "exclamationmark.triangle", tint: .red) {
            VStack(spacing: LabTokens.Spacing.sm) {
                Button {
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete Album", systemImage: "trash")
                        .labFont(.pill)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LabTokens.Spacing.sm)
                        .background(Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: LabTokens.Radius.md))
                }
                .buttonStyle(.plain)

                Text("This will permanently delete all photos and cannot be undone.")
                    .labFont(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - Settings Card

struct SettingsCard<Content: View>: View {
    let title: String
    let icon: String
    var tint: Color = LabTokens.Colors.primary
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: LabTokens.Spacing.md) {
            // Header
            HStack(spacing: LabTokens.Spacing.xs) {
                Image(systemName: icon)
                    .foregroundStyle(tint)

                Text(title)
                    .labFont(.cardTitle)
            }

            // Content
            content()
        }
        .padding(LabTokens.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: LabTokens.Radius.xl))
        .labElevation(.low)
    }
}

// MARK: - Privacy Option

struct PrivacyOption: View {
    let title: String
    let description: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: LabTokens.Spacing.sm) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(isSelected ? LabTokens.Colors.primary : .secondary)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .labFont(.metadata)
                        .foregroundStyle(.primary)

                    Text(description)
                        .labFont(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? LabTokens.Colors.primary : Color.gray.opacity(0.4))
            }
            .padding(LabTokens.Spacing.sm)
            .background(
                isSelected ? LabTokens.Colors.primary.opacity(0.1) : Color.clear,
                in: RoundedRectangle(cornerRadius: LabTokens.Radius.md)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Lab Member Row

struct LabMemberRow: View {
    let member: MockMember

    var body: some View {
        HStack(spacing: LabTokens.Spacing.sm) {
            // Avatar
            Group {
                if let avatarUrl = member.avatarUrl {
                    AsyncImage(url: URL(string: avatarUrl)) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            initialsView
                        }
                    }
                } else {
                    initialsView
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())

            // Name and role
            VStack(alignment: .leading, spacing: 2) {
                Text(member.name)
                    .labFont(.metadata)

                Text(member.role)
                    .labFont(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Photo count
            Text("\(member.photoCount)")
                .labFont(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var initialsView: some View {
        let initials = member.name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
        return ZStack {
            LabTokens.Colors.primaryGradient
            Text(initials)
                .font(.caption.bold())
                .foregroundStyle(.white)
        }
    }
}

// MARK: - Preview

#Preview {
    Text("Settings")
        .sheet(isPresented: .constant(true)) {
            LabAlbumSettingsView(album: MockAlbum.samples[0])
        }
}
