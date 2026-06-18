import SwiftUI

// MARK: - Lab Album Detail View

/// Modern album detail with parallax hero header, floating filter bar,
/// and multiple photo layout modes.

struct LabAlbumDetailView: View {
    let album: MockAlbum
    let useMockData: Bool

    @State private var selectedTab: LabTab = .all
    @State private var selectedLayout: LabLayout = .grid
    @State private var dateFilter: String? = nil
    @State private var scrollOffset: CGFloat = 0
    @State private var photoGroups: [MockPhotoGroup] = []
    @State private var isLoading = true
    @State private var showSettings = false
    @State private var selectedPhoto: MockPhoto?

    var body: some View {
        ZStack(alignment: .top) {
            // Background
            Color(.systemBackground)
                .ignoresSafeArea()

            // Scrollable content
            ScrollView {
                VStack(spacing: 0) {
                    // Track scroll offset
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: ScrollOffsetKey.self,
                                value: geo.frame(in: .named("scroll")).minY
                            )
                    }
                    .frame(height: 0)

                    // Hero header
                    CapsuleHeroHeader(
                        album: album,
                        members: MockMember.samples,
                        scrollOffset: scrollOffset
                    )

                    // Filter bar (overlaps hero)
                    LabFilterBar(
                        selectedTab: $selectedTab,
                        selectedLayout: $selectedLayout,
                        dateFilter: $dateFilter
                    )
                    .padding(.top, -LabTokens.Spacing.lg)
                    .zIndex(1)

                    // Content
                    contentSection
                        .padding(.top, LabTokens.Spacing.md)
                }
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetKey.self) { value in
                scrollOffset = value
            }
        }
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await loadPhotos()
        }
        .sheet(isPresented: $showSettings) {
            LabAlbumSettingsView(album: album)
        }
        .sheet(item: $selectedPhoto) { photo in
            PhotoDetailSheet(photo: photo)
        }
    }

    // MARK: - Content Section

    @ViewBuilder
    private var contentSection: some View {
        switch selectedTab {
        case .all:
            allPhotosSection
        case .collections:
            collectionsPlaceholder
        case .myPicks:
            myPicksPlaceholder
        }
    }

    // MARK: - All Photos Section

    private var allPhotosSection: some View {
        LazyVStack(spacing: LabTokens.Spacing.lg) {
            if isLoading {
                ProgressView()
                    .padding(.top, LabTokens.Spacing.xxl)
            } else {
                ForEach(photoGroups) { group in
                    VStack(alignment: .leading, spacing: LabTokens.Spacing.sm) {
                        // Group header
                        HStack {
                            VStack(alignment: .leading, spacing: LabTokens.Spacing.xxs) {
                                Text(group.title)
                                    .labFont(.cardTitle)

                                Text(group.subtitle)
                                    .labFont(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption.bold())
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, LabTokens.Spacing.md)

                        // Photo grid
                        MemoryTileGrid(
                            photos: group.photos,
                            layout: selectedLayout
                        ) { photo in
                            selectedPhoto = photo
                        }
                    }
                }
            }
        }
        .padding(.bottom, LabTokens.Spacing.xxl)
    }

    // MARK: - Placeholders

    private var collectionsPlaceholder: some View {
        ContentUnavailableView {
            Label("Collections", systemImage: "rectangle.stack")
        } description: {
            Text("Create collections to organize photos")
        } actions: {
            Button("Create Collection") { }
                .buttonStyle(.borderedProminent)
                .tint(LabTokens.Colors.primary)
        }
        .padding(.top, LabTokens.Spacing.xxl)
    }

    private var myPicksPlaceholder: some View {
        ContentUnavailableView {
            Label("My Picks", systemImage: "star")
        } description: {
            Text("Save your favorite photos privately")
        } actions: {
            Button("Create Picks") { }
                .buttonStyle(.borderedProminent)
                .tint(LabTokens.Colors.primary)
        }
        .padding(.top, LabTokens.Spacing.xxl)
    }

    // MARK: - Data Loading

    private func loadPhotos() async {
        try? await Task.sleep(nanoseconds: 300_000_000)

        if useMockData {
            photoGroups = MockPhotoGroup.generateGroups()
        } else {
            // TODO: Load real photos from PhotoService
            photoGroups = MockPhotoGroup.generateGroups()
        }

        isLoading = false
    }
}

// MARK: - Photo Detail Sheet (Placeholder)

struct PhotoDetailSheet: View {
    let photo: MockPhoto

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AsyncImage(url: URL(string: photo.url)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                default:
                    ProgressView()
                }
            }
            .navigationTitle("Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Scroll Offset Preference Key

struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        LabAlbumDetailView(
            album: MockAlbum.samples[0],
            useMockData: true
        )
    }
}
