export type StockRecord = {
  key: string
  name: string
  category: string
  quantity: number
  unit: string
  low_threshold: number
  updated_at: string
  updated_by: string | null
}

export type NewStockRecord = Omit<StockRecord, 'key'>
export type StockPatch = Partial<Omit<NewStockRecord, 'updated_at' | 'updated_by'>> &
  Pick<NewStockRecord, 'updated_at' | 'updated_by'>

export interface StockRepository {
  insert(listId: string, record: NewStockRecord): Promise<string>
  update(listId: string, stockId: string, patch: StockPatch): Promise<void>
  delete(listId: string, stockId: string): Promise<void>
  list(listId: string): Promise<readonly StockRecord[]>
}
