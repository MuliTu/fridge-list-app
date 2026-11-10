import Foundation
import Observation
import FirebaseAuth
import FirebaseCore
import FirebaseDatabase
import GoogleSignIn
import UIKit

@MainActor
@Observable
final class AppStore {
    private(set) var currentUser: User?
    private(set) var activeListID: String?
    private(set) var householdName = "הבית שלי"
    private(set) var accessibleLists: [HouseholdList] = []
    private(set) var groceries: [GroceryItem] = []
    private(set) var stock: [StockItem] = []
    private(set) var receipts: [ReceiptRecord] = []
    private(set) var recipes: [RecipeIdea] = []
    private(set) var categories: [CategoryItem] = []
    private(set) var invites: [MemberInvite] = []
    private(set) var whatsNew: WhatsNewItem?
    private(set) var isAuthenticating = false
    private(set) var operationState: LoadState = .idle
    var authenticationError: String?
    var selectedTab: AppTab = .shop
    var aiInsights: AIInsights?
    var aiListReview: AIListReview?
    var receiptDraft: ReceiptDraft?

    @ObservationIgnored private var authStateHandle: AuthStateDidChangeListenerHandle?
    @ObservationIgnored private var observations: [(DatabaseReference, DatabaseHandle)] = []
    @ObservationIgnored private let database = Database.database().reference()
    @ObservationIgnored private let api = NativeAPIClient()

    var remainingGroceries: Int { groceries.count(where: { !$0.isPurchased }) }
    var userDisplayName: String { currentUser?.displayName ?? currentUser?.email ?? "משתמש" }
    var isActiveListOwner: Bool { accessibleLists.first(where: { $0.id == activeListID })?.status == "owner" }
    var categoryNames: [String] { categories.map(\.name) }
    var missingItemsShareText: String {
        groceries.filter { !$0.isPurchased }.map { "• \($0.name)" }.joined(separator: "\n")
    }

