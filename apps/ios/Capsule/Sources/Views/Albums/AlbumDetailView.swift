import SwiftUI
import PhotosUI

struct AlbumDetailView: View {
    let album: Album

    @StateObject private var photoService = PhotoService.shared
    @State private var photos: [Photo] = []
    @State private var isLoading = true
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showSettings = false
    @State private var selectedPhoto: Photo?

    let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 2)
    ]

    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView()
                    .padding(.top, 100)
            } else if photos.isEmpty {
                ContentUnavailableView {
                    Label("No Photos", systemImage: "photo")
                } description: {
                    Text("Add photos to start building your album")
                }
                .padding(.top, 50)
            } else {
                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(photos) { photo in
                        PhotoThumbnailView(photo: photo)
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                            .onTapGesture {
                                selectedPhoto = photo
                            }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .navigationTitle(album.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    PhotosPicker(
                        selection: $selectedPhotos,
                        maxSelectionCount: 50,
                        matching: .images
                    ) {
                        Label("Add Photos", systemImage: "photo.badge.plus")
                    }

                    Button {
                        showSettings = true
                    } label: {
                        Label("Album Settings", systemImage: "gearshape")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            AlbumSettingsView(album: album)
        }
        .sheet(item: $selectedPhoto) { photo in
            PhotoDetailView(photo: photo, albumId: album.id)
        }
        .task {
            await loadPhotos()
        }
        .onChange(of: selectedPhotos) { _, newValue in
            if !newValue.isEmpty {
                Task {
                    await uploadPhotos(newValue)
                    selectedPhotos = []
                }
            }
        }
        .overlay {
            if photoService.isUploading {
                uploadProgressOverlay
            }
        }
    }

    private var uploadProgressOverlay: some View {
        VStack(spacing: 16) {
            ProgressView(value: photoService.uploadProgress)
                .frame(width: 200)
            Text("Uploading...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .background(.regularMaterial)
        .cornerRadius(16)
    }

    private func loadPhotos() async {
        isLoading = true
        photos = await photoService.fetchPhotos(albumId: album.id)
        isLoading = false
    }

    private func uploadPhotos(_ items: [PhotosPickerItem]) async {
        let uploaded = await photoService.uploadPhotos(from: items, to: album.id)
        photos.insert(contentsOf: uploaded, at: 0)
    }
}

struct PhotoThumbnailView: View {
    let photo: Photo

    var body: some View {
        AsyncImage(url: photo.thumbnailUrl) { phase in
            switch phase {
            case .empty:
                Rectangle()
                    .fill(Color(.systemGray5))
                    .overlay {
                        ProgressView()
                    }
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure:
                Rectangle()
                    .fill(Color(.systemGray5))
                    .overlay {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(.secondary)
                    }
            @unknown default:
                EmptyView()
            }
        }
    }
}

#Preview {
    NavigationStack {
        AlbumDetailView(album: Album(
            id: UUID(),
            ownerId: UUID(),
            title: "Test Album",
            description: "A test album",
            coverPhotoId: nil,
            privacyMode: .inviteOnly,
            createdAt: .now,
            updatedAt: .now
        ))
    }
}
