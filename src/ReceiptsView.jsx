import { useEffect, useState } from 'react'
import { deleteReceipt, onValue, receiptsRef, resizeImage, saveReceipt, scanReceipt } from './firebase.js'
import { formatDateTime } from './formatDateTime.js'
import ReceiptReviewModal from './ReceiptReviewModal.jsx'

const normalizeName = (name) => (name || '').trim().toLowerCase()

const receiptTotal = (receipt) =>
  receipt.total ?? (receipt.items || []).reduce((sum, item) => sum + item.price * (item.quantity || 1), 0)

export default function ReceiptsView({ canEdit, user }) {
  const [receipts, setReceipts] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [reviewData, setReviewData] = useState(null)

  useEffect(
    () =>
      onValue(receiptsRef, (snapshot) => {
        const data = snapshot.val() || {}
        const list = Object.entries(data).map(([key, entry]) => ({ key, ...entry }))
        list.sort((a, b) => (b.scanned_at || '').localeCompare(a.scanned_at || ''))
        setReceipts(list)
      }),
    []
  )

  const chronological = [...receipts].sort((a, b) => (a.scanned_at || '').localeCompare(b.scanned_at || ''))
  const priceHistory = {}
  chronological.forEach((receipt) => {
    ;(receipt.items || []).forEach((item) => {
      const key = normalizeName(item.name)
      if (!priceHistory[key]) priceHistory[key] = []
      priceHistory[key].push({ price: item.price, date: receipt.scanned_at })
    })
  })

  const priceDiffFor = (item, receiptDate) => {
    const history = priceHistory[normalizeName(item.name)] || []
    const before = history.filter((h) => (h.date || '') < (receiptDate || ''))
    if (before.length === 0) return null
    const delta = item.price - before[before.length - 1].price
    return Math.abs(delta) < 0.01 ? null : delta
  }

  const handleFileSelected = async (file) => {
    if (!file) return
    setScanning(true)
    setScanError(null)
    let resized
    try {
      resized = await resizeImage(file)
    } catch (err) {
      setScanError('קריאת התמונה נכשלה: ' + err.message)
      setScanning(false)
      return
    }
    try {
      const result = await scanReceipt(resized)
      if (result.error) {
        setScanError('לא הצלחנו לקרוא את הקבלה אוטומטית — אפשר להזין ידנית')
        setReviewData({ store_name: null, items: [], total: null, imageBlob: resized })
      } else {
        setReviewData({ store_name: result.store_name, items: result.items, total: result.total, imageBlob: resized })
      }
    } catch (err) {
      setScanError('סריקה נכשלה: ' + err.message + ' — אפשר להזין ידנית')
      setReviewData({ store_name: null, items: [], total: null, imageBlob: resized })
    } finally {
      setScanning(false)
    }
  }

  const handleSaveReceipt = async (data) => {
    await saveReceipt(data, reviewData.imageBlob, user)
    setReviewData(null)
    setScanError(null)
  }

  const handleDelete = (receipt) => {
    if (!window.confirm(`למחוק את הקבלה מ-${formatDateTime(receipt.scanned_at) || 'תאריך לא ידוע'}?`)) return
    deleteReceipt(receipt.key, receipt.image_url)
  }

  return (
    <div className="stock-view">
      {receipts.length === 0 ? (
        <div className="all-empty">אין עדיין קבלות סרוקות{canEdit ? ' 📸' : ''}</div>
      ) : (
        <div className="board-grid">
          {receipts.map((receipt) => (
            <section className="panel receipt-card" key={receipt.key}>
              <h2>
                <span className="dot" />
                {receipt.store_name || 'קבלה'}
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
              <div className="receipt-total">סה"כ: ₪{receiptTotal(receipt).toFixed(2)}</div>
              {canEdit && (
                <button className="stock-icon-btn stock-delete-btn" onClick={() => handleDelete(receipt)}>
                  🗑 מחיקה
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <label className="fab-add-btn receipt-upload-btn" aria-label="סריקת קבלה">
          {scanning ? '…' : '+'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={scanning}
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
        </label>
      )}

      {scanError && !reviewData && <div className="toast">{scanError}</div>}

      {reviewData && (
        <ReceiptReviewModal data={reviewData} onClose={() => setReviewData(null)} onSave={handleSaveReceipt} />
      )}
    </div>
  )
}