    func startAuthentication() {
        guard authStateHandle == nil else { return }
        currentUser = Auth.auth().currentUser
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.currentUser = user
                self?.stopObserving()
                if let user { self?.discoverLists(for: user) }
            }
        }
    }

    private func discoverLists(for user: User) {
        let legacyOwnID = user.email.map(Self.sanitizeEmailKey)

        // Do not make the first household load depend on the identity binding.
        // Older accounts are keyed by normalized email and can be opened
        // immediately while the newer UID binding is resolved in parallel.
        if let legacyOwnID {
            accessibleLists = [HouseholdList(id: legacyOwnID, name: "הבית שלי", status: "owner")]
            selectList(legacyOwnID)
        }

        let binding = database.child("identityBindings/\(user.uid)")
        binding.observeSingleEvent(of: .value) { [weak self] snapshot in
            guard let self else { return }
            let value = snapshot.value as? [String: Any] ?? [:]
            let ownID = value["ownListId"] as? String
            let access = value["accessibleLists"] as? [String: Any] ?? [:]
            var ids = Set(access.compactMap { key, allowed in
                (allowed as? Bool) == true ? key : nil
            })
            if let ownID, !ownID.isEmpty { ids.insert(ownID) }

            // Existing production households predate identityBindings and are keyed
            // by the owner's normalized email. The web app still discovers those
            // records this way, so native must use the same compatibility path rather
            // than presenting a new empty household.
            if ownID == nil, let legacyOwnID { ids.insert(legacyOwnID) }
            Task { @MainActor in
                self.accessibleLists = ids.map {
                    let isOwner = $0 == ownID || $0 == legacyOwnID
                    return HouseholdList(id: $0, name: isOwner ? "הבית שלי" : $0, status: isOwner ? "owner" : "approved")
                }.sorted { $0.name < $1.name }
                if let chosen = ownID ?? legacyOwnID ?? ids.first {
                    self.selectList(chosen)
                    if self.activeListID == chosen { Task { await self.loadHouseholdSnapshot(chosen) } }
                }
            }
        } withCancel: { [weak self] _ in
            Task { @MainActor in
                guard let self, let legacyOwnID else { return }
                if self.activeListID == nil { self.selectList(legacyOwnID) }
            }
        }
    }

    private static func sanitizeEmailKey(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: ".", with: "_")
            .replacingOccurrences(of: "#", with: "_")
            .replacingOccurrences(of: "$", with: "_")
            .replacingOccurrences(of: "[", with: "_")
            .replacingOccurrences(of: "]", with: "_")
    }

    func selectList(_ listID: String) {
        guard listID != activeListID else { return }
        stopObserving()
        activeListID = listID
        householdName = accessibleLists.first(where: { $0.id == listID })?.name ?? "הבית שלי"
        observeHousehold(listID)
        Task { await loadHouseholdSnapshot(listID) }
    }

    private func loadHouseholdSnapshot(_ listID: String) async {
        operationState = .loading
        do {
            let values = try await api.householdSnapshot(listID: listID)
            guard activeListID == listID else { return }
            if let name = values["name"] as? String, !name.isEmpty { householdName = name }
            mapGroceries(values["groceries"] as? [String: Any] ?? [:])
            mapStock(values["stock"] as? [String: Any] ?? [:])
            mapReceipts(values["receipts"] as? [String: Any] ?? [:])
            mapRecipes(values["recipes"] as? [String: Any] ?? [:])
            mapCategories(values["categories"] as? [String: Any] ?? [:])
            mapInvites(values["invites"] as? [String: Any] ?? [:])
            operationState = .ready
        } catch {
            operationState = .failed("לא הצלחנו לטעון את נתוני הבית. נסו לרענן.")
        }
    }

    func refreshHousehold() async {
        guard let activeListID else { return }
        await loadHouseholdSnapshot(activeListID)
    }

    private func observeHousehold(_ listID: String) {
        observe("users/\(listID)/groceries") { [weak self] values in self?.mapGroceries(values) }
        observe("users/\(listID)/stock") { [weak self] values in self?.mapStock(values) }
        observe("users/\(listID)/receipts") { [weak self] values in self?.mapReceipts(values) }
        observe("users/\(listID)/recipes") { [weak self] values in self?.mapRecipes(values) }
        observe("users/\(listID)/categories") { [weak self] values in self?.mapCategories(values) }
        observe("users/\(listID)/invites") { [weak self] values in self?.mapInvites(values) }
        observe("whats_new") { [weak self] values in self?.mapWhatsNew(values) }
        let profile = database.child("users/\(listID)/name")
        let handle = profile.observe(.value) { [weak self] snapshot in
            guard let name = snapshot.value as? String, !name.isEmpty else { return }
            Task { @MainActor in self?.householdName = name }
        }
        observations.append((profile, handle))
    }

    private func observe(_ path: String, update: @escaping @MainActor ([String: Any]) -> Void) {
        let reference = database.child(path)
        let handle = reference.observe(.value) { snapshot in
            let values = snapshot.value as? [String: Any] ?? [:]
            Task { @MainActor in update(values) }
        }
        observations.append((reference, handle))
    }

    private func mapGroceries(_ values: [String: Any]) {
        groceries = values.compactMap { key, raw in
            guard let value = raw as? [String: Any], let name = value["item"] as? String, !name.isEmpty else { return nil }
            return GroceryItem(id: key, name: name, category: value["category"] as? String ?? "אחר", quantity: (value["quantity"] as? NSNumber)?.doubleValue ?? 1, unit: value["unit"] as? String ?? "יח׳", isPurchased: value["bought"] as? Bool ?? false, listName: value["list_name"] as? String, note: value["note"] as? String, imageURL: value["image_url"] as? String)
        }.sorted { ($0.isPurchased ? 1 : 0, $0.name) < ($1.isPurchased ? 1 : 0, $1.name) }
    }

    private func mapStock(_ values: [String: Any]) {
        stock = values.compactMap { key, raw in
            guard let value = raw as? [String: Any], let name = value["name"] as? String else { return nil }
            return StockItem(id: key, name: name, category: value["category"] as? String ?? "אחר", quantity: (value["quantity"] as? NSNumber)?.doubleValue ?? 0, unit: value["unit"] as? String ?? "יח׳", lowThreshold: (value["low_threshold"] as? NSNumber)?.doubleValue ?? 0)
        }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private func mapReceipts(_ values: [String: Any]) {
        receipts = values.compactMap { key, raw in
            guard let value = raw as? [String: Any] else { return nil }
            let lines = (value["items"] as? [[String: Any]] ?? []).compactMap { item -> ReceiptLine? in
                guard let name = item["name"] as? String else { return nil }
                return ReceiptLine(name: name, price: (item["price"] as? NSNumber)?.doubleValue ?? 0, quantity: (item["quantity"] as? NSNumber)?.doubleValue ?? 1)
            }
            return ReceiptRecord(id: key, store: value["store_name"] as? String ?? "חנות", total: (value["total"] as? NSNumber)?.doubleValue, scannedAt: Self.date(value["scanned_at"] as? String) ?? .now, items: lines)
        }.sorted { $0.scannedAt > $1.scannedAt }
    }

    private func mapRecipes(_ values: [String: Any]) {
        recipes = values.compactMap { key, raw in
            guard let value = raw as? [String: Any], let title = value["title"] as? String else { return nil }
            let ingredients = (value["ingredients"] as? [[String: Any]] ?? []).compactMap { ingredient -> RecipeIngredient? in
                guard let name = ingredient["name"] as? String else { return nil }
                return RecipeIngredient(name: name, quantity: ingredient["quantity"] as? String, groceryKey: ingredient["groceryKey"] as? String, fromSelectedProducts: ingredient["fromSelectedProducts"] as? Bool, pantryBasic: ingredient["pantryBasic"] as? Bool)
            }
            return RecipeIdea(id: key, title: title, description: value["description"] as? String ?? "", servings: (value["servings"] as? NSNumber)?.intValue ?? 2, estimatedTimeMinutes: (value["estimatedTimeMinutes"] as? NSNumber)?.intValue, ingredients: ingredients, steps: value["steps"] as? [String] ?? [], chefNotes: value["chefNotes"] as? String, mealType: value["mealType"] as? String, selectedProducts: nil, assumedBasics: value["assumedBasics"] as? [String], nutrition: nil, image: nil, source: nil)
        }
    }

    private func mapCategories(_ values: [String: Any]) {
        categories = values.compactMap { key, raw in
            guard let value = raw as? [String: Any], let name = value["name"] as? String else { return nil }
            return CategoryItem(id: key, name: name, icon: value["icon"] as? String ?? "📌", color: value["color"] as? String ?? "#a8a8a8", isProtected: value["protected"] as? Bool ?? false, order: (value["order"] as? NSNumber)?.intValue ?? 0)
        }.sorted { ($0.order, $0.name) < ($1.order, $1.name) }
    }

    private func mapInvites(_ values: [String: Any]) {
        invites = values.values.compactMap { raw in
            guard let value = raw as? [String: Any], let email = value["email"] as? String else { return nil }
            return MemberInvite(email: email, status: value["status"] as? String ?? "pending")
        }.sorted { $0.email < $1.email }
    }

    private func mapWhatsNew(_ values: [String: Any]) {
        guard let version = values["version"] as? String else { whatsNew = nil; return }
        whatsNew = WhatsNewItem(version: version, updates: values["updates"] as? [String] ?? [])
    }

    private func stopObserving() {
        observations.forEach { $0.0.removeObserver(withHandle: $0.1) }
        observations.removeAll()
    }

    func signInWithGoogle() async {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        authenticationError = nil
        defer { isAuthenticating = false }
        do {
            guard let clientID = FirebaseApp.app()?.options.clientID, let presenter = Self.presentingViewController() else { throw AppError.configuration }
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { throw AppError.configuration }
            let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
            _ = try await Auth.auth().signIn(with: credential)
        } catch let error as GIDSignInError where error.code == .canceled { return }
        catch { authenticationError = "לא הצלחנו להתחבר עם Google. אפשר לנסות שוב." }
    }

    func signOut() {
        do { GIDSignIn.sharedInstance.signOut(); try Auth.auth().signOut() }
        catch { authenticationError = "לא הצלחנו להתנתק כרגע." }
    }

    func addGrocery(named name: String, listName: String? = nil) async {
        guard let listID = activeListID else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await perform { try await self.api.addGrocery(listID: listID, name: trimmed, listName: listName) }
    }

    func bulkAddGroceries(_ text: String, listName: String? = nil) async {
        let names = text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.prefix(100)
        guard !names.isEmpty else { return }
        operationState = .loading
        do {
            for name in names { try await api.addGrocery(listID: activeListID ?? "", name: name, listName: listName) }
            operationState = .ready
        } catch { operationState = .failed(error.localizedDescription) }
    }

    func togglePurchased(_ item: GroceryItem) async {
        guard let listID = activeListID else { return }
        await perform { try await self.api.setPurchased(listID: listID, itemID: item.id, bought: !item.isPurchased) }
    }

    func deleteGrocery(_ item: GroceryItem) async {
        guard let listID = activeListID else { return }
        await perform { try await self.api.deleteGrocery(listID: listID, itemID: item.id) }
    }

    func updateGrocery(_ item: GroceryItem) async {
        guard let listID = activeListID else { return }
        let name = item.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        await perform {
            try await self.api.updateGroceryMetadata(
                listID: listID,
                itemID: item.id,
                name: name,
                category: item.category,
                listName: item.listName
            )
            try await self.api.updateGroceryDetails(
                listID: listID,
                itemID: item.id,
                note: item.note,
                quantity: item.quantity,
                unit: item.unit
            )
        }
    }

    func requestAIInsights() async {
        guard !groceries.isEmpty else { operationState = .failed("הוסיפו מוצרים לפני בקשת התובנות."); return }
        await perform {
            let body = self.aiRequestBody(mode: "insights")
            self.aiInsights = try await self.api.aiInsights(body: body)
        }
    }

    func requestAIListReview() async {
        guard !groceries.isEmpty else { operationState = .failed("אין עדיין מוצרים לבדיקה."); return }
        await perform { self.aiListReview = try await self.api.aiListReview(body: self.aiRequestBody(mode: "list_review")) }
    }

    func applyAIListReview(_ review: AIListReview) async {
        guard let listID = activeListID else { return }
        await perform {
            for group in review.duplicates {
                for key in group.removeKeys { try await self.api.deleteGrocery(listID: listID, itemID: key) }
            }
            for rename in review.renames { try await self.api.renameGrocery(listID: listID, itemID: rename.key, name: rename.suggestedName) }
            self.aiListReview = nil
        }
    }

    private func aiRequestBody(mode: String) -> [String: Any] {
        ["mode": mode, "language": "he", "householdName": householdName, "items": groceries.map { ["key": $0.id, "name": $0.name, "category": $0.category, "bought": $0.isPurchased, "listName": ($0.listName as Any?) ?? NSNull(), "addedAt": "", "modifiedAt": NSNull()] }, "changes": [], "purchases": [], "categories": categoryNames]
    }

    func renameHousehold(to name: String) async {
        guard let listID = activeListID, isActiveListOwner else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await perform { try await self.database.child("users/\(listID)/name").setValue(trimmed) }
    }

    func submitFeedback(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await perform { try await self.api.submitFeedback(text: trimmed, name: self.userDisplayName, email: self.currentUser?.email) }
    }

    func suggestRecipes(message: String, servings: Int = 2, mealType: String = "other", preferences: String = "", productIDs: Set<String>? = nil) async {
        guard let listID = activeListID, !groceries.isEmpty else { operationState = .failed("אין עדיין מוצרים שמהם אפשר לבנות מתכון."); return }
        await perform {
            let available = self.groceries.filter { !$0.isPurchased }
            let baseProducts = available.isEmpty ? self.groceries : available
            let products = productIDs.map { ids in baseProducts.filter { ids.contains($0.id) } } ?? baseProducts
            self.recipes = try await self.api.suggestRecipes(listID: listID, message: message, servings: servings, mealType: mealType, preferences: preferences, products: products)
        }
    }

    func saveRecipe(_ recipe: RecipeIdea) async {
        guard let listID = activeListID else { return }
        await perform { try await self.api.saveRecipe(listID: listID, recipe: recipe) }
    }

    func scanReceipt(data: Data, mimeType: String) async {
        await perform { self.receiptDraft = try await self.api.scanReceipt(data: data, mimeType: mimeType) }
    }

    func scanReceipt(url: String) async {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard URL(string: trimmed)?.scheme?.hasPrefix("http") == true else {
            operationState = .failed("יש להזין קישור תקין לקבלה.")
            return
        }
        await perform { self.receiptDraft = try await self.api.scanReceipt(url: trimmed) }
    }

    func saveReceipt(_ draft: ReceiptDraft, imageData: Data?, mimeType: String?) async {
        guard let listID = activeListID else { return }
        await perform {
            try await self.api.saveReceipt(listID: listID, draft: draft, imageData: imageData, mimeType: mimeType)
            self.receiptDraft = nil
        }
    }

    func deleteReceipt(_ receipt: ReceiptRecord) async {
        guard let listID = activeListID else { return }
        await perform { try await self.api.deleteReceipt(listID: listID, receiptID: receipt.id) }
    }

    func saveStock(_ item: StockItem, isNew: Bool) async {
        guard let listID = activeListID else { return }
        await perform {
            if isNew { try await self.api.createStock(listID: listID, item: item) }
            else { try await self.api.updateStock(listID: listID, item: item) }
        }
    }

    func adjustStock(_ item: StockItem, by delta: Double) async {
        var updated = item
        updated.quantity = max(0, item.quantity + delta)
        await saveStock(updated, isNew: false)
    }

    func deleteStock(_ item: StockItem) async {
        guard let listID = activeListID else { return }
        await perform { try await self.api.deleteStock(listID: listID, stockID: item.id) }
    }

    func addStockToGroceries(_ item: StockItem) async {
        await addGrocery(named: item.name)
    }

    func saveCategory(_ category: CategoryItem, isNew: Bool) async {
        guard let listID = activeListID else { return }
        await perform {
            if isNew { try await self.api.createCategory(listID: listID, category: category) }
            else { try await self.api.updateCategory(listID: listID, category: category) }
        }
    }

    func deleteCategory(_ category: CategoryItem) async {
        guard let listID = activeListID, isActiveListOwner, !category.isProtected else { return }
        await perform { try await self.api.deleteCategory(listID: listID, categoryID: category.id) }
    }

    func inviteMember(email: String) async {
        guard let listID = activeListID, isActiveListOwner else { return }
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalized.contains("@") else { operationState = .failed("יש להזין כתובת אימייל תקינה."); return }
        await perform { try await self.api.inviteMember(listID: listID, email: normalized) }
    }

    func removeInvite(_ invite: MemberInvite) async {
        guard let listID = activeListID, isActiveListOwner else { return }
        await perform { try await self.api.removeMember(listID: listID, email: invite.email) }
    }

    private func perform(_ work: @escaping () async throws -> Void) async {
        operationState = .loading
        do { try await work(); operationState = .ready }
        catch { operationState = .failed(error.localizedDescription) }
    }

    private static func date(_ string: String?) -> Date? {
        guard let string else { return nil }
        return ISO8601DateFormatter().date(from: string)
    }

    private static func presentingViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        var presented = windows.first(where: \.isKeyWindow)?.rootViewController
        while let next = presented?.presentedViewController { presented = next }
        return presented
    }
}

