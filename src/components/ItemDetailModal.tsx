import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import { getImageDataUrl } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { NO_UNIT, OTHER_UNIT, UNIT_PRESETS, resolveQuantityUnit } from '../lib/units'
import { useDialogService } from '../hooks/DialogServiceContext'
import type { Category, GroceryItem } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

const MAX_NAME_LENGTH = 100

type ItemDetailModalProps = {
  entry: GroceryItem
  canEdit: boolean
  categories?: Category[]
  onSignIn: () => void
  onClose: () => void
  onSave: (
    key: string,
    details: { name: string; note: string; imageFile: File | null; quantity: number | null; unit: string | null }
  ) => Promise<unknown>
  onDelete: (key: string) => Promise<unknown>
  onMoveCategory?: (key: string, category: string) => void
}

export const ItemDetailModal = ({
  entry,
  canEdit,
  categories = [],
  onSignIn,
  onClose,
  onSave,
  onDelete,
  onMoveCategory
}: ItemDetailModalProps) => {
  const { t } = useTranslation()
  const { confirm } = useDialogService()
  // Editable product name (FR-1..FR-5). Kept in the same unified edit-and-Save modal
  // as note/photo/category rather than a separate rename flow or dialog — this app has
  // no precedent for per-field edit entry points, and every other item attribute is
  // already edited this same "open modal, edit fields, one Save" way.
  const [name, setName] = useState(entry.item)
  const [note, setNote] = useState(entry.note || '')
  // Accessible alternative to drag-and-drop re-categorization (keyboard/screen-reader
  // friendly). Persists immediately on change, matching drag-and-drop's instant behavior.
  const currentCategory = categories.some((c) => c.name === entry.category)
    ? entry.category
    : OTHER_CATEGORY_NAME
  const [category, setCategory] = useState(currentCategory)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState(entry.image_url || null)
  const [quantityText, setQuantityText] = useState(entry.quantity != null ? String(entry.quantity) : '')
  const initialUnitIsCustom = !!entry.unit && !(UNIT_PRESETS as string[]).includes(entry.unit)
  const [unit, setUnit] = useState<string>(initialUnitIsCustom ? OTHER_UNIT : entry.unit || NO_UNIT)
  const [customUnit, setCustomUnit] = useState(initialUnitIsCustom ? entry.unit || '' : '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!imageFile) return
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  useEffect(() => {
    if (previewUrl || !entry.image_ref) return
    getImageDataUrl('groceryImages', entry.image_ref).then((url) => {
      if (url) setPreviewUrl(url)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.image_ref])

  const createdAt = formatDateTime(entry.added_at)
  const modifiedAt = formatDateTime(entry.modified_at)

  // FR-4.1/4.2: non-empty, ≤100 chars. Save is disabled while invalid (FR-5.1); Cancel
  // (closing without saving) simply discards the local `name` state (FR-5.2).
  const trimmedName = name.trim()
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH

  const handleSave = async () => {
    if (!nameValid) return
    const resolved = resolveQuantityUnit({ quantityText, unit, customUnit })
    if (resolved.error) {
      setError(t(`common:quantityUnit.${resolved.error}`))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(entry.key, {
        name: trimmedName,
        note,
        imageFile,
        quantity: resolved.quantity,
        unit: resolved.unit
      })
      onClose()
    } catch (err: any) {
      setError(`${t('common:itemDetail.saveFailed')}: ${err.message}`)
      setSaving(false)
    }
  }

  const handleMoveCategory = (next: string) => {
    setCategory(next)
    if (next !== currentCategory) onMoveCategory?.(entry.key, next)
  }

  const handleDelete = async () => {
    if (!(await confirm(t('common:itemDetail.deleteConfirm', { itemName: entry.item })))) return
    setDeleting(true)
    setError(null)
    try {
      await onDelete(entry.key)
      onClose()
    } catch (err: any) {
      setError(`${t('common:itemDetail.deleteFailed')}: ${err.message}`)
      setDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          {/* Radix requires a DialogTitle for the dialog to be accessible; when editing,
              the visible "title" is the name Input below instead, so this stays present
              but visually hidden to keep the aria-labelledby link intact. */}
          <DialogTitle className={canEdit ? 'sr-only' : undefined}>{entry.item}</DialogTitle>
          {canEdit && (
            <>
              <Input
                className="modal-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                aria-label={t('common:itemDetail.nameLabel')}
              />
              {!nameValid && trimmedName.length === 0 && (
                <div className="text-sm text-destructive">{t('common:itemDetail.nameRequired')}</div>
              )}
            </>
          )}
        </DialogHeader>

        {previewUrl && <img className="modal-image-preview" src={previewUrl} alt={entry.item} />}

        {canEdit ? (
          <>
            <label className="modal-file-btn">
              📷 {previewUrl ? t('common:itemDetail.replacePhoto') : t('common:itemDetail.addPhoto')}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </label>

            <Textarea
              placeholder={t('common:itemDetail.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />

            <div className="modal-input-row">
              <Label>
                {t('stock:editModal.quantity')}
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                />
              </Label>
              <Label>
                {t('stock:editModal.unit')}
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_UNIT}>{t('common:quantityUnit.noUnit')}</SelectItem>
                    {UNIT_PRESETS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_UNIT}>{t('stock:editModal.otherUnit')}</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
            </div>

            {unit === OTHER_UNIT && (
              <Input
                placeholder={t('stock:editModal.customUnitPlaceholder')}
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
              />
            )}

            {onMoveCategory && categories.length > 0 && (
              <Label className="modal-category-move">
                {t('common:itemDetail.moveToCategory')}
                <Select value={category} onValueChange={handleMoveCategory}>
                  <SelectTrigger aria-label={t('common:itemDetail.moveToCategory')}>
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
              </Label>
            )}
          </>
        ) : (
          note && <p className="modal-note-readonly">{note}</p>
        )}

        <div className="modal-meta">
          {createdAt && (
            <div>
              {t('common:itemDetail.createdBy')}: {createdAt} {entry.created_by ? `· ${entry.created_by}` : '· Siri'}
            </div>
          )}
          {modifiedAt && (
            <div>
              {t('common:itemDetail.updatedBy')}: {modifiedAt} {entry.modified_by && `· ${entry.modified_by}`}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          {canEdit ? (
            <>
              <Button variant="destructive" className="me-auto" onClick={handleDelete} disabled={saving || deleting}>
                {deleting ? t('common:actions.deleting') : t('common:actions.delete')}
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={saving || deleting}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving || deleting || !nameValid}>
                {saving ? t('common:actions.saving') : t('common:actions.save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                {t('common:actions.close')}
              </Button>
              <Button onClick={onSignIn}>{t('common:auth.signIn')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
