import SwiftUI

// MARK: - Memory Tile Grid

/// Modern photo grid with multiple layout modes (grid, flow, mosaic).
/// Features rounded tiles, elevation, staggered fade-in, and ripple press.

struct MemoryTileGrid: View {
    let photos: [MockPhoto]
    let layout: LabLayout
    var onPhotoTap: (MockPhoto) -> Void = { _ in }

    var body: some View {
        switch layout {
        case .grid:
            gridLayout
        case .flow:
            flowLayout
        case .mosaic:
            mosaicLayout
        }
    }

    // MARK: - Grid Layout (3 columns)

    private var gridLayout: some View {
        LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: LabTokens.Spacing.xxs),
                GridItem(.flexible(), spacing: LabTokens.Spacing.xxs),
                GridItem(.flexible(), spacing: LabTokens.Spacing.xxs)
            ],
            spacing: LabTokens.Spacing.xxs
        ) {
            ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                MemoryTile(photo: photo, index: index, aspectRatio: 1.0) {
                    onPhotoTap(photo)
                }
            }
        }
        .padding(.horizontal, LabTokens.Spacing.xxs)
    }

    // MARK: - Flow Layout (Pinterest-style)

    private var flowLayout: some View {
        let columns = 2
        let columnPhotos = distributePhotos(photos, into: columns)

        return HStack(alignment: .top, spacing: LabTokens.Spacing.xs) {
            ForEach(0..<columns, id: \.self) { column in
                LazyVStack(spacing: LabTokens.Spacing.xs) {
                    ForEach(Array(columnPhotos[column].enumerated()), id: \.element.id) { index, photo in
                        MemoryTile(
                            photo: photo,
                            index: column * 10 + index,
                            aspectRatio: photo.aspectRatio
                        ) {
                            onPhotoTap(photo)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, LabTokens.Spacing.sm)
    }

    // MARK: - Mosaic Layout (Featured + grid mix)

    private var mosaicLayout: some View {
        LazyVStack(spacing: LabTokens.Spacing.xs) {
            ForEach(Array(stride(from: 0, to: photos.count, by: 5)), id: \.self) { startIndex in
                mosaicSection(startIndex: startIndex)
            }
        }
        .padding(.horizontal, LabTokens.Spacing.sm)
    }

    @ViewBuilder
    private func mosaicSection(startIndex: Int) -> some View {
        let sectionPhotos = Array(photos[startIndex..<min(startIndex + 5, photos.count)])

        if sectionPhotos.count >= 5 {
            // Full mosaic pattern
            VStack(spacing: LabTokens.Spacing.xs) {
                HStack(spacing: LabTokens.Spacing.xs) {
                    // Large featured photo
                    MemoryTile(
                        photo: sectionPhotos[0],
                        index: startIndex,
                        aspectRatio: 1.0,
                        size: .large
                    ) {
                        onPhotoTap(sectionPhotos[0])
                    }
                    .frame(maxWidth: .infinity)

                    // Two stacked photos
                    VStack(spacing: LabTokens.Spacing.xs) {
                        MemoryTile(
                            photo: sectionPhotos[1],
                            index: startIndex + 1,
                            aspectRatio: 1.5
                        ) {
                            onPhotoTap(sectionPhotos[1])
                        }

                        MemoryTile(
                            photo: sectionPhotos[2],
                            index: startIndex + 2,
                            aspectRatio: 1.5
                        ) {
                            onPhotoTap(sectionPhotos[2])
                        }
                    }
                    .frame(maxWidth: .infinity)
                }

                HStack(spacing: LabTokens.Spacing.xs) {
                    MemoryTile(
                        photo: sectionPhotos[3],
                        index: startIndex + 3,
                        aspectRatio: 1.5
                    ) {
                        onPhotoTap(sectionPhotos[3])
                    }

                    MemoryTile(
                        photo: sectionPhotos[4],
                        index: startIndex + 4,
                        aspectRatio: 1.5
                    ) {
                        onPhotoTap(sectionPhotos[4])
                    }
                }
            }
        } else {
            // Fallback for remaining photos
            HStack(spacing: LabTokens.Spacing.xs) {
                ForEach(Array(sectionPhotos.enumerated()), id: \.element.id) { index, photo in
                    MemoryTile(
                        photo: photo,
                        index: startIndex + index,
                        aspectRatio: 1.0
                    ) {
                        onPhotoTap(photo)
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func distributePhotos(_ photos: [MockPhoto], into columns: Int) -> [[MockPhoto]] {
        var result = Array(repeating: [MockPhoto](), count: columns)
        var heights = Array(repeating: CGFloat(0), count: columns)

        for photo in photos {
            let shortestColumn = heights.enumerated().min(by: { $0.element < $1.element })?.offset ?? 0
            result[shortestColumn].append(photo)
            heights[shortestColumn] += 1 / photo.aspectRatio
        }

        return result
    }
}

// MARK: - Memory Tile

struct MemoryTile: View {
    let photo: MockPhoto
    let index: Int
    let aspectRatio: CGFloat
    var size: TileSize = .regular
    var onTap: () -> Void = {}

    @State private var isVisible = false
    @State private var isPressed = false

    enum TileSize {
        case regular, large

        var cornerRadius: CGFloat {
            switch self {
            case .regular: return LabTokens.Radius.md
            case .large: return LabTokens.Radius.lg
            }
        }
    }

    var body: some View {
        Button {
            onTap()
        } label: {
            AsyncImage(url: URL(string: photo.thumbnailUrl)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    placeholderView
                case .empty:
                    placeholderView
                        .overlay { ProgressView().tint(.secondary) }
                @unknown default:
                    placeholderView
                }
            }
            .aspectRatio(aspectRatio, contentMode: .fill)
            .clipShape(RoundedRectangle(cornerRadius: size.cornerRadius))
            .labElevation(.low)
        }
        .buttonStyle(TilePressStyle(cornerRadius: size.cornerRadius))
        .opacity(isVisible ? 1 : 0)
        .scaleEffect(isVisible ? 1 : 0.95)
        .onAppear {
            withAnimation(LabTokens.Animation.smooth.delay(Double(index) * 0.03)) {
                isVisible = true
            }
        }
    }

    private var placeholderView: some View {
        Rectangle()
            .fill(Color(.systemGray5))
    }
}

// MARK: - Tile Press Style (Ripple effect)

private struct TilePressStyle: ButtonStyle {
    let cornerRadius: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay {
                if configuration.isPressed {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .fill(.white.opacity(0.2))
                        .transition(.opacity)
                }
            }
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(LabTokens.Animation.quick, value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        VStack(spacing: LabTokens.Spacing.xl) {
            Text("Grid Layout")
                .labFont(.cardTitle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)

            MemoryTileGrid(
                photos: Array(MockPhoto.generateSamples().prefix(12)),
                layout: .grid
            )

            Text("Flow Layout")
                .labFont(.cardTitle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)

            MemoryTileGrid(
                photos: Array(MockPhoto.generateSamples().prefix(10)),
                layout: .flow
            )

            Text("Mosaic Layout")
                .labFont(.cardTitle)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)

            MemoryTileGrid(
                photos: Array(MockPhoto.generateSamples().prefix(10)),
                layout: .mosaic
            )
        }
        .padding(.vertical)
    }
}
