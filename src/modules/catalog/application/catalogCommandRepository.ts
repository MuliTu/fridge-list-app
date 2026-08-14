export type CategoryRecord = {
  key: string
  name: string
  color: string
  icon: string
  protected: boolean
  order: number
}

export type NewCategoryRecord = Omit<CategoryRecord, 'key' | 'protected'> & { protected: false }
export type CategoryPatch = Partial<Pick<CategoryRecord, 'name' | 'color' | 'icon' | 'order'>>

export interface CatalogCommandRepository {
  insert(listId: string, category: NewCategoryRecord): Promise<string>
  update(listId: string, categoryId: string, patch: CategoryPatch): Promise<void>
  reorder(listId: string, orders: Readonly<Record<string, number>>): Promise<void>
  deleteAndReassignToOthers(listId: string, categoryId: string): Promise<void>
}
