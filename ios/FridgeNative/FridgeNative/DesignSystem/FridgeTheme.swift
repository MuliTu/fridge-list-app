import SwiftUI

enum FridgeTheme {
    static let canvas = Color(red: 0.055, green: 0.078, blue: 0.066)
    static let surface = Color(red: 0.105, green: 0.14, blue: 0.12)
    static let elevated = Color(red: 0.145, green: 0.19, blue: 0.16)
    static let accent = Color(red: 0.78, green: 0.92, blue: 0.60)
    static let muted = Color(red: 0.65, green: 0.71, blue: 0.66)
    static let warning = Color(red: 0.93, green: 0.66, blue: 0.40)
    static let danger = Color(red: 1.0, green: 0.54, blue: 0.50)
}

struct FridgeBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                LinearGradient(
                    colors: [FridgeTheme.canvas, FridgeTheme.surface.opacity(0.82)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            )
    }
}

struct FridgeCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(.ultraThinMaterial, in: .rect(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white.opacity(0.08), lineWidth: 1)
            }
    }
}

struct PressableButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(.snappy(duration: 0.14), value: configuration.isPressed)
    }
}

extension View {
    func fridgeBackground() -> some View { modifier(FridgeBackground()) }
    func fridgeCard() -> some View { modifier(FridgeCard()) }
}

