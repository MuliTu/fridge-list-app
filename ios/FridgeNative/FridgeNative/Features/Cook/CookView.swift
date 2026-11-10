import SwiftUI

struct CookView: View {
    @Environment(AppStore.self) private var store
    @State private var selectedRecipe: RecipeIdea?
    @State private var chefMessage = ""
    @State private var showingInsights = false
    @State private var showingListReview = false
    @State private var servings = 2
    @State private var mealType = "quick_dinner"
    @State private var preferences = ""
    @State private var selectedProductIDs: Set<String> = []
    @State private var showingProducts = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ScreenHeader(eyebrow: "המטבח החכם", title: "עוזר ה־AI", detail: "תובנות ומתכונים מהמידע האמיתי של הבית.", symbol: "sparkles")

                    VStack(alignment: .leading, spacing: 12) {
                        Text("מה מתחשק להכין?").font(.headline)
                        TextField("למשל: ארוחת ערב קלה לילדים", text: $chefMessage, axis: .vertical)
                            .lineLimit(2...4)
                            .textFieldStyle(.plain)
                        HStack {
                            Stepper("\(servings) סועדים", value: $servings, in: 1...20)
                            Menu {
                                ForEach(mealTypes, id: \.id) { option in Button(option.title) { mealType = option.id } }
                            } label: { Label(mealTypes.first(where: { $0.id == mealType })?.title ?? "סוג ארוחה", systemImage: "clock") }
                        }
                        TextField("העדפות: צמחוני, בלי תנור…", text: $preferences, axis: .vertical)
                            .lineLimit(1...3)
                        Button { showingProducts = true } label: {
                            Label(selectedProductIDs.isEmpty ? "בחירת מוצרים (הכול)" : "נבחרו \(selectedProductIDs.count) מוצרים", systemImage: "checklist")
                        }
                        .buttonStyle(.borderless)
                        HStack {
                            Button {
                                Task { await store.suggestRecipes(message: chefMessage, servings: servings, mealType: mealType, preferences: preferences, productIDs: selectedProductIDs.isEmpty ? nil : selectedProductIDs) }
                            } label: { Label("הציעו מתכונים", systemImage: "frying.pan") }
                                .buttonStyle(.borderedProminent)
                            Button {
                                Task { await store.requestAIInsights(); showingInsights = store.aiInsights != nil }
                            } label: { Label("תובנות", systemImage: "wand.and.stars") }
                                .buttonStyle(.bordered)
                        }
                        Button {
                            Task { await store.requestAIListReview(); showingListReview = store.aiListReview != nil }
                        } label: { Label("בדיקת כפילויות ושמות ברשימה", systemImage: "checklist.checked") }
                            .buttonStyle(.borderless)
                    }
                    .fridgeCard().padding(.horizontal, 20)

                    if store.operationState == .loading { ProgressView("חושב יחד איתך…").padding() }
                    if case .failed(let message) = store.operationState {
                        Text(message).font(.footnote).foregroundStyle(FridgeTheme.danger).padding(.horizontal, 20)
                    }

                    if store.recipes.isEmpty {
                        EmptyState(symbol: "fork.knife", title: "הטבח מחכה", detail: "בקשו רעיון והוא ייבנה מהמוצרים שברשימה.")
                    } else {
                        ForEach(store.recipes) { recipe in
                            Button { selectedRecipe = recipe } label: { recipeCard(recipe) }
                                .buttonStyle(PressableButtonStyle())
                        }.padding(.horizontal, 20)
                    }
                }.padding(.bottom, 28)
            }
            .fridgeBackground()
            .sheet(item: $selectedRecipe) { RecipeDetailView(recipe: $0) }
            .sheet(isPresented: $showingInsights) { if let insights = store.aiInsights { InsightsView(insights: insights) } }
            .sheet(isPresented: $showingListReview) { if let review = store.aiListReview { AIListReviewView(review: review) } }
            .sheet(isPresented: $showingProducts) { ProductPickerView(selectedIDs: $selectedProductIDs) }
        }
    }

    private var mealTypes: [(id: String, title: String)] {
        [("quick_dinner", "ארוחה מהירה"), ("family_meal", "ארוחה משפחתית"), ("meal_prep", "הכנה מראש"), ("snack", "נשנוש"), ("other", "אחר")]
    }

    private func recipeCard(_ recipe: RecipeIdea) -> some View {
        HStack(spacing: 16) {
            Image(systemName: "fork.knife.circle.fill").font(.title).foregroundStyle(FridgeTheme.accent)
            VStack(alignment: .leading, spacing: 5) {
                Text(recipe.title).font(.title3.bold())
                Text(recipe.description).font(.subheadline).foregroundStyle(FridgeTheme.muted).lineLimit(2)
                if let minutes = recipe.estimatedTimeMinutes { Label("\(minutes) דקות", systemImage: "clock").font(.caption).foregroundStyle(FridgeTheme.accent) }
            }
            Spacer(); Image(systemName: "chevron.left").foregroundStyle(FridgeTheme.muted)
        }.fridgeCard()
    }
}

