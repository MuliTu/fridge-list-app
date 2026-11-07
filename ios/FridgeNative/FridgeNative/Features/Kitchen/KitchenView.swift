import SwiftUI

struct KitchenView: View {
    @Environment(AppStore.self) private var store
    @State private var selectedItem: StockItem?
    @State private var showingNewItem = false
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ScreenHeader(
                        eyebrow: "מקום לכל דבר",
                        title: "מה יש בבית",
                        detail: "משתמשים במה שיש ומשלימים מה שחסר.",
                        symbol: "cabinet.fill"
                    )

                    if filteredStock.isEmpty {
                        EmptyState(symbol: "cabinet", title: "המלאי מחכה", detail: "הוסיפו מוצרים כדי לדעת מה עומד להיגמר.")
                    }
                    ForEach(filteredStock) { item in
                        stockCard(item)
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 28)
            }
            .fridgeBackground()
            .searchable(text: $searchText, prompt: "חיפוש במלאי")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showingNewItem = true } label: { Image(systemName: "plus") }.accessibilityLabel("הוספה למלאי") } }
            .sheet(item: $selectedItem) { StockEditorView(item: $0, isNew: false) }
            .sheet(isPresented: $showingNewItem) { StockEditorView(item: StockItem(id: UUID().uuidString, name: "", category: "אחר", quantity: 1, unit: "יח׳", lowThreshold: 1), isNew: true) }
        }
    }

    private var filteredStock: [StockItem] {
        guard !searchText.isEmpty else { return store.stock }
        return store.stock.filter { $0.name.localizedCaseInsensitiveContains(searchText) || $0.category.localizedCaseInsensitiveContains(searchText) }
    }

    private func stockCard(_ item: StockItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: item.isRunningLow ? "exclamationmark.triangle.fill" : "shippingbox.fill")
                .foregroundStyle(item.isRunningLow ? FridgeTheme.warning : FridgeTheme.accent)
                .frame(width: 42, height: 42)
                .background(FridgeTheme.elevated, in: .rect(cornerRadius: 13, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.headline)
                Text(item.isRunningLow ? "עומד להיגמר" : item.category)
                    .font(.caption)
                    .foregroundStyle(item.isRunningLow ? FridgeTheme.warning : FridgeTheme.muted)
            }
            Spacer()
            HStack(spacing: 6) {
                Button { Task { await store.adjustStock(item, by: -1) } } label: { Image(systemName: "minus.circle.fill") }
                Text("\(item.quantity.formatted()) \(item.unit)").font(.subheadline.monospacedDigit().weight(.semibold)).frame(minWidth: 54)
                Button { Task { await store.adjustStock(item, by: 1) } } label: { Image(systemName: "plus.circle.fill") }
            }.buttonStyle(.plain).foregroundStyle(FridgeTheme.accent)
        }
        .fridgeCard()
        .contentShape(.rect)
        .onTapGesture { selectedItem = item }
        .contextMenu {
            Button("הוספה לרשימת קניות", systemImage: "cart.badge.plus") { Task { await store.addStockToGroceries(item) } }
            Button("מחיקה", systemImage: "trash", role: .destructive) { Task { await store.deleteStock(item) } }
        }
    }

}

private struct StockEditorView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: StockItem
    let isNew: Bool

    init(item: StockItem, isNew: Bool) { _draft = State(initialValue: item); self.isNew = isNew }

    var body: some View {
        NavigationStack {
            Form {
                Section("מוצר") {
                    TextField("שם", text: $draft.name)
                    Picker("קטגוריה", selection: $draft.category) { ForEach(categories, id: \.self) { Text($0).tag($0) } }
                }
                Section("מלאי") {
                    TextField("כמות", value: $draft.quantity, format: .number).keyboardType(.decimalPad)
                    TextField("יחידה", text: $draft.unit)
                    TextField("התראה מתחת לכמות", value: $draft.lowThreshold, format: .number).keyboardType(.decimalPad)
                }
                if !isNew {
                    Section { Button("הוספה לרשימת קניות", systemImage: "cart.badge.plus") { Task { await store.addStockToGroceries(draft); dismiss() } } }
                    Section { Button("מחיקת המוצר", systemImage: "trash", role: .destructive) { Task { await store.deleteStock(draft); dismiss() } } }
                }
            }
            .navigationTitle(isNew ? "הוספה למלאי" : "עריכת מלאי")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("שמירה") { Task { await store.saveStock(draft, isNew: isNew); dismiss() } }.disabled(draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }

    private var categories: [String] { Array(Set(store.categoryNames + [draft.category, "אחר"])).sorted() }
}

