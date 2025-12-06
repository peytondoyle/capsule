import SwiftUI

struct AlbumsListView: View {
    @EnvironmentObject var albumService: AlbumService
    @State private var showCreateAlbum = false

    var body: some View {
        NavigationStack {
            Group {
                if albumService.isLoading && albumService.albums.isEmpty {
                    ProgressView("Loading albums...")
                } else if albumService.albums.isEmpty {
                    ContentUnavailableView {
                        Label("No Albums", systemImage: "photo.on.rectangle.angled")
                    } description: {
                        Text("Create your first album to start sharing photos")
                    } actions: {
                        Button("Create Album") {
                            showCreateAlbum = true
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        ForEach(albumService.albums) { album in
                            NavigationLink(value: album) {
                                AlbumRowView(
                                    album: album,
                                    coverPhotoUrl: albumService.coverPhotoUrls[album.id]
                                )
                            }
                        }
                    }
                    .refreshable {
                        await albumService.fetchUserAlbums()
                    }
                }
            }
            .navigationTitle("Albums")
            .navigationDestination(for: Album.self) { album in
                AlbumDetailView(album: album)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateAlbum = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateAlbum) {
                CreateAlbumSheet()
            }
        }
        .task {
            await albumService.fetchUserAlbums()
        }
    }
}

struct AlbumRowView: View {
    let album: Album
    let coverPhotoUrl: URL?

    var body: some View {
        HStack(spacing: 16) {
            // Cover photo or placeholder
            if let coverUrl = coverPhotoUrl {
                AsyncImage(url: coverUrl) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Color(.systemGray5)
                            .overlay {
                                Image(systemName: "photo")
                                    .foregroundStyle(.secondary)
                            }
                    }
                }
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.systemGray5))
                    .frame(width: 60, height: 60)
                    .overlay {
                        Image(systemName: "photo")
                            .foregroundStyle(.secondary)
                    }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(album.title)
                    .font(.headline)

                if let description = album.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(spacing: 8) {
                    Label(album.privacyMode.displayName, systemImage: privacyIcon)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var privacyIcon: String {
        switch album.privacyMode {
        case .inviteOnly: return "lock"
        case .linkAccessible: return "link"
        case .publicUnlisted: return "globe"
        }
    }
}

#Preview {
    AlbumsListView()
        .environmentObject(AlbumService.shared)
}