private struct ProductPickerView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedIDs: Set<String>

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.groceries.filter { !$0.isPurchased }) { item in
                    Button {
                        if selectedIDs.contains(item.id) { selectedIDs.remove(item.id) } else { selectedIDs.insert(item.id) }
                    } label: {
                        HStack { Text(item.name); Spacer(); Image(systemName: selectedIDs.contains(item.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(FridgeTheme.accent) }
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("מוצרים למתכון")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("ניקוי") { selectedIDs.removeAll() } }
                ToolbarItem(placement: .confirmationAction) { Button("סיום") { dismiss() } }
            }
        }
    }
}

private struct AIListReviewView: View {
    let review: AIListReview
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("כפילויות") {
                    if review.duplicates.isEmpty { Text("לא נמצאו כפילויות").foregroundStyle(.secondary) }
                    ForEach(review.duplicates) { group in VStack(alignment: .leading, spacing: 4) { Text("\(group.removeKeys.count) פריטים דומים").font(.headline); Text(group.reason).font(.caption).foregroundStyle(.secondary) } }
                }
                Section("הצעות לשמות") {
                    if review.renames.isEmpty { Text("השמות נראים טוב").foregroundStyle(.secondary) }
                    ForEach(review.renames) { suggestion in VStack(alignment: .leading, spacing: 4) { Text("\(suggestion.currentName) ← \(suggestion.suggestedName)").font(.headline); Text(suggestion.reason).font(.caption).foregroundStyle(.secondary) } }
                }
            }
            .navigationTitle("בדיקת רשימה")
            .safeAreaInset(edge: .bottom) {
                Button("החלת כל התיקונים") { Task { await store.applyAIListReview(review); dismiss() } }
                    .buttonStyle(.borderedProminent).frame(maxWidth: .infinity).padding().background(.ultraThinMaterial)
                    .disabled(review.duplicates.isEmpty && review.renames.isEmpty)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } } }
        }
    }
}

private struct RecipeDetailView: View {
    let recipe: RecipeIdea
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section { Text(recipe.description) }
                Section("מצרכים") { ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { _, item in Label([item.quantity, item.name].compactMap { $0 }.joined(separator: " "), systemImage: "checkmark.circle") } }
                Section("הכנה") { ForEach(Array(recipe.steps.enumerated()), id: \.offset) { index, step in LabeledContent("\(index + 1)") { Text(step).multilineTextAlignment(.leading) } } }
                if let notes = recipe.chefNotes { Section("טיפ מהשף") { Text(notes) } }
            }
            .navigationTitle(recipe.title)
            .safeAreaInset(edge: .bottom) {
                if recipe.source != nil {
                    Button { Task { await store.saveRecipe(recipe); if store.operationState == .ready { dismiss() } } } label: { Label("שמירת המתכון", systemImage: "bookmark.fill") }
                        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity).padding().background(.ultraThinMaterial)
                }
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("סיום") { dismiss() } } }
        }
    }
}

private struct InsightsView: View {
    let insights: AIInsights
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("מה שמתי לב") { ForEach(insights.summary, id: \.self) { Label($0, systemImage: "sparkle") } }
                Section("מה כדאי לעשות") { ForEach(insights.nextSteps, id: \.self) { Label($0, systemImage: "arrow.forward.circle") } }
                if let list = insights.proposedList { Section(list.name) { ForEach(list.items) { item in VStack(alignment: .leading) { Text(item.name).font(.headline); Text(item.reason).font(.caption).foregroundStyle(.secondary) } } } }
            }
            .navigationTitle("תובנות AI")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("סיום") { dismiss() } } }
        }
    }
}
