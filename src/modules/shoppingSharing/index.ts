import type { GroceryItem } from '../../types'

export interface ShoppingShareMember {
  email: string
  displayName: string
  photoURL: string | null
}

export interface ShoppingShareSummary {
  id: string
  name: string
  owner: ShoppingShareMember
}

export interface ShoppingShareCategory {
  name: string
  color: string
  icon: string
  order: number
}

export interface ShoppingShareSnapshot extends ShoppingShareSummary {
  isOwner: boolean
  members: ShoppingShareMember[]
  items: GroceryItem[]
  categories: ShoppingShareCategory[]
}