private enum AppError: LocalizedError {
    case configuration, invalidResponse(String)
    var errorDescription: String? {
        switch self {
        case .configuration: "חסרה הגדרת התחברות באפליקציה."
        case .invalidResponse(let message): message
        }
    }
}

@MainActor
private struct NativeAPIClient {
    private let baseURL = URL(string: "https://fridge-list-app.vercel.app")!

    func householdSnapshot(listID: String) async throws -> [String: Any] {
        let data = try await request("/api/lists/\(segment(listID))/snapshot", method: "GET", body: nil)
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AppError.invalidResponse("נתוני הבית שהתקבלו אינם תקינים.")
        }
        return result
    }

    func addGrocery(listID: String, name: String, listName: String? = nil) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries", method: "POST", body: ["name": name, "category": "אחר", "quantity": 1, "unit": "יח׳", "listName": (listName as Any?) ?? NSNull(), "operationId": UUID().uuidString])
    }

    func setPurchased(listID: String, itemID: String, bought: Bool) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries/\(segment(itemID))/purchased", method: "PUT", body: ["bought": bought])
    }

    func deleteGrocery(listID: String, itemID: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries/\(segment(itemID))", method: "DELETE", body: nil)
    }

    func renameGrocery(listID: String, itemID: String, name: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries/\(segment(itemID))", method: "PATCH", body: ["name": name])
    }

    func updateGroceryMetadata(listID: String, itemID: String, name: String, category: String, listName: String?) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries/\(segment(itemID))", method: "PATCH", body: ["name": name, "category": category, "listName": (listName as Any?) ?? NSNull()])
    }

    func updateGroceryDetails(listID: String, itemID: String, note: String?, quantity: Double, unit: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/groceries/\(segment(itemID))", method: "PATCH", body: ["note": (note as Any?) ?? NSNull(), "quantity": quantity, "unit": unit])
    }

    func aiInsights(body: [String: Any]) async throws -> AIInsights {
        let data = try await request("/api/ai/analyze", method: "POST", body: body)
        guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AppError.invalidResponse("תשובת AI לא תקינה.") }
        return try JSONDecoder().decode(AIInsights.self, from: JSONSerialization.data(withJSONObject: envelope["result"] ?? envelope))
    }

    func aiListReview(body: [String: Any]) async throws -> AIListReview {
        let data = try await request("/api/ai/analyze", method: "POST", body: body)
        guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw AppError.invalidResponse("תשובת AI לא תקינה.") }
        return try JSONDecoder().decode(AIListReview.self, from: JSONSerialization.data(withJSONObject: envelope["result"] ?? envelope))
    }

    func submitFeedback(text: String, name: String, email: String?) async throws {
        _ = try await request("/api/submit-feedback", method: "POST", body: ["request": text, "name": name, "email": (email as Any?) ?? NSNull(), "submittedAt": ISO8601DateFormatter().string(from: .now), "language": "he", "source": "fridge-native-ios", "route": "settings"])
    }

    func suggestRecipes(listID: String, message: String, servings: Int, mealType: String, preferences: String, products: [GroceryItem]) async throws -> [RecipeIdea] {
        let body: [String: Any] = ["listId": listID, "servings": servings, "mealType": mealType, "preferences": preferences, "chefMessage": message, "language": "he", "products": products.map { ["groceryKey": $0.id, "name": $0.name, "category": $0.category, "quantity": $0.quantity, "unit": $0.unit] }]
        let data = try await request("/api/personal-chef/suggest-recipes", method: "POST", body: body)
        let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let recipes = envelope?["recipes"] ?? []
        return try JSONDecoder().decode([RecipeIdea].self, from: JSONSerialization.data(withJSONObject: recipes))
    }

    func saveRecipe(listID: String, recipe: RecipeIdea) async throws {
        guard recipe.mealType != nil, recipe.selectedProducts?.isEmpty == false, recipe.image != nil, recipe.source != nil else {
            throw AppError.invalidResponse("אפשר לשמור מתכון חדש שנוצר על ידי השף האישי.")
        }
        let encoded = try JSONEncoder().encode(recipe)
        guard var object = try JSONSerialization.jsonObject(with: encoded) as? [String: Any] else { throw AppError.invalidResponse("המתכון לא תקין.") }
        object.removeValue(forKey: "id")
        object["id"] = recipe.id
        _ = try await request("/api/recipes", method: "POST", body: ["listId": listID, "operationId": UUID().uuidString, "recipe": object])
    }

    func scanReceipt(data: Data, mimeType: String) async throws -> ReceiptDraft {
        let response = try await request("/api/scan-receipt", method: "POST", body: ["image_base64": data.base64EncodedString(), "mime_type": mimeType])
        return try JSONDecoder().decode(ReceiptDraft.self, from: response)
    }

    func scanReceipt(url: String) async throws -> ReceiptDraft {
        let response = try await request("/api/scan-receipt-url", method: "POST", body: ["url": url])
        return try JSONDecoder().decode(ReceiptDraft.self, from: response)
    }

    func saveReceipt(listID: String, draft: ReceiptDraft, imageData: Data?, mimeType: String?) async throws {
        var body: [String: Any] = ["store_name": draft.storeName, "items": draft.items.map { ["name": $0.name, "price": $0.price, "quantity": $0.quantity] }, "total": draft.total as Any, "source_url": NSNull()]
        if let imageData { body["image"] = ["data": imageData.base64EncodedString(), "contentType": mimeType ?? "image/jpeg"] }
        else { body["image"] = NSNull() }
        _ = try await request("/api/lists/\(segment(listID))/receipts", method: "POST", body: body)
    }

    func deleteReceipt(listID: String, receiptID: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/receipts/\(segment(receiptID))", method: "DELETE", body: nil)
    }

    func createStock(listID: String, item: StockItem) async throws {
        _ = try await request("/api/lists/\(segment(listID))/stock", method: "POST", body: stockBody(item))
    }

    func updateStock(listID: String, item: StockItem) async throws {
        _ = try await request("/api/lists/\(segment(listID))/stock/\(segment(item.id))", method: "PATCH", body: stockBody(item))
    }

    func deleteStock(listID: String, stockID: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/stock/\(segment(stockID))", method: "DELETE", body: nil)
    }

    func createCategory(listID: String, category: CategoryItem) async throws {
        _ = try await request("/api/lists/\(segment(listID))/categories", method: "POST", body: categoryBody(category))
    }

    func updateCategory(listID: String, category: CategoryItem) async throws {
        _ = try await request("/api/lists/\(segment(listID))/categories/\(segment(category.id))", method: "PATCH", body: categoryBody(category))
    }

    func deleteCategory(listID: String, categoryID: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/categories/\(segment(categoryID))", method: "DELETE", body: nil)
    }

    func inviteMember(listID: String, email: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/members", method: "POST", body: ["email": email])
    }

    func removeMember(listID: String, email: String) async throws {
        _ = try await request("/api/lists/\(segment(listID))/members/\(segment(email))", method: "DELETE", body: nil)
    }

    private func stockBody(_ item: StockItem) -> [String: Any] {
        ["name": item.name, "category": item.category, "quantity": item.quantity, "unit": item.unit, "lowThreshold": item.lowThreshold]
    }

    private func categoryBody(_ category: CategoryItem) -> [String: Any] {
        ["name": category.name, "color": category.color, "icon": category.icon, "order": category.order]
    }

    private func request(_ path: String, method: String, body: [String: Any]?) async throws -> Data {
        guard let user = Auth.auth().currentUser else { throw AppError.invalidResponse("צריך להתחבר מחדש.") }
        let token = try await user.getIDToken()
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw AppError.invalidResponse(message ?? "הפעולה לא הושלמה. נסו שוב.")
        }
        return data
    }

    private func segment(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value }
}
