import SwiftUI

@main
struct CapsuleApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var albumService = AlbumService.shared
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(albumService)
                .environmentObject(deepLinkHandler)
                .onOpenURL { url in
                    deepLinkHandler.handleDeepLink(url: url)
                }
        }
    }
}

// MARK: - Deep Link Handler

@MainActor
final class DeepLinkHandler: ObservableObject {
    static let shared = DeepLinkHandler()

    @Published var pendingInviteToken: String?
    @Published var showInviteSheet = false
    @Published var inviteResult: AcceptInviteResult?
    @Published var isProcessing = false
    @Published var navigateToAlbumId: UUID?

    private init() {}

    func handleDeepLink(url: URL) {
        print("[DeepLinkHandler] Received URL: \(url)")

        // Handle both custom scheme (capsule://) and universal links (https://capsule.app/)
        let pathComponents: [String]

        if url.scheme == Config.urlScheme {
            // capsule://invite/TOKEN
            pathComponents = url.pathComponents.filter { $0 != "/" }
        } else if url.host == "capsule.app" || url.host?.hasSuffix(".capsule.app") == true {
            // https://capsule.app/invite/TOKEN
            pathComponents = url.pathComponents.filter { $0 != "/" }
        } else {
            print("[DeepLinkHandler] Unrecognized URL scheme/host")
            return
        }

        guard pathComponents.count >= 2 else {
            print("[DeepLinkHandler] Invalid path components: \(pathComponents)")
            return
        }

        let action = pathComponents[0]
        let param = pathComponents[1]

        switch action {
        case "invite":
            handleInvite(token: param)
        case "album":
            if let albumId = UUID(uuidString: param) {
                navigateToAlbum(id: albumId)
            }
        case "collection":
            // Handle shared collection links
            handleSharedCollection(token: param)
        default:
            print("[DeepLinkHandler] Unknown action: \(action)")
        }
    }

    private func handleInvite(token: String) {
        print("[DeepLinkHandler] Processing invite token: \(token)")
        pendingInviteToken = token
        showInviteSheet = true
    }

    private func navigateToAlbum(id: UUID) {
        print("[DeepLinkHandler] Navigating to album: \(id)")
        navigateToAlbumId = id
    }

    private func handleSharedCollection(token: String) {
        print("[DeepLinkHandler] Processing collection token: \(token)")
        // Could navigate to shared collection view
    }

    func acceptInvite() async {
        guard let token = pendingInviteToken else { return }

        isProcessing = true
        inviteResult = await InviteService.shared.acceptInvite(token: token)
        isProcessing = false

        // If successfully joined, refresh albums
        if case .joined(let albumId) = inviteResult {
            await AlbumService.shared.fetchUserAlbums()
            navigateToAlbumId = albumId
        } else if case .alreadyMember(let albumId) = inviteResult {
            navigateToAlbumId = albumId
        }
    }

    func dismissInvite() {
        pendingInviteToken = nil
        showInviteSheet = false
        inviteResult = nil
    }
}

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler

    var body: some View {
        Group {
            if authManager.isLoading {
                LoadingView()
            } else if authManager.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .sheet(isPresented: $deepLinkHandler.showInviteSheet) {
            InviteAcceptSheet()
        }
    }
}

struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
    }
}

struct MainTabView: View {
    @StateObject private var notificationService = NotificationService.shared

    var body: some View {
        TabView {
            AlbumsListView()
                .tabItem {
                    Label("Albums", systemImage: "photo.on.rectangle.angled")
                }

            ActivityView()
                .tabItem {
                    Label("Activity", systemImage: "bell")
                }
                .badge(notificationService.unreadCount)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
        }
        .task {
            await notificationService.fetchUnreadCount()
        }
    }
}

struct ActivityView: View {
    @StateObject private var notificationService = NotificationService.shared
    @EnvironmentObject var albumService: AlbumService

