import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import { rankFuzzyMatches } from '../lib/fuzzyMatch'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import { NO_UNIT, OTHER_UNIT, UNIT_PRESETS, matchUnitAlias, resolveQuantityUnit } from '../lib/units'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Checkbox } from './ui/checkbox'

// Sentinel for the match-picker's "this is a new item, not an update" option — Radix
// Select forbids an empty-string item value, same reasoning as units.ts's NO_UNIT.
const ADD_AS_NEW = '__add_as_new__'

interface ExistingEntry {
  key: string
  name: string
  category: string
}

interface BulkUploadModalProps {
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
    note?: string | null
    quantity?: number | null
    unit?: string | null
  }) => Promise<unknown> | PromiseLike<unknown>
  onUpdateDetails: (
    key: string,
    fields: { note?: string | null; quantity: number | null; unit: string | null }
  ) => Promise<unknown> | PromiseLike<unknown>
  onAddCategory?: (category: {
    name: string
    color: string
    icon?: string
    order?: number
  }) => Promise<unknown> | PromiseLike<unknown>
}

interface ParsedRow {
  name: string
  category: string
  quantityText: string
  unit: string
  customUnit: string
  note: string
  noteProvided: boolean
  // Existing items that plausibly refer to the same product, ranked best-first (see
  // src/lib/fuzzyMatch.ts) — empty means nothing on the list looked like a match, so
  // this row can only ever create a new item.
  matchCandidates: ExistingEntry[]
  // Which of matchCandidates (by key) this row currently targets; null means "add as
  // a new item" — the row's own default when parsed, if it has at least one candidate,
  // is matchCandidates[0].key, since that's the most plausible one; the user can switch
  // to a different candidate or back to "add as new" via the row's match Select.
  matchKey: string | null
  originalName?: string
  correctionReason?: string | null
  suggestedCategory?: boolean
}

interface ParsedLine {
  name: string
  explicitCategory: string | null
  quantityText: string
  unitText: string | null
  note: string
  noteProvided: boolean
}

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(field.trim())
      field = ''
    } else {
      field += character
    }
  }
  fields.push(field.trim())
  return fields
}

const headerAliases = {
  name: ['item', 'name', 'product', 'מוצר', 'פריט'],
  category: ['category', 'קטגוריה'],
  quantity: ['quantity', 'amount', 'כמות'],
  unit: ['unit', 'יחידה'],
  note: ['notes', 'note', 'הערות', 'הערה']
} as const

const headerField = (value: string): keyof typeof headerAliases | null => {
  const normalized = value.replace(/^\uFEFF/, '').trim().toLowerCase()
  return (Object.entries(headerAliases).find(([, aliases]) =>
    (aliases as readonly string[]).includes(normalized)
  )?.[0] as keyof typeof headerAliases | undefined) ?? null
}

// Supports a headered CSV with item/category/quantity/unit/notes in any order, plus
// the legacy name, name+category, and name+quantity+unit text formats.
const parseRawList = (raw: string): ParsedLine[] => {
  const records = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)
  if (records.length === 0) return []

  const headers = records[0].map(headerField)
  const hasHeader = headers.includes('name') && headers.some(Boolean)
  if (hasHeader) {
    return records.slice(1).map((fields) => {
      const values = Object.fromEntries(headers.flatMap((header, index) =>
        header ? [[header, fields[index] ?? '']] : []
      )) as Partial<Record<keyof typeof headerAliases, string>>
      return {
        name: values.name?.trim() ?? '',
        explicitCategory: values.category?.trim() || null,
        quantityText: values.quantity?.trim() ?? '',
        unitText: values.unit?.trim() || null,
        note: values.note?.trim() ?? '',
        noteProvided: headers.includes('note')
      }
    }).filter((entry) => entry.name.length > 0)
  }

  return records.map((fields) => {
    const [name = '', second = '', third = '', ...rest] = fields
    const asNumber = Number(second)
    if (second && Number.isFinite(asNumber) && asNumber > 0) {
      return { name, explicitCategory: null, quantityText: second, unitText: third || null, note: '', noteProvided: false }
    }
    if (fields.length >= 4) {
      return {
        name,
        explicitCategory: second || null,
        quantityText: third,
        unitText: rest[0] || null,
        note: rest.slice(1).join(', ').trim(),
        noteProvided: fields.length >= 5
      }
    }
    return {
      name,
      explicitCategory: fields.slice(1).join(',').trim() || null,
      quantityText: '',
      unitText: null,
      note: '',
      noteProvided: false
    }
  }).filter((entry) => entry.name.length > 0)
}

