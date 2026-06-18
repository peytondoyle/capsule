import SwiftUI

// MARK: - Time Group Enum

enum TimeGroup: String, CaseIterable {
    case today = "Today"
    case yesterday = "Yesterday"
    case thisWeek = "This Week"
    case lastWeek = "Last Week"
    case thisMonth = "Earlier This Month"
    case lastMonth = "Last Month"
    case older = "Older"

    var sortOrder: Int {
        switch self {
        case .today: return 0
        case .yesterday: return 1
        case .thisWeek: return 2
        case .lastWeek: return 3
        case .thisMonth: return 4
        case .lastMonth: return 5
        case .older: return 6
        }
    }
}

// MARK: - Time Grouping Logic

struct TimeGrouping {
    static func group(_ photos: [Photo]) -> [(TimeGroup, [Photo])] {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)

        // Calculate date boundaries
        let startOfYesterday = calendar.date(byAdding: .day, value: -1, to: startOfToday)!
        let startOfThisWeek = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: now))!
        let startOfLastWeek = calendar.date(byAdding: .weekOfYear, value: -1, to: startOfThisWeek)!
        let startOfThisMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: now))!
        let startOfLastMonth = calendar.date(byAdding: .month, value: -1, to: startOfThisMonth)!

        var grouped: [TimeGroup: [Photo]] = [:]

        for photo in photos {
            let photoDate = photo.createdAt
            let group: TimeGroup

            if photoDate >= startOfToday {
                group = .today
            } else if photoDate >= startOfYesterday {
                group = .yesterday
            } else if photoDate >= startOfThisWeek {
                group = .thisWeek
            } else if photoDate >= startOfLastWeek {
                group = .lastWeek
            } else if photoDate >= startOfThisMonth {
                group = .thisMonth
            } else if photoDate >= startOfLastMonth {
                group = .lastMonth
            } else {
                group = .older
            }

            grouped[group, default: []].append(photo)
        }

        // Sort each group by date (newest first) and return sorted groups
        return grouped
            .map { (group, photos) in
                (group, photos.sorted { $0.createdAt > $1.createdAt })
            }
            .sorted { $0.0.sortOrder < $1.0.sortOrder }
    }
}

// MARK: - Section Header View

struct TimeGroupSectionHeader: View {
    let group: TimeGroup
    let photoCount: Int

    var body: some View {
        HStack {
            Text(group.rawValue)
                .font(.headline)
                .foregroundStyle(.primary)

            Spacer()

            Text("\(photoCount)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color(.systemGray5))
                .clipShape(Capsule())
        }
        .padding(.horizontal, CapsuleDesign.spacingLoose)
        .padding(.vertical, CapsuleDesign.spacingRelaxed)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
        )
    }
}

// MARK: - Time Grouped Photos View

struct TimeGroupedPhotosView: View {
    let photos: [Photo]
    let isSelectionMode: Bool
    @Binding var selectedPhotoIds: Set<UUID>
    let onPhotoTap: (Photo) -> Void
    let onLongPress: (Photo) -> Void

    private var groupedPhotos: [(TimeGroup, [Photo])] {
        TimeGrouping.group(photos)
    }

    var body: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let columns = 3
            let totalSpacing = spacing * CGFloat(columns - 1)
            let cellSize = (geo.size.width - totalSpacing) / CGFloat(columns)

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    ForEach(groupedPhotos, id: \.0) { group, photos in
                        Section {
                            LazyVGrid(
                                columns: Array(repeating: GridItem(.fixed(cellSize), spacing: spacing), count: columns),
                                spacing: spacing
                            ) {
                                ForEach(photos) { photo in
                                    TimeGroupedPhotoCell(
                                        photo: photo,
                                        size: cellSize,
                                        isSelectionMode: isSelectionMode,
                                        isSelected: selectedPhotoIds.contains(photo.id),
                                        onTap: {
                                            if isSelectionMode {
                                                toggleSelection(photo.id)
                                            } else {
                                                onPhotoTap(photo)
                                            }
                                        },
                                        onLongPress: {
                                            onLongPress(photo)
                                        }
                                    )
                                }
                            }
                        } header: {
                            TimeGroupSectionHeader(group: group, photoCount: photos.count)
                        }
                    }
                }
            }
        }
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

// MARK: - Time Grouped Photo Cell

struct TimeGroupedPhotoCell: View {
    let photo: Photo
    let size: CGFloat
    let isSelectionMode: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    var body: some View {
        Group {
            if isSelectionMode {
                selectionModeCell
            } else {
                normalModeCell
            }
        }
    }

    private var normalModeCell: some View {
        InteractivePhotoCell(photo: photo, size: size, onTap: onTap)
            .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall))
            .onLongPressGesture(minimumDuration: 0.5) {
                CapsuleHaptics.mediumTap()
                onLongPress()
            }
    }

    private var selectionModeCell: some View {
        PhotoThumbnailView(photo: photo)
            .frame(width: size, height: size)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall))
            .overlay {
                RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall)
                    .fill(isSelected ? Color.capsulePrimary.opacity(0.3) : Color.clear)
            }
            .overlay(alignment: .topTrailing) {
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
                .padding(6)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
            }
            .overlay {
                RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall)
                    .stroke(isSelected ? Color.capsulePrimary : Color.clear, lineWidth: 3)
            }
            .scaleEffect(isSelected ? 0.95 : 1.0)
            .animation(CapsuleDesign.animationQuick, value: isSelected)
            .onTapGesture {
                onTap()
            }
    }
}

// MARK: - Preview

#Preview {
    TimeGroupedPhotosView(
        photos: [],
        isSelectionMode: false,
        selectedPhotoIds: .constant([]),
        onPhotoTap: { _ in },
        onLongPress: { _ in }
    )
}
