import Foundation
import UIKit
import PhotosUI
import SwiftUI
import AVFoundation

/// Service for photo operations
@MainActor
final class PhotoService: ObservableObject {
    static let shared = PhotoService()

    @Published var isUploading = false
    @Published var uploadProgress: Double = 0
    @Published var error: Error?

    private let cloudStorage = CloudStorageService()
    private let thumbnailService = ThumbnailService()

    private init() {}

    // MARK: - Fetch Photos

    /// Fetch all photos in an album
    func fetchPhotos(albumId: UUID) async -> [Photo] {
        // Use detached task to avoid cancellation propagation
        return await Task.detached {
            do {
                print("[PhotoService] Fetching photos for album \(albumId)...")
                let photos: [Photo] = try await SupabaseService.shared
                    .from("photos")
                    .select()
                    .eq("album_id", value: albumId.uuidString)
                    .order("created_at", ascending: false)
                    .execute()
                    .value
                print("[PhotoService] Fetched \(photos.count) photos")
                return photos
            } catch {
                print("[PhotoService] Failed to fetch photos: \(error)")
                return []
            }
        }.value
    }

    /// Fetch a single photo by ID
    func fetchPhoto(id: UUID) async -> Photo? {
        do {
            let photo: Photo = try await SupabaseService.shared
                .from("photos")
                .select()
                .eq("id", value: id.uuidString)
                .single()
                .execute()
                .value
            return photo
        } catch {
            print("[PhotoService] Failed to fetch photo \(id): \(error)")
            return nil
        }
    }

    // MARK: - Upload Photo

    /// Upload a photo from PhotosPicker selection
    func uploadPhoto(
        from pickerItem: PhotosPickerItem,
        to albumId: UUID
    ) async -> Photo? {
        guard let userId = AuthManager.shared.userId else {
            print("[PhotoService] No user ID, aborting upload")
            return nil
        }

        print("[PhotoService] Starting upload for album \(albumId)")
        isUploading = true
        uploadProgress = 0
        error = nil

        do {
            // 1. Load the image data
            print("[PhotoService] Loading image data...")
            guard let imageData = try await pickerItem.loadTransferable(type: Data.self) else {
                throw PhotoServiceError.failedToLoadImage
            }
            print("[PhotoService] Loaded \(imageData.count) bytes")
            uploadProgress = 0.1

            guard let image = UIImage(data: imageData) else {
                throw PhotoServiceError.invalidImageData
            }

            // 2. Generate unique filename
            let photoId = UUID()
            let filename = "\(photoId.uuidString).jpg"

            // 3. Upload original to iCloud Drive
            print("[PhotoService] Uploading to iCloud Drive...")
            let originalUri = try await cloudStorage.uploadPhoto(
                data: imageData,
                filename: filename
            )
            print("[PhotoService] iCloud upload complete: \(originalUri)")
            uploadProgress = 0.4

            // 4. Generate and upload thumbnail
            print("[PhotoService] Generating thumbnail...")
            let thumbnailData = try thumbnailService.generateThumbnail(from: image)
            let thumbnailPath = "\(albumId.uuidString)/\(photoId.uuidString).jpg"
            print("[PhotoService] Uploading thumbnail to Supabase...")

            try await SupabaseService.shared.storage
                .from("capsule-thumbnails")
                .upload(
                    thumbnailPath,
                    data: thumbnailData,
                    options: .init(contentType: "image/jpeg")
                )
            print("[PhotoService] Thumbnail upload complete")
            uploadProgress = 0.7

            // 5. Create photo record
            print("[PhotoService] Creating photo record in database...")
            let photoRequest = CreatePhotoRequest(
                id: photoId,
                albumId: albumId,
                uploaderId: userId,
                originalUri: originalUri,
                originalStorageType: .icloudDrive,
                thumbnailPath: thumbnailPath,
                mediaType: .photo,
                fileSizeBytes: Int64(imageData.count),
                width: Int(image.size.width),
                height: Int(image.size.height)
            )

            let createdPhoto: Photo = try await SupabaseService.shared
                .from("photos")
                .insert(photoRequest)
                .select()
                .single()
                .execute()
                .value

            print("[PhotoService] Photo record created: \(createdPhoto.id)")
            uploadProgress = 1.0
            isUploading = false
            return createdPhoto

        } catch {
            self.error = error
            print("[PhotoService] Upload failed: \(error)")
            isUploading = false
            return nil
        }
    }

