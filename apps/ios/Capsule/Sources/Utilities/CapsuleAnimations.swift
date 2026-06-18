import SwiftUI

// MARK: - Like Burst Ripple Effect

/// Concentric rings expanding outward from the center (like effect)
struct LikeBurstEffect: ViewModifier {
    let isActive: Bool
    @State private var ringScale1: CGFloat = 0.5
    @State private var ringScale2: CGFloat = 0.5
    @State private var ringScale3: CGFloat = 0.5
    @State private var ringOpacity1: Double = 0
    @State private var ringOpacity2: Double = 0
    @State private var ringOpacity3: Double = 0

    func body(content: Content) -> some View {
        ZStack {
            content

            // Three concentric rings
            Circle()
                .stroke(Color.capsuleLike, lineWidth: 3)
                .scaleEffect(ringScale1)
                .opacity(ringOpacity1)

            Circle()
                .stroke(Color.capsuleLike.opacity(0.7), lineWidth: 2)
                .scaleEffect(ringScale2)
                .opacity(ringOpacity2)

            Circle()
                .stroke(Color.capsuleLike.opacity(0.4), lineWidth: 1.5)
                .scaleEffect(ringScale3)
                .opacity(ringOpacity3)
        }
        .onChange(of: isActive) { _, newValue in
            if newValue {
                triggerBurst()
            }
        }
    }

    private func triggerBurst() {
        // Reset
        ringScale1 = 0.5
        ringScale2 = 0.5
        ringScale3 = 0.5
        ringOpacity1 = 0
        ringOpacity2 = 0
        ringOpacity3 = 0

        // First ring
        withAnimation(.easeOut(duration: 0.6)) {
            ringScale1 = 2.0
            ringOpacity1 = 1.0
        }
        withAnimation(.easeOut(duration: 0.6).delay(0.2)) {
            ringOpacity1 = 0
        }

        // Second ring (slightly delayed)
        withAnimation(.easeOut(duration: 0.5).delay(0.1)) {
            ringScale2 = 1.8
            ringOpacity2 = 0.8
        }
        withAnimation(.easeOut(duration: 0.5).delay(0.25)) {
            ringOpacity2 = 0
        }

        // Third ring (more delayed)
        withAnimation(.easeOut(duration: 0.4).delay(0.2)) {
            ringScale3 = 1.5
            ringOpacity3 = 0.6
        }
        withAnimation(.easeOut(duration: 0.4).delay(0.3)) {
            ringOpacity3 = 0
        }
    }
}

// MARK: - Heart Pop Animation

/// Animated heart that scales and bounces
struct HeartPopEffect: View {
    let isVisible: Bool
    let size: CGFloat

    @State private var scale: CGFloat = 0.3
    @State private var opacity: Double = 0

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size))
            .foregroundStyle(Color.capsuleLike)
            .scaleEffect(scale)
            .opacity(opacity)
            .onChange(of: isVisible) { _, newValue in
                if newValue {
                    showHeart()
                } else {
                    hideHeart()
                }
            }
    }

    private func showHeart() {
        // Bounce in
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            scale = 1.2
            opacity = 1.0
        }
        // Settle
        withAnimation(.spring(response: 0.2, dampingFraction: 0.7).delay(0.15)) {
            scale = 1.0
        }
    }

    private func hideHeart() {
        withAnimation(.easeOut(duration: 0.2)) {
            scale = 0.8
            opacity = 0
        }
    }
}

// MARK: - Drop Into Capsule Effect

/// Photo shrinks and drops into a capsule shape
struct DropIntoCapsuleEffect: ViewModifier {
    let isActive: Bool
    @State private var scale: CGFloat = 1.0
    @State private var offsetY: CGFloat = 0
    @State private var opacity: Double = 1.0
    @State private var capsuleScale: CGFloat = 0
    @State private var capsuleOpacity: Double = 0

    func body(content: Content) -> some View {
        ZStack {
            content
                .scaleEffect(scale)
                .offset(y: offsetY)
                .opacity(opacity)

            // Capsule shape that appears to "catch" the item
            Capsule()
                .fill(LinearGradient.capsuleGradient)
                .frame(width: 60, height: 30)
                .scaleEffect(capsuleScale)
                .opacity(capsuleOpacity)
                .offset(y: 50)
        }
        .onChange(of: isActive) { _, newValue in
            if newValue {
                triggerDrop()
            }
        }
    }

