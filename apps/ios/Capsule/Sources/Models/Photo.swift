import Foundation

/// Storage type for original photo
enum PhotoStorageType: String, Codable {
    case icloudDrive = "icloud_drive"
    case tempBucket = "temp_bucket"
}

/// Media type
enum MediaType: String, Codable {
    case photo
    case video
}

/// Photo model
struct Photo: Codable, Identifiable, Equatable {
    let id: UUID
    let albumId: UUID
    let uploaderId: UUID
    let originalUri: String
    let originalStorageType: PhotoStorageType
    let thumbnailPath: String
    let mediaType: MediaType
    let fileSizeBytes: Int64?
    let width: Int?
    let height: Int?
    var isHiddenByOwner: Bool
    var isMissing: Bool
    let exifData: [String: AnyCodable]?
    let createdAt: Date

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
        case isHiddenByOwner = "is_hidden_by_owner"
        case isMissing = "is_missing"
        case exifData = "exif_data"
        case createdAt = "created_at"
    }

    /// Get thumbnail URL from Supabase Storage
    var thumbnailUrl: URL? {
        URL(string: "\(Config.supabaseURL)/storage/v1/object/public/capsule-thumbnails/\(thumbnailPath)")
    }
}

/// Helper for encoding/decoding arbitrary JSON
struct AnyCodable: Codable, Equatable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let arrayValue = try? container.decode([AnyCodable].self) {
            value = arrayValue.map { $0.value }
        } else if let dictValue = try? container.decode([String: AnyCodable].self) {
            value = dictValue.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intValue as Int:
            try container.encode(intValue)
        case let doubleValue as Double:
            try container.encode(doubleValue)
        case let stringValue as String:
            try container.encode(stringValue)
        case let boolValue as Bool:
            try container.encode(boolValue)
        case let arrayValue as [Any]:
            try container.encode(arrayValue.map { AnyCodable($0) })
        case let dictValue as [String: Any]:
            try container.encode(dictValue.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        // Simplified equality check
        String(describing: lhs.value) == String(describing: rhs.value)
    }
}
