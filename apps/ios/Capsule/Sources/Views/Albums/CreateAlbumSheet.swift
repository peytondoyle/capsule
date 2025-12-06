import SwiftUI

struct CreateAlbumSheet: View {
    @EnvironmentObject var albumService: AlbumService
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var description = ""
    @State private var privacyMode: AlbumPrivacyMode = .inviteOnly
    @State private var isCreating = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
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

                if let error {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("New Album")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await createAlbum()
                        }
                    }
                    .disabled(title.isEmpty || isCreating)
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

    private func createAlbum() async {
        isCreating = true
        error = nil

        let album = await albumService.createAlbum(
            title: title,
            description: description.isEmpty ? nil : description,
            privacyMode: privacyMode
        )

        isCreating = false

        if album != nil {
            dismiss()
        } else if let serviceError = albumService.error {
            error = serviceError.localizedDescription
        } else {
            error = "Failed to create album"
        }
    }
}

#Preview {
    CreateAlbumSheet()
        .environmentObject(AlbumService.shared)
}
