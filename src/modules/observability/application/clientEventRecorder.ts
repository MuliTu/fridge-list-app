export const CLIENT_EVENT_NAMES = [
  'lists.ensureOwnList',
  'lists.approvePendingInvites',
  'lists.inviteToList',
  'lists.removeListMember',
  'lists.renameOwnList',
  'lists.sendInviteEmail',
  'groceries.setBought',
  'groceries.updateGroceryItemCategory',
  'groceries.saveItemDetails',
  'groceries.updateGroceryItemName',
  'groceries.deleteItem',
  'groceries.addStockItemToShoppingList',
  'groceries.addGroceryItem',
  'groceries.createSuggestedList',
  'groceries.applyAiListReview',
  'groceries.addPurchasedGroceryItem',
  'groceries.deleteGroceryList',
  'stock.addStockItem',
  'stock.adjustStockQuantity',
  'stock.updateStockItem',
  'stock.deleteStockItem',
  'receipts.applyReceiptReconciliation',
  'receipts.saveReceipt',
  'receipts.deleteReceipt',
  'recipes.saveRecipe',
  'categories.seedCategoriesIfEmpty',
  'categories.addCategory',
  'categories.updateCategory',
  'categories.deleteCategory',
  'feedback.submitFeedback'
] as const

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number]
export type ClientEventLevel = 'success' | 'warn' | 'error'

export type ClientEventRecord = {
  name: ClientEventName
  level: ClientEventLevel
  userId: string
  requestId: string
  occurredAt: string
}

export interface ClientEventRecorder {
  record(event: ClientEventRecord): void | Promise<void>
}
