import SwiftUI

// MARK: - Signature Album Card
// A distinctive album card with:
// - Visible layered shadows for depth
// - Purple accent bar (signature element)
// - Contributor avatars
// - Inner border glow
// - Press animation

struct SignatureAlbumCard: View {
    let album: AlbumWithDetails
    let coverPhotoUrl: URL?
    let index: Int
    var onTap: () -> Void = {}

    @State private var isVisible = false

    private let cardHeight: CGFloat = 280

    var body: some View {
        Button(action: onTap) {
            cardStack
        }
        .buttonStyle(CardLiftButtonStyle())
        .opacity(isVisible ? 1 : 0)
        .offset(y: isVisible ? 0 : 30)
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(Double(index) * 0.08)) {
                isVisible = true
            }
        }
    }

    // MARK: - Card Stack (Depth Layers)

    private var cardStack: some View {
        ZStack {
            // Layer 1: Deep shadow (ambient)
            RoundedRectangle(cornerRadius: 24)
                .fill(Color.black.opacity(0.15))
                .blur(radius: 20)
                .offset(y: 12)

            // Layer 2: Mid shadow
            RoundedRectangle(cornerRadius: 24)
                .fill(Color.black.opacity(0.1))
                .blur(radius: 8)
                .offset(y: 6)

            // Layer 3: Main card
            mainCard
        }
    }

    // MARK: - Main Card

    private var mainCard: some View {
        ZStack(alignment: .bottom) {
            // Photo
            coverPhoto

            // Gradient scrim
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.3),
                    .init(color: .black.opacity(0.3), location: 0.6),
                    .init(color: .black.opacity(0.85), location: 1.0)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content
            cardContent

            // Accent bar (left edge) - THE SIGNATURE ELEMENT
            HStack {
                accentBar
                Spacer()
            }

            // Inner border glow
            RoundedRectangle(cornerRadius: 24)
                .stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.4), .white.opacity(0.1), .clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )

            // Privacy badge
            VStack {
                HStack {
                    Spacer()
                    privacyBadge
                }
                Spacer()
            }
            .padding(16)
        }
        .frame(height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    // MARK: - Cover Photo

    private var coverPhoto: some View {
        AsyncImage(url: coverPhotoUrl) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure, .empty:
                placeholderGradient
            @unknown default:
                placeholderGradient
            }
        }
        .frame(height: cardHeight)
        .clipped()
    }

    private var placeholderGradient: some View {
        LinearGradient(
            colors: [
                Color(red: 0.3, green: 0.2, blue: 0.7),
                Color(red: 0.5, green: 0.3, blue: 0.8)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 40))
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    // MARK: - Accent Bar (Signature Element)

    private var accentBar: some View {
        LinearGradient(
            colors: [
                Color(red: 0.5, green: 0.4, blue: 0.95),
                Color(red: 0.35, green: 0.25, blue: 0.85)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(width: 4)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 24,
                bottomTrailingRadius: 0,
                topTrailingRadius: 0
            )
        )
    }

    // MARK: - Card Content

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()

            // Title
            Text(album.album.title)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.5), radius: 4, y: 2)
                .lineLimit(2)

            // Metadata row
            HStack(spacing: 16) {
                // Photo count
                Label {
                    Text("\(album.photoCount)")
                        .font(.system(size: 14, weight: .medium))
                } icon: {
                    Image(systemName: "photo.fill")
                        .font(.system(size: 12))
                }
                .foregroundStyle(.white.opacity(0.9))

                // Member count
                Label {
                    Text("\(album.memberCount)")
                        .font(.system(size: 14, weight: .medium))
                } icon: {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 12))
                }
                .foregroundStyle(.white.opacity(0.7))

                Spacer()

                // Contributors (overlapping avatars)
                contributorAvatars
            }
        }
        .padding(20)
        .padding(.leading, 8) // Extra padding for accent bar
    }

    // MARK: - Contributor Avatars

    private var contributorAvatars: some View {
        HStack(spacing: -8) {
            ForEach(0..<min(album.memberCount, 3), id: \.self) { i in
                Circle()
                    .fill(
                        LinearGradient(
                            colors: avatarColors(for: i),
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(initials(for: i))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    )
                    .overlay(
                        Circle()
                            .stroke(.white.opacity(0.3), lineWidth: 1.5)
                    )
                    .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
            }

            if album.memberCount > 3 {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text("+\(album.memberCount - 3)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    )
                    .overlay(
                        Circle()
                            .stroke(.white.opacity(0.2), lineWidth: 1)
                    )
            }
        }
    }

    private func avatarColors(for index: Int) -> [Color] {
        let palettes: [[Color]] = [
            [Color(red: 0.4, green: 0.3, blue: 0.9), Color(red: 0.5, green: 0.4, blue: 0.95)],
            [Color(red: 0.9, green: 0.4, blue: 0.5), Color(red: 0.95, green: 0.5, blue: 0.6)],
            [Color(red: 0.3, green: 0.7, blue: 0.6), Color(red: 0.4, green: 0.8, blue: 0.7)]
        ]
        return palettes[index % palettes.count]
    }

    private func initials(for index: Int) -> String {
        ["", "", ""][index % 3] // Will be replaced with real initials when we have member data
    }

    // MARK: - Privacy Badge

    private var privacyBadge: some View {
        Image(systemName: privacyIcon)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.9))
            .padding(8)
            .background(.ultraThinMaterial.opacity(0.6), in: Circle())
            .overlay(
                Circle()
                    .stroke(.white.opacity(0.2), lineWidth: 0.5)
            )
    }

    private var privacyIcon: String {
        switch album.album.privacyMode {
        case .inviteOnly: return "lock.fill"
        case .linkAccessible: return "link"
        case .publicUnlisted: return "globe"
        }
    }
}

