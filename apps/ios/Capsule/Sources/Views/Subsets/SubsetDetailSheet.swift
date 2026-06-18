import SwiftUI

struct SubsetDetailSheet: View {
    @State var subset: Subset
    let allPhotos: [Photo]
    let onUpdate: (Subset) -> Void
    let onDelete: () -> Void

    @StateObject private var subsetService = SubsetService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var isEditingName = false
    @State private var editedName = ""
    @State private var selectedPhoto: Photo?
    @State private var showShareSheet = false
    @State private var showDeleteConfirmation = false

    private var subsetPhotos: [Photo] {
        allPhotos.filter { subset.photoIds.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header with share button for shareable subsets
                    if subset.isShareable, let token = subset.shareToken {
                        shareHeader(token: token)
                    }

                    // Photos grid
                    if subsetPhotos.isEmpty {
                        ContentUnavailableView {
                            Label("No Photos", systemImage: "photo")
                        } description: {
                            Text("This collection is empty")
                        }
                        .frame(height: 200)
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 100), spacing: 2)
                        ], spacing: 2) {
                            ForEach(subsetPhotos) { photo in
                                AsyncImage(url: photo.thumbnailUrl) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image.resizable().scaledToFill()
                                    default:
                                        Color(.systemGray5)
                                    }
                                }
                                .frame(minHeight: 100)
                                .aspectRatio(1, contentMode: .fill)
                                .clipped()
                                .onTapGesture {
                                    selectedPhoto = photo
                                }
                            }
                        }
                        .padding(.horizontal)
                    }

                    // Info section
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Label("\(subsetPhotos.count) photos", systemImage: "photo")
                            Spacer()
                        }

                        HStack {
                            Label("Created \(subset.createdAt.formatted(date: .abbreviated, time: .omitted))", systemImage: "calendar")
                            Spacer()
                        }

                        if subset.isPersonal {
                            HStack {
                                Label("Only visible to you", systemImage: "lock")
                                    .foregroundStyle(.orange)
                                Spacer()
                            }
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle(subset.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            editedName = subset.name
                            isEditingName = true
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }

                        if subset.isShareable {
                            Button {
                                showShareSheet = true
                            } label: {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                        }

                        Divider()

                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete Collection", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .alert("Rename Collection", isPresented: $isEditingName) {
                TextField("Name", text: $editedName)
                Button("Cancel", role: .cancel) {}
                Button("Save") {
                    Task {
                        if await subsetService.updateSubsetName(id: subset.id, name: editedName) {
                            subset.name = editedName
                            onUpdate(subset)
                        }
                    }
                }
            }
            .confirmationDialog("Delete Collection?", isPresented: $showDeleteConfirmation, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    Task {
                        if await subsetService.deleteSubset(id: subset.id) {
                            onDelete()
                            dismiss()
                        }
                    }
                }
            } message: {
                Text("This will delete the collection. Photos will not be affected.")
            }
            .sheet(item: $selectedPhoto) { photo in
                PhotoDetailView(photo: photo, albumId: subset.albumId)
            }
            .sheet(isPresented: $showShareSheet) {
                if let token = subset.shareToken {
                    ShareSheetView(url: subsetService.getShareURL(token: token))
                }
            }
        }
    }

    @ViewBuilder
    private func shareHeader(token: String) -> some View {
        let url = subsetService.getShareURL(token: token)

        VStack(spacing: 12) {
            HStack {
                Image(systemName: "link")
                Text("Shareable Collection")
                    .font(.subheadline.bold())
            }
            .foregroundStyle(.blue)

            Text(url.absoluteString)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6))
                .cornerRadius(8)

            HStack(spacing: 16) {
                ShareLink(item: url) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    UIPasteboard.general.url = url
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(Color.blue.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct ShareSheetView: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "link.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)

                Text("Share Collection")
                    .font(.title2.bold())

                Text(url.absoluteString)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(8)

                Spacer()

                VStack(spacing: 12) {
                    ShareLink(item: url) {
                        Label("Share Link", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)

                    Button {
                        UIPasteboard.general.url = url
                    } label: {
                        Label("Copy to Clipboard", systemImage: "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
