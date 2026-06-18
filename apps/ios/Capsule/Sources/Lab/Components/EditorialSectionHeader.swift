import SwiftUI

// MARK: - Editorial Section Header
// Magazine-style section headers with:
// - Generous breathing room
// - Small horizontal rule
// - Micro-subtitle
// - Anchored typography

struct LabEditorialSectionHeader: View {
    let title: String
    let subtitle: String?
    var showRule: Bool = true

    init(_ title: String, subtitle: String? = nil, showRule: Bool = true) {
        self.title = title
        self.subtitle = subtitle
        self.showRule = showRule
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Title
            Text(title)
                .font(.system(size: 13, weight: .semibold, design: .default))
                .tracking(1.5)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)

            // Horizontal rule
            if showRule {
                Rectangle()
                    .fill(Color.primary.opacity(0.12))
                    .frame(width: 32, height: 2)
            }

            // Subtitle
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 32)
        .padding(.bottom, 16)
    }
}

// MARK: - Photo Group Section Header
// For time-based photo groupings in album detail

struct PhotoGroupHeader: View {
    let title: String
    let photoCount: Int
    let dateInfo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Date/time title
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .font(.system(size: 22, weight: .semibold, design: .default))
                    .tracking(0.2)

                Spacer()

                // Photo count badge
                Text("\(photoCount)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color(.systemGray5), in: Capsule())
            }

            // Horizontal rule with gradient fade
            HStack(spacing: 0) {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Color.primary.opacity(0.15), Color.primary.opacity(0.05)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 1)
            }

            // Date info subtitle
            if let dateInfo = dateInfo {
                Text(dateInfo)
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 12)
    }
}

// MARK: - Collection Header (for Albums list)

struct CollectionHeader: View {
    let title: String
    let count: Int
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                Rectangle()
                    .fill(LabTokens.Colors.primary.opacity(0.3))
                    .frame(width: 24, height: 2)
            }

            Spacer()

            if let action = action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text("See All")
                            .font(.system(size: 12, weight: .medium))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(LabTokens.Colors.primary)
                }
            } else {
                Text("\(count)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }
}

// MARK: - Previews

#Preview("Editorial Section") {
    VStack(spacing: 0) {
        EditorialSectionHeader("Recent Albums", subtitle: "Last 30 days")

        Color(.systemGray5)
            .frame(height: 200)

        EditorialSectionHeader("All Albums")

        Color(.systemGray5)
            .frame(height: 200)
    }
}

#Preview("Photo Group Header") {
    VStack(spacing: 0) {
        PhotoGroupHeader(title: "Today", photoCount: 12, dateInfo: "December 7, 2025")

        Color(.systemGray5)
            .frame(height: 150)

        PhotoGroupHeader(title: "Yesterday", photoCount: 8, dateInfo: "December 6, 2025")

        Color(.systemGray5)
            .frame(height: 150)

        PhotoGroupHeader(title: "This Week", photoCount: 34, dateInfo: nil)

        Color(.systemGray5)
            .frame(height: 150)
    }
}

#Preview("Collection Header") {
    VStack(spacing: 0) {
        CollectionHeader(title: "Recently Added", count: 6) {
            print("See all")
        }

        CollectionHeader(title: "Shared with You", count: 3)
    }
}
