import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface GroceryItemModalProps {
  listName: string | null
  categories: Category[]
  onClose: () => void
  onAdd: (item: { name: string; category: string }) => Promise<unknown> | PromiseLike<unknown>
}

export default function GroceryItemModal({ listName, categories, onClose, onAdd }: GroceryItemModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0]?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) {
      setError(t('common:groceryItem.nameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd({ name: name.trim(), category })
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

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.key} value={c.name}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? t('common:actions.adding') : t('common:actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
