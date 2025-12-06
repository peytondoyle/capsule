import Foundation

/// Service for managing iCloud Drive storage
actor CloudStorageService {
    private var containerURL: URL?

    init() {
        // Get iCloud container URL asynchronously
        Task {
            await setupContainer()
        }
    }

    private func setupContainer() {
        // Get iCloud container URL
        containerURL = FileManager.default.url(
            forUbiquityContainerIdentifier: Config.iCloudContainerID
        )?.appendingPathComponent("Documents/Photos")

        // Create directory if needed
        if let containerURL {
            try? FileManager.default.createDirectory(
                at: containerURL,
                withIntermediateDirectories: true
            )
        }
    }

    /// Check if iCloud is available
    var isICloudAvailable: Bool {
        FileManager.default.ubiquityIdentityToken != nil
    }

    /// Upload a photo to iCloud Drive
    /// - Returns: The relative path used as the reference URI
    func uploadPhoto(data: Data, filename: String) async throws -> String {
        guard let containerURL else {
            throw CloudStorageError.iCloudUnavailable
        }

        let fileURL = containerURL.appendingPathComponent(filename)

        // Write file
        try data.write(to: fileURL)

        // Return relative path as reference
        return filename
    }

    /// Get the local URL for a photo reference
    func getPhotoURL(reference: String) -> URL? {
        containerURL?.appendingPathComponent(reference)
    }

    /// Check if a photo file exists locally
    func photoExists(reference: String) -> Bool {
        guard let url = getPhotoURL(reference: reference) else {
            return false
        }
        return FileManager.default.fileExists(atPath: url.path)
    }

    /// Download photo data
    func downloadPhoto(reference: String) async throws -> Data {
        guard let url = getPhotoURL(reference: reference) else {
            throw CloudStorageError.iCloudUnavailable
        }

        // Start download coordinator for cloud files
        var error: NSError?
        NSFileCoordinator().coordinate(
            readingItemAt: url,
            options: .withoutChanges,
            error: &error
        ) { _ in }

        if let error {
            throw error
        }

        // Wait for download if needed
        try await waitForDownload(url: url)

        return try Data(contentsOf: url)
    }

    /// Wait for iCloud file to download
    private func waitForDownload(url: URL) async throws {
        var resourceValues = try url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])

        guard let status = resourceValues.ubiquitousItemDownloadingStatus else {
            return // Local file, no download needed
        }

        if status == .current {
            return // Already downloaded
        }

        // Start downloading
        try FileManager.default.startDownloadingUbiquitousItem(at: url)

        // Poll for completion (with timeout)
        let timeout: TimeInterval = 60
        let start = Date()

        while Date().timeIntervalSince(start) < timeout {
            resourceValues = try url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
            if resourceValues.ubiquitousItemDownloadingStatus == .current {
                return
            }
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
        }

        throw CloudStorageError.downloadTimeout
    }

    /// Delete a photo from iCloud Drive
    func deletePhoto(reference: String) async throws {
        guard let url = getPhotoURL(reference: reference) else {
            return
        }

        try FileManager.default.removeItem(at: url)
    }
}

// MARK: - Errors

enum CloudStorageError: LocalizedError {
    case iCloudUnavailable
    case downloadTimeout
    case fileNotFound

    var errorDescription: String? {
        switch self {
        case .iCloudUnavailable:
            return "iCloud is not available. Please sign in to iCloud in Settings."
        case .downloadTimeout:
            return "The download took too long. Please check your internet connection."
        case .fileNotFound:
            return "The file could not be found."
        }
    }
}
