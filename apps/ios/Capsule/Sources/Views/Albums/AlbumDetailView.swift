import SwiftUI
import PhotosUI

// MARK: - View Mode Enum

enum AlbumViewMode: String, CaseIterable {
    case grid = "Grid"
    case capsule = "Capsule"
    case carousel = "Carousel"
    case mosaic = "Mosaic"

    var icon: String {
        switch self {
        case .grid: return "square.grid.3x3"
        case .capsule: return "capsule.portrait"
        case .carousel: return "rectangle.portrait.on.rectangle.portrait"
        case .mosaic: return "rectangle.split.3x3"
        }
    }
}

enum AlbumTab: String, CaseIterable {
    case photos = "All"
    case collections = "Collections"
    case myPicks = "My Picks"
}

struct AlbumDetailView: View {
    let album: Album

    @StateObject private var photoService = PhotoService.shared
    @StateObject private var memberService = MemberService.shared
    @State private var photos: [Photo] = []
    @State private var members: [AlbumMemberWithProfile] = []
    @State private var isLoading = true
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showSettings = false
    @State private var selectedPhoto: Photo?
    @State private var loadTask: Task<Void, Never>?
    @State private var viewMode: AlbumViewMode = .grid

    // Bulk selection
    @State private var isSelectionMode = false
    @State private var selectedPhotoIds: Set<UUID> = []
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var isDownloading = false
    @State private var downloadProgress: (current: Int, total: Int) = (0, 0)
    @State private var showDownloadSuccess = false
    @State private var downloadedCount = 0

    // Date filtering
    @State private var showDateFilter = false
    @State private var selectedMonth: Int? = nil
    @State private var selectedYear: Int? = nil

    // Tab navigation
    @State private var selectedTab: AlbumTab = .photos

    // Hero header visibility
    @State private var showHeroHeader = true

    private var filteredPhotos: [Photo] {
        guard selectedMonth != nil || selectedYear != nil else { return photos }

        return photos.filter { photo in
            let calendar = Calendar.current
            let photoMonth = calendar.component(.month, from: photo.createdAt)
            let photoYear = calendar.component(.year, from: photo.createdAt)

            let monthMatch = selectedMonth == nil || photoMonth == selectedMonth
            let yearMatch = selectedYear == nil || photoYear == selectedYear

            return monthMatch && yearMatch
        }
    }

    private var availableYears: [Int] {
        let years = Set(photos.map { Calendar.current.component(.year, from: $0.createdAt) })
        return years.sorted(by: >)
    }

    private var availableMonths: [Int] {
        guard let year = selectedYear else {
            return Array(1...12)
        }
        let months = Set(photos.compactMap { photo -> Int? in
            let calendar = Calendar.current
            let photoYear = calendar.component(.year, from: photo.createdAt)
            guard photoYear == year else { return nil }
            return calendar.component(.month, from: photo.createdAt)
        })
        return months.sorted()
    }

