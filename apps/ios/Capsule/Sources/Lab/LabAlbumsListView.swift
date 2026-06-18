import SwiftUI

// MARK: - Lab Albums List View

/// Premium albums list with signature design language.
/// Features:
/// - Soft Arc shaped cards
/// - Depth modeling with ambient shadows
/// - Lift to Peek interaction
/// - Editorial section headers
/// - Staggered reveal animations

struct LabAlbumsListView: View {
    let useMockData: Bool

    @State private var albums: [MockAlbum] = []
    @State private var isLoading = true
    @State private var selectedAlbum: MockAlbum?

    // Split albums into recent and older
    private var recentAlbums: [MockAlbum] {
        albums.filter { $0.lastUpdated > Date().addingTimeInterval(-7 * 24 * 3600) }
    }

    private var olderAlbums: [MockAlbum] {
        albums.filter { $0.lastUpdated <= Date().addingTimeInterval(-7 * 24 * 3600) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if isLoading {
                    loadingView
                } else if albums.isEmpty {
                    emptyView
                } else {
                    albumsSections
                }
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Albums")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    // Create album
                } label: {
                    Image(systemName: "plus")
                        .font(.body.bold())
                }
            }
        }
        .refreshable {
            await loadAlbums()
        }
        .task {
            await loadAlbums()
        }
        .navigationDestination(item: $selectedAlbum) { album in
            LabAlbumDetailView(album: album, useMockData: useMockData)
        }
    }

    // MARK: - Albums Sections (Editorial Layout)

    private var albumsSections: some View {
        VStack(spacing: 0) {
            // Recent section
            if !recentAlbums.isEmpty {
                LabEditorialSectionHeader("Recently Updated", subtitle: "Last 7 days")
                    .padding(.horizontal, 20)

                VStack(spacing: 28) {
                    ForEach(Array(recentAlbums.enumerated()), id: \.element.id) { index, album in
                        LabSignatureAlbumCard(album: album, index: index) {
                            selectedAlbum = album
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }

            // All albums section
            if !olderAlbums.isEmpty {
                LabEditorialSectionHeader("All Albums", subtitle: "\(olderAlbums.count) albums")
                    .padding(.horizontal, 20)
                    .padding(.top, 32)

                VStack(spacing: 28) {
                    ForEach(Array(olderAlbums.enumerated()), id: \.element.id) { index, album in
                        LabSignatureAlbumCard(album: album, index: index + recentAlbums.count) {
                            selectedAlbum = album
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }

            // Bottom padding
            Color.clear.frame(height: 60)
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: LabTokens.Spacing.md) {
            ForEach(0..<3, id: \.self) { index in
                LabLoadingAlbumCard(index: index)
            }
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        ContentUnavailableView {
            Label("No Albums", systemImage: "photo.stack")
        } description: {
            Text("Create your first album to get started")
        } actions: {
            Button {
                // Create album
            } label: {
                Text("Create Album")
            }
            .buttonStyle(.borderedProminent)
            .tint(LabTokens.Colors.primary)
        }
        .padding(.top, LabTokens.Spacing.xxl)
    }

    // MARK: - Data Loading

    private func loadAlbums() async {
        // Simulate network delay
        try? await Task.sleep(nanoseconds: 500_000_000)

        if useMockData {
            albums = MockAlbum.samples
        } else {
            // TODO: Load real albums from AlbumService
            albums = MockAlbum.samples
        }

        isLoading = false
    }
}

// MARK: - Lab Loading Album Card (Skeleton)

struct LabLoadingAlbumCard: View {
    let index: Int
    @State private var isAnimating = false

    private let cardHeight: CGFloat = 280

    var body: some View {
        RoundedRectangle(cornerRadius: LabTokens.Radius.xl)
            .fill(Color(.systemGray5))
            .frame(height: cardHeight)
            .overlay {
                VStack(alignment: .leading, spacing: LabTokens.Spacing.sm) {
                    Spacer()

                    // Title placeholder
                    RoundedRectangle(cornerRadius: LabTokens.Radius.xs)
                        .fill(Color(.systemGray4))
                        .frame(width: 160, height: 20)

                    // Metadata placeholder
                    HStack(spacing: LabTokens.Spacing.sm) {
                        RoundedRectangle(cornerRadius: LabTokens.Radius.xs)
                            .fill(Color(.systemGray4))
                            .frame(width: 60, height: 14)

                        RoundedRectangle(cornerRadius: LabTokens.Radius.xs)
                            .fill(Color(.systemGray4))
                            .frame(width: 40, height: 14)
                    }
                }
                .padding(LabTokens.Spacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .opacity(isAnimating ? 0.6 : 1.0)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true).delay(Double(index) * 0.1)) {
                    isAnimating = true
                }
            }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        LabAlbumsListView(useMockData: true)
    }
}
