import SwiftUI

struct CommentsSheet: View {
    let photoId: UUID
    var onCommentAdded: (() -> Void)?
    var onCommentDeleted: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @StateObject private var socialService = SocialService.shared
    @State private var comments: [Comment] = []
    @State private var newCommentText = ""
    @State private var isLoading = true
    @State private var isSending = false

    private var currentUserId: UUID? {
        AuthManager.shared.userId
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Comments list
                if isLoading {
                    Spacer()
                    ProgressView("Loading comments...")
                    Spacer()
                } else if comments.isEmpty {
                    Spacer()
                    ContentUnavailableView {
                        Label("No Comments", systemImage: "bubble.right")
                    } description: {
                        Text("Be the first to comment!")
                    }
                    Spacer()
                } else {
                    List {
                        ForEach(comments) { comment in
                            CommentRow(
                                comment: comment,
                                isOwn: comment.userId == currentUserId,
                                onDelete: {
                                    await deleteComment(comment)
                                }
                            )
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        await loadComments()
                    }
                }

                Divider()

                // Comment input
                HStack(spacing: 12) {
                    TextField("Add a comment...", text: $newCommentText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(1...4)

                    Button {
                        Task { await sendComment() }
                    } label: {
                        if isSending {
                            ProgressView()
                                .frame(width: 24, height: 24)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.title3)
                        }
                    }
                    .disabled(newCommentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                }
                .padding()
                .background(Color(.systemBackground))
            }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await loadComments()
            }
        }
    }

    private func loadComments() async {
        isLoading = true
        comments = await socialService.fetchComments(photoId: photoId)
        isLoading = false
    }

    private func sendComment() async {
        let text = newCommentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        newCommentText = ""

        if let comment = await socialService.addComment(photoId: photoId, content: text) {
            comments.append(comment)
            onCommentAdded?()
        }

        isSending = false
    }

    private func deleteComment(_ comment: Comment) async {
        let success = await socialService.deleteComment(id: comment.id)
        if success {
            comments.removeAll { $0.id == comment.id }
            onCommentDeleted?()
        }
    }
}

struct CommentRow: View {
    let comment: Comment
    let isOwn: Bool
    let onDelete: () async -> Void

    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            Circle()
                .fill(Color(.systemGray4))
                .frame(width: 36, height: 36)
                .overlay {
                    Text(avatarInitial)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }

            VStack(alignment: .leading, spacing: 4) {
                // Name and time
                HStack {
                    Text(displayName)
                        .font(.subheadline.weight(.semibold))

                    Text(relativeTime)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Comment text
                Text(comment.content)
                    .font(.subheadline)
            }

            Spacer()

            // Delete button (own comments only)
            if isOwn {
                Button {
                    showDeleteConfirmation = true
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .opacity(isDeleting ? 0.5 : 1)
                .disabled(isDeleting)
            }
        }
        .padding(.vertical, 4)
        .confirmationDialog("Delete Comment", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task {
                    isDeleting = true
                    await onDelete()
                    isDeleting = false
                }
            }
        }
    }

    private var displayName: String {
        comment.profile?.displayName ?? "User"
    }

    private var avatarInitial: String {
        String(displayName.prefix(1)).uppercased()
    }

    private var relativeTime: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: comment.createdAt, relativeTo: Date())
    }
}

#Preview {
    CommentsSheet(photoId: UUID())
}
