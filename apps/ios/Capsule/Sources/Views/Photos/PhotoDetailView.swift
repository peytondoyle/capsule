import SwiftUI

struct PhotoDetailView: View {
    let photo: Photo
    let albumId: UUID

    @Environment(\.dismiss) private var dismiss
    @StateObject private var photoService = PhotoService.shared
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var isDownloading = false
    @State private var downloadError: String?

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack {
                        // Full-size image
                        AsyncImage(url: photo.thumbnailUrl) { phase in
                            switch phase {
                            case .empty:
                                Rectangle()
                                    .fill(Color(.systemGray5))
                                    .frame(height: geometry.size.height * 0.7)
                                    .overlay {
                                        ProgressView()
                                    }
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxHeight: geometry.size.height * 0.8)
                            case .failure:
                                Rectangle()
                                    .fill(Color(.systemGray5))
                                    .frame(height: geometry.size.height * 0.5)
                                    .overlay {
                                        VStack {
                                            Image(systemName: "exclamationmark.triangle")
                                                .font(.largeTitle)
                                            Text("Failed to load image")
                                                .font(.caption)
                                        }
                                        .foregroundStyle(.secondary)
                                    }
                            @unknown default:
                                EmptyView()
                            }
                        }

                        // Metadata
                        VStack(alignment: .leading, spacing: 12) {
                            if let width = photo.width, let height = photo.height {
                                HStack {
                                    Label("\(width) × \(height)", systemImage: "aspectratio")
                                    Spacer()
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }

                            if let size = photo.fileSizeBytes {
                                HStack {
                                    Label(formatFileSize(size), systemImage: "doc")
                                    Spacer()
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }

                            HStack {
                                Label(photo.createdAt.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                                Spacer()
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)

                            if photo.isHiddenByOwner {
                                Label("Hidden from non-admins", systemImage: "eye.slash")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }

                            if photo.isMissing {
                                Label("Original file unavailable", systemImage: "exclamationmark.triangle")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }

                            if let error = downloadError {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            Task {
                                await downloadPhoto()
                            }
                        } label: {
                            Label("Save to Photos", systemImage: "square.and.arrow.down")
                        }
                        .disabled(isDownloading || photo.isMissing)

                        ShareLink(item: photo.thumbnailUrl ?? URL(string: "about:blank")!) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }

                        Divider()

                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .confirmationDialog(
                "Delete Photo",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    Task {
                        await deletePhoto()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will remove the photo from this album. The original file in your iCloud Drive will not be affected.")
            }
            .overlay {
                if isDeleting {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView("Deleting...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }

                if isDownloading {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView("Downloading...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func downloadPhoto() async {
        isDownloading = true
        downloadError = nil

        // For now, download the thumbnail
        // TODO: Download original from iCloud Drive
        guard let url = photo.thumbnailUrl else {
            downloadError = "No image URL available"
            isDownloading = false
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let image = UIImage(data: data) else {
                downloadError = "Failed to process image"
                isDownloading = false
                return
            }

            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
        } catch {
            downloadError = error.localizedDescription
        }

        isDownloading = false
    }

    private func deletePhoto() async {
        isDeleting = true

        let success = await photoService.deletePhoto(id: photo.id)

        isDeleting = false

        if success {
            dismiss()
        }
    }
}

#Preview {
    PhotoDetailView(
        photo: Photo(
            id: UUID(),
            albumId: UUID(),
            uploaderId: UUID(),
            originalUri: "test.jpg",
            originalStorageType: .icloudDrive,
            thumbnailPath: "test/test.jpg",
            mediaType: .photo,
            fileSizeBytes: 1024000,
            width: 1920,
            height: 1080,
            isHiddenByOwner: false,
            isMissing: false,
            exifData: nil,
            createdAt: .now
        ),
        albumId: UUID()
    )
}