    /// Upload multiple photos/videos
    func uploadPhotos(
        from pickerItems: [PhotosPickerItem],
        to albumId: UUID,
        onProgress: ((Int, Int) -> Void)? = nil
    ) async -> [Photo] {
        var uploadedPhotos: [Photo] = []

        for (index, item) in pickerItems.enumerated() {
            onProgress?(index + 1, pickerItems.count)

            // Check if it's a video
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                if let photo = await uploadVideo(from: item, to: albumId) {
                    uploadedPhotos.append(photo)
                }
            } else if let photo = await uploadPhoto(from: item, to: albumId) {
                uploadedPhotos.append(photo)
            }
        }

        return uploadedPhotos
    }

    // MARK: - Upload Video

    /// Upload a video from PhotosPicker selection
    func uploadVideo(
        from pickerItem: PhotosPickerItem,
        to albumId: UUID
    ) async -> Photo? {
        guard let userId = AuthManager.shared.userId else {
            print("[PhotoService] No user ID, aborting video upload")
            return nil
        }

        print("[PhotoService] Starting video upload for album \(albumId)")
        isUploading = true
        uploadProgress = 0
        error = nil

        do {
            // 1. Load video data via Movie transferable
            print("[PhotoService] Loading video data...")
            guard let videoURL = try await pickerItem.loadTransferable(type: VideoTransferable.self)?.url else {
                throw PhotoServiceError.failedToLoadVideo
            }
            let videoData = try Data(contentsOf: videoURL)
            print("[PhotoService] Loaded \(videoData.count) bytes of video")
            uploadProgress = 0.1

            // 2. Generate unique filename
            let photoId = UUID()
            let ext = videoURL.pathExtension.lowercased()
            let filename = "\(photoId.uuidString).\(ext.isEmpty ? "mp4" : ext)"

            // 3. Upload video to iCloud Drive
            print("[PhotoService] Uploading video to iCloud Drive...")
            let originalUri = try await cloudStorage.uploadPhoto(
                data: videoData,
                filename: filename
            )
            print("[PhotoService] iCloud video upload complete: \(originalUri)")
            uploadProgress = 0.5

            // 4. Generate thumbnail from video
            print("[PhotoService] Generating video thumbnail...")
            let (thumbnailData, videoSize) = try await generateVideoThumbnail(from: videoURL)
            let thumbnailPath = "\(albumId.uuidString)/\(photoId.uuidString).jpg"

            print("[PhotoService] Uploading video thumbnail to Supabase...")
            try await SupabaseService.shared.storage
                .from("capsule-thumbnails")
                .upload(
                    thumbnailPath,
                    data: thumbnailData,
                    options: .init(contentType: "image/jpeg")
                )
            print("[PhotoService] Video thumbnail upload complete")
            uploadProgress = 0.8

            // 5. Create photo record with video type
            print("[PhotoService] Creating video record in database...")
            let photoRequest = CreatePhotoRequest(
                id: photoId,
                albumId: albumId,
                uploaderId: userId,
                originalUri: originalUri,
                originalStorageType: .icloudDrive,
                thumbnailPath: thumbnailPath,
                mediaType: .video,
                fileSizeBytes: Int64(videoData.count),
                width: videoSize.width,
                height: videoSize.height
            )

            let createdPhoto: Photo = try await SupabaseService.shared
                .from("photos")
                .insert(photoRequest)
                .select()
                .single()
                .execute()
                .value

            print("[PhotoService] Video record created: \(createdPhoto.id)")
            uploadProgress = 1.0
            isUploading = false

            // Clean up temp file
            try? FileManager.default.removeItem(at: videoURL)

            return createdPhoto

        } catch {
            self.error = error
            print("[PhotoService] Video upload failed: \(error)")
            isUploading = false
            return nil
        }
    }

    /// Generate thumbnail from video
    private func generateVideoThumbnail(from videoURL: URL) async throws -> (Data, (width: Int, height: Int)) {
        let asset = AVAsset(url: videoURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 800, height: 800)

        let time = CMTime(seconds: 0.5, preferredTimescale: 600)

        let imageRef = try await generator.image(at: time).image
        let image = UIImage(cgImage: imageRef)

        // Get video dimensions from track using modern async API
        var videoSize = (width: Int(image.size.width), height: Int(image.size.height))
        if let track = try? await asset.loadTracks(withMediaType: .video).first {
            let naturalSize = try? await track.load(.naturalSize)
            let transform = try? await track.load(.preferredTransform)
            if let naturalSize, let transform {
                let size = naturalSize.applying(transform)
                videoSize = (width: Int(abs(size.width)), height: Int(abs(size.height)))
            }
        }

        guard let thumbnailData = image.jpegData(compressionQuality: 0.7) else {
            throw PhotoServiceError.failedToGenerateThumbnail
        }

        return (thumbnailData, videoSize)
    }

    // MARK: - Delete Photo

    /// Delete a photo (uploader only)
    func deletePhoto(id: UUID) async -> Bool {
        do {
            // Get photo first to delete thumbnail
            guard let photo = await fetchPhoto(id: id) else {
                return false
            }

            // Delete thumbnail from storage
            try await SupabaseService.shared.storage
                .from("capsule-thumbnails")
                .remove(paths: [photo.thumbnailPath])

            // Delete photo record
            try await SupabaseService.shared
                .from("photos")
                .delete()
                .eq("id", value: id.uuidString)
                .execute()

            // Note: Original in iCloud Drive is NOT deleted
            // User manages their own cloud storage

            return true
        } catch {
            self.error = error
            print("[PhotoService] Failed to delete photo: \(error)")
            return false
        }
    }

    // MARK: - Hide/Unhide Photo

    /// Toggle hidden state of a photo (owner only)
    func setPhotoHidden(id: UUID, isHidden: Bool) async -> Bool {
        do {
            try await SupabaseService.shared
                .from("photos")
                .update(["is_hidden_by_owner": isHidden])
                .eq("id", value: id.uuidString)
                .execute()
            return true
        } catch {
            self.error = error
            print("[PhotoService] Failed to update photo visibility: \(error)")
            return false
        }
    }
}

