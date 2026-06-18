import SwiftUI

struct SubsetsListView: View {
    let album: Album
    let photos: [Photo]

    @StateObject private var subsetService = SubsetService.shared
    @State private var subsets: [Subset] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var selectedSubset: Subset?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading collections...")
            } else if subsets.isEmpty {
                ContentUnavailableView {
                    Label("No Collections", systemImage: "rectangle.stack")
                } description: {
                    Text("Create collections to organize photos in this album")
                } actions: {
                    Button("Create Collection") {
                        showCreateSheet = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                List {
                    ForEach(subsets) { subset in
                        SubsetRowView(
                            subset: subset,
                            photos: photos.filter { subset.photoIds.contains($0.id) }
                        )
                        .onTapGesture {
                            selectedSubset = subset
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task {
                                    if await subsetService.deleteSubset(id: subset.id) {
                                        subsets.removeAll { $0.id == subset.id }
                                    }
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Collections")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateSubsetSheet(albumId: album.id, photos: photos) { newSubset in
                subsets.insert(newSubset, at: 0)
            }
        }
        .sheet(item: $selectedSubset) { subset in
            SubsetDetailSheet(
                subset: subset,
                allPhotos: photos,
                onUpdate: { updated in
                    if let index = subsets.firstIndex(where: { $0.id == updated.id }) {
                        subsets[index] = updated
                    }
                },
                onDelete: {
                    subsets.removeAll { $0.id == subset.id }
                }
            )
        }
        .task {
            await loadSubsets()
        }
        .refreshable {
            await loadSubsets()
        }
    }

    private func loadSubsets() async {
        isLoading = subsets.isEmpty
        subsets = await subsetService.fetchSubsets(albumId: album.id)
        isLoading = false
    }
}

struct SubsetRowView: View {
    let subset: Subset
    let photos: [Photo]

    var body: some View {
        HStack(spacing: 16) {
            // Thumbnail grid
            if photos.isEmpty {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.systemGray5))
                    .frame(width: 60, height: 60)
                    .overlay {
                        Image(systemName: "photo.stack")
                            .foregroundStyle(.secondary)
                    }
            } else {
                SubsetThumbnailGrid(photos: Array(photos.prefix(4)))
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(subset.name)
                    .font(.headline)

                HStack(spacing: 8) {
                    Label("\(photos.count)", systemImage: "photo")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if subset.isShareable {
                        Label("Shareable", systemImage: "link")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    } else if subset.isPersonal {
                        Label("Private", systemImage: "lock")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

struct SubsetThumbnailGrid: View {
    let photos: [Photo]

    var body: some View {
        GeometryReader { geo in
            let size = geo.size.width / 2
            VStack(spacing: 1) {
                HStack(spacing: 1) {
                    thumbnailCell(photo: photos[safe: 0], size: size)
                    thumbnailCell(photo: photos[safe: 1], size: size)
                }
                HStack(spacing: 1) {
                    thumbnailCell(photo: photos[safe: 2], size: size)
                    thumbnailCell(photo: photos[safe: 3], size: size)
                }
            }
        }
    }

    @ViewBuilder
    private func thumbnailCell(photo: Photo?, size: CGFloat) -> some View {
        if let photo {
            AsyncImage(url: photo.thumbnailUrl) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color(.systemGray5)
                }
            }
            .frame(width: size, height: size)
            .clipped()
        } else {
            Color(.systemGray5)
                .frame(width: size, height: size)
        }
    }
}

// Safe array subscript
extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