    var body: some View {
        NavigationStack {
            Group {
                if notificationService.isLoading && notificationService.notifications.isEmpty {
                    ProgressView("Loading activity...")
                } else if notificationService.notifications.isEmpty {
                    ContentUnavailableView {
                        Label("No Activity", systemImage: "bell")
                    } description: {
                        Text("When something happens in your albums, you'll see it here")
                    }
                } else {
                    List {
                        ForEach(notificationService.notifications) { notification in
                            NotificationRowView(notification: notification)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        Task {
                                            await notificationService.deleteNotification(id: notification.id)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    if !notification.isRead {
                                        Button {
                                            Task {
                                                await notificationService.markAsRead(id: notification.id)
                                            }
                                        } label: {
                                            Label("Read", systemImage: "checkmark")
                                        }
                                        .tint(.blue)
                                    }
                                }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Activity")
            .toolbar {
                if !notificationService.notifications.isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button {
                                Task { await notificationService.markAllAsRead() }
                            } label: {
                                Label("Mark All as Read", systemImage: "checkmark.circle")
                            }
                            .disabled(notificationService.unreadCount == 0)

                            Button(role: .destructive) {
                                Task { await notificationService.clearAll() }
                            } label: {
                                Label("Clear All", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
            .refreshable {
                await notificationService.fetchNotifications()
            }
            .task {
                await notificationService.fetchNotifications()
            }
        }
    }
}

struct NotificationRowView: View {
    let notification: AppNotification
    @EnvironmentObject var albumService: AlbumService

    private var albumName: String {
        if let albumId = notification.albumId,
           let album = albumService.albums.first(where: { $0.id == albumId }) {
            return album.title
        }
        return notification.payload?.albumName ?? "Album"
    }

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            Image(systemName: notification.notificationType.icon)
                .font(.title2)
                .foregroundColor(notification.isRead ? .secondary : .accentColor)
                .frame(width: 40, height: 40)
                .background(notification.isRead ? Color(.systemGray5) : Color.accentColor.opacity(0.15))
                .clipShape(Circle())

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.description)
                    .font(.subheadline)
                    .fontWeight(notification.isRead ? .regular : .medium)

                HStack(spacing: 4) {
                    Text(albumName)
                        .foregroundStyle(.secondary)

                    Text("•")
                        .foregroundStyle(.tertiary)

                    Text(notification.createdAt, style: .relative)
                        .foregroundStyle(.tertiary)
                }
                .font(.caption)
            }

            Spacer()

            // Unread indicator
            if !notification.isRead {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ProfileView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var showEditProfile = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        showEditProfile = true
                    } label: {
                        HStack(spacing: 16) {
                            ProfileAvatarView(
                                displayName: authManager.profile?.displayName,
                                avatarUrl: authManager.profile?.avatarUrl,
                                size: 60
                            )

                            VStack(alignment: .leading, spacing: 4) {
                                Text(authManager.profile?.displayName ?? "Unknown")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(authManager.currentUser?.email ?? "")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section {
                    NavigationLink {
                        FavoritesView()
                    } label: {
                        Label("Favorites", systemImage: "star.fill")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task {
                            await authManager.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Profile")
            .sheet(isPresented: $showEditProfile) {
                EditProfileView()
            }
        }
    }
}

struct ProfileAvatarView: View {
    let displayName: String?
    let avatarUrl: String?
    let size: CGFloat

    var body: some View {
        Group {
            if let avatarUrl, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        avatarPlaceholder
                    }
                }
            } else {
                avatarPlaceholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(Color.accentColor.opacity(0.2))
            .overlay {
                Text(displayName?.prefix(1).uppercased() ?? "?")
                    .font(size > 40 ? .title2.bold() : .caption.bold())
                    .foregroundStyle(.tint)
            }
    }
}

struct EditProfileView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var displayName: String = ""
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Spacer()
                        ProfileAvatarView(
                            displayName: displayName.isEmpty ? authManager.profile?.displayName : displayName,
                            avatarUrl: authManager.profile?.avatarUrl,
                            size: 100
                        )
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }

                Section("Display Name") {
                    TextField("Your name", text: $displayName)
                        .textContentType(.name)
                        .autocorrectionDisabled()
                }

                Section {
                    HStack {
                        Text("Email")
                        Spacer()
                        Text(authManager.currentUser?.email ?? "")
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Email cannot be changed")
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveProfile() }
                    }
                    .disabled(displayName.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .onAppear {
                displayName = authManager.profile?.displayName ?? ""
            }
            .overlay {
                if isSaving {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView("Saving...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    private func saveProfile() async {
        isSaving = true
        error = nil

        let success = await ProfileService.shared.updateDisplayName(displayName.trimmingCharacters(in: .whitespaces))

        if success {
            await authManager.reloadProfile()
            dismiss()
        } else {
            error = "Failed to update profile"
        }

        isSaving = false
    }
}

struct FavoritesView: View {
    @State private var favoritePhotos: [Photo] = []
    @State private var isLoading = true
    @State private var selectedPhoto: Photo?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if favoritePhotos.isEmpty {
                ContentUnavailableView {
                    Label("No Favorites", systemImage: "star")
                } description: {
                    Text("Photos you star will appear here")
                }
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 2)], spacing: 2) {
                        ForEach(favoritePhotos) { photo in
                            PhotoThumbnailView(photo: photo)
                                .aspectRatio(1, contentMode: .fill)
                                .clipped()
                                .onTapGesture {
                                    selectedPhoto = photo
                                }
                        }
                    }
                }
            }
        }
        .navigationTitle("Favorites")
        .task {
            await loadFavorites()
        }
        .refreshable {
            await loadFavorites()
        }
        .sheet(item: $selectedPhoto) { photo in
            PhotoDetailView(photo: photo, albumId: photo.albumId)
        }
    }

    private func loadFavorites() async {
        isLoading = favoritePhotos.isEmpty
        favoritePhotos = await ProfileService.shared.fetchFavoritePhotos()
        isLoading = false
    }
}

// MARK: - Invite Accept Sheet

struct InviteAcceptSheet: View {
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // Icon
                Image(systemName: resultIcon)
                    .font(.system(size: 60))
                    .foregroundStyle(resultColor)

                // Title
                Text(resultTitle)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)

                // Description
                Text(resultDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()

                // Action buttons
                VStack(spacing: 12) {
                    if deepLinkHandler.inviteResult == nil {
                        // Not yet processed - show accept button
                        if authManager.isAuthenticated {
                            Button {
                                Task { await deepLinkHandler.acceptInvite() }
                            } label: {
                                Text("Join Album")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(deepLinkHandler.isProcessing)
                        } else {
                            Text("Sign in to accept this invite")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        // Show result-specific button
                        resultButton
                    }

                    Button("Dismiss") {
                        deepLinkHandler.dismissInvite()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .navigationTitle("Album Invite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        deepLinkHandler.dismissInvite()
                    }
                }
            }
            .overlay {
                if deepLinkHandler.isProcessing {
                    Color.black.opacity(0.2)
                        .ignoresSafeArea()
                    ProgressView("Joining...")
                        .padding()
                        .background(.regularMaterial)
                        .cornerRadius(12)
                }
            }
        }
    }

    private var resultIcon: String {
        guard let result = deepLinkHandler.inviteResult else {
            return "person.badge.plus"
        }
        switch result {
        case .joined: return "checkmark.circle.fill"
        case .alreadyMember: return "person.2.fill"
        case .pendingApproval: return "clock.fill"
        case .expired: return "exclamationmark.triangle.fill"
        case .error: return "xmark.circle.fill"
        }
    }

    private var resultColor: Color {
        guard let result = deepLinkHandler.inviteResult else {
            return .blue
        }
        switch result {
        case .joined: return .green
        case .alreadyMember: return .blue
        case .pendingApproval: return .orange
        case .expired: return .yellow
        case .error: return .red
        }
    }

    private var resultTitle: String {
        guard let result = deepLinkHandler.inviteResult else {
            return "You've been invited!"
        }
        switch result {
        case .joined: return "Welcome!"
        case .alreadyMember: return "Already a Member"
        case .pendingApproval: return "Request Sent"
        case .expired: return "Invite Expired"
        case .error(let msg): return "Error: \(msg)"
        }
    }

    private var resultDescription: String {
        guard let result = deepLinkHandler.inviteResult else {
            return "Someone invited you to join their album. Tap below to accept and start sharing photos together."
        }
        switch result {
        case .joined: return "You've successfully joined the album. You can now view and add photos."
        case .alreadyMember: return "You're already a member of this album."
        case .pendingApproval: return "The album owner will review your request. You'll be notified when approved."
        case .expired: return "This invite link has expired. Ask for a new one."
        case .error: return "Something went wrong. Please try again or ask for a new invite link."
        }
    }

    @ViewBuilder
    private var resultButton: some View {
        if case .joined = deepLinkHandler.inviteResult {
            Button {
                deepLinkHandler.dismissInvite()
            } label: {
                Text("View Album")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        } else if case .alreadyMember = deepLinkHandler.inviteResult {
            Button {
                deepLinkHandler.dismissInvite()
            } label: {
                Text("View Album")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        } else {
            EmptyView()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthManager.shared)
        .environmentObject(AlbumService.shared)
        .environmentObject(DeepLinkHandler.shared)
}
