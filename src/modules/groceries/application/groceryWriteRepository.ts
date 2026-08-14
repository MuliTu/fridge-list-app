export interface NewGroceryRecord {
  item: string
  category: string
  added_at: string
  raw_text: string | null
  bought: boolean
  created_by: string | null
  list_name?: string | null
  quantity?: number | null
  unit?: string | null
  modified_at?: string
  modified_by?: string | null
}

export interface ReactivateGroceryRecord {
  bought: false
  added_at: string
}

export type GroceryPatch = Partial<
  Pick<
    NewGroceryRecord,
    'item' | 'category' | 'bought' | 'list_name' | 'quantity' | 'unit' | 'modified_at' | 'modified_by'
  >
> & {
  note?: string | null
}

/** Persistence boundary for the existing users/{listId}/groceries RTDB collection. */
export interface GroceryRepository {
  insert(listId: string, record: NewGroceryRecord): Promise<string>
  insertIdempotent(listId: string, idempotencyKey: string, record: NewGroceryRecord): Promise<string>
  reactivate(listId: string, itemKey: string, record: ReactivateGroceryRecord): Promise<void>
  update(listId: string, itemKey: string, patch: GroceryPatch): Promise<void>
  delete(listId: string, itemKey: string): Promise<void>
}

/** Compatibility alias for the first persistence slice. */
export type GroceryWriteRepository = GroceryRepository
