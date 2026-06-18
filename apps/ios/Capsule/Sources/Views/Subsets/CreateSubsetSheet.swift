import SwiftUI

struct CreateSubsetSheet: View {
    let albumId: UUID
    let photos: [Photo]
    let onCreate: (Subset) -> Void
    var isPersonalPicks: Bool = false

    @StateObject private var subsetService = SubsetService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var selectedPhotoIds: Set<UUID> = []
    @State private var isCreating = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(isPersonalPicks ? "e.g., Favorites, To Print" : "e.g., Ceremony, Reception", text: $name)
                } header: {
                    Text("Name")
                } footer: {
                    Text(isPersonalPicks ? "Only you can see your picks" : "All album members can see this collection")
                        .foregroundStyle(isPersonalPicks ? .orange : .secondary)
                }

                Section("Select Photos (\(selectedPhotoIds.count))") {
                    if photos.isEmpty {
                        Text("No photos in this album yet")
                            .foregroundStyle(.secondary)
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 80), spacing: 4)
                        ], spacing: 4) {
                            ForEach(photos) { photo in
                                selectablePhotoCell(photo: photo)
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
            .navigationTitle(isPersonalPicks ? "New Picks" : "New Collection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await createSubset() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || selectedPhotoIds.isEmpty || isCreating)
                }
            }
            .overlay {
                if isCreating {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView("Creating...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    @ViewBuilder
    private func selectablePhotoCell(photo: Photo) -> some View {
        let isSelected = selectedPhotoIds.contains(photo.id)

        AsyncImage(url: photo.thumbnailUrl) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Color(.systemGray5)
            }
        }
        .frame(width: 80, height: 80)
        .clipped()
        .overlay {
            if isSelected {
                Color.black.opacity(0.3)
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.white)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture {
            if isSelected {
                selectedPhotoIds.remove(photo.id)
            } else {
                selectedPhotoIds.insert(photo.id)
            }
        }
    }

    private func createSubset() async {
        isCreating = true

        if let subset = await subsetService.createSubset(
            albumId: albumId,
            name: name.trimmingCharacters(in: .whitespaces),
            photoIds: Array(selectedPhotoIds),
            type: isPersonalPicks ? .personal : .internal,
            isPersonal: isPersonalPicks
        ) {
            onCreate(subset)
            dismiss()
        }

        isCreating = false
    }
}
