import SwiftUI

// MARK: - Signature Album Card v2
// A truly distinctive album card that breaks from generic patterns:
// - Visible asymmetric shape with dramatic corner difference
// - Floating accent bar with brand color
// - Contributor avatars that break the card boundary
// - Layered depth with visible shadows
// - Inner border glow for premium feel

struct LabSignatureAlbumCard: View {
    let album: MockAlbum
    let index: Int
    var onTap: () -> Void = {}

    @State private var isVisible = false
    @State private var isPressed = false

    private let cardHeight: CGFloat = 280

    var body: some View {
        Button(action: onTap) {
            cardStack
        }
        .buttonStyle(LiftButtonStyle())
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
        AsyncImage(url: URL(string: album.coverUrl)) { phase in
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
    }

    // MARK: - Accent Bar (Signature Element)

    private var accentBar: some View {
        // Vertical gradient bar on left edge
        LinearGradient(
            colors: [
                Color(red: 0.5, green: 0.4, blue: 0.95),  // Light purple
                Color(red: 0.35, green: 0.25, blue: 0.85) // Deep purple
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
            Text(album.title)
                .font(.system(size: 22, weight: .semibold, design: .default))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.5), radius: 4, y: 2)

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

                // Date range
                Text(album.dateRange)
                    .font(.system(size: 14, weight: .medium))
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
        ["S", "M", "J", "A"][index % 4]
    }

    // MARK: - Privacy Badge

    private var privacyBadge: some View {
        Image(systemName: album.privacy == "Private" ? "lock.fill" : "person.2.fill")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.9))
            .padding(8)
            .background(.ultraThinMaterial.opacity(0.6), in: Circle())
            .overlay(
                Circle()
                    .stroke(.white.opacity(0.2), lineWidth: 0.5)
            )
    }
}

// MARK: - Lift Button Style

struct LiftButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        VStack(spacing: 24) {
            ForEach(Array(MockAlbum.samples.enumerated()), id: \.element.id) { index, album in
                LabSignatureAlbumCard(album: album, index: index) {
                    print("Tapped: \(album.title)")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }
    .background(Color(.systemGroupedBackground))
}
