import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface BulkUploadModalProps {
  listName: string | null
  categories: Category[]
  onClose: () => void
  onAdd: (item: { name: string; category: string }) => Promise<unknown> | PromiseLike<unknown>
}

interface ParsedRow {
  name: string
  category: string
}

// Each non-empty line is one item. A comma splits "name,category" (proper CSV) — the
// second column is optional. Everything past the first comma is treated as the category
// so item names containing commas are rare but tolerated (the review step lets the user
// fix anything). Names without an explicit category are collected for one batched Gemini
// categorization call, mirroring how the single-item add flow (GroceryItemModal) works.
const parseRawList = (raw: string): { name: string; explicitCategory: string | null }[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const commaIndex = line.indexOf(',')
      if (commaIndex === -1) return { name: line, explicitCategory: null }
      const name = line.slice(0, commaIndex).trim()
      const category = line.slice(commaIndex + 1).trim()
      return { name, explicitCategory: category || null }
    })
    .filter((entry) => entry.name.length > 0)

export default function BulkUploadModal({ listName, categories, onClose, onAdd }: BulkUploadModalProps) {
  const { t } = useTranslation(['shoppingList', 'common'])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<'input' | 'review'>('input')
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categoryMap = new Map(categories.map((c) => [c.name, c]))

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    try {
      const text = await file.text()
      // Append to whatever's already there rather than clobbering a paste in progress.
      setRaw((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text))
    } catch (err: any) {
      setError(t('shoppingList:bulkUpload.fileReadFailed', { message: err.message }))
    }
  }

  const handleParse = async () => {
    const parsed = parseRawList(raw)
    if (parsed.length === 0) {
      setError(t('shoppingList:bulkUpload.empty'))
      return
    }
    setError(null)
    setWorking(true)

    // Best-effort auto-categorization for rows with no explicit category. One batched
    // call for the whole list; if it fails or comes back empty, those rows just default
    // to "אחר" and the user can adjust each via the per-row Select before saving.
    const needsCategory = parsed.filter((p) => !p.explicitCategory)
    let pool: { item: string; category: string }[] = []
    if (needsCategory.length > 0) {
      try {
        pool = await categorizeItem(needsCategory.map((p) => p.name).join('\n'))
      } catch {
        pool = []
      }
    }
    const takeCategory = (name: string): string => {
      const target = normalizeName(name)
      const idx = pool.findIndex(
        (c) => normalizeName(c.item).includes(target) || target.includes(normalizeName(c.item))
      )
      if (idx === -1) return OTHER_CATEGORY_NAME
      return pool.splice(idx, 1)[0].category
    }

    const nextRows: ParsedRow[] = parsed.map((p) => {
      // An explicit category is honored only if it's a real category; otherwise fall
      // back to "אחר" (same fallback the rest of the app uses for unknown categories).
      if (p.explicitCategory && categoryMap.has(p.explicitCategory)) {
        return { name: p.name, category: p.explicitCategory }
      }
      const category = p.explicitCategory ? OTHER_CATEGORY_NAME : takeCategory(p.name)
      return { name: p.name, category: categoryMap.has(category) ? category : OTHER_CATEGORY_NAME }
    })

    setRows(nextRows)
    setWorking(false)
    setStage('review')
  }

  const updateRow = (index: number, field: 'name' | 'category', value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addRow = () => {
    setRows((prev) => [...prev, { name: '', category: categories[0]?.name || OTHER_CATEGORY_NAME }])
  }

  const handleSave = async () => {
    const cleanRows = rows
      .map((row) => ({ name: row.name.trim(), category: row.category }))
      .filter((row) => row.name.length > 0)

    if (cleanRows.length === 0) {
      setError(t('shoppingList:bulkUpload.empty'))
      return
    }

    setWorking(true)
    setError(null)
    try {
      for (const row of cleanRows) {
        await onAdd(row)
      }
      onClose()
    } catch (err: any) {
      setError(`${t('shoppingList:bulkUpload.addFailed')}: ${err.message}`)
      setWorking(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shoppingList:bulkUpload.title')}</DialogTitle>
        </DialogHeader>

        {stage === 'input' ? (
          <>
            <p className="modal-note-readonly">{t('shoppingList:bulkUpload.instructions')}</p>
            <Textarea
              rows={8}
              placeholder={t('shoppingList:bulkUpload.placeholder')}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
            <Button variant="outline" className="w-fit" onClick={() => fileInputRef.current?.click()}>
              {t('shoppingList:bulkUpload.chooseFile')}
            </Button>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={working}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleParse} disabled={working}>
                {working ? t('shoppingList:bulkUpload.categorizing') : t('shoppingList:bulkUpload.parse')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="receipt-review-items">
              {rows.map((row, i) => (
                <div className="bulk-review-row" key={i}>
                  <Input
                    className="bulk-review-name"
                    placeholder={t('shoppingList:bulkUpload.namePlaceholder')}
                    value={row.name}
                    onChange={(e) => updateRow(i, 'name', e.target.value)}
                  />
                  <Select value={row.category} onValueChange={(value) => updateRow(i, 'category', value)}>
                    <SelectTrigger className="bulk-review-category">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-[26px] w-[26px]"
                    onClick={() => removeRow(i)}
                    aria-label={t('shoppingList:bulkUpload.removeRow')}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-fit" onClick={addRow}>
              {t('shoppingList:bulkUpload.addRow')}
            </Button>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setStage('input')} disabled={working}>
                {t('shoppingList:bulkUpload.back')}
              </Button>
              <Button onClick={handleSave} disabled={working}>
                {working ? t('common:actions.adding') : t('shoppingList:bulkUpload.saveCount', { count: rows.length })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
