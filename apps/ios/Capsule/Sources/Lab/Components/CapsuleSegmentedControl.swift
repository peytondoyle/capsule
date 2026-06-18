import SwiftUI

// MARK: - Capsule Segmented Control

/// Modern floating segmented control with blur material background.
/// Features pill sliding animation and stretch effect on selection.

struct CapsuleSegmentedControl<T: Hashable>: View {
    @Binding var selection: T
    let options: [T]
    let labelProvider: (T) -> String

    @Namespace private var animation

    var body: some View {
        HStack(spacing: LabTokens.Spacing.xxs) {
            ForEach(options, id: \.self) { option in
                segmentButton(for: option)
            }
        }
        .padding(LabTokens.Spacing.xxs)
        .background(.ultraThinMaterial, in: Capsule())
        .labElevation(.low)
    }

    private func segmentButton(for option: T) -> some View {
        let isSelected = selection == option

        return Button {
            withAnimation(LabTokens.Animation.quick) {
                selection = option
            }
        } label: {
            Text(labelProvider(option))
                .labFont(.pill)
                .foregroundStyle(isSelected ? .white : .primary)
                .padding(.horizontal, LabTokens.Spacing.md)
                .padding(.vertical, LabTokens.Spacing.xs)
                .background {
                    if isSelected {
                        Capsule()
                            .fill(LabTokens.Colors.primary)
                            .matchedGeometryEffect(id: "segment", in: animation)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Filter Bar Component

/// Combined filter bar with tab selection and layout mode

struct LabFilterBar: View {
    @Binding var selectedTab: LabTab
    @Binding var selectedLayout: LabLayout
    @Binding var dateFilter: String?

    var body: some View {
        HStack(spacing: 0) {
            // Tab selector
            CapsuleSegmentedControl(
                selection: $selectedTab,
                options: LabTab.allCases,
                labelProvider: { $0.rawValue }
            )

            Spacer()

            // Layout picker
            Menu {
                ForEach(LabLayout.allCases, id: \.self) { layout in
                    Button {
                        withAnimation { selectedLayout = layout }
                    } label: {
                        Label(layout.rawValue, systemImage: layout.icon)
                    }
                }
            } label: {
                HStack(spacing: LabTokens.Spacing.xxs) {
                    Image(systemName: selectedLayout.icon)
                    Image(systemName: "chevron.down")
                        .font(.caption2.bold())
                }
                .foregroundStyle(.secondary)
                .padding(.horizontal, LabTokens.Spacing.sm)
                .padding(.vertical, LabTokens.Spacing.xs)
                .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.horizontal, LabTokens.Spacing.md)
        .padding(.vertical, LabTokens.Spacing.sm)
        .background(
            RoundedRectangle(cornerRadius: LabTokens.Radius.lg)
                .fill(Color(.systemBackground))
                .labElevation(.low)
        )
        .padding(.horizontal, LabTokens.Spacing.md)
    }
}

// MARK: - Supporting Types

enum LabTab: String, CaseIterable {
    case all = "All"
    case collections = "Collections"
    case myPicks = "My Picks"
}

enum LabLayout: String, CaseIterable {
    case grid = "Grid"
    case flow = "Flow"
    case mosaic = "Mosaic"

    var icon: String {
        switch self {
        case .grid: return "square.grid.3x3"
        case .flow: return "rectangle.3.group"
        case .mosaic: return "rectangle.split.3x3"
        }
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var tab: LabTab = .all
        @State private var layout: LabLayout = .grid
        @State private var dateFilter: String? = nil

        var body: some View {
            VStack(spacing: LabTokens.Spacing.xl) {
                CapsuleSegmentedControl(
                    selection: $tab,
                    options: LabTab.allCases,
                    labelProvider: { $0.rawValue }
                )

                LabFilterBar(
                    selectedTab: $tab,
                    selectedLayout: $layout,
                    dateFilter: $dateFilter
                )

                Spacer()
            }
            .padding()
        }
    }

    return PreviewWrapper()
}
