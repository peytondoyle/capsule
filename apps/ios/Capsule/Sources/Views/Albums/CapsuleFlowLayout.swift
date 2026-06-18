import SwiftUI

// MARK: - Capsule Flow Layout

/// Signature Capsule layout with alternating patterns:
/// - Full-width hero photos
/// - 2-up square grids
/// - Wide landscape strips
/// - Asymmetric 1+2 layouts
struct CapsuleFlowLayout: View {
    let photos: [Photo]
    let isSelectionMode: Bool
    @Binding var selectedPhotoIds: Set<UUID>
    let onPhotoTap: (Photo) -> Void
    let onLongPress: (Photo) -> Void

    private let spacing: CGFloat = CapsuleDesign.spacingNormal

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width - spacing * 2

            ScrollView {
                LazyVStack(spacing: spacing) {
                    ForEach(Array(layoutSections(for: width).enumerated()), id: \.offset) { index, section in
                        section
                    }
                }
                .padding(.horizontal, spacing)
                .padding(.vertical, spacing)
            }
        }
    }

    // MARK: - Layout Generation

    private func layoutSections(for width: CGFloat) -> [AnyView] {
        var sections: [AnyView] = []
        var index = 0
        var patternIndex = 0

        // Pattern cycle: hero -> 2-up -> wide -> asymmetric -> 2-up
        let patterns: [LayoutPattern] = [.hero, .twoUp, .wide, .asymmetric, .twoUp]

        while index < photos.count {
            let pattern = patterns[patternIndex % patterns.count]
            let photosNeeded = pattern.photosNeeded
            let remaining = photos.count - index

            // Get photos for this section
            let sectionPhotos = Array(photos[index..<min(index + photosNeeded, photos.count)])

            // Create the section based on pattern
            let section = createSection(
                pattern: remaining >= photosNeeded ? pattern : .flexible(remaining),
                photos: sectionPhotos,
                width: width
            )
            sections.append(section)

            index += sectionPhotos.count
            patternIndex += 1
        }

        return sections
    }

    private func createSection(pattern: LayoutPattern, photos: [Photo], width: CGFloat) -> AnyView {
        switch pattern {
        case .hero:
            return AnyView(heroSection(photo: photos[0], width: width))

        case .twoUp:
            return AnyView(twoUpSection(photos: photos, width: width))

        case .wide:
            return AnyView(wideSection(photo: photos[0], width: width))

        case .asymmetric:
            return AnyView(asymmetricSection(photos: photos, width: width))

        case .flexible(let count):
            return AnyView(flexibleSection(photos: photos, count: count, width: width))
        }
    }

    // MARK: - Section Views

    /// Full-width hero photo with gradient overlay
    private func heroSection(photo: Photo, width: CGFloat) -> some View {
        let height = heightForPhoto(photo, targetWidth: width, minRatio: 0.5, maxRatio: 0.75)

        return CapsuleFlowCell(
            photo: photo,
            width: width,
            height: height,
            isSelectionMode: isSelectionMode,
            isSelected: selectedPhotoIds.contains(photo.id),
            onTap: {
                if isSelectionMode {
                    toggleSelection(photo.id)
                } else {
                    onPhotoTap(photo)
                }
            },
            onLongPress: { onLongPress(photo) }
        )
        .overlay(alignment: .bottomLeading) {
            if !isSelectionMode {
                heroOverlay(for: photo)
            }
        }
    }

    private func heroOverlay(for photo: Photo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Spacer()

            LinearGradient(
                colors: [.clear, .black.opacity(0.6)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 80)

            HStack {
                Text(photo.createdAt, style: .date)
                    .font(.subheadline.weight(.medium))

                Spacer()

                if photo.mediaType == .video {
                    Label("Video", systemImage: "play.fill")
                        .font(.caption)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, CapsuleDesign.spacingLoose)
            .padding(.bottom, CapsuleDesign.spacingRelaxed)
        }
    }

    /// Two equal squares side by side
    private func twoUpSection(photos: [Photo], width: CGFloat) -> some View {
        let cellSize = (width - spacing) / 2

        return HStack(spacing: spacing) {
            ForEach(photos.prefix(2)) { photo in
                CapsuleFlowCell(
                    photo: photo,
                    width: cellSize,
                    height: cellSize,
                    isSelectionMode: isSelectionMode,
                    isSelected: selectedPhotoIds.contains(photo.id),
                    onTap: {
                        if isSelectionMode {
                            toggleSelection(photo.id)
                        } else {
                            onPhotoTap(photo)
                        }
                    },
                    onLongPress: { onLongPress(photo) }
                )
            }

            // Fill remaining space if only 1 photo
            if photos.count < 2 {
                Spacer()
                    .frame(width: cellSize, height: cellSize)
            }
        }
    }

    /// Wide landscape strip
    private func wideSection(photo: Photo, width: CGFloat) -> some View {
        let height: CGFloat = 160

        return CapsuleFlowCell(
            photo: photo,
            width: width,
            height: height,
            isSelectionMode: isSelectionMode,
            isSelected: selectedPhotoIds.contains(photo.id),
            onTap: {
                if isSelectionMode {
                    toggleSelection(photo.id)
                } else {
                    onPhotoTap(photo)
                }
            },
            onLongPress: { onLongPress(photo) }
        )
    }

    /// Asymmetric: 1 large + 2 stacked small
    private func asymmetricSection(photos: [Photo], width: CGFloat) -> some View {
        let largeWidth = width * 0.65 - spacing / 2
        let smallWidth = width * 0.35 - spacing / 2
        let totalHeight: CGFloat = 240
        let smallHeight = (totalHeight - spacing) / 2

        return HStack(alignment: .top, spacing: spacing) {
            // Large photo
            if let first = photos.first {
                CapsuleFlowCell(
                    photo: first,
                    width: largeWidth,
                    height: totalHeight,
                    isSelectionMode: isSelectionMode,
                    isSelected: selectedPhotoIds.contains(first.id),
                    onTap: {
                        if isSelectionMode {
                            toggleSelection(first.id)
                        } else {
                            onPhotoTap(first)
                        }
                    },
                    onLongPress: { onLongPress(first) }
                )
            }

            // Stacked small photos
            VStack(spacing: spacing) {
                ForEach(photos.dropFirst().prefix(2)) { photo in
                    CapsuleFlowCell(
                        photo: photo,
                        width: smallWidth,
                        height: smallHeight,
                        isSelectionMode: isSelectionMode,
                        isSelected: selectedPhotoIds.contains(photo.id),
                        onTap: {
                            if isSelectionMode {
                                toggleSelection(photo.id)
                            } else {
                                onPhotoTap(photo)
                            }
                        },
                        onLongPress: { onLongPress(photo) }
                    )
                }

                // Fill if less than 2 stacked
                if photos.count < 3 {
                    Spacer()
                        .frame(width: smallWidth, height: smallHeight)
                }
            }
        }
    }

    /// Flexible layout for remaining photos
    private func flexibleSection(photos: [Photo], count: Int, width: CGFloat) -> some View {
        let columns = min(count, 3)
        let cellSize = (width - spacing * CGFloat(columns - 1)) / CGFloat(columns)

        return HStack(spacing: spacing) {
            ForEach(photos) { photo in
                CapsuleFlowCell(
                    photo: photo,
                    width: cellSize,
                    height: cellSize,
                    isSelectionMode: isSelectionMode,
                    isSelected: selectedPhotoIds.contains(photo.id),
                    onTap: {
                        if isSelectionMode {
                            toggleSelection(photo.id)
                        } else {
                            onPhotoTap(photo)
                        }
                    },
                    onLongPress: { onLongPress(photo) }
                )
            }

            // Fill remaining space
            if count < 3 {
                Spacer()
            }
        }
    }

    // MARK: - Helpers

    private func heightForPhoto(_ photo: Photo, targetWidth: CGFloat, minRatio: CGFloat, maxRatio: CGFloat) -> CGFloat {
        guard let photoWidth = photo.width, let photoHeight = photo.height, photoWidth > 0 else {
            return targetWidth * 0.6
        }
        let ratio = CGFloat(photoHeight) / CGFloat(photoWidth)
        let clampedRatio = min(max(ratio, minRatio), maxRatio)
        return targetWidth * clampedRatio
    }

    private func toggleSelection(_ id: UUID) {
        CapsuleHaptics.selection()
        if selectedPhotoIds.contains(id) {
            selectedPhotoIds.remove(id)
        } else {
            selectedPhotoIds.insert(id)
        }
    }
}

