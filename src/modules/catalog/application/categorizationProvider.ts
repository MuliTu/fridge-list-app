export type CategorizedItem = {
  item: string
  category: string
}

export type CategorizationResult = {
  items: readonly CategorizedItem[]
}

export type CategorizationProvider = {
  categorize(text: string): Promise<CategorizationResult>
}
