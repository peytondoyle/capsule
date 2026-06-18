import SwiftUI
import AVKit

struct PhotoDetailView: View {
    let photo: Photo
    let albumId: UUID

    @Environment(\.dismiss) private var dismiss
    @StateObject private var photoService = PhotoService.shared
    @StateObject private var socialService = SocialService.shared
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var isDownloading = false
    @State private var downloadError: String?
    @State private var showDownloadSuccess = false

    // Social state
    @State private var isLiked = false
    @State private var likeCount = 0
    @State private var commentCount = 0
    @State private var showHeartAnimation = false

    // Comments drawer state
    @State private var commentsExpanded = false
    @State private var comments: [Comment] = []
    @State private var newCommentText = ""
    @State private var isLoadingComments = false
    @State private var isPostingComment = false

    // Video state
    @State private var videoURL: URL?
    @State private var isLoadingVideo = false
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack(alignment: .bottom) {
                    // Main content
                    ScrollView {
                        VStack(spacing: 0) {
                            // Media display - photo or video with double-tap
                            mediaView(geometry: geometry)
                                .contentShape(Rectangle())
                                .onTapGesture(count: 2) {
                                    doubleTapLike()
                                }
                                .overlay {
                                    // Heart animation
                                    if showHeartAnimation {
                                        Image(systemName: "heart.fill")
                                            .font(.system(size: 80))
                                            .foregroundStyle(.white)
                                            .shadow(color: .black.opacity(0.3), radius: 10)
                                            .scaleEffect(showHeartAnimation ? 1.0 : 0.5)
                                    }
                                }

                            // Action bar
                            actionBar

                            // Metadata (only show when comments not expanded)
                            if !commentsExpanded {
                                metadataSection
                            }
                        }
                    }

                    // Comments drawer
                    commentsDrawer(geometry: geometry)
                }
            }
            .navigationTitle(photo.mediaType == .video ? "Video" : "Photo")
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
            .alert("Saved", isPresented: $showDownloadSuccess) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Saved to your photo library")
            }
            .task {
                await loadSocialData()
            }
        }
    }

    // MARK: - Media View

    @ViewBuilder
    private func mediaView(geometry: GeometryProxy) -> some View {
        if photo.mediaType == .video {
            videoPlayerView(geometry: geometry)
        } else {
            photoView(geometry: geometry)
        }
    }

    // MARK: - Action Bar

    private var actionBar: some View {
        HStack(spacing: 24) {
            // Like button (public)
            Button {
                Task { await toggleLike() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .foregroundStyle(isLiked ? .red : .primary)
                    if likeCount > 0 {
                        Text("\(likeCount)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)

            // Comments button
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    commentsExpanded.toggle()
                }
                if commentsExpanded && comments.isEmpty {
                    Task { await loadComments() }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: commentsExpanded ? "bubble.right.fill" : "bubble.right")
                    if commentCount > 0 {
                        Text("\(commentCount)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .font(.title2)
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Metadata Section

    private var metadataSection: some View {
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

    // MARK: - Comments Drawer

    @ViewBuilder
    private func commentsDrawer(geometry: GeometryProxy) -> some View {
        if commentsExpanded {
            VStack(spacing: 0) {
                // Handle bar
                Capsule()
                    .fill(Color(.systemGray4))
                    .frame(width: 36, height: 4)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                // Header
                HStack {
                    Text("Comments")
                        .font(.headline)
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            commentsExpanded = false
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 8)

                Divider()

                // Comments list
                if isLoadingComments {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else if comments.isEmpty {
                    Text("No comments yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(comments) { comment in
                                commentRow(comment: comment)
                            }
                        }
                        .padding()
                    }
                    .frame(maxHeight: geometry.size.height * 0.35)
                }

                Divider()

                // Comment input
                HStack(spacing: 12) {
                    TextField("Add a comment...", text: $newCommentText)
                        .textFieldStyle(.roundedBorder)

                    Button {
                        Task { await postComment() }
                    } label: {
                        if isPostingComment {
                            ProgressView()
                                .frame(width: 24, height: 24)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .foregroundStyle(newCommentText.isEmpty ? Color.secondary : Color.blue)
                        }
                    }
                    .disabled(newCommentText.trimmingCharacters(in: .whitespaces).isEmpty || isPostingComment)
                }
                .padding()
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 10, y: -5)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func commentRow(comment: Comment) -> some View {
        HStack(alignment: .top, spacing: 10) {
            // Avatar placeholder
            Circle()
                .fill(Color(.systemGray4))
                .frame(width: 32, height: 32)
                .overlay {
                    Text(comment.profile?.displayName?.prefix(1).uppercased() ?? "?")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(comment.profile?.displayName ?? "Unknown")
                        .font(.subheadline.bold())
                    Text(comment.createdAt.formatted(.relative(presentation: .named)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(comment.content)
                    .font(.subheadline)
            }

            Spacer()

            // Delete button (only for own comments)
            if comment.userId == AuthManager.shared.userId {
                Button {
                    Task { await deleteComment(comment) }
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Photo View

    @ViewBuilder
    private func photoView(geometry: GeometryProxy) -> some View {
        AsyncImage(url: photo.thumbnailUrl) { phase in
            switch phase {
            case .empty:
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(height: commentsExpanded ? geometry.size.height * 0.4 : geometry.size.height * 0.7)
                    .overlay {
                        ProgressView()
                    }
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: commentsExpanded ? geometry.size.height * 0.4 : geometry.size.height * 0.7)
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
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: commentsExpanded)
    }

    // MARK: - Video Player View

    @ViewBuilder
    private func videoPlayerView(geometry: GeometryProxy) -> some View {
        ZStack {
            if let player {
                VideoPlayer(player: player)
                    .frame(height: commentsExpanded ? geometry.size.height * 0.4 : geometry.size.height * 0.7)
                    .onDisappear {
                        player.pause()
                    }
            } else {
                // Show thumbnail with play button while loading
                ZStack {
                    AsyncImage(url: photo.thumbnailUrl) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                        default:
                            Rectangle()
                                .fill(Color(.systemGray5))
                        }
                    }
                    .frame(height: commentsExpanded ? geometry.size.height * 0.4 : geometry.size.height * 0.7)

                    if isLoadingVideo {
                        ProgressView("Loading video...")
                            .padding()
                            .background(.ultraThinMaterial)
                            .cornerRadius(12)
                    } else {
                        Button {
                            Task { await loadVideo() }
                        } label: {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 60))
                                .foregroundStyle(.white)
                                .shadow(radius: 10)
                        }
                    }
                }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: commentsExpanded)
    }

    // MARK: - Actions

    private func doubleTapLike() {
        // Show animation
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            showHeartAnimation = true
        }

        // Hide animation after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation(.easeOut(duration: 0.2)) {
                showHeartAnimation = false
            }
        }

        // Only like if not already liked
        if !isLiked {
            Task { await toggleLike() }
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
    }

    private func loadVideo() async {
        isLoadingVideo = true

        do {
            let cloudStorage = CloudStorageService()
            let videoData = try await cloudStorage.downloadPhoto(reference: photo.originalUri)

            // Save to temp file
            let tempDir = FileManager.default.temporaryDirectory
            let filename = "\(photo.id.uuidString).\(photo.originalUri.split(separator: ".").last ?? "mp4")"
            let tempURL = tempDir.appendingPathComponent(filename)

            try videoData.write(to: tempURL)
            videoURL = tempURL

            let newPlayer = AVPlayer(url: tempURL)
            player = newPlayer
            newPlayer.play()
        } catch {
            print("[PhotoDetailView] Failed to load video: \(error)")
            downloadError = "Failed to load video: \(error.localizedDescription)"
        }

        isLoadingVideo = false
    }

    // MARK: - Social Data

    private func loadSocialData() async {
        async let interactions = socialService.fetchUserInteractions(photoId: photo.id)
        async let counts = socialService.fetchCounts(photoId: photo.id)

        let (interactionResult, countsResult) = await (interactions, counts)
        isLiked = interactionResult.liked
        likeCount = countsResult.likes
        commentCount = countsResult.comments
    }

    private func toggleLike() async {
        // Optimistic update
        isLiked.toggle()
        likeCount += isLiked ? 1 : -1

        let success = await socialService.toggleLike(photoId: photo.id)
        if !success {
            // Revert on failure
            isLiked.toggle()
            likeCount += isLiked ? 1 : -1
        }
    }

    private func loadComments() async {
        isLoadingComments = true
        comments = await socialService.fetchComments(photoId: photo.id)
        isLoadingComments = false
    }

    private func postComment() async {
        let content = newCommentText.trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return }

        isPostingComment = true
        if let comment = await socialService.addComment(photoId: photo.id, content: content) {
            comments.insert(comment, at: 0)
            commentCount += 1
            newCommentText = ""
        }
        isPostingComment = false
    }

    private func deleteComment(_ comment: Comment) async {
        let success = await socialService.deleteComment(id: comment.id)
        if success {
            comments.removeAll { $0.id == comment.id }
            commentCount = max(0, commentCount - 1)
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

        do {
            // Try to download original from iCloud Drive
            let cloudStorage = CloudStorageService()
            let data = try await cloudStorage.downloadPhoto(reference: photo.originalUri)

            guard let image = UIImage(data: data) else {
                downloadError = "Failed to process image"
                isDownloading = false
                return
            }

            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            isDownloading = false
            showDownloadSuccess = true
            return
        } catch {
            // Fallback to thumbnail if iCloud download fails
            print("[PhotoDetailView] iCloud download failed, trying thumbnail: \(error)")

            guard let url = photo.thumbnailUrl else {
                downloadError = "No image available"
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
                isDownloading = false
                showDownloadSuccess = true
                return
            } catch {
                downloadError = error.localizedDescription
            }
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
