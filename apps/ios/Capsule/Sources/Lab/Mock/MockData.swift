import Foundation

// MARK: - Mock Album

struct MockAlbum: Identifiable, Hashable {
    let id: UUID
    let title: String
    let coverUrl: String
    let photoCount: Int
    let memberCount: Int
    let dateRange: String
    let lastUpdated: Date
    let privacy: String

    static let samples: [MockAlbum] = [
        MockAlbum(
            id: UUID(),
            title: "Summer Roadtrip 2024",
            coverUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800",
            photoCount: 247,
            memberCount: 4,
            dateRange: "Jul 5 - Jul 18",
            lastUpdated: Date().addingTimeInterval(-3600),
            privacy: "Private"
        ),
        MockAlbum(
            id: UUID(),
            title: "Sarah's Birthday",
            coverUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800",
            photoCount: 89,
            memberCount: 12,
            dateRange: "Nov 15",
            lastUpdated: Date().addingTimeInterval(-86400 * 3),
            privacy: "Invite Only"
        ),
        MockAlbum(
            id: UUID(),
            title: "NYC Weekend",
            coverUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800",
            photoCount: 156,
            memberCount: 2,
            dateRange: "Oct 20 - Oct 22",
            lastUpdated: Date().addingTimeInterval(-86400 * 7),
            privacy: "Private"
        ),
        MockAlbum(
            id: UUID(),
            title: "Family Thanksgiving",
            coverUrl: "https://images.unsplash.com/photo-1574672280600-4accfa5b6f98?w=800",
            photoCount: 203,
            memberCount: 8,
            dateRange: "Nov 23 - Nov 26",
            lastUpdated: Date().addingTimeInterval(-86400 * 14),
            privacy: "Private"
        ),
        MockAlbum(
            id: UUID(),
            title: "Beach House",
            coverUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
            photoCount: 312,
            memberCount: 6,
            dateRange: "Aug 1 - Aug 7",
            lastUpdated: Date().addingTimeInterval(-86400 * 30),
            privacy: "Invite Only"
        ),
        MockAlbum(
            id: UUID(),
            title: "Hiking Adventures",
            coverUrl: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800",
            photoCount: 178,
            memberCount: 3,
            dateRange: "Sep 2024",
            lastUpdated: Date().addingTimeInterval(-86400 * 45),
            privacy: "Private"
        )
    ]
}

// MARK: - Mock Photo

struct MockPhoto: Identifiable {
    let id: UUID
    let url: String
    let thumbnailUrl: String
    let aspectRatio: CGFloat
    let takenAt: Date
    let uploaderName: String

    static func generateSamples(count: Int = 50) -> [MockPhoto] {
        let unsplashIds = [
            "photo-1506905925346-21bda4d32df4",
            "photo-1469474968028-56623f02e42e",
            "photo-1501785888041-af3ef285b470",
            "photo-1470071459604-3b5ec3a7fe05",
            "photo-1447752875215-b2761acb3c5d",
            "photo-1433086966358-54859d0ed716",
            "photo-1482938289607-e9573fc25ebb",
            "photo-1505144808419-1957a94ca61e",
            "photo-1439066615861-d1af74d74000",
            "photo-1472214103451-9374bd1c798e"
        ]

        let uploaders = ["Sarah", "Mike", "Emma", "You", "Alex"]
        let aspectRatios: [CGFloat] = [1.0, 0.75, 1.33, 0.8, 1.5]

        return (0..<count).map { index in
            let photoId = unsplashIds[index % unsplashIds.count]
            return MockPhoto(
                id: UUID(),
                url: "https://images.unsplash.com/\(photoId)?w=1200",
                thumbnailUrl: "https://images.unsplash.com/\(photoId)?w=400",
                aspectRatio: aspectRatios[index % aspectRatios.count],
                takenAt: Date().addingTimeInterval(-Double(index) * 3600 * 6),
                uploaderName: uploaders[index % uploaders.count]
            )
        }
    }
}

// MARK: - Mock Member

struct MockMember: Identifiable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    let role: String
    let photoCount: Int

    static let samples: [MockMember] = [
        MockMember(id: UUID(), name: "You", avatarUrl: nil, role: "Owner", photoCount: 89),
        MockMember(id: UUID(), name: "Sarah Chen", avatarUrl: "https://i.pravatar.cc/150?img=1", role: "Editor", photoCount: 67),
        MockMember(id: UUID(), name: "Mike Johnson", avatarUrl: "https://i.pravatar.cc/150?img=3", role: "Editor", photoCount: 45),
        MockMember(id: UUID(), name: "Emma Wilson", avatarUrl: "https://i.pravatar.cc/150?img=5", role: "Viewer", photoCount: 23),
        MockMember(id: UUID(), name: "Alex Park", avatarUrl: "https://i.pravatar.cc/150?img=8", role: "Viewer", photoCount: 12)
    ]
}

// MARK: - Mock Photo Group (by day)

struct MockPhotoGroup: Identifiable {
    let id: UUID
    let title: String
    let subtitle: String
    let photos: [MockPhoto]

    static func generateGroups() -> [MockPhotoGroup] {
        let allPhotos = MockPhoto.generateSamples(count: 60)

        return [
            MockPhotoGroup(
                id: UUID(),
                title: "Today",
                subtitle: "12 photos",
                photos: Array(allPhotos[0..<12])
            ),
            MockPhotoGroup(
                id: UUID(),
                title: "Yesterday",
                subtitle: "8 photos",
                photos: Array(allPhotos[12..<20])
            ),
            MockPhotoGroup(
                id: UUID(),
                title: "This Week",
                subtitle: "15 photos",
                photos: Array(allPhotos[20..<35])
            ),
            MockPhotoGroup(
                id: UUID(),
                title: "Last Week",
                subtitle: "25 photos",
                photos: Array(allPhotos[35..<60])
            )
        ]
    }
}
