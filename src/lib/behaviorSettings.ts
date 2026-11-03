export type PurchaseGesture = 'tap' | 'hold'
export type ListPresentation = 'categories' | 'flat'
export interface BehaviorSettings {
  showCountdown: boolean
  purchaseGesture: PurchaseGesture
  listPresentation: ListPresentation
  showUrgent: boolean
  showChef: boolean
}
export const DEFAULT_BEHAVIOR: BehaviorSettings = {
  showCountdown: true,
  purchaseGesture: 'tap',
  listPresentation: 'categories',
  showUrgent: false,
  showChef: true
}
export function normalizeBehavior(value: unknown): BehaviorSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    showCountdown: typeof input.showCountdown === 'boolean' ? input.showCountdown : true,
    purchaseGesture: input.purchaseGesture === 'hold' ? 'hold' : 'tap',
    listPresentation: input.listPresentation === 'flat' ? 'flat' : 'categories',
    showUrgent: input.showUrgent === true,
    showChef: input.showChef !== false
  }
}
