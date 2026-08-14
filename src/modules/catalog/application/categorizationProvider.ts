export type CategorizedItem = {
  item: string
  category: string
}

export type CategorizationResult = {
  items: readonly CategorizedItem[]
}

export interface CategorizationProvider {
  categorize(text: string): Promise<CategorizationResult>
}
