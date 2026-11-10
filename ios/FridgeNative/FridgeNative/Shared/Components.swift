import SwiftUI

struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    let detail: String
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(eyebrow)
                    .font(.caption.weight(.semibold))
                    .tracking(1.2)
                    .foregroundStyle(FridgeTheme.accent)
                Text(title)
                    .font(.largeTitle.bold())
                    .tracking(-0.8)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(FridgeTheme.muted)
            }
            Spacer(minLength: 10)
            Image(systemName: symbol)
                .font(.title2.weight(.semibold))
                .foregroundStyle(FridgeTheme.accent)
                .frame(width: 52, height: 52)
                .background(FridgeTheme.elevated, in: .rect(cornerRadius: 17, style: .continuous))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }
}

struct MetricPill: View {
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 7) {
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(FridgeTheme.accent)
            Text(label)
                .font(.caption)
                .foregroundStyle(FridgeTheme.muted)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .background(FridgeTheme.elevated, in: .capsule)
    }
}

struct EmptyState: View {
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(detail)
        }
        .foregroundStyle(FridgeTheme.muted)
    }
}

