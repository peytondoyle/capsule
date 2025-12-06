import Foundation
import UIKit

/// Service for generating thumbnails
struct ThumbnailService {
    /// Maximum dimension for thumbnails (maintains aspect ratio)
    let maxDimension: CGFloat = 800

    /// JPEG compression quality (0.0 - 1.0)
    let compressionQuality: CGFloat = 0.7

    /// Target max file size in bytes
    let maxFileSize: Int = 200_000 // 200KB

    /// Generate a thumbnail from an image
    func generateThumbnail(from image: UIImage) throws -> Data {
        // Calculate target size
        let targetSize = calculateTargetSize(for: image.size)

        // Resize image
        let resizedImage = resize(image: image, to: targetSize)

        // Compress to JPEG
        guard var thumbnailData = resizedImage.jpegData(compressionQuality: compressionQuality) else {
            throw ThumbnailError.compressionFailed
        }

        // If still too large, reduce quality further
        var quality = compressionQuality
        while thumbnailData.count > maxFileSize && quality > 0.3 {
            quality -= 0.1
            if let newData = resizedImage.jpegData(compressionQuality: quality) {
                thumbnailData = newData
            }
        }

        return thumbnailData
    }

    /// Calculate target size maintaining aspect ratio
    private func calculateTargetSize(for originalSize: CGSize) -> CGSize {
        let widthRatio = maxDimension / originalSize.width
        let heightRatio = maxDimension / originalSize.height
        let ratio = min(widthRatio, heightRatio)

        // Only resize if larger than max dimension
        if ratio >= 1.0 {
            return originalSize
        }

        return CGSize(
            width: originalSize.width * ratio,
            height: originalSize.height * ratio
        )
    }

    /// Resize an image to target size
    private func resize(image: UIImage, to targetSize: CGSize) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0 // Don't use screen scale for thumbnails

        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)

        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}

// MARK: - Errors

enum ThumbnailError: LocalizedError {
    case compressionFailed

    var errorDescription: String? {
        switch self {
        case .compressionFailed:
            return "Failed to compress the image"
        }
    }
}