    private func triggerDrop() {
        // Show capsule
        withAnimation(.spring(response: 0.2, dampingFraction: 0.7)) {
            capsuleScale = 1.0
            capsuleOpacity = 1.0
        }

        // Shrink and drop the content
        withAnimation(.easeIn(duration: 0.3).delay(0.1)) {
            scale = 0.3
            offsetY = 40
        }

        // Fade out content
        withAnimation(.easeOut(duration: 0.15).delay(0.3)) {
            opacity = 0
        }

        // Capsule "swallows" - squeeze animation
        withAnimation(.spring(response: 0.15, dampingFraction: 0.5).delay(0.35)) {
            capsuleScale = 0.8
        }
        withAnimation(.spring(response: 0.15, dampingFraction: 0.5).delay(0.45)) {
            capsuleScale = 1.1
        }

        // Capsule disappears
        withAnimation(.easeOut(duration: 0.2).delay(0.6)) {
            capsuleScale = 0
            capsuleOpacity = 0
        }

        // Reset after animation completes
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            scale = 1.0
            offsetY = 0
            opacity = 1.0
        }
    }
}

// MARK: - Selection Lift Effect

/// Subtle lift effect when entering selection mode
struct SelectionLiftEffect: ViewModifier {
    let isSelecting: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(isSelecting ? 0.98 : 1.0)
            .animation(CapsuleDesign.animationNormal, value: isSelecting)
            .capsuleShadow(isSelecting ? .medium : .subtle)
    }
}

// MARK: - Pill Morph Transition

/// Animated pill background that morphs between positions
struct PillMorphBackground: View {
    let selectedIndex: Int
    let itemCount: Int
    let itemWidth: CGFloat

    var body: some View {
        GeometryReader { geometry in
            Capsule()
                .fill(Color.capsulePrimary)
                .frame(width: itemWidth, height: geometry.size.height)
                .offset(x: CGFloat(selectedIndex) * (itemWidth + 8))
                .animation(CapsuleDesign.animationBouncy, value: selectedIndex)
        }
    }
}

// MARK: - Shimmer Loading Effect

struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    colors: [
                        .clear,
                        .white.opacity(0.4),
                        .clear
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .rotationEffect(.degrees(30))
                .offset(x: phase)
                .mask(content)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    phase = 400
                }
            }
    }
}

// MARK: - Fade Slide Transition

struct FadeSlideTransition: ViewModifier {
    let isVisible: Bool
    let edge: Edge

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(
                x: edge == .leading ? (isVisible ? 0 : -20) : (edge == .trailing ? (isVisible ? 0 : 20) : 0),
                y: edge == .top ? (isVisible ? 0 : -20) : (edge == .bottom ? (isVisible ? 0 : 20) : 0)
            )
            .animation(CapsuleDesign.animationNormal, value: isVisible)
    }
}

// MARK: - View Extensions

extension View {
    /// Apply like burst ripple effect
    func likeBurstEffect(isActive: Bool) -> some View {
        modifier(LikeBurstEffect(isActive: isActive))
    }

    /// Apply drop into capsule effect
    func dropIntoCapsule(isActive: Bool) -> some View {
        modifier(DropIntoCapsuleEffect(isActive: isActive))
    }

    /// Apply selection lift effect
    func selectionLift(isSelecting: Bool) -> some View {
        modifier(SelectionLiftEffect(isSelecting: isSelecting))
    }

    /// Apply shimmer loading effect
    func shimmer() -> some View {
        modifier(ShimmerEffect())
    }

    /// Apply fade slide transition
    func fadeSlide(isVisible: Bool, from edge: Edge = .bottom) -> some View {
        modifier(FadeSlideTransition(isVisible: isVisible, edge: edge))
    }
}

// MARK: - Haptic Feedback Helpers

enum CapsuleHaptics {
    static func lightTap() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }

    static func mediumTap() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
    }

    static func heavyTap() {
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.impactOccurred()
    }

    static func success() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }

    static func warning() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.warning)
    }

    static func error() {
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }

    static func selection() {
        let generator = UISelectionFeedbackGenerator()
        generator.selectionChanged()
    }
}
