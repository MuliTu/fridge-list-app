import SwiftUI

struct AppShellView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        @Bindable var store = store

        Group {
            if store.currentUser == nil {
                SignInView()
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            } else {
                TabView(selection: $store.selectedTab) {
                    ShoppingListView()
                        .tag(AppTab.shop)
                        .tabItem { Label("קניות", systemImage: "cart") }

                    KitchenView()
                        .tag(AppTab.kitchen)
                        .tabItem { Label("במטבח", systemImage: "cabinet") }

                    CookView()
                        .tag(AppTab.cook)
                        .tabItem { Label("מבשלים", systemImage: "frying.pan") }

                    ReceiptsView()
                        .tag(AppTab.receipts)
                        .tabItem { Label("קבלות", systemImage: "receipt") }

                    SettingsView()
                        .tag(AppTab.settings)
                        .tabItem { Label("הגדרות", systemImage: "gearshape") }
                }
                .transition(.opacity)
            }
        }
        .tint(FridgeTheme.accent)
        .environment(\.layoutDirection, .rightToLeft)
        .animation(reduceMotion ? nil : .smooth(duration: 0.22), value: store.selectedTab)
        .animation(reduceMotion ? nil : .smooth(duration: 0.28), value: store.currentUser?.uid)
        .task {
            store.startAuthentication()
        }
    }
}

private struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @AppStorage("stockSuggestionEnabled") private var stockSuggestions = true
    @AppStorage("keepBoughtItemsInCategories") private var keepBoughtItemsInCategories = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 38)).foregroundStyle(FridgeTheme.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(store.userDisplayName).font(.headline)
                            Text(store.currentUser?.email ?? "").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 4)
                }

                Section("בית משותף") {
                    NavigationLink { HouseholdSettingsView() } label: { SettingsRow(title: "רשימות ובתים", detail: store.householdName, symbol: "house.and.flag.fill") }
                    NavigationLink { CategorySettingsView() } label: { SettingsRow(title: "קטגוריות", detail: "\(store.categories.count) קטגוריות", symbol: "square.grid.2x2.fill") }
                    NavigationLink { MembersSettingsView() } label: { SettingsRow(title: "חברים והרשאות", detail: store.isActiveListOwner ? "ניהול ושיתוף" : "גישה משותפת", symbol: "person.2.fill") }
                }

                Section("התנהגות הרשימה") {
                    Toggle(isOn: $stockSuggestions) { Label("הצעות מהמלאי", systemImage: "shippingbox.and.arrow.backward") }
                    Toggle(isOn: $keepBoughtItemsInCategories) { Label("השארת נקנו בקטגוריות", systemImage: "checkmark.circle") }
                }

                Section("עזרה ועדכונים") {
                    NavigationLink { OnboardingGuideView() } label: { SettingsRow(title: "הדרכה", detail: "כל היכולות במקום אחד", symbol: "sparkles.rectangle.stack") }
                    NavigationLink { WhatsNewView() } label: { SettingsRow(title: "מה חדש", detail: store.whatsNew?.version ?? "הגרסה הנוכחית", symbol: "gift.fill") }
                    NavigationLink { ChangelogView() } label: { SettingsRow(title: "יומן שינויים", detail: "פרטי הגרסה", symbol: "clock.arrow.circlepath") }
                    NavigationLink { FeedbackView() } label: { SettingsRow(title: "שליחת משוב", detail: "בקשה, רעיון או תקלה", symbol: "bubble.left.and.text.bubble.right.fill") }
                }

                Section("אפליקציה") {
                    LabeledContent("שפה", value: "עברית")
                    LabeledContent("סנכרון", value: "Firebase בזמן אמת")
                    LabeledContent("גרסה", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                    Button("התנתקות", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { store.signOut() }
                }
            }
            .navigationTitle("הגדרות")
            .scrollContentBackground(.hidden)
            .fridgeBackground()
        }
    }
}

private struct SettingsRow: View {
    let title: String
    let detail: String
    let symbol: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).foregroundStyle(FridgeTheme.accent).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) { Text(title); Text(detail).font(.caption).foregroundStyle(.secondary) }
        }.padding(.vertical, 3)
    }
}

