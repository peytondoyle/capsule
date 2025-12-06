import Foundation
import UIKit
import PhotosUI
import SwiftUI

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
        do {
            let photos: [Photo] = try await SupabaseService.shared
                .from("photos")
                .select()
                .eq("album_id", value: albumId.uuidString)
                .order("created_at", ascending: false)
                .execute()
                .value
            return photos
        } catch {
            print("[PhotoService] Failed to fetch photos: \(error)")
            return []
        }
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
        guard let userId = AuthManager.shared.userId else { return nil }

        isUploading = true
        uploadProgress = 0
        error = nil

        do {
            // 1. Load the image data
            guard let imageData = try await pickerItem.loadTransferable(type: Data.self) else {
                throw PhotoServiceError.failedToLoadImage
            }
            uploadProgress = 0.1

            guard let image = UIImage(data: imageData) else {
                throw PhotoServiceError.invalidImageData
            }

            // 2. Generate unique filename
            let photoId = UUID()
            let filename = "\(photoId.uuidString).jpg"

            // 3. Upload original to iCloud Drive
            let originalUri = try await cloudStorage.uploadPhoto(
                data: imageData,
                filename: filename
            )
            uploadProgress = 0.4

            // 4. Generate and upload thumbnail
            let thumbnailData = try thumbnailService.generateThumbnail(from: image)
            let thumbnailPath = "\(albumId.uuidString)/\(photoId.uuidString).jpg"

            try await SupabaseService.shared.storage
                .from("capsule-thumbnails")
                .upload(
                    path: thumbnailPath,
                    file: thumbnailData,
                    options: .init(contentType: "image/jpeg")
                )
            uploadProgress = 0.7

            // 5. Create photo record
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

    /// Upload multiple photos
    func uploadPhotos(
        from pickerItems: [PhotosPickerItem],
        to albumId: UUID,
        onProgress: ((Int, Int) -> Void)? = nil
    ) async -> [Photo] {
        var uploadedPhotos: [Photo] = []

        for (index, item) in pickerItems.enumerated() {
            onProgress?(index + 1, pickerItems.count)

            if let photo = await uploadPhoto(from: item, to: albumId) {
                uploadedPhotos.append(photo)
            }
        }

        return uploadedPhotos
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
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .failedToLoadImage:
            return "Failed to load the selected image"
        case .invalidImageData:
            return "The image data is invalid"
        case .uploadFailed(let reason):
            return "Upload failed: \(reason)"
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
