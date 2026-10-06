import type { GroceryItem } from '../../../types'
import type { RecipeRecordInput } from '../domain/recipeSchemas'

export interface RecipeRepository {
  insert(listId: string, record: Omit<RecipeRecordInput, 'key'>, operation: { uid: string; id: string; intent: unknown }): Promise<string>
}

export interface ChefGroceryRepository {
  getGroceriesByKeys(listId: string, keys: readonly string[]): Promise<GroceryItem[]>
}