// MARK: - Layout Pattern

private enum LayoutPattern {
    case hero        // 1 photo, full width
    case twoUp       // 2 photos, side by side squares
    case wide        // 1 photo, wide landscape strip
    case asymmetric  // 3 photos, 1 large + 2 stacked
    case flexible(Int)  // Remaining photos

    var photosNeeded: Int {
        switch self {
        case .hero: return 1
        case .twoUp: return 2
        case .wide: return 1
        case .asymmetric: return 3
        case .flexible(let count): return count
        }
    }
}

// MARK: - Capsule Flow Cell

struct CapsuleFlowCell: View {
    let photo: Photo
    let width: CGFloat
    let height: CGFloat
    let isSelectionMode: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Photo
            PhotoThumbnailView(photo: photo)
                .frame(width: width, height: height)
                .clipped()

            // Video indicator
            if photo.mediaType == .video && !isSelectionMode {
                HStack {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 4)
                    Spacer()
                }
                .padding(CapsuleDesign.spacingNormal)
            }

            // Selection overlay
            if isSelectionMode {
                selectionOverlay
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
        .capsuleShadow(.subtle)
        .scaleEffect(isSelectionMode && isSelected ? 0.96 : 1.0)
        .animation(CapsuleDesign.animationQuick, value: isSelected)
        .onTapGesture {
            onTap()
        }
        .onLongPressGesture(minimumDuration: 0.5) {
            CapsuleHaptics.mediumTap()
            onLongPress()
        }
    }

    private var selectionOverlay: some View {
        ZStack {
            // Tint overlay
            RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium)
                .fill(isSelected ? Color.capsulePrimary.opacity(0.3) : Color.clear)

            // Selection indicator
            VStack {
                HStack {
                    Spacer()
                    ZStack {
                        Circle()
                            .fill(isSelected ? Color.capsulePrimary : Color.black.opacity(0.4))
                            .frame(width: 28, height: 28)

                        if isSelected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                    .padding(CapsuleDesign.spacingNormal)
                }
                Spacer()
            }

            // Border
            RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium)
                .stroke(isSelected ? Color.capsulePrimary : Color.clear, lineWidth: 3)
        }
    }
}

// MARK: - Preview

#Preview {
    CapsuleFlowLayout(
        photos: [],
        isSelectionMode: false,
        selectedPhotoIds: .constant([]),
        onPhotoTap: { _ in },
        onLongPress: { _ in }
    )
}
