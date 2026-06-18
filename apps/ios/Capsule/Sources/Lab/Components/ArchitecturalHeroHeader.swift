import SwiftUI

// MARK: - Architectural Hero Header
// Premium hero design inspired by:
// - Architectural photography
// - Scandinavian furniture
// - Swiss editorial layouts
//
// Features:
// - Large hero with cinematic vignette
// - Floating "album signature bar" that rests on the image
// - Elastic parallax on pull
// - Ambient color tinting
// - Film grain texture

struct ArchitecturalHeroHeader: View {
    let album: MockAlbum
    let members: [MockMember]
    let scrollOffset: CGFloat
    var onBack: () -> Void = {}
    var onMenu: () -> Void = {}

    @State private var dominantColor: Color = .gray

    private let baseHeight: CGFloat = 420
    private let minHeight: CGFloat = 100

    // Elastic parallax - 1.06 exaggeration on pull
    private var elasticOffset: CGFloat {
        if scrollOffset > 0 {
            return scrollOffset * 0.06  // Stretch effect
        }
        return 0
    }

    private var currentHeight: CGFloat {
        max(minHeight, baseHeight + scrollOffset + elasticOffset)
    }

    private var parallaxOffset: CGFloat {
        scrollOffset > 0 ? -scrollOffset * 0.4 : 0
    }

    private var headerOpacity: Double {
        let progress = max(0, min(1, (currentHeight - minHeight) / (baseHeight - minHeight)))
        return progress
    }

    private var isCollapsed: Bool {
        currentHeight <= minHeight + 60
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Background: Cover photo with parallax
            heroImageLayer

            // Cinematic layers
            cinematicOverlays

            // Navigation bar (always visible)
            navigationBar
                .padding(.top, 54)

            // Album signature bar (floating element)
            if !isCollapsed {
                albumSignatureBar
                    .opacity(headerOpacity)
            }
        }
        .frame(height: currentHeight)
    }

    // MARK: - Hero Image Layer

    private var heroImageLayer: some View {
        GeometryReader { geo in
            AsyncImage(url: URL(string: album.coverUrl)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .onAppear { extractColor(from: image) }
                default:
                    LinearGradient(
                        colors: [LabTokens.Colors.gradientStart, LabTokens.Colors.gradientEnd],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
            }
            .frame(width: geo.size.width, height: currentHeight + (scrollOffset > 0 ? scrollOffset : 0))
            .offset(y: parallaxOffset)
            .clipped()
        }
    }

    // MARK: - Cinematic Overlays

    private var cinematicOverlays: some View {
        ZStack {
            // Cinematic vignette
            CinematicVignette(intensity: 0.45)

            // Top gradient for navigation
            LinearGradient(
                colors: [.black.opacity(0.5), .clear],
                startPoint: .top,
                endPoint: .center
            )
            .frame(height: 150)
            .frame(maxHeight: .infinity, alignment: .top)

            // Film grain texture
            FilmGrain(intensity: 0.03)

            // Ambient color tint
            dominantColor.opacity(0.08)
                .blendMode(.overlay)

            // Depth blur at edges (top and bottom)
            VStack {
                LinearGradient(
                    colors: [.black.opacity(0.2), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 60)
                .blur(radius: 10)

                Spacer()

                LinearGradient(
                    colors: [.clear, .black.opacity(0.3)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 100)
                .blur(radius: 10)
            }
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            // Back button with soft glass
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background {
                        Circle()
                            .fill(.ultraThinMaterial.opacity(0.7))
                            .overlay {
                                Circle()
                                    .stroke(.white.opacity(0.2), lineWidth: 0.5)
                            }
                    }
            }

            Spacer()

            // Collapsed title
            if isCollapsed {
                Text(album.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }

            Spacer()

            // Menu button
            Button(action: onMenu) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background {
                        Circle()
                            .fill(.ultraThinMaterial.opacity(0.7))
                            .overlay {
                                Circle()
                                    .stroke(.white.opacity(0.2), lineWidth: 0.5)
                            }
                    }
            }
        }
        .padding(.horizontal, 16)
        .animation(CapsuleMotion.snap, value: isCollapsed)
    }

    // MARK: - Album Signature Bar

    private var albumSignatureBar: some View {
        VStack {
            Spacer()

            // Floating capsule that "rests" on the hero image
            VStack(alignment: .leading, spacing: 16) {
                // Title row
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        // Editorial headline
                        Text(album.title)
                            .font(.system(size: 26, weight: .semibold, design: .default))
                            .tracking(0.3)
                            .foregroundStyle(.white)

                        // Metadata as product label
                        MetadataCapsule(
                            photoCount: album.photoCount,
                            memberCount: album.memberCount,
                            dateRange: album.dateRange
                        )
                        .foregroundStyle(.white.opacity(0.8))
                    }

                    Spacer()
                }

                // Members + Action row
                HStack(spacing: 12) {
                    // Member avatars (overlapping)
                    memberAvatarsRow

                    Spacer()

                    // Floating action button
                    addPhotosButton
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
            .background {
                // Soft gradient glass background
                ZStack {
                    // Glass effect
                    SoftGradientGlass(tintColor: dominantColor, tintOpacity: 0.15)

                    // Bottom anchor shadow
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.1)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 24,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 24
                    )
                )
            }
        }
    }

    // MARK: - Member Avatars Row

    private var memberAvatarsRow: some View {
        HStack(spacing: -10) {
            ForEach(members.prefix(4)) { member in
                memberAvatar(member)
            }

            if members.count > 4 {
                Text("+\(members.count - 4)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay {
                        Circle()
                            .stroke(.white.opacity(0.3), lineWidth: 1)
                    }
            }
        }
    }

    private func memberAvatar(_ member: MockMember) -> some View {
        Group {
            if let avatarUrl = member.avatarUrl {
                AsyncImage(url: URL(string: avatarUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        initialsView(for: member.name)
                    }
                }
            } else {
                initialsView(for: member.name)
            }
        }
        .frame(width: 36, height: 36)
        .clipShape(Circle())
        .overlay {
            Circle()
                .stroke(.white, lineWidth: 2)
        }
    }

    private func initialsView(for name: String) -> some View {
        let initials = name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
        return ZStack {
            LabTokens.Colors.primaryGradient
            Text(initials)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
        }
    }

    // MARK: - Add Photos Button

    private var addPhotosButton: some View {
        Button { } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .semibold))
                Text("Add")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(LabTokens.Colors.primary, in: Capsule())
            .shadow(color: LabTokens.Colors.primary.opacity(0.4), radius: 8, y: 4)
        }
    }

    // MARK: - Color Extraction

    private func extractColor(from image: Image) {
        let renderer = ImageRenderer(content: image.resizable().frame(width: 50, height: 50))
        if let uiImage = renderer.uiImage {
            let extractor = AmbientColorExtractor()
            extractor.extract(from: uiImage)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.easeInOut(duration: 0.8)) {
                    self.dominantColor = extractor.dominantColor
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        VStack(spacing: 0) {
            ArchitecturalHeroHeader(
                album: MockAlbum.samples[0],
                members: MockMember.samples,
                scrollOffset: 0
            )

            Color(.systemBackground)
                .frame(height: 600)
        }
    }
    .ignoresSafeArea()
}
