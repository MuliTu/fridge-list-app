export type PurchaseHabitSummaryProviderResponse = {
  body: unknown
  status: number
}

export type PurchaseHabitSummaryProvider = {
  summarize(changes: unknown[]): Promise<PurchaseHabitSummaryProviderResponse>
}
