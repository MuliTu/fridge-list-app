import SwiftUI

struct ShoppingListView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var newItemName = ""
    @State private var selectedSublist: String?
    @State private var showingBulkAdd = false
    @State private var selectedItem: GroceryItem?
    @State private var searchText = ""
    @AppStorage("keepBoughtItemsInCategories") private var keepBoughtItemsInCategories = false
    @AppStorage("collapsedCategories") private var collapsedCategoriesJSON = "[]"
    @AppStorage("shownPurchasedLists") private var shownPurchasedListsJSON = "[]"
    @FocusState private var isAddingItem: Bool

    var body: some View {
        @Bindable var store = store

        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ScreenHeader(
                        eyebrow: "היומיום, ביחד",
                        title: "הקנייה הבאה",
                        detail: "רשימה משותפת, פשוטה ומהירה.",
                        symbol: "cart.fill"
                    )

                    HStack {
                        MetricPill(value: "\(remainingInSelectedList)", label: "נשאר לקנות")
                        MetricPill(
                            value: "\(purchasedInSelectedList)",
                            label: "נקנו"
                        )
                        Spacer()
                    }
                    .padding(.horizontal, 20)

                    addBar
                        .padding(.horizontal, 20)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            sublistChip("הרשימה הקבועה", value: nil)
                            ForEach(sublistNames, id: \.self) { sublistChip($0, value: $0) }
                        }.padding(.horizontal, 20)
                    }

                    if selectedListGroceries.isEmpty {
                        emptyContent
                    } else {
                        groceriesList
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.bottom, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isAddingItem = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("הוספת מוצר")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("העלאה מרוכזת", systemImage: "text.badge.plus") { showingBulkAdd = true }
                        ShareLink(item: selectedMissingShareText) { Label("שיתוף חסרים", systemImage: "square.and.arrow.up") }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .fridgeBackground()
            .sheet(isPresented: $showingBulkAdd) { BulkAddView(selectedSublist: selectedSublist) }
            .sheet(item: $selectedItem) { GroceryEditorView(item: $0) }
            .searchable(text: $searchText, prompt: "חיפוש ברשימה")
            .refreshable { await store.refreshHousehold() }
        }
    }

    @ViewBuilder
    private var emptyContent: some View {
        switch store.operationState {
        case .loading:
            ProgressView("טוען את הרשימה הקיימת…")
                .padding(.vertical, 48)
        case .failed(let message):
            ContentUnavailableView {
                Label("לא הצלחנו להציג את הרשימה", systemImage: "exclamationmark.icloud")
            } description: {
                Text(message)
            } actions: {
                Button("ניסיון נוסף") { Task { await store.refreshHousehold() } }
                    .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal, 20)
        case .idle, .ready:
            EmptyState(
                symbol: "basket",
                title: selectedSublist ?? "הרשימה הקבועה",
                detail: "אין מוצרים ברשימה הזו. הרשימות האחרות נשארות נפרדות."
            )
        }
    }

    private var sublistNames: [String] {
        Array(Set(store.groceries.compactMap(\.listName))).sorted { $0.localizedCompare($1) == .orderedAscending }
    }
    private var selectedListGroceries: [GroceryItem] {
        store.groceries.filter { $0.listName == selectedSublist }
    }
    private var remainingInSelectedList: Int { selectedListGroceries.count(where: { !$0.isPurchased }) }
    private var purchasedInSelectedList: Int { selectedListGroceries.count(where: \.isPurchased) }
    private var selectedMissingShareText: String {
        selectedListGroceries.filter { !$0.isPurchased }.map { "• \($0.name)" }.joined(separator: "\n")
    }
    private var visibleGroceries: [GroceryItem] {
        guard !searchText.isEmpty else { return selectedListGroceries }
        return selectedListGroceries.filter { $0.name.localizedCaseInsensitiveContains(searchText) || $0.category.localizedCaseInsensitiveContains(searchText) }
    }
    private var categoryNames: [String] {
        let names = Set(visibleGroceries.filter { keepBoughtItemsInCategories || !$0.isPurchased }.map(\.category))
        let configured = store.categories.sorted { ($0.order, $0.name) < ($1.order, $1.name) }.map(\.name)
        return configured.filter(names.contains) + names.subtracting(configured).sorted { $0.localizedCompare($1) == .orderedAscending }
    }
    private var purchasedGroceries: [GroceryItem] {
        keepBoughtItemsInCategories ? [] : visibleGroceries.filter(\.isPurchased)
    }

    private func sublistChip(_ title: String, value: String?) -> some View {
        Button(title) {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.2)) { selectedSublist = value }
        }
            .buttonStyle(.borderedProminent)
            .tint(selectedSublist == value ? FridgeTheme.accent : FridgeTheme.elevated)
            .foregroundStyle(selectedSublist == value ? FridgeTheme.canvas : .primary)
    }

    private var addBar: some View {
        HStack(spacing: 10) {
            TextField("מה חסר בבית?", text: $newItemName)
                .focused($isAddingItem)
                .submitLabel(.done)
                .onSubmit(addItem)
            Button(action: addItem) {
                Image(systemName: "arrow.up")
                    .font(.headline)
                    .foregroundStyle(FridgeTheme.canvas)
                    .frame(width: 42, height: 42)
                    .background(FridgeTheme.accent, in: .circle)
            }
            .buttonStyle(PressableButtonStyle())
            .accessibilityLabel("הוספה לרשימה")
        }
        .fridgeCard()
    }

    private var groceriesList: some View {
        LazyVStack(spacing: 14) {
            ForEach(categoryNames, id: \.self) { category in
                categorySection(
                    category,
                    items: visibleGroceries.filter {
                        $0.category == category && (keepBoughtItemsInCategories || !$0.isPurchased)
                    }
                )
            }
            if !purchasedGroceries.isEmpty {
                categorySection("נקנו", items: purchasedGroceries, icon: "✓", isPurchasedSection: true)
            }
        }
    }

    private func categorySection(
        _ name: String,
        items: [GroceryItem],
        icon: String? = nil,
        isPurchasedSection: Bool = false
    ) -> some View {
        let category = store.categories.first(where: { $0.name == name })
        let collapsed = isPurchasedSection ? !shownPurchasedListKeys.contains(selectedListKey) : collapsedCategoryNames.contains(name)
        return VStack(spacing: 0) {
            Button {
                if isPurchasedSection { togglePurchasedVisibility() }
                else { toggleCategory(name) }
            } label: {
                HStack(spacing: 10) {
                    Text(icon ?? category?.icon ?? "📌")
                        .font(.headline)
                        .frame(width: 34, height: 34)
                        .background(FridgeTheme.elevated, in: .rect(cornerRadius: 10, style: .continuous))
                    Text(name).font(.headline)
                    Spacer()
                    Text("\(isPurchasedSection ? items.count : items.count(where: { !$0.isPurchased }))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(FridgeTheme.muted)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(FridgeTheme.elevated, in: .capsule)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(FridgeTheme.muted)
                        .rotationEffect(.degrees(collapsed ? 90 : 0))
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(name), \(collapsed ? "סגור" : "פתוח")")
            .accessibilityHint(collapsed ? "לחצו לפתיחה" : "לחצו לקיפול")
            .padding(14)

            if !collapsed {
                Divider().opacity(0.45)
                ForEach(items) { item in
                    groceryRow(item)
                    if item.id != items.last?.id { Divider().padding(.leading, 58).opacity(0.35) }
                }
            }
        }
        .background(FridgeTheme.surface, in: .rect(cornerRadius: 20, style: .continuous))
        .animation(reduceMotion ? nil : .smooth(duration: 0.2), value: collapsed)
    }

    private var selectedListKey: String { selectedSublist ?? "__permanent__" }
    private var collapsedCategoryNames: Set<String> { decodeStringSet(collapsedCategoriesJSON) }
    private var shownPurchasedListKeys: Set<String> { decodeStringSet(shownPurchasedListsJSON) }

    private func toggleCategory(_ name: String) {
        var names = collapsedCategoryNames
        if !names.insert(name).inserted { names.remove(name) }
        collapsedCategoriesJSON = encodeStringSet(names)
    }

    private func togglePurchasedVisibility() {
        var keys = shownPurchasedListKeys
        if !keys.insert(selectedListKey).inserted { keys.remove(selectedListKey) }
        shownPurchasedListsJSON = encodeStringSet(keys)
    }

    private func decodeStringSet(_ json: String) -> Set<String> {
        guard let data = json.data(using: .utf8), let values = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(values)
    }

    private func encodeStringSet(_ values: Set<String>) -> String {
        guard let data = try? JSONEncoder().encode(values.sorted()), let json = String(data: data, encoding: .utf8) else { return "[]" }
        return json
    }

    private func groceryRow(_ item: GroceryItem) -> some View {
        HStack(spacing: 13) {
            Button {
                Task { await store.togglePurchased(item) }
            } label: {
                Image(systemName: item.isPurchased ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(item.isPurchased ? FridgeTheme.accent : FridgeTheme.muted)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.isPurchased ? "סימון כלא נקנה" : "סימון כנקנה")
            Button {
                selectedItem = item
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name)
                        .font(.body.weight(.medium))
                        .strikethrough(item.isPurchased)
                        .foregroundStyle(item.isPurchased ? FridgeTheme.muted : .primary)
                    Text("\(item.quantity.formatted()) \(item.unit)")
                        .font(.caption)
                        .foregroundStyle(FridgeTheme.muted)
                    if let note = item.note, !note.isEmpty {
                        Text(note).font(.caption2).foregroundStyle(FridgeTheme.muted).lineLimit(1)
                    }
                }
                Spacer()
                Image(systemName: "chevron.left").font(.caption).foregroundStyle(FridgeTheme.muted)
            }
            .contentShape(.rect)
            .buttonStyle(.plain)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .sensoryFeedback(.selection, trigger: item.isPurchased)
        .contextMenu {
            Button("מחיקה", systemImage: "trash", role: .destructive) {
                Task { await store.deleteGrocery(item) }
            }
        }
    }

    private func addItem() {
        guard !newItemName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        withAnimation(reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.86)) {
            let name = newItemName
            newItemName = ""
            Task { await store.addGrocery(named: name, listName: selectedSublist) }
        }
    }
}

private struct GroceryEditorView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: GroceryItem

    init(item: GroceryItem) { _draft = State(initialValue: item) }

    var body: some View {
        NavigationStack {
            Form {
                Section("מוצר") {
                    TextField("שם", text: $draft.name)
                    Picker("קטגוריה", selection: $draft.category) {
                        ForEach(categoryOptions, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("רשימת משנה", text: Binding(get: { draft.listName ?? "" }, set: { draft.listName = $0.isEmpty ? nil : $0 }))
                }
                Section("כמות") {
                    HStack {
                        TextField("כמות", value: $draft.quantity, format: .number).keyboardType(.decimalPad)
                        TextField("יחידה", text: $draft.unit)
                    }
                }
                Section("הערה") {
                    TextField("למשל: בלי סוכר", text: Binding(get: { draft.note ?? "" }, set: { draft.note = $0.isEmpty ? nil : $0 }), axis: .vertical)
                        .lineLimit(2...5)
                }
                if let urlString = draft.imageURL, let url = URL(string: urlString) {
                    Section("תמונה") { AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() } }
                }
                Section {
                    Button("מחיקת המוצר", systemImage: "trash", role: .destructive) {
                        Task { await store.deleteGrocery(draft); dismiss() }
                    }
                }
            }
            .navigationTitle("עריכת מוצר")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") { Task { await store.updateGrocery(draft); dismiss() } }
                        .disabled(draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var categoryOptions: [String] {
        Array(Set(store.categoryNames + [draft.category, "אחר"])).sorted()
    }
}

private struct BulkAddView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    let selectedSublist: String?
    var body: some View {
        NavigationStack {
            Form {
                Section { TextEditor(text: $text).frame(minHeight: 220) } header: { Text("מוצר אחד בכל שורה") } footer: { Text("אפשר להוסיף עד 100 מוצרים בפעולה אחת.") }
            }
            .navigationTitle("העלאה מרוכזת")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("הוספה") { Task { await store.bulkAddGroceries(text, listName: selectedSublist); dismiss() } }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}

