import { useState } from 'react'

export default function RestockPrompt({ item, onConfirm, onDismiss }) {
  const [amount, setAmount] = useState(1)

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>עדכון מלאי</h2>
        <p className="modal-note-readonly">
          סימנתם "{item.name}" כנקנה — להוסיף למלאי?
        </p>
        <label className="modal-input-label">
          כמות להוספה ({item.unit})
          <input
            className="modal-input"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onDismiss}>
            דילוג
          </button>
          <button className="modal-btn primary" onClick={() => onConfirm(Math.max(0, Number(amount) || 0))}>
            הוספה למלאי
          </button>
        </div>
      </div>
    </div>
  )
}
