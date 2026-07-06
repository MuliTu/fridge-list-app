import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface GroceryItemModalProps {
  listName: string | null
  onClose: () => void
  onAdd: (item: { name: string; category: string }) => Promise<unknown> | PromiseLike<unknown>
}

export default function GroceryItemModal({ listName, onClose, onAdd }: GroceryItemModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('common:groceryItem.nameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      let items: { item: string; category: string }[]
      try {
        items = await categorizeItem(trimmed)
      } catch {
        items = []
      }
      if (items.length === 0) {
        items = [{ item: trimmed, category: OTHER_CATEGORY_NAME }]
      }
      for (const { item, category } of items) {
        await onAdd({ name: item, category })
      }
      onClose()
    } catch (err: any) {
      setError(`${t('common:groceryItem.addFailed')}: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common:groceryItem.title', { listName })}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t('common:groceryItem.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? t('common:groceryItem.categorizing') : t('common:actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
