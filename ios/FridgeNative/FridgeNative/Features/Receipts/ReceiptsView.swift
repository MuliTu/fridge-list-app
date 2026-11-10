import PhotosUI
import SwiftUI

struct ReceiptsView: View {
    @Environment(AppStore.self) private var store
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedData: Data?
    @State private var showingReview = false
    @State private var showingURLScanner = false
    @State private var receiptURL = ""

    var body: some View {
        let isLoading = store.operationState == .loading
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    ScreenHeader(eyebrow: "אחרי הקניות", title: "כל קנייה, במקום", detail: "סורקים קבלה, ה־AI מזהה ושומרים להיסטוריה.", symbol: "receipt.fill")
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $selectedPhoto, matching: .images) {
                            Label(isLoading ? "סורק…" : "מתמונה", systemImage: "doc.viewfinder")
                                .font(.headline).foregroundStyle(FridgeTheme.canvas).frame(maxWidth: .infinity).padding(.vertical, 15)
                                .background(FridgeTheme.accent, in: .rect(cornerRadius: 17, style: .continuous))
                        }
                        Button { showingURLScanner = true } label: {
                            Label("מקישור", systemImage: "link")
                                .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                                .background(FridgeTheme.elevated, in: .rect(cornerRadius: 17, style: .continuous))
                        }
                    }
                    .buttonStyle(PressableButtonStyle()).disabled(isLoading).padding(.horizontal, 20)
                    .onChange(of: selectedPhoto) { _, photo in
                        guard let photo else { return }
                        Task {
                            selectedData = try? await photo.loadTransferable(type: Data.self)
                            if let selectedData { await store.scanReceipt(data: selectedData, mimeType: "image/jpeg"); showingReview = store.receiptDraft != nil }
                        }
                    }

                    if case .failed(let message) = store.operationState { Text(message).font(.footnote).foregroundStyle(FridgeTheme.danger).padding(.horizontal, 20) }
                    if store.receipts.isEmpty { EmptyState(symbol: "receipt", title: "אין עדיין קבלות", detail: "הקבלה הראשונה שתסרקו תופיע כאן.") }
                    ForEach(store.receipts) { receipt in receiptCard(receipt) }.padding(.horizontal, 20)
                }.padding(.bottom, 28)
            }
            .fridgeBackground()
            .sheet(isPresented: $showingReview) {
                if let draft = store.receiptDraft {
                    ReceiptReviewView(draft: draft) { reviewed in
                        await store.saveReceipt(reviewed, imageData: selectedData, mimeType: "image/jpeg")
                        selectedPhoto = nil; selectedData = nil; showingReview = false
                    }
                }
            }
            .sheet(isPresented: $showingURLScanner) {
                NavigationStack {
                    Form { Section("קישור לקבלה דיגיטלית") { TextField("https://…", text: $receiptURL).textInputAutocapitalization(.never).keyboardType(.URL) } }
                        .navigationTitle("סריקה מקישור")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("ביטול") { showingURLScanner = false } }
                            ToolbarItem(placement: .confirmationAction) {
                                Button("סריקה") { Task { await store.scanReceipt(url: receiptURL); showingURLScanner = false; showingReview = store.receiptDraft != nil } }
                                    .disabled(receiptURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            }
                        }
                }
            }
        }
    }

    private func receiptCard(_ receipt: ReceiptRecord) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "bag.fill").foregroundStyle(FridgeTheme.accent).frame(width: 44, height: 44).background(FridgeTheme.elevated, in: .rect(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                Text(receipt.store).font(.headline)
                Text("\(receipt.items.count) פריטים · \(receipt.scannedAt.formatted(date: .abbreviated, time: .omitted))").font(.caption).foregroundStyle(FridgeTheme.muted)
            }
            Spacer()
            if let total = receipt.total { Text(total, format: .currency(code: "ILS")).font(.headline.monospacedDigit()) }
        }.fridgeCard()
            .contextMenu {
                Button("מחיקת קבלה", systemImage: "trash", role: .destructive) { Task { await store.deleteReceipt(receipt) } }
            }
    }
}

private struct ReceiptReviewView: View {
    @State var draft: ReceiptDraft
    let onSave: (ReceiptDraft) async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("חנות") { TextField("שם החנות", text: $draft.storeName) }
                Section("פריטים שזוהו") {
                    ForEach($draft.items) { $item in
                        VStack(alignment: .leading) {
                            TextField("מוצר", text: $item.name)
                            HStack {
                                TextField("כמות", value: $item.quantity, format: .number).keyboardType(.decimalPad)
                                TextField("מחיר", value: $item.price, format: .number).keyboardType(.decimalPad)
                            }.font(.caption)
                        }
                    }
                    .onDelete { offsets in draft.items.remove(atOffsets: offsets) }
                    Button("הוספת שורה", systemImage: "plus") { draft.items.append(ReceiptLine(name: "", price: 0, quantity: 1)) }
                }
                Section("סה״כ") { TextField("סה״כ", value: $draft.total, format: .number).keyboardType(.decimalPad) }
            }
            .navigationTitle("בדיקת קבלה")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("שמירה") { Task { await onSave(draft) } }.disabled(draft.items.isEmpty) }
            }
        }
    }
}
