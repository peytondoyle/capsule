import SwiftUI

struct AlbumSettingsView: View {
    let album: Album

    @EnvironmentObject var albumService: AlbumService
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var description: String
    @State private var privacyMode: AlbumPrivacyMode
    @State private var isSaving = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var error: String?

    init(album: Album) {
        self.album = album
        _title = State(initialValue: album.title)
        _description = State(initialValue: album.description ?? "")
        _privacyMode = State(initialValue: album.privacyMode)
    }

    var hasChanges: Bool {
        title != album.title ||
        description != (album.description ?? "") ||
        privacyMode != album.privacyMode
    }

    var body: some View {
        NavigationStack {
            Form {
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
                        // TODO: Generate and share invite link
                    } label: {
                        Label("Invite Members", systemImage: "person.badge.plus")
                    }

                    NavigationLink {
                        // TODO: MembersListView
                        Text("Members")
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
        }
    }

    private func saveChanges() async {
        isSaving = true
        error = nil

        var updatedAlbum = album
        updatedAlbum.title = title
        updatedAlbum.description = description.isEmpty ? nil : description
        updatedAlbum.privacyMode = privacyMode

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
    AlbumSettingsView(album: Album(
        id: UUID(),
        ownerId: UUID(),
        title: "Test Album",
        description: "A test album",
        coverPhotoId: nil,
        privacyMode: .inviteOnly,
        createdAt: .now,
        updatedAt: .now
    ))
    .environmentObject(AlbumService.shared)
}
