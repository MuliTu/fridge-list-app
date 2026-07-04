import { useEffect, useState } from 'react'
import { ADMIN_EMAILS, addAdminEmail, adminsRef, onValue, removeAdminEmail } from './firebase.js'

export default function AdminsModal({ onClose }) {
  const [invitedEmails, setInvitedEmails] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => onValue(adminsRef, (snapshot) => setInvitedEmails(Object.values(snapshot.val() || {}))), [])

  const handleAdd = async () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError('כתובת אימייל לא תקינה')
      return
    }
    setError(null)
    try {
      await addAdminEmail(trimmed)
      setNewEmail('')
    } catch (err) {
      setError('הוספה נכשלה: ' + err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>שיתוף עריכה</h2>
        <p className="modal-note-readonly">
          כל מי שיתחבר עם אחת מהכתובות האלה (חשבון Google) יוכל לערוך את הרשימה, לא רק לצפות בה.
        </p>

        <div className="category-rows">
          {ADMIN_EMAILS.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <span className="admin-owner-tag">בעל/ת הבית</span>
            </div>
          ))}
          {invitedEmails.map((email) => (
            <div className="category-row" key={email}>
              <span className="admin-email">{email}</span>
              <button className="stock-icon-btn" onClick={() => removeAdminEmail(email)} aria-label="הסרת הרשאה">
                🗑
              </button>
            </div>
          ))}
        </div>

        <div className="category-row">
          <input
            className="modal-input"
            type="email"
            placeholder="כתובת Gmail להוספה"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button className="stock-icon-btn" onClick={handleAdd} aria-label="הוספת הרשאה">
            ➕
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn primary" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  )
}
