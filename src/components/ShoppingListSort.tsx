import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { SORT_OPTIONS, type SortOption } from '../lib/sortGroceryItems'

type ShoppingListSortProps = {
  value: SortOption
  onChange: (value: SortOption) => void
}

const LABEL_KEY: Record<SortOption, string> = {
  default: 'shoppingList:sort.default',
  'name-asc': 'shoppingList:sort.nameAsc',
  'name-desc': 'shoppingList:sort.nameDesc',
  'updated-desc': 'shoppingList:sort.updatedNewest',
  'updated-asc': 'shoppingList:sort.updatedOldest'
}

// Compact shadcn Select (a "picker" control, per the design system's bespoke-chrome-vs-
// shadcn line) styled to match the pill-row aesthetic via override className, the same
// pattern already used elsewhere for a compact shadcn trigger (e.g. AdminsModal's
// `h-[26px] w-[26px]` icon buttons). SelectValue renders the active option's own label
// text, which doubles as the "currently sorted by" visual indicator (FR-6).
export const ShoppingListSort = ({ value, onChange }: ShoppingListSortProps) => {
  const { t } = useTranslation()
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortOption)}>
      <SelectTrigger
        className="h-auto w-auto gap-1.5 rounded-full border-[rgba(244,241,232,0.15)] bg-transparent px-3 py-1.5 text-xs text-[var(--chalk-dim)]"
        aria-label={t('shoppingList:sort.label')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {t(LABEL_KEY[option])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
