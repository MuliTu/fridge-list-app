import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import { rankFuzzyMatches } from '../lib/fuzzyMatch'
import { NO_UNIT, OTHER_UNIT, UNIT_PRESETS, matchUnitAlias, resolveQuantityUnit } from '../lib/units'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

// Sentinel for the match-picker's "this is a new item, not an update" option — Radix
// Select forbids an empty-string item value, same reasoning as units.ts's NO_UNIT.
const ADD_AS_NEW = '__add_as_new__'

type ExistingEntry = {
  key: string
  name: string
  category: string
}

type BulkUploadModalProps = {
  listName: string | null
  categories: Category[]
  // Unbought entries currently on the active list — used both to flag/suggest matches
  // during review (see ParsedRow.matchCandidates below) and, once a row is pointed at
  // one of them, as the update target instead of creating a new item.
  existingEntries: ExistingEntry[]
  onClose: () => void
  onAdd: (item: {
    name: string
    category: string
    quantity?: number | null
    unit?: string | null
  }) => Promise<unknown> | PromiseLike<unknown>
  onUpdateQuantity: (
    key: string,
    fields: { quantity: number | null; unit: string | null }
  ) => Promise<unknown> | PromiseLike<unknown>
}

type ParsedRow = {
  name: string
  category: string
  quantityText: string
  unit: string
  customUnit: string
  // Existing items that plausibly refer to the same product, ranked best-first (see
  // src/lib/fuzzyMatch.ts) — empty means nothing on the list looked like a match, so
  // this row can only ever create a new item.
  matchCandidates: ExistingEntry[]
  // Which of matchCandidates (by key) this row currently targets; null means "add as
  // a new item" — the row's own default when parsed, if it has at least one candidate,
  // is matchCandidates[0].key, since that's the most plausible one; the user can switch
  // to a different candidate or back to "add as new" via the row's match Select.
  matchKey: string | null
}

type ParsedLine = {
  name: string
  explicitCategory: string | null
  quantityText: string
  unitText: string | null
}

// Each non-empty line is one item. "name" alone just adds/matches by name. A comma
// starts a second column that is EITHER an amount (a positive number — optionally
// followed by a third column, a unit, e.g. "מלפפונים,10,ק"ג") OR, for backward
// compatibility with the plain "name,category" shape this always supported, an
// explicit category when that second column isn't numeric. Everything past the first
// comma is preserved verbatim as the category in that case (so item/category names
// containing their own commas are tolerated, same as before this feature) — the
// number-vs-category branch only inspects the immediate next column, not the whole
// remainder of the line.
const parseRawList = (raw: string): ParsedLine[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const commaIndex = line.indexOf(',')
      if (commaIndex === -1) return { name: line, explicitCategory: null, quantityText: '', unitText: null }
      const name = line.slice(0, commaIndex).trim()
      const rest = line.slice(commaIndex + 1)
      const restParts = rest.split(',').map((part) => part.trim())
      const asNumber = Number(restParts[0])
      if (restParts[0] && Number.isFinite(asNumber) && asNumber > 0) {
        return { name, explicitCategory: null, quantityText: restParts[0], unitText: restParts[1] || null }
      }
      const explicitCategory = rest.trim()
      return { name, explicitCategory: explicitCategory || null, quantityText: '', unitText: null }
    })
    .filter((entry) => entry.name.length > 0)

// Resolves parsed free-text unit (e.g. "kilo", "ק\"ג") to the picker's state shape —
// a known preset if recognized, otherwise the "custom unit" sentinel pre-filled with
// whatever text was typed, so nothing the user wrote is ever silently dropped.
const resolveParsedUnit = (unitText: string | null): { unit: string; customUnit: string } => {
  if (!unitText) return { unit: NO_UNIT, customUnit: '' }
  const matched = matchUnitAlias(unitText)
  return matched ? { unit: matched, customUnit: '' } : { unit: OTHER_UNIT, customUnit: unitText }
}

