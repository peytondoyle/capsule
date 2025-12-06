import SwiftUI

struct CoverPhotoPickerSheet: View {
    let album: Album
    let photos: [Photo]
    let onSelect: (Photo?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhotoId: UUID?

    private let columns = [
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2)
    ]

    init(album: Album, photos: [Photo], onSelect: @escaping (Photo?) -> Void) {
        self.album = album
        self.photos = photos
        self.onSelect = onSelect
        _selectedPhotoId = State(initialValue: album.coverPhotoId)
    }

    var body: some View {
        NavigationStack {
            Group {
                if photos.isEmpty {
                    ContentUnavailableView(
                        "No Photos",
                        systemImage: "photo.on.rectangle.angled",
                        description: Text("Add photos to your album first to set a cover photo.")
                    )
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 2) {
                            // "No cover" option
                            Button {
                                selectedPhotoId = nil
                            } label: {
                                ZStack {
                                    Rectangle()
                                        .fill(Color(.systemGray5))
                                        .aspectRatio(1, contentMode: .fill)

                                    VStack(spacing: 4) {
                                        Image(systemName: "photo.badge.minus")
                                            .font(.title2)
                                        Text("None")
                                            .font(.caption)
                                    }
                                    .foregroundStyle(.secondary)

                                    if selectedPhotoId == nil {
                                        selectionOverlay
                                    }
                                }
                            }
                            .buttonStyle(.plain)

                            // Photo options
                            ForEach(photos) { photo in
                                Button {
                                    selectedPhotoId = photo.id
                                } label: {
                                    ZStack {
                                        AsyncImage(url: photo.thumbnailUrl) { phase in
                                            switch phase {
                                            case .empty:
                                                Rectangle()
                                                    .fill(Color(.systemGray5))
                                                    .aspectRatio(1, contentMode: .fill)
                                                    .overlay {
                                                        ProgressView()
                                                    }
                                            case .success(let image):
                                                image
                                                    .resizable()
                                                    .scaledToFill()
                                                    .aspectRatio(1, contentMode: .fill)
                                                    .clipped()
                                            case .failure:
                                                Rectangle()
                                                    .fill(Color(.systemGray5))
                                                    .aspectRatio(1, contentMode: .fill)
                                                    .overlay {
                                                        Image(systemName: "exclamationmark.triangle")
                                                            .foregroundStyle(.secondary)
                                                    }
                                            @unknown default:
                                                EmptyView()
                                            }
                                        }

                                        if selectedPhotoId == photo.id {
                                            selectionOverlay
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2)
                    }
                }
            }
            .navigationTitle("Cover Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        let selectedPhoto = photos.first { $0.id == selectedPhotoId }
                        onSelect(selectedPhoto)
                        dismiss()
                    }
                    .disabled(selectedPhotoId == album.coverPhotoId)
                }
            }
        }
    }

    private var selectionOverlay: some View {
        ZStack {
            Color.black.opacity(0.3)

            Image(systemName: "checkmark.circle.fill")
                .font(.title)
                .foregroundStyle(.white)
        }
    }
}

#Preview {
    CoverPhotoPickerSheet(
        album: Album(
            id: UUID(),
            ownerId: UUID(),
            title: "Test Album",
            description: nil,
            coverPhotoId: nil,
            privacyMode: .inviteOnly,
            createdAt: .now,
            updatedAt: .now
        ),
        photos: []
    ) { _ in }
}
