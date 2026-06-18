import SwiftUI

/// A photo cell with double-tap to like and context menu actions
struct InteractivePhotoCell: View {
    let photo: Photo
    let size: CGFloat
    let onTap: () -> Void

    @StateObject private var socialService = SocialService.shared
    @State private var isLiked = false
    @State private var showHeartAnimation = false
    @State private var likeCount = 0

    var body: some View {
        ZStack {
            PhotoThumbnailView(photo: photo)
                .frame(width: size, height: size)
                .clipped()

            // Heart animation overlay
            if showHeartAnimation {
                Image(systemName: "heart.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.3), radius: 10)
                    .scaleEffect(showHeartAnimation ? 1.0 : 0.5)
                    .opacity(showHeartAnimation ? 1.0 : 0)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            doubleTapLike()
        }
        .onTapGesture(count: 1) {
            onTap()
        }
        .contextMenu {
            // Like action
            Button {
                Task { await toggleLike() }
            } label: {
                Label(isLiked ? "Unlike" : "Like", systemImage: isLiked ? "heart.fill" : "heart")
            }

            Divider()

            // Download action
            Button {
                Task { await downloadPhoto() }
            } label: {
                Label("Save to Photos", systemImage: "square.and.arrow.down")
            }

            // Share action
            if let url = photo.thumbnailUrl {
                ShareLink(item: url) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .task {
            await loadSocialState()
        }
    }

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

    private func loadSocialState() async {
        let interactions = await socialService.fetchUserInteractions(photoId: photo.id)
        isLiked = interactions.liked

        let counts = await socialService.fetchCounts(photoId: photo.id)
        likeCount = counts.likes
    }

    private func toggleLike() async {
        isLiked.toggle()
        likeCount += isLiked ? 1 : -1

        let success = await socialService.toggleLike(photoId: photo.id)
        if !success {
            isLiked.toggle()
            likeCount += isLiked ? 1 : -1
        }
    }

    private func downloadPhoto() async {
        let cloudStorage = CloudStorageService()

        do {
            let data = try await cloudStorage.downloadPhoto(reference: photo.originalUri)
            if let image = UIImage(data: data) {
                UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            }
        } catch {
            // Fallback to thumbnail
            if let url = photo.thumbnailUrl {
                do {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    if let image = UIImage(data: data) {
                        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                    }
                } catch {
                    print("[InteractivePhotoCell] Download failed: \(error)")
                }
            }
        }
    }
}
