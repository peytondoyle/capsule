import SwiftUI

// MARK: - Lab Design Tokens & Signature Design System
// A bespoke design language that feels ownable, elevated, and unmistakably Capsule.

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 0. DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

enum LabTokens {
    enum Radius {
        static let xxl: CGFloat = 32
        static let xl: CGFloat = 24
        static let lg: CGFloat = 18
        static let md: CGFloat = 12
        static let sm: CGFloat = 8
        static let xs: CGFloat = 4
    }

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    enum Animation {
        static let quick: SwiftUI.Animation = .spring(response: 0.25, dampingFraction: 0.8)
        static let normal: SwiftUI.Animation = .spring(response: 0.35, dampingFraction: 0.75)
        static let smooth: SwiftUI.Animation = .spring(response: 0.45, dampingFraction: 0.8)
    }

    enum Colors {
        static let primary = Color(red: 0.4, green: 0.3, blue: 0.9)
        static let secondary = Color(red: 0.6, green: 0.4, blue: 0.95)
        static let accent = Color(red: 0.95, green: 0.6, blue: 0.4)
        static let gradientStart = Color(red: 0.35, green: 0.25, blue: 0.85)
        static let gradientEnd = Color(red: 0.5, green: 0.35, blue: 0.95)

        static var primaryGradient: LinearGradient {
            LinearGradient(colors: [gradientStart, gradientEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

enum LabElevation {
    case none, low, medium, high

    var shadow: (color: Color, radius: CGFloat, x: CGFloat, y: CGFloat) {
        switch self {
        case .none: return (.clear, 0, 0, 0)
        case .low: return (.black.opacity(0.08), 4, 0, 1)
        case .medium: return (.black.opacity(0.12), 12, 0, 4)
        case .high: return (.black.opacity(0.16), 24, 0, 8)
        }
    }
}

extension View {
    func labElevation(_ elevation: LabElevation) -> some View {
        let s = elevation.shadow
        return self.shadow(color: s.color, radius: s.radius, x: s.x, y: s.y)
    }

    func labFont(_ style: LabTypography) -> some View {
        self.font(style.font)
    }
}

enum LabTypography {
    case largeTitle, cardTitle, metadata, pill, body, caption

    var font: Font {
        switch self {
        case .largeTitle: return .largeTitle.bold()
        case .cardTitle: return .title3.weight(.semibold)
        case .metadata: return .subheadline.weight(.medium)
        case .pill: return .callout.weight(.semibold)
        case .body: return .body
        case .caption: return .caption
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 1. SIGNATURE SHAPE: The Soft Arc Capsule
// ═══════════════════════════════════════════════════════════════════════════════

/// Asymmetric rounded rectangle with signature beveled corner.
struct SoftArcShape: Shape {
    var topLeadingRadius: CGFloat = 24
    var topTrailingRadius: CGFloat = 16
    var bottomLeadingRadius: CGFloat = 16
    var bottomTrailingRadius: CGFloat = 24

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + topLeadingRadius, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - topTrailingRadius, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - topTrailingRadius, y: rect.minY + topTrailingRadius),
                    radius: topTrailingRadius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottomTrailingRadius))
        path.addArc(center: CGPoint(x: rect.maxX - bottomTrailingRadius, y: rect.maxY - bottomTrailingRadius),
                    radius: bottomTrailingRadius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + bottomLeadingRadius, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + bottomLeadingRadius, y: rect.maxY - bottomLeadingRadius),
                    radius: bottomLeadingRadius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeadingRadius))
        path.addArc(center: CGPoint(x: rect.minX + topLeadingRadius, y: rect.minY + topLeadingRadius),
                    radius: topLeadingRadius, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }

    static var card: SoftArcShape {
        SoftArcShape(topLeadingRadius: 28, topTrailingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 28)
    }

    static var element: SoftArcShape {
        SoftArcShape(topLeadingRadius: 16, topTrailingRadius: 12, bottomLeadingRadius: 12, bottomTrailingRadius: 16)
    }

    static var thumbnail: SoftArcShape {
        SoftArcShape(topLeadingRadius: 12, topTrailingRadius: 8, bottomLeadingRadius: 8, bottomTrailingRadius: 12)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 2. MICRO TEXTURE: Noise & Grain Overlays
// ═══════════════════════════════════════════════════════════════════════════════

struct NoiseTexture: View {
    var opacity: Double = 0.03

    var body: some View {
        Canvas { context, size in
            for x in stride(from: 0, to: size.width, by: 2) {
                for y in stride(from: 0, to: size.height, by: 2) {
                    let brightness = Double.random(in: 0...1)
                    context.fill(
                        Path(CGRect(x: x, y: y, width: 2, height: 2)),
                        with: .color(.white.opacity(brightness * opacity))
                    )
                }
            }
        }
        .allowsHitTesting(false)
    }
}

struct FilmGrain: View {
    var intensity: Double = 0.04

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.1)) { timeline in
            Canvas { context, size in
                let seed = timeline.date.timeIntervalSinceReferenceDate
                for x in stride(from: 0, to: size.width, by: 3) {
                    for y in stride(from: 0, to: size.height, by: 3) {
                        let noise = sin(x * 0.1 + seed) * cos(y * 0.1 + seed)
                        let brightness = (noise + 1) / 2 * intensity
                        context.fill(
                            Path(CGRect(x: x, y: y, width: 3, height: 3)),
                            with: .color(.white.opacity(brightness))
                        )
                    }
                }
            }
        }
        .blendMode(.overlay)
        .allowsHitTesting(false)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 3. SOFT GRADIENT GLASS
// ═══════════════════════════════════════════════════════════════════════════════

struct SoftGradientGlass: View {
    var tintColor: Color = .white
    var tintOpacity: Double = 0.08

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            LinearGradient(colors: [.white.opacity(0.15), .white.opacity(0.05), .clear],
                          startPoint: .top, endPoint: .bottom)
            Rectangle().fill(RadialGradient(colors: [tintColor.opacity(tintOpacity), .clear],
                                           center: .top, startRadius: 0, endRadius: 300))
            NoiseTexture(opacity: 0.02)
            Rectangle().stroke(LinearGradient(colors: [Color(red: 1, green: 0.95, blue: 0.9).opacity(0.3),
                                                       Color(red: 0.9, green: 0.95, blue: 1).opacity(0.3)],
                                             startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.5)
        }
    }
}

extension View {
    func softGlass(tint: Color = .white, tintOpacity: Double = 0.08) -> some View {
        self.background(SoftGradientGlass(tintColor: tint, tintOpacity: tintOpacity))
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 4. DEPTH MODELING
// ═══════════════════════════════════════════════════════════════════════════════

struct DepthCard<Content: View>: View {
    let content: Content
    var ambientColor: Color = .black
    var liftAmount: CGFloat = 0

    init(ambientColor: Color = .black, liftAmount: CGFloat = 0, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.ambientColor = ambientColor
        self.liftAmount = liftAmount
    }

    var body: some View {
        ZStack {
            SoftArcShape.card.fill(ambientColor.opacity(0.08)).blur(radius: 20).offset(y: 12 + liftAmount * 0.5)
            SoftArcShape.card.fill(ambientColor.opacity(0.12)).blur(radius: 8).offset(y: 4 + liftAmount * 0.3)
            content.clipShape(SoftArcShape.card)
                .overlay { SoftArcShape.card.stroke(LinearGradient(colors: [.white.opacity(0.2), .white.opacity(0.05)],
                                                                   startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1) }
                .offset(y: -liftAmount)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 5. SIGNATURE MOTION CURVES
// ═══════════════════════════════════════════════════════════════════════════════

enum CapsuleMotion {
    static var signature: Animation { .spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0.1) }
    static var magnetic: Animation { .interpolatingSpring(stiffness: 200, damping: 18) }
    static var elastic: Animation { .spring(response: 0.5, dampingFraction: 0.6, blendDuration: 0) }
    static var snap: Animation { .spring(response: 0.25, dampingFraction: 0.8) }
    static var reveal: Animation { .easeOut(duration: 0.6) }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 6. AMBIENT COLOR TINTING
// ═══════════════════════════════════════════════════════════════════════════════

class AmbientColorExtractor: ObservableObject {
    @Published var dominantColor: Color = .gray
    @Published var backgroundTint: Color = .clear
    @Published var glassTint: Color = .clear
    @Published var shadowTint: Color = .clear

    func extract(from image: UIImage) {
        guard let cgImage = image.cgImage else { return }
        let width = 10, height = 10
        var rawData = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(data: &rawData, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        var totalR: CGFloat = 0, totalG: CGFloat = 0, totalB: CGFloat = 0
        for i in stride(from: 0, to: rawData.count, by: 4) {
            totalR += CGFloat(rawData[i]); totalG += CGFloat(rawData[i + 1]); totalB += CGFloat(rawData[i + 2])
        }
        let count = CGFloat(width * height)
        let avgR = totalR / count / 255, avgG = totalG / count / 255, avgB = totalB / count / 255
        let mutedR = avgR * 0.6 + 0.2, mutedG = avgG * 0.6 + 0.2, mutedB = avgB * 0.6 + 0.2

        DispatchQueue.main.async {
            self.dominantColor = Color(red: mutedR, green: mutedG, blue: mutedB)
            self.backgroundTint = Color(red: mutedR, green: mutedG, blue: mutedB).opacity(0.07)
            self.glassTint = Color(red: mutedR, green: mutedG, blue: mutedB).opacity(0.12)
            self.shadowTint = Color(red: mutedR, green: mutedG, blue: mutedB).opacity(0.04)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 7. EDITORIAL TYPOGRAPHY
// ═══════════════════════════════════════════════════════════════════════════════

enum CapsuleType {
    static func headline(_ text: String) -> some View {
        Text(text).font(.system(size: 28, weight: .medium)).tracking(0.5)
    }

    static func sectionHeader(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text).font(.system(size: 15, weight: .semibold)).tracking(1.2).textCase(.uppercase).foregroundStyle(.secondary)
            Rectangle().fill(Color.primary.opacity(0.1)).frame(width: 40, height: 1)
        }
    }

    static func metadata(_ text: String) -> some View {
        Text(text).font(.system(size: 13, weight: .medium)).tracking(0.3).foregroundStyle(.secondary)
    }

    static func cardTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 18, weight: .semibold)).tracking(0.2)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 8. METADATA CAPSULE
// ═══════════════════════════════════════════════════════════════════════════════

struct MetadataCapsule: View {
    let photoCount: Int
    let memberCount: Int
    let dateRange: String

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Image(systemName: "photo").font(.system(size: 11, weight: .medium))
                Text("\(photoCount) photos")
            }
            Text("·").foregroundStyle(.tertiary)
            HStack(spacing: 4) {
                Image(systemName: "person.2").font(.system(size: 11, weight: .medium))
                Text("\(memberCount) people")
            }
            Text("·").foregroundStyle(.tertiary)
            Text(dateRange)
        }
        .font(.system(size: 12, weight: .medium)).tracking(0.2).foregroundStyle(.secondary)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARK: - 9. CINEMATIC VIGNETTE
// ═══════════════════════════════════════════════════════════════════════════════

struct CinematicVignette: View {
    var intensity: Double = 0.4

    var body: some View {
        RadialGradient(colors: [.clear, .black.opacity(intensity * 0.3), .black.opacity(intensity)],
                      center: .center, startRadius: 100, endRadius: 500)
            .allowsHitTesting(false)
    }
}