// MARK: - Error Types

enum PhotoServiceError: LocalizedError {
    case failedToLoadImage
    case invalidImageData
    case failedToLoadVideo
    case failedToGenerateThumbnail
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .failedToLoadImage:
            return "Failed to load the selected image"
        case .invalidImageData:
            return "The image data is invalid"
        case .failedToLoadVideo:
            return "Failed to load the selected video"
        case .failedToGenerateThumbnail:
            return "Failed to generate thumbnail"
        case .uploadFailed(let reason):
            return "Upload failed: \(reason)"
        }
    }
}

// MARK: - Video Transferable

struct VideoTransferable: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let tempDir = FileManager.default.temporaryDirectory
            let filename = "\(UUID().uuidString).\(received.file.pathExtension)"
            let destURL = tempDir.appendingPathComponent(filename)
            try FileManager.default.copyItem(at: received.file, to: destURL)
            return Self(url: destURL)
        }
    }
}

// MARK: - Request Types

private struct CreatePhotoRequest: Encodable {
    let id: UUID
    let albumId: UUID
    let uploaderId: UUID
    let originalUri: String
    let originalStorageType: PhotoStorageType
    let thumbnailPath: String
    let mediaType: MediaType
    let fileSizeBytes: Int64
    let width: Int
    let height: Int

    enum CodingKeys: String, CodingKey {
        case id
        case albumId = "album_id"
        case uploaderId = "uploader_id"
        case originalUri = "original_uri"
        case originalStorageType = "original_storage_type"
        case thumbnailPath = "thumbnail_path"
        case mediaType = "media_type"
        case fileSizeBytes = "file_size_bytes"
        case width
        case height
    }
}