private struct HouseholdSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var renamedHousehold = ""
    var body: some View {
        List {
            Section("הבית הפעיל") {
                ForEach(store.accessibleLists) { list in
                    Button { store.selectList(list.id) } label: {
                        HStack {
                            VStack(alignment: .leading) { Text(list.name); Text(list.status == "owner" ? "בעלים" : "חבר מאושר").font(.caption).foregroundStyle(.secondary) }
                            Spacer(); if list.id == store.activeListID { Image(systemName: "checkmark.circle.fill").foregroundStyle(FridgeTheme.accent) }
                        }
                    }
                }
            }
            if store.isActiveListOwner {
                Section("שינוי שם") {
                    TextField(store.householdName, text: $renamedHousehold)
                    Button("שמירת שם") { Task { await store.renameHousehold(to: renamedHousehold); renamedHousehold = "" } }.disabled(renamedHousehold.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            Section("שיתוף חסרים") {
                ShareLink(item: store.missingItemsShareText, subject: Text("מה חסר ב\(store.householdName)")) { Label("שיתוף רשימת החסרים", systemImage: "square.and.arrow.up") }
            }
        }.navigationTitle("רשימות ובתים")
    }
}

private struct CategorySettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var selectedCategory: CategoryItem?
    @State private var showingNewCategory = false
    var body: some View {
        List {
            ForEach(store.categories) { category in
                Button { selectedCategory = category } label: {
                    HStack(spacing: 12) {
                        Text(category.icon).font(.title3).frame(width: 34, height: 34).background(FridgeTheme.elevated, in: .rect(cornerRadius: 10))
                        Text(category.name)
                        Spacer()
                        if category.isProtected { Text("מוגנת").font(.caption).foregroundStyle(.secondary) }
                        else { Image(systemName: "chevron.left").font(.caption).foregroundStyle(.secondary) }
                    }
                }.buttonStyle(.plain)
            }
        }
        .overlay { if store.categories.isEmpty { ContentUnavailableView("אין קטגוריות", systemImage: "square.grid.2x2") } }
        .navigationTitle("קטגוריות")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showingNewCategory = true } label: { Image(systemName: "plus") }.accessibilityLabel("הוספת קטגוריה") } }
        .sheet(item: $selectedCategory) { CategoryEditorView(category: $0, isNew: false) }
        .sheet(isPresented: $showingNewCategory) { CategoryEditorView(category: CategoryItem(id: UUID().uuidString, name: "", icon: "📌", color: "#A8A8A8", isProtected: false, order: store.categories.count), isNew: true) }
    }
}

private struct CategoryEditorView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft: CategoryItem
    let isNew: Bool

    init(category: CategoryItem, isNew: Bool) { _draft = State(initialValue: category); self.isNew = isNew }

    var body: some View {
        NavigationStack {
            Form {
                Section("קטגוריה") {
                    TextField("שם", text: $draft.name)
                    TextField("אייקון", text: $draft.icon)
                    TextField("צבע HEX", text: $draft.color).textInputAutocapitalization(.characters)
                }
                if !isNew && !draft.isProtected && store.isActiveListOwner {
                    Section { Button("מחיקת הקטגוריה", systemImage: "trash", role: .destructive) { Task { await store.deleteCategory(draft); dismiss() } } } footer: { Text("מוצרים בקטגוריה יעברו לקטגוריית ״אחר״.") }
                }
            }
            .navigationTitle(isNew ? "קטגוריה חדשה" : "עריכת קטגוריה")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("שמירה") { Task { await store.saveCategory(draft, isNew: isNew); dismiss() } }.disabled(draft.isProtected || draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}

private struct MembersSettingsView: View {
    @Environment(AppStore.self) private var store
    @State private var email = ""
    var body: some View {
        List {
            Section("בעלים") { Label(store.currentUser?.email ?? store.userDisplayName, systemImage: "crown.fill") }
            if store.isActiveListOwner {
                Section("הזמנת חבר") {
                    TextField("name@example.com", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    Button("שליחת הזמנה", systemImage: "person.badge.plus") {
                        let address = email
                        email = ""
                        Task { await store.inviteMember(email: address) }
                    }.disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.operationState == .loading)
                }
            }
            Section("מוזמנים") {
                if store.invites.isEmpty { Text("אין הזמנות פעילות").foregroundStyle(.secondary) }
                ForEach(store.invites) { invite in
                    HStack { Text(invite.email); Spacer(); Text(invite.status == "approved" ? "מאושר" : "ממתין").font(.caption).foregroundStyle(.secondary) }
                        .swipeActions(edge: .leading) { if store.isActiveListOwner { Button("הסרה", role: .destructive) { Task { await store.removeInvite(invite) } } } }
                }
            }
            if case .failed(let message) = store.operationState { Section { Text(message).foregroundStyle(FridgeTheme.danger) } }
        }.navigationTitle("חברים והרשאות")
    }
}

private struct FeedbackView: View {
    @Environment(AppStore.self) private var store
    @State private var text = ""
    var body: some View {
        Form {
            Section { TextEditor(text: $text).frame(minHeight: 160) } footer: { Text("המשוב נשלח בצורה מאובטחת לצוות הפיתוח.") }
            Section { Button("שליחת משוב") { Task { await store.submitFeedback(text); if store.operationState == .ready { text = "" } } }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.operationState == .loading) }
            if case .failed(let message) = store.operationState { Section { Text(message).foregroundStyle(FridgeTheme.danger) } }
        }.navigationTitle("משוב")
    }
}

private struct WhatsNewView: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        List {
            if let item = store.whatsNew {
                Section("גרסה \(item.version)") { ForEach(item.updates, id: \.self) { Label($0, systemImage: "sparkle") } }
            } else { Text("אין עדכון חדש להצגה כרגע.").foregroundStyle(.secondary) }
        }.navigationTitle("מה חדש")
    }
}

