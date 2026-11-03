import { createContext } from 'react'
import type { Category } from '../types'

// Optional local data source. Production providers leave this unset.
export const LocalCategoriesContext = createContext<Category[] | null>(null)
