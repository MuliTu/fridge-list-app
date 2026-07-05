import { useEffect, useState } from 'react'
import { formatDateTime } from '../lib/formatDateTime'
import type { GroceryItem } from '../types'

interface ItemDetailModalProps {
  entry: GroceryItem
  canEdit: boolean
  onSignIn: () => void
  onClose: () => void
  onSave: (key: string, details: { note: string; imageFile: File | null }) => Promise<unknown>
  onDelete: (key: string) => Promise<unknown>
}

export default function ItemDetailModal({ entry, canEdit, onSignIn, onClose, onSave, onDelete }: ItemDetailModalProps) {
  const [note, setNote] = useState(entry.note || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState(entry.image_url || null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!imageFile) return
    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const createdAt = formatDateTime(entry.added_at)
  const modifiedAt = formatDateTime(entry.modified_at)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(entry.key, { note, imageFile })
      onClose()
    } catch (err) {
      setError('שמירה נכשלה: ' + err.message)
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`למחוק את "${entry.item}" מהרשימה?`)) return
    setDeleting(true)
    setError(null)
    try {
      await onDelete(entry.key)
      onClose()
    } catch (err) {
      setError('מחיקה נכשלה: ' + err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{entry.item}</h2>

        {previewUrl && <img className="modal-image-preview" src={previewUrl} alt={entry.item} />}

        {canEdit ? (
          <>
            <label className="modal-file-btn">
              📷 {previewUrl ? 'החלפת תמונה' : 'הוספת תמונה'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </label>

            <textarea
              className="modal-note"
              placeholder="הערה..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </>
        ) : (
          note && <p className="modal-note-readonly">{note}</p>
        )}

        <div className="modal-meta">
          {createdAt && (
            <div>
              נוצר: {createdAt} {entry.created_by ? `· ${entry.created_by}` : '· Siri'}
            </div>
          )}
          {modifiedAt && (
            <div>
              עודכן: {modifiedAt} {entry.modified_by && `· ${entry.modified_by}`}
            </div>
          )}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          {canEdit ? (
            <>
              <button className="modal-btn danger" onClick={handleDelete} disabled={saving || deleting}>
                {deleting ? 'מוחק...' : 'מחיקה'}
              </button>
              <button className="modal-btn secondary" onClick={onClose} disabled={saving || deleting}>
                ביטול
              </button>
              <button className="modal-btn primary" onClick={handleSave} disabled={saving || deleting}>
                {saving ? 'שומר...' : 'שמירה'}
              </button>
            </>
          ) : (
            <>
              <button className="modal-btn secondary" onClick={onClose}>
                סגירה
              </button>
              <button className="modal-btn primary" onClick={onSignIn}>
                התחברות לעריכה
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