// MARK: - Card Lift Button Style

struct CardLiftButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Editorial Section Header

struct EditorialSectionHeader: View {
    let title: String
    let subtitle: String?

    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Uppercase title with tracking
            Text(title.uppercased())
                .font(.system(size: 13, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(.secondary)

            // Accent line
            Rectangle()
                .fill(Color.capsulePrimary.opacity(0.4))
                .frame(width: 32, height: 2)

            // Optional subtitle
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 24)
        .padding(.bottom, 16)
    }
}

// MARK: - Simple Album Card (for backward compatibility)

struct SimpleAlbumCard: View {
    let album: AlbumWithDetails

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Cover image
            AsyncImage(url: album.coverPhotoThumbnailUrl) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay {
                            Image(systemName: "photo")
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                        }
                default:
                    Rectangle()
                        .fill(Color(.systemGray5))
                }
            }
            .frame(height: 120)
            .clipped()

            // Info section
            VStack(alignment: .leading, spacing: CapsuleDesign.spacingTight) {
                Text(album.album.title)
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: CapsuleDesign.spacingTight) {
                    Label("\(album.photoCount)", systemImage: "photo")
                    Label("\(album.memberCount)", systemImage: "person.2")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(CapsuleDesign.spacingRelaxed)

            // Gradient accent
            LinearGradient.capsuleSubtleGradient
                .frame(height: 2)
        }
        .background(Color.capsuleSurfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
        .capsuleShadow(.subtle)
    }
}

// MARK: - Compact Album Card (Activity-Focused)
// The new utilitarian card design:
// - Small thumbnail (48x48)
// - Activity badge with count
// - Last activity inline
// - Date range instead of creation date

struct CompactAlbumCard: View {
    let album: AlbumWithDetails
    let coverPhotoUrl: URL?
    let activityCount: Int
    let lastActivity: ActivityWithActor?
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                // Thumbnail
                thumbnail

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    // Title row with activity badge
                    HStack {
                        Text(album.album.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        Spacer()

                        if activityCount > 0 {
                            activityBadge
                        }
                    }

                    // Metadata row
                    HStack(spacing: 8) {
                        Text(dateRangeText)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)

                        Text("·")
                            .foregroundStyle(.tertiary)

                        Text("\(album.memberCount) people")
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                    }

                    // Last activity (if available)
                    if let activity = lastActivity {
                        HStack(spacing: 4) {
                            Text(activity.description)
                                .font(.system(size: 12))
                                .foregroundStyle(.tertiary)

                            Text("·")
                                .foregroundStyle(.quaternary)

                            Text(activity.detailedRelativeTime)
                                .font(.system(size: 12))
                                .foregroundStyle(.quaternary)
                        }
                        .lineLimit(1)
                    }
                }

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.quaternary)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Thumbnail

    private var thumbnail: some View {
        AsyncImage(url: coverPhotoUrl) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure, .empty:
                LinearGradient(
                    colors: [Color.capsulePrimary.opacity(0.3), Color.capsulePrimary.opacity(0.5)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .overlay {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.system(size: 16))
                        .foregroundStyle(.white.opacity(0.6))
                }
            @unknown default:
                Color(.systemGray5)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.primary.opacity(0.1), lineWidth: 0.5)
        )
    }

    // MARK: - Activity Badge

    private var activityBadge: some View {
        Text("\(activityCount)")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.capsulePrimary)
            .clipShape(Capsule())
    }

    // MARK: - Date Range

    private var dateRangeText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"

        let created = album.album.createdAt
        let updated = album.album.updatedAt

        // If same day, just show one date
        let calendar = Calendar.current
        if calendar.isDate(created, inSameDayAs: updated) {
            return formatter.string(from: created)
        }

        // Otherwise show range
        let createdStr = formatter.string(from: created)
        let updatedStr = formatter.string(from: updated)

        // If same month, simplify
        if calendar.component(.month, from: created) == calendar.component(.month, from: updated) &&
           calendar.component(.year, from: created) == calendar.component(.year, from: updated) {
            let dayFormatter = DateFormatter()
            dayFormatter.dateFormat = "d"
            return "\(formatter.string(from: created))–\(dayFormatter.string(from: updated))"
        }

        return "\(createdStr)–\(updatedStr)"
    }
}

