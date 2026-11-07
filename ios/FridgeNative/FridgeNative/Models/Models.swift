import Foundation

enum AppTab: Hashable { case shop, kitchen, cook, receipts, settings }

struct GroceryItem: Identifiable, Hashable {
    let id: String
    var name: String
    var category: String
    var quantity: Double
    var unit: String
    var isPurchased: Bool
    var listName: String?
    var note: String?
    var imageURL: String?
}

struct StockItem: Identifiable, Hashable {
    let id: String
    var name: String
    var category: String
    var quantity: Double
    var unit: String
    var lowThreshold: Double
    var isRunningLow: Bool { quantity <= lowThreshold }
}

struct ReceiptLine: Identifiable, Hashable, Codable {
    var id = UUID()
    var name: String
    var price: Double
    var quantity: Double
    enum CodingKeys: String, CodingKey { case name, price, quantity }
}

struct ReceiptRecord: Identifiable, Hashable {
    let id: String
    let store: String
    let total: Double?
    let scannedAt: Date
    let items: [ReceiptLine]
}

struct ReceiptDraft: Identifiable, Hashable, Codable {
    var id = UUID()
    var storeName: String
    var items: [ReceiptLine]
    var total: Double?
    enum CodingKeys: String, CodingKey { case storeName = "store_name", items, total }
}

struct RecipeIdea: Identifiable, Hashable, Codable {
    let id: String
    let title: String
    let description: String
    let servings: Int
    let estimatedTimeMinutes: Int?
    let ingredients: [RecipeIngredient]
    let steps: [String]
    let chefNotes: String?
    let mealType: String?
    let selectedProducts: [RecipeProduct]?
    let assumedBasics: [String]?
    let nutrition: RecipeNutrition?
    let image: RecipeImage?
    let source: RecipeSource?
}

struct RecipeIngredient: Hashable, Codable {
    let name: String
    let quantity: String?
    let groceryKey: String?
    let fromSelectedProducts: Bool?
    let pantryBasic: Bool?
}

struct RecipeProduct: Hashable, Codable { let groceryKey: String; let name: String; let category: String; let quantity: Double?; let unit: String? }
struct RecipeNutrition: Hashable, Codable { let calories: Double?; let proteinGrams: Double?; let fatGrams: Double?; let carbsGrams: Double?; let fiberGrams: Double?; let sugarGrams: Double?; let sodiumMg: Double? }
struct RecipeImage: Hashable, Codable { let url: String?; let sourceUrl: String?; let sourceName: String?; let alt: String }
struct RecipeSource: Hashable, Codable { let kind: String; let graphRunId: String; let model: String? }

struct HouseholdList: Identifiable, Hashable {
    let id: String
    let name: String
    let status: String
}

struct CategoryItem: Identifiable, Hashable {
    let id: String
    var name: String
    var icon: String
    var color: String
    var isProtected: Bool
    var order: Int
}

struct MemberInvite: Identifiable, Hashable {
    var id: String { email }
    let email: String
    let status: String
}

struct WhatsNewItem: Hashable {
    let version: String
    let updates: [String]
}

struct AIInsights: Codable, Hashable {
    let summary: [String]
    let nextSteps: [String]
    let proposedList: ProposedList?
    struct ProposedList: Codable, Hashable {
        let name: String
        let items: [ProposedItem]
    }
    struct ProposedItem: Codable, Hashable, Identifiable {
        var id: String { name }
        let name: String
        let category: String
        let reason: String
    }
}

struct AIListReview: Codable, Hashable {
    let duplicates: [DuplicateGroup]
    let renames: [RenameSuggestion]

    struct DuplicateGroup: Codable, Hashable, Identifiable {
        var id: String { keepKey + removeKeys.joined() }
        let keepKey: String
        let removeKeys: [String]
        let reason: String
    }

    struct RenameSuggestion: Codable, Hashable, Identifiable {
        var id: String { key }
        let key: String
        let currentName: String
        let suggestedName: String
        let reason: String
    }
}

enum LoadState: Equatable { case idle, loading, ready, failed(String) }

