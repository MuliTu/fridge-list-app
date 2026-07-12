import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogService } from '../hooks/DialogServiceContext'
import { useListApi } from '../hooks/ListContext'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface CategoriesModalProps {
  categories: Category[]
  onClose: () => void
}

export default function CategoriesModal({ categories, onClose }: CategoriesModalProps) {
  const { t } = useTranslation()
  const { confirm } = useDialogService()
  const { addCategory, deleteCategory, updateCategory } = useListApi()
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📌')
  const [newColor, setNewColor] = useState('#a8a8a8')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError(t('categories:nameRequired'))
      return
    }
    setError(null)
    try {
      const maxOrder = categories.reduce((max, c) => (typeof c.order === 'number' && c.order > max ? c.order : max), -1)
      await addCategory({ name: newName.trim(), icon: newIcon.trim() || '📌', color: newColor, order: maxOrder + 1 })
      setNewName('')
      setNewIcon('📌')
    } catch (err: any) {
      setError(`${t('categories:addFailed')}: ${err.message}`)
    }
  }

  const handleDelete = async (cat: Category) => {
    if (!(await confirm(t('categories:deleteConfirm', { categoryName: cat.name })))) return
    try {
      await deleteCategory(cat.key)
    } catch (err: any) {
      setError(`${t('categories:deleteFailed')}: ${err.message}`)
    }
  }

  const handleMove = async (index: number, direction: 1 | -1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return
    const current = categories[index]
    const neighbor = categories[targetIndex]
    // Categories seeded before this feature existed have no `order` field yet —
    // fall back to their current display position instead of writing `order:
    // undefined`, which the Firebase SDK rejects outright.
    const currentOrder = typeof current.order === 'number' ? current.order : index
    const neighborOrder = typeof neighbor.order === 'number' ? neighbor.order : targetIndex
    try {
      await Promise.all([
        updateCategory(current.key, { order: neighborOrder }),
        updateCategory(neighbor.key, { order: currentOrder })
      ])
    } catch (err: any) {
      setError(`${t('categories:reorderFailed')}: ${err.message}`)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('categories:title')}</DialogTitle>
        </DialogHeader>

        <div className="category-rows">
          {categories.map((cat, index) => (
            <div className="category-row" key={cat.key}>
              <div className="category-order-btns">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-[26px] w-[26px]"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  aria-label={t('categories:moveUp')}
                >
                  ▲
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-[26px] w-[26px]"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === categories.length - 1}
                  aria-label={t('categories:moveDown')}
                >
                  ▼
                </Button>
              </div>
              <Input
                className="w-11 shrink-0 px-1 text-center"
                value={cat.icon || ''}
                onChange={(e) => updateCategory(cat.key, { icon: e.target.value })}
              />
              <Input
                value={cat.name}
                disabled={cat.protected}
                onChange={(e) => updateCategory(cat.key, { name: e.target.value })}
              />
              <input
                className="category-color-input"
                type="color"
                value={cat.color}
                onChange={(e) => updateCategory(cat.key, { color: e.target.value })}
              />
              {!cat.protected && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-[26px] w-[26px]"
                  onClick={() => handleDelete(cat)}
                  aria-label={t('categories:deleteCategory')}
                >
                  🗑
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="category-row">
          <Input
            className="w-11 shrink-0 px-1 text-center"
            placeholder={t('categories:newCategoryIconPlaceholder')}
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
          />
          <Input
            placeholder={t('categories:newCategoryNamePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="category-color-input"
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-[26px] w-[26px]"
            onClick={handleAdd}
            aria-label={t('categories:addCategory')}
          >
            ➕
          </Button>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