// MARK: - Section Header for Compact Cards

struct CompactSectionHeader: View {
    let title: String
    let count: Int?

    init(_ title: String, count: Int? = nil) {
        self.title = title
        self.count = count
    }

    var body: some View {
        HStack {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .semibold))
                .tracking(1)
                .foregroundStyle(.secondary)

            if let count = count, count > 0 {
                Text("(\(count))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.tertiary)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .padding(.bottom, 8)
    }
}

// MARK: - Preview

#Preview("Signature Card") {
    ScrollView {
        VStack(spacing: 28) {
            EditorialSectionHeader("Recently Updated", subtitle: "Last 7 days")
                .padding(.horizontal, 20)

            SignatureAlbumCard(
                album: AlbumWithDetails(
                    album: Album(
                        id: UUID(),
                        ownerId: UUID(),
                        title: "Summer Roadtrip 2024",
                        description: nil,
                        coverPhotoId: nil,
                        privacyMode: .inviteOnly,
                        createdAt: .now,
                        updatedAt: .now
                    ),
                    photoCount: 127,
                    memberCount: 4,
                    coverPhotoThumbnailUrl: nil,
                    userRole: .owner
                ),
                coverPhotoUrl: nil,
                index: 0
            ) {
                print("Tapped")
            }
            .padding(.horizontal, 20)

            SignatureAlbumCard(
                album: AlbumWithDetails(
                    album: Album(
                        id: UUID(),
                        ownerId: UUID(),
                        title: "Sarah's Birthday",
                        description: nil,
                        coverPhotoId: nil,
                        privacyMode: .linkAccessible,
                        createdAt: .now,
                        updatedAt: .now
                    ),
                    photoCount: 42,
                    memberCount: 8,
                    coverPhotoThumbnailUrl: nil,
                    userRole: .contributor
                ),
                coverPhotoUrl: nil,
                index: 1
            ) {
                print("Tapped")
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 16)
    }
    .background(Color(.systemGroupedBackground))
}

#Preview("Compact Card") {
    ScrollView {
        VStack(spacing: 0) {
            CompactSectionHeader("Active", count: 2)

            VStack(spacing: 8) {
                CompactAlbumCard(
                    album: AlbumWithDetails(
                        album: Album(
                            id: UUID(),
                            ownerId: UUID(),
                            title: "Summer Roadtrip 2024",
                            description: nil,
                            coverPhotoId: nil,
                            privacyMode: .inviteOnly,
                            createdAt: Date().addingTimeInterval(-7 * 24 * 3600),
                            updatedAt: .now
                        ),
                        photoCount: 127,
                        memberCount: 4,
                        coverPhotoThumbnailUrl: nil,
                        userRole: .owner
                    ),
                    coverPhotoUrl: nil,
                    activityCount: 3,
                    lastActivity: nil
                ) {
                    print("Tapped")
                }

                CompactAlbumCard(
                    album: AlbumWithDetails(
                        album: Album(
                            id: UUID(),
                            ownerId: UUID(),
                            title: "Sarah's Birthday",
                            description: nil,
                            coverPhotoId: nil,
                            privacyMode: .linkAccessible,
                            createdAt: Date().addingTimeInterval(-30 * 24 * 3600),
                            updatedAt: Date().addingTimeInterval(-2 * 24 * 3600)
                        ),
                        photoCount: 42,
                        memberCount: 8,
                        coverPhotoThumbnailUrl: nil,
                        userRole: .contributor
                    ),
                    coverPhotoUrl: nil,
                    activityCount: 1,
                    lastActivity: nil
                ) {
                    print("Tapped")
                }
            }
            .padding(.horizontal, 16)

            CompactSectionHeader("Quiet", count: 1)

            VStack(spacing: 8) {
                CompactAlbumCard(
                    album: AlbumWithDetails(
                        album: Album(
                            id: UUID(),
                            ownerId: UUID(),
                            title: "Beach Weekend 2023",
                            description: nil,
                            coverPhotoId: nil,
                            privacyMode: .inviteOnly,
                            createdAt: Date().addingTimeInterval(-365 * 24 * 3600),
                            updatedAt: Date().addingTimeInterval(-300 * 24 * 3600)
                        ),
                        photoCount: 89,
                        memberCount: 3,
                        coverPhotoThumbnailUrl: nil,
                        userRole: .owner
                    ),
                    coverPhotoUrl: nil,
                    activityCount: 0,
                    lastActivity: nil
                ) {
                    print("Tapped")
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 16)
    }
    .background(Color(.systemGroupedBackground))
}