private struct ChangelogView: View {
    var body: some View {
        List {
            Section("האפליקציה הנייטיבית") {
                Label("סנכרון רשימות ומידע בזמן אמת", systemImage: "arrow.triangle.2.circlepath")
                Label("עוזר AI ושף אישי", systemImage: "sparkles")
                Label("סריקת קבלות ושמירת היסטוריה", systemImage: "doc.viewfinder")
                Label("מרכז הגדרות מלא", systemImage: "gearshape.2")
            }
        }.navigationTitle("יומן שינויים")
    }
}

private struct OnboardingGuideView: View {
    private let steps = [("cart.fill", "קניות", "מוסיפים, מסמנים ומשתפים את מה שחסר."), ("cabinet.fill", "מטבח", "רואים מלאי והתראות לפני שמשהו נגמר."), ("sparkles", "AI", "מקבלים תובנות, ביקורת רשימה ומתכונים מותאמים."), ("receipt.fill", "קבלות", "סורקים תמונה ושומרים היסטוריית קניות.")]
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                    HStack(spacing: 16) { Image(systemName: step.0).font(.title2).foregroundStyle(FridgeTheme.accent).frame(width: 48, height: 48).background(FridgeTheme.elevated, in: .rect(cornerRadius: 15)); VStack(alignment: .leading, spacing: 4) { Text(step.1).font(.headline); Text(step.2).font(.subheadline).foregroundStyle(.secondary) }; Spacer() }.fridgeCard()
                }
            }.padding(20)
        }.fridgeBackground().navigationTitle("איך משתמשים")
    }
}

private struct SignInView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        ZStack {
            FridgeTheme.canvas.ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()
                Image(systemName: "refrigerator.fill")
                    .font(.system(size: 62, weight: .semibold))
                    .foregroundStyle(FridgeTheme.accent)
                    .symbolEffect(.breathe, options: .repeating)

                VStack(spacing: 10) {
                    Text("הבית שלך, מסודר")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    Text("התחברו כדי לראות את רשימת הקניות והמטבח המשותף שלכם.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 320)
                }

                Button {
                    Task { await store.signInWithGoogle() }
                } label: {
                    HStack(spacing: 12) {
                        if store.isAuthenticating {
                            ProgressView().tint(.black)
                        } else {
                            Image(systemName: "person.crop.circle.badge.checkmark")
                        }
                        Text(store.isAuthenticating ? "מתחברים…" : "התחברות עם Google")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white)
                .foregroundStyle(.black)
                .clipShape(.rect(cornerRadius: 16))
                .disabled(store.isAuthenticating)
                .padding(.horizontal, 28)

                if let error = store.authenticationError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()
                Text("החיבור מאובטח באמצעות Firebase")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 12)
            }
        }
    }
}

