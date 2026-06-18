import SwiftUI

struct AlbumsListView: View {
    @EnvironmentObject var albumService: AlbumService
    @StateObject private var activityService = ActivityService.shared
    @State private var showCreateAlbum = false
    @State private var searchText = ""
    @State private var selectedAlbum: Album?

    private var filteredAlbums: [Album] {
        if searchText.isEmpty {
            return albumService.albums
        }
        return albumService.albums.filter { album in
            album.title.localizedCaseInsensitiveContains(searchText) ||
            (album.description?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    // Time-based album grouping
    private enum AlbumTimeGroup: String, CaseIterable {
        case thisWeek = "This Week"
        case thisMonth = "This Month"
        case older = "Older"

        static func group(for date: Date?) -> AlbumTimeGroup {
            guard let date = date else { return .older }
            let calendar = Calendar.current
            let now = Date()

            if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
               date > weekAgo {
                return .thisWeek
            } else if let monthAgo = calendar.date(byAdding: .month, value: -1, to: now),
                      date > monthAgo {
                return .thisMonth
            } else {
                return .older
            }
        }
    }

    private func lastActivityDate(for album: Album) -> Date? {
        activityService.lastActivity(for: album.id)?.createdAt
    }

    private var thisWeekAlbums: [Album] {
        filteredAlbums
            .filter { AlbumTimeGroup.group(for: lastActivityDate(for: $0)) == .thisWeek }
            .sorted { (lastActivityDate(for: $0) ?? .distantPast) > (lastActivityDate(for: $1) ?? .distantPast) }
    }

    private var thisMonthAlbums: [Album] {
        filteredAlbums
            .filter { AlbumTimeGroup.group(for: lastActivityDate(for: $0)) == .thisMonth }
            .sorted { (lastActivityDate(for: $0) ?? .distantPast) > (lastActivityDate(for: $1) ?? .distantPast) }
    }

    private var olderAlbums: [Album] {
        filteredAlbums
            .filter { AlbumTimeGroup.group(for: lastActivityDate(for: $0)) == .older }
            .sorted { (lastActivityDate(for: $0) ?? .distantPast) > (lastActivityDate(for: $1) ?? .distantPast) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if albumService.isLoading && albumService.albums.isEmpty {
                    loadingView
                } else if albumService.albums.isEmpty {
                    emptyView
                } else {
                    albumsContent
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Albums")
            .searchable(text: $searchText, prompt: "Search albums")
            .navigationDestination(item: $selectedAlbum) { album in
                AlbumDetailView(album: album)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateAlbum = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateAlbum) {
                CreateAlbumSheet()
            }
        }
        .task {
            await loadData()
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        await albumService.fetchUserAlbums()

        // Fetch activity data for all albums
        let albumIds = albumService.albums.map { $0.id }
        await activityService.fetchRecentActivityCounts(albumIds: albumIds)
    }

    // MARK: - Albums Content

    private var albumsContent: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                albumsSections
            }
        }
        .refreshable {
            await loadData()
        }
        .overlay {
            if !searchText.isEmpty && filteredAlbums.isEmpty {
                ContentUnavailableView.search(text: searchText)
            }
        }
    }

    // MARK: - Albums Sections (Time-Based)

    private var albumsSections: some View {
        VStack(spacing: 0) {
            // This Week
            if !thisWeekAlbums.isEmpty {
                CompactSectionHeader("This Week", count: thisWeekAlbums.count)

                VStack(spacing: 8) {
                    ForEach(thisWeekAlbums) { album in
                        compactCard(for: album)
                    }
                }
                .padding(.horizontal, 16)
            }

            // This Month
            if !thisMonthAlbums.isEmpty {
                CompactSectionHeader("This Month", count: thisMonthAlbums.count)

                VStack(spacing: 8) {
                    ForEach(thisMonthAlbums) { album in
                        compactCard(for: album)
                    }
                }
                .padding(.horizontal, 16)
            }

            // Older
            if !olderAlbums.isEmpty {
                CompactSectionHeader("Older", count: olderAlbums.count)

                VStack(spacing: 8) {
                    ForEach(olderAlbums) { album in
                        compactCard(for: album)
                    }
                }
                .padding(.horizontal, 16)
            }

            // Bottom padding
            Color.clear.frame(height: 100)
        }
    }

    // MARK: - Compact Card Builder

    private func compactCard(for album: Album) -> some View {
        CompactAlbumCard(
            album: AlbumWithDetails(
                album: album,
                photoCount: albumService.photoCounts[album.id] ?? 0,
                memberCount: albumService.memberCounts[album.id] ?? 1,
                coverPhotoThumbnailUrl: albumService.coverPhotoUrls[album.id],
                userRole: nil
            ),
            coverPhotoUrl: albumService.coverPhotoUrls[album.id],
            activityCount: activityService.activityCount(for: album.id),
            lastActivity: activityService.lastActivity(for: album.id)
        ) {
            selectedAlbum = album
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        ScrollView {
            VStack(spacing: 0) {
                CompactSectionHeader("Albums")

                VStack(spacing: 8) {
                    ForEach(0..<5, id: \.self) { index in
                        LoadingCompactCard(index: index)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        ContentUnavailableView {
            Label("No Albums", systemImage: "photo.on.rectangle.angled")
        } description: {
            Text("Create your first album to start sharing photos")
        } actions: {
            Button("Create Album") {
                showCreateAlbum = true
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.capsulePrimary)
        }
    }
}

// MARK: - Loading Compact Card (Skeleton)

struct LoadingCompactCard: View {
    let index: Int
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 14) {
            // Thumbnail placeholder
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(.systemGray5))
                .frame(width: 56, height: 56)

            // Content placeholder
            VStack(alignment: .leading, spacing: 8) {
                // Title
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: 140, height: 16)

                // Metadata
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: 100, height: 12)
            }

            Spacer()
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .opacity(isAnimating ? 0.6 : 1.0)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true).delay(Double(index) * 0.1)) {
                isAnimating = true
            }
        }
    }
}

