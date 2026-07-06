import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  deleteReceipt,
  onValue,
  receiptsRef,
  resizeImage,
  saveReceipt,
  scanReceipt,
  scanReceiptFromUrl
} from '../lib/firebase'
import { formatDateTime } from '../lib/formatDateTime'
import { useAuth } from '../hooks/AuthContext'
import ReceiptReviewModal, { type ReceiptReviewData } from '../components/ReceiptReviewModal'
import type { Receipt, ReceiptItem } from '../types'

const normalizeName = (name?: string | null) => (name || '').trim().toLowerCase()

const receiptTotal = (receipt: Receipt) =>
  receipt.total ?? (receipt.items || []).reduce((sum, item) => sum + item.price * (item.quantity || 1), 0)

export const Route = createFileRoute('/receipts')({
  component: ReceiptsPage
})

function ReceiptsPage() {
  const { t } = useTranslation(['receipts', 'common'])
  const { user, canEdit } = useAuth()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [reviewData, setReviewData] = useState<ReceiptReviewData | null>(null)
  const [queue, setQueue] = useState<File[]>([])
  const [queueIndex, setQueueIndex] = useState(0)

  useEffect(
    () =>
      onValue(receiptsRef, (snapshot) => {
        const data = snapshot.val() || {}
        const list: Receipt[] = Object.entries(data as Record<string, any>).map(([key, entry]) => ({
          key,
          ...entry
        }))
        list.sort((a, b) => (b.scanned_at || '').localeCompare(a.scanned_at || ''))
        setReceipts(list)
      }),
    []
  )

  const chronological = [...receipts].sort((a, b) => (a.scanned_at || '').localeCompare(b.scanned_at || ''))
  const priceHistory: Record<string, { price: number; date: string }[]> = {}
  chronological.forEach((receipt) => {
    ;(receipt.items || []).forEach((item) => {
      const key = normalizeName(item.name)
      if (!priceHistory[key]) priceHistory[key] = []
      priceHistory[key].push({ price: item.price, date: receipt.scanned_at })
    })
  })

  const priceDiffFor = (item: ReceiptItem, receiptDate: string) => {
    const history = priceHistory[normalizeName(item.name)] || []
    const before = history.filter((h) => (h.date || '') < (receiptDate || ''))
    if (before.length === 0) return null
    const delta = item.price - before[before.length - 1].price
    return Math.abs(delta) < 0.01 ? null : delta
  }

  const processFile = async (file: File, index: number, total: number) => {
    setScanning(true)
    setScanError(null)
    const queuePosition = total > 1 ? { index, total } : null
    const isPdf = file.type === 'application/pdf'
    let fileForScan: Blob
    if (isPdf) {
      fileForScan = file
    } else {
      try {
        fileForScan = await resizeImage(file)
      } catch (err: any) {
        setScanError(t('receipts:scanErrors.imageReadFailed', { message: err.message }))
        setReviewData({ store_name: null, items: [], total: null, imageBlob: file, queuePosition })
        setScanning(false)
        return
      }
    }
    try {
      const result = await scanReceipt(fileForScan as Blob & { type: string })
      if (result.error) {
        setScanError(t('receipts:scanErrors.scanAutoFailed'))
        setReviewData({ store_name: null, items: [], total: null, imageBlob: fileForScan, queuePosition })
      } else {
        setReviewData({
          store_name: result.store_name,
          items: result.items,
          total: result.total,
          imageBlob: fileForScan,
          queuePosition
        })
      }
    } catch (err: any) {
      setScanError(t('receipts:scanErrors.scanFailed', { message: err.message }))
      setReviewData({ store_name: null, items: [], total: null, imageBlob: fileForScan, queuePosition })
    } finally {
      setScanning(false)
    }
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setQueue(files)
    setQueueIndex(0)
    processFile(files[0], 0, files.length)
  }

  const advanceQueue = () => {
    const nextIndex = queueIndex + 1
    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex)
      processFile(queue[nextIndex], nextIndex, queue.length)
    } else {
      setQueue([])
      setQueueIndex(0)
    }
  }

  const handleUrlSubmit = async () => {
    const url = window.prompt(t('receipts:urlPrompt'))
    const trimmed = url?.trim()
    if (!trimmed) return
    setScanning(true)
    setScanError(null)
    try {
      const result = await scanReceiptFromUrl(trimmed)
      if (result.error) {
        setScanError(t('receipts:scanErrors.urlScanAutoFailed'))
        setReviewData({ store_name: null, items: [], total: null, imageBlob: null, source_url: trimmed })
      } else {
        setReviewData({
          store_name: result.store_name,
          items: result.items,
          total: result.total,
          imageBlob: null,
          source_url: trimmed
        })
      }
    } catch (err: any) {
      setScanError(t('receipts:scanErrors.urlScanFailed', { message: err.message }))
      setReviewData({ store_name: null, items: [], total: null, imageBlob: null, source_url: trimmed })
    } finally {
      setScanning(false)
    }
  }

  const handleSaveReceipt = async (data: {
    store_name: string | null
    items: ReceiptItem[]
    total: number | null
    source_url: string | null
  }) => {
    await saveReceipt(data, reviewData!.imageBlob, user)
    setReviewData(null)
    setScanError(null)
    advanceQueue()
  }

  const handleCloseReview = () => {
    setReviewData(null)
    setScanError(null)
    advanceQueue()
  }

  const handleDelete = (receipt: Receipt) => {
    const date = formatDateTime(receipt.scanned_at) || t('receipts:deleteConfirmUnknownDate')
    if (!window.confirm(t('receipts:deleteConfirm', { date }))) return
    deleteReceipt(receipt.key, receipt.image_url)
  }

  return (
    <div className="stock-view">
      {receipts.length === 0 ? (
        <div className="all-empty">
          {t('receipts:empty')}
          {canEdit ? ' 📸' : ''}
        </div>
      ) : (
        <div className="board-grid">
          {receipts.map((receipt) => (
            <section className="panel receipt-card" key={receipt.key}>
              <h2>
                <span className="dot" />
                {receipt.store_name || t('receipts:fallbackTitle')}
                {receipt.source_url && (
                  <a href={receipt.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    🔗
                  </a>
                )}
                <span className="receipt-date">{formatDateTime(receipt.scanned_at)}</span>
              </h2>
              <ul className="items">
                {(receipt.items || []).map((item, i) => {
                  const diff = priceDiffFor(item, receipt.scanned_at)
                  return (
                    <li className="item receipt-item" key={i}>
                      <span className="receipt-item-name">
                        {item.name}
                        {item.quantity > 1 && ` × ${item.quantity}`}
                      </span>
                      <span className="receipt-item-price">
                        ₪{item.price.toFixed(2)}
                        {diff != null && (
                          <span className={`price-diff${diff > 0 ? ' up' : ' down'}`}>
                            {diff > 0 ? ' ↑' : ' ↓'} ₪{Math.abs(diff).toFixed(2)}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="receipt-total">
                {t('receipts:total', { amount: receiptTotal(receipt).toFixed(2) })}
              </div>
              {canEdit && (
                <button className="stock-icon-btn stock-delete-btn" onClick={() => handleDelete(receipt)}>
                  {t('receipts:deleteBtn')}
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <button
            className="fab-add-btn fab-secondary"
            onClick={handleUrlSubmit}
            disabled={scanning}
            aria-label={t('receipts:uploadFab.ariaFromUrl')}
          >
            🔗
          </button>
          <label className="fab-add-btn receipt-upload-btn" aria-label={t('receipts:uploadFab.ariaScan')}>
            {scanning ? (queue.length > 1 ? `${queueIndex + 1}/${queue.length}` : '…') : '+'}
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              disabled={scanning}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          </label>
        </>
      )}

      {scanning && queue.length > 1 && (
        <div className="toast">
          {t('receipts:queueProgress', { current: queueIndex + 1, total: queue.length })}
        </div>
      )}

      {scanError && !reviewData && <div className="toast">{scanError}</div>}

      {reviewData && (
        <ReceiptReviewModal
          data={reviewData}
          queueLabel={
            reviewData.queuePosition
              ? t('receipts:queueLabel', {
                  current: reviewData.queuePosition.index + 1,
                  total: reviewData.queuePosition.total
                })
              : null
          }
          onClose={handleCloseReview}
          onSave={handleSaveReceipt}
        />
      )}
    </div>
  )
}
