import SwiftUI

// MARK: - Capsule Hero Header

/// Parallax hero header with sticky collapse behavior.
/// Features large cover photo, gradient overlay, and metadata row.

struct CapsuleHeroHeader: View {
    let album: MockAlbum
    let members: [MockMember]
    let scrollOffset: CGFloat

    @Environment(\.dismiss) private var dismiss

    private let baseHeight: CGFloat = 360
    private let minHeight: CGFloat = 100

    private var currentHeight: CGFloat {
        max(minHeight, baseHeight + scrollOffset)
    }

    private var parallaxOffset: CGFloat {
        scrollOffset > 0 ? -scrollOffset * 0.5 : 0
    }

    private var headerOpacity: Double {
        let progress = max(0, min(1, (currentHeight - minHeight) / (baseHeight - minHeight)))
        return progress
    }

    private var isCollapsed: Bool {
        currentHeight <= minHeight + 50
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Cover photo with parallax
            GeometryReader { geo in
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
                .frame(width: geo.size.width, height: currentHeight + (scrollOffset > 0 ? scrollOffset : 0))
                .offset(y: parallaxOffset)
                .clipped()
            }

            // Gradient overlay
            LinearGradient(
                colors: [
                    .black.opacity(0.4),
                    .clear,
                    .black.opacity(0.6)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Top bar (always visible)
            topBar
                .padding(.top, 54)

            // Album info (fades with scroll)
            VStack {
                Spacer()
                albumInfo
                    .opacity(headerOpacity)
            }
            .padding(.bottom, LabTokens.Spacing.xl)
        }
        .frame(height: currentHeight)
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Back button
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial.opacity(0.6), in: Circle())
            }

            Spacer()

            // Collapsed title
            if isCollapsed {
                Text(album.title)
                    .labFont(.metadata)
                    .foregroundStyle(.white)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            Spacer()

            // Menu button
            Menu {
                Button { } label: { Label("Add Photos", systemImage: "plus") }
                Button { } label: { Label("Select", systemImage: "checkmark.circle") }
                Divider()
                Button { } label: { Label("Settings", systemImage: "gearshape") }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial.opacity(0.6), in: Circle())
            }
        }
        .padding(.horizontal, LabTokens.Spacing.sm)
        .animation(LabTokens.Animation.quick, value: isCollapsed)
    }

    // MARK: - Album Info

    private var albumInfo: some View {
        VStack(alignment: .leading, spacing: LabTokens.Spacing.sm) {
            // Title
            Text(album.title)
                .font(.title.bold())
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)

            // Metadata row
            HStack(spacing: LabTokens.Spacing.md) {
                // Date range
                Label(album.dateRange, systemImage: "calendar")
                    .labFont(.metadata)

                // Photo count
                Label("\(album.photoCount) photos", systemImage: "photo")
                    .labFont(.metadata)
            }
            .foregroundStyle(.white.opacity(0.9))

            // Members row
            HStack(spacing: -8) {
                ForEach(members.prefix(4)) { member in
                    memberAvatar(member)
                }

                if members.count > 4 {
                    Text("+\(members.count - 4)")
                        .labFont(.caption)
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: Circle())
                }

                Spacer()

                // Floating add button
                Button { } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(LabTokens.Colors.primary, in: Circle())
                        .labElevation(.medium)
                }
            }
        }
        .padding(.horizontal, LabTokens.Spacing.lg)
    }

    private func memberAvatar(_ member: MockMember) -> some View {
        Group {
            if let avatarUrl = member.avatarUrl {
                AsyncImage(url: URL(string: avatarUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        initialsAvatar(member.name)
                    }
                }
            } else {
                initialsAvatar(member.name)
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().stroke(.white, lineWidth: 2))
    }

    private func initialsAvatar(_ name: String) -> some View {
        let initials = name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
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
    ScrollView {
        CapsuleHeroHeader(
            album: MockAlbum.samples[0],
            members: MockMember.samples,
            scrollOffset: 0
        )
    }
    .ignoresSafeArea()
}
