import SwiftUI

// MARK: - Capsule Brand Colors

extension Color {
    // Primary brand colors
    static let capsulePrimary = Color(red: 0.4, green: 0.3, blue: 0.9)      // Deep purple
    static let capsuleSecondary = Color(red: 0.6, green: 0.4, blue: 0.95)   // Light purple
    static let capsuleAccent = Color(red: 0.95, green: 0.6, blue: 0.4)      // Warm coral

    // Gradient colors
    static let capsuleGradientStart = Color(red: 0.35, green: 0.25, blue: 0.85)
    static let capsuleGradientEnd = Color(red: 0.5, green: 0.35, blue: 0.95)

    // Semantic colors
    static let capsuleLike = Color(red: 0.95, green: 0.3, blue: 0.4)        // Heart red
    static let capsuleSuccess = Color(red: 0.3, green: 0.8, blue: 0.5)      // Green
    static let capsuleWarning = Color(red: 0.95, green: 0.7, blue: 0.3)     // Amber

    // Surface colors (adaptive for light/dark mode)
    static let capsuleSurface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.12, green: 0.11, blue: 0.18, alpha: 1)
            : UIColor(red: 0.98, green: 0.97, blue: 1.0, alpha: 1)
    })

    static let capsuleSurfaceElevated = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.16, green: 0.14, blue: 0.22, alpha: 1)
            : UIColor.white
    })
}

// MARK: - Capsule Gradients

extension LinearGradient {
    /// Primary brand gradient (purple tones)
    static let capsuleGradient = LinearGradient(
        colors: [.capsuleGradientStart, .capsuleGradientEnd],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Hero header gradient with more depth
    static let capsuleHeroGradient = LinearGradient(
        colors: [
            Color(red: 0.3, green: 0.2, blue: 0.75),
            Color(red: 0.45, green: 0.3, blue: 0.9),
            Color(red: 0.55, green: 0.4, blue: 0.95)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Subtle gradient for cards/surfaces
    static let capsuleSubtleGradient = LinearGradient(
        colors: [
            Color.capsulePrimary.opacity(0.1),
            Color.capsuleSecondary.opacity(0.05)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Accent gradient for CTAs
    static let capsuleAccentGradient = LinearGradient(
        colors: [.capsuleAccent, Color(red: 1.0, green: 0.5, blue: 0.35)],
        startPoint: .leading,
        endPoint: .trailing
    )
}

// MARK: - Design Tokens

enum CapsuleDesign {
    // Corner radii
    static let cornerRadiusSmall: CGFloat = 8
    static let cornerRadiusMedium: CGFloat = 12
    static let cornerRadiusLarge: CGFloat = 16
    static let cornerRadiusPill: CGFloat = .infinity

    // Spacing
    static let spacingTight: CGFloat = 4
    static let spacingNormal: CGFloat = 8
    static let spacingRelaxed: CGFloat = 12
    static let spacingLoose: CGFloat = 16
    static let spacingExtraLoose: CGFloat = 24

    // Animations
    static let animationQuick: Animation = .spring(response: 0.25, dampingFraction: 0.8)
    static let animationNormal: Animation = .spring(response: 0.35, dampingFraction: 0.75)
    static let animationBouncy: Animation = .spring(response: 0.4, dampingFraction: 0.6)
    static let animationSlow: Animation = .spring(response: 0.5, dampingFraction: 0.7)

    // Shadows
    enum Shadow {
        case subtle, medium, strong

        var color: Color {
            switch self {
            case .subtle: return .black.opacity(0.08)
            case .medium: return .black.opacity(0.12)
            case .strong: return .black.opacity(0.16)
            }
        }

        var radius: CGFloat {
            switch self {
            case .subtle: return 4
            case .medium: return 8
            case .strong: return 12
            }
        }

        var y: CGFloat {
            switch self {
            case .subtle: return 2
            case .medium: return 4
            case .strong: return 6
            }
        }
    }
}

// MARK: - Shadow View Modifier

struct CapsuleShadow: ViewModifier {
    let shadow: CapsuleDesign.Shadow

    func body(content: Content) -> some View {
        content
            .shadow(
                color: shadow.color,
                radius: shadow.radius,
                x: 0,
                y: shadow.y
            )
    }
}

extension View {
    func capsuleShadow(_ shadow: CapsuleDesign.Shadow) -> some View {
        modifier(CapsuleShadow(shadow: shadow))
    }
}
