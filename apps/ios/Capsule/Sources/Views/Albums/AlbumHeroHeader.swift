import SwiftUI

/// Hero header component for album detail view
/// Displays gradient background, mini-collage, title, date range, contributors, and last activity
struct AlbumHeroHeader: View {
    let album: Album
    let photos: [Photo]
    let members: [AlbumMemberWithProfile]
    let photoCount: Int

    // Computed properties
    private var dateRange: String {
        guard !photos.isEmpty else { return "" }
        let dates = photos.map { $0.createdAt }.sorted()
        guard let first = dates.first, let last = dates.last else { return "" }

        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"

        if Calendar.current.isDate(first, equalTo: last, toGranularity: .day) {
            return formatter.string(from: first)
        } else if Calendar.current.isDate(first, equalTo: last, toGranularity: .month) {
            let dayFormatter = DateFormatter()
            dayFormatter.dateFormat = "d"
            return "\(formatter.string(from: first))-\(dayFormatter.string(from: last))"
        } else {
            return "\(formatter.string(from: first)) - \(formatter.string(from: last))"
        }
    }

    private var previewPhotos: [Photo] {
        Array(photos.prefix(4))
    }

    private var contributorProfiles: [Profile] {
        members.map { $0.profile }
    }

    private var lastActivityText: String? {
        guard let latestPhoto = photos.max(by: { $0.createdAt < $1.createdAt }) else {
            return nil
        }

        let uploader = members.first { $0.member.userId == latestPhoto.uploaderId }?.profile
        let uploaderName = uploader?.displayName ?? "Someone"
        let timeAgo = latestPhoto.createdAt.formatted(.relative(presentation: .named))

        return "\(uploaderName) added photos \(timeAgo)"
    }

    var body: some View {
        ZStack {
            // Gradient background
            LinearGradient.capsuleHeroGradient
                .ignoresSafeArea(edges: .top)

            VStack(spacing: CapsuleDesign.spacingRelaxed) {
                // Mini-collage
                miniCollage
                    .padding(.top, CapsuleDesign.spacingLoose)

                // Album title
                Text(album.title)
                    .font(.title.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                // Date range + photo count
                HStack(spacing: CapsuleDesign.spacingNormal) {
                    if !dateRange.isEmpty {
                        Text(dateRange)
                    }
                    if !dateRange.isEmpty && photoCount > 0 {
                        Text("•")
                    }
                    if photoCount > 0 {
                        Text("\(photoCount) \(photoCount == 1 ? "photo" : "photos")")
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))

                // Contributors row
                if !members.isEmpty {
                    contributorsRow
                }

                // Last activity
                if let activityText = lastActivityText {
                    Text(activityText)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.7))
                        .padding(.bottom, CapsuleDesign.spacingNormal)
                }
            }
            .padding(.horizontal, CapsuleDesign.spacingLoose)
            .padding(.bottom, CapsuleDesign.spacingLoose)
        }
        .frame(minHeight: 280)
    }

    // MARK: - Mini Collage

    @ViewBuilder
    private var miniCollage: some View {
        if previewPhotos.isEmpty {
            // Empty state
            RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium)
                .fill(.white.opacity(0.2))
                .frame(width: 200, height: 140)
                .overlay {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 40))
                        .foregroundStyle(.white.opacity(0.5))
                }
        } else if previewPhotos.count == 1 {
            // Single photo
            collagePhoto(previewPhotos[0])
                .frame(width: 200, height: 140)
                .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
                .capsuleShadow(.medium)
        } else if previewPhotos.count == 2 {
            // Two photos side by side
            HStack(spacing: 4) {
                collagePhoto(previewPhotos[0])
                    .frame(width: 100, height: 140)
                collagePhoto(previewPhotos[1])
                    .frame(width: 100, height: 140)
            }
            .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
            .capsuleShadow(.medium)
        } else if previewPhotos.count == 3 {
            // One large + two small
            HStack(spacing: 4) {
                collagePhoto(previewPhotos[0])
                    .frame(width: 130, height: 140)
                VStack(spacing: 4) {
                    collagePhoto(previewPhotos[1])
                        .frame(width: 66, height: 68)
                    collagePhoto(previewPhotos[2])
                        .frame(width: 66, height: 68)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
            .capsuleShadow(.medium)
        } else {
            // 2x2 grid asymmetric (one large + two small + one medium)
            HStack(spacing: 4) {
                collagePhoto(previewPhotos[0])
                    .frame(width: 130, height: 140)
                VStack(spacing: 4) {
                    collagePhoto(previewPhotos[1])
                        .frame(width: 66, height: 68)
                    HStack(spacing: 4) {
                        collagePhoto(previewPhotos[2])
                            .frame(width: 31, height: 68)
                        collagePhoto(previewPhotos[3])
                            .frame(width: 31, height: 68)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
            .capsuleShadow(.medium)
        }
    }

    @ViewBuilder
    private func collagePhoto(_ photo: Photo) -> some View {
        AsyncImage(url: photo.thumbnailUrl) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure:
                Rectangle()
                    .fill(.white.opacity(0.1))
            default:
                Rectangle()
                    .fill(.white.opacity(0.1))
                    .shimmer()
            }
        }
    }

    // MARK: - Contributors Row

    private var contributorsRow: some View {
        HStack(spacing: -8) {
            // Show up to 4 avatars
            ForEach(contributorProfiles.prefix(4), id: \.id) { profile in
                contributorAvatar(profile: profile)
            }

            // Overflow indicator
            if contributorProfiles.count > 4 {
                ZStack {
                    Circle()
                        .fill(Color.capsuleSurfaceElevated)
                        .frame(width: 28, height: 28)
                    Text("+\(contributorProfiles.count - 4)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                }
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.3), lineWidth: 2)
                }
            }

            // Label
            Text("\(members.count) \(members.count == 1 ? "member" : "members")")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
                .padding(.leading, 12)
        }
    }

    @ViewBuilder
    private func contributorAvatar(profile: Profile) -> some View {
        if let avatarUrlString = profile.avatarUrl, let url = URL(string: avatarUrlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: 28, height: 28)
                        .clipShape(Circle())
                default:
                    avatarPlaceholder(profile: profile)
                }
            }
            .overlay {
                Circle()
                    .stroke(.white.opacity(0.3), lineWidth: 2)
            }
        } else {
            avatarPlaceholder(profile: profile)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.3), lineWidth: 2)
                }
        }
    }

    private func avatarPlaceholder(profile: Profile) -> some View {
        Circle()
            .fill(Color.capsuleSecondary)
            .frame(width: 28, height: 28)
            .overlay {
                Text(profile.displayName?.prefix(1).uppercased() ?? "?")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
            }
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        AlbumHeroHeader(
            album: Album(
                id: UUID(),
                ownerId: UUID(),
                title: "Summer Roadtrip 2024",
                description: "Our amazing adventure",
                coverPhotoId: nil,
                privacyMode: .inviteOnly,
                createdAt: .now,
                updatedAt: .now
            ),
            photos: [],
            members: [],
            photoCount: 127
        )
    }
    .background(Color.black)
}