// Resolves parsed free-text unit (e.g. "kilo", "ק\"ג") to the picker's state shape —
// a known preset if recognized, otherwise the "custom unit" sentinel pre-filled with
// whatever text was typed, so nothing the user wrote is ever silently dropped.
const resolveParsedUnit = (unitText: string | null): { unit: string; customUnit: string } => {
  if (!unitText) return { unit: NO_UNIT, customUnit: '' }
  const matched = matchUnitAlias(unitText)
  return matched ? { unit: matched, customUnit: '' } : { unit: OTHER_UNIT, customUnit: unitText }
}

export default function BulkUploadModal({
  listName,
  categories,
  existingEntries,
  onClose,
  onAdd,
  onUpdateDetails,
  onAddCategory
}: BulkUploadModalProps) {
  const { t, i18n } = useTranslation(['shoppingList', 'common', 'stock'])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<'input' | 'review'>('input')
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

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

    try {
      if (aiEnabled) {
        const enrichment = await enrichItemsWithAi({
          language: i18n?.language === 'en' ? 'en' : 'he',
          categories: categories.length > 0 ? categories.map((entry) => entry.name) : [OTHER_CATEGORY_NAME],
          items: parsed.map((entry, index) => ({ id: String(index), name: entry.name }))
        })
        const enrichedById = new Map(enrichment.items.map((entry) => [entry.id, entry]))
        const nextRows: ParsedRow[] = parsed.map((entry, index) => {
          const suggestion = enrichedById.get(String(index))
          const correctedName = suggestion?.correctedName ?? entry.name
          const matchCandidates = matchesFor(correctedName)
          const matchKey = matchCandidates[0]?.key ?? null
          const { unit, customUnit } = resolveParsedUnit(entry.unitText)
          const explicitExistingCategory = entry.explicitCategory
            ? categories.find((candidate) => normalizeName(candidate.name) === normalizeName(entry.explicitCategory!))?.name
            : undefined
          const category = matchKey
            ? matchCandidates[0].category
            : explicitExistingCategory ?? suggestion?.category ?? OTHER_CATEGORY_NAME

          return {
            name: correctedName,
            category,
            quantityText: entry.quantityText,
            unit,
            customUnit,
            note: entry.note,
            noteProvided: entry.noteProvided,
            matchCandidates,
            matchKey,
            originalName: suggestion && normalizeName(suggestion.originalName) !== normalizeName(correctedName)
              ? suggestion.originalName
              : undefined,
            correctionReason: suggestion?.correctionReason,
            suggestedCategory: !categories.some(
              (candidate) => normalizeName(candidate.name) === normalizeName(category)
            )
          }
        })
        setRows(nextRows)
        setWorking(false)
        setStage('review')
        return
      }

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

      return { name: p.name, category, quantityText: p.quantityText, unit, customUnit, note: p.note, noteProvided: p.noteProvided, matchCandidates, matchKey }
    })

      setRows(nextRows)
      setWorking(false)
      setStage('review')
    } catch (err: any) {
      setError(`${t('shoppingList:bulkUpload.aiFailed')}: ${err.message}`)
      setWorking(false)
    }
  }

  const updateRow = (
    index: number,
    field: 'name' | 'category' | 'quantityText' | 'unit' | 'customUnit' | 'note',
    value: string
  ) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row
      if (field === 'name') return { ...row, name: value, originalName: undefined, correctionReason: null }
      if (field === 'category') {
        return {
          ...row,
          category: value,
          suggestedCategory: !categories.some(
            (candidate) => normalizeName(candidate.name) === normalizeName(value)
          )
        }
      }
      if (field === 'note') return { ...row, note: value, noteProvided: true }
      return { ...row, [field]: value }
    }))
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
        note: '',
        noteProvided: false,
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

    // Keep one write per active product. This covers duplicates already on the list,
    // repeated lines in one import, and different spellings corrected to the same name.
    const seenNewNames = new Set(existingEntries.map((entry) => normalizeName(entry.name)))
    const seenMatchKeys = new Set<string>()
    const uniqueToApply = toApply.filter(({ row }) => {
      if (row.matchKey) {
        if (seenMatchKeys.has(row.matchKey)) return false
        seenMatchKeys.add(row.matchKey)
        return true
      }
      const normalized = normalizeName(row.name)
      if (seenNewNames.has(normalized)) return false
      seenNewNames.add(normalized)
      return true
    })

    setWorking(true)
    setError(null)
    try {
      const newCategoriesByNormalizedName = new Map<string, string>()
      for (const { row } of uniqueToApply) {
        const categoryName = row.category.trim()
        if (!row.matchKey && row.suggestedCategory && categoryName) {
          const normalized = normalizeName(categoryName)
          if (!newCategoriesByNormalizedName.has(normalized)) {
            newCategoriesByNormalizedName.set(normalized, categoryName)
          }
        }
      }
      const newCategoryNames = Array.from(newCategoriesByNormalizedName.values())
      const maxOrder = categories.reduce((max, entry) => Math.max(max, entry.order ?? 0), 0)
      for (const [index, categoryName] of newCategoryNames.entries()) {
        if (onAddCategory) {
          await onAddCategory({ name: categoryName, color: '#94a3b8', icon: '📌', order: maxOrder + index + 1 })
        }
      }
      for (const { row, quantity, unit } of uniqueToApply) {
        if (row.matchKey) {
          await onUpdateDetails(row.matchKey, {
            ...(row.noteProvided ? { note: row.note.trim() || null } : {}),
            quantity,
            unit
          })
        } else {
          await onAdd({ name: row.name.trim(), category: row.category, note: row.note.trim() || null, quantity, unit })
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
              <Label className="me-auto flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={aiEnabled}
                  disabled={working}
                  onCheckedChange={(checked) => setAiEnabled(checked === true)}
                />
                {t('shoppingList:bulkUpload.aiAssistant')}
              </Label>
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
                        {[
                          ...categories.map((entry) => ({ name: entry.name, icon: entry.icon })),
                          ...Array.from(new Set(rows
                            .filter((entry) => entry.suggestedCategory)
                            .map((entry) => entry.category)))
                            .filter((name) => !categories.some((entry) => normalizeName(entry.name) === normalizeName(name)))
                            .map((name) => ({ name, icon: '📌' }))
                        ].map((c) => (
                          <SelectItem key={c.name} value={c.name}>
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

                  {row.originalName && (
                    <p className="text-xs text-sky-700 dark:text-sky-300">
                      {t('shoppingList:bulkUpload.aiCorrection', {
                        original: row.originalName,
                        corrected: row.name
                      })}
                    </p>
                  )}
                  {!row.matchKey && row.suggestedCategory && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {t('shoppingList:bulkUpload.aiNewCategory', { category: row.category })}
                    </p>
                  )}

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
                  <Input
                    className="h-7 text-xs"
                    placeholder={t('common:itemDetail.notePlaceholder')}
                    value={row.note}
                    onChange={(e) => updateRow(i, 'note', e.target.value)}
                  />
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
