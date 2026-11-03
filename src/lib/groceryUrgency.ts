export type GroceryUrgency = 'normal' | 'wanted' | 'urgent'
export const URGENCY_LEVELS: GroceryUrgency[] = ['normal', 'wanted', 'urgent']
export const urgencyRank = (value: unknown): number => value === 'urgent' ? 2 : value === 'wanted' ? 1 : 0
export const normalizeUrgency = (value: unknown): GroceryUrgency => value === 'urgent' || value === 'wanted' ? value : 'normal'