// MARK: - Legacy Loading Album Card (for backward compatibility)

struct LoadingAlbumCard: View {
    let index: Int
    @State private var isAnimating = false

    private let cardHeight: CGFloat = 280

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24)
                .fill(Color.black.opacity(0.08))
                .blur(radius: 20)
                .offset(y: 12)

            RoundedRectangle(cornerRadius: 24)
                .fill(Color.black.opacity(0.05))
                .blur(radius: 8)
                .offset(y: 6)

            RoundedRectangle(cornerRadius: 24)
                .fill(Color(.systemGray5))
                .frame(height: cardHeight)
                .overlay {
                    VStack(alignment: .leading, spacing: 12) {
                        Spacer()

                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color(.systemGray4))
                            .frame(width: 180, height: 24)

                        HStack(spacing: 16) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color(.systemGray4))
                                .frame(width: 60, height: 16)

                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color(.systemGray4))
                                .frame(width: 50, height: 16)

                            Spacer()

                            HStack(spacing: -8) {
                                ForEach(0..<3, id: \.self) { _ in
                                    Circle()
                                        .fill(Color(.systemGray4))
                                        .frame(width: 28, height: 28)
                                }
                            }
                        }
                    }
                    .padding(20)
                    .padding(.leading, 12)
                }

            HStack {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(.systemGray4))
                    .frame(width: 4, height: cardHeight)
                    .clipShape(
                        UnevenRoundedRectangle(
                            topLeadingRadius: 24,
                            bottomLeadingRadius: 24,
                            bottomTrailingRadius: 0,
                            topTrailingRadius: 0
                        )
                    )
                Spacer()
            }
        }
        .frame(height: cardHeight)
        .opacity(isAnimating ? 0.6 : 1.0)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true).delay(Double(index) * 0.1)) {
                isAnimating = true
            }
        }
    }
}

#Preview {
    AlbumsListView()
        .environmentObject(AlbumService.shared)
}
