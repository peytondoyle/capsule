import SwiftUI

// MARK: - Capsule Album Card

/// A tall, modern album card with full-bleed cover photo,
/// gradient overlay, and metadata. Features microinteractions
/// and staggered appearance animations.

struct CapsuleAlbumCard: View {
    let album: MockAlbum
    let index: Int
    var onTap: () -> Void = {}

    @State private var isPressed = false
    @State private var isVisible = false

    private let cardHeight: CGFloat = 280

    var body: some View {
        Button {
            onTap()
        } label: {
            cardContent
        }
        .buttonStyle(CardPressStyle())
        .opacity(isVisible ? 1 : 0)
        .scaleEffect(isVisible ? 1 : 0.92)
        .onAppear {
            withAnimation(LabTokens.Animation.smooth.delay(Double(index) * 0.08)) {
                isVisible = true
            }
        }
    }

    private var cardContent: some View {
        ZStack(alignment: .bottomLeading) {
            // Cover photo
            AsyncImage(url: URL(string: album.coverUrl)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    placeholderGradient
                case .empty:
                    placeholderGradient
                        .overlay {
                            ProgressView()
                                .tint(.white)
                        }
                @unknown default:
                    placeholderGradient
                }
            }
            .frame(height: cardHeight)
            .clipped()

            // Gradient overlay
            LinearGradient(
                colors: [
                    .clear,
                    .clear,
                    .black.opacity(0.3),
                    .black.opacity(0.7)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content overlay
            VStack(alignment: .leading, spacing: LabTokens.Spacing.xs) {
                Spacer()

                // Title
                Text(album.title)
                    .labFont(.cardTitle)
                    .foregroundStyle(.white)
                    .lineLimit(2)

                // Metadata row
                HStack(spacing: LabTokens.Spacing.md) {
                    // Photo count
                    Label("\(album.photoCount)", systemImage: "photo")
                        .labFont(.metadata)

                    // Members
                    Label("\(album.memberCount)", systemImage: "person.2")
                        .labFont(.metadata)

                    Spacer()

                    // Date range pill
                    Text(album.dateRange)
                        .labFont(.caption)
                        .padding(.horizontal, LabTokens.Spacing.xs)
                        .padding(.vertical, LabTokens.Spacing.xxs)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .foregroundStyle(.white.opacity(0.9))
            }
            .padding(LabTokens.Spacing.md)

            // Privacy indicator
            VStack {
                HStack {
                    Spacer()

                    Image(systemName: album.privacy == "Private" ? "lock.fill" : "person.2.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .padding(LabTokens.Spacing.xs)
                        .background(.ultraThinMaterial, in: Circle())
                }
                Spacer()
            }
            .padding(LabTokens.Spacing.sm)
        }
        .frame(height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: LabTokens.Radius.xl))
        .labElevation(.medium)
    }

    private var placeholderGradient: some View {
        LinearGradient(
            colors: [LabTokens.Colors.gradientStart, LabTokens.Colors.gradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Card Press Style

private struct CardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(LabTokens.Animation.quick, value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        VStack(spacing: LabTokens.Spacing.md) {
            ForEach(Array(MockAlbum.samples.enumerated()), id: \.element.id) { index, album in
                CapsuleAlbumCard(album: album, index: index)
            }
        }
        .padding()
    }
    .background(Color(.systemGroupedBackground))
}