    private var isFiltering: Bool {
        selectedMonth != nil || selectedYear != nil
    }

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            if isLoading {
                ProgressView()
            } else {
                // Immersive scrollable content
                ScrollView {
                    VStack(spacing: 0) {
                        // Immersive Hero Header
                        immersiveHeroHeader

                        // Filter bar (minimal)
                        filterBar
                            .padding(.top, -20)
                            .zIndex(1)

                        // Content based on selected tab
                        switch selectedTab {
                        case .photos:
                            photosViewContent
                        case .collections:
                            CollectionsTabView(album: album, photos: photos)
                                .padding(.top, 16)
                        case .myPicks:
                            MyPicksTabView(album: album, photos: photos)
                                .padding(.top, 16)
                        }
                    }
                }
                .ignoresSafeArea(edges: .top)

                // Selection overlay bar
                if isSelectionMode {
                    VStack {
                        Spacer()
                        selectionGlassBar
                    }
                }
            }
        }
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .confirmationDialog(
            "Delete \(selectedPhotoIds.count) photo\(selectedPhotoIds.count == 1 ? "" : "s")?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task { await deleteSelectedPhotos() }
            }
        } message: {
            Text("This action cannot be undone.")
        }
        .sheet(isPresented: $showSettings) {
            AlbumSettingsView(album: album, photos: photos)
        }
        .sheet(item: $selectedPhoto) { photo in
            PhotoDetailView(photo: photo, albumId: album.id)
        }
        .sheet(isPresented: $showDateFilter) {
            DateFilterSheet(
                selectedMonth: $selectedMonth,
                selectedYear: $selectedYear,
                availableYears: availableYears,
                availableMonths: availableMonths,
                photoCount: filteredPhotos.count
            )
            .presentationDetents([.medium])
        }
        .onAppear {
            guard photos.isEmpty else { return }
            loadTask?.cancel()
            loadTask = Task {
                await loadPhotos()
            }
        }
        .refreshable {
            guard !photoService.isUploading else { return }
            loadTask?.cancel()
            loadTask = Task {
                await loadPhotos()
            }
            await loadTask?.value
        }
        .onChange(of: selectedPhotos) { _, newValue in
            guard !newValue.isEmpty else { return }
            let itemsToUpload = newValue
            selectedPhotos = []
            Task {
                await uploadPhotos(itemsToUpload)
                await loadPhotos()
            }
        }
        .overlay {
            if photoService.isUploading {
                uploadProgressOverlay
            } else if isDeleting {
                deletingOverlay
            } else if isDownloading {
                downloadingOverlay
            }
        }
        .alert("Downloaded", isPresented: $showDownloadSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("\(downloadedCount) photo\(downloadedCount == 1 ? "" : "s") saved to your library")
        }
    }

    // MARK: - Immersive Hero Header

    @Environment(\.dismiss) private var dismiss

    private var immersiveHeroHeader: some View {
        ZStack(alignment: .top) {
            // Cover photo (full bleed)
            if let coverUrl = coverPhotoUrl {
                AsyncImage(url: coverUrl) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        heroPlaceholder
                    }
                }
                .frame(height: 320)
                .clipped()
            } else if let firstPhoto = photos.first {
                PhotoThumbnailView(photo: firstPhoto)
                    .frame(height: 320)
                    .clipped()
            } else {
                heroPlaceholder
            }

            // Gradient overlay for text legibility
            LinearGradient(
                colors: [.black.opacity(0.4), .clear, .black.opacity(0.6)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 320)

            // Top navigation
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(.ultraThinMaterial.opacity(0.6), in: Circle())
                }

                Spacer()

                Menu {
                    PhotosPicker(
                        selection: $selectedPhotos,
                        maxSelectionCount: 50,
                        matching: .any(of: [.images, .videos])
                    ) {
                        Label("Add Photos", systemImage: "plus")
                    }

                    Button {
                        CapsuleHaptics.mediumTap()
                        withAnimation { isSelectionMode = true }
                    } label: {
                        Label("Select", systemImage: "checkmark.circle")
                    }

                    Divider()

                    Button {
                        showSettings = true
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                } label: {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(.ultraThinMaterial.opacity(0.6), in: Circle())
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 54)

            // Album info at bottom of hero - text with shadow for legibility
            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(album.title)
                            .font(.title.weight(.bold))
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.5), radius: 4, y: 2)

                        Text("\(photos.count) Photos")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.9))
                            .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
                    }

                    Spacer()
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 36)
            .frame(height: 320, alignment: .bottom)
        }
        .frame(height: 320)
    }

    private var heroPlaceholder: some View {
        LinearGradient(
            colors: [Color.capsulePrimary.opacity(0.6), Color.capsuleSecondary.opacity(0.4)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(height: 320)
    }

    private var coverPhotoUrl: URL? {
        guard let coverPhotoId = album.coverPhotoId,
              let coverPhoto = photos.first(where: { $0.id == coverPhotoId }) else {
            return nil
        }
        return URL(string: "\(Config.supabaseURL)/storage/v1/object/public/capsule-thumbnails/\(coverPhoto.thumbnailPath)")
    }

    // MARK: - Filter Bar (Minimal)

    private var filterBar: some View {
        HStack(spacing: 0) {
            // Tab dropdown
            Menu {
                ForEach(AlbumTab.allCases, id: \.self) { tab in
                    Button {
                        CapsuleHaptics.selection()
                        withAnimation { selectedTab = tab }
                    } label: {
                        if selectedTab == tab {
                            Label(tab.rawValue, systemImage: "checkmark")
                        } else {
                            Text(tab.rawValue)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(selectedTab.rawValue)
                        .font(.subheadline.weight(.medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(.primary)
            }

            Divider()
                .frame(height: 16)
                .padding(.horizontal, 16)

            // View mode dropdown
            Menu {
                ForEach(AlbumViewMode.allCases, id: \.self) { mode in
                    Button {
                        CapsuleHaptics.selection()
                        withAnimation { viewMode = mode }
                    } label: {
                        Label(mode.rawValue, systemImage: mode.icon)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(viewMode.rawValue)
                        .font(.subheadline.weight(.medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(.secondary)
            }

            Divider()
                .frame(height: 16)
                .padding(.horizontal, 16)

            // Date filter dropdown
            Menu {
                Button {
                    selectedMonth = nil
                    selectedYear = nil
                } label: {
                    if !isFiltering {
                        Label("All Dates", systemImage: "checkmark")
                    } else {
                        Text("All Dates")
                    }
                }

                Divider()

                ForEach(availableYears, id: \.self) { year in
                    Menu(String(year)) {
                        Button {
                            selectedYear = year
                            selectedMonth = nil
                        } label: {
                            if selectedYear == year && selectedMonth == nil {
                                Label("All of \(String(year))", systemImage: "checkmark")
                            } else {
                                Text("All of \(String(year))")
                            }
                        }

                        Divider()

                        ForEach(monthsForYear(year), id: \.self) { month in
                            Button {
                                selectedYear = year
                                selectedMonth = month
                            } label: {
                                let monthName = Calendar.current.monthSymbols[month - 1]
                                if selectedYear == year && selectedMonth == month {
                                    Label(monthName, systemImage: "checkmark")
                                } else {
                                    Text(monthName)
                                }
                            }
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(isFiltering ? filterDescription : "Date")
                        .font(.subheadline.weight(.medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(isFiltering ? Color.capsulePrimary : .secondary)
            }

            Spacer()

            // Clear filter button (if active)
            if isFiltering {
                Button {
                    CapsuleHaptics.selection()
                    selectedMonth = nil
                    selectedYear = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
        )
        .padding(.horizontal, 16)
    }

    private func monthsForYear(_ year: Int) -> [Int] {
        let months = Set(photos.compactMap { photo -> Int? in
            let calendar = Calendar.current
            let photoYear = calendar.component(.year, from: photo.createdAt)
            guard photoYear == year else { return nil }
            return calendar.component(.month, from: photo.createdAt)
        })
        return months.sorted()
    }

    // MARK: - Photos View Content (switches by viewMode)

    @ViewBuilder
    private var photosViewContent: some View {
        if photos.isEmpty {
            ContentUnavailableView {
                Label("No Photos", systemImage: "photo")
            } description: {
                Text("Add photos to start building your album")
            }
            .padding(.top, 60)
        } else if filteredPhotos.isEmpty && isFiltering {
            ContentUnavailableView {
                Label("No Photos", systemImage: "calendar.badge.exclamationmark")
            } description: {
                Text("No photos found for this date range")
            } actions: {
                Button("Clear Filter") {
                    selectedMonth = nil
                    selectedYear = nil
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.top, 60)
        } else {
            switch viewMode {
            case .grid:
                photoSectionsView
            case .capsule:
                capsuleFlowView
                    .padding(.top, 16)
            case .carousel:
                carouselView
                    .frame(height: 500)
                    .padding(.top, 16)
            case .mosaic:
                mosaicView
                    .frame(minHeight: 600)
                    .padding(.top, 16)
            }
        }
    }

    // MARK: - Photo Sections View (Grouped by Time - Grid mode)

    private var photoSectionsView: some View {
        LazyVStack(spacing: 24, pinnedViews: []) {
            ForEach(groupedPhotos, id: \.0) { group, groupPhotos in
                photoSection(group: group, photos: groupPhotos)
            }
        }
        .padding(.top, 24)
        .padding(.bottom, 100)
    }

    private func photoSection(group: TimeGroup, photos: [Photo]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(group.rawValue)
                        .font(.title3.weight(.semibold))

                    Text("\(photos.count) photos")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20)

            // Asymmetric photo cluster
            photoCluster(photos: photos)
        }
    }

    private func photoCluster(photos: [Photo]) -> some View {
        let maxDisplay = 5
        let displayPhotos = Array(photos.prefix(maxDisplay))
        let overflow = photos.count - maxDisplay

        return HStack(spacing: 4) {
            // Large photo (first)
            if let first = displayPhotos.first {
                photoClusterCell(photo: first, size: .large)
            }

            // Grid of smaller photos
            if displayPhotos.count > 1 {
                VStack(spacing: 4) {
                    HStack(spacing: 4) {
                        ForEach(displayPhotos.dropFirst().prefix(2)) { photo in
                            photoClusterCell(photo: photo, size: .small)
                        }
                    }

                    HStack(spacing: 4) {
                        ForEach(displayPhotos.dropFirst(3).prefix(1)) { photo in
                            photoClusterCell(photo: photo, size: .small)
                        }

                        // Overflow indicator or last photo
                        if overflow > 0 {
                            overflowCell(count: overflow)
                        } else if displayPhotos.count > 4 {
                            if let last = displayPhotos.last {
                                photoClusterCell(photo: last, size: .small)
                            }
                        } else {
                            Color.clear
                                .frame(width: 80, height: 80)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    private enum ClusterSize {
        case large, small

        var dimension: CGFloat {
            switch self {
            case .large: return 168
            case .small: return 80
            }
        }
    }

    private func photoClusterCell(photo: Photo, size: ClusterSize) -> some View {
        PhotoThumbnailView(photo: photo)
            .frame(width: size.dimension, height: size.dimension)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .onTapGesture {
                if isSelectionMode {
                    toggleSelection(photo.id)
                } else {
                    selectedPhoto = photo
                }
            }
            .onLongPressGesture(minimumDuration: 0.5) {
                CapsuleHaptics.mediumTap()
                withAnimation {
                    isSelectionMode = true
                    selectedPhotoIds.insert(photo.id)
                }
            }
            .overlay {
                if isSelectionMode {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(selectedPhotoIds.contains(photo.id) ? Color.capsulePrimary.opacity(0.3) : .clear)
                        .overlay(alignment: .topTrailing) {
                            Image(systemName: selectedPhotoIds.contains(photo.id) ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .foregroundStyle(selectedPhotoIds.contains(photo.id) ? Color.capsulePrimary : .white)
                                .shadow(radius: 4)
                                .padding(8)
                        }
                }
            }
    }

    private func overflowCell(count: Int) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemGray5))

            Text("+\(count)")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(width: 80, height: 80)
    }

    private func toggleSelection(_ id: UUID) {
        CapsuleHaptics.selection()
        if selectedPhotoIds.contains(id) {
            selectedPhotoIds.remove(id)
        } else {
            selectedPhotoIds.insert(id)
        }
    }

    private var groupedPhotos: [(TimeGroup, [Photo])] {
        TimeGrouping.group(filteredPhotos)
    }

    // MARK: - Selection Mode Glass Bar

    private var selectionGlassBar: some View {
        VStack(spacing: 12) {
            Spacer()

            HStack(spacing: 16) {
                // Cancel
                Button {
                    CapsuleHaptics.lightTap()
                    withAnimation(CapsuleDesign.animationNormal) {
                        isSelectionMode = false
                        selectedPhotoIds.removeAll()
                    }
                } label: {
                    Text("Cancel")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }

                Spacer()

                // Selection count pill
                Text("\(selectedPhotoIds.count)")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.capsulePrimary)
                    .clipShape(Capsule())

                Spacer()

                // Action buttons
                HStack(spacing: 12) {
                    // Select All
                    Button {
                        CapsuleHaptics.selection()
                        if selectedPhotoIds.count == filteredPhotos.count {
                            selectedPhotoIds.removeAll()
                        } else {
                            selectedPhotoIds = Set(filteredPhotos.map { $0.id })
                        }
                    } label: {
                        Image(systemName: selectedPhotoIds.count == filteredPhotos.count ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 20))
                            .foregroundStyle(Color.capsulePrimary)
                            .frame(width: 44, height: 44)
                    }

                    // Download
                    Button {
                        Task { await downloadSelectedPhotos() }
                    } label: {
                        Image(systemName: "arrow.down.circle")
                            .font(.system(size: 20))
                            .foregroundStyle(selectedPhotoIds.isEmpty ? .tertiary : .primary)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(selectedPhotoIds.isEmpty || isDownloading)

                    // Delete
                    Button {
                        CapsuleHaptics.mediumTap()
                        showDeleteConfirmation = true
                    } label: {
                        Image(systemName: "trash.circle")
                            .font(.system(size: 20))
                            .foregroundColor(selectedPhotoIds.isEmpty ? .gray : .red)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(selectedPhotoIds.isEmpty)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
            .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Photos Content with Hero Header

    @ViewBuilder
    private var photosContentWithHero: some View {
        if photos.isEmpty {
            ContentUnavailableView {
                Label("No Photos", systemImage: "photo")
            } description: {
                Text("Add photos to start building your album")
            }
        } else if filteredPhotos.isEmpty && isFiltering {
            ContentUnavailableView {
                Label("No Photos", systemImage: "calendar.badge.exclamationmark")
            } description: {
                Text("No photos found for this date range")
            } actions: {
                Button("Clear Filter") {
                    selectedMonth = nil
                    selectedYear = nil
                }
                .buttonStyle(.borderedProminent)
            }
        } else {
            VStack(spacing: 0) {
                // Date filter bar
                if isFiltering {
                    dateFilterBar
                }

                switch viewMode {
                case .grid:
                    gridViewWithHeroAndCollections
                case .capsule:
                    capsuleFlowView
                case .carousel:
                    carouselView
                case .mosaic:
                    mosaicView
                }
            }
        }
    }

    // MARK: - Legacy Photos Content (for other view modes)

    @ViewBuilder
    private var photosContent: some View {
        if photos.isEmpty {
            ContentUnavailableView {
                Label("No Photos", systemImage: "photo")
            } description: {
                Text("Add photos to start building your album")
            }
        } else if filteredPhotos.isEmpty && isFiltering {
            ContentUnavailableView {
                Label("No Photos", systemImage: "calendar.badge.exclamationmark")
            } description: {
                Text("No photos found for this date range")
            } actions: {
                Button("Clear Filter") {
                    selectedMonth = nil
                    selectedYear = nil
                }
                .buttonStyle(.borderedProminent)
            }
        } else {
            VStack(spacing: 0) {
                // Date filter bar
                if isFiltering {
                    dateFilterBar
                }

                switch viewMode {
                case .grid:
                    gridViewWithCollections
                case .capsule:
                    capsuleFlowView
                case .carousel:
                    carouselView
                case .mosaic:
                    mosaicView
                }
            }
        }
    }

    // MARK: - Grid View with Hero Header and Collections

    private var gridViewWithHeroAndCollections: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let columns = 3
            let totalSpacing = spacing * CGFloat(columns - 1)
            let cellSize = (geo.size.width - totalSpacing) / CGFloat(columns)

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    // Hero header at top (collapsible)
                    if showHeroHeader && !isSelectionMode {
                        AlbumHeroHeader(
                            album: album,
                            photos: photos,
                            members: members,
                            photoCount: photos.count
                        )
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Collections row
                    collectionsHeaderRow

                    // Time-grouped photo grid
                    ForEach(groupedPhotos, id: \.0) { group, groupPhotos in
                        Section {
                            LazyVGrid(
                                columns: Array(repeating: GridItem(.fixed(cellSize), spacing: spacing), count: columns),
                                spacing: spacing
                            ) {
                                ForEach(groupPhotos) { photo in
                                    selectablePhotoCell(photo: photo, size: cellSize)
                                }
                            }
                        } header: {
                            TimeGroupSectionHeader(group: group, photoCount: groupPhotos.count)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Grid View with Collections Header (no hero)

    private var gridViewWithCollections: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let columns = 3
            let totalSpacing = spacing * CGFloat(columns - 1)
            let cellSize = (geo.size.width - totalSpacing) / CGFloat(columns)

            ScrollView {
                LazyVStack(spacing: 0) {
                    // Collections row at top
                    collectionsHeaderRow

                    // Photo grid
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(cellSize), spacing: spacing), count: columns), spacing: spacing) {
                        ForEach(filteredPhotos) { photo in
                            selectablePhotoCell(photo: photo, size: cellSize)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Collections Header Row

    @ViewBuilder
    private var collectionsHeaderRow: some View {
        CollectionsHeaderView(album: album, photos: photos)
    }

    // MARK: - Date Filter Bar

    private var dateFilterBar: some View {
        HStack {
            Text(filterDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Spacer()

            Text("\(filteredPhotos.count) photos")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Button {
                withAnimation {
                    selectedMonth = nil
                    selectedYear = nil
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
    }

    private var filterDescription: String {
        let calendar = Calendar.current
        let monthName = selectedMonth.map { calendar.monthSymbols[$0 - 1] }
        if let month = monthName, let year = selectedYear {
            return "\(month) \(String(year))"
        } else if let year = selectedYear {
            return String(year)
        } else if let month = monthName {
            return month
        }
        return "All"
    }

    // MARK: - Grid View (Classic - used by other view modes)

    private var gridView: some View {
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let columns = 3
            let totalSpacing = spacing * CGFloat(columns - 1)
            let cellSize = (geo.size.width - totalSpacing) / CGFloat(columns)

            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(cellSize), spacing: spacing), count: columns), spacing: spacing) {
                    ForEach(filteredPhotos) { photo in
                        selectablePhotoCell(photo: photo, size: cellSize)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func selectablePhotoCell(photo: Photo, size: CGFloat) -> some View {
        let isSelected = selectedPhotoIds.contains(photo.id)

        Group {
            if isSelectionMode {
                // Selection mode: prominent purple selection with scale effect
                PhotoThumbnailView(photo: photo)
                    .frame(width: size, height: size)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall))
                    .overlay {
                        RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall)
                            .fill(isSelected ? Color.capsulePrimary.opacity(0.3) : Color.clear)
                    }
                    .overlay(alignment: .topTrailing) {
                        ZStack {
                            Circle()
                                .fill(isSelected ? Color.capsulePrimary : Color.black.opacity(0.4))
                                .frame(width: 28, height: 28)

                            Image(systemName: isSelected ? "checkmark" : "")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .padding(6)
                        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall)
                            .stroke(isSelected ? Color.capsulePrimary : Color.clear, lineWidth: 3)
                    }
                    .scaleEffect(isSelected ? 0.95 : 1.0)
                    .animation(CapsuleDesign.animationQuick, value: isSelected)
                    .onTapGesture {
                        CapsuleHaptics.selection()
                        withAnimation(CapsuleDesign.animationQuick) {
                            if isSelected {
                                selectedPhotoIds.remove(photo.id)
                            } else {
                                selectedPhotoIds.insert(photo.id)
                            }
                        }
                    }
            } else {
                // Normal mode: interactive cell with double-tap and context menu
                InteractivePhotoCell(photo: photo, size: size) {
                    selectedPhoto = photo
                }
                .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusSmall))
                .onLongPressGesture(minimumDuration: 0.5) {
                    CapsuleHaptics.mediumTap()
                    withAnimation(CapsuleDesign.animationNormal) {
                        isSelectionMode = true
                        selectedPhotoIds.insert(photo.id)
                    }
                }
            }
        }
    }

    // MARK: - Capsule Flow View (Signature alternating layout)

    private var capsuleFlowView: some View {
        CapsuleFlowLayout(
            photos: filteredPhotos,
            isSelectionMode: isSelectionMode,
            selectedPhotoIds: $selectedPhotoIds,
            onPhotoTap: { photo in
                selectedPhoto = photo
            },
            onLongPress: { photo in
                withAnimation(CapsuleDesign.animationNormal) {
                    isSelectionMode = true
                    selectedPhotoIds.insert(photo.id)
                }
            }
        )
    }

    // MARK: - Carousel View (Full-width horizontal swipe)

    private var carouselView: some View {
        GeometryReader { geo in
            TabView {
                ForEach(filteredPhotos) { photo in
                    VStack(spacing: 0) {
                        Spacer()

                        // Photo card
                        ZStack(alignment: .bottom) {
                            PhotoThumbnailView(photo: photo)
                                .frame(width: geo.size.width - 40, height: geo.size.height - 160)
                                .clipped()

                            // Bottom info overlay
                            VStack(spacing: 4) {
                                Spacer()

                                LinearGradient(
                                    colors: [.clear, .black.opacity(0.7)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                                .frame(height: 80)

                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(photo.createdAt, style: .date)
                                            .font(.subheadline.weight(.medium))
                                        if photo.mediaType == .video {
                                            Label("Video", systemImage: "play.fill")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()

                                    // Like indicator (could show count)
                                    Image(systemName: "heart")
                                        .font(.title3)
                                        .foregroundStyle(.white.opacity(0.8))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, CapsuleDesign.spacingLoose)
                                .padding(.bottom, CapsuleDesign.spacingRelaxed)
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusLarge))
                        .capsuleShadow(.strong)
                        .onTapGesture {
                            selectedPhoto = photo
                        }

                        Spacer()

                        // Photo counter
                        if let index = filteredPhotos.firstIndex(where: { $0.id == photo.id }) {
                            Text("\(index + 1) of \(filteredPhotos.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.bottom, CapsuleDesign.spacingLoose)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
    }

    // MARK: - Mosaic View (Featured + grid mix)

    private var mosaicView: some View {
        GeometryReader { geo in
            let spacing: CGFloat = CapsuleDesign.spacingNormal
            let width = geo.size.width - spacing * 2

            ScrollView {
                LazyVStack(spacing: spacing) {
                    ForEach(Array(stride(from: 0, to: filteredPhotos.count, by: 5)), id: \.self) { startIndex in
                        mosaicSection(startIndex: startIndex, totalWidth: width, spacing: spacing)
                    }
                }
                .padding(.horizontal, spacing)
                .padding(.vertical, spacing)
            }
        }
    }

    @ViewBuilder
    private func mosaicSection(startIndex: Int, totalWidth: CGFloat, spacing: CGFloat) -> some View {
        let remaining = filteredPhotos.count - startIndex
        let sectionPhotos = Array(filteredPhotos[startIndex..<min(startIndex + 5, filteredPhotos.count)])
        let largeSize = (totalWidth * 2 / 3) - spacing / 2
        let smallSize = (totalWidth / 3) - spacing / 2
        let halfWidth = (totalWidth / 2) - spacing / 2

        if remaining >= 5 {
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    // Featured large photo
                    mosaicCell(photo: sectionPhotos[0], width: largeSize, height: 220)

                    VStack(spacing: spacing) {
                        mosaicCell(photo: sectionPhotos[1], width: smallSize, height: 106)
                        mosaicCell(photo: sectionPhotos[2], width: smallSize, height: 106)
                    }
                }

                HStack(spacing: spacing) {
                    mosaicCell(photo: sectionPhotos[3], width: halfWidth, height: 140)
                    mosaicCell(photo: sectionPhotos[4], width: halfWidth, height: 140)
                }
            }
        } else if remaining >= 3 {
            // 3-4 photos: one large, rest small
            HStack(spacing: spacing) {
                mosaicCell(photo: sectionPhotos[0], width: largeSize, height: 180)

                VStack(spacing: spacing) {
                    ForEach(sectionPhotos.dropFirst().prefix(2)) { photo in
                        mosaicCell(photo: photo, width: smallSize, height: (180 - spacing) / 2)
                    }
                }
            }
        } else {
            // 1-2 photos: equal width
            HStack(spacing: spacing) {
                ForEach(sectionPhotos) { photo in
                    mosaicCell(photo: photo, width: (totalWidth - spacing * CGFloat(sectionPhotos.count - 1)) / CGFloat(sectionPhotos.count), height: 160)
                }
            }
        }
    }

    private func mosaicCell(photo: Photo, width: CGFloat, height: CGFloat) -> some View {
        ZStack(alignment: .bottomLeading) {
            PhotoThumbnailView(photo: photo)
                .frame(width: width, height: height)
                .clipped()

            // Video indicator
            if photo.mediaType == .video {
                HStack {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .shadow(radius: 4)
                    Spacer()
                }
                .padding(CapsuleDesign.spacingNormal)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: CapsuleDesign.cornerRadiusMedium))
        .capsuleShadow(.subtle)
        .onTapGesture {
            selectedPhoto = photo
        }
    }

    // MARK: - Helpers

    private var uploadProgressOverlay: some View {
        VStack(spacing: 16) {
            ProgressView(value: photoService.uploadProgress)
                .frame(width: 200)
            Text("Uploading...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .background(.regularMaterial)
        .cornerRadius(16)
    }

    private var deletingOverlay: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Deleting...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .background(.regularMaterial)
        .cornerRadius(16)
    }

    private var downloadingOverlay: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Downloading \(downloadProgress.current)/\(downloadProgress.total)...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .background(.regularMaterial)
        .cornerRadius(16)
    }

    private func loadPhotos() async {
        isLoading = photos.isEmpty

        // Fetch photos and members in parallel
        async let fetchedPhotos = photoService.fetchPhotos(albumId: album.id)
        async let fetchedMembers = memberService.fetchMembers(albumId: album.id)

        let (photoResults, memberResults) = await (fetchedPhotos, fetchedMembers)

        if !photoResults.isEmpty {
            photos = photoResults
        }
        members = memberResults
        isLoading = false
    }

    private func uploadPhotos(_ items: [PhotosPickerItem]) async {
        let uploaded = await photoService.uploadPhotos(from: items, to: album.id)
        photos.insert(contentsOf: uploaded, at: 0)
    }

    private func deleteSelectedPhotos() async {
        isDeleting = true
        var deletedIds: Set<UUID> = []

        for photoId in selectedPhotoIds {
            if await photoService.deletePhoto(id: photoId) {
                deletedIds.insert(photoId)
            }
        }

        // Remove deleted photos from local array
        photos.removeAll { deletedIds.contains($0.id) }
        selectedPhotoIds.removeAll()
        isSelectionMode = false
        isDeleting = false
    }

    private func downloadSelectedPhotos() async {
        let photosToDownload = photos.filter { selectedPhotoIds.contains($0.id) }
        guard !photosToDownload.isEmpty else { return }

        isDownloading = true
        downloadProgress = (0, photosToDownload.count)
        downloadedCount = 0

        let cloudStorage = CloudStorageService()

        for (index, photo) in photosToDownload.enumerated() {
            downloadProgress = (index + 1, photosToDownload.count)

            // Skip videos for now - just download images
            guard photo.mediaType == .photo else { continue }

            do {
                // Try iCloud first
                let data = try await cloudStorage.downloadPhoto(reference: photo.originalUri)
                if let image = UIImage(data: data) {
                    UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                    downloadedCount += 1
                }
            } catch {
                // Fallback to thumbnail
                if let url = photo.thumbnailUrl {
                    do {
                        let (data, _) = try await URLSession.shared.data(from: url)
                        if let image = UIImage(data: data) {
                            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                            downloadedCount += 1
                        }
                    } catch {
                        print("[AlbumDetailView] Failed to download photo \(photo.id): \(error)")
                    }
                }
            }
        }

        isDownloading = false
        selectedPhotoIds.removeAll()
        isSelectionMode = false

        if downloadedCount > 0 {
            showDownloadSuccess = true
        }
    }
}

// MARK: - Collections Tab View

struct CollectionsTabView: View {
    let album: Album
    let photos: [Photo]

    @StateObject private var subsetService = SubsetService.shared
    @State private var collections: [Subset] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var selectedCollection: Subset?

    // Filter to only show non-personal collections
    private var sharedCollections: [Subset] {
        collections.filter { !$0.isPersonal }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading...")
            } else if sharedCollections.isEmpty {
                ContentUnavailableView {
                    Label("No Collections", systemImage: "rectangle.stack")
                } description: {
                    Text("Create collections to organize photos for everyone")
                } actions: {
                    Button("Create Collection") {
                        showCreateSheet = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(sharedCollections) { collection in
                            CollectionCardView(
                                collection: collection,
                                photos: photos.filter { collection.photoIds.contains($0.id) }
                            )
                            .onTapGesture {
                                selectedCollection = collection
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateSubsetSheet(albumId: album.id, photos: photos, onCreate: { newCollection in
                collections.insert(newCollection, at: 0)
            }, isPersonalPicks: false)
        }
        .sheet(item: $selectedCollection) { collection in
            SubsetDetailSheet(
                subset: collection,
                allPhotos: photos,
                onUpdate: { updated in
                    if let index = collections.firstIndex(where: { $0.id == updated.id }) {
                        collections[index] = updated
                    }
                },
                onDelete: {
                    collections.removeAll { $0.id == collection.id }
                }
            )
        }
        .task {
            await loadCollections()
        }
    }

    private func loadCollections() async {
        isLoading = collections.isEmpty
        collections = await subsetService.fetchSubsets(albumId: album.id)
        isLoading = false
    }
}

// MARK: - My Picks Tab View

struct MyPicksTabView: View {
    let album: Album
    let photos: [Photo]

    @StateObject private var subsetService = SubsetService.shared
    @State private var myPicks: [Subset] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var selectedPick: Subset?

    // Filter to only show personal collections
    private var personalPicks: [Subset] {
        myPicks.filter { $0.isPersonal }
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading...")
            } else if personalPicks.isEmpty {
                ContentUnavailableView {
                    Label("No Picks Yet", systemImage: "star")
                } description: {
                    Text("Create personal picks that only you can see")
                } actions: {
                    Button("Create Picks") {
                        showCreateSheet = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(personalPicks) { pick in
                            CollectionCardView(
                                collection: pick,
                                photos: photos.filter { pick.photoIds.contains($0.id) },
                                isPersonal: true
                            )
                            .onTapGesture {
                                selectedPick = pick
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            CreateSubsetSheet(albumId: album.id, photos: photos, onCreate: { newPick in
                myPicks.insert(newPick, at: 0)
            }, isPersonalPicks: true)
        }
        .sheet(item: $selectedPick) { pick in
            SubsetDetailSheet(
                subset: pick,
                allPhotos: photos,
                onUpdate: { updated in
                    if let index = myPicks.firstIndex(where: { $0.id == updated.id }) {
                        myPicks[index] = updated
                    }
                },
                onDelete: {
                    myPicks.removeAll { $0.id == pick.id }
                }
            )
        }
        .task {
            await loadPicks()
        }
    }

    private func loadPicks() async {
        isLoading = myPicks.isEmpty
        myPicks = await subsetService.fetchSubsets(albumId: album.id)
        isLoading = false
    }
}

// MARK: - Collections Header View (horizontal row in All tab)

struct CollectionsHeaderView: View {
    let album: Album
    let photos: [Photo]

    @StateObject private var subsetService = SubsetService.shared
    @State private var collections: [Subset] = []
    @State private var myPicks: [Subset] = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var selectedCollection: Subset?

    private var sharedCollections: [Subset] {
        collections.filter { !$0.isPersonal }
    }

    private var personalPicks: [Subset] {
        myPicks.filter { $0.isPersonal }
    }

    private var hasContent: Bool {
        !sharedCollections.isEmpty || !personalPicks.isEmpty
    }

    var body: some View {
        if !isLoading && hasContent {
            VStack(alignment: .leading, spacing: 8) {
                // Section header
                HStack {
                    Text("Collections")
                        .font(.headline)
                    Spacer()
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus.circle")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 12)

                // Horizontal scroll of collection cards
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        // Shared collections
                        ForEach(sharedCollections) { collection in
                            CollectionMiniCardView(
                                collection: collection,
                                photos: photos.filter { collection.photoIds.contains($0.id) },
                                isPersonal: false
                            )
                            .onTapGesture {
                                selectedCollection = collection
                            }
                        }

                        // Personal picks
                        ForEach(personalPicks) { pick in
                            CollectionMiniCardView(
                                collection: pick,
                                photos: photos.filter { pick.photoIds.contains($0.id) },
                                isPersonal: true
                            )
                            .onTapGesture {
                                selectedCollection = pick
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 12)
                }
            }
            .background(Color(.systemBackground))
            .sheet(isPresented: $showCreateSheet) {
                CreateSubsetSheet(albumId: album.id, photos: photos, onCreate: { newCollection in
                    if newCollection.isPersonal {
                        myPicks.insert(newCollection, at: 0)
                    } else {
                        collections.insert(newCollection, at: 0)
                    }
                }, isPersonalPicks: false)
            }
            .sheet(item: $selectedCollection) { collection in
                SubsetDetailSheet(
                    subset: collection,
                    allPhotos: photos,
                    onUpdate: { updated in
                        if updated.isPersonal {
                            if let index = myPicks.firstIndex(where: { $0.id == updated.id }) {
                                myPicks[index] = updated
                            }
                        } else {
                            if let index = collections.firstIndex(where: { $0.id == updated.id }) {
                                collections[index] = updated
                            }
                        }
                    },
                    onDelete: {
                        collections.removeAll { $0.id == collection.id }
                        myPicks.removeAll { $0.id == collection.id }
                    }
                )
            }
        }

        EmptyView()
            .task {
                await loadCollections()
            }
    }

    private func loadCollections() async {
        isLoading = true
        let allSubsets = await subsetService.fetchSubsets(albumId: album.id)
        collections = allSubsets.filter { !$0.isPersonal }
        myPicks = allSubsets.filter { $0.isPersonal }
        isLoading = false
    }
}

// MARK: - Collection Mini Card View (for horizontal scroll)

struct CollectionMiniCardView: View {
    let collection: Subset
    let photos: [Photo]
    var isPersonal: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Thumbnail preview (2x2 grid or single)
            ZStack {
                if photos.isEmpty {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.systemGray5))
                        .overlay {
                            Image(systemName: "photo.stack")
                                .foregroundStyle(.secondary)
                        }
                } else if photos.count == 1 {
                    AsyncImage(url: photos[0].thumbnailUrl) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        default:
                            Color(.systemGray5)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    // 2x2 grid preview
                    VStack(spacing: 1) {
                        HStack(spacing: 1) {
                            thumbnailCell(index: 0)
                            thumbnailCell(index: 1)
                        }
                        HStack(spacing: 1) {
                            thumbnailCell(index: 2)
                            thumbnailCell(index: 3)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(width: 100, height: 100)

            // Label
            HStack(spacing: 4) {
                if isPersonal {
                    Image(systemName: "lock.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                Text(collection.name)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
            }

            Text("\(photos.count)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(width: 100)
    }

    @ViewBuilder
    private func thumbnailCell(index: Int) -> some View {
        if index < photos.count {
            AsyncImage(url: photos[index].thumbnailUrl) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color(.systemGray5)
                }
            }
            .frame(width: 49, height: 49)
            .clipped()
        } else {
            Color(.systemGray5)
                .frame(width: 49, height: 49)
        }
    }
}

// MARK: - Collection Card View

struct CollectionCardView: View {
    let collection: Subset
    let photos: [Photo]
    var isPersonal: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Thumbnail strip
            if photos.isEmpty {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray5))
                    .frame(height: 120)
                    .overlay {
                        Image(systemName: "photo.stack")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                    }
            } else {
                HStack(spacing: 2) {
                    ForEach(photos.prefix(4)) { photo in
                        AsyncImage(url: photo.thumbnailUrl) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                            default:
                                Color(.systemGray5)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 120)
                        .clipped()
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            // Info
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(collection.name)
                        .font(.headline)

                    Text("\(photos.count) photos")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if isPersonal {
                    Image(systemName: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - Photo Thumbnail

struct PhotoThumbnailView: View {
    let photo: Photo

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: photo.thumbnailUrl) { phase in
                switch phase {
                case .empty:
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay {
                            ProgressView()
                        }
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    Rectangle()
                        .fill(Color(.systemGray5))
                        .overlay {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.secondary)
                        }
                @unknown default:
                    EmptyView()
                }
            }

            // Video indicator
            if photo.mediaType == .video {
                Image(systemName: "play.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(6)
            }
        }
    }
}

// MARK: - Date Filter Sheet

struct DateFilterSheet: View {
    @Binding var selectedMonth: Int?
    @Binding var selectedYear: Int?
    let availableYears: [Int]
    let availableMonths: [Int]
    let photoCount: Int

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                yearSection
                monthSection
                footerSection
            }
            .navigationTitle("Filter by Date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var yearSection: some View {
        Section("Year") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    yearButton(year: nil, label: "All")
                    ForEach(availableYears, id: \.self) { year in
                        yearButton(year: year, label: "\(year)")
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    private func yearButton(year: Int?, label: String) -> some View {
        let isSelected = selectedYear == year
        return Button {
            withAnimation { selectedYear = year }
        } label: {
            Text(label)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.blue : Color(.systemGray5))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
    }

    private var monthSection: some View {
        Section("Month") {
            monthGrid
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    private var monthGrid: some View {
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

        return LazyVGrid(columns: columns, spacing: 8) {
            monthButton(month: nil, label: "All", isAvailable: true)
            ForEach(1...12, id: \.self) { month in
                monthButton(
                    month: month,
                    label: months[month - 1],
                    isAvailable: availableMonths.contains(month)
                )
            }
        }
    }

    private func monthButton(month: Int?, label: String, isAvailable: Bool) -> some View {
        let isSelected = selectedMonth == month
        let isDisabled = month != nil && !isAvailable && selectedYear != nil

        return Button {
            withAnimation { selectedMonth = month }
        } label: {
            Text(label)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(isSelected ? Color.blue : Color(.systemGray5))
                .foregroundColor(isSelected ? .white : (isDisabled ? Color(.tertiaryLabel) : .primary))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .disabled(isDisabled)
    }

    private var footerSection: some View {
        Section {
            HStack {
                Text("\(photoCount) photos match")
                    .foregroundStyle(.secondary)
                Spacer()
                if selectedMonth != nil || selectedYear != nil {
                    Button("Clear") {
                        withAnimation {
                            selectedMonth = nil
                            selectedYear = nil
                        }
                    }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        AlbumDetailView(album: Album(
            id: UUID(),
            ownerId: UUID(),
            title: "Test Album",
            description: "A test album",
            coverPhotoId: nil,
            privacyMode: .inviteOnly,
            createdAt: .now,
            updatedAt: .now
        ))
    }
}