export const BulkUploadModal = ({
  listName,
  categories,
  existingEntries,
  onClose,
  onAdd,
  onUpdateQuantity
}: BulkUploadModalProps) => {
  const { t } = useTranslation(['shoppingList', 'common', 'stock'])
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

    const matchesFor = (name: string) => rankFuzzyMatches(name, existingEntries)

    // Rows that already resolved to an existing product don't need auto-categorization
    // at all (their category comes from the matched item and won't be written) — skip
    // them from the batched Gemini call to save the cost/latency.
    const needsCategory = parsed.filter((p) => !p.explicitCategory && matchesFor(p.name).length === 0)
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
      const matchCandidates = matchesFor(p.name)
      const matchKey = matchCandidates[0]?.key ?? null
      const { unit, customUnit } = resolveParsedUnit(p.unitText)

      let category: string
      if (matchKey) {
        // Category is the matched item's own — irrelevant to what gets written (an
        // update only ever touches quantity/unit), just shown for context.
        category = matchCandidates[0].category
      } else if (p.explicitCategory && categoryMap.has(p.explicitCategory)) {
        category = p.explicitCategory
      } else {
        const fallback = p.explicitCategory ? OTHER_CATEGORY_NAME : takeCategory(p.name)
        category = categoryMap.has(fallback) ? fallback : OTHER_CATEGORY_NAME
      }

      return { name: p.name, category, quantityText: p.quantityText, unit, customUnit, matchCandidates, matchKey }
    })

    setRows(nextRows)
    setWorking(false)
    setStage('review')
  }

  const updateRow = (
    index: number,
    field: 'name' | 'category' | 'quantityText' | 'unit' | 'customUnit',
    value: string
  ) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const setRowMatch = (index: number, matchKey: string | null) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, matchKey } : row)))
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        name: '',
        category: categories[0]?.name || OTHER_CATEGORY_NAME,
        quantityText: '',
        unit: NO_UNIT,
        customUnit: '',
        matchCandidates: [],
        matchKey: null
      }
    ])
  }

  const handleSave = async () => {
    // Validate each row's quantity/unit up front (same rules as the single-item add/
    // edit modals) and surface one blocking error naming the offending row, rather than
    // silently dropping or clamping a bad value mid-save.
    const toApply: { row: ParsedRow; quantity: number | null; unit: string | null }[] = []
    for (const row of rows) {
      const isNewRow = !row.matchKey
      if (isNewRow && row.name.trim().length === 0) continue // empty manually-added rows are just skipped

      const resolved = resolveQuantityUnit({ quantityText: row.quantityText, unit: row.unit, customUnit: row.customUnit })
      if (resolved.error) {
        setError(`${row.name}: ${t(`common:quantityUnit.${resolved.error}`)}`)
        return
      }
      toApply.push({ row, quantity: resolved.quantity, unit: resolved.unit })
    }

    if (toApply.length === 0) {
      setError(t('shoppingList:bulkUpload.empty'))
      return
    }

    setWorking(true)
    setError(null)
    try {
      for (const { row, quantity, unit } of toApply) {
        if (row.matchKey) {
          await onUpdateQuantity(row.matchKey, { quantity, unit })
        } else {
          await onAdd({ name: row.name.trim(), category: row.category, quantity, unit })
        }
      }
      onClose()
    } catch (err: any) {
      setError(`${t('shoppingList:bulkUpload.addFailed')}: ${err.message}`)
      setWorking(false)
    }
  }

  const applicableCount = rows.filter((row) => row.matchKey || row.name.trim().length > 0).length

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
                <div className="flex flex-col gap-1 border-b border-border pb-2 last:border-none" key={i}>
                  <div className="bulk-review-row">
                    <Input
                      className="bulk-review-name"
                      placeholder={t('shoppingList:bulkUpload.namePlaceholder')}
                      value={row.name}
                      disabled={!!row.matchKey}
                      onChange={(e) => updateRow(i, 'name', e.target.value)}
                    />
                    <Select
                      value={row.category}
                      onValueChange={(value) => updateRow(i, 'category', value)}
                      disabled={!!row.matchKey}
                    >
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

                  {row.matchCandidates.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                        {t('shoppingList:bulkUpload.matchFound')}
                      </span>
                      <Select
                        value={row.matchKey ?? ADD_AS_NEW}
                        onValueChange={(value) => setRowMatch(i, value === ADD_AS_NEW ? null : value)}
                      >
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {row.matchCandidates.map((candidate) => (
                            <SelectItem key={candidate.key} value={candidate.key}>
                              {t('shoppingList:bulkUpload.updateExisting', { name: candidate.name })}
                            </SelectItem>
                          ))}
                          <SelectItem value={ADD_AS_NEW}>{t('shoppingList:bulkUpload.addAsNew')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-7 w-20 text-xs"
                      placeholder={t('stock:editModal.quantity')}
                      value={row.quantityText}
                      onChange={(e) => updateRow(i, 'quantityText', e.target.value)}
                    />
                    <Select value={row.unit} onValueChange={(value) => updateRow(i, 'unit', value)}>
                      <SelectTrigger className="h-7 flex-1 text-xs">
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
                  </div>
                  {row.unit === OTHER_UNIT && (
                    <Input
                      className="h-7 text-xs"
                      placeholder={t('stock:editModal.customUnitPlaceholder')}
                      value={row.customUnit}
                      onChange={(e) => updateRow(i, 'customUnit', e.target.value)}
                    />
                  )}
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
                {working
                  ? t('common:actions.adding')
                  : t('shoppingList:bulkUpload.saveCount', { count: applicableCount })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
