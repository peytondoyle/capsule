import SwiftUI

// MARK: - Lab Home View

/// Entry point for the Lab sandbox.
/// Contains cards linking to each experiment.

struct LabHomeView: View {
    @State private var useMockData = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LabTokens.Spacing.lg) {
                    // Header
                    headerSection

                    // Experiments
                    experimentsSection
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Lab")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: LabTokens.Spacing.sm) {
            Text("Experiments")
                .labFont(.largeTitle)

            Text("Modern UI experiments for Capsule. These screens are isolated from production.")
                .labFont(.body)
                .foregroundStyle(.secondary)

            // Mock data toggle
            Toggle(isOn: $useMockData) {
                HStack {
                    Image(systemName: "testtube.2")
                    Text("Use Mock Data")
                }
                .labFont(.metadata)
            }
            .tint(LabTokens.Colors.primary)
            .padding()
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: LabTokens.Radius.md))
        }
    }

    // MARK: - Experiments Section

    private var experimentsSection: some View {
        VStack(spacing: LabTokens.Spacing.md) {
            NavigationLink {
                LabAlbumsListView(useMockData: useMockData)
            } label: {
                ExperimentCard(
                    title: "Albums List",
                    description: "Modern capsule album cards with staggered animations",
                    icon: "rectangle.stack.fill",
                    gradient: [.purple, .blue]
                )
            }
            .buttonStyle(.plain)

            NavigationLink {
                LabAlbumDetailView(
                    album: MockAlbum.samples[0],
                    useMockData: useMockData
                )
            } label: {
                ExperimentCard(
                    title: "Album Detail",
                    description: "Parallax hero header, filter bar, and memory grid",
                    icon: "photo.stack.fill",
                    gradient: [.blue, .cyan]
                )
            }
            .buttonStyle(.plain)

            Button {
                // Settings is presented as a sheet
            } label: {
                ExperimentCard(
                    title: "Album Settings",
                    description: "Modern sheet with blur material and section cards",
                    icon: "gearshape.fill",
                    gradient: [.orange, .red]
                )
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Experiment Card

struct ExperimentCard: View {
    let title: String
    let description: String
    let icon: String
    let gradient: [Color]

    var body: some View {
        HStack(spacing: LabTokens.Spacing.md) {
            // Icon
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(
                    LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: LabTokens.Radius.md)
                )

            // Text
            VStack(alignment: .leading, spacing: LabTokens.Spacing.xxs) {
                Text(title)
                    .labFont(.cardTitle)
                    .foregroundStyle(.primary)

                Text(description)
                    .labFont(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(.tertiary)
        }
        .padding(LabTokens.Spacing.md)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: LabTokens.Radius.lg))
        .labElevation(.low)
    }
}

// MARK: - Preview

#Preview {
    LabHomeView()
}
