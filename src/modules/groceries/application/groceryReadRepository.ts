export type GroceryReadRecord = {
  key: string
  item: string
  category: string
  bought: boolean
  added_at: string
  raw_text: string | null
  note: string | null
  image_url: string | null
  image_ref: string | null
  modified_at: string | null
  modified_by: string | null
  list_name: string | null
  created_by: string | null
  quantity: number | null
  unit: string | null
}

export interface GroceryReadRepository {
  list(listId: string): Promise<GroceryReadRecord[]>
}
