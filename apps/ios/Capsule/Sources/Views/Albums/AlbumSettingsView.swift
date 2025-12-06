import SwiftUI

struct AlbumSettingsView: View {
    let album: Album
    let photos: [Photo]

    @EnvironmentObject var albumService: AlbumService
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var description: String
    @State private var privacyMode: AlbumPrivacyMode
    @State private var coverPhotoId: UUID?
    @State private var isSaving = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var showInviteSheet = false
    @State private var showCoverPhotoPicker = false
    @State private var error: String?

    init(album: Album, photos: [Photo] = []) {
        self.album = album
        self.photos = photos
        _title = State(initialValue: album.title)
        _description = State(initialValue: album.description ?? "")
        _privacyMode = State(initialValue: album.privacyMode)
        _coverPhotoId = State(initialValue: album.coverPhotoId)
    }

    var hasChanges: Bool {
        title != album.title ||
        description != (album.description ?? "") ||
        privacyMode != album.privacyMode ||
        coverPhotoId != album.coverPhotoId
    }

    private var coverPhoto: Photo? {
        photos.first { $0.id == coverPhotoId }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cover Photo") {
                    Button {
                        showCoverPhotoPicker = true
                    } label: {
                        HStack(spacing: 12) {
                            if let coverPhoto {
                                AsyncImage(url: coverPhoto.thumbnailUrl) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        Rectangle()
                                            .fill(Color(.systemGray5))
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

                            VStack(alignment: .leading) {
                                Text(coverPhoto != nil ? "Change Cover" : "Set Cover Photo")
                                    .foregroundStyle(.primary)
                                Text(photos.isEmpty ? "Add photos first" : "\(photos.count) photos available")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .disabled(photos.isEmpty)
                }

                Section("Details") {
                    TextField("Album Title", text: $title)

                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }

                Section("Privacy") {
                    Picker("Who can access", selection: $privacyMode) {
                        ForEach(AlbumPrivacyMode.allCases, id: \.self) { mode in
                            Text(mode.displayName).tag(mode)
                        }
                    }

                    Text(privacyMode.description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Sharing") {
                    Button {
                        showInviteSheet = true
                    } label: {
                        Label("Invite Members", systemImage: "person.badge.plus")
                    }

                    NavigationLink {
                        MembersListView(album: album)
                    } label: {
                        Label("View Members", systemImage: "person.2")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Album", systemImage: "trash")
                    }
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Album Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await saveChanges()
                        }
                    }
                    .disabled(!hasChanges || title.isEmpty || isSaving)
                }
            }
            .confirmationDialog(
                "Delete Album",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    Task {
                        await deleteAlbum()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete the album and all its photos. Original photos will remain in contributors' storage.")
            }
            .overlay {
                if isSaving || isDeleting {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView(isDeleting ? "Deleting..." : "Saving...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
            .sheet(isPresented: $showInviteSheet) {
                InviteSheet(album: album)
            }
            .sheet(isPresented: $showCoverPhotoPicker) {
                CoverPhotoPickerSheet(album: album, photos: photos) { selectedPhoto in
                    coverPhotoId = selectedPhoto?.id
                }
            }
        }
    }

    private func saveChanges() async {
        isSaving = true
        error = nil

        var updatedAlbum = album
        updatedAlbum.title = title
        updatedAlbum.description = description.isEmpty ? nil : description
        updatedAlbum.privacyMode = privacyMode
        updatedAlbum.coverPhotoId = coverPhotoId

        let success = await albumService.updateAlbum(updatedAlbum)

        isSaving = false

        if success {
            dismiss()
        } else if let serviceError = albumService.error {
            error = serviceError.localizedDescription
        } else {
            error = "Failed to save changes"
        }
    }

    private func deleteAlbum() async {
        isDeleting = true
        error = nil

        let success = await albumService.deleteAlbum(id: album.id)

        isDeleting = false

        if success {
            dismiss()
        } else if let serviceError = albumService.error {
            error = serviceError.localizedDescription
        } else {
            error = "Failed to delete album"
        }
    }
}

#Preview {
    AlbumSettingsView(
        album: Album(
            id: UUID(),
            ownerId: UUID(),
            title: "Test Album",
            description: "A test album",
            coverPhotoId: nil,
            privacyMode: .inviteOnly,
            createdAt: .now,
            updatedAt: .now
        ),
        photos: []
    )
    .environmentObject(AlbumService.shared)
}
